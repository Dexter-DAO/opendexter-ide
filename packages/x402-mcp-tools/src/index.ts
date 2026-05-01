/**
 * @dexterai/x402-mcp-tools
 *
 * Shared MCP tool registrations for the Dexter x402 ecosystem.
 *
 * One register*Tool function per tool. Consumers (the npm @dexterai/opendexter
 * CLI, the hosted public MCP server, the hosted authenticated MCP server)
 * import the registrars they need, build an opts bag with their environment-
 * specific dependencies (wallet, api base URL, widget URIs), and call each
 * registrar in their own server bootstrap.
 *
 * The package depends on @dexterai/x402-core for HTTP/formatting/types and
 * stays free of any consumer-specific concerns: no filesystem reads, no
 * environment variables, no auth flows. Inject what you need through opts.
 */

// Tool registrars
export { registerSearchTool } from "./tools/search.js";
export { registerCheckTool } from "./tools/check.js";

// Widget metadata helpers
export {
  widgetMeta,
  buildToolMetas,
  type WidgetUris,
  type WidgetMetaOptions,
  type ToolMetas,
} from "./widget-meta.js";

// Registrar opts types
export type {
  WalletHandle,
  ToolBaseOpts,
  SearchToolOpts,
  CheckToolOpts,
  FetchToolOpts,
  AccessToolOpts,
  WalletToolOpts,
} from "./types.js";
export { DEFAULT_CAPABILITY_PATH } from "./types.js";

// Re-export types from x402-core so consumers only need one import path
export type {
  FormattedResource,
  CapabilitySearchOptions,
  CapabilitySearchResult,
  SearchResponse,
  CheckResult,
  PaymentOption,
} from "@dexterai/x402-core";
