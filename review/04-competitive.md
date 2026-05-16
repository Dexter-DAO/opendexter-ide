# Session 4 — Competitive Comparison

**Date:** 2026-05-16
**Question:** how does OpenDexter actually stack up, surface by surface —
and what is the highest-ROI move to pull ahead?
**Method:** extends the code-grounded intel audit
(`dexter-api/docs/competitive-intel/INTERFACE_COMPARISON_2026-05-15.md`,
2026-05-15 — Agentcash, Pay.sh, Agentic.market read from source) with fresh
2026-05-16 research on the **Coinbase CDP Bazaar** discovery layer and on
**Payman / Skyfire** (the Dextercard analogs).

**A naming correction up front — what "x402 Bazaar" is and is not.**
Coinbase's docs (`docs.cdp.coinbase.com/x402/bazaar`) define it plainly:
> "Our Bazaar discovery endpoints let developers and AI agents browse and
> search for x402-enabled services **that are cataloged through the CDP
> Facilitator**."

So **the Bazaar is the discovery layer of the Coinbase CDP facilitator** —
not a standalone competitor product. It is the same `/discovery/resources`
pattern *every* x402 facilitator exposes, with Coinbase's branding and an
MCP wrapper bolted on (`search_resources`, `proxy_tool_call`). **OpenDexter
already probes it** — crawling facilitator discovery endpoints is how
facilitator-listed resources enter OpenDexter's corpus, and the CDP
facilitator's catalog is one of those inputs. Treating "the Bazaar MCP" as
a packaged rival product was an overreach; corrected below.

**The competitive set, correctly banded:**
- **Direct competitor products — x402 tooling:** Agentcash, Pay.sh. *These
  are the real head-to-heads* — shipped, code-audited, full tool +
  catalog + custody products in OpenDexter's exact lane.
- **Coinbase's x402 surface (a facilitator + a marketplace, not a packaged
  tool):** the CDP **Bazaar** discovery layer (which OpenDexter crawls) and
  **Agentic.market** (the marketplace UI on top, with CDP "Agentic Wallets"
  for funding). Compared as an *ecosystem position*, not a like-for-like
  product.
- **Dextercard analogs (agent spend control — different band):** Payman,
  Skyfire. Compared against Dextercard, not OpenDexter.

---

## 1. OpenDexter vs the Coinbase CDP Bazaar discovery layer

This is not a product-vs-product fight — it is **OpenDexter (a product)
vs. one facilitator's discovery catalog (a feature OpenDexter already
crawls)**. That distinction is the whole point of the section.

The CDP Bazaar is three access modes over **one catalog — the resources
the CDP facilitator itself has cataloged**:
1. HTTP paginated — `/v2/x402/discovery/resources`
2. HTTP semantic search — `/v2/x402/discovery/search`
3. MCP — `/v2/x402/discovery/mcp` (tools `search_resources`,
   `proxy_tool_call`)

Coinbase has added semantic search + structured filters + quality-based
ranking to it — so it is not a flat list anymore. But its scope is fixed:
**it shows what the CDP facilitator catalogs, and nothing else.**

