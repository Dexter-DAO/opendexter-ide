/**
 * Public types for the MoonPay MoonAgents Card API.
 *
 * Field shapes are derived from the wire format observed when running
 * the public @moonpay/cli through a TLS-intercepting proxy (see
 * dexter-fe/research/moonpay-wire/). Response shapes for endpoints
 * that require a provisioned MoonCard are inferred from the CLI's
 * input flags + MoonPay's own help text and will be tightened as
 * real captures become available.
 */

/**
 * MoonPayClient accepts EITHER a static `jwt` (simple, short-lived) OR
 * a `session` (long-lived, auto-refreshing). Pass exactly one.
 */
export type MoonPayClientOptions = MoonPayClientOptionsBase &
  ({ jwt: string; session?: never } | { session: import("./auth.js").MoonPaySession; jwt?: never });

export interface MoonPayClientOptionsBase {
  /** Override the API base. Defaults to https://agents.moonpay.com. */
  baseUrl?: string;
  /** Identifier sent as X-Agent header. Defaults to "dexter". */
  agent?: string;
  /** Optional caller-supplied agent UUID. One is generated per client if omitted. */
  agentId?: string;
  /** CLI version equivalent advertised via X-CLI-Version header. */
  cliVersion?: string;
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
  /** Veriff KYC URL the user must complete in a browser. */
  veriffUrl?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CardOnboardingCheckResponse {
  status?: string;
  /** When status is VERIFIED, MoonPay returns terms URLs that must be displayed. */
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
  /** Local wallet name as stored by `mp wallet create`. */
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
