import { homedir } from "node:os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  Dextercard,
  DextercardSession,
  EncryptedFileSessionStore,
  LoginFlow,
} from "@dexterai/dextercard";
import {
  DextercardPairingRequiredError,
  LocalCardOperations,
  type CardsAdapter,
  type CardOperations,
} from "@dexterai/x402-mcp-tools";
import {
  createPairingClient,
  pairingFilePath,
  type PairingClient,
} from "./cards-pairing.js";

/**
 * npm CLI implementation of the CardsAdapter contract.
 *
 * Sources the Dextercard session from an AES-256-GCM-encrypted file
 * under ~/.config/dexter/, keyed off a machine-bound random key
 * persisted alongside it. On first call, resumes the session via
 * LoginFlow.resume() (which forces a refresh-token rotation, then
 * caches the resulting Dextercard for the rest of the process.
 *
 * If the session file doesn't exist or the resume fails, getClient()
 * returns null and the registrars surface a friendly "configure
 * session" hint via composeCardTools.noSessionTip.
 */

const CONFIG_DIR_ENV = "DEXTERCARD_CONFIG_DIR";
const KEY_FILE = ".dextercard-key";
const SESSION_FILE = "dextercard.enc";
const DEFAULT_CONFIG_DIR = join(homedir(), ".config", "dexter");

function resolveConfigDir(): string {
  return process.env[CONFIG_DIR_ENV] || DEFAULT_CONFIG_DIR;
}

function ensureKey(configDir: string): string {
  const path = join(configDir, KEY_FILE);
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8").trim();
    if (raw) return raw;
  }
  const fresh = randomBytes(32).toString("hex");
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(path, fresh, { mode: 0o600 });
  return fresh;
}

export interface NpmCardsAdapterState {
  /** Path to the encrypted session file. */
  sessionPath: string;
  /** Path to the local encryption key. */
  keyPath: string;
  /** Whether a session file currently exists. */
  hasSession: boolean;
  /** The Dextercard email if we've already resumed once this process. */
  email: string | null;
}

export interface NpmCardsAdapter extends CardsAdapter {
  state(): NpmCardsAdapterState;
  /** Persist a new session (called by the `dextercard login` CLI flow). */
  saveSession(tokens: import("@dexterai/dextercard").SessionTokens): void;
  /** Drop the session file (called by `dextercard logout`). */
  clear(): void;
  /** Get the underlying store for advanced uses. */
  getStore(): EncryptedFileSessionStore;
}

/**
 * Build the npm-CLI Dextercard adapter. Memoizes a Dextercard
 * instance per process; if the session can't be resumed, getClient()
 * returns null and stays null until saveSession() is called.
 */
