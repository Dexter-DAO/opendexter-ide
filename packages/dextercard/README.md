# @dexterai/dextercard

Dextercard SDK — issue and manage virtual cards for AI agents.

A clean TypeScript surface over a regulated card-issuance carrier:
account auth (OTP + hCaptcha), self-managed sessions with auto-refresh,
encrypted credential storage, and typed methods for every step of the
card lifecycle (KYC onboarding, issue, reveal, link wallet, freeze,
transactions).

## Install

```bash
npm install @dexterai/dextercard
```

## Quickstart

```ts
import {
  Dextercard,
  LoginFlow,
  EncryptedFileSessionStore,
  DextercardNoAccountError,
} from "@dexterai/dextercard";

const store = new EncryptedFileSessionStore(
  `${process.env.HOME}/.config/dexter/dextercard.enc`,
  process.env.DEXTERCARD_KEY!,
);

// First run: trigger OTP, exchange code, persist session.
const flow = new LoginFlow();
await flow.requestCode({ email, captchaToken });   // user solved hCaptcha
const { session } = await flow.completeWithCode({ email, code, store });

// Every subsequent run: resume.
// const session = await new LoginFlow().resume(store);

const card = new Dextercard({ session });
const user = await card.userRetrieve();           // { id, email }

try {
  const status = await card.cardRetrieve();
} catch (err) {
  if (err instanceof DextercardNoAccountError) {
    // user hasn't completed onboarding yet — kick them through KYC
  } else throw err;
}
```

## Auth model

Three building blocks:

### `LoginFlow`

High-level orchestration. Send the OTP, exchange the code for a session,
optionally persist into a `SessionStore`, and resume across processes.

### `DextercardSession`

Long-lived session manager. Reads from a `SessionStore`, proactively
refreshes JWTs before expiry, persists rotated refresh tokens.
Concurrent calls coalesce into a single refresh. The `Dextercard`
401-retry path uses this to recover transparently when a JWT has been
rejected mid-flight.

### `EncryptedFileSessionStore`

AES-256-GCM + scrypt encrypted file store. Pass any caller-controlled
key material (passphrase, machine-bound random, KMS-fetched secret).
Wrong key returns null instead of corrupting state. For environments
where you've already protected the storage path with filesystem
permissions, the simpler `JsonFileSessionStore` writes a plaintext
0600-mode file.

### hCaptcha

The carrier protects the OTP-trigger endpoint with hCaptcha (sitekey
exported as `DEXTERCARD_HCAPTCHA_SITEKEY`). For browser callers, use
`renderDextercardHCaptcha`:

```ts
import { renderDextercardHCaptcha, LoginFlow } from "@dexterai/dextercard";

const widget = await renderDextercardHCaptcha({ container: divEl });
const captchaToken = await widget.token;
widget.destroy();

await new LoginFlow().requestCode({ email, captchaToken });
```

Server-side / automation: use a captcha-solving service that returns a
real hCaptcha response token, OR open a partnership with the carrier
to request a captcha bypass for service-account flows.

## Methods

Every method maps 1:1 to a carrier tool (`POST /api/tools/<tool_name>`).

### Account
- `userRetrieve()` → `{ id, email }`

### Card lifecycle
- `cardOnboardingStart(input)` — registers with the regulated card
  issuer; returns the KYC URL
- `cardOnboardingCheck()` — polls KYC status; surfaces terms URLs once
  verified
- `cardOnboardingFinish(input)` — finalizes registration with address +
  accepted terms
- `cardCreate()` — issues the virtual Mastercard
- `cardRetrieve()` — current card metadata
- `cardFreeze()` / `cardUnfreeze()`
- `cardReveal()` — single-use PCI-safe URL for PAN/CVV/expiry

### Wallet linking
- `cardWalletLink({ wallet, currency, amount })` — delegate spend
  authority from a wallet to the card
- `cardWalletUnlink({ wallet, currency })`
- `cardWalletCheck({ wallet, chain, currency })`
- `cardWalletList()`

### Transactions
- `cardTransactionList({ dateFrom?, dateTo?, page? })`

### Escape hatch

For any tool not yet typed by the client:

```ts
const data = await card.call<MyResponse>("some_new_tool", { foo: 1 });
```

## Errors

All non-2xx responses throw `DextercardApiError`. Two cases are
pre-classified:

- `DextercardNoAccountError` — user hasn't completed onboarding yet
- `DextercardApiError` — everything else

Both expose `tool`, `status`, and the raw `payload`.

## Status

`0.3.x` — request shapes are pinned to the carrier's documented input
surface. Response shapes are typed loosely for endpoints that require a
provisioned card; they will tighten as additional captures land.

## License

MIT
