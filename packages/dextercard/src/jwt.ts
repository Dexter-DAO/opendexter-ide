import { readFileSync } from "node:fs";

/**
 * Helpers for sourcing a static carrier JWT from the environment or a
 * plaintext file. Most consumers should use {@link DextercardSession}
 * instead — it manages refresh and rotation for you. These helpers are
 * for the rare case where you've already obtained a JWT through some
 * external mechanism (a secret manager, a partner-issued service
 * credential, a debug pipeline) and just want to hand it to a
 * {@link Dextercard} instance verbatim.
 */

export const DEXTERCARD_JWT_ENV = "DEXTERCARD_JWT";

export function jwtFromEnv(envVar: string = DEXTERCARD_JWT_ENV): string {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `Dextercard JWT not found in environment variable ${envVar}.`,
    );
  }
  return value.trim();
}

export function jwtFromFile(path: string): string {
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) throw new Error(`Dextercard JWT file is empty: ${path}`);
  return raw;
}
