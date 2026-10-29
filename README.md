<p align="center">
  <img src="./packages/mcp/assets/dexter-wordmark.svg" alt="Dexter" width="360">
</p>

<h1 align="center">OpenDexter</h1>

<p align="center">
  <strong>Your agent can find an API, see what it costs, and call it.</strong><br>
OpenDexter searches paid services by the job they do, checks the current terms, and makes a bounded request through the connected Dexter Wallet.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dexterai/opendexter"><img src="https://img.shields.io/npm/v/@dexterai/opendexter.svg" alt="npm version"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-339933" alt="Node 22 or newer"></a>
  <a href="https://x402.org"><img src="https://img.shields.io/badge/protocol-x402-6f5cff" alt="x402 protocol"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-111111" alt="MIT license"></a>
</p>

For Codex or Claude Code, start with the [hosted plugin](#install-the-hosted-plugins).
Chat clients with remote MCP and OAuth can use the [hosted connector](#hosted-connector).
For Cursor, VS Code, Windsurf, Gemini CLI or scripts, use the
[local package](#local-start-in-one-command).

## Choose how it runs

Hosted plugins and remote MCP clients connect to `https://open.dexter.cash/mcp`.
The client handles OAuth sign-in.

The local package runs an npm/stdio proxy to that hosted runtime. Install it
in your client, then run `connect` to approve access to your Dexter Wallet.

Both connections use the same passkey-controlled Dexter Wallet and hosted
governed executor. The server verifies grant limits, capacity, expiry, role and
revocation. The hosted runtime executes payments under that grant.

### Local: start in one command

Use Node.js 22 or newer. The commands pin version `1.25.3`.

```bash
npx @dexterai/opendexter@1.25.3 setup
```

`setup` detects supported AI clients, configures the clients it can edit safely,
and prints any remaining manual steps. Follow those steps, then open a fresh
conversation in your client.

Ask your agent: "Find an image-generation API and show me its pricing."

For Wallet tools and paid calls, [connect your Dexter Wallet](#wallets-and-authority)
and check its spending authority.

To target one client during installation:

```bash
npx @dexterai/opendexter@1.25.3 install --client cursor
```

Use `claude-code`, `codex`, `vscode`, `windsurf`, or `gemini-cli` in place of
`cursor`. The Claude Code route adds only the local stdio MCP. To add that
connection directly:

```bash
claude mcp add --scope user opendexter -- npx -y @dexterai/opendexter@1.25.3
```

This local installer never adds the repository's hosted Claude Code plugin.
For a manual stdio MCP configuration in another client:

```json
{
  "mcpServers": {
    "opendexter": {
      "command": "npx",
      "args": ["-y", "@dexterai/opendexter@1.25.3"]
    }
  }
}
```

See the [local package guide](./packages/mcp/README.md) for authority, client,
CLI, recovery, and seller workflows.

### Hosted connector

The hosted connector registers fifteen authenticated tools, including
`dexter_report_work` for the connected agent's work updates. Fourteen tools are
model-callable; `indexter_discover` is reserved for the widget. Verify new tools
in the current conversation's callable roster after a client refresh or new
session. The local CLI `1.25.3` exposes eight tools, including work reporting.
See the [hosted work-report guide](plugins/opendexter/skills/opendexter/SKILL.md#report-current-work)
for an example and replay recovery.

Clients with remote MCP and OAuth use this URL:

```json
{
  "mcpServers": {
    "opendexter": {
      "url": "https://open.dexter.cash/mcp"
    }
  }
}
```

The release contract uses native client sign-in when a protected tool requires
it. Connector sign-in, wallet enrollment, and a paid call are three separate
events:

- signing in lets the client call account-protected tools;
- enrolling the passkey wallet creates or resumes the user's payment authority;
- calling `x402_fetch` can move USDC under that wallet's limits.

Connecting does not itself approve a payment. Never paste a bearer token into
the MCP configuration.

The connector and OAuth identities are related but deliberately not
interchangeable:

- MCP resource and connector: `https://open.dexter.cash/mcp`
- authorization-server issuer: `https://mcp.dexter.cash/mcp`
- access-token issuer: `https://dexter.cash`

### Install the hosted plugins

ChatGPT and Codex use the combined package under `plugins/opendexter`: it binds
the current owner-created ChatGPT app, the hosted MCP, and the hosted skill
tree in one installable plugin. Updating source does not automatically replace
an already installed app-only ChatGPT package; install or submit the combined
package as one new plugin version, then test it in a fresh chat.

Codex:

```bash
codex plugin marketplace add Dexter-DAO/opendexter-ide --ref main
codex plugin add opendexter@dexter
codex mcp login opendexter
```

Claude Code:

```bash
claude plugin marketplace add Dexter-DAO/opendexter-ide --scope user
claude plugin install opendexter@opendexter --scope user
claude mcp login opendexter
```

Start a fresh task so the client can discover the package. Protected hosted
tools then use the client's native MCP OAuth action. Keep exactly one
OpenDexter registration in a client unless that client's duplicate-tool
namespacing has been separately proven. `--registration-name` chooses the name
of that one registration; it does not bypass an existing hosted or local
OpenDexter registration. The installer never silently renames or overwrites one.

Run `npx @dexterai/opendexter@1.25.3 doctor` for a read-only report. Doctor
does not create a wallet, read balances, edit client configuration, or pay.

## From request to result

OpenDexter keeps discovery and spending separate:

1. **Find.** `x402_search` searches the live catalog using the user's actual
   request. Results include strong and related matches, ranking reasons,
   quality evidence, structured input guidance when available, and advertised
   payment routes.
2. **Inspect and prepare.** `x402_check` probes the exact URL and method without
   making a payment. An anonymous hosted check is quote-only; an authenticated
   hosted check also persists one exact quote/request intent for a later
   approved call. It returns current per-chain pricing, accepted assets,
   schemas when published, and whether the endpoint is paid, identity-gated,
   API-key protected, or unprotected. A non-GET probe can still mutate seller
   state, needs separate probe approval, and is never automatically retried
   after possible dispatch.
3. **Call.** `x402_fetch` makes one exact prepared request and, when required,
   settles a compatible payment within the active policy.
4. **Receive.** The tool returns the provider response with settlement detail
   when payment succeeds.

Search cards are leads, not payment authorization. Check the selected route
again before spending. If a dispatched payment has an uncertain outcome, do
not blindly retry it; reconcile the first attempt before another payment can be
safe.

## Product tool surfaces

CLI source `1.25.3` exposes these eight local proxy tools.

| Tool | What it does | Consequential? |
|---|---|---|
| `x402_search` | Finds services by capability in the OpenDexter catalog | No |
| `x402_check` | Reads current terms and can prepare one opaque intent | A non-GET probe can mutate seller state; it requires separate probe approval |
| `x402_fetch` | Executes one opaque intent under a separately approved atomic ceiling | Yes; it can move USDC |
| `x402_status` | Reconciles the same intent after an uncertain or completed fetch | No |
| `x402_access` | Starts one fresh anonymous legacy SIWX wallet-proof context, separate from Dexter OAuth and governed payment authority, with no cross-call continuity | A non-GET request can mutate seller state; it requires separate request approval |
| `x402_wallet` | Reads the connected wallet and exact authority evidence | No |
| `dexter_portfolio` | Reads the governed portfolio bound to the same principal | No |
| `dexter_report_work` | Saves the connected agent's current work statement | Yes; updates the statement without moving funds |

Use reporting for meaningful work changes. Keep private data out of summaries,
and preserve the operation ID and identical content after an uncertain response.
The [local reporting guide](./packages/mcp/skills/opendexter/SKILL.md#report-current-work)
explains server-observed freshness and revision recovery. Check the current
conversation's callable tools before reporting work.

Every account-bound call uses the authenticated Dexter Wallet session. The
local package never swaps to a wallet file or environment key when hosted
authority is missing, rejected, expired, or revoked. Developer SDKs may still
accept an application-supplied signer for a separate application, but that is
not an OpenDexter MCP payment path or fallback.

## Wallets and authority

Run the device flow, approve with the wallet passkey, and then inspect the live
authority projection:

```bash
npx @dexterai/opendexter@1.25.3 connect
npx @dexterai/opendexter@1.25.3 connect status
npx @dexterai/opendexter@1.25.3 wallet
```

The OAuth request uses the exact `vault` scope. The returned access token can
separately carry Dexter's signed `dexter_surface` claim; that claim is not a
client-requested scope. Connection alone is not proof of payment authority.
Treat it as active only when status reports the exact grant, principal, limits,
remaining capacity, expiry, scopes, role, and revocation state.

Older installations may still have `~/.dexterai-mcp/wallet.json`. OpenDexter
does not delete or transfer it automatically. The explicit
`wallet --legacy-recovery` command parses the existing file to recover validated
public addresses and balance reads; it never derives, returns, exports, or
enables private-key fields as a signer. Legacy settings and environment signer
variables do not govern the hosted runtime.

See [Connect your Dexter wallet](./docs/connect-your-wallet.md) for the exact
connection and authority boundary.

## Build or sell

- **Build an x402 client or server:** use
  [`@dexterai/x402`](https://www.npmjs.com/package/@dexterai/x402).
- **Prepare a compatible service for discovery:** run
  `npx @dexterai/opendexter@1.25.3 audition https://your-service.example`.
  A server URL registers routes. A specific
  endpoint URL requests an immediate test using OpenDexter's verifier funds.
  Read the [audition result and recovery guidance](./packages/mcp/README.md#audition-results).
- **Inspect the protocol:** read the [x402 specification](https://x402.org).

## Repository map

| Path | Audience |
|---|---|
| [`packages/mcp`](./packages/mcp) | Published local CLI and stdio MCP package |
| [`plugins/opendexter`](./plugins/opendexter) | Combined ChatGPT/Codex app, MCP, and canonical hosted skill package |
| [`opendexter-plugin`](./opendexter-plugin) | Claude Code package generated from the canonical hosted skill |
| [`packages/x402-mcp-tools`](./packages/x402-mcp-tools) | Shared MCP tool implementations |
| [`packages/mcp-instructions`](./packages/mcp-instructions) | Roster-aware agent instructions |

## License

MIT
