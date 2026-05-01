/**
 * MoonPay Agents authentication.
 *
 * MoonPay exposes its own auth surface at agents.moonpay.com (a thin
 * server-side wrapper over Supabase) so callers don't need MoonPay's
 * Supabase project credentials. Three endpoints:
 *
 *   POST /api/tools/login   { email, captchaToken }   → triggers OTP email
 *   POST /api/tools/verify  { email, code }           → returns Session
 *   POST /api/tools/refresh { refreshToken }          → returns Session
 *
 * Sessions consist of:
 *   - accessToken: Supabase JWT, ~1 hour TTL
 *   - refreshToken: opaque MoonPay token, rotated on every refresh
 *   - expiresAt: unix seconds for the accessToken
 *
 * The {@link MoonPaySession} class owns the lifecycle: it fetches a
 * fresh JWT on demand and rotates the refresh token when the API
 * issues a new one. Callers persist the resulting tokens however they
 * want (env vars, encrypted file, KMS, etc.) via {@link SessionStore}.
 */

import { MoonPayApiError, type MoonPayErrorPayload } from "./errors.js";

const DEFAULT_BASE_URL = "https://agents.moonpay.com";
const TOOL_PATH_PREFIX = "/api/tools/";

/** Refresh proactively this many seconds before expiry. */
const REFRESH_LEEWAY_SECONDS = 60;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds when accessToken expires. */
  expiresAt: number;
}

export interface SessionStore {
  load(): Promise<SessionTokens | null> | SessionTokens | null;
  save(tokens: SessionTokens): Promise<void> | void;
  clear?(): Promise<void> | void;
}

export interface MoonPayAuthOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. Default: 15_000. */
  timeoutMs?: number;
}

/** In-memory store for tests and short-lived processes. */
export class MemorySessionStore implements SessionStore {
  private tokens: SessionTokens | null = null;
  constructor(initial?: SessionTokens) {
    this.tokens = initial ?? null;
  }
  load(): SessionTokens | null {
    return this.tokens;
  }
  save(tokens: SessionTokens): void {
    this.tokens = tokens;
  }
  clear(): void {
    this.tokens = null;
  }
}

async function postJson<T>(
  baseUrl: string,
  tool: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<T> {
  const url = `${baseUrl}${TOOL_PATH_PREFIX}${tool}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = { error: raw || `HTTP ${response.status}` };
  }
  if (!response.ok) {
    const payload = (parsed && typeof parsed === "object"
      ? parsed
      : { error: String(parsed) }) as MoonPayErrorPayload;
    throw new MoonPayApiError(tool, response.status, payload);
  }
  return parsed as T;
}

/**
 * Trigger an OTP email. MoonPay requires a captcha token from a
 * third-party widget (hCaptcha / Turnstile, depending on deployment).
 * For server-side / automation use, request a captcha bypass when
 * opening a partnership with MoonPay.
 */
export async function login(
  input: { email: string; captchaToken: string },
  opts: MoonPayAuthOptions = {},
): Promise<{ ok: true }> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  await postJson(baseUrl, "login", input, fetchImpl, timeoutMs);
  return { ok: true };
}

/**
 * Exchange an OTP code for a session.
 */
export async function verify(
  input: { email: string; code: string },
  opts: MoonPayAuthOptions = {},
): Promise<SessionTokens> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const tokens = await postJson<SessionTokens>(baseUrl, "verify", input, fetchImpl, timeoutMs);
  assertSessionShape(tokens);
  return tokens;
}

/**
 * Mint a fresh access token from a refresh token. The response includes
 * a rotated refresh token; persist it to keep the session alive.
 */
export async function refresh(
  input: { refreshToken: string },
  opts: MoonPayAuthOptions = {},
): Promise<SessionTokens> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const tokens = await postJson<SessionTokens>(baseUrl, "refresh", input, fetchImpl, timeoutMs);
  assertSessionShape(tokens);
  return tokens;
}

function assertSessionShape(t: unknown): asserts t is SessionTokens {
  if (
    !t ||
    typeof t !== "object" ||
    typeof (t as SessionTokens).accessToken !== "string" ||
    typeof (t as SessionTokens).refreshToken !== "string" ||
    typeof (t as SessionTokens).expiresAt !== "number"
  ) {
    throw new MoonPayApiError("verify_or_refresh", 500, {
      error: "Unexpected session shape returned by MoonPay",
    });
  }
}

/**
 * Manages a long-lived MoonPay session. Reads from a {@link SessionStore},
 * proactively refreshes before expiry, and persists rotated tokens back
 * to the store. Safe to share across many calls; concurrent
 * {@link getAccessToken} requests collapse into a single refresh.
 */
export class MoonPaySession {
  private readonly store: SessionStore;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private inflightRefresh: Promise<SessionTokens> | null = null;

  constructor(store: SessionStore, opts: MoonPayAuthOptions = {}) {
    this.store = store;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  /** Replace stored tokens (e.g., after first login). */
  async setTokens(tokens: SessionTokens): Promise<void> {
    await this.store.save(tokens);
  }

  /** Drop stored tokens. */
  async logout(): Promise<void> {
    if (this.store.clear) await this.store.clear();
  }

  /**
   * Return a non-expired access token, refreshing if necessary.
   * Throws if no tokens are stored or the refresh fails.
   */
  async getAccessToken(): Promise<string> {
    const tokens = await this.store.load();
    if (!tokens) {
      throw new MoonPayApiError("session", 401, {
        error: "No MoonPay session. Run verify() first.",
      });
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (tokens.expiresAt - REFRESH_LEEWAY_SECONDS > nowSeconds) {
      return tokens.accessToken;
    }
    const refreshed = await this.coalescedRefresh(tokens.refreshToken);
    return refreshed.accessToken;
  }

  /** Force a refresh and return the new tokens. */
  async forceRefresh(): Promise<SessionTokens> {
    const tokens = await this.store.load();
    if (!tokens) {
      throw new MoonPayApiError("session", 401, {
        error: "No MoonPay session. Run verify() first.",
      });
    }
    return this.coalescedRefresh(tokens.refreshToken);
  }

  private async coalescedRefresh(refreshToken: string): Promise<SessionTokens> {
    if (this.inflightRefresh) return this.inflightRefresh;
    this.inflightRefresh = (async () => {
      try {
        const next = await refresh(
          { refreshToken },
          {
            baseUrl: this.baseUrl,
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs,
          },
        );
        await this.store.save(next);
        return next;
      } finally {
        this.inflightRefresh = null;
      }
    })();
    return this.inflightRefresh;
  }
}
