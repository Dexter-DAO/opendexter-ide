import { checkEndpointPricing } from "@dexterai/x402-core";

/**
 * CLI entrypoint for the `opendexter check` subcommand.
 *
 * The MCP tool registration for `x402_check` lives in the shared
 * @dexterai/x402-mcp-tools package and is mounted in src/server/index.ts.
 * This file owns only the npm-CLI-flavored output.
 */
export async function cliCheck(
  url: string,
  opts: { method: "GET" | "POST" | "PUT" | "DELETE"; dev: boolean },
): Promise<void> {
  try {
    const result = await checkEndpointPricing({ url, method: opts.method });
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.log(JSON.stringify({ error: err.message || String(err) }, null, 2));
    process.exit(1);
  }
}
