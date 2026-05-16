# Session 3 — Technical / Code Audit

**Date:** 2026-05-16
**Surface:** the MCP server runtime — `@dexterai/opendexter` (npm CLI) + its
shared registrar package `@dexterai/x402-mcp-tools`.
**Method:** full read of the payment flow (`tools/fetch.ts`), wallet custody
(`wallet/index.ts`, `wallet/adapter.ts`), all 6 card tools + the cards adapter
(`cards-adapter.ts`), settings, server wiring (`server/index.ts`), the CLI
(`index.ts`), and the test file. SDK version skew verified by installing
`@dexterai/x402@3.2.1` side-by-side and diffing the `client` API surface.

The frame: this is the code that *moves money*. A wrong tool description
(Session 2) makes an agent say the wrong thing; a wrong line here makes the
agent **spend the wrong amount, leak a key, or dead-end a card**. Correctness
and money-safety rank above everything.

---

## Findings, ranked

### P0 — none

No key-leak, no unbounded-spend, no injection. The payment flow has a real
spend cap and a real balance check. Good — that is the thing that mattered
most and it holds.

### P1 — correctness bugs

**P1-1. `card_status` can never return `not_issued` — a user who finished
onboarding shows the wrong stage.**
- `card_status` advertises 7 stages, `not_issued` among them
  (`status.ts:29`), and its `CardStage` type lists it (`status.ts:133`).
- But the handler has **no code path that produces `not_issued`**. Trace it:
  after the user completes `cardOnboardingFinish`, they are verified +
  finalized but have no card yet. `card_status` calls `cardRetrieve()` →
  throws `DextercardNoAccountError` → falls into the onboarding probe →
  `cardOnboardingCheck()` returns status `verified` → handler sets
  `stage = "pending_finalize"` (`status.ts:67`). So a *finished* user is
  reported as **still needing to finalize**.
- Downstream effect: an agent reading `pending_finalize` re-collects the
  user's address and calls `card_issue` finish **again**, instead of
  `card_issue create`. The carrier likely no-ops a repeat finalize, so it
  limps — but the agent is driving the wrong step and may pester the user
  for an address they already gave.
- `card_issue`'s own `detectStage()` (`issue.ts:219-238`) has the **same
  gap** — it also collapses verified-but-no-card into `pending_finalize`.
  `card_issue` partly masks it: in `auto` mode, `pending_finalize` *with all
  finish-args present* calls `cardOnboardingFinish` again, and *without*
  them asks for the address again. Neither reaches `create` cleanly from a
  finished-onboarding state.
- **Root cause:** `cardOnboardingCheck()` returns one `verified` status that
  means two different things — "verified, not finalized" and "verified +
  finalized, no card." The code can't tell them apart from `status` alone.
- **Fix (needs a real look, carry):** the clean fix is to distinguish the
  two. Options: (a) `cardOnboardingCheck()` may already return a
  `finalized`/`completed` sub-field — inspect the real `@dexterai/dextercard`
  response shape and branch on it; (b) if not, after a `verified` check do a
  cheap probe (the finish call is idempotent — call it and treat success-
  with-no-error as "already finalized → `not_issued`"). Either way both
  `status.ts` and `issue.ts` `detectStage` need the same correction.
- **Severity:** P1 not P0 — it doesn't lose money or leak anything, and the
  card *can* still be issued, but it's a genuine state-machine bug on the
  KYC path that will visibly confuse the issuance wizard.

**P1-2. SDK version skew — `@dexterai/x402` is a full major behind.**
- `packages/mcp` and `packages/x402-mcp-tools` both depend on
  `@dexterai/x402 ^2.0.0`. npm resolves that to **2.1.0** (latest 2.x);
  published latest is **3.2.1**. One major behind.
- **Good news, verified:** the *runtime* code is safe. `tools/fetch.ts:247`
  does `import("@dexterai/x402/client")` and uses `wrapFetch`,
  `getSponsoredRecommendations`, `fireImpressionBeacon`. I installed 3.2.1
  and diffed: `wrapFetch`'s signature is **identical**
  (`wrapFetch(fetchImpl, { walletPrivateKey, evmPrivateKey, ... })`), and
  all three symbols are still exported from `/client`. So bumping the dep
  will not break `fetch.ts`.
