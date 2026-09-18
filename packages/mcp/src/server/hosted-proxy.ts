import { McpServer, type RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  AGENT_WORK_REPORT_TOOL_NAME,
  AGENT_WORK_REPORT_INPUT_SCHEMA,
  AGENT_WORK_REPORT_OUTPUT_SCHEMA,
  AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA,
} from "./agent-work-report-contract.js";
import {
  attachRuntimeAuthorityStatus,
  callHostedRuntimeTool,
  projectRuntimeAuthorityStatus,
  readGovernedAuthorityStatus,
  sanitizeLegacyAccessResult,
  structuredToolResult,
  type HostedRuntimeToolName,
} from "../connect/wallet.js";

export const HOSTED_PROXY_TOOL_ROSTER = [
  "x402_search",
  "x402_check",
  "x402_fetch",
  "x402_status",
  "x402_access",
  "x402_wallet",
  "dexter_portfolio",
  AGENT_WORK_REPORT_TOOL_NAME,
] as const satisfies readonly HostedRuntimeToolName[];

/** Exact operating contract for this proxy; the legacy shared rendering still
 * describes a caller-carried purchase contract and therefore cannot be served. */
export const HOSTED_PROXY_INSTRUCTIONS = `You are connected to OpenDexter's hosted governed x402 runtime through the local proxy. Account-bound tools use the stored OAuth bearer. The proxy never handles private keys and never switches to a local signer automatically.

# Tool routing

x402_search discovers live resources and always uses the anonymous hosted surface. x402_check probes exact terms without paying; it uses OAuth when available and otherwise remains anonymously usable. A non-GET x402_check can still cause seller-side effects, so obtain separate explicit authorization for the exact probe before calling it; that probe authorization is not payment approval. x402_fetch, x402_status, x402_wallet, and dexter_portfolio require the connected OAuth bearer. For a connected paid route, x402_check returns one opaque server-owned intentId; never parse, reconstruct, or replace it.

x402_fetch accepts only that intentId and a separately approved maxAmountAtomic ceiling. Those two values do not authorize a different URL, body, seller, route, amount, or payment mode. A failed or ambiguous fetch must never be retried blindly.

x402_status accepts the same intentId and is the read-only recovery path after an ambiguous or completed x402_fetch. Reconcile status before deciding whether any retry is appropriate.

x402_access is a separate anonymous legacy wallet-proof operation. Every call starts one fresh hosted access context: it is not Dexter OAuth, not the governed payment wallet, and does not preserve continuity across calls. This proxy never accepts, exposes, or persists access session credentials. A non-GET x402_access can cause seller-side effects and requires separate explicit authorization for that exact one-call request before it is sent. x402_wallet reads the hosted wallet and runtimeAuthority evidence. dexter_portfolio reads the session-bound governed asset inventory; portfolio value is not spendable cash.

dexter_report_work saves the connected agent's own work statement using its stored OAuth connection. Report actual changes in work state with a short plain-text summary; idle may omit the summary. Keep private data and credentials out of summaries. Preserve operationId and identical content after an uncertain response, and follow the hosted recovery fields before sending another request. A deliberate update uses a new operationId and the current revision. Reconnecting preserves recovery only when the hosted connection still identifies the same registered agent. Financial outcomes remain in their transaction receipts.

# Authority truth

An OAuth bearer proves account authorization only. It does not prove an active grant, remaining capacity, or active on-chain role. Treat runtimeAuthority as active only when its exact live evidence reports active bounded_payment_authority. Report unavailable fields as unavailable. Never infer authority from a balance, address, token claim, or portfolio metadata.

Local wallet.json/environment signing is not a payment executor on this runtime. Existing local wallets may be inspected only through the explicitly labeled non-payment recovery view. There is no automatic or opt-in local payment fallback. Manage or revoke hosted authority at https://dexter.cash/wallet.

Read docs://opendexter/workflow, docs://opendexter/protocol, or docs://opendexter/debugging for deeper protocol detail.`;

