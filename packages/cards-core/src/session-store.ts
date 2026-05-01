/**
 * Filesystem-backed session stores.
 *
 * @dexterai/cards-core does not pick a global "session location" because
 * different consumers want different homes (the npm CLI wants
 * ~/.config/dexter/cards-session, hosted servers want a KMS-backed
 * implementation, tests want an in-memory store). These helpers cover
 * the common file-on-disk cases.
 *
 * The encrypted variant uses scrypt + AES-256-GCM. The encryption key
 * is supplied by the caller — typically derived from a user passphrase,
 * fetched from a KMS, or a per-machine random key persisted with 0600.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SessionStore, SessionTokens } from "./auth.js";

/**
 * Plaintext JSON session store. Use only when the storage location is
 * already protected (e.g., 0600 file in a private directory) and you
 * accept that anyone with read access to the file can resume the session.
 */
export class JsonFileSessionStore implements SessionStore {
  constructor(private readonly path: string) {}

  load(): SessionTokens | null {
    if (!existsSync(this.path)) return null;
    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw);
      return validateTokens(parsed);
    } catch {
      return null;
    }
  }

  save(tokens: SessionTokens): void {
    ensureDir(this.path);
    writeFileSync(this.path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  }

  clear(): void {
    if (existsSync(this.path)) unlinkSync(this.path);
  }
}

/**
 * Encrypted session store. The provided `keyMaterial` is stretched with
 * scrypt to a 32-byte AES key per-record, with a fresh random salt and
 * IV each save. The on-disk format is a JSON envelope containing the
 * salt, IV, auth tag, and ciphertext.
 */
export class EncryptedFileSessionStore implements SessionStore {
  private static readonly SCRYPT_N = 16384;
  private static readonly SCRYPT_R = 8;
  private static readonly SCRYPT_P = 1;
  private static readonly KEY_LEN = 32;

  constructor(
    private readonly path: string,
    private readonly keyMaterial: string | Buffer,
  ) {
    if (!keyMaterial || (typeof keyMaterial === "string" && keyMaterial.length < 8)) {
      throw new Error("EncryptedFileSessionStore: keyMaterial must be at least 8 chars");
    }
  }

  load(): SessionTokens | null {
    if (!existsSync(this.path)) return null;
    try {
      const envelope = JSON.parse(readFileSync(this.path, "utf8"));
      const salt = Buffer.from(envelope.salt, "base64");
      const iv = Buffer.from(envelope.iv, "base64");
      const tag = Buffer.from(envelope.tag, "base64");
      const ciphertext = Buffer.from(envelope.ciphertext, "base64");
      const key = scryptSync(this.keyMaterial, salt, EncryptedFileSessionStore.KEY_LEN, {
        N: EncryptedFileSessionStore.SCRYPT_N,
        r: EncryptedFileSessionStore.SCRYPT_R,
        p: EncryptedFileSessionStore.SCRYPT_P,
      });
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      // Defense-in-depth: confirm format header before trusting payload.
      const expected = Buffer.from("v1:");
      if (
        plaintext.length < expected.length ||
        !timingSafeEqual(plaintext.subarray(0, expected.length), expected)
      ) {
        return null;
      }
      const json = plaintext.subarray(expected.length).toString("utf8");
      return validateTokens(JSON.parse(json));
    } catch {
      return null;
    }
  }

  save(tokens: SessionTokens): void {
    ensureDir(this.path);
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(this.keyMaterial, salt, EncryptedFileSessionStore.KEY_LEN, {
      N: EncryptedFileSessionStore.SCRYPT_N,
      r: EncryptedFileSessionStore.SCRYPT_R,
      p: EncryptedFileSessionStore.SCRYPT_P,
    });
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plaintext = Buffer.concat([
      Buffer.from("v1:"),
      Buffer.from(JSON.stringify(tokens), "utf8"),
    ]);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = {
      version: 1,
      kdf: "scrypt",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    writeFileSync(this.path, JSON.stringify(envelope, null, 2), { mode: 0o600 });
  }

  clear(): void {
    if (existsSync(this.path)) unlinkSync(this.path);
  }
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function validateTokens(value: unknown): SessionTokens | null {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as SessionTokens).accessToken !== "string" ||
    typeof (value as SessionTokens).refreshToken !== "string" ||
    typeof (value as SessionTokens).expiresAt !== "number"
  ) {
    return null;
  }
  return value as SessionTokens;
}
