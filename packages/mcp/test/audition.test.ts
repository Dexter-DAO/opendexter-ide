import { createServer, type RequestListener, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ apiBase: "" }));
vi.mock("../src/config.js", () => ({ getApiBase: () => config.apiBase }));
import { cliAudition } from "../src/tools/audition.js";

const servers: Server[] = [];
const sellerUrl = "https://seller.example/report?key=private-seller-key";
const scoredResult = {
  ok: true,
  origin: "https://seller.example",
  summary: { total: 1, registered: 1, failed: 0, avgScore: 90 },
  routes: [{ url: sellerUrl, auditOutcome: "scored", score: 90, previousScore: 80, delta: 10 }],
};

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test listener");
  return `http://127.0.0.1:${address.port}`;
}

function stdout(): string {
  return vi.mocked(console.log).mock.calls.map((call) => String(call[0])).join("\n");
}

function stderr(): string {
  return vi.mocked(console.error).mock.calls.map((call) => String(call[0])).join("\n");
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("audition over HTTP", () => {
  it("asks for plain JSON, preserves the full result, and keeps diagnostics off stdout", async () => {
    let requests = 0;
    let receivedBody = "";
    let encoding: string | undefined;
    let requestId: string | string[] | undefined;
    config.apiBase = await listen((req, res) => {
      requests++;
      encoding = req.headers["accept-encoding"];
      requestId = req.headers["x-request-id"];
      req.on("data", (chunk) => { receivedBody += String(chunk); });
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.setHeader("x-request-id", "server-request-123");
        res.setHeader("cf-ray", "a123-LHR");
        res.setHeader("set-cookie", "secret-session=do-not-print");
        if (encoding === "identity") res.end(JSON.stringify(scoredResult));
        else {
          res.setHeader("content-encoding", "gzip");
          res.end(gzipSync(JSON.stringify(scoredResult)));
        }
      });
    });

    await cliAudition(sellerUrl, { json: true, dev: false, verbose: true });

    expect(requests).toBe(1);
    expect(encoding).toBe("identity");
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.parse(receivedBody)).toEqual({ url: sellerUrl });
    expect(JSON.parse(stdout())).toEqual(scoredResult);
    expect(stderr()).toContain("server-request-123");
    expect(stderr()).toContain("a123-LHR");
    expect(stderr()).not.toContain("private-seller-key");
    expect(stderr()).not.toContain("secret-session");
    expect(process.exitCode).toBeUndefined();
  });

  it("reads valid gzip when the server ignores the identity request", async () => {
    config.apiBase = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
      res.end(gzipSync(JSON.stringify(scoredResult)));
    });
    await cliAudition(sellerUrl, { json: true, dev: false });
    expect(JSON.parse(stdout())).toEqual(scoredResult);
    expect(process.exitCode).toBeUndefined();
  });

  it("diagnoses a proxy that decodes gzip but retains its label, without a second audition", async () => {
    const upstream = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
      res.end(gzipSync(JSON.stringify(scoredResult)));
    });
    let requests = 0;
    config.apiBase = await listen(async (_req, res) => {
      requests++;
      const upstreamResponse = await fetch(upstream);
      const decoded = await upstreamResponse.text();
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": upstreamResponse.headers.get("content-encoding")!,
        "x-request-id": "proxy-request-456",
      });
      res.end(decoded);
    });

    await cliAudition(sellerUrl, { json: true, dev: false });

    expect(JSON.parse(stdout())).toMatchObject({
      error: "audition_response_unreadable", stage: "read_response", httpStatus: 200,
      causeCode: "Z_DATA_ERROR", serverRequestId: "proxy-request-456", noRetry: true,
    });
    expect(JSON.parse(stdout()).message).toContain("may already have run");
    expect(JSON.parse(stdout()).requestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(requests).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it("reports an HTML gateway failure without exposing its body", async () => {
    let requests = 0;
    config.apiBase = await listen((_req, res) => {
      requests++;
      res.writeHead(502, { "content-type": "text/html", "x-request-id": "unsafe id with spaces" });
      res.end("<h1>Gateway failure</h1><p>private-diagnostic-body</p>");
    });
    await cliAudition(sellerUrl, { json: true, dev: false, verbose: true });
    expect(JSON.parse(stdout())).toMatchObject({
      error: "audition_response_invalid", stage: "decode_response", httpStatus: 502, noRetry: true,
    });
    expect(stdout() + stderr()).not.toContain("private-diagnostic-body");
    expect(stdout() + stderr()).not.toContain("unsafe id");
    expect(requests).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it("preserves the server's error and cooldown information", async () => {
    config.apiBase = await listen((_req, res) => {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({
        error: "cooldown_active", code: "DEXTER_ORIGIN_COOLDOWN",
        message: "This service was recently auditioned.", cooldownUntil: "2026-09-28T19:00:00.000Z",
      }));
    });
    await cliAudition(sellerUrl, { json: true, dev: false });
    expect(JSON.parse(stdout())).toMatchObject({
      error: "cooldown_active", code: "DEXTER_ORIGIN_COOLDOWN", stage: "server_response",
      message: "This service was recently auditioned.", cooldownUntil: "2026-09-28T19:00:00.000Z",
      httpStatus: 429, noRetry: true,
    });
    expect(process.exitCode).toBe(1);
  });

  it("keeps the HTTP status when the connection closes partway through a reply", async () => {
    let requests = 0;
    config.apiBase = await listen((_req, res) => {
      requests++;
      res.writeHead(200, { "content-type": "application/json", "content-length": "4096" });
      res.write('{"ok":true');
      setTimeout(() => res.destroy(), 20);
    });
    await cliAudition(sellerUrl, { json: true, dev: false });
    expect(JSON.parse(stdout())).toMatchObject({
      error: "audition_response_unreadable", stage: "read_response", httpStatus: 200, noRetry: true,
    });
    expect(requests).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it("does not follow a redirect that would replay the POST", async () => {
    let requests = 0;
    config.apiBase = await listen((_req, res) => {
      requests++;
      res.writeHead(307, { location: "/another-audition" });
      res.end("Redirect");
    });
    await cliAudition(sellerUrl, { json: true, dev: false });
    expect(JSON.parse(stdout())).toMatchObject({ httpStatus: 307, noRetry: true });
    expect(requests).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it("reports a dropped connection as uncertain and leaves one request", async () => {
    let requests = 0;
    config.apiBase = await listen((req) => {
      requests++;
      req.socket.destroy();
    });
    await cliAudition(sellerUrl, { json: false, dev: false });
    expect(stderr()).toContain("before a reply arrived");
    expect(stderr()).toContain("may already have run");
    expect(stderr()).toContain("Stage: send_request; client reference:");
    expect(stderr()).toContain("Requested at:");
    expect(requests).toBe(1);
    expect(process.exitCode).toBe(1);
  });

  it.each([null, [], {}, { ok: true, summary: {}, routes: [null] }])(
    "rejects malformed JSON result shapes %#", async (result) => {
      config.apiBase = await listen((_req, res) => { res.end(JSON.stringify(result)); });
      await cliAudition(sellerUrl, { json: true, dev: false });
      expect(JSON.parse(stdout())).toMatchObject({ error: "audition_response_invalid", noRetry: true });
      expect(process.exitCode).toBe(1);
    },
  );

  it("shows pending registration without claiming a completed test", async () => {
    const result = { ...scoredResult, routes: [{ url: sellerUrl, auditOutcome: "pending", score: null }] };
    config.apiBase = await listen((_req, res) => { res.end(JSON.stringify(result)); });
    await cliAudition(sellerUrl, { json: false, dev: false });
    expect(stdout()).toContain("1/1 routes registered");
    expect(stdout()).toContain("0 scored, 1 pending, 0 incomplete");
    expect(stdout()).toContain("[pending]");
    expect(stdout()).toContain("Route registered; no paid test ran.");
    expect(stdout()).not.toContain("paid routes tested");
    expect(stdout()).not.toContain("Average score");
    expect(stdout()).not.toContain("Retry shortly");
    expect(process.exitCode).toBeUndefined();
  });

  it.each([false, true])("returns failure for incomplete results with JSON mode %s", async (json) => {
    const result = { ...scoredResult, routes: [{
      url: sellerUrl, auditOutcome: "incomplete", score: 90,
      incompleteReason: "OpenDexter could not fund this test.",
    }] };
    config.apiBase = await listen((_req, res) => { res.end(JSON.stringify(result)); });
    await cliAudition(sellerUrl, { json, dev: false });
    if (json) expect(JSON.parse(stdout())).toEqual(result);
    else {
      expect(stdout()).toContain("0 scored, 0 pending, 1 incomplete");
      expect(stdout()).toContain("[incomplete]");
      expect(stdout()).toContain("OpenDexter could not fund this test.");
      expect(stdout()).not.toContain("[90]");
      expect(stdout()).not.toContain("Average score");
    }
    expect(process.exitCode).toBe(1);
  });

  it("counts a saved route even when the registration summary calls its test skipped", async () => {
    const result = { ...scoredResult,
      summary: { total: 2, registered: 0, skipped: 1, failed: 1 },
      routes: [
        { url: sellerUrl, registered: true, outcome: "skipped", auditOutcome: "incomplete", score: null },
        { url: "https://seller.example/missing", registered: false, outcome: "failed" },
      ],
    };
    config.apiBase = await listen((_req, res) => { res.end(JSON.stringify(result)); });
    await cliAudition(sellerUrl, { json: false, dev: false });
    expect(stdout()).toContain("1/2 routes registered");
    expect(stdout()).toContain("0 scored, 0 pending, 2 incomplete");
    expect(process.exitCode).toBe(1);
  });

  it("shows a completed score and its change", async () => {
    config.apiBase = await listen((_req, res) => { res.end(JSON.stringify(scoredResult)); });
    await cliAudition(sellerUrl, { json: false, dev: false });
    expect(stdout()).toContain("1 scored, 0 pending, 0 incomplete");
    expect(stdout()).toContain("Average score: 90/100");
    expect(stdout()).toContain("Previous score: 80; change: +10");
    expect(process.exitCode).toBeUndefined();
  });
});
