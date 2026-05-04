/**
 * Remote {@link CardOperations} backed by an HTTP+HMAC service surface.
 *
 * Used by hosted MCP servers (the public open MCP today) that
 * intentionally do NOT hold the user's carrier session in-process.
 * Every method round-trips to the consumer-supplied base URL (e.g.
 * dexter-api `/internal/dextercard/*`) carrying:
 *
 *   X-Acting-User-Id:        <supabase user uuid>
 *   X-Internal-Timestamp:    <unix ms>
 *   X-Internal-Signature:    hex(hmac_sha256(secret, `${ts}.${userId}.${rawBody}`))
 *
 * Error parity with the local SDK is the contract that lets the same
 * registrars consume both adapters:
 *
 *   HTTP 404 + body.code === "no_account"        → DextercardNoAccountError
 *   HTTP 403 + body.code === "region_unavailable" → DextercardRegionUnavailableError
 *   HTTP 4xx/5xx + body.code === "carrier_error" → DextercardApiError
 *   HTTP 409 + body.code === "dextercard_login_required" → DextercardLoginRequiredError
 *   anything else (transport, 5xx without code)  → DextercardApiError
 *
 * The 409 case is the one that doesn't exist in the local SDK — it
 * means "the user is paired but hasn't completed carrier OTP login yet."
 * Local consumers never see it because they wouldn't have been able to
 * resume a session in the first place. We expose a new dedicated error
 * class so registrars (and consumers) can branch on it precisely.
 */

import { createHmac } from "node:crypto";
import {
  DextercardApiError,
  DextercardNoAccountError,
  DextercardRegionUnavailableError,
} from "@dexterai/dextercard";
import type {
  CardCreateResponse,
  CardOnboardingCheckResponse,
  CardOnboardingFinishInput,
  CardOnboardingStartInput,
  CardOnboardingStartResponse,
  CardRetrieveResponse,
  CardRevealResponse,
  CardTransaction,
  CardTransactionListInput,
  CardWalletCheckInput,
  CardWalletEntry,
  CardWalletLinkInput,
  CardWalletUnlinkInput,
  UserRetrieveResponse,
} from "@dexterai/dextercard";
import type { CardOperations } from "./card-operations.js";

/**
 * Surfaced when the remote service reports HTTP 409
 * `dextercard_login_required` — i.e., the bound user has not yet
 * completed carrier OTP login. Registrars treat this similarly to
 * `DextercardNoAccountError` but with a distinct stage marker so
 * the agent can route the user to the dextercard login page rather
 * than collecting onboarding inputs.
 */
export class DextercardLoginRequiredError extends DextercardApiError {
  readonly loginUrl: string | null;
  constructor(tool: string, status: number, payload: any, loginUrl: string | null) {
    super(tool, status, payload || { error: "Dextercard session not configured." });
    this.name = "DextercardLoginRequiredError";
    this.loginUrl = loginUrl;
  }
}

/**
 * Thrown when the consumer has no Dexter account binding for the
 * current MCP session — the user must visit a pairing URL on
 * dexter.cash, sign in, and approve the connection. After successful
 * pairing, retrying the tool call will succeed.
 *
 * Distinct from {@link DextercardLoginRequiredError}: that one means
 * "we know who you are but you haven't completed Dextercard OTP yet."
 * This one means "we don't yet know who you are."
 *
 * Hosted MCP servers (like the open MCP) throw this from their
 * adapter when no binding exists for the current request and the
 * server has minted a pairing request_id.
 */
export class DextercardPairingRequiredError extends DextercardApiError {
  readonly pairingUrl: string;
  readonly requestId: string | null;
  constructor(pairingUrl: string, requestId: string | null = null, tool = "card") {
    super(tool, 401, {
      error: "Sign in to your Dexter account to use Dextercard tools.",
    });
    this.name = "DextercardPairingRequiredError";
    this.pairingUrl = pairingUrl;
    this.requestId = requestId;
  }
}

