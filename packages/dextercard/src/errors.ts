import { rebrandPayload, rebrandString } from "./rebrand.js";

export interface DextercardErrorPayload {
  error: string;
  tool?: string;
  [key: string]: unknown;
}

export class DextercardApiError extends Error {
  readonly tool: string;
  readonly status: number;
  readonly payload: DextercardErrorPayload;

  constructor(tool: string, status: number, payload: DextercardErrorPayload) {
    // Rebrand the user-facing message before super() so .message,
    // .toString(), and Sentry / log breadcrumbs all carry the
    // Dextercard-branded copy.
    const rebrandedPayload = rebrandPayload(payload);
    const rawMessage = rebrandedPayload.error || `Dextercard ${tool} failed (${status})`;
    super(rebrandString(rawMessage));
    this.name = "DextercardApiError";
    this.tool = tool;
    this.status = status;
    this.payload = rebrandedPayload;
  }
}

export class DextercardNoAccountError extends DextercardApiError {
  constructor(tool: string, status: number, payload: DextercardErrorPayload) {
    super(tool, status, payload);
    this.name = "DextercardNoAccountError";
  }
}

/**
 * Thrown when the user's residence is not yet supported by the
 * regulated card issuer. The carrier returns a region-specific
 * "not yet available" message at card_onboarding_start; this class
 * is the typed handle callers branch on for region-aware fallbacks
 * (e.g., a waitlist page that captures the email to notify when the
 * region opens).
 *
 * region (when extractable) is the ISO-2 country code mentioned in
 * the carrier message, lower-cased — e.g. "us", "ca". null when the
 * message phrasing didn't include one.
 */
export class DextercardRegionUnavailableError extends DextercardApiError {
  readonly region: string | null;
  constructor(tool: string, status: number, payload: DextercardErrorPayload, region: string | null) {
    super(tool, status, payload);
    this.name = "DextercardRegionUnavailableError";
    this.region = region;
  }
}

// "no MoonCard account found", "no agents card account found", etc.
const NO_ACCOUNT_RX = /no\s+\w*\s*card\s+account\s+found/i;

// Matches strings like:
//   "MoonCard is not yet available for US residents. Check back soon..."
//   "Dextercard is not yet available for US residents..." (post-rebrand)
const REGION_UNAVAILABLE_RX =
  /\b(?:MoonCard|Dextercard|MoonAgents)\s+is\s+not\s+yet\s+available\s+for\s+([A-Za-z]{2})(?:\s+|-)?(?:residents)?/i;

function extractRegion(message: string): string | null {
  const m = REGION_UNAVAILABLE_RX.exec(message);
  return m ? m[1].toLowerCase() : null;
}

export function classifyError(
  tool: string,
  status: number,
  payload: DextercardErrorPayload,
): DextercardApiError {
  // Rebrand once up front so downstream classifiers operate on the
  // Dextercard-branded message even if the carrier emitted MoonCard.
  const rebranded = rebrandPayload(payload);
  const message = rebranded.error || "";

  if (NO_ACCOUNT_RX.test(message)) {
    return new DextercardNoAccountError(tool, status, rebranded);
  }

  const region = extractRegion(message);
  if (region) {
    return new DextercardRegionUnavailableError(tool, status, rebranded, region);
  }

  return new DextercardApiError(tool, status, rebranded);
}
