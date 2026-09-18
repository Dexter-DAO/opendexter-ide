import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerHostedProxyTools, type HostedProxyOptions } from "../src/server/hosted-proxy.js";
import { AGENT_WORK_REPORT_OUTPUT_SCHEMA } from "../src/server/agent-work-report-contract.js";

const operationId = "219f981c-9215-4141-84f2-d89ffe9cbece";
const input = { operationId, expectedRevision: 0, state: "working", summary: "Checking the deployment logs" };
const report = {
  reportId: operationId, revision: 1, state: "working", summary: input.summary,
  source: "agent_report", observedAt: "2026-09-18T12:00:00.000Z", expiresAt: "2026-09-18T12:05:00.000Z",
};
const acknowledgment = { namespace: "dexter-agent-work-report-ack/v1", operationId, replayed: false, report };
const apiError = {
  namespace: "dexter-agent-work-report-error/v1", code: "agent_work_revision_conflict",
  retryable: false, operationId, retryWithSameOperationOnly: false,
  currentRevision: 1, currentReport: report,
};
const localError = {
  namespace: "opendexter-agent-work-report-local-error/v1", code: "rate_limited",
  operationId, retryable: true, retryWithSameOperationOnly: true, retryAfterMs: 2_000,
};

const close: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of close.splice(0)) await cleanup(); });

async function setup(callTool: NonNullable<HostedProxyOptions["callTool"]>) {
  const server = new McpServer({ name: "report-proxy-test", version: "1" });
  const readAuthorityStatus = vi.fn(async () => { throw new Error("report must not read financial authority"); });
  registerHostedProxyTools(server, { callTool, readAuthorityStatus });
  const client = new Client({ name: "report-proxy-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  close.push(async () => {
    await client.close(); await server.close();
    expect(readAuthorityStatus).not.toHaveBeenCalled();
  });
  const listed = (await client.listTools()).tools.find(({ name }) => name === "dexter_report_work")!;
  return { client, listed };
}

function result(body: Record<string, unknown>, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: `Work report saved: ${input.summary}` }],
    structuredContent: body,
    isError,
    _meta: { "dexter/agentWorkReportRequest": { operationId }, preserved: "hosted metadata" },
  };
}