const httpMethod = z.enum(["GET", "POST", "PUT", "DELETE"]);

export interface HostedProxyOptions {
  dev?: boolean;
  dataDir?: string;
  /** Test seam. Production always delegates to callHostedRuntimeTool. */
  callTool?: (
    toolName: HostedRuntimeToolName,
    args: Record<string, unknown>,
    retryRejectedBearer: boolean,
  ) => Promise<CallToolResult>;
  /** Test seam for the bearer-authenticated read-only authority endpoint. */
  readAuthorityStatus?: () => ReturnType<typeof readGovernedAuthorityStatus>;
  /** Deterministic authority-evidence clock. */
  now?: () => number;
}

function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const structuredContent = {
    ok: false,
    error: "hosted_runtime_call_failed",
    message,
    automaticLocalFallback: false,
  };
  return {
    isError: true,
    structuredContent,
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
  };
}

function reportErrorResult(error: unknown, operationId: string): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const configurationUnavailable = /^(connect_required_for_hosted_|connected_session_expired_reconnect_required)/.test(message);
  const connectionRejected = message.startsWith("connected_session_rejected_no_automatic_retry");
  const structuredContent = AGENT_WORK_REPORT_OUTPUT_SCHEMA.parse({
    namespace: "opendexter-agent-work-report-local-error/v1",
    code: configurationUnavailable ? "configuration_unavailable" : "transport_failed",
    operationId,
    retryable: !configurationUnavailable,
    retryWithSameOperationOnly: true,
    retryAfterMs: null,
  });
  return {
    isError: true,
    structuredContent,
    content: [{
      type: "text",
      text: configurationUnavailable || connectionRejected
        ? "Restore the same registered agent's OpenDexter connection, then recover this report with the same operationId and identical content."
        : "The work report response did not arrive. Recover it with the same operationId and identical content.",
    }],
    _meta: { "dexter/agentWorkReportRequest": { operationId } },
  };
}

