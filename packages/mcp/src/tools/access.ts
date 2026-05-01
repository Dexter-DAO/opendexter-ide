import { accessWithWalletProof } from "@dexterai/x402-mcp-tools";
import { loadOrCreateWallet } from "../wallet/index.js";
import { createNpmWalletAdapter } from "../wallet/adapter.js";

/**
 * CLI entrypoint for the `opendexter access` subcommand.
 *
 * The MCP tool registration for `x402_access` lives in the shared
 * @dexterai/x402-mcp-tools package and is mounted in src/server/index.ts.
 * This file owns only the npm-CLI-flavored output.
 */
export async function cliAccess(
  url: string,
  opts: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    body?: string;
    network?: string;
    dev: boolean;
  },
): Promise<void> {
  try {
    const wallet = await loadOrCreateWallet({ quiet: true });
    const adapter = wallet ? createNpmWalletAdapter(wallet) : null;
    const result = await accessWithWalletProof(
      { url, method: opts.method, body: opts.body, preferredNetwork: opts.network },
      adapter,
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.log(JSON.stringify({ error: err.message || String(err) }, null, 2));
    process.exit(1);
  }
}
