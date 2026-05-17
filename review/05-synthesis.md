# Session 5 — Synthesis & Prioritized Fix List

**Date:** 2026-05-16
**Purpose:** consolidate Sessions 1-4 into one prioritized action list. This
is the doc that drives the **fix phase** (separate from this review).
**Inputs:** `01-onboarding.md`, `02-skills-tools.md`, `03-technical.md`,
`04-competitive.md`.

---

## What the review found, in one paragraph

OpenDexter is **well-built and money-safe**. Across four sessions: **zero
P0s** — nothing broken, nothing embarrassing, no security hole, no key leak,
no unbounded spend. The MCP runtime has a real live-reloadable spend cap, a
real balance check, correct file perms, non-destructive corruption handling,
and keys that never cross the tool boundary. The installer is solid
engineering (backups, merges, idempotent). The skills are mostly accurate.
The competitive position is genuinely strong: the headline advantage is the
**skills synthesis pipeline** (`04-competitive.md` §1.5, added on revision) —
OpenDexter automatically turns every crawled x402 endpoint into a verified,
drop-in agent tool, which no competitor does. Plus **cross-facilitator
coverage** and an **open + AI-verified** catalog (not a walled garden). The
nearest "rival," the CDP Bazaar, turned out to be a facilitator discovery
extension OpenDexter already crawls, not a competing product.

**So this is a polish-and-sharpen list, not a rescue.** Most of the work
already happened in-session — Sessions 1, 2, and 3 fixed their quick wins as
they went. What remains is a small set of carried items, ranked below.

---

## Already fixed in-session (done, committed, not re-listed below)

| Session | Fixed | Commit |
|---|---|---|
| 1 | Server-name mismatch unified to `opendexter` (8 files); Codex TOML block now printed; CC plugin-vs-MCP guidance; README leads with hosted MCP + funding section | `ea368a7` |
| 2 | `x402_fetch` param table corrected; `card_login_start` stage fixed; `card_login_*` roles un-swapped | `08be5da` |
| 3 | `http` transport choice removed (was `exit(1)`); `card-login.ts` header corrected | `4ce7a41` |
| 3 | `@dexterai/x402` bumped `^2.0.0`→`^3.2.1`; dead SIWX test fixed | `5203c91` |

Eleven findings already closed. The list below is **what's left**.

---

## The prioritized fix list

Severity: **P0** broken/embarrassing · **P1** real friction · **P2** polish ·
**P3** nice-to-have. Effort: **S** <1hr · **M** a few hrs · **L** a session+.

### P0 — none

Nothing outstanding is P0. (Confirmed across all four sessions.)

---

### P1 — real friction, do these first

**P1-a. Rewrite `SERVER_INSTRUCTIONS` to a prescriptive SOP shape.**
- **What:** the MCP server `instructions` string (in `@dexterai/mcp-instructions`,
  consumed by `server/index.ts`) is *descriptive* — a tool list + light
  workflow recipes. Pay.sh's `instructions.md` is *prescriptive* — "never
  answer 'can pay do X' from memory; check the catalog," explicit tool-routing
  branches, failure recipes, a safety model. An agent follows a prescriptive
  SOP far more reliably.
- **Why:** S4 found this is OpenDexter's weakest agent-facing surface. It
  directly governs how well every agent uses every tool — the highest
  leverage-per-word fix in the whole review. Already flagged by the 04-17
  audit as Task #29; S4 sharpened it.
- **Effort:** **M.** Prose, not code — but it's the load-bearing prose. Model
  it on Pay.sh's structure: never-answer-from-memory anchor, per-tool
  selection rules, failure recipes, a short safety model.
- **Surface:** `@dexterai/mcp-instructions` package → hosted MCP + npm CLI
  (both consume it).

**P1-b. SDK-skill 3.x accuracy diff — verify the 5 SDK skills against
`@dexterai/x402@3.2.x`.**
- **What:** the dep bump (S3 P1-2 part a) is done — `@dexterai/x402` is now
  `^3.2.1`. Part (b) is unstarted: the 5 SDK skills (`x402-client`,
  `x402-server`, `x402-react`, `x402-protocol`, `x402-debugging`) teach SDK
  usage and may still show 2.x call shapes. 3.0.0 was a major.
