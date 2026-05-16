# Session 1 — Install & Onboarding Audit

**Date:** 2026-05-16
**Surface:** install path across all clients + first-paid-call flow
**Persona:** naive ~30yo semi-technical crypto user
**Method:** code read of `packages/mcp/src/cli/install/{index,clients}.ts`
+ `README.md`. (Live install tests noted as TODO where they need a real
client; findings below are from the code path, which is authoritative for
*what the installer does*.)

---

## Findings, ranked

### P0 — none
Nothing here is outright broken. The installer runs; the happy paths work.

### P1 — real friction / inconsistency

**P1-1. The README and the installer disagree on the MCP server name.**
- README "Cursor" + "Any MCP Client" sections tell the user to add a server
  named **`opendexter`** to their config.
- The installer (`clients.ts`) writes the server as **`dexter-x402`**.
- So a user who runs `npx @dexterai/opendexter install --client cursor` gets
  a server called `dexter-x402`; a user who follows the README's manual JSON
  gets one called `opendexter`. Two installs on the same machine = two
  servers, one of them a duplicate. Confusing, and looks unfinished.
- **Fix direction:** pick one name, use it in both the installer and every
  README snippet. `dexter-x402` is the more descriptive; `opendexter` matches
  the package. Either is fine — but it must be ONE.

**P1-2. "6 clients supported" is really 5 automated + 1 manual.**
- `CLIENTS` lists cursor, claude-code, codex, vscode, windsurf, gemini-cli.
- Codex is `manual: true` in `getClientConfig` — "TOML requires different
  handling." Running `install --client codex` does NOT install anything; it
  prints "Codex requires manual configuration at ~/.codex/config.toml" and
  the user is on their own to hand-write TOML.
- A naive user reasonably expects `install --client codex` to install. It
  doesn't. The summary says "needs manual setup" — better than silent, but
  the user still gets no TOML snippet to paste.
- **Fix direction:** either (a) actually write the TOML (a TOML lib or careful
  string append — Codex's `config.toml` is simple), or (b) at minimum print
  the exact `[mcp_servers.dexter-x402]` block to paste. Right now it prints
  neither.

**P1-3. Claude Code has two install paths and the docs only show one.**
- README "Claude Code" section: `claude plugins marketplace add ... && claude
  plugins install opendexter` — the plugin path.
- The installer's `claude-code` branch ALSO does exactly this (shells out to
  the `claude` CLI). Good — consistent with the README.
- BUT: `getClientConfig('claude-code')` still returns a config that would
  write an MCP entry to `~/.claude.json`. That code path is dead for the
  normal flow (the `claude-code` branch in `runInstall` intercepts before
  `writeClientConfig` is reached) — but it is a loaded gun. If the branch
  logic ever changes, CC gets BOTH a plugin and a raw MCP entry = the server
  loaded twice.
- Also: the plugin and the MCP server are different things. The plugin gives
  skills+rules+agents+commands+MCP; a raw MCP entry gives only the 13 tools,
  no skills. A user who installs "the MCP server" into CC manually (following
  the "Any MCP Client" README section, which CC technically is) gets a
  degraded experience with no skills and won't know why.
- **Fix direction:** the README should explicitly say "For Claude Code, use
  the plugin (above) — do NOT use the Any-MCP-Client instructions." And the
  dead `claude-code` case in `getClientConfig` should be removed so it can't
  be reached by accident.

**P1-4. The hosted MCP (`open.dexter.cash/mcp`) is invisible in the README.**
- The recon found OpenDexter's single biggest competitive edge: a HOSTED MCP
  URL — zero install, no local key file. (Per the competitive research, it is
  the *only* x402 tool with this.)
- The README install section does not mention it AT ALL. Every path shown is
  local `npx`. A user who would happily paste a hosted URL is instead walked
  through local install + wallet file + funding.
- **Fix direction:** the hosted option should be the FIRST thing in Install —
  "Fastest: add `open.dexter.cash/mcp` to your client, done." Local `npx` is
  the power-user / self-custody path and should be framed as such.

### P2 — polish

**P2-1. The funding moment is a dead end in the install flow.**
- `runInstall` ends with: "OpenDexter is wired in. Fund your rails when you're
  ready to settle your first paid call." It prints the Solana + EVM addresses
  during wallet activation.
- But it gives the user no help actually funding — no "send USDC to this
  address," no link to a faucet/onramp, no mention of the Dextercard as the
  funding alternative. A naive crypto user knows what an address is but may
  not have USDC on the right chain.
- **Fix direction:** end the install with a concrete next step — "To fund:
  send USDC (Solana or Base) to <address>, or run `card_issue` to set up a
  Dextercard." One line, but it closes the loop.

