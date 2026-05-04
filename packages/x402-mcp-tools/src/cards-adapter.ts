/**
 * Cards adapter contract.
 *
 * The card tool registrars never read filesystem credentials, never
 * decrypt a session store, and never hold a JWT directly. Each
 * consumer (npm CLI, hosted public server, hosted authenticated
 * server) provides a {@link CardsAdapter} that returns a ready-to-use
 * {@link CardOperations} bound to the active user, or null when no
 * Dextercard session is configured for this consumer.
 *
 * This keeps the registrars environment-agnostic:
 *   - npm CLI reads the encrypted session store from disk, resumes a
 *     `DextercardSession`, builds a `Dextercard`, and wraps it in
 *     {@link LocalCardOperations}.
 *   - Hosted public server gets a per-MCP-session bound user id and
 *     constructs {@link RemoteCardOperations} that calls the
 *     authenticated `dexter-api /internal/dextercard/*` surface over
 *     HMAC-signed HTTP — never holds a carrier JWT in-process.
 *   - Hosted authenticated server pulls a service-account credential
 *     from secret storage and constructs whichever shape it prefers.
 *
 * Adapters MAY construct a fresh operations object per call (recommended
 * when the underlying JWT rotates aggressively) or memoize one.
 */

import type { CardOperations } from "./card-operations.js";

export interface CardsAdapter {
  /**
   * Resolve the {@link CardOperations} bound to the active user, or null
   * if no Dextercard session is configured for this consumer.
   *
   * Implementations may run async work here (e.g., load + decrypt a
   * session file, fetch a service credential from a secret manager,
   * read a per-request user binding from MCP context).
   */
  getOperations(): Promise<CardOperations | null> | CardOperations | null;

  /**
   * Optional human-readable label for the active Dextercard account
   * (typically the email). Surfaced by status tools when present.
   */
  describe?(): Promise<string | null> | string | null;
}
