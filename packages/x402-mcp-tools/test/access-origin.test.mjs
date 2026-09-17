import assert from 'node:assert/strict';
import test from 'node:test';
import { accessWithWalletProof } from '../dist/index.js';

const merchantUrl = 'https://merchant.example/protected';
function challenge({ domain = 'merchant.example', uri = merchantUrl, responseUrl = merchantUrl, chainId = 'eip155:8453', type = 'eip191' } = {}) {
  const required = {
    x402Version: 2,
    resource: { url: responseUrl },
    accepts: [],
    extensions: {
      'sign-in-with-x': {
        info: { domain, uri, version: '1', nonce: 'testnonce123456', issuedAt: new Date().toISOString() },
        supportedChains: [{ chainId, type }],
      },
    },
  };
  const response = new Response('{}', { status: 402, headers: {
    'content-type': 'application/json',
    'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(required)).toString('base64'),
  } });
  Object.defineProperty(response, 'url', { value: responseUrl });
  return response;
}
function fixture(t, options) {
  const calls = [];
  const messages = [];
  const signer = {
    address: '0x1111111111111111111111111111111111111111',
    async signMessage({ message }) { messages.push(message); return `0x${'11'.repeat(65)}`; },
  };
  const wallet = { getEvmSigner: () => signer, getSolanaSigner: () => null };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return challenge(options);
    return new Response('{"available":true}', { headers: { 'content-type': 'application/json' } });
  });
  return { calls, messages, wallet };
}

test('signs a matching challenge through the actual 2.26 SIWX builder', async t => {
  const f = fixture(t);
  const result = await accessWithWalletProof({ url: merchantUrl, method: 'GET' }, f.wallet);
  assert.equal(result.status, 200);
  assert.equal(f.messages.length, 1);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].url, merchantUrl);
  assert.equal(f.calls[1].init.redirect, 'error');
  assert.ok(new Headers(f.calls[1].init.headers).get('SIGN-IN-WITH-X'));
});

for (const [name, options] of [
  ['domain', { domain: 'other.example' }],
  ['URI origin', { uri: 'https://other.example/protected' }],
]) {
  test(`refuses a mismatched ${name} before signing or authenticated dispatch`, async t => {
    const f = fixture(t, options);
    await assert.rejects(accessWithWalletProof({ url: merchantUrl, method: 'GET' }, f.wallet), /does not match/);
    assert.equal(f.messages.length, 0);
    assert.equal(f.calls.length, 1);
  });
}

test('binds to the final response URL and sends the proof there without another redirect', async t => {
  const finalUrl = 'https://merchant.example/actual';
  const f = fixture(t, { uri: finalUrl, responseUrl: finalUrl });
  await accessWithWalletProof({ url: 'https://directory.example/link', method: 'GET' }, f.wallet);
  assert.equal(f.messages.length, 1);
  assert.equal(f.calls[1].url, finalUrl);
  assert.equal(f.calls[1].init.redirect, 'error');
});


test('keeps the supported Solana wallet signer contract with SIWX 2.26', async t => {
  const f = fixture(t, { chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', type: 'ed25519' });
  const signed = [];
  const wallet = { getEvmSigner: () => null, getSolanaSigner: () => ({
    publicKey: '11111111111111111111111111111111',
    async signMessage(message) { signed.push(message); return new Uint8Array(64).fill(1); },
  }) };
  const result = await accessWithWalletProof({ url: merchantUrl, method: 'GET' }, wallet);
  assert.equal(result.status, 200);
  assert.equal(signed.length, 1);
  assert.ok(signed[0] instanceof Uint8Array);
  assert.equal(f.calls.length, 2);
});
