// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Settld} from "../src/Settld.sol";

contract SettldTest is Test {
    Settld bazaar;

    address hirer = makeAddr("hirer");
    address worker = makeAddr("worker");
    address stranger = makeAddr("stranger");

    uint256 constant AMOUNT = 1 ether;

    function setUp() public {
        bazaar = new Settld();
        vm.deal(hirer, 10 ether);
        vm.deal(stranger, 10 ether);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(hirer);
        id = bazaar.createEscrow{value: AMOUNT}(worker, block.timestamp + 1 days);
    }

    // ----- happy path -----

    function test_FullHappyPath() public {
        uint256 id = _create();
        assertEq(id, 1);

        vm.prank(worker);
        bazaar.submitWork(id, "ipfs://result");

        uint256 before = worker.balance;
        vm.prank(hirer);
        bazaar.approveAndRelease(id);

        assertEq(worker.balance, before + AMOUNT);
        (, , , , Settld.Status status, ) = bazaar.getEscrow(id);
        assertEq(uint8(status), uint8(Settld.Status.Released));
    }

    function test_ReclaimAfterTimeout() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 2 days);

        uint256 before = hirer.balance;
        vm.prank(hirer);
        bazaar.reclaimAfterTimeout(id);

        assertEq(hirer.balance, before + AMOUNT);
        (, , , , Settld.Status status, ) = bazaar.getEscrow(id);
        assertEq(uint8(status), uint8(Settld.Status.Refunded));
    }

    // ----- guards -----

    function test_RevertWhen_NonWorkerSubmits() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert(Settld.NotWorker.selector);
        bazaar.submitWork(id, "x");
    }

    function test_RevertWhen_NonHirerReleases() public {
        uint256 id = _create();
        vm.prank(worker);
        bazaar.submitWork(id, "x");
        vm.prank(stranger);
        vm.expectRevert(Settld.NotHirer.selector);
        bazaar.approveAndRelease(id);
    }

    function test_RevertWhen_ReleaseBeforeSubmit() public {
        uint256 id = _create();
        vm.prank(hirer);
        vm.expectRevert();
        bazaar.approveAndRelease(id);
    }

    function test_RevertWhen_ReclaimBeforeDeadline() public {
        uint256 id = _create();
        vm.prank(hirer);
        vm.expectRevert(Settld.DeadlineNotReached.selector);
        bazaar.reclaimAfterTimeout(id);
    }

    function test_RevertWhen_ZeroValue() public {
        vm.prank(hirer);
        vm.expectRevert(Settld.ZeroAmount.selector);
        bazaar.createEscrow{value: 0}(worker, block.timestamp + 1 days);
    }

    function test_RevertWhen_DoubleRelease() public {
        uint256 id = _create();
        vm.prank(worker);
        bazaar.submitWork(id, "x");
        vm.prank(hirer);
        bazaar.approveAndRelease(id);
        vm.prank(hirer);
        vm.expectRevert();
        bazaar.approveAndRelease(id);
    }
}
