// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import {MockUSDC} from "../src/MockUSDC.sol";
import {MockYieldStrategy} from "../src/strategies/MockYieldStrategy.sol";
import {FluentVault} from "../src/FluentVault.sol";

contract FluentVaultTest is Test {
    MockUSDC internal asset;
    MockYieldStrategy internal strategy;
    FluentVault internal vault;

    address internal owner = address(0xA11CE);
    address internal user = address(0xB0B);

    function setUp() public {
        asset = new MockUSDC(owner);
        strategy = new MockYieldStrategy();
        vault = new FluentVault(asset, strategy);

        // Give the user some tokens.
        vm.prank(owner);
        asset.mint(user, 10_000e6);
    }

    function testDepositMintsSharesAndInvests() public {
        uint256 depositAmount = 1_000e6;

        vm.startPrank(user);
        asset.approve(address(vault), depositAmount);

        uint256 shares = vault.deposit(depositAmount, user);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vault.balanceOf(user), shares);

        // Strategy should report at least the deposited amount as total value.
        uint256 totalAssets = vault.totalAssets();
        assertEq(totalAssets, depositAmount);
    }
}