- **The actual risk is the SDK skills.** `x402-client`, `x402-server`,
  `x402-react`, `x402-protocol`, `x402-debugging` teach SDK usage. 3.0.0 was
  a major — `createX402Server`, `x402Middleware`, `x402AccessPass`,
  `useX402Payment`, `useAccessPass` all exist in 3.x but their *configs*
  may have changed. The skills may teach 2.x call shapes.
- **Note — two separate SDK families, don't conflate them.** `package.json`
  also has `@x402/core ^2.6.0` + `@x402/extensions ^2.6.0` — those are the
  *upstream Coinbase* x402 packages (different npm scope), used by
  `access.ts` for SIWX. Their "2.x" is unrelated to `@dexterai/x402`'s "2.x".
  Only `@dexterai/x402` is behind.
- **Fix:** (a) bump `@dexterai/x402` to `^3.2.1` in both `packages/mcp` and
  `packages/x402-mcp-tools`, reinstall, typecheck — runtime should pass
  clean; (b) diff the 3.x `server` + `react` configs against every code
  example in the 5 SDK skills and repair drift. This is **P1-4 carried from
  Session 2** — same item, now with the `wrapFetch`-is-compatible fact
  pinned down. Part (a) is quick; part (b) is the real work.

### P2 — dead code, doc drift, minor gaps

**P2-1. Dead `headers` plumbing in `x402Fetch`.**
- `x402Fetch()` accepts `params.headers` (`fetch.ts:165`) and applies it
  (`fetch.ts:177-179`). But `registerFetchTool`'s `inputSchema`
  (`fetch.ts:328-379`) has **no `headers` field**, and `runFetch`
  (`fetch.ts:381-399`) never passes `args.headers` into `x402Fetch`. So
  through the MCP tool, `headers` is **unreachable** — permanently
  `undefined`.
- This is the same dead param Session 2 already removed from the
  `opendexter` skill (S2 P1-1) — correctly, since it genuinely doesn't
  reach the surface. What's left is the dead plumbing *inside* `x402Fetch`.
- **Not a bug** (the spread of an empty object is harmless), just dead
  weight that misleads the next reader into thinking custom headers work.
- **Fix:** either drop `headers` from the `x402Fetch` signature + body, OR
  (better, if custom headers are genuinely wanted) add `headers` to the Zod
  `inputSchema` and thread it through `runFetch`. Low priority — pick one,
  don't leave it half-wired.

**P2-2. `card-login.ts` file-header comment omits `card_login_request_otp`.**
- The file header (`card-login.ts:1-31`) documents only `card_login_start`
  and `card_login_complete`. But the file's **first** registered tool is
  `card_login_request_otp` — the zero-browser-tab path, the *primary*
  onboarding entry point. The header doesn't mention it.
- Exactly the doc-drift class Session 2 flagged on the skill. The tool
  descriptions themselves are now correct (fixed in S2); the file header
  was missed.
- **Fix:** add a `card_login_request_otp` paragraph to the header, and note
  it is the preferred first step with `card_login_start` as the fallback.
  Trivial.

**P2-3. The `http` transport is a hard `process.exit(1)`, advertised as a
choice.**
- The CLI exposes `--transport` with `choices: ["stdio", "http"]`
  (`index.ts:18-20`). Picking `http` reaches `server/index.ts:109-112`,
  prints `"HTTP transport not yet implemented"`, and **exits 1**.
- This is not a real gap in capability — stdio is the correct transport for
  a local MCP CLI, and the hosted MCP at `open.dexter.cash/mcp` is the
  HTTP/streamable surface. The npm CLI legitimately doesn't need HTTP.
- The flaw is purely cosmetic: offering `http` as a yargs `choice` and then
  hard-failing on it is a small UX papercut — a user who picks the
  documented option gets an error exit.
- **Fix (trivial, do it):** remove `http` from the `choices` array. If/when
  the CLI ever needs HTTP it can be re-added. Don't advertise a choice that
  exits 1.

### Good — things that are correct and well-built