| | OpenDexter | CDP Bazaar discovery layer |
|---|---|---|
| What it is | a discovery **product** (hosted MCP + CLI + web) | the **discovery layer of one facilitator** (CDP) |
| Catalog scope | crawls **every** facilitator (CDP's Bazaar included) + x402scan + own ingestion | only resources the **CDP facilitator** catalogs |
| Catalog size | ~2,000 curated / 48k crawled corpus | no public number; a 3rd-party "10k+" figure is **unverified**, absent from CDP docs |
| Curation | quality score + gaming detection + human-gated promotion | semantic search + filters + quality ranking over CDP's own catalog |
| Agent loop | `x402_search` → `x402_check` (probe price/schema) → `x402_fetch` | `search_resources` → `proxy_tool_call` (search → auto-pay) |
| Chains | Solana + 5 EVM L2s (+ BSC, SKALE at facilitator) | whatever the CDP facilitator settles (Base + Solana confirmed) |

**The structural point — OpenDexter is the superset.**
The CDP Bazaar is *an input to* OpenDexter, not an alternative to it.
OpenDexter crawls the CDP facilitator's discovery endpoint the same way it
crawls every other facilitator. So the CDP Bazaar's catalog is, by
construction, a **subset** of what OpenDexter sees. An agent on the CDP
Bazaar sees only CDP-cataloged resources; an agent on OpenDexter sees the
union across facilitators, scored and curated. That is not a marketing
claim — it follows directly from the crawl architecture.

**Where OpenDexter genuinely leads:**
- **Cross-facilitator coverage.** One facilitator's discovery layer can only
  show its own catalog. OpenDexter is facilitator-agnostic by design.
- **Curation depth.** CDP added quality *ranking*; OpenDexter runs quality
  *scoring + gaming detection + a human curation gate* (the 48k → 29k → 2.8k
  → 2k funnel). Ranking sorts a catalog; gating decides what enters it.
- **`x402_check` as a discrete probe step.** OpenDexter separates "see the
  price + schema" from "pay." The CDP Bazaar MCP goes `search_resources` →
  `proxy_tool_call` — search straight to auto-pay. Check-before-pay is the
  safer agent loop.
- **Dual surface** — a true hosted MCP *and* a real local CLI (see §2).

**Where Coinbase's position beats OpenDexter's — and it is real:**
- **Distribution.** The CDP Bazaar ships inside Coinbase Developer Platform.
  Every CDP developer has it without choosing it. OpenDexter must be found.
  Coinbase-surface protocol numbers being cited (165M+ tx, ~$50M volume,
  ~480K transacting agents) dwarf OpenDexter's measured settlement (99
  sellers, 8.3M settlements, ~$566k lifetime). The coverage advantage is
  real; the distribution gap is real and bigger.
- **Trust-by-brand.** "Coinbase" clears procurement and naive-user hesitation
  that "Dexter" earns call by call.

**Honest read.** Framed correctly, OpenDexter is not losing a product fight
to "x402 Bazaar" — there is no such product. OpenDexter is the broader
discovery layer; the CDP Bazaar is one facilitator's slice that OpenDexter
already absorbs. The genuine asymmetry is **distribution**: Coinbase puts
its slice in front of every CDP developer by default. OpenDexter's lever is
to make the *superset + curation* story legible — "every x402 endpoint
across every facilitator, quality-scored and gaming-checked" — because that
is true, follows from the architecture, and is the one thing a
single-facilitator discovery layer structurally cannot match.

---

## 2. Full surface matrix — the products

The competitor *products* are Agentcash and Pay.sh. The CDP Bazaar is a
facilitator discovery layer, not a product — it is left out of the
product matrix and handled as §1. (Condensed from the intel doc.)

| | Hosted MCP | Local CLI | Catalog scale | Chains | Custody | MPP |
|---|:-:|:-:|---|---|---|:-:|
| **OpenDexter** | ✅ | ✅ npx | ~2,000 approved / 48k corpus | SOL + 5 L2 | passkey-hosted *or* local file | ❌ |
| **Agentcash** | ❌ | ✅ npx | ~59 (Apr snapshot) | SOL + Base + Tempo | local file | ✅ |
| **Pay.sh** | ❌ | ✅ Rust binary | ~30 (pay-skills) | **SOL only** | OS keychain + biometric | ✅ |
| **Agentic.market** | ❌ | ❌ | "thousands" claimed | Base | delegated (CDP) | ? |

**Where the CDP Bazaar would sit if forced onto this grid:** hosted-MCP yes
(plus HTTP), no local CLI, catalog = CDP-facilitator-only, custody delegated
to CDP wallet. But it belongs in §1, not here — it is a facilitator feature,
not a packaged tool.

