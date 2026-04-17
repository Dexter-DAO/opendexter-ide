/**
 * Shared MCP server instructions for OpenDexter / Dexter x402 Gateway.
 *
 * Single source of truth consumed by BOTH:
 *   - The hosted remote server at open.dexter.cash/mcp
 *     (source: ~/websites/dexter-mcp/open-mcp-server.mjs)
 *   - The local npm-installable server
 *     (source: ~/websites/opendexter-ide/packages/mcp/src/server/index.ts)
 *
 * Previously these two codebases drifted — the hosted server had
 * ~1,800 bytes of workflow guidance (shipped Apr 16), but the npm package
 * constructor was `new McpServer({ name, version })` with no second
 * argument, so developers running `npx @dexterai/opendexter` in Claude
 * Code / Cursor / Codex / Windsurf / Gemini CLI got six tools with no
 * usage context.
 *
 * This package fixes that by making both servers import from one constant.
 * When the instructions evolve (new tools, new chains, new workflow hints),
 * update this file, publish a patch, both servers get the new text.
 *
 * Consumed via:
 *   import { SERVER_INSTRUCTIONS } from '@dexterai/mcp-instructions';
 *   const server = new McpServer(
 *     { name: 'Dexter x402 Gateway', version: VERSION },
 *     { instructions: SERVER_INSTRUCTIONS },
 *   );
 */

export const SERVER_INSTRUCTIONS = `You are connected to the Dexter x402 Gateway — a public MCP server for searching and paying for x402 APIs.

Tools (use in this order):
1. x402_search — Semantic search over thousands of paid APIs. Pass a natural-language query (e.g. "ETH price feed", "generate an image"). Returns strongResults (high-confidence) and relatedResults (adjacent). Do NOT pre-filter by chain or category — the ranker handles expansion internally.
2. x402_check — Probe an endpoint for pricing per chain without paying. Use before first paid call.
3. x402_fetch — Call any x402 endpoint with automatic USDC payment. Returns the API response + settlement receipt.
4. x402_pay — Alias for x402_fetch.
5. x402_access — Access identity-gated endpoints with wallet proof (Sign-In-With-X) instead of payment.
6. x402_wallet — Create or resume a multi-chain session. Shows deposit addresses and USDC balances across Solana, Base, Polygon, Arbitrum, Optimism, Avalanche.

Workflows:
- "Find an API for X" → x402_search → present results with prices/scores → x402_check to confirm → x402_fetch to call
- "Call this URL" → x402_check first → x402_fetch
- "Check my balance" → x402_wallet

Key facts:
- Supported chains for session funding: Solana, Base, Polygon, Arbitrum, Optimism, Avalanche (the facilitator additionally supports BSC and SKALE Base for paid calls)
- Most endpoints cost $0.01–$0.10/call
- Quality scores: 90-100 excellent, 75-89 good, 50-74 mediocre, <50 untested
- If wallet has no USDC, check x402_wallet first and tell the user to fund
- Search is semantic — typos and synonyms handled. Describe what you want in plain English.
- After a successful paid call, link the transaction hash to the appropriate explorer (Solscan for Solana, Basescan for Base, Polygonscan, Arbiscan, Optimistic Etherscan, Snowtrace for Avalanche)

Read docs://opendexter/workflow, docs://opendexter/protocol, or docs://opendexter/debugging for deeper reference.`;

/**
 * Version stamp for debugging drift — increment when the string changes
 * meaningfully. Consumers can log this to confirm which version is live.
 */
export const SERVER_INSTRUCTIONS_VERSION = '1.0.0';
