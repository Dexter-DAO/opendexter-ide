<p align="center">
  <img src="https://raw.githubusercontent.com/Dexter-DAO/dexter-x402-sdk/main/assets/dexter-wordmark.svg" alt="Dexter" width="360">
</p>

<h1 align="center">OpenDexter</h1>

<p align="center">
  <strong>x402 payments for AI agents — search, pay, and build with paid APIs.</strong><br>
  Skills, rules, tools, and an MCP server for Claude Code, Cursor, and any MCP client.
</p>

<p align="center">
  <a href="https://x402.org"><img src="https://img.shields.io/badge/protocol-x402_v2-00FF88" alt="x402"></a>
  <a href="https://www.npmjs.com/package/@dexterai/opendexter"><img src="https://img.shields.io/npm/v/@dexterai/opendexter.svg" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@dexterai/x402"><img src="https://img.shields.io/npm/v/@dexterai/x402.svg?label=%40dexterai%2Fx402" alt="SDK"></a>
  <a href="https://dexter.cash/opendexter"><img src="https://img.shields.io/badge/Marketplace-5%2C000%2B_APIs-blueviolet" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

<p align="center">
  <a href="https://dexter.cash/opendexter"><strong>Browse Marketplace</strong></a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="https://x402.org"><strong>x402 Protocol</strong></a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="https://www.npmjs.com/package/@dexterai/x402"><strong>SDK Docs</strong></a>
</p>

---

## Install

### Claude Code

```bash
claude plugins marketplace add Dexter-DAO/opendexter
claude plugins install opendexter
```

### Cursor

```bash
npx @dexterai/opendexter install --client cursor
```

Or add manually to `~/.cursor/mcp.json`:

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

### Any MCP Client

```bash
npx @dexterai/opendexter
```

Add this to your client's MCP config:

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

---

## What This Plugin Does

This plugin ships with a **real MCP server** that gives your agent live tools for searching, paying for, and calling paid APIs. On top of that, it has deep SDK knowledge so the agent can help you **build** x402 payments into your own projects.

After installing, your agent can immediately:

- **Search** the Dexter Marketplace for any paid API (image generation, DeFi, analytics, AI, games — 5,000+ endpoints)
- **Check** what an API costs before paying
- **Pay and call** any x402 API with automatic USDC settlement
- **Help you build** x402 clients, servers, React apps, Stripe integrations, and access passes

---

## What is x402?

[x402](https://x402.org) is an open protocol for machine-to-machine payments over HTTP. When an API returns `402 Payment Required`, it includes payment instructions. The client pays (USDC on Solana, Base, or other chains), and the API delivers the response. No API keys, no subscriptions, no invoices.

Dexter operates the most-used x402 facilitator at `https://x402.dexter.cash`, processing millions of settlements across 5,000+ indexed endpoints from every major x402 facilitator — Dexter, Coinbase, PayAI, and more.

---

## Plugin Contents

### MCP Server — `@dexterai/opendexter`

Seven tools cover everything:

| Tool | Description |
|------|-------------|
| **`x402_search`** | Semantic capability search over 5,000+ paid APIs. Returns tiered results (strong + related matches) ranked by quality, usage, and reputation. |
| **`x402_check`** | Preview pricing per chain without spending anything. See exactly what an API costs before committing. |
| **`x402_fetch`** | Call any x402 API with automatic USDC payment. Signs, pays, retries — returns the response directly with an on-chain settlement receipt. |
| **`x402_pay`** | Alias for `x402_fetch`. |
| **`x402_access`** | Access identity-gated endpoints with wallet proof (Sign-In-With-X). |
| **`x402_wallet`** | Show wallet address, USDC/SOL balances, and deposit instructions. |
| **`x402_settings`** | Read or update your per-call spending limit. |

A local Solana wallet is auto-created at `~/.dexterai-mcp/wallet.json` on first run. Fund it with USDC and your agent can start paying for APIs immediately.

---

### Skills (7)

Deep knowledge the agent invokes when relevant:

| Skill | What it teaches |
|-------|-----------------|
| **opendexter** | How to use the x402 tools effectively: search workflow, quality scores, funding flows, error recovery |
| **x402-client** | Build x402 clients with `wrapFetch()`, `createX402Client()`, Solana/EVM keypair wallets, access passes |
| **x402-server** | Add x402 paywalls with `x402Middleware()`, `createX402Server()`, Stripe PayTo, dynamic pricing |
| **x402-react** | React hooks: `useX402Payment()`, `useAccessPass()`, wallet adapter and wagmi integration |
| **x402-protocol** | v2 spec reference: core types, payment flow, HTTP/MCP/A2A transports, scheme mechanics, error codes |
| **x402-marketplace** | Marketplace discovery: search API, quality scoring, categories, seller reputation, becoming a seller |
| **x402-debugging** | Diagnose payment failures: facilitator health, error codes, common issues and fixes |

---

### Rules (2, always-on)

Injected into every conversation so the agent always knows the fundamentals:

- **x402-protocol** — CAIP-2 network identifiers, header conventions, atomic units, facilitator URL, supported chains
- **x402-coding** — Import from subpaths (`@dexterai/x402/client`), prefer `wrapFetch()` for agents, `x402Middleware()` for servers

---

### Agent

- **x402-engineer** — Specialized persona that knows the full Dexter x402 stack. Validates amounts and balances before payment, never exposes private keys, reaches for `x402_search` whenever a user mentions paid APIs.

---

### Commands (3)

| Command | What it does |
|---------|-------------|
| **setup-opendexter** | Install the OpenDexter MCP server into Cursor, Claude Code, Codex, VS Code, Windsurf, or Gemini CLI. |
| **setup-x402-client** | Add `@dexterai/x402` to a Node.js project with `wrapFetch()` boilerplate and a test call. |
| **setup-x402-server** | Add `x402Middleware()` to an Express app with paywall configuration and test. |

---

## Supported Chains

| Chain | Network ID (CAIP-2) | Gas Token |
|-------|---------------------|-----------|
| Solana | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | SOL |
| Base | `eip155:8453` | ETH |
| Polygon | `eip155:137` | POL |
| Arbitrum | `eip155:42161` | ETH |
| Optimism | `eip155:10` | ETH |
| Avalanche | `eip155:43114` | AVAX |
| SKALE Base | `eip155:1187947933` | sFUEL (free) |

---

## Links

- [Dexter Marketplace](https://dexter.cash/opendexter) — Browse 5,000+ paid APIs
- [Dexter Facilitator](https://x402.dexter.cash) — Payment infrastructure
- [@dexterai/x402 SDK](https://www.npmjs.com/package/@dexterai/x402) — Build x402 clients and servers
- [@dexterai/opendexter](https://www.npmjs.com/package/@dexterai/opendexter) — MCP gateway for AI agents
- [x402 Protocol Spec](https://x402.org) — The open standard
- [Become a Seller](https://dexter.cash/onboard) — List your API on the marketplace
- [Twitter](https://twitter.com/dexteraisol)
- [Telegram](https://t.me/dexterdao)

---

## License

MIT