**"Bazaar" is a facilitator extension, not a Coinbase product** — and this
is code-verified, not asserted. Bazaar ships as a published x402 extension
package: `dexter-facilitator/src/server.ts` imports `@x402/extensions/bazaar`
and calls `facilitator.registerExtension({ key: "bazaar" })`. **Dexter's own
facilitator implements the Bazaar extension**, exposes its own
`/discovery/resources` endpoint, and auto-catalogs resources from successful
payments. So Coinbase ships *its* facilitator's Bazaar, Dexter ships *its*
facilitator's Bazaar — and OpenDexter, as a discovery product, crawls all of
them: `dexter-api/src/app.ts` runs a `startBazaarCrawler` whose own comment
reads *"discovers resources from external facilitators (Coinbase, PayAI,
Ultraviolet, ZAUTH)."* "x402 Bazaar" is not one company's catalog — it is a
discovery extension the spec encourages every facilitator to expose, and
OpenDexter has a crawler literally named after consuming all of them.

**Two structural facts from this matrix:**
1. **OpenDexter is the only product with both a hosted MCP and a real local
   CLI.** Agentcash and Pay.sh are local-only. Dual-surface is a genuine,
   defensible distinction.
2. **OpenDexter has ~17× the curated catalog of any competitor product**
   (2,000 vs Pay.sh ~30, Agentcash ~59). And because OpenDexter crawls every
   facilitator's Bazaar (not just one), its corpus is a structural superset
   of any single-facilitator catalog — claim "broadest + best-vetted," which
   is true by construction.

---

## 3. The two known weaknesses — quantified

### Weakness 1 — no MPP support

MPP (Machine Payments Protocol — Stripe + Tempo, paymentauth.org) is the
rival rail. **Agentcash ships it** (`mppx@0.5.10`, auto-detect in fetch).
**Pay.sh ships it** (first-class, equal billing with x402). **OpenDexter
does not** — and neither does the Coinbase x402 surface (it is x402-native).

What absence costs, concretely:
- Any Stripe-routed paid endpoint is **unreachable** by an OpenDexter agent.
  As Stripe pushes MPP through its merchant base, that set grows.
- It is a **per-call dead end**, not a soft degrade — an MPP-only endpoint
  returns a shape `x402_fetch` cannot settle. (Worth noting: dexter-api
  *already classifies and rejects* MPP-protocol resources at ingestion — the
  recent attribution fix added MPP-protocol rejection — so the catalog is
  honest about it. But honest-rejection is not the same as support.)
- **The gap is only vs Agentcash / Pay.sh.** The Coinbase x402 ecosystem is
  also x402-only, so MPP is not a point of differentiation against it either
  way.

**ROI read:** medium, not urgent. Adding MPP is real protocol work, and the
Coinbase ecosystem — the dominant x402 force — has not moved on it either.
Worth a tracked decision, not a fire drill. The strategic question is
whether x402 or MPP wins the rail war — if x402 (Coinbase + Cloudflare
behind it) holds, MPP support is a hedge; if MPP (Stripe distribution) pulls
ahead, it becomes mandatory.

### Weakness 2 — USDC-only

Pay.sh advertises **five** Solana stablecoins (USDC, USDT, PYUSD, CASH,
USDG). OpenDexter accepts **USDC only** — though the allowlist is
**env-driven** (`ALLOWED_ASSETS` / `ALLOWED_ASSETS_BY_NETWORK`), so this is
*configuration*, not an architectural limit.

What absence costs:
- Smaller than the MPP gap. USDC is the dominant x402 settlement asset; most
  endpoints price in it. The lost set is "endpoints that price *only* in
  PYUSD/USDG/CASH" — currently small.
- The real prize is **PYUSD** — PayPal's distribution behind it. If
  PYUSD-priced x402 endpoints reach scale, USDC-only locks OpenDexter out of
  the PayPal-adjacent merchant set.
- **Open question (from the intel doc, still open):** do PYUSD-priced x402
  endpoints actually exist on Solana *yet*? If not, this is pre-emptive.

