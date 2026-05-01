/**
 * Widget metadata helpers for x402 MCP tools.
 *
 * The widget URIs are NOT defined here. Each consumer (the npm CLI,
 * the hosted public server, the hosted authed server) computes its own
 * URIs — typically by content-hashing the widget HTML files it ships —
 * and passes them in via the registrar opts. This keeps the package
 * pure (no filesystem reads) and lets each consumer own its widget
 * lifecycle.
 *
 * The CSP rules and domain are also exposed as parameters so different
 * deployments can tighten or loosen them.
 */

const DEFAULT_WIDGET_DOMAIN = "https://dexter.cash";

const DEFAULT_WIDGET_CSP = {
  resource_domains: [
    "https://cdn.dexscreener.com",
    "https://raw.githubusercontent.com",
    "https://metadata.jup.ag",
  ],
};

export interface WidgetUris {
  search: string;
  fetch: string;
  pricing: string;
  wallet: string;
}

export interface WidgetMetaOptions {
  widgetDomain?: string;
  widgetCsp?: { resource_domains: string[] };
}

/**
 * Build widget metadata for a single tool.
 *
 * Returned object is the dual-format (MCP Apps standard + ChatGPT
 * Apps SDK) blob that `server.tool()` accepts as `_meta`.
 */
export function widgetMeta(
  templateUri: string,
  invoking: string,
  invoked: string,
  description: string,
  options: WidgetMetaOptions = {},
) {
  const widgetDomain = options.widgetDomain ?? DEFAULT_WIDGET_DOMAIN;
  const widgetCsp = options.widgetCsp ?? DEFAULT_WIDGET_CSP;
  return {
    // MCP Apps standard (Cursor, Claude Desktop, VS Code)
    ui: {
      resourceUri: templateUri,
      visibility: ["model", "app"] as const,
    },
    // ChatGPT Apps SDK (OpenAI-specific)
    "openai/outputTemplate": templateUri,
    "openai/resultCanProduceWidget": true,
    "openai/widgetAccessible": true,
    "openai/widgetDomain": widgetDomain,
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": widgetCsp,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked,
    "openai/widgetDescription": description,
  };
}

/**
 * Build the four canonical META blobs for the x402 toolset given a
 * resolved set of widget URIs and optional metadata overrides.
 *
 * Returned shape is consumed by the individual register*Tool functions.
 */
export function buildToolMetas(uris: WidgetUris, options: WidgetMetaOptions = {}) {
  return {
    search: widgetMeta(
      uris.search,
      "Searching marketplace…",
      "Results ready",
      "Shows paid API search results as interactive cards with quality rings, prices, and fetch buttons.",
      options,
    ),
    fetch: widgetMeta(
      uris.fetch,
      "Calling API…",
      "Response received",
      "Shows API response data with payment receipt, transaction link, and settlement status.",
      options,
    ),
    check: widgetMeta(
      uris.pricing,
      "Checking pricing…",
      "Pricing loaded",
      "Shows endpoint pricing per blockchain with payment amounts and a pay button.",
      options,
    ),
    wallet: widgetMeta(
      uris.wallet,
      "Loading wallet…",
      "Wallet loaded",
      "Shows wallet address with copy button, USDC/SOL balances, and deposit QR code.",
      options,
    ),
  };
}

export type ToolMetas = ReturnType<typeof buildToolMetas>;
