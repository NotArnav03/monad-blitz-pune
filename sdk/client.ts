import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain.js";

export interface Agent {
  address: Address;
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
}

/// Builds a public+wallet client pair for one agent from a raw private key.
/// Both hirer and worker processes call this once at startup.
export function agentFromPrivateKey(privateKey: Hex): Agent {
  const account = privateKeyToAccount(privateKey);
  const transport = http(process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz");

  const publicClient = createPublicClient({ chain: monadTestnet, transport });
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport });

  return { address: account.address, publicClient, walletClient };
}
