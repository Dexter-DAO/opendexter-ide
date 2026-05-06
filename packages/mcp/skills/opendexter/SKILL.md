---
name: opendexter
description: "Use OpenDexter to find and pay for x402 APIs from any AI agent. Trigger this skill whenever the user asks to find, price-check, or call a paid API; pay in USDC; check or fund a wallet; settle on Solana, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, or SKALE; or work with a Dextercard. Trigger on mentions of x402, OpenDexter, paid APIs, agent payments, or `npx @dexterai/opendexter`."
---

# OpenDexter

OpenDexter is the public x402 gateway for AI agents. One MCP server, one wallet, eight chains. Search thousands of paid APIs, see the price before paying, call any of them with automatic USDC settlement, and (optionally) drive a real Dextercard from the same surface.

## When to use this skill

Anytime the user wants to:

- **Find a paid API** (e.g. "is there an API for X?", "find me a price feed for ETH", "anything that generates an image?")
- **Call an x402 endpoint** (paste a URL, run a request that hits a 402)
- **Check or fund a wallet** for x402 payments
- **Manage a Dextercard** (issue a card, link a funding wallet, freeze, check status)

If the user mentions `x402`, `OpenDexter`, `dexter.cash`, `open.dexter.cash/mcp`, paid APIs, USDC payments for APIs, or pasting a URL that returns 402 — this skill applies.

## Tools, in the order they should be used

### 1. `x402_search` — Find APIs

**Always start here for discovery.** Semantic capability search across the marketplace. Returns two tiers — `strongResults` (high-confidence capability matches) and `relatedResults` (adjacent services worth knowing about). Each result includes name, URL, price, network, qualityScore (0–100), verified status, host, tier, similarity, a short `why` ranking explanation, and a `chains[]` array with every payment option.

| Param | Type | Description |
|---|---|---|
| `query` | string | Natural-language query. e.g. `"check wallet balance on Base"`, `"generate an image"`, `"ETH price feed"` |
| `limit` | number | Max results across both tiers (1–50, default 20) |
| `unverified` | boolean | Include unverified resources (default false) |
| `testnets` | boolean | Include testnet-only resources (default false) |
| `rerank` | boolean | LLM cross-encoder rerank of top results (default true). Set `false` for deterministic order. |

Do not pre-filter by chain or category — the ranker handles synonyms and expansion internally.

### 2. `x402_check` — Preview pricing

Probes an endpoint and returns its 402 payment requirements (price per chain, accepted assets, schema hints) **without paying**. Use this before the first paid call.

| Param | Type | Description |
|---|---|---|
| `url` | string | The URL to check |
| `method` | string | GET / POST / PUT / DELETE (default GET) |

If the endpoint returns 200 with no 402, tell the user it's free. If it returns 401/403, the provider requires its own auth before x402 settlement is offered.

### 3. `x402_fetch` — Call and pay

Calls the endpoint and pays automatically from the local wallet. Returns the API response **plus** a settlement receipt (transaction hash, amount, chain). On success, link the hash to the right explorer:

| Chain | Explorer |
|---|---|
| Solana | `solscan.io/tx/<sig>` |
| Base | `basescan.org/tx/<hash>` |
| Polygon | `polygonscan.com/tx/<hash>` |
| Arbitrum | `arbiscan.io/tx/<hash>` |
| Optimism | `optimistic.etherscan.io/tx/<hash>` |
| Avalanche | `snowtrace.io/tx/<hash>` |
| BSC | `bscscan.com/tx/<hash>` |
| SKALE | `<chain>.explorer.mainnet.skalenodes.com/tx/<hash>` |

| Param | Type | Description |
|---|---|---|
| `url` | string | The x402 resource URL |
| `method` | string | HTTP method (default GET) |
| `body` | any | Request body for POST/PUT (object or string) |
| `headers` | object | Optional custom headers |

If the wallet has no USDC, the call fails. Run `x402_wallet` first, surface the deposit address for the right chain, and tell the user to fund. Then retry.

