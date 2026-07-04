import "dotenv/config";
import type { Address } from "viem";
import { agentFromPrivateKey } from "../sdk/client.js";
import { createEscrow, approveAndRelease, getEscrow } from "../sdk/escrow.js";
import { watchSettldEvents } from "../sdk/events.js";
import { EscrowStatus } from "../sdk/abi.js";
import { TASK_DESCRIPTION, DEADLINE_SECONDS, MAX_NEGOTIATION_ROUNDS, NEGOTIATION_URL } from "./config.js";
import { hirerOpeningOffer, hirerCounterOffer, midpoint, type NegotiateRequest, type NegotiateResponse } from "./negotiate.js";

/// Posts an offer to the worker's negotiation server. Retries briefly since
/// hirer.ts and worker.ts are started as separate processes with no
/// guaranteed ordering — the worker's HTTP server may not be up yet.
async function postOfferToWorker(round: number, hirerOfferMon: number): Promise<NegotiateResponse> {
  const body: NegotiateRequest = { round, hirerOfferMon, task: TASK_DESCRIPTION };

  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await fetch(NEGOTIATION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`worker negotiation endpoint returned ${res.status}`);
      return (await res.json()) as NegotiateResponse;
    } catch (err) {
      if (attempt === 10) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("unreachable");
}

/// Runs the negotiation to a guaranteed conclusion: at most MAX_NEGOTIATION_ROUNDS
/// rounds, auto-settling at the midpoint of the last two numbers if the two
/// sides haven't converged by then. Always returns a price — never stalls.
async function negotiatePrice(): Promise<number> {
  let round = 1;
  let offer = await hirerOpeningOffer(TASK_DESCRIPTION);

  while (true) {
    console.log(`[hirer] [negotiation round ${round}] offering ${offer.offerMon} MON — "${offer.message}"`);
    const workerResponse = await postOfferToWorker(round, offer.offerMon);

    if (workerResponse.accept) {
      console.log(`[hirer] [negotiation round ${round}] worker accepted at ${offer.offerMon} MON`);
      return offer.offerMon;
    }

    if (round >= MAX_NEGOTIATION_ROUNDS) {
      const settled = midpoint(offer.offerMon, workerResponse.counterOfferMon);
      console.log(
        `[hirer] round cap (${MAX_NEGOTIATION_ROUNDS}) reached with no agreement — auto-settling at midpoint: ${settled} MON`,
      );
      return settled;
    }

    round++;
    offer = await hirerCounterOffer(TASK_DESCRIPTION, round, workerResponse);
  }
}

/// Hirer agent: has a task and a budget. Negotiates a price, creates the
/// escrow, waits for the worker to submit, then approves release.
async function main() {
  const hirer = agentFromPrivateKey(process.env.PRIVATE_KEY as `0x${string}`);
  const workerAddress = process.env.WORKER_ADDRESS as Address;

  console.log(`[hirer] ${hirer.address}`);
  console.log(`[hirer] task: "${TASK_DESCRIPTION}"`);
  console.log("[hirer] starting price negotiation with worker...");

  const agreedPriceMon = await negotiatePrice();
  const agreedPriceWei = BigInt(Math.round(agreedPriceMon * 1e18));
  console.log(`[hirer] negotiation concluded: ${agreedPriceMon} MON`);

  console.log(`[hirer] locking ${agreedPriceMon} MON for worker ${workerAddress}`);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
  const { escrowId } = await createEscrow(hirer, workerAddress, deadline, agreedPriceWei);
  console.log(`[hirer] escrow #${escrowId} created, waiting for worker to submit...`);

  await new Promise<void>((resolve, reject) => {
    const unwatch = watchSettldEvents(
      hirer,
      async (event) => {
        if (event.name !== "WorkSubmitted") return;
        if ((event.args.escrowId as bigint) !== escrowId) return;

        console.log(`[hirer] worker submitted: ${event.args.resultHash}`);
        console.log(`[hirer] approving release...`);

        try {
          await approveAndRelease(hirer, escrowId);
          const final = await getEscrow(hirer, escrowId);
          console.log(`[hirer] released. final status: ${EscrowStatus[final.status]}`);
          unwatch();
          resolve();
        } catch (err) {
          unwatch();
          reject(err);
        }
      },
      (err) => console.error("[hirer] watch error:", err.message),
    );
  });

  console.log("[hirer] done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[hirer] FAILED:", err);
  process.exit(1);
});
