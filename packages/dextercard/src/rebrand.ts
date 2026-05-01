/**
 * Carrier brand-leak scrubber.
 *
 * The underlying carrier returns user-facing strings that name the
 * carrier, the regulated issuer, and the KYC vendor verbatim — for
 * example: "MoonCard is not yet available for US residents." This
 * module substitutes those names with Dextercard-branded equivalents
 * so end-users never see the carrier's plumbing.
 *
 * Applied at the error-payload layer so every consumer (CLI, MCP
 * tool, dexter-fe page) inherits the substitution without opting in.
 * Pure functions, no side effects, easy to extend as new carrier
 * strings surface.
 */

interface RebrandRule {
  pattern: RegExp;
  replacement: string;
}

/**
 * Ordered substitutions. More specific patterns first so they don't
 * get swallowed by broader ones (e.g. "MoonCard" before "MoonPay").
 */
const RULES: RebrandRule[] = [
  // Product names
  { pattern: /\bMoonCard\b/g, replacement: "Dextercard" },
  { pattern: /\bMoonAgents\s+Card\b/g, replacement: "Dextercard" },
  { pattern: /\bMoonAgents\b/g, replacement: "Dextercard" },
  { pattern: /\bMoonPay\b/g, replacement: "Dextercard" },

  // Underlying issuer / KYC vendor — surfaced as generic role labels
  { pattern: /\bMonavate\s+Ltd\.?/gi, replacement: "the regulated card issuer" },
  { pattern: /\bMonavate\b/gi, replacement: "the regulated card issuer" },
  { pattern: /\bBaanx\b/gi, replacement: "the regulated card issuer" },
  { pattern: /\bVeriff\b/gi, replacement: "the identity verification provider" },

  // CLI / SDK references — direct users at our CLI instead of the carrier's
  // The carrier's `mp card onboarding start` lifecycle is collapsed into our
  // single `dextercard issue` orchestrator. Other mp subcommands rebrand 1:1.
  { pattern: /Run\s+`mp\s+card\s+onboarding\s+start`/g, replacement: "Run `dextercard issue`" },
  { pattern: /Run\s+`mp\s+card\s+onboarding\s+check`/g, replacement: "Run `dextercard issue`" },
  { pattern: /Run\s+`mp\s+card\s+onboarding\s+finish`/g, replacement: "Run `dextercard issue`" },
  { pattern: /Run\s+`mp\s+card\s+([a-z]+)`/g, replacement: "Run `dextercard $1`" },
  { pattern: /Run\s+`mp\s+([a-z]+(?:\s+[a-z]+)*)`/g, replacement: "Run `dextercard $1`" },
  { pattern: /\bmp\s+card\s+/g, replacement: "dextercard " },
  { pattern: /\bmp\s+/g, replacement: "dextercard " },
];

/**
 * Apply the rebrand rules to a single string. Idempotent.
 */
export function rebrandString(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { pattern, replacement } of RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Apply the rebrand rules to a JSON-ish payload, recursively. Strings
 * are substituted; everything else (numbers, booleans, arrays of
 * objects, etc.) passes through unchanged. Returns a new object;
 * input is not mutated.
 */
export function rebrandPayload<T>(payload: T): T {
  if (payload == null) return payload;
  if (typeof payload === "string") return rebrandString(payload) as T;
  if (Array.isArray(payload)) return payload.map((v) => rebrandPayload(v)) as T;
  if (typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      out[k] = rebrandPayload(v);
    }
    return out as T;
  }
  return payload;
}