**ROI read:** low effort, low-but-rising urgency. Adding PYUSD to the
allowlist is nearly free (it's an env var + a facilitator check). The
gating unknown is whether the demand exists. Recommend: confirm on-chain
whether PYUSD x402 endpoints exist; if even a handful do, add PYUSD — the
cost is trivial and the PayPal optionality is worth it.

---

## 4. Protocols band — where x402 / MPP / AP2 sit

| Protocol | Backers | Status | OpenDexter |
|---|---|---|---|
| **x402** | x402 Foundation (Coinbase + Cloudflare) | shipping, real volume | ✅ native |
| **MPP** | Stripe + Tempo (paymentauth.org) | shipping; Agentcash + Pay.sh support | ❌ |
| **AP2** | Google | spec + reference only, no shipped product | n/a |

**Position recommendation: stay x402-pure for now, instrument the question.**
- AP2 is not a live threat — spec only. Ignore until Google ships.
- x402 has the strongest backing (Coinbase + Cloudflare) and the most
  measured volume. Being x402-native is the right primary bet.
- MPP is the one to *watch*, not chase. The intel doc already shows
  dexter-api detecting and honestly rejecting MPP resources at ingestion —
  so OpenDexter already *knows* its MPP exposure. Turn that into a metric:
  track what % of newly-crawled endpoints are MPP-only over time. If that
  share crosses ~15-20%, MPP support graduates from hedge to requirement.
  Until then, x402-pure with a clear-eyed counter is the correct posture.

---

## 5. Dextercard vs Payman vs Skyfire (the spend-control band)

Different band — these compare to **Dextercard** (OpenDexter's virtual-
Mastercard sibling), not to OpenDexter the discovery tool.

| | Dextercard | Payman | Skyfire |
|---|---|---|---|
| What | virtual Mastercard for agents | payment rail + spend-policy control layer + wallet | KYAPay: agent-identity verification + settlement rail |
| Crypto / fiat | card rail (fiat spend, crypto-funded) | **both** — fiat rails + USDC wallet | prepaid balance, **settles in USDC** |
| Control model | card limits, freeze, per-wallet caps | daily caps, per-tx limits, human-in-loop approval, role tiers | identity gate (KYA review) + prefunded tokens |
| Integration | MCP tools (`card_*`) | API + TS SDK — **no MCP** | SDK; works via MCP tool-call params — **no MCP client needed** |
| Funding | (Dexter) | ~$13.8M (Visa, Coinbase Ventures, Boost) | ~$9.5–14.5M (a16z, Coinbase Ventures, DCVC) |

**Where Dextercard is distinctive:** it is the **only one delivered as MCP
tools**. Payman is SDK-only; Skyfire rides MCP params but ships no MCP
surface. An agent already in an MCP session *issues and drives a real card*
through Dextercard tool calls — no SDK integration step. That is a genuine
edge for the agent-native use case.

**Where the others are ahead:**
- **Payman's spend-policy engine is deeper** — role-based multi-tier
  approval chains, human-in-the-loop thresholds. Dextercard's controls
  (limits, freeze, per-wallet cap) are simpler. If "agent spends company
  money under governance" is a target use case, Payman's policy model is
  the bar to match.
- **Skyfire's identity layer (KYA) has no Dextercard equivalent.** "Know
  Your Agent" verification is a real differentiator for any
  counterparty that needs to trust the agent, not just cap it.

**Read:** Dextercard wins on *delivery* (MCP-native, zero-integration) and
loses on *governance depth* (Payman) and *identity* (Skyfire). All three
settle in USDC — the rail is not the differentiator; the control surface
is. Not urgent for this review (Dextercard is a sibling product), but worth
flagging for whoever owns the Dextercard roadmap: the spend-policy gap vs
Payman is the one a buyer will notice.

---

## 6. MCP server instructions — still the weakest surface

The intel doc flagged this and it stands. Pay.sh's `instructions.md` is
**prescriptive** — "never answer 'can pay do X' from memory; check
`list_catalog`," explicit tool-routing branches, failure recipes, a safety
model. OpenDexter's `SERVER_INSTRUCTIONS` is **descriptive with light
workflow** — ordering hints and a couple of recipes, no failure-mode
guidance, no "don't answer from memory" anchor, no per-tool selection rules.

The CDP Bazaar MCP's instruction surface is thinner still (two tools,
minimal routing) — so OpenDexter is not *last* here. But Pay.sh is the bar,
and OpenDexter is below it. This is cheap to fix — it is prose, not code —
and it directly improves how well an agent uses the tools. Carry to Session
5 as a real P1: rewrite `SERVER_INSTRUCTIONS` (in `@dexterai/mcp-instructions`)
to the SOP shape. (Already tracked as the 04-17 audit's Task #29 — this
sharpens the priority.)

