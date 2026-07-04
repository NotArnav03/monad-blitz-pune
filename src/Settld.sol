// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Settld — trustless escrow rail for agent-to-agent labor
/// @notice A hirer agent locks native MON for a worker agent. Work is delivered
///         off-chain (only a result hash is recorded on-chain), then the hirer
///         optimistically releases funds. If the deadline passes with no
///         approval, the hirer can reclaim the deposit.
/// @dev    Optimistic release only: no disputes, no proof verification, no
///         arbitration. Minimal on purpose — richness lives in the TS layer.
contract Settld {
    // --------------------------------------------------------------------
    // Types
    // --------------------------------------------------------------------

    /// @dev State machine: Created -> Submitted -> (Released | Refunded)
    enum Status {
        None,       // 0: escrow id never used
        Created,    // 1: funds locked, awaiting work
        Submitted,  // 2: worker recorded a delivery
        Released,   // 3: hirer approved, funds paid to worker (terminal)
        Refunded    // 4: deadline passed, hirer reclaimed funds (terminal)
    }

    struct Escrow {
        address hirer;      // who deposited the funds / approves release
        address worker;     // who does the work / receives the funds
        uint256 amount;     // locked native MON, in wei
        uint256 deadline;   // unix timestamp; after this the hirer may reclaim
        Status status;      // current state
        string resultHash;  // worker's delivery pointer (ipfs cid, url, sha, ...)
    }

    // --------------------------------------------------------------------
    // Storage
    // --------------------------------------------------------------------

    /// @notice escrowId => escrow record. Ids start at 1 (0 is reserved).
    mapping(uint256 => Escrow) public escrows;

    /// @notice number of escrows ever created; also the id of the latest one.
    uint256 public escrowCount;

    /// @dev reentrancy guard state (1 = unlocked, 2 = locked)
    uint256 private _lock = 1;

    // --------------------------------------------------------------------
    // Events — one per state transition so the dashboard can react live
    // --------------------------------------------------------------------

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed hirer,
        address indexed worker,
        uint256 amount,
        uint256 deadline
    );
    event WorkSubmitted(uint256 indexed escrowId, address indexed worker, string resultHash);
    event Released(uint256 indexed escrowId, address indexed worker, uint256 amount);
    event Refunded(uint256 indexed escrowId, address indexed hirer, uint256 amount);

    // --------------------------------------------------------------------
    // Errors — cheap, explicit failure reasons
    // --------------------------------------------------------------------

    error ZeroWorker();
    error ZeroAmount();
    error BadDeadline();
    error NotHirer();
    error NotWorker();
    error WrongStatus(Status expected, Status actual);
    error DeadlineNotReached();
    error PayoutFailed();
    error Reentrancy();

    // --------------------------------------------------------------------
    // Modifiers
    // --------------------------------------------------------------------

    modifier nonReentrant() {
        if (_lock == 2) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // --------------------------------------------------------------------
    // Core flow
    // --------------------------------------------------------------------

    /// @notice Hirer locks native MON for `worker`, to be delivered by `deadline`.
    /// @param worker   the agent that will perform the work and be paid.
    /// @param deadline unix timestamp after which the hirer may reclaim funds.
    /// @return escrowId the id of the newly created escrow.
    function createEscrow(address worker, uint256 deadline)
        external
        payable
        returns (uint256 escrowId)
    {
        if (worker == address(0)) revert ZeroWorker();
        if (msg.value == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert BadDeadline();

        escrowId = ++escrowCount;
        escrows[escrowId] = Escrow({
            hirer: msg.sender,
            worker: worker,
            amount: msg.value,
            deadline: deadline,
            status: Status.Created,
            resultHash: ""
        });

        emit EscrowCreated(escrowId, msg.sender, worker, msg.value, deadline);
    }

    /// @notice Worker records a delivery for a Created escrow.
    /// @dev    Only the assigned worker; only from the Created state.
    function submitWork(uint256 escrowId, string calldata resultHash) external {
        Escrow storage e = escrows[escrowId];
        if (msg.sender != e.worker) revert NotWorker();
        if (e.status != Status.Created) revert WrongStatus(Status.Created, e.status);

        e.status = Status.Submitted;
        e.resultHash = resultHash;

        emit WorkSubmitted(escrowId, msg.sender, resultHash);
    }

    /// @notice Hirer approves submitted work and releases funds to the worker.
    /// @dev    Only the hirer; only from the Submitted state. CEI + guard.
    function approveAndRelease(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (msg.sender != e.hirer) revert NotHirer();
        if (e.status != Status.Submitted) revert WrongStatus(Status.Submitted, e.status);

        // Effects before interaction.
        e.status = Status.Released;
        uint256 amount = e.amount;
        address worker = e.worker;

        (bool ok, ) = payable(worker).call{value: amount}("");
        if (!ok) revert PayoutFailed();

        emit Released(escrowId, worker, amount);
    }

    /// @notice Hirer reclaims the deposit after the deadline if not yet released.
    /// @dev    Allowed from Created or Submitted (i.e. "no approval") once the
    ///         deadline has passed. Only the hirer. CEI + guard.
    function reclaimAfterTimeout(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        if (msg.sender != e.hirer) revert NotHirer();
        if (e.status != Status.Created && e.status != Status.Submitted) {
            revert WrongStatus(Status.Created, e.status);
        }
        if (block.timestamp < e.deadline) revert DeadlineNotReached();

        // Effects before interaction.
        e.status = Status.Refunded;
        uint256 amount = e.amount;
        address hirer = e.hirer;

        (bool ok, ) = payable(hirer).call{value: amount}("");
        if (!ok) revert PayoutFailed();

        emit Refunded(escrowId, hirer, amount);
    }

    // --------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------

    /// @notice Full escrow record in one call, for the SDK's getEscrow reader.
    function getEscrow(uint256 escrowId)
        external
        view
        returns (
            address hirer,
            address worker,
            uint256 amount,
            uint256 deadline,
            Status status,
            string memory resultHash
        )
    {
        Escrow storage e = escrows[escrowId];
        return (e.hirer, e.worker, e.amount, e.deadline, e.status, e.resultHash);
    }
}
