<p align="center">
  <img src="https://raw.githubusercontent.com/Dexter-DAO/dexter-x402-sdk/main/assets/dexter-wordmark.svg" alt="Dexter" width="360">
</p>

<h1 align="center">@dexterai/dextercard</h1>

<p align="center">
  <strong>Issue and manage virtual cards for AI agents.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dexterai/dextercard"><img src="https://img.shields.io/npm/v/@dexterai/dextercard.svg" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E=18-brightgreen.svg" alt="Node"></a>
  <a href="https://dexter.cash"><img src="https://img.shields.io/badge/Marketplace-dexter.cash-blueviolet" alt="Marketplace"></a>
</p>

<p align="center">
  <a href="https://dexter.cash"><strong>Browse Dexter →</strong></a>
</p>

---

## What is Dextercard?

Dextercard is the card-issuance layer for the Dexter ecosystem. It turns an authenticated user's stablecoin treasury into a real virtual Mastercard that spends anywhere Mastercard is accepted, with a per-wallet spend cap that you control. The SDK wraps the underlying regulated card carrier with a clean TypeScript surface — auth (OTP + hCaptcha), self-managed sessions with auto-refresh, encrypted credential storage, and typed methods for every step of the card lifecycle (KYC onboarding, issue, reveal, link wallet, freeze, transactions).

This package is consumed by [`@dexterai/x402-mcp-tools`](https://www.npmjs.com/package/@dexterai/x402-mcp-tools) (which exposes the four `card_*` MCP tools used by the [Dexter MCP server](https://www.npmjs.com/package/@dexterai/opendexter)) and by the Dexter web app's card-issuance pages.

---

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

---

## Auth Model

### `LoginFlow`

High-level orchestration. Send the OTP, exchange the code for a session, optionally persist into a `SessionStore`, and resume across processes.

### `DextercardSession`

Long-lived session manager. Reads from a `SessionStore`, proactively refreshes JWTs before expiry, persists rotated refresh tokens. Concurrent calls coalesce into a single refresh. The `Dextercard` 401-retry path uses this to recover transparently when a JWT has been rejected mid-flight.

### `EncryptedFileSessionStore`

AES-256-GCM + scrypt encrypted file store. Pass any caller-controlled key material (passphrase, machine-bound random, KMS-fetched secret). Wrong key returns null instead of corrupting state. For environments where you've already protected the storage path with filesystem permissions, the simpler `JsonFileSessionStore` writes a plaintext 0600-mode file.

### hCaptcha

The carrier protects the OTP-trigger endpoint with hCaptcha (sitekey exported as `DEXTERCARD_HCAPTCHA_SITEKEY`). For browser callers, use `renderDextercardHCaptcha`:

```ts
import { renderDextercardHCaptcha, LoginFlow } from "@dexterai/dextercard";

const widget = await renderDextercardHCaptcha({ container: divEl });
const captchaToken = await widget.token;
widget.destroy();

await new LoginFlow().requestCode({ email, captchaToken });
```

Server-side / automation: use a captcha-solving service that returns a real hCaptcha response token, OR open a partnership with the carrier to request a captcha bypass for service-account flows.

---

## Methods

Every method on `Dextercard` maps 1:1 to a carrier tool (`POST /api/tools/<tool_name>`).

### Account

| Method | Returns |
|--------|---------|
| `userRetrieve()` | `{ id, email }` |

### Card Lifecycle

| Method | Description |
|--------|-------------|
| `cardOnboardingStart(input)` | Registers with the regulated card issuer; returns the KYC URL the user must complete in a browser. |
| `cardOnboardingCheck()` | Polls KYC status; surfaces terms URLs once verified. |
| `cardOnboardingFinish(input)` | Finalizes registration with residential address + accepted terms. |
| `cardCreate()` | Issues the virtual Mastercard. |
| `cardRetrieve()` | Current card metadata (status, last4, expiry). |
| `cardFreeze()` / `cardUnfreeze()` | Pause and resume transactions. |
| `cardReveal()` | Single-use PCI-safe URL with PAN, CVV, and expiry. |

### Wallet Linking

| Method | Description |
|--------|-------------|
| `cardWalletLink({ wallet, currency, amount })` | Delegate spend authority from a wallet to the card with a hard cap. |
| `cardWalletUnlink({ wallet, currency })` | Revoke spend authority. |
| `cardWalletCheck({ wallet, chain, currency })` | Inspect a wallet's link status. |
| `cardWalletList()` | List all wallets currently linked to the card. |

### Transactions

| Method | Description |
|--------|-------------|
| `cardTransactionList({ dateFrom?, dateTo?, page? })` | Paginated transaction history with optional date window. |

### Escape Hatch

For any tool not yet typed by the client:

```ts
const data = await card.call<MyResponse>("some_new_tool", { foo: 1 });
```

---

## Errors

All non-2xx responses throw `DextercardApiError`. Two cases are pre-classified:

| Class | When |
|-------|------|
| `DextercardNoAccountError` | User hasn't completed onboarding yet. The agent should suggest the issuance flow. |
| `DextercardApiError` | Everything else (region restrictions, KYC failures, carrier errors, etc.). |

Both classes expose `tool`, `status`, and the raw `payload`.

---

## Region Availability

Card issuance is gated by the underlying carrier and the regulated card issuer. As of `0.3.x`, the live regions are the **United Kingdom** and **LATAM**, with the **United States** and **EU** on the carrier's roadmap. US residents calling `cardOnboardingStart()` receive a `DextercardApiError` with a region-specific message:

> MoonCard is not yet available for US residents. Check back soon — US support is on the roadmap.

The SDK does not gate region client-side — every request reaches the carrier and the carrier decides. This means region availability tracks reality without an SDK release.

---

## Status

`0.3.x` — request shapes are pinned to the carrier's documented input surface. Response shapes are typed loosely for endpoints that require a provisioned card; they will tighten as additional captures land.

---

## Links

- [Dexter Marketplace](https://dexter.cash)
- [@dexterai/opendexter](https://www.npmjs.com/package/@dexterai/opendexter) — the npm CLI that consumes this SDK
- [@dexterai/x402-mcp-tools](https://www.npmjs.com/package/@dexterai/x402-mcp-tools) — the MCP tool layer
- [Twitter](https://twitter.com/dexteraisol)
- [Telegram](https://t.me/dexterdao)

## License

MIT
