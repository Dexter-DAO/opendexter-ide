# OpenDexter Review — Progress / Resume Doc

**Purpose:** read this first after a compact. It is the live state of the
OpenDexter plugin review. The full plan is in `../REVIEW-PLAN.md`; per-session
findings are in `01-onboarding.md`, `02-skills-tools.md`, etc.

**Last updated:** 2026-05-16 (Sessions 3 & 4 complete)

---

## Where we are

5-session audit-first review of the OpenDexter plugin (`@dexterai/opendexter`
v1.12.0). Repo: `~/websites/opendexter-ide`. Working style: audit a session,
write findings, fix the quick P1s in the same session, commit. Bigger items
get carried to the synthesis (Session 5).

| Session | State |
|---|---|
| 1 — Install & onboarding | **DONE + fixed + committed** (commit on `main`) |
| 2 — Skills & tools | **DONE + fixed + committed** (commit on `main`) |
| 3 — Technical / code audit | **DONE — audited, P2s fixed, P1-2(a) done, 1 carried** |
| 4 — Competitive comparison | **DONE — 04-competitive.md written** |
| 5 — Synthesis & prioritized fix list | **NOT STARTED — this is next** |

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

## NEXT: Session 5 — Synthesis & prioritized fix list

Goal (from REVIEW-PLAN.md): consolidate Sessions 1-4 into one prioritized
action list — P0/P1/P2/P3, each with what/why/effort/which-surface. This is
the doc that drives the separate *fix* phase. Write `review/05-synthesis.md`.

Inputs to fold in: the carried items across all four findings docs —
- S1: `--all` false-positives, Cursor double-MCP-write live check, stale
  `ARCHITECTURE.md` diagram.
- S2: P2 prose (only `opendexter` + `x402-protocol` skills worth it).
- S3: **P1-1** card stage `not_issued` gap (needs a wire capture first);
  **P1-2(b)** the SDK-skill 3.x accuracy diff (the real remaining SDK work);
  P2-1 dead `headers` plumbing in `x402Fetch`.
- S4: rewrite `SERVER_INSTRUCTIONS` to SOP shape; add PYUSD to allowlist if
  demand exists; the curation/superset legibility framing.

---

## Reference

- Plan: `../REVIEW-PLAN.md`
- Competitive intel already done: `dexter-api/docs/competitive-intel/
  INTERFACE_COMPARISON_2026-05-15.md` (use in Session 4).
- The recon found OpenDexter's edges (hosted MCP, ~2,000 catalog, multi-chain)
  and weaknesses (no MPP support, USDC-only) — detail in REVIEW-PLAN.md.