### 4. `x402_pay` — Alias of `x402_fetch`

Use whichever name reads more naturally. Same parameters, same behavior.

### 5. `x402_access` — Identity-gated endpoints

Some endpoints require a wallet signature (Sign-In-With-X) instead of a per-call payment. Use this tool for those — it presents the wallet proof and returns the response.

| Param | Type | Description |
|---|---|---|
| `url` | string | The identity-gated endpoint URL |
| `method` | string | HTTP method (default GET) |

### 6. `x402_wallet` — Multi-chain wallet

Creates or resumes the local session, then returns deposit addresses and USDC balances across **Solana, Base, Polygon, Arbitrum, Optimism, Avalanche**. (The facilitator additionally settles on **BSC** and **SKALE** when the endpoint requires those chains.)

Use it:

- Before a fetch, to confirm sufficient funds
- When the user asks "how much do I have?" or "where do I send USDC?"
- After a fetch fails on insufficient funds

If a balance is zero, proactively show the deposit address and tell the user to fund before attempting the call.

### 7. `x402_settings` *(local npm install only)*

Read or update the per-call USDC cap that gates automatic payments. Hosted at `~/.dexterai-mcp/settings.json`. Hot-reloaded — no restart needed after a change.

## Dextercard tools

Dextercard is the optional payment-card surface — issue a real card backed by your funded wallet, then spend at any merchant. Cards are created via Crossmint and provisioned through the same MCP session.

### `card_status` — Always run this first

Returns the current account stage so the agent knows which next step to suggest. Possible stages:

| Stage | Meaning | Next step |
|---|---|---|
| `no_session` | No Dextercard session paired | Direct user to `card_login_request_otp` (npm) or to the pairing URL surfaced by the tool |
| `onboarding_required` | Session exists, account not started | Call `card_issue` with `step: "auto"` |
| `pending_kyc` | KYC submitted, awaiting verification | Wait, then re-check |
| `pending_finalize` | KYC passed, address/terms not submitted | Call `card_issue` with `step: "auto"` |
| `not_issued` | Eligible but no card yet | Call `card_issue` with `step: "auto"` |
| `active` | Card live and unfrozen | Use `card_link_wallet` / `card_freeze` |
| `frozen` | Card paused | Call `card_freeze` with `frozen: false` to resume |

Always call `card_status` before `card_issue` or `card_link_wallet`. Do not assume state.

### `card_issue` — Drive issuance

Walks the user through KYC and provisioning one step at a time. Use `step: "auto"` and let the tool decide the right action; only override with explicit step names if the user wants manual control.

### `card_link_wallet` — Authorize a wallet to fund the card

| Param | Type | Description |
|---|---|---|
| `currency` | string | Native asset of the wallet (usually `"usdc"`) |
| `amount` | number | Spend cap in human-readable units (e.g. `5000` = 5,000 USDC) |

Pre-condition: card must be `active`. Post-condition: linked wallets show up in `card_status.wallets`.

### `card_freeze` — Pause or resume the card

Pass `frozen: true` to freeze, `frozen: false` to resume. Returns updated metadata.

### `card_login_request_otp` / `card_login_complete` *(local npm install only)*

Bootstrap a Dextercard session from inside the agent. `card_login_request_otp` returns a MoonPay URL the user opens in a browser to solve a captcha. `card_login_complete` exchanges the resulting OTP for a persisted session. After this completes, all `card_*` tools work as if the user had paired through dexter.cash.

## Workflow patterns

### "Find me an API for X"

1. `x402_search` with the user's query
2. Present the top 2–4 results with name, price, quality score, chain
3. Either suggest the top match or ask the user to pick
4. `x402_check` to confirm the price (and pick the cheapest chain if there are multiple)
5. `x402_fetch` to call

### "Call this URL"

1. `x402_check` first to surface the price
2. `x402_fetch` to settle and call

### "How much USDC do I have?" / "Where do I send funds?"

