# Session 2 — Skills & Tools Audit

**Date:** 2026-05-16
**Surface:** the 6 skills + 13 MCP tool definitions
**Method:** full read of all 6 SKILL.md files; tool definitions extracted from
`compose.ts` / `compose-cards.ts` / `server/index.ts`; anti-slop grep gate on
every skill; SDK version cross-check.

The thing that matters here: agents *act on* these descriptions. A wrong tool
parameter or a wrong stage name doesn't read badly — it makes the agent do the
wrong thing. So accuracy bugs rank above prose bugs.

---

## Findings, ranked

### P0 — none

### P1 — accuracy bugs (agent will misbehave)

**P1-1. The `opendexter` skill documents `x402_fetch` with parameters that
do not exist, and omits ones that do.**
- The skill's `x402_fetch` table (flagship skill, the most-read one) lists:
  `url`, `method`, `body` (typed "any"), `headers` (object).
- The tool's ACTUAL schema: `url`, `method`, `body` (string), `maxAmountUsdc`
  (number), `multipart` (object).
- So the skill: (a) tells the agent it can pass `headers` — it cannot, there
  is no such param; (b) types `body` as "any" when it is a string; (c) never
  mentions `maxAmountUsdc` (the per-call spend-cap override) or `multipart`
  (file uploads). An agent that needs to upload a file, or cap a single call,
  has no idea those exist.
- **Fix:** rewrite the table to match the real schema — drop `headers`, fix
  `body` to string, add `maxAmountUsdc` and `multipart`.

**P1-2. `card_login_start`'s description waits for a stage that never exists.**
- `card_login_start` description says: "Use this tool ONLY when card_status
  returns `no_dextercard_session`."
- `card_status` never returns `no_dextercard_session`. Its actual stages are:
  `no_session`, `onboarding_required`, `pending_kyc`, `pending_finalize`,
  `not_issued`, `active`, `frozen`.
- An agent following the instruction literally waits for `no_dextercard_
  session` and never fires `card_login_start`.
- **Fix:** change the description to `no_session`.

**P1-3. The `opendexter` skill mis-describes `card_login_request_otp`.**
- The skill (line 165) says `card_login_request_otp` "returns a MoonPay URL
  the user opens in a browser to solve a captcha."
- That is `card_login_start`'s behavior. `card_login_request_otp`'s actual
  job (per its own tool description) is the OPPOSITE: it solves the captcha
  server-side and sends the OTP email directly — *no browser tab*. It is the
  zero-friction path; `card_login_start` is the fallback.
- The skill conflates the two tools, describing the no-captcha tool as if it
  were the captcha tool. An agent reads this and tells the user to go open a
  browser when they didn't need to.
- **Fix:** correct the skill — `card_login_request_otp` = server-side captcha
  solve + OTP email, no browser; `card_login_start` = MoonPay URL fallback.

**P1-4. SDK version skew — skills teach against a possibly-stale SDK major.**
- `packages/mcp` depends on `@dexterai/x402 ^2.0.0`. Published latest is
  **3.2.1** — a major version ahead.
- The SDK skills (`x402-client`, `x402-server`, `x402-react`, `x402-protocol`,
  `x402-debugging`) teach SDK usage. If they were written against the 2.x API
  and the 3.0 major changed any signatures (`wrapFetch`, `createX402Client`,
  `x402Middleware`, the React hooks), the skills now teach broken code.
- This needs a real verification pass: install `@dexterai/x402@3.2.1`, diff
  its API against every code example in the 5 SDK skills.
- **NOTE:** "x402 v2" in the skills is the *protocol* version, which is
  legitimately current. The skew is the *npm package* version (2.x vs 3.x).
  Those are different things — but the skill examples import from the npm
  package, so the package major is what can break them.
- **Fix:** (a) bump the `@dexterai/x402` dep to ^3.2.1, (b) verify/repair
  every SDK-skill code example against the 3.x API. This is the biggest
  single item in Session 2 and may warrant its own pass.

### P2 — prose quality (anti-slop)

Every skill fails the `dexter-anti-slop-prose` grep gate. Severity is lower
than the P1s — an em-dash doesn't break an agent — but `opendexter` is bad
enough to look unpolished.

| Skill | Hits | Detail |
|---|---|---|
| `opendexter` | 27 | 25 em-dashes + 2 noun-phrase punchlines ("One MCP server, one wallet, eight chains.") |
| `x402-protocol` | 9 | em-dashes |
| `x402-client` | 5 | em-dashes |
| `x402-debugging` | 2 | em-dashes |
| `x402-server` | 1 | em-dash |
| `x402-react` | 1 | em-dash |

- **Caveat — judgment call:** the anti-slop skill targets *externally-shipping
  marketing prose*. A SKILL.md is a reference doc the agent reads, not a
  tweet. Em-dashes in a tool-reference table are a far smaller sin than in a
  landing page. The skill's own "what is NOT slop" section exempts direct
  technical terms and meaningful lists. So: `x402-server`, `x402-react`,
  `x402-debugging` (1-2 hits) are effectively fine — leave them.
