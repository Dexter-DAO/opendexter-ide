<p align="center">
  <img src="https://raw.githubusercontent.com/Dexter-DAO/dexter-x402-sdk/main/assets/dexter-wordmark.svg" alt="Dexter" width="360">
</p>

<h1 align="center">@dexterai/x402-mcp-tools</h1>

<p align="center">
  <strong>Shared MCP tool registrations for the Dexter ecosystem.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dexterai/x402-mcp-tools"><img src="https://img.shields.io/npm/v/@dexterai/x402-mcp-tools.svg" alt="npm"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E=18-brightgreen.svg" alt="Node"></a>
  <a href="https://dexter.cash"><img src="https://img.shields.io/badge/Marketplace-dexter.cash-blueviolet" alt="Marketplace"></a>
</p>

<p align="center">
  <a href="https://dexter.cash"><strong>Browse Dexter →</strong></a>
</p>

---

## What is `@dexterai/x402-mcp-tools`?

The shared tool-registration layer for every Dexter MCP surface. One `register*Tool` function per tool, plus an adapter contract that lets each consumer wire its own wallet, session, and storage backend behind a uniform interface.

Today this package powers three production surfaces:

- **[`@dexterai/opendexter`](https://www.npmjs.com/package/@dexterai/opendexter)** — the npm CLI that exposes Dexter's full toolset to local AI clients (Cursor, Claude Code, Codex, VS Code, etc.).
- **The hosted public MCP server** at `https://open.dexter.cash/mcp` — anonymous session-bound wallets.
- **The hosted authenticated MCP server** — Supabase-managed wallets for signed-in users.

All three consume the same registrars from this package. Their tool surfaces look identical to clients because the *logic* is shared; what differs is each consumer's wallet adapter, session storage, and widget URI scheme.

---

## Install

```bash
npm install @dexterai/x402-mcp-tools
```

Peer-friendly with `@dexterai/dextercard`, `@dexterai/x402-core`, and `@modelcontextprotocol/sdk`.

## Quickstart

```ts
import {
  composeAllTools,
  composeCardTools,
  buildToolMetas,
  buildCardToolMetas,
} from "@dexterai/x402-mcp-tools";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({ name: "my-dexter-server", version: "1.0.0" });

// x402 tools (search, check, fetch, access, wallet)
composeAllTools(server, {
  apiBaseUrl: "https://x402.dexter.cash",
  metas: buildToolMetas(myWidgetUris),
  wallet: myWalletAdapter,
});

// Dextercard tools (status, issue, link-wallet, freeze)
composeCardTools(server, {
  cards: myCardsAdapter,
  metas: buildCardToolMetas(myCardWidgetUris),
});
```

---

## Tools

This package exposes nine MCP tools across two domains.

### x402 Marketplace Tools

| Tool | Description |
|------|-------------|
| `x402_search` | Semantic capability search over the Dexter x402 marketplace. Returns strong + related matches with synonym expansion and cross-encoder LLM rerank. |
| `x402_check` | Probe an endpoint for x402 payment requirements without paying. Returns pricing per chain plus input/output schemas. |
| `x402_fetch` | Call any x402 endpoint with automatic USDC settlement. |
| `x402_pay` | Alias of `x402_fetch` for clients that want an explicit payment verb. |
| `x402_access` | Access identity-gated endpoints with Sign-In-With-X (Solana / EVM) instead of payment. |
| `x402_wallet` | Show wallet addresses, USDC balances per chain, and deposit hints. |

### Dextercard Tools

| Tool | Description |
|------|-------------|
| `card_status` | Show current card state: stage indicator, account, card metadata, linked wallets, recent transactions. |
| `card_issue` | Stage-aware issuance orchestrator. Takes the next correct action automatically based on the user's current onboarding state. |
| `card_link_wallet` | Authorize a wallet to fund card transactions up to a per-wallet cap. |
| `card_freeze` | Pause or resume the card with a single `frozen: boolean` argument. |

---

## Adapter Contracts

Tools never reach into a global wallet, filesystem, or environment variable. Each consumer provides three adapters:

### `WalletAdapter`

Resolves balances and signers for the active session. Implementations:
- **npm CLI**: file-backed local keypair at `~/.dexterai-mcp/wallet.json`
- **hosted public**: session-bound anonymous wallet
- **hosted authed**: Supabase-managed managed wallet

```ts
interface WalletAdapter {
  getInfo(): WalletInfo;
  getAvailableUsdc(network: string): Promise<number>;
  getAllBalances(): Promise<WalletBalances>;
  getSolanaSigner(): SolanaSigner | null;
  getEvmSigner(): EvmSigner | null;
}
```

### `CardsAdapter` and `CardOperations`

Resolves a {@link CardOperations} instance bound to the active user (or `null` when no session is configured). Returning `null` makes the card tools no-op gracefully with a configurable hint, instead of erroring.

```ts
interface CardsAdapter {
  getOperations(): Promise<CardOperations | null> | CardOperations | null;
  describe?(): Promise<string | null> | string | null;
}
```

`CardOperations` is the small subset of the Dextercard SDK surface that the registrars actually call — exposed as an interface so consumers can plug in either:

- `LocalCardOperations(dextercardClient)` — wraps a real `Dextercard` instance (npm CLI; any environment that holds the carrier session in-process).
- `createRemoteCardOperations({ baseUrl, userId, hmacSecret })` — calls a remote `/internal/dextercard/*` HMAC-gated surface (hosted MCP servers that intentionally don't hold carrier sessions in-process). Translates HTTP errors back to the SDK's typed exceptions, so registrars work identically with either adapter.

> **Migrating from 0.2.x:** `getClient(): Dextercard | null` was renamed to `getOperations(): CardOperations | null`. To preserve old behavior, wrap your existing Dextercard with `new LocalCardOperations(dextercard)`.

### Widget URIs

Each consumer computes its own content-hashed `ui://` URIs (typically by SHA-1 of the widget HTML). The `buildToolMetas` and `buildCardToolMetas` helpers turn those URIs into the dual-format metadata blobs that work with both the MCP Apps standard (Cursor, Claude Desktop, VS Code) and the OpenAI Apps SDK (ChatGPT).

```ts
const metas = buildCardToolMetas({
  status: "ui://dexter/card-status-abc12345",
  issue: "ui://dexter/card-issue-def67890",
  linkWallet: "ui://dexter/card-link-wallet-ghi13579",
});
```

---

## Compose Helpers

Most consumers register tools with one call.

| Helper | Tools registered |
|--------|------------------|
| `composeAllTools(server, opts)` | x402_search, x402_check, x402_fetch, x402_access, x402_wallet |
| `composeCardTools(server, opts)` | card_status, card_issue, card_link_wallet, card_freeze |

Both helpers accept an optional `include` array if you want to surface only a subset.

---

## Status

`0.x.x` — surface stable, breaking changes pre-1.0 will be called out in the changelog. The Dextercard tools were added in `0.2.x` and depend on `@dexterai/dextercard@^0.3.0`.

---

## Links

- [@dexterai/opendexter](https://www.npmjs.com/package/@dexterai/opendexter) — the npm CLI that consumes this package
- [@dexterai/dextercard](https://www.npmjs.com/package/@dexterai/dextercard) — the card-issuance SDK
- [@dexterai/x402-core](https://www.npmjs.com/package/@dexterai/x402-core) — the underlying HTTP/format layer
- [Dexter Marketplace](https://dexter.cash)
- [Dexter Facilitator](https://x402.dexter.cash)
- [x402 Protocol](https://x402.org)
- [Twitter](https://twitter.com/dexteraisol)
- [Telegram](https://t.me/dexterdao)

## License

MIT
