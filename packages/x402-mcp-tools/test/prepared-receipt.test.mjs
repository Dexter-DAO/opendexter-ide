import assert from 'node:assert/strict';
import test from 'node:test';
import * as sdk from '@dexterai/x402/client';
import { x402Fetch, buildPurchaseOptions, sellerAcceptSha256 } from '../dist/index.js';

const url = 'https://merchant.example/prepared';
const accept = {
  scheme: 'exact', network: 'eip155:8453', amount: '10000',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x1111111111111111111111111111111111111111',
  maxTimeoutSeconds: 60, extra: { decimals: 6 },
};

async function purchase(t, receipt, status = 200, body = '{"answer":42}', offer = accept) {
  let signatures = 0;
  let dispatched = 0;
  const completions = [];
  const spending = [];
  const signer = {
    address: '0x2222222222222222222222222222222222222222',
    async signTypedData() { signatures++; return `0x${'11'.repeat(65)}`; },
  };
  const wallet = {
    getInfo: () => ({}),
    getAvailableUsdc: async () => 10,
    getAllBalances: async () => ({ totalUsdc: 10, chains: {} }),
    getPaymentSigners: () => ({ evmPrivateKey: 'offline-signer-test-seam' }),
    getEvmSigner: () => signer,
    getSolanaSigner: () => null,
  };
  const prepared = buildPurchaseOptions({
    checkResult: {
      requiresPayment: true, x402Version: 2, resolvedUrl: url,
      paymentOptions: [{ ...offer, amountAtomic: offer.amount, rawAcceptSha256: sellerAcceptSha256(offer) }],
    },
    url, method: 'GET', payload: null, surface: 'local', idFactory: () => 'receipt-compat-attempt',
  }).find(option => option.mode === 'direct_exact').preparedPurchase;
  const fetch = async (input, init) => {
    const target = typeof input === 'string' ? input : input.url;
    assert.equal(target, url, 'prepared request must stay on the selected merchant');
    if (new Headers(init?.headers).has('PAYMENT-SIGNATURE')) {
      dispatched++;
      const headers = { 'content-type': 'application/json' };
      if (receipt !== null) headers['PAYMENT-RESPONSE'] = typeof receipt === 'string'
        ? receipt : Buffer.from(JSON.stringify(receipt)).toString('base64');
      return new Response(body, { status, headers });
    }
    const required = { x402Version: 2, resource: { url }, accepts: [offer] };
    return new Response(JSON.stringify(required), { status: 402, headers: {
      'content-type': 'application/json', 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(required)).toString('base64'),
    } });
  };
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const target = typeof input === 'string' ? input : input.url;
    if (target === url) return fetch(input, init);
    // EVM balance reads only. The actual adapter builds against an unfunded fake signer.
    const request = JSON.parse(init.body);
    assert.equal(request.method, 'eth_call');
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: `0x${'0'.repeat(58)}0f4240` }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  let prior;
  const runtime = {
    maxAmountUsdc: 5, maxAmountAtomic: '10000', explicitExternalFetch: fetch,
    x402Client: { ...sdk, createEvmKeypairWallet: async () => signer },
    recordSpend: (amount, target) => spending.push({ amount, target }),
    purchaseAttempts: {
      begin: () => prior ? { acquired: false, ...prior } : { acquired: true },
      markDispatching: () => {},
      complete: (...args) => { completions.push(args); prior = { state: args[1], receipt: args[2] }; },
    },
  };
  const result = await x402Fetch({ url, method: 'GET', purchase: prepared }, wallet, runtime);
  const replay = await x402Fetch({ url, method: 'GET', purchase: prepared }, wallet, runtime);
  return { result, replay, signatures, dispatched, completions, spending };
}

test('actual SDK prepared purchase accepts matching settlement and preserves one saved receipt', async t => {
  const f = await purchase(t, { success: true, network: accept.network, transaction: 'settled-tx' });
  assert.equal(f.result.payment.settled, true);
  assert.equal(f.result.purchaseReceipt.sellerSettlement.transaction, 'settled-tx');
  assert.equal(f.result.purchaseReceipt.retry, 'none');
  assert.equal(f.signatures, 1);
  assert.equal(f.dispatched, 1);
  assert.deepEqual(f.spending, [{ amount: 0.01, target: url }]);
  assert.deepEqual(f.replay.purchaseReceipt, f.result.purchaseReceipt);
});

