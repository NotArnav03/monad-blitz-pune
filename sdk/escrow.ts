import { type Address, type Hash, parseEventLogs } from "viem";
import type { Agent } from "./client.js";
import { settldAbi, EscrowStatus } from "./abi.js";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as Address | undefined;

function requireContractAddress(): Address {
  if (!CONTRACT_ADDRESS) {
    throw new Error("CONTRACT_ADDRESS is not set in the environment (.env)");
  }
  return CONTRACT_ADDRESS;
}

export interface EscrowRecord {
  hirer: Address;
  worker: Address;
  amount: bigint;
  deadline: bigint;
  status: EscrowStatus;
  resultHash: string;
}

/// Every write helper waits for the receipt before returning — Monad's fast
/// blocks mean `eth_getTransactionReceipt` can lag a beat right after send,
/// so callers should never assume "tx sent" == "state changed" without this.

export async function createEscrow(
  agent: Agent,
  worker: Address,
  deadline: bigint,
  amountWei: bigint,
): Promise<{ hash: Hash; escrowId: bigint }> {
  const address = requireContractAddress();

  const hash = await agent.walletClient.writeContract({
    chain: agent.walletClient.chain,
    account: agent.walletClient.account!,
    address,
    abi: settldAbi,
    functionName: "createEscrow",
    args: [worker, deadline],
    value: amountWei,
  });

  const receipt = await agent.publicClient.waitForTransactionReceipt({ hash });
  const [event] = parseEventLogs({ abi: settldAbi, eventName: "EscrowCreated", logs: receipt.logs });
  if (!event) throw new Error("createEscrow: EscrowCreated event not found in receipt");

  return { hash, escrowId: event.args.escrowId };
}

export async function submitWork(agent: Agent, escrowId: bigint, resultHash: string): Promise<Hash> {
  const address = requireContractAddress();

  const hash = await agent.walletClient.writeContract({
    chain: agent.walletClient.chain,
    account: agent.walletClient.account!,
    address,
    abi: settldAbi,
    functionName: "submitWork",
    args: [escrowId, resultHash],
  });

  await agent.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function approveAndRelease(agent: Agent, escrowId: bigint): Promise<Hash> {
  const address = requireContractAddress();

  const hash = await agent.walletClient.writeContract({
    chain: agent.walletClient.chain,
    account: agent.walletClient.account!,
    address,
    abi: settldAbi,
    functionName: "approveAndRelease",
    args: [escrowId],
  });

  await agent.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function reclaimAfterTimeout(agent: Agent, escrowId: bigint): Promise<Hash> {
  const address = requireContractAddress();

  const hash = await agent.walletClient.writeContract({
    chain: agent.walletClient.chain,
    account: agent.walletClient.account!,
    address,
    abi: settldAbi,
    functionName: "reclaimAfterTimeout",
    args: [escrowId],
  });

  await agent.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/// Reputation-agnostic reader — works from either agent's publicClient since
/// it's a view call, no signing required.
export async function getEscrow(agent: Agent, escrowId: bigint): Promise<EscrowRecord> {
  const address = requireContractAddress();

  const [hirer, worker, amount, deadline, status, resultHash] = await agent.publicClient.readContract({
    address,
    abi: settldAbi,
    functionName: "getEscrow",
    args: [escrowId],
  });

  return { hirer, worker, amount, deadline, status: status as EscrowStatus, resultHash };
}
