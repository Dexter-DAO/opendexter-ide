# @dexterai/cards-core

TypeScript HTTP client for the MoonPay MoonAgents Card API
(`agents.moonpay.com`). Mirrors the public `@moonpay/cli` wire format so
servers and agents can issue, manage, and observe MoonAgents Cards
without shelling out to a CLI.

## Install

```bash
npm install @dexterai/cards-core
```

## Usage

```ts
import { MoonPayClient, MoonPayNoAccountError } from "@dexterai/cards-core";

const client = new MoonPayClient({
  jwt: process.env.MOONPAY_JWT!,
  agent: "my-service", // sent as X-Agent header
});

const user = await client.userRetrieve();
// { id: "…", email: "…" }

try {
  const card = await client.cardRetrieve();
} catch (err) {
  if (err instanceof MoonPayNoAccountError) {
    // user hasn't completed onboarding yet — kick them through KYC
  } else {
    throw err;
  }
}
```

## Auth

`@dexterai/cards-core` includes a complete auth stack so callers don't
need to depend on MoonPay's CLI. Three building blocks:

### `LoginFlow`

High-level orchestration. Send the OTP, exchange the code for a session,
optionally persist into a {@link SessionStore}, and resume across
processes.

```ts
import { LoginFlow, EncryptedFileSessionStore, MoonPayClient } from "@dexterai/cards-core";

// Browser flow: render hCaptcha, capture the token from the user, then:
const flow = new LoginFlow();
await flow.requestCode({ email: "user@example.com", captchaToken });

// User receives an OTP email. Submit the code:
const store = new EncryptedFileSessionStore("/path/to/session.enc", machineKey);
const { session } = await flow.completeWithCode({
  email: "user@example.com",
  code: "123456",
  store,
});

// On subsequent runs, resume:
const session = await new LoginFlow().resume(store);
const client = new MoonPayClient({ session });
```

### `MoonPaySession`

Long-lived session manager. Reads from a {@link SessionStore},
proactively refreshes JWTs before expiry, persists rotated refresh
tokens. Concurrent calls coalesce into a single refresh. The
`MoonPayClient` 401-retry path uses this to recover transparently
when a JWT has been rejected mid-flight.

### `EncryptedFileSessionStore`

AES-256-GCM + scrypt encrypted file store. Pass any caller-controlled
key material (passphrase, machine-bound random, KMS-fetched secret).
Wrong key returns null instead of corrupting state.

```ts
const store = new EncryptedFileSessionStore(
  `${process.env.HOME}/.config/dexter/cards-session.enc`,
  process.env.DEXTER_SESSION_KEY!,
);
```

For environments where you've already protected the storage path with
filesystem permissions, the simpler `JsonFileSessionStore` writes a
plaintext 0600-mode file.

### hCaptcha

MoonPay protects the OTP-trigger endpoint with hCaptcha (sitekey
exported as `MOONPAY_HCAPTCHA_SITEKEY`). For browser callers, use
`renderMoonPayHCaptcha`:

```ts
import { renderMoonPayHCaptcha, LoginFlow } from "@dexterai/cards-core";

const widget = await renderMoonPayHCaptcha({ container: divEl });
const captchaToken = await widget.token;
widget.destroy();

await new LoginFlow().requestCode({ email, captchaToken });
```

Server-side / automation: use a captcha-solving service that returns a
real hCaptcha response token, OR open a partnership with MoonPay to
request a captcha bypass for service-account flows.

## Methods

Every method maps 1:1 to a MoonPay tool (`POST /api/tools/<tool_name>`).

### Account
- `userRetrieve()` → `{ id, email }`

### Card lifecycle
- `cardOnboardingStart(input)` — registers with the regulated card issuer; returns the Veriff KYC URL
- `cardOnboardingCheck()` — polls KYC status; surfaces terms URLs once verified
- `cardOnboardingFinish(input)` — finalizes registration with address + accepted terms
- `cardCreate()` — issues the virtual Mastercard
- `cardRetrieve()` — current card metadata
- `cardFreeze()` / `cardUnfreeze()`
- `cardReveal()` — single-use PCI-safe URL for PAN/CVV/expiry

### Wallet linking
- `cardWalletLink({ wallet, currency, amount })` — delegate spend authority from a wallet to the card
- `cardWalletUnlink({ wallet, currency })`
- `cardWalletCheck({ wallet, chain, currency })`
- `cardWalletList()`

### Transactions
- `cardTransactionList({ dateFrom?, dateTo?, page? })`

### Escape hatch

For any MoonPay tool not yet typed by the client:

```ts
const data = await client.call<MyResponse>("some_new_tool", { foo: 1 });
```

## Errors

All non-2xx responses throw `MoonPayApiError`. Two cases are pre-classified:

- `MoonPayNoAccountError` — user hasn't completed onboarding yet
- `MoonPayApiError` — everything else

Both expose `tool`, `status`, and the raw `payload`.

## Wire format

Every endpoint is `POST https://agents.moonpay.com/api/tools/<tool_name>`
with a JSON body and a `Bearer <jwt>` Authorization header. Tool names
are the snake_case form of the CLI subcommand
(`mp card onboarding check` ↔ `card_onboarding_check`). This shape was
derived from a TLS-intercept of the official CLI; see
`dexter-fe/research/moonpay-wire/` for the captures.

## Status

`0.1.x` — request shapes are pinned to the input flags exposed by
`mp <cmd> --help`. Response shapes are typed loosely for endpoints that
require a provisioned card; they will tighten as real captures land.

## License

MIT
