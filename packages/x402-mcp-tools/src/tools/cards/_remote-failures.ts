/**
 * Helper for the four card-tool registrars: when an unhandled error
 * bubbles out of the tool body, check whether it's one of the structured
 * non-error states that hosted-server adapters throw to drive the agent
 * to the right next URL:
 *
 *   - {@link DextercardPairingRequiredError} — user is not signed in to
 *     their Dexter account on this MCP session yet. The adapter has
 *     minted a pairing URL the user must visit.
 *   - {@link DextercardLoginRequiredError}   — user is signed in but
 *     hasn't completed carrier (Dextercard) OTP login yet. The adapter
 *     surfaces a loginUrl on dexter.cash.
 *
 * In both cases we want a clean structured tool result, not the generic
 * isError envelope, so the agent can extract the URL and tell the user.
 */

import {
  DextercardLoginRequiredError,
  DextercardPairingRequiredError,
} from "../../remote-card-operations.js";

export function maybeLoginRequiredResult(err: unknown, meta: unknown):
  | {
      content: Array<{ type: "text"; text: string }>;
      structuredContent: Record<string, unknown>;
      _meta: unknown;
    }
  | null {
  if (
    err instanceof DextercardPairingRequiredError ||
    (err as { name?: string })?.name === "DextercardPairingRequiredError"
  ) {
    const e = err as DextercardPairingRequiredError;
    const data = {
      stage: "auth_required",
      tip: "Sign in to your Dexter account to use Dextercard tools.",
      pairingUrl: e.pairingUrl,
      requestId: e.requestId,
      nextAction: "tell_user_to_visit_pairing_url",
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
      _meta: meta,
    };
  }
  if (
    err instanceof DextercardLoginRequiredError ||
    (err as { name?: string })?.name === "DextercardLoginRequiredError"
  ) {
    const data = {
      stage: "dextercard_login_required",
      tip: "Complete Dextercard email + OTP login to continue.",
      loginUrl: (err as DextercardLoginRequiredError).loginUrl || null,
      nextAction: "tell_user_to_visit_login_url",
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
      _meta: meta,
    };
  }
  return null;
}
