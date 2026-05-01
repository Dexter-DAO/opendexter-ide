/**
 * Widget metadata helpers for the Dextercard MCP tools.
 *
 * Mirrors the shape of widget-meta.ts (the x402 widget metas) so each
 * consumer (npm CLI, hosted public server, hosted authed server)
 * computes URIs by content-hashing the widget HTML it ships and
 * passes them in here. Keeps this package free of filesystem reads.
 */

import { widgetMeta, type WidgetMetaOptions } from "./widget-meta.js";

export interface CardWidgetUris {
  /** ui:// URI for the card-status widget. */
  status: string;
  /** ui:// URI for the card-issue (multi-stage onboarding) widget. */
  issue: string;
  /** ui:// URI for the card-link-wallet widget. */
  linkWallet: string;
}

/**
 * Build the three canonical META blobs for the Dextercard toolset
 * given a resolved set of widget URIs. The freeze tool reuses the
 * status widget metadata (freeze mutates state then returns the same
 * shape as status).
 */
export function buildCardToolMetas(
  uris: CardWidgetUris,
  options: WidgetMetaOptions = {},
) {
  return {
    status: widgetMeta(
      uris.status,
      "Loading card status…",
      "Card status loaded",
      "Shows current Dextercard status: card last4, expiry, frozen state, linked wallets, and recent transactions.",
      options,
    ),
    issue: widgetMeta(
      uris.issue,
      "Working on card issuance…",
      "Issuance step ready",
      "Multi-stage onboarding wizard: KYC URL with QR, terms acceptance, card creation, and the post-issue card reveal.",
      options,
    ),
    linkWallet: widgetMeta(
      uris.linkWallet,
      "Linking wallet…",
      "Wallet linked",
      "Confirms a wallet → card spend authorization with currency, cap amount, and an explicit Approve action.",
      options,
    ),
  };
}

export type CardToolMetas = ReturnType<typeof buildCardToolMetas>;
