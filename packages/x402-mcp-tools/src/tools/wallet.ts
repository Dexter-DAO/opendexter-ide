import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletToolOpts } from "../types.js";

/**
 * x402_wallet tool registration.
 *
 * Reports wallet state to callers: addresses, USDC balances per chain,
 * and a deposit hint when balances are zero. Reads everything through
 * the injected WalletAdapter so the same registrar works for the npm
 * CLI's local file-backed wallet, the hosted public server's anonymous
 * session wallet, and the hosted authenticated server's managed wallet.
 */
export function registerWalletTool(server: McpServer, opts: WalletToolOpts): void {
  const meta = opts.metas.wallet;
  const wallet = opts.wallet;
  const noWalletTip =
    opts.noWalletTip ??
    "No wallet is configured for this MCP session. Sign in or provision a wallet to enable balances and payments.";

  server.tool(
    "x402_wallet",
    "Show wallet addresses (Solana + EVM), USDC balances across all chains, and deposit instructions. " +
      "The wallet is used to automatically pay for x402 API calls on Solana, Base, Polygon, Arbitrum, Optimism, and Avalanche.",
    {},
    async () => {
      if (!wallet) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "No wallet configured", tip: noWalletTip }, null, 2),
            },
          ],
        };
      }

      try {
        const info = wallet.getInfo();
        const { totalUsdc, chains } = await wallet.getAllBalances();
        const chainBalances = Object.fromEntries(
          Object.entries(chains).map(([caip2, chain]) => [
            caip2,
            {
              available: String(Math.round(chain.usdc * 1e6)),
              name: chain.name,
              tier:
                caip2 === "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" || caip2 === "eip155:8453"
                  ? "first"
                  : "second",
            },
          ]),
        );
        const data: Record<string, unknown> = {
          address: info.solanaAddress || info.evmAddress || null,
          solanaAddress: info.solanaAddress ?? null,
          evmAddress: info.evmAddress ?? null,
          network: "multichain",
          chainBalances,
          balances: {
            usdc: totalUsdc,
            fundedAtomic: String(Math.round(totalUsdc * 1e6)),
            spentAtomic: "0",
            availableAtomic: String(Math.round(totalUsdc * 1e6)),
          },
          supportedNetworks:
            Object.keys(chainBalances).length > 0
              ? Object.keys(chainBalances)
              : ["solana", "base", "polygon", "arbitrum", "optimism", "avalanche"],
        };
        if (info.descriptor) {
          data.walletDescriptor = info.descriptor;
        }
        if (totalUsdc === 0) {
          data.tip = `Deposit USDC to ${
            info.solanaAddress || "your Solana wallet"
          }${info.evmAddress ? ` or ${info.evmAddress}` : ""} to start paying.`;
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          _meta: meta,
        } as any;
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );
}