- **The spend cap is real and live-reloadable.** `getMaxAmountUsdc` is a
  *callback* (`server/index.ts:65`) reading `settings.json` at call time, so
  a user can change the cap without restarting. `x402Fetch`'s
  `evaluatePaymentRequirements` (`fetch.ts:66-115`) filters every `accepts`
  option by `priceUsdc <= effectiveMaxAmount` *before* any signing. Default
  cap is a sane `$5` (`settings.ts:7`). Per-call override via
  `maxAmountUsdc` works. This is the money-safety core and it is correct.
- **Balance is checked before paying.** After the policy filter, `fetch.ts`
  filters again by `availableUsdc >= priceUsdc` (`fetch.ts:101-112`) and
  returns a clear "Insufficient balance" with the actual numbers. No blind
  settlement attempt.
- **Wallet file perms are correct.** `wallet.json` is written `0o600`, its
  dir `0o700` (`wallet/index.ts:47-48`). The Dextercard session file and
  its key are the same — `0o600`/`0o700` (`cards-adapter.ts:53-57`), session
  AES-256-GCM encrypted via `EncryptedFileSessionStore`.
- **Corrupted-wallet handling is graceful and non-destructive.** A bad
  `wallet.json` is **backed up to `.bak`** before a fresh wallet is created
  (`wallet/index.ts:103-109`) — it does not silently destroy keys. The
  dual-wallet EVM migration is explicit and persisted, not hidden.
- **Keys never cross the tool boundary.** `x402_wallet` returns only
  addresses + balances (`wallet.ts:53-69`) — never private keys. Private
  keys flow only into `wrapFetch`'s in-process signer
  (`fetch.ts:236-251`). The `WalletAdapter` contract is deliberately
  designed so registrars can't reach a global key store.
- **`card_issue` is a genuinely good stage machine** apart from the
  `not_issued` gap (P1-1). The `auto` step inspecting state and running the
  right action, every result carrying `nextAction`, the `requireStartArgs`/
  `requireFinishArgs` guards — this is the right shape for an agent-driven
  wizard.
- **SIWX flow (`access.ts`) is clean** — proper 402 probe, extension
  detection, chain selection, signed-header retry, and it has a real test
  (`mcp.test.ts:217-295`) that exercises the full attach-and-retry.
- **Multipart upload is safely bounded** — 200 MB cap enforced *while*
  summing file sizes (`fetch.ts:30-42`), rebuilds a fresh `FormData` for the
  paid retry because streams are single-use (`fetch.ts:255-263`), and never
  leaks file paths in error strings (stable error codes only).
- **The pairing-poll throttle is a nice touch** — `POLL_THROTTLE_MS = 1000`
  (`cards-adapter.ts:125-126`) stops a tight loop of card-tool calls from
  fanning out into one HTTP request each.
- **Hosted-server errors are turned into clean tool results.**
  `_remote-failures.ts` catches `DextercardPairingRequiredError` /
  `DextercardLoginRequiredError` and returns structured `auth_required` /
  `dextercard_login_required` stages with clickable URLs — not raw
  `isError` envelopes.

### Test coverage — adequate but shallow on the money path

`mcp.test.ts` covers: wallet file create/load/corruption, search formatting,
402 parsing, install config, and a real **SIWX** integration test. Plus 3
live-network integration tests against `api.dexter.cash`.

The gap: **`x402Fetch`'s payment policy is not unit-tested.** The single
most important money-safety function — `evaluatePaymentRequirements`, the
spend-cap + balance filter — has zero tests. It's pure and trivially
testable with a fake `WalletAdapter`. Worth adding: "rejects when price >
cap", "rejects when balance < price", "picks the funded chain". Not a bug,
but the thing most deserving of a test has none. Recommend for Session 5's
fix list.

---

## Summary for the synthesis doc

The OpenDexter runtime is **money-safe and well-architected** — real spend
cap, real balance check, correct file perms, non-destructive corruption
handling, keys never crossing the tool boundary. **No P0.**

Two P1s:
- **P1-1** `card_status` / `card_issue detectStage` can't represent
  "onboarding finished, card not yet created" — both collapse it into
  `pending_finalize`. A finished user is told to finalize again; the
  issuance wizard drives the wrong step. State-machine bug on the KYC path.
  Needs a look at the real `cardOnboardingCheck()` shape before fixing.
