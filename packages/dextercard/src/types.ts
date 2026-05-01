/**
 * Public types for the Dextercard API surface.
 *
 * Field shapes are derived from real wire captures of the underlying
 * carrier API. Response shapes for endpoints that require a provisioned
 * card are inferred from the carrier's documented input flags and will
 * tighten as additional captures land.
 */

/**
 * Dextercard accepts EITHER a static `jwt` (simple, short-lived) OR
 * a `session` (long-lived, auto-refreshing). Pass exactly one.
 */
export type DextercardOptions = DextercardOptionsBase &
  ({ jwt: string; session?: never } | { session: import("./auth.js").DextercardSession; jwt?: never });

export interface DextercardOptionsBase {
  /** Override the carrier API base URL. Reserved for testing / future routing. */
  baseUrl?: string;
  /** Identifier sent as X-Agent header. Defaults to "dexter". */
  agent?: string;
  /** Optional caller-supplied agent UUID. One is generated per client if omitted. */
  agentId?: string;
  /** Client version advertised on the wire. Defaults to a wire-compatible value. */
  clientVersion?: string;
  /** Custom fetch implementation (test injection). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. Default: 30_000. */
  timeoutMs?: number;
}

export interface UserRetrieveResponse {
  id: string;
  email: string;
}

export interface CardOnboardingStartInput {
  phoneCountryCode: string;
  phoneNumber: string;
  countryOfResidence: string;
  firstName: string;
  lastName: string;
  /** ISO format YYYY-MM-DD. */
  dateOfBirth: string;
  countryOfNationality: string;
}

export interface CardOnboardingStartResponse {
  /** KYC URL the user must complete in a browser. */
  kycUrl?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CardOnboardingCheckResponse {
  status?: string;
  /** When status is VERIFIED, the carrier returns terms URLs that must be displayed. */
  terms?: {
    termsAndConditions: string;
    privacyPolicy: string;
    eSignConsentDisclosure?: string;
  };
  [key: string]: unknown;
}

export interface CardOnboardingFinishInput {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  zip: string;
  /** Must be true to proceed. */
  acceptTerms: boolean;
  /** US-only. */
  acceptESign?: boolean;
}

export interface CardCreateResponse {
  cardId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CardRetrieveResponse {
  cardId?: string;
  status?: string;
  last4?: string;
  expiry?: string;
  [key: string]: unknown;
}

export interface CardRevealResponse {
  /** Single-use PCI-safe URL that renders PAN/CVV/expiry as an image. */
  url: string;
  expiresAt?: string;
}

export interface CardWalletLinkInput {
  /** Local wallet name. */
  wallet: string;
  /** Currency code (e.g. "usdc"). */
  currency: string;
  /** Spend cap in human-readable units (e.g. 5000 = 5,000 USDC). */
  amount: number;
}

export interface CardWalletUnlinkInput {
  wallet: string;
  currency: string;
}

export interface CardWalletCheckInput {
  /** Solana pubkey (base58) or EVM address. */
  wallet: string;
  chain: string;
  currency: string;
}

export interface CardWalletEntry {
  wallet: string;
  chain?: string;
  currency: string;
  amount?: number;
  status?: string;
  [key: string]: unknown;
}

export interface CardTransactionListInput {
  /** ISO YYYY-MM-DD. Must pair with dateTo or omit both. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}

export interface CardTransaction {
  id: string;
  amount?: number;
  currency?: string;
  merchant?: string;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}