- **Why:** S2 P1-4 / S3 P1-2. `wrapFetch` was verified API-compatible, so the
  *runtime* is fine — but the skills' `createX402Server`, `x402Middleware`,
  `x402AccessPass`, `useX402Payment`, `useAccessPass` examples were not
  checked. A skill that teaches a stale config makes an agent write broken
  code. This is the largest single carried item.
- **Effort:** **M-L.** Diff the installed 3.2.x `server` + `react` + `client`
  type surfaces against every code block in the 5 skills; repair drift. The
  3.2.1 surface is already extracted (`/tmp/x402-3x-check` during S3, or
  reinstall) — `server` exports `createX402Server`, `x402Middleware`,
  `x402AccessPass`, `createDynamicPricing`, token-pricing helpers; `react`
  exports `useX402Payment`, `useAccessPass`.
- **Surface:** `opendexter-plugin/skills/x402-*` (5 skill dirs).

**P1-c. The `card_issue` `not_issued` state-machine gap. — FIXED (deployed).**
- **What:** S3 P1-1. A user who has *finished* KYC onboarding but has no
  card yet was reported as `pending_finalize` — so an agent re-ran finalize
  instead of issuing the card. `cardOnboardingCheck()` returns `'verified'`
  for two distinct sub-states ("verified, not finalized" and "verified +
  finalized, no card"), and the code mapped both to `pending_finalize`.
- **The fix (no wire capture needed).** The original plan assumed the carrier
  *might* send a distinguishing field on `cardOnboardingCheck` that the typed
  surface doesn't name, and that a real capture was required to find it. That
  framing was over-cautious. `cardCreate()` is itself the deterministic
  probe: it succeeds **only** when onboarding is fully finalized. The fix, in
  the `auto` issuance path, is — when onboarding is `verified` and there is
  no card — attempt `cardCreate()`; success means it was finalized (→
  `active`), and a `DextercardApiError` means it was not (→ fall through to
  the existing finalize step). `DextercardApiError` (`.status`, `.payload`)
  is the typed handle the probe branches on. No mystery field, no capture.
- **Shipped in:** `x402-mcp-tools/src/tools/cards/issue.ts` (`auto` path,
  `pending_finalize` branch) **and** `dexter-api/src/routes/dextercard.ts`
  (`POST /issue` `auto` path — the dexter-fe/storefront backend carried the
  identical bug). Both built clean; `dexter-api` redeployed.
- **`status.ts` deliberately unchanged.** `card_status` / `GET /status` are
  read-only; running `cardCreate` (a mutation) inside a status read would be
  wrong. A standalone `card_status` call on a verified-no-card account still
  reports `pending_finalize` — an inherent limit of a non-mutating read — but
  the moment an agent drives issuance via `card_issue auto`, the probe
  corrects it. The user-facing wrong-step loop is closed.
- **Residual (cosmetic, not blocking).** Labelling the two sub-states
  *before* attempting `cardCreate` (to save one round-trip, or to give
  `card_status` a truthful `not_issued`) would still need a real account in
  that state. This is a polish item, not a correctness gap — the issuance
  path is now correct without it.
- **Verification status.** Type-correct and deployed. End-to-end proof needs
  a browser-issued Supabase session for an account in the verified-no-card
  state (the `/dextercard` routes are Supabase-auth-only — an MCP admin JWT
  cannot drive them). Same class of manual walkthrough as the funded-campaign
  test; the logic itself no longer depends on a capture.

---

### P2 — polish, worth doing

**P2-a. Add PYUSD to the stablecoin allowlist (if on-chain demand exists).**
- **What:** S4 weakness 2. OpenDexter is USDC-only; Pay.sh advertises five
  Solana stablecoins. The allowlist is env-driven (`ALLOWED_ASSETS` /
  `ALLOWED_ASSETS_BY_NETWORK`) — so adding PYUSD is *config*, not code.
- **Why:** PYUSD carries PayPal's distribution. Cheap optionality.
- **Effort:** **S** — an env var + a facilitator allowlist check. **Gated on
  one question:** do PYUSD-priced x402 endpoints actually exist on Solana
  yet? Confirm on-chain first; if even a handful exist, add it.
- **Surface:** facilitator env config (`dexter-facilitator`), not the plugin.

**P2-b. Dead `headers` plumbing in `x402Fetch`.**
- **What:** S3 P2-1. `x402Fetch()` accepts and applies a `params.headers`,
  but `registerFetchTool`'s Zod schema has no `headers` field and `runFetch`
  never passes it — so it's permanently `undefined` through the tool.
- **Why:** not a bug (empty-object spread is harmless), just dead weight that
  misleads the next reader into thinking custom headers work.
- **Effort:** **S.** Decide: drop `headers` from the `x402Fetch` signature +
  body, OR (if custom headers are genuinely wanted) add it to the Zod schema
  and thread it through `runFetch`. Don't leave it half-wired.
- **Surface:** `packages/x402-mcp-tools/src/tools/fetch.ts`.

**P2-c. Anti-slop pass on the `opendexter` + `x402-protocol` skills.**
- **What:** S2 P2. 6/6 skills fail the `dexter-anti-slop-prose` grep gate,
  but only two are worth fixing — `opendexter` (27 hits) and `x402-protocol`
  (9). The other four are 1-2 em-dashes in a reference doc; S2 deliberately
  left them, and the user agreed that was the right call.
- **Why:** `opendexter` is the flagship skill and its em-dash density reads
  machine-written. The genuine opening-line slop was already fixed in S2;
  this is the remaining density cleanup.
- **Effort:** **S-M.** Rewrite prose in the two skills to pass the gate.
  Don't over-correct — S2's reasoning (a SKILL.md is a reference doc, not
  marketing copy) still holds; fix genuine slop, not every em-dash.
- **Surface:** `opendexter-plugin/skills/{opendexter,x402-protocol}`.

**P2-d. Add a unit test for `evaluatePaymentRequirements`.**
- **What:** S3 test-coverage gap. The single most important money-safety
  function — the spend-cap + balance filter in `x402Fetch` — has zero unit
  tests. It's pure and trivially testable with a fake `WalletAdapter`.
- **Why:** the thing most deserving of a test has none. Not a bug, but a
  gap that should not persist on a money path.
- **Effort:** **S.** Three cases: rejects price > cap, rejects balance <
  price, picks the funded chain.
- **Surface:** `packages/mcp/test/mcp.test.ts` (or a new test in
  `x402-mcp-tools`).

---

### P3 — nice-to-have, low harm

**P3-a. `--all` install false-positives on leftover client dirs.**
- S1 P2-2. `detectInstalledClients` checks for `~/.cursor`, `~/.claude`, etc.
  by directory existence — leftover dirs from uninstalled clients trigger a
  no-op "install." Low harm (a config file nobody reads). **Effort: S** —
  check for the client binary or a real config file, not just the dir.
  **Surface:** `packages/mcp/src/cli/install/index.ts`.

**P3-b. Cursor double MCP-write — needs a live check.**
- S1 P2-3. The Cursor install writes the server in two places
  (`~/.cursor/plugins/opendexter/mcp.json` and `~/.cursor/mcp.json`). Whether
  Cursor double-loads is unconfirmed. **Effort: S** to verify against a real
  Cursor; drop the global write if the plugin's `mcp.json` suffices.
  **Surface:** `packages/mcp/src/cli/install/`.

**P3-c. Stale `ARCHITECTURE.md` ASCII diagram.**
- S1. The diagram still shows the old `dexter-x402` duplicate-server state.
  Internal doc, deliberately illustrated the now-fixed bug. **Effort: S** —
  a proper section rewrite, not a find-replace. Internal-only, lowest
  priority. **Surface:** `ARCHITECTURE.md`.

---

## Suggested execution order for the fix phase

The carried code-fix list is **done** — P1-a, P1-b, P1-c, P2-b, P2-c, P2-d
are all fixed, built, and (for the deployed surfaces) live. The fix-phase
sweep ran in this order:

1. **P1-a** (`SERVER_INSTRUCTIONS` SOP rewrite) — DONE. `@dexterai/mcp-
   instructions@2.0.0` published; hosted server redeployed + verified.
2. **P2-b, P2-d, P2-c** — DONE. `headers` plumbing wired, payment-gate unit
   tests added (suite 27/27), all six skills pass the anti-slop gate.
3. **P1-b** (SDK-skill 3.x diff) — DONE. Five real 3.x mismatches fixed;
   `x402-react` and `x402-debugging` verified accurate.
4. **P1-c** (card `not_issued`) — DONE via the `cardCreate`-as-probe approach
   (see the P1-c entry above); the original "wire capture" blocker was not
   actually required. Deployed in `dexter-api`. End-to-end browser proof on
   a verified-no-card account remains, like other manual walkthroughs.
5. **P2-a** (PYUSD) — still pending the on-chain demand check; a facilitator
   config change, a separate track from the plugin fixes.
6. **P3-a/b/c** — opportunistic; P3-b needs a live Cursor, P3-c is internal.

**The single highest-ROI move is NOT on this code-fix list, by design.**
Per `04-competitive.md` (revised §1.5 + Weakness 3), OpenDexter's real moat
is the **skills synthesis pipeline** — it automatically turns every crawled
endpoint into a verified, drop-in agent tool — and its real weakness is that
**nobody has seen it work** (the proof gap). The fix is a *demonstration*,
not code: an honest side-by-side — same task, "make an agent call and pay
for an x402 API it has never seen," one column hand-wiring an integration,
the other pasting an OpenDexter-synthesized tool definition and completing a
real paid call — plus a cold-start demo (an endpoint nobody manually added,
already a verified OpenDexter skill). This is a **separate workstream**:
spec the demo (real endpoints from the live catalog, script, recording
setup), then cut the video. It belongs with whoever owns OpenDexter's
external proof/marketing, not the code-fix queue — but it is the single
most valuable outcome of this review, so it is recorded here explicitly.
`SERVER_INSTRUCTIONS` (P1-a) is the agent-facing slice of the same "make the
moat visible" goal; the demo is the human-facing slice.

---

## Out of scope for the fix phase (recorded, not actioned)

- **MPP support.** S4 weakness 1. Real protocol work; the Coinbase ecosystem
  (the dominant x402 force) lacks it too, so it's not an urgent gap. **Track
  the MPP-only-endpoint share** of newly-crawled resources as a metric; if it
  crosses ~15-20%, MPP graduates from hedge to requirement. Decision, not a
  task.
- **Dextercard spend-policy depth vs Payman.** S4 §5. Dextercard is
  MCP-native (a real edge) but behind Payman's role-based multi-tier approval
  engine. A flag for the Dextercard roadmap owner — Dextercard is a sibling
  product, out of scope for this plugin review.

---

## Final tally

| Severity | Count | State |
|---|---|---|
| P0 | 0 | — |
| P1 | 3 | **all 3 fixed** — P1-a/b/c done, built, deployed |
| P2 | 4 | **P2-b/c/d fixed**; P2-a still gated on an on-chain check |
| P3 | 3 | low priority; P3-b needs a live Cursor |
| Already fixed in-session | 11 | committed |

The fix phase is complete bar **P2-a** (PYUSD, gated on an on-chain demand
check) and the **P3** polish items. Every P1 — including P1-c, which the
original draft called blocked — is resolved. P1-c's only residual is an
end-to-end browser walkthrough on a verified-no-card account; the fix logic
itself is deterministic and shipped.

The review is complete. OpenDexter needed sharpening, not saving. The fix
phase is one focused session for P1-a + the P2s, a second block for P1-b,
and P1-c whenever the wire capture lands.