export function createNpmCardsAdapter(): NpmCardsAdapter {
  const configDir = resolveConfigDir();
  const sessionPath = join(configDir, SESSION_FILE);
  const keyPath = join(configDir, KEY_FILE);
  const key = ensureKey(configDir);
  const store = new EncryptedFileSessionStore(sessionPath, key);

  // Auto-pairing config. When set, getOperations() will mint a
  // dexter.cash connector OAuth request_id and throw
  // DextercardPairingRequiredError on no_session, instead of returning
  // null and letting the agent surface the static "run npx dextercard
  // login" tip. The shared registrars catch the error and turn it into
  // a clean { stage: "auth_required", pairingUrl } tool result.
  //
  // Disabled by default for hygiene — set OPENDEXTER_AUTOPAIR=1 (and
  // optionally OPENDEXTER_API_BASE_URL / OPENDEXTER_PAIRING_CLIENT_ID /
  // OPENDEXTER_PAIRING_REDIRECT_URI to override) to enable. The
  // production npm CLI sets this to 1 by default at build time.
  const pairingEnabled = (process.env.OPENDEXTER_AUTOPAIR || "1").trim() !== "0";
  const pairingApiBase = (process.env.OPENDEXTER_API_BASE_URL || "https://api.dexter.cash").replace(/\/+$/, "");
  const pairingClientId = (process.env.OPENDEXTER_PAIRING_CLIENT_ID || "cid_opendexter_open_mcp").trim();
  const pairingRedirectUri = (process.env.OPENDEXTER_PAIRING_REDIRECT_URI || "https://dexter.cash/connector/auth/done").trim();

  const pairing: PairingClient | null = pairingEnabled
    ? createPairingClient({
        apiBaseUrl: pairingApiBase,
        clientId: pairingClientId,
        redirectUri: pairingRedirectUri,
        scope: "dextercard",
        pairingFilePath: pairingFilePath(configDir),
      })
    : null;

  let cachedClient: Dextercard | null = null;
  let cachedOps: CardOperations | null = null;
  let cachedEmail: string | null = null;
  let resumeAttempted = false;
  // Per-process throttle so we don't slam dexter-api with poll requests
  // when a card tool is called repeatedly in quick succession.
  let lastPollAt = 0;
  const POLL_THROTTLE_MS = 1000;

  /**
   * Try to satisfy a pending pairing without minting a fresh one. Returns:
   *   - CardOperations if the user finished signing in and we just saved
   *     their tokens (caller can return ops directly)
   *   - null if there's no pending pairing or it's expired
   *   - throws DextercardPairingRequiredError if pairing is still pending
   */
  async function tryResolvePending(): Promise<CardOperations | null> {
    if (!pairing) return null;
    const pending = pairing.load();
    if (!pending) return null;

    // Throttle polling so a tight loop of tool calls doesn't fan out
    // into one HTTP request per call.
    const now = Date.now();
    if (now - lastPollAt < POLL_THROTTLE_MS) {
      throw new DextercardPairingRequiredError(pending.loginUrl, pending.requestId);
    }
    lastPollAt = now;

    let result;
    try {
      result = await pairing.redeem(pending.requestId);
    } catch {
      // Network/transient error. Surface the still-active URL so the
      // user can retry on the next tool call.
      throw new DextercardPairingRequiredError(pending.loginUrl, pending.requestId);
    }

    if (result.status === "completed") {
      // Save the carrier session, drop the pairing capability.
      store.save(result.dextercard);
      pairing.clear();
      cachedClient = null;
      cachedOps = null;
      cachedEmail = result.email ?? null;
      resumeAttempted = false;
      // Caller will fall through and the next pass through getOperations
      // will resume from the freshly-saved session.
      return null;
    }

    if (result.status === "pending") {
      throw new DextercardPairingRequiredError(pending.loginUrl, pending.requestId);
    }

    // not_found / expired / consumed / no_dextercard_session — pairing
    // is unusable. Drop it and let the caller mint a fresh one.
    pairing.clear();
    return null;
  }

  /**
   * Mint a fresh pairing and throw the agent-facing error so the user
   * gets a clickable login URL.
   */
  async function mintAndThrow(): Promise<never> {
    if (!pairing) {
      // Should not be reached when pairingEnabled is false (caller checks)
      throw new Error("auto-pairing disabled");
    }
    const minted = await pairing.mint();
    throw new DextercardPairingRequiredError(minted.loginUrl, minted.requestId);
  }

  const adapter: NpmCardsAdapter = {
    state: () => ({
      sessionPath,
      keyPath,
      hasSession: existsSync(sessionPath),
      email: cachedEmail,
    }),
    saveSession: (tokens) => {
      store.save(tokens);
      // Drop any outstanding pairing — we have a real session now.
      pairing?.clear();
      // Reset cache so the next getOperations() resumes fresh.
      cachedClient = null;
      cachedOps = null;
      cachedEmail = null;
      resumeAttempted = false;
    },
    clear: () => {
      if (existsSync(sessionPath)) {
        // Clear via the store so it tracks file removal correctly.
        store.clear?.();
      }
      pairing?.clear();
      cachedClient = null;
      cachedOps = null;
      cachedEmail = null;
      resumeAttempted = false;
    },
    getStore: () => store,
    async getOperations() {
      if (cachedOps) return cachedOps;

      // Fast path: try to resume an existing encrypted session.
      if (!resumeAttempted) {
        resumeAttempted = true;
        const stored = store.load();
        if (stored) {
          try {
            const session: DextercardSession = await new LoginFlow().resume(store);
            cachedClient = new Dextercard({ session, agent: "dexter-cli" });
            cachedOps = new LocalCardOperations(cachedClient);
            try {
              const user = await cachedClient.userRetrieve();
              cachedEmail = user.email ?? null;
            } catch {
              /* swallow */
            }
            return cachedOps;
          } catch {
            cachedClient = null;
            cachedOps = null;
            // Fall through to pairing path.
          }
        }
      }

      // Slow path: no resumable session. If auto-pairing is enabled,
      // either resolve a pending pairing or mint a fresh one. Both
      // throw DextercardPairingRequiredError to surface a clickable URL.
      if (!pairing) return null;

      // tryResolvePending throws if pairing still pending; returns null
      // if there is no usable pending pairing OR if a completed pairing
      // was just consumed (in which case we should retry the resume now
      // that store has fresh tokens).
      const justSaved = (await tryResolvePending()) === null;
      if (justSaved) {
        const stored = store.load();
        if (stored) {
          // Re-attempt resume with the freshly-saved tokens.
          try {
            const session: DextercardSession = await new LoginFlow().resume(store);
            cachedClient = new Dextercard({ session, agent: "dexter-cli" });
            cachedOps = new LocalCardOperations(cachedClient);
            try {
              const user = await cachedClient.userRetrieve();
              cachedEmail = user.email ?? null;
            } catch {
              /* swallow */
            }
            return cachedOps;
          } catch {
            cachedClient = null;
            cachedOps = null;
            // Fall through and mint anew.
          }
        }
        // Nothing on disk — mint a fresh pairing.
        await mintAndThrow();
      }

      // Defensive — tryResolvePending should have thrown if pending.
      return null;
    },
    describe() {
      return cachedEmail;
    },
  };

  return adapter;
}
