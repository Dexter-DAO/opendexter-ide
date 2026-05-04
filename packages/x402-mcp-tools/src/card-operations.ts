/**
 * Card operations contract.
 *
 * The card tool registrars (status / issue / link-wallet / freeze) only
 * touch a small subset of the full Dextercard SDK surface. By extracting
 * that subset into its own interface we let consumers plug in either:
 *
 *   - {@link LocalCardOperations} — wraps a real {@link Dextercard}
 *     instance (npm CLI, any environment that holds the carrier session
 *     directly).
 *   - {@link RemoteCardOperations} (separate file) — calls a remote
 *     /internal/dextercard/* surface over HTTP, used by the hosted public
 *     MCP server which intentionally does NOT hold carrier sessions.
 *
 * Both implementations satisfy the same contract, so the registrars do
 * not need to know which they're talking to. Throws are SDK-style: the
 * registrars rely on `DextercardNoAccountError` / `DextercardRegionUnavailableError`
 * to drive stage detection, so any remote implementation MUST translate
 * its transport-level errors into the same shape.
 */

import type {
  CardCreateResponse,
  CardOnboardingCheckResponse,
  CardOnboardingFinishInput,
  CardOnboardingStartInput,
  CardOnboardingStartResponse,
  CardRetrieveResponse,
  CardRevealResponse,
  CardTransaction,
  CardTransactionListInput,
  CardWalletCheckInput,
  CardWalletEntry,
  CardWalletLinkInput,
  CardWalletUnlinkInput,
  Dextercard,
  UserRetrieveResponse,
} from "@dexterai/dextercard";

export interface CardOperations {
  // Account
  userRetrieve(): Promise<UserRetrieveResponse>;

  // Card lifecycle
  cardOnboardingStart(input: CardOnboardingStartInput): Promise<CardOnboardingStartResponse>;
  cardOnboardingCheck(): Promise<CardOnboardingCheckResponse>;
  cardOnboardingFinish(input: CardOnboardingFinishInput): Promise<CardCreateResponse>;
  cardCreate(): Promise<CardCreateResponse>;
  cardRetrieve(): Promise<CardRetrieveResponse>;
  cardFreeze(): Promise<CardRetrieveResponse>;
  cardUnfreeze(): Promise<CardRetrieveResponse>;
  cardReveal(): Promise<CardRevealResponse>;

  // Wallets
  cardWalletLink(input: CardWalletLinkInput): Promise<CardWalletEntry>;
  cardWalletUnlink(input: CardWalletUnlinkInput): Promise<{ ok: true }>;
  cardWalletCheck(input: CardWalletCheckInput): Promise<CardWalletEntry>;
  cardWalletList(): Promise<{ wallets: CardWalletEntry[] }>;

  // Transactions
  cardTransactionList(input: CardTransactionListInput): Promise<{ transactions: CardTransaction[] }>;
}

/**
 * Wraps a real {@link Dextercard} instance as a {@link CardOperations}.
 * Trivial passthrough — exists so consumers like the npm CLI keep using
 * the SDK directly while the registrars consume the smaller interface.
 */
export class LocalCardOperations implements CardOperations {
  constructor(private readonly client: Dextercard) {}

  userRetrieve() { return this.client.userRetrieve(); }
  cardOnboardingStart(input: CardOnboardingStartInput) { return this.client.cardOnboardingStart(input); }
  cardOnboardingCheck() { return this.client.cardOnboardingCheck(); }
  cardOnboardingFinish(input: CardOnboardingFinishInput) { return this.client.cardOnboardingFinish(input); }
  cardCreate() { return this.client.cardCreate(); }
  cardRetrieve() { return this.client.cardRetrieve(); }
  cardFreeze() { return this.client.cardFreeze(); }
  cardUnfreeze() { return this.client.cardUnfreeze(); }
  cardReveal() { return this.client.cardReveal(); }
  cardWalletLink(input: CardWalletLinkInput) { return this.client.cardWalletLink(input); }
  cardWalletUnlink(input: CardWalletUnlinkInput) { return this.client.cardWalletUnlink(input); }
  cardWalletCheck(input: CardWalletCheckInput) { return this.client.cardWalletCheck(input); }
  cardWalletList() { return this.client.cardWalletList(); }
  cardTransactionList(input: CardTransactionListInput) { return this.client.cardTransactionList(input); }
}
