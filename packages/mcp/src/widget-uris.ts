import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIDGETS_DIR = join(__dirname, "..", "widgets");

function versionedWidgetUri(baseUri: string, fileName: string): string {
  try {
    const html = readFileSync(join(WIDGETS_DIR, fileName), "utf-8");
    const hash = createHash("sha1").update(html).digest("hex").slice(0, 8);
    return `${baseUri}-${hash}`;
  } catch {
    return baseUri;
  }
}

export const X402_WIDGET_URIS = Object.freeze({
  search: versionedWidgetUri("ui://dexter/x402-marketplace-search", "x402-marketplace-search.html"),
  fetch: versionedWidgetUri("ui://dexter/x402-fetch-result", "x402-fetch-result.html"),
  pricing: versionedWidgetUri("ui://dexter/x402-pricing", "x402-pricing.html"),
  wallet: versionedWidgetUri("ui://dexter/x402-wallet", "x402-wallet.html"),
});

/**
 * Dextercard widget URIs. Content-hashed at module load so each
 * deployment serves a stable ui:// URI per widget HTML revision.
 * Mirrored shape of CardWidgetUris in @dexterai/x402-mcp-tools so
 * the registrars consume them directly.
 */
export const CARD_WIDGET_URIS = Object.freeze({
  status: versionedWidgetUri("ui://dexter/card-status", "card-status.html"),
  issue: versionedWidgetUri("ui://dexter/card-issue", "card-issue.html"),
  linkWallet: versionedWidgetUri("ui://dexter/card-link-wallet", "card-link-wallet.html"),
});
