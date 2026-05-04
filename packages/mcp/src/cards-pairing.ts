/**
 * Local CLI auto-pairing flow for Dextercard sessions.
 *
 * When the npm CLI's CardsAdapter has no encrypted session on disk, this
 * helper drives the dexter.cash connector OAuth flow on the user's
 * behalf — mint a request_id, hand the user a clickable login URL, and
 * on subsequent calls poll dexter-api until they finish signing in. On
 * completion we receive the user's Dextercard SessionTokens directly
 * from /api/connector/oauth/redeem-dextercard and persist them to the
 * adapter's existing encrypted store. Future tool calls then resume
 * normally and never see this code path again.
 *
 * Pairing state lives at ~/.config/dexter/dextercard-pairing.json (mode
 * 0600) keyed only by request_id + login_url + minted_at. There's no
 * sensitive data in this file — just a one-shot capability the CLI is
 * holding while waiting for the browser flow to complete.
 *
 * Single-machine, single-user, single pending pairing at a time. If a
 * second pairing is minted while one is in flight, the newer overwrites
 * the older — last-mint-wins is the right policy here because a user
 * actively re-triggering a pairing means the previous one is stale.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SessionTokens } from "@dexterai/dextercard";

const PAIRING_TTL_MS = 10 * 60 * 1000; // mints are good for 10 min

export interface PairingState {
  requestId: string;
  loginUrl: string;
  mintedAt: number;
}

export interface PairingMintResponse {
  ok: boolean;
  request_id: string;
  login_url: string;
  client_id: string;
  redirect_uri: string;
  state: string | null;
  scope: string | null;
}

export type RedeemResponse =
  | { status: "pending" }
  | { status: "completed"; email: string | null; dextercard: SessionTokens }
  | { status: "no_dextercard_session"; email: string | null; tip?: string }
  | { status: "expired" | "not_found" | "consumed" };

export interface PairingClientOpts {
  apiBaseUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  pairingFilePath: string;
}

export interface PairingClient {
  /**
   * Get the current pending pairing state from disk, or null if none
   * exists or the existing one has aged past TTL.
   */
  load(): PairingState | null;
  /**
   * Mint a fresh pairing request_id + login URL via dexter-api and
   * persist it to disk. Overwrites any existing pending pairing.
   */
  mint(): Promise<PairingState>;
  /**
   * Poll dexter-api for the result of the given request_id. Returns
   * the parsed response. The caller is responsible for handling each
   * status branch.
   */
  redeem(requestId: string): Promise<RedeemResponse>;
  /**
   * Drop the on-disk pairing state. Called after a successful redeem
   * (since the request_id is single-use) or when the user explicitly
   * cancels via `dextercard logout`.
   */
  clear(): void;
}

export function createPairingClient(opts: PairingClientOpts): PairingClient {
  const scope = opts.scope ?? "dextercard";

  function ensureDir(): void {
    const dir = dirname(opts.pairingFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  return {
    load(): PairingState | null {
      try {
        if (!existsSync(opts.pairingFilePath)) return null;
        const raw = readFileSync(opts.pairingFilePath, "utf8").trim();
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PairingState;
        if (!parsed?.requestId || !parsed?.loginUrl || typeof parsed.mintedAt !== "number") {
          return null;
        }
        if (Date.now() - parsed.mintedAt > PAIRING_TTL_MS) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    async mint(): Promise<PairingState> {
      const url = new URL(`${opts.apiBaseUrl}/api/connector/oauth/authorize`);
      url.searchParams.set("client_id", opts.clientId);
      url.searchParams.set("redirect_uri", opts.redirectUri);
      url.searchParams.set("scope", scope);
      url.searchParams.set("response_mode", "json");

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`pairing_mint_failed status=${res.status} body=${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as PairingMintResponse;
      if (!json?.ok || !json?.request_id || !json?.login_url) {
        throw new Error("pairing_mint_invalid_response");
      }

      const state: PairingState = {
        requestId: String(json.request_id),
        loginUrl: String(json.login_url),
        mintedAt: Date.now(),
      };

      ensureDir();
      writeFileSync(opts.pairingFilePath, JSON.stringify(state, null, 2), { mode: 0o600 });

      return state;
    },

    async redeem(requestId: string): Promise<RedeemResponse> {
      const url = new URL(`${opts.apiBaseUrl}/api/connector/oauth/redeem-dextercard`);
      url.searchParams.set("request_id", requestId);

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`pairing_redeem_failed status=${res.status} body=${text.slice(0, 200)}`);
      }
      return (await res.json()) as RedeemResponse;
    },

    clear(): void {
      try {
        if (existsSync(opts.pairingFilePath)) {
          unlinkSync(opts.pairingFilePath);
        }
      } catch {
        /* non-fatal */
      }
    },
  };
}

/**
 * Build the absolute path to the pairing-state file inside the same
 * config dir the CardsAdapter uses for its encrypted session store.
 */
export function pairingFilePath(configDir: string): string {
  return join(configDir, "dextercard-pairing.json");
}
