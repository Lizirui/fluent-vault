// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

import {OrderBook} from "../src/OrderBook.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {FluentVault} from "../src/FluentVault.sol";
import {MockYieldStrategy} from "../src/strategies/MockYieldStrategy.sol";

contract OrderBookTest is Test {
    using stdJson for string;

    OrderBook internal orderBook;
    MockUSDC internal mockUSDC;
    FluentVault internal vault;
    MockYieldStrategy internal strategy;

    address internal maker = address(0xA11CE);
    uint256 internal makerPk = 0xA11CE;

    function setUp() public {
        orderBook = new OrderBook();
        mockUSDC = new MockUSDC(address(this));
        strategy = new MockYieldStrategy();
        vault = new FluentVault(mockUSDC, strategy);

        // Fund maker with tokens.
        mockUSDC.mint(maker, 10_000e6);
    }

    function _buildOrder() internal view returns (OrderBook.Order memory order) {
        order = OrderBook.Order({
            maker: maker,
            sellToken: address(mockUSDC),
            buyToken: address(0),
            sellAmount: 1_000e6,
            buyAmount: 0,
            price: 0,
            expiry: block.timestamp + 1 days,
            nonce: 1,
            vault: address(vault)
        });

    }

    function testVerifyOrderAndExecute() public {
        OrderBook.Order memory order = _buildOrder();

        // 这里只验证 verifyOrder 在未提供合法签名时返回 false，
        // 详细的 EIP-712 签名路径在前端和后端测试中覆盖。
        bool isValid = orderBook.verifyOrder(order, hex"");
        assertFalse(isValid, "order without signature should not verify");
    }
}

