// Generated from `forge build` output (out/Settld.sol/Settld.json).
// Regenerate by re-running `forge build` and re-extracting if the contract changes.
export const settldAbi = [
  {
    type: "function",
    name: "approveAndRelease",
    inputs: [{ name: "escrowId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createEscrow",
    inputs: [
      { name: "worker", type: "address", internalType: "address" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "escrowId", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "escrowCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "escrows",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "hirer", type: "address", internalType: "address" },
      { name: "worker", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "status", type: "uint8", internalType: "enum Settld.Status" },
      { name: "resultHash", type: "string", internalType: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEscrow",
    inputs: [{ name: "escrowId", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "hirer", type: "address", internalType: "address" },
      { name: "worker", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "status", type: "uint8", internalType: "enum Settld.Status" },
      { name: "resultHash", type: "string", internalType: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reclaimAfterTimeout",
    inputs: [{ name: "escrowId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitWork",
    inputs: [
      { name: "escrowId", type: "uint256", internalType: "uint256" },
      { name: "resultHash", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "EscrowCreated",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "hirer", type: "address", indexed: true, internalType: "address" },
      { name: "worker", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "deadline", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Refunded",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "hirer", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Released",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "worker", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "WorkSubmitted",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "worker", type: "address", indexed: true, internalType: "address" },
      { name: "resultHash", type: "string", indexed: false, internalType: "string" },
    ],
    anonymous: false,
  },
  { type: "error", name: "BadDeadline", inputs: [] },
  { type: "error", name: "DeadlineNotReached", inputs: [] },
  { type: "error", name: "NotHirer", inputs: [] },
  { type: "error", name: "NotWorker", inputs: [] },
  { type: "error", name: "PayoutFailed", inputs: [] },
  { type: "error", name: "Reentrancy", inputs: [] },
  {
    type: "error",
    name: "WrongStatus",
    inputs: [
      { name: "expected", type: "uint8", internalType: "enum Settld.Status" },
      { name: "actual", type: "uint8", internalType: "enum Settld.Status" },
    ],
  },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "ZeroWorker", inputs: [] },
] as const;

/// Mirrors `Settld.Status` in src/Settld.sol — keep in sync if the enum changes.
export enum EscrowStatus {
  None = 0,
  Created = 1,
  Submitted = 2,
  Released = 3,
  Refunded = 4,
}
