---
name: x402-discoverable
description: "Get an x402 API discovered and listed on the OpenDexter / x402gle catalog so paying agents can find it. Trigger when the user has an x402 API and wants it listed, indexed, discoverable, or found by agents; wants to onboard or register a paid endpoint; asks how agents will find their API; or mentions `opendexter audition`, x402gle discovery, or making a server agent-discoverable. This is the step AFTER an API already speaks x402 (see x402-server for building that)."
---

# Make an x402 API discoverable

Use `opendexter audition` to discover and register an x402 API's routes in the
OpenDexter / x402gle catalog. A server origin registers routes. A specific
endpoint URL requests an immediate test that can pay the endpoint, evaluate
its response, and save a score. Registration and scoring are separate outcomes.

`audition` requests a server-side merchant test and can cause paid provider
calls and catalog changes. It does not load a local signer or spend through the
connected user's governed OpenDexter authority. Obtain explicit approval for
the audition itself.

OpenDexter's platform verifier funds the test. Funding the seller's connected
wallet does not fund this command. Check the returned result to see whether
the test completed.

## When this skill applies

Use it when the user's API already returns HTTP 402 with a valid payment
manifest. Use the **x402-server** skill first if the API still needs its paywall.

## The one command

```bash
npx @dexterai/opendexter@1.25.2 audition <server-url> --json
```

- Pass a **server origin** to discover and register its routes without an
  immediate paid test.
- To request an immediate test, pass a **specific endpoint URL**.
- Use `--json` when an agent needs the structured result. Omit it for a human
  reading the summary. Add `--verbose` for request references and HTTP response
  metadata on stderr.

No global install is needed; this command requests the exact pinned package
version.

## Discovery requirements

The audition finds paid routes three ways, in order of preference:

1. **OpenAPI 3.1 document at `/openapi.json`** (preferred), with
   `info.x-guidance`, a `requestBody` schema per paid operation, and an
   `x-payment-info` block carrying `protocols` (x402 and/or mpp) and a
   structured `price`.
2. **`/.well-known/x402`**, a descriptor listing the paid routes.
3. A **bare probe** of a URL that returns HTTP 402 with a valid payment manifest.

If discovery returns `discovery_failed`, read its message and warnings. Check
that the advertised discovery document is reachable and describes the routes.

## Reading the `--json` result

For an endpoint whose test completed, the result can include:

```json
{
  "ok": true,
  "origin": "https://merchant-api.com",
  "summary": { "total": 1, "registered": 1, "failed": 0, "avgScore": 91 },
  "routes": [
    {
      "url": "https://merchant-api.com/price/eth",
      "registered": true,
      "auditOutcome": "scored",
      "score": 91,
      "status": "pass",
      "verdict": "<what an agent asked for and what came back>",
      "fixInstructions": null
    }
  ]
}
```

Read each route's `auditOutcome` before interpreting its score:

| Outcome | Meaning | Next action |
| --- | --- | --- |
| `pending` | The route was registered without an immediate paid test. | Report registration. Request a specific endpoint test if authorized. |
| `incomplete` | This attempt produced no score. | Read `incompleteReason` and recover the saved attempt before considering another test. |
| `scored` | Evaluation completed. | Read `score`, `status`, `verdict`, and any `fixInstructions`. |

Use `registered` to report whether a route was saved. A saved route can have an
incomplete test. The `synthesizedSkill` and `mcpTool` definitions describe
how to call the route; their presence does not establish payment or scoring.

Incomplete results and failed registrations set exit code 1, including with
`--json`. Pending registration and completed scoring exit 0, even when the
score is poor. Read the result fields to distinguish these outcomes.

## Recovery and retesting

If a reply is interrupted, unreadable, or reports an uncertain outcome, the
test may already have run or paid. Do not repeat the audition automatically.
The CLI submits one request and reports `noRetry: true` on errors. Preserve the
stage, HTTP status, and available request references. Ask OpenDexter support
to recover the saved result and payment outcome before starting another test.

An incomplete result alone gives no basis to blame or change the seller's API.
Use its reason to identify the blocker. For a scored failure, inspect the
verdict and fix instructions before changing the endpoint or its discovery
document. A further test requires a known prior outcome and authorization
for another run.

HTTP 429 `cooldown_active` includes a `cooldownUntil` timestamp when available.
Honor that time before another authorized request. Cooldown expiry does not
resolve an earlier uncertain payment or result.

## After it is listed

Inspect the public host page and any generated service definitions at:

- Public host page: `https://x402gle.com/servers/{host}`
- Skill document: `https://x402gle.com/servers/{host}/SKILL.md`
- Skill index: `https://x402gle.com/servers/{host}/skills.json`
- A2A card: `https://x402gle.com/servers/{host}/.well-known/agent.json`

A host that is already indexed also has a pre-filled audition prompt on its
own `x402gle.com/servers/{host}` page.

## Reference

- Agent-readable onboarding doc: https://x402gle.com/agent.md
- Human-facing version: https://x402gle.com/agent
