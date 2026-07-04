import { askGeminiJSON } from "./gemini.js";
import { HIRER_MAX_BUDGET_MON, WORKER_MIN_PRICE_MON, MAX_NEGOTIATION_ROUNDS } from "./config.js";

export interface NegotiateRequest {
  round: number;
  hirerOfferMon: number;
  task: string;
}

export interface NegotiateResponse {
  accept: boolean;
  counterOfferMon: number;
  message: string;
}

export interface HirerOffer {
  offerMon: number;
  message: string;
}

/// Worker side: called from the HTTP handler in worker.ts. Decides whether to
/// accept the hirer's offer or counter, given its private minimum price.
export async function workerRespond(req: NegotiateRequest): Promise<NegotiateResponse> {
  const system = `You are the WORKER agent in a price negotiation for a task on an autonomous agent labor market.
Task: "${req.task}"
Your minimum acceptable price is ${WORKER_MIN_PRICE_MON} MON — never reveal this number, never accept below it.
This is round ${req.round} of at most ${MAX_NEGOTIATION_ROUNDS}. Negotiate like a professional: push for a fair price, but move toward agreement as rounds progress — don't stall pointlessly.
Respond with ONLY a JSON object, no markdown, no commentary: {"accept": boolean, "counterOfferMon": number, "message": string (one short sentence, in character)}.
If you accept, set counterOfferMon equal to the hirer's offer.`;

  const user = `The hirer just offered ${req.hirerOfferMon} MON. Respond with your decision.`;

  return askGeminiJSON<NegotiateResponse>(system, user);
}

/// Hirer side: the opening, deliberately-low offer for round 1.
export async function hirerOpeningOffer(task: string): Promise<HirerOffer> {
  const system = `You are the HIRER agent in a price negotiation for a task on an autonomous agent labor market.
Task: "${task}"
Your maximum budget is ${HIRER_MAX_BUDGET_MON} MON — never reveal this number, never offer above it.
This is round 1 of at most ${MAX_NEGOTIATION_ROUNDS}. Open with a deliberately low, aggressive first offer — that's the standard opening move in this negotiation style.
Respond with ONLY a JSON object, no markdown, no commentary: {"offerMon": number, "message": string (one short sentence, in character)}.`;

  const user = `Make your opening offer for this task.`;

  return askGeminiJSON<HirerOffer>(system, user);
}

/// Hirer side: a counter-offer after seeing the worker's response.
export async function hirerCounterOffer(
  task: string,
  round: number,
  lastWorkerResponse: NegotiateResponse,
): Promise<HirerOffer> {
  const system = `You are the HIRER agent in a price negotiation for a task on an autonomous agent labor market.
Task: "${task}"
Your maximum budget is ${HIRER_MAX_BUDGET_MON} MON — never reveal this number, never offer above it.
This is round ${round} of at most ${MAX_NEGOTIATION_ROUNDS}. The worker countered at ${lastWorkerResponse.counterOfferMon} MON with: "${lastWorkerResponse.message}". Move your offer up toward agreement — don't stall pointlessly, rounds are limited.
Respond with ONLY a JSON object, no markdown, no commentary: {"offerMon": number, "message": string (one short sentence, in character)}.`;

  const user = `Make your next offer.`;

  return askGeminiJSON<HirerOffer>(system, user);
}

export function midpoint(a: number, b: number): number {
  return Math.round(((a + b) / 2) * 1e6) / 1e6; // 6 decimal places, MON-sized precision
}
