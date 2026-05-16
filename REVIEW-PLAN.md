# OpenDexter Plugin — Review Plan

**Created:** 2026-05-16
**Mode:** audit-first. Every session below produces findings; no code changes
until findings for that session are reviewed and approved.
**Scope:** all four distribution surfaces + competitive comparison.
**Persona for UX judgments:** a naive ~30yo semi-technical crypto user — can
read code, has a wallet, is not an x402 expert.

---

## The thing under review

`@dexterai/opendexter` v1.12.0 — an MCP server + Claude Code / Cursor plugin
that lets coding agents discover and pay for x402 APIs in USDC.

Four surfaces:
1. **CC plugin** — `opendexter-plugin/` (symlinks to `packages/mcp/`):
   6 skills, 2 rules, 1 agent, 3 commands.
2. **MCP server** — `packages/mcp/`: 13 tools (x402_* + card_*), hosted at
   `open.dexter.cash/mcp` AND local via `npx @dexterai/opendexter`.
3. **npm package** — `@dexterai/opendexter`: MCP server + CLI installer for
   6 clients (Cursor, Claude Code, Codex, VS Code, Windsurf, Gemini CLI).
4. **Cursor** — `.cursor-plugin/`, installed via `install --client cursor`.

The 6 skills: `opendexter`, `x402-client`, `x402-server`, `x402-react`,
`x402-protocol`, `x402-debugging`.

---

## Competitive set (for the comparison sessions)

**Direct competitors — x402 tooling (same protocol, same job):**
- **x402 Bazaar** (Coinbase CDP) — hosted MCP, Base-centric.
- **Agentic.market** (Coinbase) — catalog API, auto-indexed.
- **Agentcash** (Merit Systems) — npm CLI + local MCP; ships MPP support.
- **Pay.sh** (Solana Foundation × Google Cloud) — Rust CLI + MCP; Solana-only,
  5 stablecoins, OS-keystore custody.
- **x402 Discovery MCP** (rplryan) — hobby-scale, note for completeness only.

**Alternative rails (protocols, not products — separate comparison band):**
- **x402** — the rail OpenDexter speaks (x402 Foundation: Coinbase + Cloudflare).
- **Google AP2** — card-network-oriented; spec + reference only, no shipped product.
- **MPP** (Stripe + Tempo, paymentauth.org) — the real rival rail; Agentcash
  and Pay.sh support it, OpenDexter does not (flagged weakness).

**Dextercard analogs (agent spend controls — separate row):**
- **Payman** — budgets/approvals/payee allowlists.
- **Skyfire** — KYAPay identity + prefunded tokens.

**Primary internal reference:** `dexter-api/docs/competitive-intel/
INTERFACE_COMPARISON_2026-05-15.md` — code-grounded audit of Agentcash,
Pay.sh, Agentic.market (surface matrices, custody, stablecoins, tool-by-tool).
The comparison sessions extend this, not redo it.

---

## Session breakdown

Each session is self-contained and ends with a written findings doc in
`review/` (created as needed). Sessions are ordered so earlier findings
inform later ones, but each can run independently.

### Session 1 — Install & onboarding (highest leverage)
**Question:** a naive-crypto-user installs OpenDexter and tries to make one
paid API call. Where do they get stuck?
- Walk the install path for each client the installer claims to support
  (Cursor, Claude Code, Codex, VS Code, Windsurf, Gemini CLI) — does each
  actually work, or are some aspirational?
- Hosted MCP (`open.dexter.cash/mcp`) vs local `npx` — is the choice clear?
  When does a user need which?
- First paid call: wallet creation → funding → `x402_search` → `x402_fetch`.
  Where is the friction? Is the "you need USDC" moment handled gracefully?
- The Dextercard onboarding flow (`card_issue`: KYC → terms → reveal).
**Output:** `review/01-onboarding.md` — friction log, ranked.

### Session 2 — The 6 skills + 13 tools
**Question:** are the skills and tool descriptions accurate to shipped 1.12.0
code, well-written, and anti-slop clean?
- Each skill: does it match what the code actually does? (The CHANGELOG says
  skills were "rewritten from shipped 1.12.0 code" — verify that held.)
- Each MCP tool description: accurate? An agent reads these to decide what to
  call — wrong descriptions = wrong tool use.
- Run the `dexter-anti-slop-prose` grep gate on every skill + the README.
- Do the tools behave as described? (Spot-check against the test suite at
  `packages/mcp/test/mcp.test.ts`.)
**Output:** `review/02-skills-tools.md` — per-skill, per-tool findings.

### Session 3 — Technical / code audit
**Question:** is the MCP server + packages correct, safe, and clean?
- The x402 payment flow: `x402_fetch` — balance checks, settlement, error
  handling, the per-call spend cap (`x402_settings`).
- Wallet custody: file-backed `~/.dexterai-mcp/wallet.json` vs hosted session.
  Key handling, corruption detection (the test suite covers some — verify).
- Card tools: the OTP login flow (`card_login_*`), KYC, PAN/CVV reveal path.
- Dead code, error-handling gaps, security (key exposure, injection).
- The `http` transport is "not yet implemented" — is that a real gap?
**Output:** `review/03-technical.md` — findings by severity.

### Session 4 — Competitive comparison
**Question:** how does OpenDexter actually stack up, surface by surface?
- Build the comparison matrix: OpenDexter vs Bazaar / Agentic.market /
  Agentcash / Pay.sh — on catalog size, chains, custody, install friction,
  hosted-vs-local, tool surface.
- The two known weaknesses: no MPP support, USDC-only. Quantify the cost —
  what does "closed out of Stripe-routed endpoints" actually lose us?
- Protocols band: where x402 / MPP / AP2 sit, and what OpenDexter's position
  should be (speak more rails? stay x402-pure?).
- Dextercard vs Payman / Skyfire.
- Honest verdict: where OpenDexter wins, where it's behind, what's the
  highest-ROI move to pull ahead.
**Output:** `review/04-competitive.md` — matrix + verdict + recommendations.

### Session 5 — Synthesis & prioritized fix list
**Question:** given everything, what do we actually do?
- Consolidate sessions 1-4 into one prioritized list: P0 (broken / embarrassing),
  P1 (real friction), P2 (polish), P3 (nice-to-have).
- Each item: what, why, rough effort, which surface.
- This is the doc that drives the *fix* sessions (separate from this review).
**Output:** `review/05-synthesis.md` — the action plan.

---

## Notes

- Sessions 1-3 can run in any order; 4 benefits from 1-3 being done; 5 needs all.
- "Audit-first" means: within each session, no edits to plugin code until the
  session's findings are reviewed. The fix work is a separate phase after
  Session 5.
- If a session uncovers something P0-broken (e.g. an installer that doesn't
  work at all), flag it immediately rather than waiting for Session 5.
