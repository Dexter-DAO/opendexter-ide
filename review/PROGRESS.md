# OpenDexter Review — Progress / Resume Doc

**Purpose:** read this first after a compact. It is the live state of the
OpenDexter plugin review. The full plan is in `../REVIEW-PLAN.md`; per-session
findings are in `01-onboarding.md`, `02-skills-tools.md`, etc.

**Last updated:** 2026-05-16 (ALL 5 SESSIONS COMPLETE — review done)

---

## Where we are

5-session audit-first review of the OpenDexter plugin (`@dexterai/opendexter`
v1.12.0). Repo: `~/websites/opendexter-ide`. Working style: audit a session,
write findings, fix the quick P1s in the same session, commit. Bigger items
get carried to the synthesis (Session 5).

| Session | State |
|---|---|
| 1 — Install & onboarding | **DONE + fixed + committed** |
| 2 — Skills & tools | **DONE + fixed + committed** |
| 3 — Technical / code audit | **DONE — audited, P2s fixed, P1-2(a) done** |
| 4 — Competitive comparison | **DONE — 04-competitive.md written** |
| 5 — Synthesis & prioritized fix list | **DONE — 05-synthesis.md written** |

**The review is complete.** The prioritized fix list lives in
`05-synthesis.md` — that is the doc that drives the separate fix phase.
11 findings already fixed in-session + committed; 10 carried (0 P0, 3 P1,
4 P2, 3 P3). Read `05-synthesis.md` first when starting fix work.

All work is committed to `opendexter-ide` `main`. **Nothing pushed yet** —
push at a natural break or when the user asks.

---

## Session 1 — DONE. What was fixed

4 P1 install/onboarding fixes (all verified, committed):
- **P1-1** server name unified to `opendexter` everywhere (installer wrote
  `dexter-x402`, README said `opendexter` → installing both ways gave a
  duplicate server). 8 files.
- **P1-2** Codex install now prints the exact `[mcp_servers.opendexter]`
  TOML block instead of "configure it yourself."
- **P1-3** README + `clients.ts` clarified: Claude Code uses the plugin, not
  a hand-added server; dead `claude-code` branch marked.
- **P1-4** README Install now leads with the hosted MCP
  (`https://open.dexter.cash/mcp`, verified live). New "Fund your wallet"
  section.

Still open from S1 (low priority, in `01-onboarding.md`): `--all`
false-positives on leftover dirs; Cursor double-MCP-write needs a live
Cursor check; `ARCHITECTURE.md` ASCII diagram is stale.

## Session 2 — DONE. What was fixed

3 P1 accuracy bugs (all fixed, committed):
- **P1-1** `opendexter` skill's `x402_fetch` param table fixed — dropped a
  `headers` param that does not exist, added the real `maxAmountUsdc` and
  `multipart`.
- **P1-2** `card_login_start` description referenced stage
  `no_dextercard_session`; `card_status` returns `no_session`. Fixed.
- **P1-3** `opendexter` skill had `card_login_request_otp` and
  `card_login_start` described backwards. Fixed.

Deliberately NOT fixed (reasoned, in `02-skills-tools.md`): the anti-slop
em-dash count on the skills. The grep gate targets marketing copy; a SKILL.md
is a reference doc. Only the genuine opening-line punchline slop was fixed.
The user explicitly agreed this is the right call.

**P1-4 from Session 2 — CARRIED FORWARD, the biggest open item:** the
`@dexterai/x402` dep is `^2.0.0`; published latest is `3.2.1` (a major
behind). The 5 SDK skills (`x402-client`, `x402-server`, `x402-react`,
`x402-protocol`, `x402-debugging`) may teach a stale API. Needs its own pass:
bump the dep to `^3.2.1`, then diff the 3.x API against every code example in
those 5 skills. Do this as part of Session 3 or as a dedicated pass.

---

## Session 3 — DONE. What was found + fixed

Full findings in `03-technical.md`. The runtime is **money-safe and
well-architected** — real spend cap (live-reloadable, $5 default), real
balance check before paying, `0o600`/`0o700` file perms, non-destructive
corrupted-wallet handling (backs up to `.bak`), keys never cross the tool
boundary. **No P0.**

**Fixed in-session (committed, both packages typecheck green):**
- **P2-2** `card-login.ts` file header rewrote to document all three login
  tools — `card_login_request_otp` (preferred, zero-tab) was missing.
- **P2-3** `http` removed from the `--transport` CLI `choices` (it just
  exited 1); `ServerOptions.transport` tightened to `"stdio"`, dead exit
  branch removed.

