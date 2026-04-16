import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApiBase, CAPABILITY_PATH } from "../config.js";
import { SEARCH_META } from "../widget-meta.js";
import {
  capabilitySearch,
  buildSearchResponse,
  buildSearchErrorResponse,
  type FormattedResource,
  type SearchResponse,
} from "@dexterai/x402-core";

/**
 * x402_search tool
 *
 * Thin adapter over @dexterai/x402-core's capabilitySearch() and
 * buildSearchResponse(). All types, formatting, and HTTP logic live in
 * x402-core — this file only provides the MCP tool registration and
 * the widget metadata binding.
 */

interface SearchOpts {
  dev: boolean;
}

// Re-export for any other code in the package that needs the type
export type { FormattedResource, SearchResponse };

// ============================================================================
// MCP tool registration
// ============================================================================

export function registerSearchTool(server: McpServer, opts: SearchOpts): void {
  server.tool(
    "x402_search",
    "Search the Dexter x402 marketplace for paid API resources using semantic capability search. " +
      "Returns two tiers: strong matches (high-confidence capability hits) and related matches " +
      "(adjacent services that cleared the similarity floor but not the strong threshold). " +
      "Handles synonyms and alternate phrasings internally — pass the user's natural-language " +
      "intent directly. Use x402_fetch to call any result.",
    {
      query: z
        .string()
        .describe(
          "Natural-language description of the capability you want. " +
            "e.g. 'check wallet balance on Base', 'generate an image', 'ETH price feed', " +
            "'translate text'. Do NOT pre-filter by chain or category — the search layer " +
            "handles expansion and ranking.",
        ),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Max results across strong + related tiers combined (1-50, default 20)"),
      unverified: z
        .boolean()
        .optional()
        .describe("Include unverified resources in results (default false)"),
      testnets: z
        .boolean()
        .optional()
        .describe("Include testnet-only resources (default false — testnets hidden by default)"),
      rerank: z
        .boolean()
        .optional()
        .describe(
          "Cross-encoder LLM rerank of top strong results (default true). Set false for " +
            "deterministic order or lowest-latency path.",
        ),
    },
    async (args) => {
      try {
        const endpoint = `${getApiBase(opts.dev)}${CAPABILITY_PATH}`;
        const result = await capabilitySearch({ ...args, endpoint });
        const data = buildSearchResponse(result);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          _meta: SEARCH_META,
        } as any;
      } catch (err: any) {
        const payload = buildSearchErrorResponse(err.message || "search_failed");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          _meta: SEARCH_META,
          isError: true,
        } as any;
      }
    },
  );
}

// ============================================================================
// CLI entrypoint (used by the `opendexter` binary)
// ============================================================================

export async function cliSearch(query: string, opts: { dev: boolean }): Promise<void> {
  try {
    const endpoint = `${getApiBase(opts.dev)}${CAPABILITY_PATH}`;
    const result = await capabilitySearch({ query, endpoint });

    console.log(
      JSON.stringify(
        {
          success: true,
          count: result.strongResults.length + result.relatedResults.length,
          strongCount: result.strongCount,
          relatedCount: result.relatedCount,
          topSimilarity: result.topSimilarity,
          noMatchReason: result.noMatchReason,
          rerank: result.rerank,
          resources: [...result.strongResults, ...result.relatedResults],
        },
        null,
        2,
      ),
    );
  } catch (err: any) {
    console.log(JSON.stringify({ error: err.message || String(err) }, null, 2));
    process.exit(1);
  }
}
