import "dotenv/config";
import { agentFromPrivateKey } from "./client.js";
import { createEscrow, getEscrow } from "./escrow.js";
import { watchSettldEvents } from "./events.js";
import { EscrowStatus } from "./abi.js";

function fmtStatus(status: EscrowStatus): string {
  return EscrowStatus[status] ?? `unknown(${status})`;
}

async function main() {
  const hirer = agentFromPrivateKey(process.env.PRIVATE_KEY as `0x${string}`);
  const worker = agentFromPrivateKey(process.env.WORKER_PRIVATE_KEY as `0x${string}`);
  console.log("hirer :", hirer.address);
  console.log("worker:", worker.address);

  console.log("\n--- reading escrows #1 and #2 (created manually via cast earlier) ---");
  for (const id of [1n, 2n]) {
    const e = await getEscrow(hirer, id);
    console.log(`escrow #${id}:`, {
      hirer: e.hirer,
      worker: e.worker,
      amountMON: Number(e.amount) / 1e18,
      status: fmtStatus(e.status),
      resultHash: e.resultHash,
    });
  }

  console.log("\n--- watching live events, then creating escrow #3 to trigger one ---");
  const seen: string[] = [];
  const unwatch = watchSettldEvents(
    hirer,
    (event) => {
      console.log(`  [event] ${event.name}`, event.args);
      seen.push(event.name);
    },
    (err) => console.error("  [watch error]", err.message),
  );

  // small delay so the watcher's filter is registered before we fire the tx
  await new Promise((r) => setTimeout(r, 500));

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
  const { escrowId, hash } = await createEscrow(hirer, worker.address, deadline, 10_000_000_000_000_000n); // 0.01 MON
  console.log(`createEscrow tx confirmed, escrowId=${escrowId}, hash=${hash}`);

  // give the watcher a moment to receive the log before we exit
  await new Promise((r) => setTimeout(r, 6000));
  unwatch();

  if (!seen.includes("EscrowCreated")) {
    throw new Error("watchSettldEvents never surfaced the EscrowCreated event");
  }

  console.log("\nLayer 2 SDK check passed: read, write, and event watch all confirmed live on Monad testnet.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Layer 2 SDK check FAILED:", err);
  process.exit(1);
});