- **P1-2** `@dexterai/x402` is a major behind (2.1.0 vs 3.2.1). `wrapFetch`
  is verified API-compatible so the runtime is safe to bump — but the 5 SDK
  skills may teach stale 2.x call shapes. (This is Session 2's P1-4, same
  item.)

Three P2s, all small: dead `headers` plumbing in `x402Fetch`, a stale
`card-login.ts` file header, and an `http` transport choice that exits 1.

**Effort:** P2-2 and P2-3 are trivial — fix in-session. P2-1 is a small
decision (drop vs wire). P1-2 part (a) — the dep bump — is quick; part (b) —
the skill diff — is the real remaining work. P1-1 needs the
`@dexterai/dextercard` response shape checked before it can be fixed
correctly; carry it.

---

## FIXED — 2026-05-16 (same session)

- **P2-2 — DONE.** `card-login.ts` file header rewritten to document all
  three tools. `card_login_request_otp` is now described as the preferred
  first step (zero browser tabs, server-side captcha solve) and
  `card_login_start` as the fallback. Header now matches the tool
  descriptions Session 2 corrected. Both packages typecheck green.
- **P2-3 — DONE.** `http` removed from the `--transport` yargs `choices` in
  `index.ts` — the CLI no longer advertises an option that exits 1.
  `ServerOptions.transport` tightened from `"stdio" | "http"` to `"stdio"`,
  and the dead `if (opts.transport !== "stdio") { ...process.exit(1) }`
  branch in `server/index.ts` removed. stdio is the correct transport for a
  local MCP CLI; the hosted MCP at `open.dexter.cash/mcp` remains the
  HTTP/streamable surface. Both packages typecheck green.

### P1-2 part (a) — DONE.

The `@dexterai/x402` dep bump (`^2.0.0` → `^3.2.1`) is **applied** in both
`packages/mcp` and `packages/x402-mcp-tools`. `npm install` resolved
`@dexterai/x402@3.2.1`; both packages typecheck clean; the full mcp unit
suite passes (22 passed, 1 network-integration test skipped, 0 failed). The
`wrapFetch` API was verified compatible up front and the runtime confirmed it.

**Bonus — fixed a long-dead test.** The SIWX test in `mcp.test.ts` had been
broken since commit `6f71e5e` (the migration that moved `accessWithWalletProof`
into `@dexterai/x402-mcp-tools`): the test still imported it from the local
`../src/tools/access.js`, which only exports `cliAccess` — so it threw
`accessWithWalletProof is not a function` on every run, masked because the
suite was usually run with a name filter. Fixed: import from the package,
and wrap the file-backed `LoadedWallet` in `createNpmWalletAdapter` (the
function now consumes the `WalletAdapter` contract, not the raw wallet). The
SIWX flow is once again actually tested. This was not caused by the bump —
the bump just surfaced it.

### Carried — P1-1 (needs a wire capture before it can be fixed)

`card_status` / `card_issue detectStage` collapsing verified-but-no-card
into `pending_finalize` **cannot be surgically fixed yet**. Confirmed why:
`@dexterai/dextercard@0.5.0`'s `CardOnboardingCheckResponse` type
(`types.d.ts:54-63`) is `{ status?: string; terms?: {...}; [key: string]:
unknown }` — there is **no `finalized` field**. The SDK contract genuinely
cannot distinguish "verified, not finalized" from "verified + finalized, no
card". Fixing P1-1 requires one of: (a) a real wire capture of what
`cardOnboardingCheck()` returns *after* a successful finish — the `[key:
string]: unknown` open shape means the carrier may already send a
distinguishing field the typed surface just doesn't name; or (b) treating
the idempotent finish call as the probe. Carried to Session 5 with this
exact next step. Not left silent — it is a real KYC-path state bug.

### Carried — P1-2 part (b), the real work

The SDK-skill accuracy diff (5 skills vs the 3.x `@dexterai/x402` API) is
unchanged from Session 2's P1-4 and still the largest single OpenDexter
item. Belongs in its own pass once part (a) is applied.