test('settled payment with HTTP500 retains the receipt and reports delivery failure', async t => {
  const f = await purchase(t, { success: true, network: accept.network, transaction: 'settled-no-delivery' }, 500);
  assert.equal(f.result.status, 500);
  assert.match(f.result.error, /seller did not deliver/);
  assert.equal(f.result.payment.settled, true);
  assert.equal(f.result.payment.details.transaction, 'settled-no-delivery');
  assert.equal(f.result.purchaseReceipt.retry, 'none');
  assert.equal(f.signatures, 1);
  assert.equal(f.dispatched, 1);
  assert.deepEqual(f.spending, [{ amount: 0.01, target: url }]);
  assert.deepEqual(f.replay.purchaseReceipt, f.result.purchaseReceipt);
});

test('merchant decimals cannot reduce the USDC spending recorded after settlement', async t => {
  const offer = { ...accept, extra: { ...accept.extra, decimals: 18 } };
  const f = await purchase(t, { success: true, network: accept.network, transaction: 'settled-decimal-conflict' }, 500, '{}', offer);
  assert.equal(f.result.payment.settled, true);
  assert.deepEqual(f.spending, [{ amount: 0.01, target: url }]);
  assert.equal(f.dispatched, 1);
});

for (const status of [200, 500]) {
  test(`malformed JSON on HTTP${status} retains the known settlement and raw body`, async t => {
    const f = await purchase(t, { success: true, network: accept.network, transaction: 'settled-malformed' }, status, '{broken');
    assert.equal(f.result.payment.settled, true);
    assert.equal(f.result.payment.details.transaction, 'settled-malformed');
    assert.equal(f.result.data, '{broken');
    assert.equal(f.dispatched, 1);
    assert.deepEqual(f.spending, [{ amount: 0.01, target: url }]);
    assert.deepEqual(f.replay.purchaseReceipt, f.result.purchaseReceipt);
  });
  test(`unreadable body on HTTP${status} retains the known settlement and blocks another charge`, async t => {
    const body = new ReadableStream({ start(controller) { controller.error(new Error('test stream failure')); } });
    const f = await purchase(t, { success: true, network: accept.network, transaction: 'settled-unreadable' }, status, body);
    assert.equal(f.result.payment.settled, true);
    assert.equal(f.result.payment.details.transaction, 'settled-unreadable');
    assert.equal(f.result.deliveryError, 'seller_response_body_unavailable');
    assert.equal(f.result.purchaseReceipt.retry, 'none');
    assert.equal(f.dispatched, 1);
    assert.deepEqual(f.spending, [{ amount: 0.01, target: url }]);
    assert.deepEqual(f.replay.purchaseReceipt, f.result.purchaseReceipt);
  });
}

for (const [name, receipt, status = 200] of [
  ['pending on HTTP200', { success: false, network: accept.network, transaction: 'pending-tx', errorReason: 'settlement_pending' }],
  ['pending on HTTP402', { success: false, network: accept.network, transaction: 'pending-tx', errorCode: 'settlement_pending' }, 402],
  ['conflicting success', { success: true, network: accept.network, transaction: 'pending-tx', errorReason: 'settlement_pending' }],
  ['malformed error code', { success: true, network: accept.network, transaction: 'malformed-error-tx', errorCode: {} }],
  ['malformed error reason', { success: true, network: accept.network, transaction: 'malformed-error-tx', errorReason: [] }],
  ['negative receipt', { success: false, network: accept.network, transaction: 'failed-tx', errorReason: 'settlement_rejected' }],
  ['wrong network', { success: true, network: 'eip155:1', transaction: 'other-network-tx' }],
  ['missing receipt', null],
  ['malformed receipt', 'not-json'],
]) {
  test(`prepared purchase retains ${name} as unresolved and does not pay again`, async t => {
    const f = await purchase(t, receipt, status);
    assert.equal(f.result.payment.settled, 'unconfirmed');
    assert.equal(f.result.payment.retrySafe, false);
    assert.equal(f.result.purchaseReceipt.retry, 'reconcile_only');
    if (receipt && typeof receipt === 'object') {
      assert.equal(f.result.payment.details.transaction, receipt.transaction);
      assert.equal(f.result.payment.details.attemptedAmountAtomic, accept.amount);
      assert.equal(f.result.payment.details.amountAtomic, undefined);
      assert.equal(f.result.purchaseReceipt.sellerSettlement.transaction, receipt.transaction);
    }
    assert.equal(f.signatures, 1);
    assert.equal(f.dispatched, 1);
    assert.deepEqual(f.spending, []);
    assert.deepEqual(f.replay.purchaseReceipt, f.result.purchaseReceipt);
  });
}
