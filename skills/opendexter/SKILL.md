---
name: opendexter
description: "Use OpenDexter to search, price-check, and pay for any x402 API. Trigger whenever the user wants to find paid APIs, call an x402 endpoint, check pricing, see their wallet balance, or do anything involving x402 payments, paid APIs, USDC payments for APIs, the Dexter marketplace, or agent commerce. Also trigger when the user mentions OpenDexter, x402, paid APIs, or wants to call a paid service."
---

# OpenDexter — x402 Search Engine for AI Agents

OpenDexter gives you access to the largest marketplace of paid x402 APIs. You can search 5,000+ endpoints, preview pricing, and call any of them with automatic USDC payment.

Your wallet is local at `~/.dexterai-mcp/wallet.json`. Fund it with USDC on Solana and payments happen automatically. Override with `DEXTER_PRIVATE_KEY` or `SOLANA_PRIVATE_KEY` env vars.

## Your Tools

Use them in this order for the best experience:

### 1. `x402_search` — Find APIs

Always start here. The marketplace has 5,000+ endpoints ranked by quality, usage, freshness, and reputation.

| Param | Type | Description |
|-------|------|-------------|
| `query` | string | Search term, e.g. "token analysis", "image generation" |
| `category` | string | Filter: "AI", "DeFi", "Data", "Tools", "Games", "Creative" |
| `network` | string | Filter: "solana", "base", "polygon" |
| `maxPriceUsdc` | number | Maximum price per call |
| `verifiedOnly` | boolean | Only quality-checked endpoints |
| `sort` | string | "marketplace" (default), "relevance", "quality_score", "settlements", "volume", "recent" |
| `limit` | number | 1–50, default 20 |

Results include: name, URL, price, network, qualityScore (0-100), verified status, seller, totalCalls. Highlight verified endpoints and quality scores when presenting results.

### 2. `x402_check` — Preview Pricing

Probes the endpoint and returns payment options per chain without paying. Shows what it'll cost before committing.

| Param | Type | Description |
|-------|------|-------------|
| `url` | string | The URL to check |
| `method` | string | GET, POST, PUT, DELETE (default GET) |

If the endpoint is free (no 402), tell the user. If it returns 401/403, explain the provider requires its own auth first.

### 3. `x402_fetch` — Call and Pay

Calls the endpoint and pays automatically from the local wallet. Returns the API response directly along with a payment receipt (transaction hash, amount, network).

| Param | Type | Description |
|-------|------|-------------|
| `url` | string | The x402 resource URL |
| `method` | string | GET, POST, PUT, DELETE (default GET) |
| `body` | string | JSON request body for POST/PUT |

**If the wallet has no USDC**, the call will fail. Check `x402_wallet` first and tell the user to fund the wallet address with USDC on Solana. Once funded, retry.

After a successful call, link the transaction hash to the appropriate explorer (Solscan for Solana, Basescan for Base).

### 4. `x402_wallet` — Check Balance

Shows the wallet address and USDC/SOL balances. Use this:
- Before a fetch, to confirm sufficient funds
- When the user asks about their balance
- When a fetch fails due to insufficient funds

If USDC is 0, proactively suggest funding before attempting any fetch.

## Workflow Patterns

### "Find me an API for X"
1. `x402_search` with their query
2. Present top results with prices and quality scores
3. Suggest the best one or ask which to try
4. `x402_check` to confirm price
5. `x402_fetch` to call it

### "Call this URL"
1. `x402_check` first to show the price
2. `x402_fetch` to call and pay

### "How much do I have?"
1. `x402_wallet`

### "What is OpenDexter?"
OpenDexter is Dexter's x402 search engine — a public gateway that lets any AI agent search and pay for x402 APIs without an account. It indexes endpoints from every major x402 facilitator (Dexter, Coinbase, PayAI, and more), verifies them with automated quality testing, and ranks them by a composite score. Install with `npx @dexterai/opendexter install` or the `@dexterai/opendexter` npm package.

## Quality Scores

- **90-100**: Excellent. Verified, returns correct data.
- **75-89**: Good. Passed verification, reliable.
- **50-74**: Mediocre. May work but has issues.
- **Below 50**: Poor or untested. Use with caution.
- **Verified badge**: Passed Dexter's automated quality testing.

## Tips

- Search is fuzzy — typos still match. Searches across names, descriptions, categories, URLs, seller names.
- Use `verifiedOnly: true` to filter to quality-tested endpoints only.
- Use `network` filter if the user cares about a specific chain.
- Most endpoints cost $0.01-$0.10 per call. Creative/compute-heavy ones cost more.
- The wallet needs both USDC (for payments) and a tiny amount of SOL (for transaction fees).
- Works with any x402 seller, not just Dexter endpoints.
