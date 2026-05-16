# OpenDexter Review — Progress / Resume Doc

**Purpose:** read this first after a compact. It is the live state of the
OpenDexter plugin review. The full plan is in `../REVIEW-PLAN.md`; per-session
findings are in `01-onboarding.md`, `02-skills-tools.md`, etc.

**Last updated:** 2026-05-16 (Session 3 audit complete)

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
| 3 — Technical / code audit | **DONE — audited, P2s fixed, 2 items carried** |
| 4 — Competitive comparison | **NOT STARTED — this is next** |
| 5 — Synthesis & prioritized fix list | not started |

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

## NEXT: Session 4 — Competitive comparison

Goal (from REVIEW-PLAN.md): how does OpenDexter stack up against the other
x402 discovery/payment tools? Use the competitive intel already gathered:
`dexter-api/docs/competitive-intel/INTERFACE_COMPARISON_2026-05-15.md`.
Competitive set: x402 Bazaar, Agentic.market, Agentcash, Pay.sh. Recon
already found OpenDexter's edges (hosted MCP, ~2,000 catalog, multi-chain)
and weaknesses (no MPP support, USDC-only). Write `review/04-competitive.md`.

---

## Reference

- Plan: `../REVIEW-PLAN.md`
- Competitive intel already done: `dexter-api/docs/competitive-intel/
  INTERFACE_COMPARISON_2026-05-15.md` (use in Session 4).
- The recon found OpenDexter's edges (hosted MCP, ~2,000 catalog, multi-chain)
  and weaknesses (no MPP support, USDC-only) — detail in REVIEW-PLAN.md.