export interface RemoteCardOperationsOptions {
  /** Base URL of the dexter-api host, no trailing slash. */
  baseUrl: string;
  /** Supabase user UUID this operations object will act on behalf of. */
  userId: string;
  /** Shared HMAC secret matching the server's INTERNAL_DEXTERCARD_HMAC_SECRET. */
  hmacSecret: string;
  /** Optional fetch override (testing, retries, etc). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Optional per-request timeout in ms. Default 30000. */
  timeoutMs?: number;
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build a {@link CardOperations} that talks to a remote
 * `/internal/dextercard/*` surface. Never holds a carrier JWT in
 * process; every method is one HMAC-signed HTTP call.
 */
export function createRemoteCardOperations(
  opts: RemoteCardOperationsOptions,
): CardOperations {
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const userId = opts.userId;

  if (!UUID_RX.test(userId)) {
    throw new Error(`createRemoteCardOperations: invalid userId ${userId}`);
  }
  if (!opts.hmacSecret || opts.hmacSecret.length < 32) {
    throw new Error("createRemoteCardOperations: hmacSecret must be ≥ 32 chars");
  }

  function sign(ts: string, rawBody: string): string {
    return createHmac("sha256", opts.hmacSecret)
      .update(`${ts}.${userId}.${rawBody}`)
      .digest("hex");
  }

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}/internal/dextercard${path}`;
    const ts = String(Date.now());
    const rawBody = body == null ? "" : JSON.stringify(body);
    const signature = sign(ts, rawBody);
    const tool = path.replace(/^\//, "").replace(/\//g, "_");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Acting-User-Id": userId,
          "X-Internal-Timestamp": ts,
          "X-Internal-Signature": signature,
        },
        body: method === "GET" ? undefined : rawBody,
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new DextercardApiError(tool, 0, {
        error: err?.message || "network_error",
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text };
    }

    if (res.ok) {
      return payload as T;
    }

    // Map known typed errors back to SDK-shaped throws.
    const code = payload?.code as string | undefined;
    const errorPayload = {
      error: payload?.error || `dextercard ${tool} failed (${res.status})`,
      tool,
      ...(payload && typeof payload === "object" ? payload : {}),
    };

    if (res.status === 409 && code === "dextercard_login_required") {
      throw new DextercardLoginRequiredError(
        tool,
        res.status,
        errorPayload,
        typeof payload?.loginUrl === "string" ? payload.loginUrl : null,
      );
    }
    if (res.status === 404 && code === "no_account") {
      throw new DextercardNoAccountError(tool, res.status, errorPayload);
    }
    if (res.status === 403 && code === "region_unavailable") {
      throw new DextercardRegionUnavailableError(
        tool,
        res.status,
        errorPayload,
        typeof payload?.region === "string" ? payload.region : null,
      );
    }
    throw new DextercardApiError(tool, res.status, errorPayload);
  }

  return {
    userRetrieve(): Promise<UserRetrieveResponse> {
      return call("GET", "/user");
    },
    cardRetrieve(): Promise<CardRetrieveResponse> {
      return call("GET", "/card");
    },
    cardCreate(): Promise<CardCreateResponse> {
      return call("POST", "/card/create");
    },
    cardReveal(): Promise<CardRevealResponse> {
      return call("POST", "/card/reveal");
    },
    cardFreeze(): Promise<CardRetrieveResponse> {
      return call("POST", "/card/freeze");
    },
    cardUnfreeze(): Promise<CardRetrieveResponse> {
      return call("POST", "/card/unfreeze");
    },
    cardOnboardingStart(input: CardOnboardingStartInput): Promise<CardOnboardingStartResponse> {
      return call("POST", "/onboarding/start", input);
    },
    cardOnboardingCheck(): Promise<CardOnboardingCheckResponse> {
      return call("POST", "/onboarding/check");
    },
    cardOnboardingFinish(input: CardOnboardingFinishInput): Promise<CardCreateResponse> {
      return call("POST", "/onboarding/finish", input);
    },
    cardWalletList(): Promise<{ wallets: CardWalletEntry[] }> {
      return call("GET", "/wallets");
    },
    cardWalletLink(input: CardWalletLinkInput): Promise<CardWalletEntry> {
      return call("POST", "/wallet/link", input);
    },
    cardWalletUnlink(input: CardWalletUnlinkInput): Promise<{ ok: true }> {
      return call("POST", "/wallet/unlink", input);
    },
    cardWalletCheck(input: CardWalletCheckInput): Promise<CardWalletEntry> {
      return call("POST", "/wallet/check", input);
    },
    cardTransactionList(
      input: CardTransactionListInput,
    ): Promise<{ transactions: CardTransaction[] }> {
      return call("POST", "/transactions", input);
    },
  };
}
