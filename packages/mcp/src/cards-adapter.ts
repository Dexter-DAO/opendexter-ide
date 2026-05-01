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
import type { CardsAdapter } from "@dexterai/x402-mcp-tools";

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

  let cached: Dextercard | null = null;
  let cachedEmail: string | null = null;
  let resumeAttempted = false;

  const adapter: NpmCardsAdapter = {
    state: () => ({
      sessionPath,
      keyPath,
      hasSession: existsSync(sessionPath),
      email: cachedEmail,
    }),
    saveSession: (tokens) => {
      store.save(tokens);
      // Reset cache so the next getClient() resumes fresh.
      cached = null;
      cachedEmail = null;
      resumeAttempted = false;
    },
    clear: () => {
      if (existsSync(sessionPath)) {
        // Clear via the store so it tracks file removal correctly.
        store.clear?.();
      }
      cached = null;
      cachedEmail = null;
      resumeAttempted = false;
    },
    getStore: () => store,
    async getClient() {
      if (cached) return cached;
      if (resumeAttempted) return null;
      resumeAttempted = true;

      const stored = store.load();
      if (!stored) return null;

      try {
        const session: DextercardSession = await new LoginFlow().resume(store);
        cached = new Dextercard({ session, agent: "dexter-cli" });
        // Lazy-fetch user info to surface a friendly label. Failure here
        // doesn't invalidate the client.
        try {
          const user = await cached.userRetrieve();
          cachedEmail = user.email ?? null;
        } catch {
          /* swallow */
        }
        return cached;
      } catch {
        cached = null;
        return null;
      }
    },
    describe() {
      return cachedEmail;
    },
  };

  return adapter;
}
