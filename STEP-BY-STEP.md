# Settld — Step-by-Step Build Log

An autonomous agent-to-agent labor market with onchain escrow on **Monad testnet**.
Two AI agents negotiate a price, lock funds in escrow, deliver work, and settle
onchain — zero human input. This file grows one layer at a time.

- **Layer 1 — Escrow contract**: ✅ DONE
- **Layer 2 — TS agent SDK (viem wrappers)**: ✅ DONE
- **Layer 3 — Two agent processes (hardcoded price)**: ✅ DONE
- **Layer 4 — LLM price negotiation**: ✅ DONE ← YOU ARE HERE
- Layer 5 — Live dashboard — *not started*

## Design decision: escrow + ERC-8004 (not x402/MPP)

Checked this against the info-session materials before going further:

- **x402 / MPP** (Monad's agentic payment rails) are **instant, one-shot payments only —
  no escrow, no fund-holding.** They don't cover "lock now, release on delivery,
  refund on timeout." So they don't replace `Settld.sol` — they solve a
  different problem (metered API pay-per-call), not agent-to-agent task payment
  with a trust window.
- **ERC-8004 (Trustless Agents)** *is* directly relevant and already **live on Monad
  testnet** — zero Solidity needed on our side, just viem calls:
  - Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (agent mints an
    ERC-721 "identity" — a name, API endpoint, wallet).
  - Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (structured
    on-chain feedback after an interaction).
  - Validation Registry: not yet deployed ("coming soon") — skip it.

**Plan:** keep the escrow as the settlement core (it's the piece nothing else on
Monad provides).

**Revised — ERC-8004 cut from Layer 2.** Before writing the SDK, checked whether
the registries actually have bytecode on **Monad testnet** (chain 10143, where our
wallets and Settld live) — `cast code` returns `0x` (nothing deployed) for both
Identity and Reputation registries on testnet. They *are* deployed on Monad
**mainnet** (chain 143) — confirmed real bytecode there. Since the whole build
runs on testnet MON (faucet + claimed tokens, zero real-money risk), integrating
ERC-8004 would mean either operating on mainnet with real funds, or calling a
nonexistent contract that reverts every tx. Per "cut anything that threatens the
demo," **Layer 2 covers only the Settld escrow contract** — ERC-8004 stays as a
documented future-work line in the README/pitch, no code calling it.

---

## Layer 1 — The Escrow Contract

### What we built and why

`src/Settld.sol` is a deliberately minimal escrow. The whole state machine is:

```
createEscrow()   →  Created
                       │  worker submits
submitWork()     →  Submitted
                       │  hirer approves            OR   deadline passes, hirer reclaims
approveAndRelease() → Released (worker paid)   reclaimAfterTimeout() → Refunded (hirer refunded)
```

Four functions, exactly as spec'd:

| Function | Who can call | From state | Effect |
|---|---|---|---|
| `createEscrow(worker, deadline)` payable | anyone (becomes hirer) | — | locks `msg.value`, returns `escrowId` |
| `submitWork(id, resultHash)` | only the worker | Created | records delivery → Submitted |
| `approveAndRelease(id)` | only the hirer | Submitted | pays worker → Released |
| `reclaimAfterTimeout(id)` | only the hirer | Created/Submitted, past deadline | refunds hirer → Refunded |

**Footguns guarded:**
- **State validation** — every function reverts with `WrongStatus` if the escrow isn't in the state it expects. Terminal states (Released/Refunded) can't be re-entered, so no double-spend.
- **Access control** — `NotWorker` / `NotHirer` reverts. Only the worker submits; only the hirer approves or reclaims.
- **Reentrancy** — payouts use checks-effects-interactions (status flipped to terminal *before* the `.call`) **plus** a `nonReentrant` lock. Belt and suspenders.
- **Custom errors** instead of `require` strings — cheaper gas, cleaner decode in viem later.
- Emits an event on **every** transition (`EscrowCreated`, `WorkSubmitted`, `Released`, `Refunded`) — the Layer 5 dashboard subscribes to these.

`escrowId` starts at **1** (0 is reserved as "never used"), so a missing escrow reads back as `Status.None`.

### Files in this layer

```
monad/
├── foundry.toml          # solc 0.8.24, cancun evm, Monad rpc + verify config
├── .env.example          # copy to .env, fill keys (never commit .env)
├── .gitignore
├── src/Settld.sol    # the contract
├── script/Deploy.s.sol    # deploy script (broadcasts with $PRIVATE_KEY)
└── test/Settld.t.sol # full happy path + guard tests
```

---

## Setup — do this once

### 1. Install Foundry

Foundry isn't installed yet. On Windows, the cleanest path is **WSL** (recommended — Foundry is a first-class Linux citizen), but native Windows works via Git Bash.

**WSL / Git Bash:**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```
Then reopen the shell so `forge`, `cast`, `anvil` are on PATH. Verify:
```bash
forge --version
```

> If `curl | bash` won't run on native Windows, use WSL: `wsl --install` in an admin PowerShell, reboot, then run the two commands above inside the Ubuntu shell. Do the rest of this layer inside WSL too.

### 2. Install the test/script dependency (forge-std)

From the project root (`C:\Projects\monad`, or `/mnt/c/Projects/monad` in WSL):
```bash
git init            # foundry expects a git repo for submodule installs
forge install foundry-rs/forge-std
```
This creates `lib/forge-std/`. (`.gitignore` already excludes build artifacts.)

### 3. Set up your two agent wallets

You need **two** keypairs: a **hirer** (also the deployer) and a **worker**.
Generate them with cast (or use MetaMask and export the keys):
```bash
cast wallet new
cast wallet new
```
Copy `.env.example` → `.env` and paste both private keys + leave `CONTRACT_ADDRESS` blank for now.

### 4. Get testnet MON from the faucet

Monad's native gas token on testnet is **MON**.

- Faucet: **https://faucet.monad.xyz** (also reachable from the Monad Developer Portal).
- Paste the **hirer** address, request funds. Then do the **worker** address too — the worker needs a little MON to pay gas on `submitWork`.
- **Faucet rate limits are real** (per-address + per-IP, and it may want a captcha or a small mainnet ETH balance / X login depending on the current gate). Fund both wallets *now*, early, so you're not blocked mid-demo. If the primary faucet is rate-limited, alternates exist (thirdweb, QuickNode, Owlto Monad faucets).
- Check balances:
```bash
cast balance <ADDRESS> --rpc-url https://testnet-rpc.monad.xyz
```

---

## Monad testnet config (memorize these)

| Thing | Value |
|---|---|
| Network name | Monad Testnet |
| **Chain ID** | **10143** |
| RPC URL | `https://testnet-rpc.monad.xyz` |
| Currency symbol | MON (18 decimals) |
| Block explorer | `https://testnet.monadexplorer.com` |
| Faucet | `https://faucet.monad.xyz` |

Add to MetaMask via the explorer's "Add Network" or manually with the values above.

### ⚠️ Monad gotchas that will bite you (flagged early per your ask)

1. **Chain ID 10143** — hardcode it correctly in the viem chain object (Layer 2). A wrong chain ID = every tx silently fails signature/broadcast.
2. **Fast blocks, RPC lag.** Monad targets ~sub-second/1s blocks. Your `eth_getTransactionReceipt` may return null for a beat after the tx lands. In viem, always `await publicClient.waitForTransactionReceipt({ hash })` rather than reading state immediately — don't assume "tx sent" == "state changed" on the very next line.
3. **Gas estimation.** Monad is EVM-equivalent but `eth_estimateGas` can occasionally under/over-shoot on a fresh testnet. If a tx mysteriously reverts, try setting an explicit gas limit. `createEscrow` is cheap; the payout `.call` is the only external interaction.
4. **`eth_getLogs` block-range caps.** Public RPCs often cap the range per `getLogs` call. For the dashboard (Layer 5), prefer **event subscriptions / `watchContractEvent` from the current block** over back-scanning huge ranges. If you must backfill, page in small chunks.
5. **Nonce management with two agents.** Hirer and worker are separate keys → separate nonces, so they won't collide. But if a single agent fires two txs fast, let viem manage the nonce or you'll get "nonce too low." One in-flight tx per agent at a time in the demo loop.
6. **Rate limits on the public RPC.** Heavy polling (Layer 3 loops + Layer 5 dashboard) can hit the public endpoint's rate limit. Keep poll intervals reasonable (e.g. 1–2s), or grab a free RPC key from a Monad-supporting provider (Alchemy/QuickNode/Ankr) if you see 429s during the demo.
7. **Deadlines use `block.timestamp`.** For the demo, set a *short* deadline (e.g. now + 120s) so you can show the reclaim/refund path live without waiting a day.
8. **10 MON reserve-balance floor, confirmed via MONSKILLS.** Monad reverts a tx if an EOA's ending balance would drop below `min(starting_balance, 10 MON)`, and accounts under that floor get rate-limited to **1 tx per ~1.2s (3 blocks)**. With 20 MON claimed per wallet, keep `createEscrow` amounts small (0.01–0.1 MON as planned) so balances stay well clear of 10 MON — don't let either agent wallet's balance wander near the floor mid-demo.
9. **~1.2s delay after funding a wallet, confirmed via MONSKILLS.** Monad's async execution means a *newly funded* account can't send its own tx until that funding transfer is 3 blocks old (~1.2s) — consensus checks gas budget against a delayed state view that hasn't caught up yet. **Fund the worker wallet now, well ahead of the live demo** — don't top it up moments before `submitWork` runs or that call may fail. The hirer/deployer wallet (already holding the 20 MON claim) isn't affected since it isn't being freshly funded again.

---

## Build, test, deploy

### Build
```bash
forge build
```

### Run the tests (do this — it proves the state machine + guards)
```bash
forge test -vvv
```
Expect all green: full happy path, reclaim-after-timeout, and every guard revert.

### Deploy to Monad testnet
Load your `.env` and broadcast:
```bash
# WSL/Git Bash
source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url monad \
  --broadcast \
  --private-key $PRIVATE_KEY
```
The console prints `Settld deployed at: 0x....`. **Paste that into `.env` as `CONTRACT_ADDRESS`.**

> `--rpc-url monad` resolves via the `[rpc_endpoints]` alias in `foundry.toml`, so you don't have to paste the URL each time.

### (Optional) Verify on the explorer
Monad testnet supports Sourcify verification:
```bash
forge verify-contract <CONTRACT_ADDRESS> src/Settld.sol:Settld \
  --chain 10143 \
  --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org
```

---

## Manually exercise every function (your acceptance test for Layer 1)

Set a couple of shell vars first:
```bash
source .env
RPC=https://testnet-rpc.monad.xyz
C=$CONTRACT_ADDRESS
WORKER_ADDR=$(cast wallet address --private-key $WORKER_PRIVATE_KEY)
```

**1. Create an escrow** (hirer locks 0.01 MON, deadline in 120s), capture the id from the event:
```bash
cast send $C "createEscrow(address,uint256)" $WORKER_ADDR $(($(date +%s)+120)) \
  --value 0.01ether --rpc-url $RPC --private-key $PRIVATE_KEY
# first escrow id is 1
cast call $C "escrowCount()(uint256)" --rpc-url $RPC
```

**2. Read it back:**
```bash
cast call $C "getEscrow(uint256)(address,address,uint256,uint256,uint8,string)" 1 --rpc-url $RPC
# status field: 1 = Created
```

**3. Worker submits work:**
```bash
cast send $C "submitWork(uint256,string)" 1 "ipfs://demo-result" \
  --rpc-url $RPC --private-key $WORKER_PRIVATE_KEY
# status now 2 = Submitted
```

**4. Hirer approves & releases** (worker balance should jump by 0.01 MON):
```bash
cast balance $WORKER_ADDR --rpc-url $RPC        # before
cast send $C "approveAndRelease(uint256)" 1 --rpc-url $RPC --private-key $PRIVATE_KEY
cast balance $WORKER_ADDR --rpc-url $RPC        # after — up 0.01 MON
# status now 3 = Released
```

**5. Test the refund path** with a *second* escrow and a short deadline:
```bash
cast send $C "createEscrow(address,uint256)" $WORKER_ADDR $(($(date +%s)+30)) \
  --value 0.01ether --rpc-url $RPC --private-key $PRIVATE_KEY
# wait ~30s for the deadline to pass, then:
cast send $C "reclaimAfterTimeout(uint256)" 2 --rpc-url $RPC --private-key $PRIVATE_KEY
# status now 4 = Refunded; hirer got the 0.01 MON back
```

**Also sanity-check the guards fail as expected:**
- Worker calling `approveAndRelease` → reverts `NotHirer`.
- Hirer calling `submitWork` → reverts `NotWorker`.
- Approving before submit → reverts `WrongStatus`.

Once all of this works on-chain, Layer 1 is done. **Tell me and I'll build Layer 2 (the viem SDK).**

---

## Status log

- **Layer 1**: ✅ DONE. Renamed to Settld. Deployed to Monad testnet at
  `0xb774f275b73a02D3E89F58cDb3f48a6e6feA6F39`. Verified live on-chain:
  - Escrow #1: full happy path (Created → Submitted → Released), worker balance
    confirmed +0.01 MON.
  - Escrow #2: refund path (Created → Refunded after 20s deadline), hirer balance
    confirmed +0.01 MON (net gas).
  - Access control: worker calling `approveAndRelease` reverts `NotHirer`; hirer
    calling `submitWork` reverts `NotWorker` — confirmed on testnet, not just
    local Foundry tests.
  - Hirer: `0x6D6Eb75490A80153503Fc7A71908B0bb30EEe114` (18 MON claimed, ~17.8 left)
  - Worker: `0xb2BA2A6c545D3Aa0533D8071043F234417576cF3` (~2 MON, funded early)

- **Layer 2**: ✅ DONE. `sdk/` package (viem 2.40, TypeScript, tsx):
  - `sdk/abi.ts` — Settld ABI extracted verbatim from the Foundry build artifact
    (`out/Settld.sol/Settld.json`), plus an `EscrowStatus` enum mirroring the
    Solidity one.
  - `sdk/chain.ts` — Monad testnet viem chain definition (chain id 10143).
  - `sdk/client.ts` — `agentFromPrivateKey(key)` → `{ address, publicClient, walletClient }`.
  - `sdk/escrow.ts` — typed wrappers for all four write functions plus
    `getEscrow(agent, id)`. Every write waits for the receipt before returning
    (per the fast-block/RPC-lag gotcha); `createEscrow` parses the returned
    `escrowId` out of the `EscrowCreated` log rather than guessing from
    `escrowCount`.
  - `sdk/events.ts` — `watchSettldEvents(agent, onEvent, onError?)`. Implemented
    as a **self-managed polling loop over `getContractEvents`** with an explicit
    `fromBlock`/`toBlock` cursor, not viem's `watchContractEvent` — that
    abstraction intermittently missed the first log in testing (root cause not
    fully pinned down, didn't reproduce consistently across otherwise-identical
    scripts) whereas the explicit cursor passed 3/3 clean runs. Never
    back-scans; only ever queries `[lastSeenBlock+1, latest]`.
  - `sdk/check.ts` — integration check exercising read + write + event-watch
    together against the live testnet deployment. Run with `npx tsx sdk/check.ts`.
    Passed 3/3 consecutive runs before moving on.

- **Layer 3**: ✅ DONE. Two standalone, independent Node processes:
  - `agents/config.ts` — shared task config: hardcoded `AGREED_PRICE_WEI` (0.01
    MON), `DEADLINE_SECONDS` (180), a fake task description and result hash.
    Layer 4 will replace the hardcoded price with a negotiated one, feeding the
    same `createEscrow` call.
  - `agents/hirer.ts` — creates the escrow, watches for `WorkSubmitted` on its
    own escrowId, calls `approveAndRelease`, exits.
  - `agents/worker.ts` — watches for `EscrowCreated` addressed to its own
    address, simulates doing the work, calls `submitWork`, watches for its own
    `Released` event to confirm payment, exits.
  - Verified live on testnet: ran worker first (background), then hirer — full
    sequence Created → Submitted → Released, worker independently detected
    both the escrow creation and the final payment via its own event watcher
    (never talked to the hirer process directly). Escrow #15. Both processes
    exited cleanly (code 0).
  - Run it yourself: `npx tsx agents/worker.ts &` then `npx tsx agents/hirer.ts`
    (start worker first so its watcher's block-cursor baseline is set before
    the escrow exists).

- **Layer 4**: ✅ DONE. LLM negotiation using **Gemini** (`@google/genai`,
  model `gemini-2.5-flash`) — the user asked to use their own Gemini key
  instead of Claude for the agent-vs-agent negotiation calls.
  - `agents/gemini.ts` — thin wrapper: `askGeminiJSON(system, user)`, strips
    markdown code-fences defensively since small models wrap JSON in them often.
  - `agents/negotiate.ts` — the negotiation protocol: `hirerOpeningOffer`,
    `hirerCounterOffer`, `workerRespond`, `midpoint`. Neither side's minimum/
    maximum is ever revealed to the other, only in each side's own system prompt.
  - **Real IPC**, not a simulated single-process dialogue (deliberate choice
    over the lower-risk alternative) — `worker.ts` runs a plain `node:http`
    server on `:4021` (`agents/config.ts` → `NEGOTIATION_PORT`) with a
    `POST /negotiate` handler; `hirer.ts` posts each offer to it, with a
    10-attempt/500ms retry loop since the two processes start independently
    and startup ordering isn't guaranteed.
  - **Guaranteed termination**: at most `MAX_NEGOTIATION_ROUNDS` (3) rounds.
    If the worker hasn't accepted by round 3, the code — not the LLM — forces
    settlement at the midpoint of the last hirer offer and worker counter.
    Never stalls, always returns a price.
  - Verified live end-to-end on testnet: round 1 hirer opened at 0.005 MON,
    worker countered 0.007 MON, round 2 hirer offered 0.008 MON, worker
    accepted — flowed straight into `createEscrow` (escrow #16), submit,
    and release. Both processes' transcripts match exactly; worker exited
    clean (code 0).
  - `.env` needs `GEMINI_API_KEY` set (separate from the Monad/wallet keys).
