# x402 Payments — Cursor Plugin

The first payment protocol plugin for the Cursor Marketplace. Ships with a real MCP server, deep SDK knowledge, and protocol expertise so any Cursor agent can search, pay for, and build x402 APIs.

## What's Inside

### MCP Server

Installs `@dexterai/opendexter` — an x402 gateway with four tools:

| Tool | Description |
|------|-------------|
| `x402_search` | Search 5,000+ paid APIs by keyword, category, chain, or price |
| `x402_fetch` | Call any x402 API with automatic USDC payment |
| `x402_check` | Preview pricing without paying |
| `x402_wallet` | Check wallet balance and deposit instructions |

Everything else — Jupiter quotes, image generation, on-chain analytics, games — is a marketplace resource you discover through `x402_search` and call through `x402_fetch`.

### Skills (7)

| Skill | What it teaches |
|-------|-----------------|
| **opendexter** | How to use the x402 tools: search → check → fetch → wallet workflow |
| **x402-client** | Build x402 clients with `wrapFetch`, `createX402Client`, keypair wallets |
| **x402-server** | Add x402 paywalls with `x402Middleware`, Stripe, dynamic pricing, access passes |
| **x402-react** | React hooks: `useX402Payment`, `useAccessPass`, wallet provider setup |
| **x402-protocol** | v2 spec reference: types, flows, transports, CAIP-2 networks, error codes |
| **x402-marketplace** | Marketplace discovery: quality scores, search API, categories, becoming a seller |
| **x402-debugging** | Diagnose payment failures: facilitator health, error codes, balance issues |

### Rules (2, always-on)

- **x402-protocol** — CAIP-2 networks, header conventions, atomic units, infrastructure URLs
- **x402-coding** — SDK import paths, preferred patterns, tool workflow order

### Agent

- **x402-engineer** — Specialized persona that knows the full Dexter x402 stack

### Commands (3)

- **setup-opendexter** — Install the MCP gateway into any AI client
- **setup-x402-client** — Add `wrapFetch` to a Node.js project
- **setup-x402-server** — Add `x402Middleware` to an Express app

## What is x402?

[x402](https://x402.org) is an open protocol for machine-to-machine payments over HTTP. When an API returns `402 Payment Required`, it includes payment instructions. The client pays (USDC on Solana, Base, or other chains), and the API delivers the response. No API keys, no subscriptions, no invoices.

Dexter operates the most-used x402 facilitator at `https://x402.dexter.cash`, processing millions of settlements across 5,000+ indexed API endpoints.

## Install

Install through the Cursor Marketplace, or clone this repo:

```bash
git clone https://github.com/Dexter-DAO/dexter-cursor.git
```

## Links

- [Dexter Marketplace](https://dexter.cash/opendexter) — Browse paid APIs
- [Dexter Facilitator](https://x402.dexter.cash) — Payment infrastructure
- [@dexterai/x402 SDK](https://www.npmjs.com/package/@dexterai/x402) — Build x402 clients and servers
- [@dexterai/opendexter](https://www.npmjs.com/package/@dexterai/opendexter) — MCP gateway for AI agents
- [x402 Protocol Spec](https://x402.org) — The open standard
- [Become a Seller](https://dexter.cash/onboard) — List your API on the marketplace

## License

MIT
