// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import {MockYieldStrategy} from "../src/strategies/MockYieldStrategy.sol";

contract MockYieldStrategyTest is Test {
    MockYieldStrategy internal strategy;
    // 使用一个任意但合法的地址常量，模拟 Vault 地址。
    address internal vault = address(0x123456);

    function setUp() public {
        strategy = new MockYieldStrategy();
    }

    function testAccruesYieldOverTime() public {
        uint256 principal = 1_000e18;

        // Simulate the vault calling invest from its address.
        vm.prank(vault);
        strategy.invest(principal);

        // Immediately after invest, total value should be principal (no time elapsed).
        uint256 valueNow = strategy.getTotalValue(vault);
        assertEq(valueNow, principal);

        // Fast-forward half a year and expect some positive yield.
        vm.warp(block.timestamp + 182 days);

        uint256 valueLater = strategy.getTotalValue(vault);
        assertGt(valueLater, principal);
    }
}