1. `x402_wallet`
2. Surface deposit addresses per chain
3. If a balance is zero, suggest funding via the chain with cheapest gas (Base or Solana for most users)

### "I want a Dextercard"

1. `card_status` — find the current stage
2. From the stage, route to the right next step (see table above)
3. Use `card_issue { step: "auto" }` to advance, repeat until `active`
4. `card_link_wallet` to authorize a funding wallet

### "Pay this and freeze my card after"

1. `card_status` to confirm `active`
2. `x402_fetch` for the actual payment
3. `card_freeze { frozen: true }` to pause

## Quality scores

| Range | Meaning |
|---|---|
| 90–100 | Excellent. Verified, returns correct data. |
| 75–89 | Good. Passed verification, reliable. |
| 50–74 | Mediocre. Works but has issues. |
| Below 50 | Poor or untested. Use with caution. |

A `verified: true` flag means the resource has passed Dexter's automated quality bot. Most production endpoints sit in the 75+ band.

## Supported chains

Wallet funding (any of these accepts USDC and is shown by `x402_wallet`):

- **Solana** (preferred — fastest finality, lowest fees for most users)
- **Base**
- **Polygon**
- **Arbitrum**
- **Optimism**
- **Avalanche**

The facilitator additionally settles paid calls on:

- **BSC** (Binance Smart Chain)
- **SKALE** (Base chain)

Endpoints declare which chains they accept; `x402_check` shows you the full per-chain price so you can pick the cheapest one.

## Pricing

- Most endpoints cost **$0.01 – $0.10** per call.
- Compute-heavy endpoints (image gen, large completions, on-chain analytics) cost more — `x402_check` will show the real number.
- The wallet only needs USDC. The facilitator pays gas on every supported chain.

## Quick install

Local npm install (Claude Code, Cursor, Codex, Windsurf, Gemini CLI):

```bash
npx @dexterai/opendexter
```

Or wire it into an MCP client config:

```json
{
  "mcpServers": {
    "opendexter": {
      "command": "npx",
      "args": ["-y", "@dexterai/opendexter"]
    }
  }
}
```

Hosted MCP (Claude.ai, ChatGPT, Cursor, any MCP-compatible client):

```
https://open.dexter.cash/mcp
```

Add as a hosted connector and skip the install entirely.

## Key behaviors to remember

- **Search is semantic.** Typos and synonyms are handled. Describe what you want in plain English.
- **Don't filter by chain in the query** — the ranker does that for you.
- **Always run `x402_check` before the first paid call** to a new URL so the user sees the price.
- **The wallet lives at `~/.dexterai-mcp/wallet.json`** for the local install. Override with `DEXTER_PRIVATE_KEY` (Solana) or `EVM_PRIVATE_KEY` (EVM chains) env vars.
- **Insufficient funds = soft failure.** Re-route to `x402_wallet` and surface the deposit address.
- **Card tools fail loud on missing session.** When `card_status` returns `no_session`, run `card_login_request_otp` (local) or surface the pairing URL the tool returns (hosted).
- **After settlement, link the explorer URL** for the chain that paid (see table under `x402_fetch`).

## For API sellers

Want your API on the marketplace?

1. Visit `https://dexter.cash/onboard`
2. Add `x402Middleware` from `@dexterai/x402/server` to your endpoints
3. Register your resource URL with the facilitator
4. Dexter's quality bot verifies and scores your endpoint automatically — usually within an hour

Listings update in `x402_search` results once the resource is verified.

## Reference

- npm package: `https://www.npmjs.com/package/@dexterai/opendexter`
- Hosted MCP: `https://open.dexter.cash/mcp`
- Marketplace explorer: `https://x402gle.com`
- Onboard a new API: `https://dexter.cash/onboard`
- Connector pages (for hosted MCP): `https://claude.ai/settings/connectors`
- Server-side reference docs: `docs://opendexter/workflow`, `docs://opendexter/protocol`, `docs://opendexter/debugging` (resources exposed by the MCP server itself)
