import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CardToolOpts } from "./types.js";
import { registerCardStatusTool } from "./tools/cards/status.js";
import { registerCardIssueTool } from "./tools/cards/issue.js";
import { registerCardLinkWalletTool } from "./tools/cards/link-wallet.js";
import { registerCardFreezeTool } from "./tools/cards/freeze.js";

export interface ComposeCardToolsOpts extends CardToolOpts {
  /**
   * Optional subset of card tools to register. Defaults to all four.
   * Useful when a consumer wants to surface only a subset (e.g.,
   * read-only environments may want status + nothing else).
   */
  include?: Array<"status" | "issue" | "linkWallet" | "freeze">;
}

const DEFAULT_INCLUDE: Array<"status" | "issue" | "linkWallet" | "freeze"> = [
  "status",
  "issue",
  "linkWallet",
  "freeze",
];

/**
 * Register the canonical Dextercard tool surface on a single MCP
 * server. Most consumers will use this; consumers that need per-tool
 * customization can call the individual register*CardTool functions
 * directly.
 */
export function composeCardTools(server: McpServer, opts: ComposeCardToolsOpts): void {
  const include = opts.include ?? DEFAULT_INCLUDE;

  if (include.includes("status")) registerCardStatusTool(server, opts);
  if (include.includes("issue")) registerCardIssueTool(server, opts);
  if (include.includes("linkWallet")) registerCardLinkWalletTool(server, opts);
  if (include.includes("freeze")) registerCardFreezeTool(server, opts);
}
