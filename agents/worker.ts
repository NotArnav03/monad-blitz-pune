import "dotenv/config";
import http from "node:http";
import { agentFromPrivateKey } from "../sdk/client.js";
import { submitWork } from "../sdk/escrow.js";
import { watchSettldEvents } from "../sdk/events.js";
import { RESULT_HASH, NEGOTIATION_PORT } from "./config.js";
import { workerRespond, type NegotiateRequest } from "./negotiate.js";

/// Pre-escrow negotiation channel. There's no contract yet at this point, so
/// hirer.ts and worker.ts talk price over a plain local HTTP call instead of
/// on-chain events. Once escrow creation happens, everything below goes back
/// to being purely event-driven, same as Layer 3.
function startNegotiationServer(): void {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/negotiate") {
      res.writeHead(404).end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body) as NegotiateRequest;
        console.log(`[worker] [negotiation round ${parsed.round}] hirer offers ${parsed.hirerOfferMon} MON`);

        const decision = await workerRespond(parsed);
        console.log(
          `[worker] [negotiation round ${parsed.round}] ${decision.accept ? "accepts" : `counters ${decision.counterOfferMon} MON`} — "${decision.message}"`,
        );

        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(decision));
      } catch (err) {
        console.error("[worker] negotiation handler error:", err);
        res.writeHead(500).end(JSON.stringify({ error: String(err) }));
      }
    });
  });

  server.listen(NEGOTIATION_PORT, () => {
    console.log(`[worker] negotiation server listening on :${NEGOTIATION_PORT}`);
  });
}

/// Worker agent: has a minimum acceptable price (used in negotiation).
/// Watches for an escrow created for it, "does the work" (simulated), submits
/// the result, then watches for its own release to confirm payment landed.
async function main() {
  startNegotiationServer();

  const worker = agentFromPrivateKey(process.env.WORKER_PRIVATE_KEY as `0x${string}`);
  console.log(`[worker] ${worker.address}`);
  console.log("[worker] watching for an escrow addressed to me...");

  const escrowId = await new Promise<bigint>((resolve) => {
    const unwatch = watchSettldEvents(
      worker,
      (event) => {
        if (event.name !== "EscrowCreated") return;
        if ((event.args.worker as string).toLowerCase() !== worker.address.toLowerCase()) return;

        console.log(`[worker] escrow #${event.args.escrowId} created for me, amount ${Number(event.args.amount as bigint) / 1e18} MON`);
        unwatch();
        resolve(event.args.escrowId as bigint);
      },
      (err) => console.error("[worker] watch error:", err.message),
    );
  });

  console.log("[worker] doing the work...");
  await new Promise((r) => setTimeout(r, 2000)); // simulated task execution

  console.log(`[worker] submitting result: ${RESULT_HASH}`);
  await submitWork(worker, escrowId, RESULT_HASH);
  console.log("[worker] submitted, waiting for hirer to release payment...");

  await new Promise<void>((resolve) => {
    const unwatch = watchSettldEvents(
      worker,
      (event) => {
        if (event.name !== "Released") return;
        if ((event.args.escrowId as bigint) !== escrowId) return;

        console.log(`[worker] payment released: ${Number(event.args.amount as bigint) / 1e18} MON received`);
        unwatch();
        resolve();
      },
      (err) => console.error("[worker] watch error:", err.message),
    );
  });

  console.log("[worker] done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker] FAILED:", err);
  process.exit(1);
});