describe("hosted work report proxy", () => {
  it("advertises both strict input branches and all three typed output branches", async () => {
    const { listed } = await setup(vi.fn());
    expect(listed.inputSchema.type).toBe("object");
    expect(listed.inputSchema.anyOf).toHaveLength(2);
    expect(listed.outputSchema!.anyOf).toHaveLength(3);
    const validate = new AjvJsonSchemaValidator().getValidator(listed.inputSchema);
    expect(validate(input).valid).toBe(true);
    expect(validate({ operationId, state: "idle" }).valid).toBe(true);
    expect(validate({ operationId, state: "idle", summary: null }).valid).toBe(true);
    for (const state of ["working", "waiting", "blocked", "completed", "failed"]) {
      expect(validate({ operationId, state }).valid).toBe(false);
      expect(validate({ operationId, state, summary: null }).valid).toBe(false);
    }
    for (const identity of ["agentId", "wallet", "mcpSessionId", "grantId", "accessToken"]) {
      expect(validate({ ...input, [identity]: "caller-supplied" }).valid).toBe(false);
    }
    expect(listed.annotations).toEqual({
      readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    });
  });

  it.each([
    ["acknowledgment", acknowledgment, false],
    ["API conflict", apiError, true],
    ["hosted local error", localError, true],
  ] as const)("preserves %s with its complete plain text and metadata", async (_, body, isError) => {
    const hosted = result(body, isError);
    const callTool = vi.fn(async () => hosted);
    const { client, listed } = await setup(callTool);
    const response = await client.callTool({ name: "dexter_report_work", arguments: input });
    expect(response).toEqual(hosted);
    expect(AGENT_WORK_REPORT_OUTPUT_SCHEMA.safeParse(response.structuredContent).success).toBe(true);
    expect(new AjvJsonSchemaValidator().getValidator(listed.outputSchema!)(response.structuredContent).valid).toBe(true);
    expect(callTool).toHaveBeenCalledExactlyOnceWith("dexter_report_work", input, false);
  });

  it.each([false, true])("preserves an ordinary hosted auth error with structured content %s", async (structured) => {
    const hosted: CallToolResult = {
      isError: true, content: [{ type: "text", text: "Connect this agent to OpenDexter." }],
      _meta: { "mcp/www_authenticate": ["Bearer realm=opendexter"] },
      ...(structured ? { structuredContent: { mode: "authentication_required", reason: "vault_oauth_required" } } : {}),
    };
    const { client } = await setup(vi.fn(async () => hosted));
    if (structured) {
      // Preserve an ordinary protocol error without claiming it satisfies the
      // report output union. SDK 1.30 validates even isError structured bodies.
      expect(await client.request({
        method: "tools/call", params: { name: "dexter_report_work", arguments: input },
      }, CallToolResultSchema)).toEqual(hosted);
      await expect(client.callTool({ name: "dexter_report_work", arguments: input }))
        .rejects.toThrow("Structured content does not match the tool's output schema");
    } else {
      expect(await client.callTool({ name: "dexter_report_work", arguments: input })).toEqual(hosted);
    }
  });

  it("normalizes idle defaults once before forwarding", async () => {
    const callTool = vi.fn(async (_name, args) => result({
      ...acknowledgment, report: { ...report, state: args.state, summary: args.summary },
    }));
    const { client } = await setup(callTool);
    await client.callTool({ name: "dexter_report_work", arguments: { operationId, state: "idle" } });
    expect(callTool).toHaveBeenCalledExactlyOnceWith("dexter_report_work", {
      operationId, expectedRevision: 0, state: "idle", summary: null,
    }, false);
  });

  it.each([
    { ...input, summary: undefined },
    { ...input, summary: " unsafe whitespace " },
    { ...input, summary: "two\nlines" },
    { ...input, agentId: "choose-another-agent" },
  ])("rejects invalid input before hosted dispatch %#", async (args) => {
    const callTool = vi.fn();
    const { client } = await setup(callTool);
    expect((await client.callTool({ name: "dexter_report_work", arguments: args })).isError).toBe(true);
    expect(callTool).not.toHaveBeenCalled();
  });

  it.each([
    ["transport closed after dispatch", "transport_failed", true],
    ["connect_required_for_hosted_dexter_report_work", "configuration_unavailable", false],
  ] as const)("returns a typed local error for %s", async (message, code, retryable) => {
    const callTool = vi.fn(async () => { throw new Error(message); });
    const { client, listed } = await setup(callTool);
    const response = await client.callTool({ name: "dexter_report_work", arguments: input });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toEqual({
      namespace: "opendexter-agent-work-report-local-error/v1", code, operationId,
      retryable, retryWithSameOperationOnly: true, retryAfterMs: null,
    });
    expect(AGENT_WORK_REPORT_OUTPUT_SCHEMA.safeParse(response.structuredContent).success).toBe(true);
    expect(new AjvJsonSchemaValidator().getValidator(listed.outputSchema!)(response.structuredContent).valid).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("gives reconnect guidance when the hosted bearer was explicitly rejected", async () => {
    const callTool = vi.fn(async () => {
      throw new Error("connected_session_rejected_no_automatic_retry; restore the same agent connection");
    });
    const { client } = await setup(callTool);
    const response = await client.callTool({ name: "dexter_report_work", arguments: input });
    expect(response.structuredContent).toMatchObject({
      namespace: "opendexter-agent-work-report-local-error/v1",
      code: "transport_failed", operationId, retryWithSameOperationOnly: true,
    });
    expect(response.content).toEqual([{
      type: "text",
      text: "Restore the same registered agent's OpenDexter connection, then recover this report with the same operationId and identical content.",
    }]);
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
