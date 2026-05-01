/**
 * WalletAdapter implementation for the npm @dexterai/opendexter CLI.
 *
 * Bridges the file-backed `LoadedWallet` (loaded via loadOrCreateWallet)
 * to the WalletAdapter contract consumed by @dexterai/x402-mcp-tools.
 *
 * This is the only adapter implementation in this package — the hosted
 * MCP servers will provide their own adapters that talk to their session
 * resolver and managed-wallet APIs.
 */

import type { WalletAdapter, SolanaSigner, EvmSigner } from "@dexterai/x402-mcp-tools";
import nacl from "tweetnacl";
import type { LoadedWallet } from "./index.js";
import { getAllBalances, getSolanaBalance, getEvmUsdcBalance } from "./index.js";

export function createNpmWalletAdapter(wallet: LoadedWallet): WalletAdapter {
  return {
    getInfo() {
      return {
        solanaAddress: wallet.info.solanaAddress ?? null,
        evmAddress: wallet.info.evmAddress ?? null,
      };
    },

    async getAvailableUsdc(network: string): Promise<number> {
      if (network.startsWith("solana:") && wallet.info.solanaAddress) {
        const { usdc } = await getSolanaBalance(wallet.info.solanaAddress);
        return usdc;
      }
      if (network.startsWith("eip155:") && wallet.info.evmAddress) {
        return await getEvmUsdcBalance(wallet.info.evmAddress, network);
      }
      return 0;
    },

    async getAllBalances() {
      return await getAllBalances(wallet.info);
    },

    getPaymentSigners() {
      return {
        solanaPrivateKey: wallet.info.solanaPrivateKey,
        evmPrivateKey: wallet.info.evmPrivateKey,
      };
    },

    getSolanaSigner(): SolanaSigner | null {
      if (!wallet.solanaKeypair || !wallet.info.solanaAddress) return null;
      const keypair = wallet.solanaKeypair;
      return {
        publicKey: keypair.publicKey,
        signMessage: async (message: Uint8Array) =>
          nacl.sign.detached(message, keypair.secretKey),
      };
    },

    getEvmSigner(): EvmSigner | null {
      if (!wallet.info.evmPrivateKey || !wallet.info.evmAddress) return null;
      const evmAddress = wallet.info.evmAddress;
      const evmPrivateKey = wallet.info.evmPrivateKey as `0x${string}`;
      return {
        address: evmAddress,
        async signMessage({ message }: { message: string }): Promise<string> {
          const { privateKeyToAccount } = await import("viem/accounts");
          const account = privateKeyToAccount(evmPrivateKey);
          return account.signMessage({ message });
        },
      };
    },
  };
}
