// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

import {MockUSDC} from "../src/MockUSDC.sol";
import {MockYieldStrategy} from "../src/strategies/MockYieldStrategy.sol";
import {FluentVault} from "../src/FluentVault.sol";
import {OrderBook} from "../src/OrderBook.sol";

/**
 * @title DeployFluentVault
 * @notice 使用 Foundry Script 一键部署 FluentVault 相关核心合约的示例脚本。
 * @dev 用法示例（以 Sepolia 为例）：
 *
 * forge script script/Deploy.s.sol:DeployFluentVault --rpc-url $SEPOLIA_RPC_URL --broadcast
 *
 * - 依赖环境变量：DEPLOYER_PRIVATE_KEY（部署者私钥，对应有测试 ETH）
 * - 部署顺序：MockUSDC -> MockYieldStrategy -> FluentVault -> OrderBook
 * - 脚本结束后会在控制台打印每个合约地址，方便前端 / .env 引用
 */
contract DeployFluentVault is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // 开始广播交易，后续 new 合约的操作都会通过该私钥真正发往链上。
        vm.startBroadcast(deployerPrivateKey);

        // 使用真实 EOA 地址作为 MockUSDC 的 owner，而不是脚本合约地址
        MockUSDC mockUsdc = new MockUSDC(deployer);
        MockYieldStrategy strategy = new MockYieldStrategy();
        FluentVault vault = new FluentVault(mockUsdc, strategy);
        OrderBook orderBook = new OrderBook();

        // 结束广播，避免后续无关操作继续消耗 Gas。
        vm.stopBroadcast();

        console2.log("=== FluentVault deployment summary ===");
        console2.log("MOCK_USDC=%s", address(mockUsdc));
        console2.log("MOCK_YIELD_STRATEGY=%s", address(strategy));
        console2.log("FLUENT_VAULT=%s", address(vault));
        console2.log("ORDER_BOOK=%s", address(orderBook));
    }
}