---

## 7. Honest verdict

**Where OpenDexter wins:**
1. **Cross-facilitator coverage** — OpenDexter crawls every facilitator's
   Bazaar; any single facilitator's discovery layer (CDP's included) shows
   only its own catalog. OpenDexter's corpus is a structural superset.
2. **Curation** — quality-scored, gaming-detected, human-gated. No competitor
   *product*, and no single-facilitator discovery layer, has shown this. The
   single most defensible thing OpenDexter has.
3. **Dual surface** — the only product with both a true hosted MCP and a
   real local CLI.
4. **Check-before-pay** — `x402_check` as a first-class probe step; safer
   than the CDP Bazaar MCP's search-straight-to-autopay.
5. **Dextercard is MCP-native** — issue a real card from a tool call, no SDK.

**Where OpenDexter is behind:**
1. **Distribution** — the CDP facilitator's Bazaar reaches every Coinbase
   Developer Platform user by default. This is the biggest single gap and it
   is structural (a position), not a missing feature.
2. **MPP** — absent; Agentcash + Pay.sh have it. (Not a differentiator vs
   the Coinbase ecosystem — it is x402-only too.)
3. **Server instructions** — descriptive, not prescriptive. Pay.sh is the bar.
4. **Stablecoin breadth** — USDC-only vs Pay.sh's five. (Config, not
   architecture — cheap to narrow.)
5. **Dextercard governance depth** — Payman's spend-policy engine is richer.

**Highest-ROI move to pull ahead:**
Not a feature — a **framing**. OpenDexter's two real advantages — it crawls
*every* facilitator's Bazaar (not just one), and it *curates* (scores +
gaming-checks + gates) rather than just lists — are both true by
construction and both currently invisible. A single facilitator can
out-distribute OpenDexter but structurally cannot out-*cover* it or
out-*vet* it. The highest-leverage work is making that the **first line** of
every surface — the hosted MCP `instructions`, the README, the skill, the
landing page: "every x402 endpoint across every facilitator, quality-scored
and gaming-checked." Right now a user has to dig to learn any of that.

Second move, cheap and concrete: **rewrite `SERVER_INSTRUCTIONS` to Pay.sh's
SOP shape** (Session 5 P1) and **add PYUSD to the allowlist** if on-chain
demand exists (Session 5 P2-ish). Both are low-effort, both close a named
gap.

MPP is a real decision but not this month's — track the MPP-only-endpoint
share as a metric and let the data trigger it.

---

## Summary for the synthesis doc

- **Naming correction:** there is no competitor product called "x402
  Bazaar." The Bazaar is an x402 **facilitator discovery extension** — a
  near-standard one. Dexter's own facilitator implements it; Coinbase's CDP
  facilitator implements it; most do. OpenDexter, as a discovery *product*,
  crawls every facilitator's Bazaar.
- **The real competitor products are Agentcash and Pay.sh** (shipped,
  code-audited, full tool+catalog+custody). Coinbase's presence is a
  facilitator + a marketplace UI (Agentic.market), not a packaged rival.
- **OpenDexter's two structural advantages** — both true by construction,
  both currently under-sold: (1) it crawls *every* facilitator's Bazaar, so
  its corpus is a superset of any single-facilitator catalog; (2) it
  *curates* — quality score + gaming detection + human gate — where the rest
  just list. Highest-ROI action is making both **legible**, not building new
  features.
- **Two named weaknesses:** no MPP (medium ROI — Agentcash/Pay.sh have it,
  the Coinbase ecosystem does not; track the MPP-only-endpoint share as a
  metric, decide later); USDC-only (low effort — env allowlist; add PYUSD if
  on-chain demand exists).
- **Carry to Session 5 as a P1:** rewrite `SERVER_INSTRUCTIONS` to a
  prescriptive SOP shape (Pay.sh is the benchmark). Cheap, prose-only,
  directly improves agent tool-use.
- Dextercard is MCP-native (a real edge) but behind Payman on spend-policy
  depth and Skyfire on identity — a flag for the Dextercard roadmap owner,
  out of scope for the fix sessions here.
