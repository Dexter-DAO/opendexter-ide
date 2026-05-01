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

The client expects a Supabase JWT in the same format MoonPay's CLI uses.
Today, the canonical way to obtain one is `mp login` (which persists an
encrypted credential under `~/.config/moonpay/`). Future MoonPay-hosted
OAuth or SSO flows can drop in via the `jwt` option.

The client never decrypts the CLI's local credential store. Callers are
responsible for sourcing the JWT and refreshing it.

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