**P2-2. `--all` auto-detects clients by directory existence — false positives
likely.**
- `detectInstalledClients` checks for `~/.cursor`, `~/.claude`, `~/.codex`,
  etc. These directories often exist as leftovers even when the client is
  uninstalled. `install --all` would then "install" into a client that isn't
  there.
- Low harm (a config file gets written nobody reads), but it inflates the
  success summary with installs that do nothing.
- **Fix direction:** acceptable as-is for now; note it. A stronger check would
  look for the actual client binary or a real config file, not just the dir.

**P2-3. The Cursor install writes the MCP server in TWO places.**
- `installCursorPlugin` writes `~/.cursor/plugins/opendexter/mcp.json` (the
  plugin's own MCP), AND `writeClientConfig('cursor')` writes
  `~/.cursor/mcp.json` (the global MCP config). Both register `dexter-x402`.
- Cursor may then load the server twice. The recon didn't confirm Cursor's
  dedupe behavior. Needs a live check.
- **Fix direction:** verify against a real Cursor install whether both are
  needed. If the plugin's `mcp.json` is sufficient, drop the global write.

### Good — things that work and shouldn't change

- The installer **backs up** existing client configs before writing
  (`.bak`), including on invalid JSON. Careful, correct.
- It **merges** into the existing `mcpServers` section rather than
  overwriting — won't clobber a user's other MCP servers.
- The CC path correctly uses the `claude` CLI rather than hand-editing
  `~/.claude.json` — the right call (CC owns that file).
- Wallet activation is idempotent (`loadOrCreateWallet`) with clear status
  messages (created / migrated / env / online).

---

## Open items needing a live test (not blockers for the findings above)

1. Run `npx @dexterai/opendexter install --client cursor` against a real
   Cursor — confirm P2-3 (double MCP registration).
2. Confirm the hosted MCP URL `open.dexter.cash/mcp` actually works and what
   the pairing flow is (the README never shows it — P1-4).
3. Walk a true first paid call end to end (search → check → fetch) on a
   funded wallet — separate from install, belongs to the first-call UX.

---

## Summary for the synthesis doc

The installer is **solid engineering** (backups, merges, idempotent) wrapped
in **inconsistent presentation**. The headline problems are all naming /
documentation mismatches, not bugs:

- **P1-1** server-name mismatch (README says `opendexter`, installer writes
  `dexter-x402`) — the most embarrassing one, fix first.
- **P1-4** the hosted MCP — the best feature — is absent from the README.
- **P1-2/P1-3** Codex is half-supported; Claude Code has two paths with no
  guidance on which.

None are P0. Four P1s, three P2s. The fix work here is mostly editing the
README and the `clients.ts`/`index.ts` presentation — low effort, high
polish payoff.

---

## FIXED — 2026-05-16 (same session)

- **P1-1 — DONE.** Every server-name reference unified to `opendexter`:
  installer (`index.ts` ×2), `mcp.json`, `packages/mcp/cursor-mcp.json`,
  `commands/setup-opendexter.md`, `packages/mcp/README.md` ×3,
  `packages/x402-discovery/README.md`. The scan caught far more files than
  the code-only read — it was repo-wide, not just the README. Verified live:
  `install --client cursor` writes `opendexter` in both config files.
- **P1-2 — DONE.** The Codex (manual) install path now renders and prints
  the exact `[mcp_servers.opendexter]` TOML block to paste, via a new
  `renderTomlBlock()` helper. Verified live: `install --client codex` prints
  the block.
- **P1-3 — DONE.** README rewritten so Claude Code explicitly says "use the
  plugin, do not also add the server by hand." The dead `claude-code` case
  in `clients.ts` got a loud DEAD-PATH comment so it can't be re-routed by a
  future editor.
- **P1-4 — DONE.** README Install section rewritten to LEAD with the hosted
  MCP (`https://open.dexter.cash/mcp`) as the no-install option, then local.
  Verified the hosted endpoint is live (MCP `initialize` → HTTP 200, "Dexter
  x402 Gateway"). New "Fund your wallet" section also closes the P2-1
  funding dead-end.

### Still open from Session 1

- **P2-2** (`--all` false-positives on leftover client dirs) — not fixed,
  low harm, noted.
- **P2-3** (Cursor MCP written in two places) — confirmed BOTH files get
  `opendexter`; whether Cursor double-loads needs a live Cursor check.
  Not fixed pending that verification.
- **ARCHITECTURE.md** ASCII diagram still shows the old `dexter-x402`
  duplicate-server state. It is an internal doc deliberately illustrating
  the now-fixed bug; needs a proper section rewrite, not a find-replace.
  Low priority, internal-only.
