import { randomUUID } from "node:crypto";
import { getApiBase } from "../config.js";

type AuditionStage = "send_request" | "read_response" | "decode_response" | "server_response";
type JsonObject = Record<string, any>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeReference(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,128}$/.test(value)
    ? value
    : undefined;
}

function causeCode(error: unknown): string | undefined {
  let current = error;
  for (let i = 0; i < 4 && isObject(current); i++) {
    const code = safeReference(current.code);
    if (code) return code;
    current = current.cause;
  }
  return undefined;
}

function routeState(route: JsonObject): "pending" | "incomplete" | "scored" {
  if (route.auditOutcome === "pending") return "pending";
  if (route.auditOutcome === "incomplete" || !Number.isFinite(route.score)) return "incomplete";
  return "scored";
}

/** Submit once: a lost reply can follow a paid test that already completed. */
export async function cliAudition(
  url: string,
  opts: { json: boolean; dev: boolean; verbose?: boolean },
): Promise<void> {
  const endpoint = `${getApiBase(opts.dev).replace(/\/+$/, "")}/api/public/discoverable`;
  const clientRequestId = randomUUID();
  const requestedAt = new Date().toISOString();
  let stage: AuditionStage = "send_request";
  let response: Response | undefined;

  function diagnostics() {
    return {
      clientRequestId,
      requestedAt,
      stage,
      ...(response ? {
        httpStatus: response.status,
        serverRequestId: safeReference(response.headers.get("x-request-id")),
        cfRay: safeReference(response.headers.get("cf-ray")),
      } : {}),
    };
  }

  function fail(error: string, message: string, extra: JsonObject = {}) {
    const payload = { error, message, ...diagnostics(), noRetry: true, ...extra };
    if (opts.json) console.log(JSON.stringify(payload, null, 2));
    else {
      console.error(`Audition failed: ${message}`);
      console.error(`  Stage: ${stage}; client reference: ${clientRequestId}`);
      console.error(`  Requested at: ${requestedAt}`);
      if (response) console.error(`  HTTP ${response.status}`);
      if (payload.serverRequestId) console.error(`  Server request: ${payload.serverRequestId}`);
      if (payload.cfRay) console.error(`  Cloudflare request: ${payload.cfRay}`);
    }
    process.exitCode = 1;
  }

  try {
    if (opts.verbose) {
      const parsed = new URL(endpoint);
      console.error(JSON.stringify({
        audition: "request", method: "POST", endpoint: `${parsed.origin}${parsed.pathname}`, clientRequestId, requestedAt,
      }));
    }
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Avoid compressed responses from older proxies that decode the body
        // but preserve Content-Encoding. Servers may still ignore this request.
        "accept-encoding": "identity",
        "x-request-id": clientRequestId,
      },
      body: JSON.stringify({ url }),
      // A 307/308 must not replay a paid audition at a different URL.
      redirect: "manual",
    });
    stage = "read_response";
    if (opts.verbose) console.error(JSON.stringify({
      audition: "response", ...diagnostics(),
      contentType: response.headers.get("content-type")?.split(";")[0].slice(0, 80),
      contentEncoding: safeReference(response.headers.get("content-encoding")),
    }));
    const body = await response.text();
    stage = "decode_response";
    const data: unknown = JSON.parse(body);
    if (!isObject(data)) throw new Error("invalid_audition_response");

    if (!response.ok || data.ok === false) {
      stage = "server_response";
      fail(
        typeof data.error === "string" ? data.error : "audition_failed",
        typeof data.message === "string" ? data.message : `OpenDexter returned HTTP ${response.status}.`,
        {
          ...(typeof data.code === "string" ? { code: data.code } : {}),
          ...(typeof data.cooldownUntil === "string" ? { cooldownUntil: data.cooldownUntil } : {}),
        },
      );
      return;
    }
    if (data.ok !== true || !isObject(data.summary) || !Array.isArray(data.routes) || !data.routes.every(isObject)) {
      throw new Error("invalid_audition_response");
    }

    const routes = data.routes as JsonObject[];
    const scored = routes.filter((route) => routeState(route) === "scored");
    const pending = routes.filter((route) => routeState(route) === "pending").length;
    const incomplete = routes.length - scored.length - pending;
    if (incomplete > 0 || data.summary.failed > 0) process.exitCode = 1;

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const summary = data.summary;
    const registered = routes.some((route) => typeof route.registered === "boolean")
      ? routes.filter((route) => route.registered === true).length
      : summary.registered ?? 0;
    console.log(`\nAudition: ${data.origin ?? url}`);
    console.log(`  ${registered}/${summary.total ?? routes.length} routes registered`);
    console.log(`  ${scored.length} scored, ${pending} pending, ${incomplete} incomplete`);
    if (scored.length) {
      const average = Math.round(scored.reduce((sum, route) => sum + route.score, 0) / scored.length);
      console.log(`  Average score: ${average}/100`);
    }
    for (const route of routes) {
      const state = routeState(route);
      if (state !== "scored") {
        console.log(`\n  [${state}] ${route.url}`);
        console.log(`      ${route.incompleteReason ?? (state === "pending"
          ? "Route registered; no paid test ran. Audition a specific endpoint URL to request an immediate test."
          : "This audition produced no score. Check the saved result before starting another audition.")}`);
        continue;
      }
      console.log(`\n  [${route.score}] ${route.url}`);
      if (typeof route.previousScore === "number" && typeof route.delta === "number") {
        const change = route.delta > 0 ? `+${route.delta}` : `${route.delta}`;
        console.log(`      Previous score: ${route.previousScore}; change: ${change}`);
      }
      if (route.verdict) console.log(`      ${route.verdict}`);
      if (route.fixInstructions) console.log(`      fix: ${route.fixInstructions}`);
      if (route.synthesizedSkill) console.log("      Agent-callable skill created");
      if (route.shareUrl) console.log(`      share: ${route.shareUrl}`);
    }
    console.log("");
  } catch (error: unknown) {
    const code = causeCode(error);
    const message = stage === "send_request"
      ? "The connection to OpenDexter failed before a reply arrived."
      : stage === "read_response"
        ? "OpenDexter returned a reply the CLI could not read."
        : `OpenDexter returned an unexpected reply${response ? ` (HTTP ${response.status})` : ""}.`;
    fail(
      stage === "send_request" ? "audition_connection_failed"
        : stage === "read_response" ? "audition_response_unreadable" : "audition_response_invalid",
      `${message} The audition may already have run. Ask OpenDexter support to check this request before starting another audition.`,
      code ? { causeCode: code } : {},
    );
  }
}
