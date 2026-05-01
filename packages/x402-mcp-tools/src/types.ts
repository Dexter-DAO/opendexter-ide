/**
 * Shared types for the x402 MCP tool registrars.
 *
 * Each consumer (npm CLI, hosted public server, hosted authed server)
 * builds an opts object once and passes it to the registrars. Tools
 * that need session-aware behavior (the wallet helpers, fetch with a
 * specific signer) accept their dependencies through this opts bag
 * rather than reaching into a global, so the same registrar works in
 * every environment.
 */

import type { ToolMetas } from "./widget-meta.js";

/**
 * Wallet handle used by tools that sign or report balances. The shape
 * is intentionally loose because each consumer wires up a different
 * wallet implementation:
 *   - npm CLI: file-based local keypair via @dexterai/opendexter's wallet
 *   - hosted public server: anonymous session-bound wallet
 *   - hosted authed server: Supabase-backed managed wallet
 *
 * The registrars treat the wallet as opaque and only call methods that
 * exist on every implementation. Each consumer is responsible for
 * passing in a wallet object that satisfies whatever the tool expects.
 */
export type WalletHandle = unknown;

/**
 * Settings tool opts — only used by the npm CLI consumer. The hosted
 * servers don't surface settings (they're filesystem-coupled to a
 * local install). Defined here for completeness; the package does NOT
 * export a registerSettingsTool — settings stays in the npm package.
 */
export interface ToolBaseOpts {
  /** Resolved API base URL (e.g. https://x402.dexter.cash). No trailing slash. */
  apiBaseUrl: string;
  /** Pre-built widget metadata blobs, one per tool. */
  metas: ToolMetas;
}

export interface SearchToolOpts extends ToolBaseOpts {
  /** Capability search path appended to apiBaseUrl. Default: /api/x402gle/capability */
  capabilityPath?: string;
}

export interface FetchToolOpts extends ToolBaseOpts {
  /** Wallet used to sign payment authorizations. */
  wallet: WalletHandle;
  /** Optional default max-amount cap in USDC (consumer-specific policy). */
  defaultMaxAmountUsdc?: number;
}

export interface AccessToolOpts extends ToolBaseOpts {
  /** Wallet used to sign access proofs. */
  wallet: WalletHandle;
}

export interface CheckToolOpts extends ToolBaseOpts {
  /** Capability search path appended to apiBaseUrl. Default: /api/x402gle/capability */
  capabilityPath?: string;
}

export interface WalletToolOpts extends ToolBaseOpts {
  /** Wallet whose state is reported to callers. */
  wallet: WalletHandle;
}

/** Default capability search path on dexter-api. */
export const DEFAULT_CAPABILITY_PATH = "/api/x402gle/capability";
