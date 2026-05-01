import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

/**
 * Helpers for sourcing the MoonPay JWT.
 *
 * The official CLI persists the JWT under ~/.config/moonpay/, encrypted at
 * rest with a key co-located in that directory. cards-core does NOT decrypt
 * that store directly — that's tightly coupled to MoonPay's CLI internals
 * and out of scope for a stable client. Instead, callers obtain a JWT
 * however they like (env var, secret manager, prior CLI login) and pass it
 * to {@link MoonPayClient}.
 *
 * The two helpers below cover the common cases: reading a plaintext JWT
 * from an env var, or from a file path.
 */

export const MOONPAY_JWT_ENV = "MOONPAY_JWT";
export const MOONPAY_CONFIG_DIR = join(homedir(), ".config", "moonpay");

export function jwtFromEnv(envVar: string = MOONPAY_JWT_ENV): string {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `MoonPay JWT not found in environment variable ${envVar}. ` +
        `Either set ${envVar} directly or run 'mp login' and pipe the token.`,
    );
  }
  return value.trim();
}

export function jwtFromFile(path: string): string {
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) throw new Error(`MoonPay JWT file is empty: ${path}`);
  return raw;
}