export function registerHostedProxyTools(
  server: McpServer,
  opts: HostedProxyOptions = {},
): void {
  const registered = new Map<string, RegisteredTool>();
  const registerTool: McpServer["registerTool"] = (name, config, handler) => {
    const tool = server.registerTool(name, config, handler);
    registered.set(name, tool);
    return tool;
  };
  const callTool = opts.callTool ?? ((toolName, args, retryRejectedBearer) =>
    callHostedRuntimeTool({
      toolName,
      arguments: args,
      dev: opts.dev,
      dataDir: opts.dataDir,
      retryRejectedBearer,
    }));
  const call = async (
    toolName: HostedRuntimeToolName,
    args: Record<string, unknown>,
    retryRejectedBearer = true,
  ): Promise<CallToolResult> => {
    try {
      const result = await callTool(toolName, args, retryRejectedBearer);
      return toolName === "x402_access"
        ? sanitizeLegacyAccessResult(result)
        : result;
    } catch (error) {
      return toolName === AGENT_WORK_REPORT_TOOL_NAME
        ? reportErrorResult(error, args.operationId as string)
        : errorResult(error);
    }
  };

  registerTool(
    "x402_search",
    {
      description: "Search the canonical hosted x402 marketplace.",
      inputSchema: z.object({
        query: z.string().min(1),
        network: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        unverified: z.boolean().optional(),
        testnets: z.boolean().optional(),
        rerank: z.boolean().optional(),
      }).strict(),
      annotations: { readOnlyHint: true },
    },
    (args) => call("x402_search", args),
  );

  registerTool(
    "x402_check",
    {
      description:
        "Probe exact x402 terms without paying. Non-GET probes can cause seller-side effects and require separate explicit probe authorization; connected checks return a server-owned purchase intent.",
      inputSchema: z.object({
        url: z.string().url(),
        method: httpMethod.optional(),
        body: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    // A non-GET probe may mutate seller state. If its bearer is rejected after
    // possible dispatch, never refresh and send that request a second time.
    (args) => call("x402_check", args, (args.method ?? "GET") === "GET"),
  );

  registerTool(
    "x402_fetch",
    {
      description:
        "Execute exactly one hosted, server-owned purchase intent under the connected governed authority.",
      inputSchema: z.object({
        intentId: z.string().min(1).max(256),
        maxAmountAtomic: z.string().regex(/^[1-9]\d{0,19}$/),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    // A rejected bearer after possible dispatch is not proof of non-payment.
    // Never refresh-and-retry this consequential tool automatically.
    (args) => call("x402_fetch", args, false),
  );

  registerTool(
    "x402_status",
    {
      description:
        "Read the exact server-owned purchase intent after an uncertain or completed fetch. This never dispatches payment.",
      inputSchema: z.object({
        intentId: z.string().min(1).max(256),
      }).strict(),
      annotations: { readOnlyHint: true },
    },
    (args) => call("x402_status", args),
  );

  registerTool(
    "x402_access",
    {
      description:
        "Use one fresh anonymous legacy wallet-proof context for an SIWX-protected resource. It is separate from Dexter OAuth and governed payment authority and has no cross-call continuity. Non-GET requests can cause seller-side effects and require separate explicit request authorization.",
      inputSchema: z.object({
        url: z.string().url(),
        method: httpMethod.optional(),
        body: z.string().optional(),
        network: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    // Every access call is one fresh anonymous context. Never redispatch it or
    // invent continuity after any failure, including GET failures.
    (args) => call("x402_access", args, false),
  );

  registerTool(
    "x402_wallet",
    {
      description:
        "Read the connected hosted wallet and exact governed x402-authority evidence.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await call("x402_wallet", {});
      const wallet = structuredToolResult(result);
      const endpointStatus = opts.readAuthorityStatus
        ? await opts.readAuthorityStatus()
        : await readGovernedAuthorityStatus({
            dev: opts.dev,
            dataDir: opts.dataDir,
            now: opts.now,
          });
      // Until the bearer endpoint is source-complete it truthfully returns an
      // unavailable projection. An exact evidence tuple embedded by the hosted
      // wallet remains acceptable and is never inferred from balances.
      const embeddedStatus = projectRuntimeAuthorityStatus(wallet, opts.now);
      const status = endpointStatus.evidenceNamespace
        ? endpointStatus
        : embeddedStatus.evidenceNamespace
          ? embeddedStatus
          : endpointStatus;
      return attachRuntimeAuthorityStatus(result, status);
    },
  );

  registerTool(
    "dexter_portfolio",
    {
      description: "Read the governed portfolio bound to the connected hosted principal.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true },
    },
    () => call("dexter_portfolio", {}),
  );

  registerTool(
    AGENT_WORK_REPORT_TOOL_NAME,
    {
      description: "Save the connected agent's own work statement. Report changes in work state; financial outcomes remain in their transaction receipts.",
      inputSchema: AGENT_WORK_REPORT_INPUT_SCHEMA,
      outputSchema: AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) => call(AGENT_WORK_REPORT_TOOL_NAME, args, false),
  );

  // SDK 1.30's default list normalizer drops union schemas. Keep the public
  // registration handles and materialize their schemas without normalization.
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [...registered].filter(([, tool]) => tool.enabled).map(([name, tool]): Tool => ({
      name,
      title: tool.title,
      description: tool.description,
      inputSchema: {
        type: "object",
        ...toJsonSchemaCompat(tool.inputSchema!, { strictUnions: true, pipeStrategy: "input" }),
      },
      ...(tool.outputSchema ? {
        outputSchema: {
          type: "object" as const,
          ...toJsonSchemaCompat(
            name === AGENT_WORK_REPORT_TOOL_NAME ? AGENT_WORK_REPORT_OUTPUT_SCHEMA : tool.outputSchema,
            { strictUnions: true, pipeStrategy: "output" },
          ),
        },
      } : {}),
      annotations: tool.annotations,
      execution: tool.execution,
      _meta: tool._meta,
    })),
  }));
}