- **Worth fixing:** `opendexter` (27) and `x402-protocol` (9). The two
  noun-phrase punchlines in `opendexter` are genuine slop; the em-dash
  density there is high enough to read as machine-written.
- **Fix:** rewrite `opendexter` and `x402-protocol` prose to pass the gate.
  Skip the other four — not worth the churn.

### Good — things that are accurate and well-built

- **`x402-debugging`** is the strongest skill — accurate error-code tables
  (facilitator / EVM / Solana / SDK `X402Error` codes), real curl examples,
  a clean diagnosis checklist. Don't touch it beyond the trivial em-dashes.
- **`x402_pay` is a true alias** of `x402_fetch` (same handler `runFetch`
  bound to both names) — and both the tool description and the `opendexter`
  skill describe it correctly as an alias. Good.
- The `opendexter` skill's **hosted-vs-local detection rule** ("if
  `x402_settings` is in the tool list you're on local npx") is accurate and
  genuinely useful — it matches how the npm-only tools are gated.
- The `x402_check` vs `x402_fetch` chain-count difference (8 vs 6) is
  CORRECT, not a bug: `x402_check` lists all facilitator-settled chains
  (incl. BSC, SKALE), `x402_fetch` lists wallet-funding chains. The tool
  descriptions get this right. (Could be stated more explicitly, but it is
  not wrong.)
- The MCP server `instructions` string is accurate and well-ordered.

---

## Summary for the synthesis doc

The skills are **mostly accurate, with four real accuracy bugs** that will
make an agent misbehave:

- **P1-1** flagship skill documents non-existent `x402_fetch` params
  (`headers`) and omits real ones (`maxAmountUsdc`, `multipart`).
- **P1-2** `card_login_start` waits for stage `no_dextercard_session` —
  `card_status` returns `no_session`. One-word fix, but it dead-ends the tool.
- **P1-3** the `opendexter` skill describes `card_login_request_otp` as the
  browser-captcha tool when it is the no-captcha tool — exactly backwards.
- **P1-4** the `@dexterai/x402` dep is a full major behind (2.x vs published
  3.2.1); the 5 SDK skills may teach a stale API. Needs a verification pass.

Prose: 6/6 fail anti-slop, but only `opendexter` (27) and `x402-protocol` (9)
are worth fixing — the rest are 1-2 em-dashes in a reference doc, leave them.

**Effort:** P1-1/P1-2/P1-3 are quick, surgical edits. P1-4 is the real work —
an SDK-version verification pass, possibly its own session.

---

## FIXED — 2026-05-16 (same session)

- **P1-1 — DONE.** The `opendexter` skill's `x402_fetch` param table now
  matches the real schema: dropped the non-existent `headers`, fixed `body`
  to `string`, added `maxAmountUsdc` and `multipart`.
- **P1-2 — DONE.** `card_login_start`'s description in `card-login.ts` now
  references stage `no_session` (what `card_status` actually returns), not
  `no_dextercard_session` (which is a `RedeemResponse` status from a
  different state machine — the OAuth redeem flow — so the original was
  pointing the agent at the wrong machine entirely). MCP package builds green.
- **P1-3 — DONE.** The `opendexter` skill's `card_login_*` section rewritten:
  `card_login_request_otp` is now correctly described as the server-side
  captcha-solve / no-browser path, with `card_login_start` (MoonPay URL) as
  the documented fallback. The previous text had them backwards.

### Deliberately NOT fixed — P2 prose

The anti-slop em-dash count was **not** driven to zero, and this is a
considered decision, not an omission:

- The `dexter-anti-slop-prose` grep gate is calibrated for externally-shipping
  marketing copy (tweets, landing pages, decks). A SKILL.md is a 300-line
  agent-facing reference doc — tables, bullets, terse technical instructions.
- The genuine slop (the opening-line period-noun-phrase punchline "One MCP
  server, one wallet, eight chains." + adjective inflation "drive a real
  Dextercard") **was fixed** — line 8 rewritten.
- The remaining ~26 em-dashes are spread thin across 300 lines of reference
  content. The grep's "noun-phrase punchline" check also false-positives on
  valid terse imperatives ("Then retry.", "Do not assume state."). Rewriting
  those to dodge a regex makes the doc *worse*, not better.
- The anti-slop skill's own "do not over-correct" guidance applies. Decision:
  the opening-line slop is fixed; the doc is not mangled to satisfy a gate
  built for a different kind of text. Same call for `x402-protocol`.

### P1-4 — still open (the real remaining work)

The `@dexterai/x402` dependency is `^2.0.0`; published latest is `3.2.1` (a
major behind). The 5 SDK skills may teach a stale API. Not fixed — this needs
its own verification pass: bump to `^3.2.1`, then diff the 3.x API against
every code example in `x402-client`, `x402-server`, `x402-react`,
`x402-protocol`, `x402-debugging`. Carried into the synthesis as the largest
single OpenDexter item.
