// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC internal token;
    address internal owner = address(0xA11CE);
    address internal user = address(0xB0B);

    function setUp() public {
        token = new MockUSDC(owner);
    }

    function testInitialSupplyMintedToOwner() public {
        assertEq(token.balanceOf(owner), 1_000_000e6);
        assertEq(token.decimals(), 6);
        assertEq(token.symbol(), "mUSDC");
    }

    function testOwnerCanMint() public {
        vm.prank(owner);
        token.mint(user, 1_000e6);

        assertEq(token.balanceOf(user), 1_000e6);
    }

    function testNonOwnerCannotMint() public {
        vm.prank(user);
        vm.expectRevert(MockUSDC.NotOwner.selector);
        token.mint(user, 1_000e6);
    }
}

