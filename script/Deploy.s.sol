// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Settld} from "../src/Settld.sol";

/// @notice Deploys Settld. Broadcasts with the key in $PRIVATE_KEY.
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url monad --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    function run() external returns (Settld bazaar) {
        vm.startBroadcast();
        bazaar = new Settld();
        vm.stopBroadcast();

        console.log("Settld deployed at:", address(bazaar));
    }
}
