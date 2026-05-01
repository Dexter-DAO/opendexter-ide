/**
 * Cards adapter contract.
 *
 * The card tool registrars never read filesystem credentials, never
 * decrypt a session store, and never hold a JWT directly. Each
 * consumer (npm CLI, hosted public server, hosted authenticated
 * server) provides a {@link CardsAdapter} that returns a ready-to-use
 * {@link Dextercard} bound to the active user, or null when no
 * Dextercard session is configured for this consumer.
 *
 * This keeps the registrars environment-agnostic:
 *   - npm CLI reads the encrypted session store from disk and resumes
 *     a {@link DextercardSession}.
 *   - Hosted public server returns null (anonymous sessions can't
 *     issue cards).
 *   - Hosted authenticated server pulls a service-account JWT from
 *     KMS or builds a per-user session from Supabase auth.
 *
 * Adapters MAY construct a fresh client per call (recommended when
 * the JWT rotates aggressively) or memoize one for the session.
 */

import type { Dextercard } from "@dexterai/dextercard";

export interface CardsAdapter {
  /**
   * Resolve the {@link Dextercard} bound to the active user, or null
   * if no Dextercard session is configured for this consumer.
   *
   * Implementations may run async work here (e.g., load + decrypt a
   * session file, fetch a service credential from a secret manager).
   */
  getClient(): Promise<Dextercard | null> | Dextercard | null;

  /**
   * Optional human-readable label for the active Dextercard account
   * (typically the email). Surfaced by status tools when present.
   */
  describe?(): Promise<string | null> | string | null;
}
