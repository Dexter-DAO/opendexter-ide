/**
 * Browser-safe entry point.
 *
 * Imports nothing that touches `node:fs` / `node:crypto` / `node:os`,
 * so it works in any bundler (Next.js, Vite, esbuild) without
 * polyfills or noise about missing Node modules.
 *
 * Use this from React components and other browser code:
 *
 *   import { renderDextercardHCaptcha, DEXTERCARD_HCAPTCHA_SITEKEY } from "@dexterai/dextercard/browser";
 *
 * Server-side code (API routes, Node servers) should import from
 * the default entry "@dexterai/dextercard" which has the full surface
 * (Dextercard client, EncryptedFileSessionStore, LoginFlow, etc).
 */

export {
  loadHCaptchaScript,
  renderDextercardHCaptcha,
  type HCaptchaHandle,
  type RenderHCaptchaOptions,
} from "./hcaptcha-embed.js";

export {
  DEXTERCARD_HCAPTCHA_CONFIG,
  DEXTERCARD_HCAPTCHA_SITEKEY,
} from "./login-flow.js";

// Pure data + error types are safe to share with browser bundles too.
export {
  DextercardApiError,
  DextercardNoAccountError,
  DextercardRegionUnavailableError,
  type DextercardErrorPayload,
} from "./errors.js";

export { rebrandPayload, rebrandString } from "./rebrand.js";
