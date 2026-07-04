// Shared task config for the agent processes.
export const TASK_DESCRIPTION = "Summarize the top 3 DeFi protocols on Monad in one paragraph.";
export const DEADLINE_SECONDS = 180; // escrow deadline = now + this, generous for a live demo
export const RESULT_HASH = "ipfs://bafy-demo-deliverable-summary"; // stand-in for a real deliverable pointer

// Layer 4 — negotiation. Prices in MON (converted to wei right before createEscrow).
export const HIRER_MAX_BUDGET_MON = 0.02;
export const WORKER_MIN_PRICE_MON = 0.006;
export const MAX_NEGOTIATION_ROUNDS = 3;

// Real IPC between hirer.ts and worker.ts for the pre-escrow negotiation handshake
// (there's no contract yet at this point, so this can't happen on-chain).
export const NEGOTIATION_PORT = 4021;
export const NEGOTIATION_URL = `http://127.0.0.1:${NEGOTIATION_PORT}/negotiate`;