**Carried — two items, both real, neither silent:**
- **P1-1** `card_status` + `card_issue detectStage` cannot represent
  "onboarding finished, card not yet created" — both collapse it into
  `pending_finalize`, so a finished user is told to finalize again.
  CANNOT be fixed surgically: `@dexterai/dextercard@0.5.0`'s
  `CardOnboardingCheckResponse` has no `finalized` field. Needs a wire
  capture of the post-finish `cardOnboardingCheck()` response (its
  `[key: string]: unknown` shape may already carry a distinguishing field),
  OR use the idempotent finish call as the probe. → Session 5.
- **P1-2 part (a) — DONE.** `@dexterai/x402` bumped `^2.0.0` → `^3.2.1` in
  both `packages/mcp` + `packages/x402-mcp-tools`; reinstalled (resolves
  3.2.1), both typecheck clean, full mcp unit suite green (22 pass / 1
  network test skipped / 0 fail). Also fixed a long-dead SIWX test that had
  been broken since commit `6f71e5e` (wrong import path) — surfaced by the
  bump, not caused by it. **Part (b)** — diff the 3.x SDK API against the 5
  SDK skills' code examples — is the real remaining work, unchanged from
  Session 2's P1-4. → its own pass / Session 5.

---

## Session 4 — DONE. What it found

Full analysis in `04-competitive.md`. Key correction made mid-session:
**"x402 Bazaar" is not a competitor product** — it is an x402 facilitator
*discovery extension* (published as `@x402/extensions/bazaar`). Code-verified:
Dexter's own facilitator implements it (`registerExtension({ key: "bazaar" })`)
and OpenDexter's `bazaarCrawler` crawls every facilitator's Bazaar (Coinbase,
PayAI, Ultraviolet, ZAUTH). So OpenDexter's corpus is a structural *superset*
of any single facilitator's catalog.

- **Real competitor products:** Agentcash + Pay.sh (shipped, code-audited).
  Coinbase's presence = a facilitator + the Agentic.market UI, not a packaged
  rival tool.
- **OpenDexter's two structural wins** (both true by construction, both
  under-sold): crawls *every* facilitator's Bazaar; *curates* (quality score
  + gaming detection + human gate) where others just list.
- **Two weaknesses:** no MPP (Agentcash/Pay.sh have it; Coinbase ecosystem
  also x402-only — track MPP-only-endpoint share, decide later); USDC-only
  (cheap env-allowlist fix — add PYUSD if on-chain demand exists).
- **Carry to Session 5 as P1:** rewrite `SERVER_INSTRUCTIONS`
  (`@dexterai/mcp-instructions`) to a prescriptive SOP shape — Pay.sh is the
  benchmark; OpenDexter's is descriptive-only. Cheap, prose, real agent-UX win.

---

## Session 5 — DONE. The review is complete.

`05-synthesis.md` is the prioritized fix list — read it first before any fix
work. Final tally: **0 P0, 3 P1, 4 P2, 3 P3** carried; 11 findings already
fixed in-session.

The carried P1s:
- **P1-a** rewrite `SERVER_INSTRUCTIONS` to a prescriptive SOP shape (highest
  leverage, ready, effort M).
- **P1-b** diff the 5 SDK skills against `@dexterai/x402@3.2.x` (the real
  remaining SDK work, ready, effort M-L).
- **P1-c** the card `not_issued` state-machine gap — **blocked**: needs a
  wire capture of a post-finish `cardOnboardingCheck()` response before it
  can be fixed correctly. Do not ship a guess on a KYC path.

Plus the non-code highest-ROI item: make the **curation + superset** story
legible across every surface (positioning, not a code fix — P1-a is its
agent-facing slice).

---

## NEXT: the fix phase (separate from this review)

The review is done. The next phase executes `05-synthesis.md`. Suggested
sweep (detail in that doc): P1-a first → P2-b/c/d together → P1-b as its own
block → P1-c once the wire capture lands → P2-a after the on-chain PYUSD
check → P3s opportunistically. Out of scope and recorded only: MPP support
(track as a metric), Dextercard spend-policy depth (Dextercard roadmap).

---

## Reference

- Plan: `../REVIEW-PLAN.md`
- Findings docs: `01-onboarding.md`, `02-skills-tools.md`, `03-technical.md`,
  `04-competitive.md` — and `05-synthesis.md`, the consolidated fix list.
- Competitive intel base: `dexter-api/docs/competitive-intel/
  INTERFACE_COMPARISON_2026-05-15.md`.
