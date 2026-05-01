import { randomUUID } from "node:crypto";
import type { MoonPaySession } from "./auth.js";
import { classifyError, MoonPayApiError, type MoonPayErrorPayload } from "./errors.js";
import {
  CardOnboardingFinishSchema,
  CardOnboardingStartSchema,
  CardTransactionListSchema,
  CardWalletCheckSchema,
  CardWalletLinkSchema,
  CardWalletUnlinkSchema,
} from "./schemas.js";
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
  MoonPayClientOptions,
  UserRetrieveResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://agents.moonpay.com";
const DEFAULT_AGENT = "dexter";
const DEFAULT_CLI_VERSION = "1.42.2";
const DEFAULT_TIMEOUT_MS = 30_000;
const TOOL_PATH_PREFIX = "/api/tools/";

export class MoonPayClient {
  private readonly staticJwt: string | null;
  private readonly session: MoonPaySession | null;
  private readonly baseUrl: string;
  private readonly agent: string;
  private readonly agentId: string;
  private readonly cliVersion: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: MoonPayClientOptions) {
    const hasJwt = "jwt" in opts && typeof opts.jwt === "string" && opts.jwt.length > 0;
    const hasSession = "session" in opts && opts.session != null;
    if (hasJwt === hasSession) {
      throw new Error(
        "MoonPayClient: provide exactly one of { jwt } or { session }",
      );
    }
    this.staticJwt = hasJwt ? (opts as { jwt: string }).jwt : null;
    this.session = hasSession ? (opts as { session: MoonPaySession }).session : null;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.agent = opts.agent ?? DEFAULT_AGENT;
    this.agentId = opts.agentId ?? randomUUID();
    this.cliVersion = opts.cliVersion ?? DEFAULT_CLI_VERSION;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async getJwt(): Promise<string> {
    if (this.staticJwt) return this.staticJwt;
    if (this.session) return this.session.getAccessToken();
    throw new Error("MoonPayClient: no auth source");
  }

  // -- Account ---------------------------------------------------------------

  userRetrieve(): Promise<UserRetrieveResponse> {
    return this.call("user_retrieve");
  }

  // -- Card lifecycle --------------------------------------------------------

  cardOnboardingStart(
    input: CardOnboardingStartInput,
  ): Promise<CardOnboardingStartResponse> {
    return this.call("card_onboarding_start", CardOnboardingStartSchema.parse(input));
  }

  cardOnboardingCheck(): Promise<CardOnboardingCheckResponse> {
    return this.call("card_onboarding_check");
  }

  cardOnboardingFinish(
    input: CardOnboardingFinishInput,
  ): Promise<CardCreateResponse> {
    return this.call("card_onboarding_finish", CardOnboardingFinishSchema.parse(input));
  }

  cardCreate(): Promise<CardCreateResponse> {
    return this.call("card_create");
  }

  cardRetrieve(): Promise<CardRetrieveResponse> {
    return this.call("card_retrieve");
  }

  cardFreeze(): Promise<CardRetrieveResponse> {
    return this.call("card_freeze");
  }

  cardUnfreeze(): Promise<CardRetrieveResponse> {
    return this.call("card_unfreeze");
  }

  cardReveal(): Promise<CardRevealResponse> {
    return this.call("card_reveal");
  }

  // -- Wallet linking --------------------------------------------------------

  cardWalletLink(input: CardWalletLinkInput): Promise<CardWalletEntry> {
    return this.call("card_wallet_link", CardWalletLinkSchema.parse(input));
  }

  cardWalletUnlink(input: CardWalletUnlinkInput): Promise<{ ok: true }> {
    return this.call("card_wallet_unlink", CardWalletUnlinkSchema.parse(input));
  }

  cardWalletCheck(input: CardWalletCheckInput): Promise<CardWalletEntry> {
    return this.call("card_wallet_check", CardWalletCheckSchema.parse(input));
  }

  cardWalletList(): Promise<{ wallets: CardWalletEntry[] }> {
    return this.call("card_wallet_list");
  }

  // -- Transactions ----------------------------------------------------------

  cardTransactionList(
    input: CardTransactionListInput = {},
  ): Promise<{ transactions: CardTransaction[]; nextPage?: number | null }> {
    return this.call(
      "card_transaction_list",
      CardTransactionListSchema.parse(input),
    );
  }

  // -- Internal --------------------------------------------------------------

  /**
   * Invoke any MoonPay tool by snake_case name. Use this as the escape hatch
   * for endpoints not yet typed by the client.
   */
  async call<T = unknown>(
    tool: string,
    body: Record<string, unknown> = {},
  ): Promise<T> {
    return this.callWithRetry<T>(tool, body, false);
  }

  private async callWithRetry<T>(
    tool: string,
    body: Record<string, unknown>,
    isRetry: boolean,
  ): Promise<T> {
    const url = `${this.baseUrl}${TOOL_PATH_PREFIX}${tool}`;
    const jwt = await this.getJwt();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
          "X-CLI-Version": this.cliVersion,
          "X-Agent": this.agent,
          "X-Agent-Id": this.agentId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // If we have a refreshable session and the JWT was stale, try once more.
    if (response.status === 401 && this.session && !isRetry) {
      await this.session.forceRefresh();
      return this.callWithRetry<T>(tool, body, true);
    }

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const raw = await response.text();
    const parsed: unknown = isJson && raw ? safeJsonParse(raw) : raw;

    if (!response.ok) {
      const payload = (isJson && parsed && typeof parsed === "object"
        ? parsed
        : { error: typeof parsed === "string" ? parsed : `HTTP ${response.status}` }) as MoonPayErrorPayload;
      throw classifyError(tool, response.status, payload);
    }

    if (!isJson) {
      throw new MoonPayApiError(tool, response.status, {
        error: `Expected JSON response, got ${contentType || "unknown content-type"}`,
      });
    }
    return parsed as T;
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
