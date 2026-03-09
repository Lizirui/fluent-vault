// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IYieldStrategy
 * @notice FluentVault 使用的收益策略接口，通过策略模式将「资产托管」与「收益来源」解耦。
 * @dev
 * 实现本接口的合约负责：
 * - 接收 Vault 转入的底层资产并进行「投资」记账
 * - 对外报告当前托管资产的总价值（本金 + 已累积收益）
 */
interface IYieldStrategy {
    /**
     * @notice 投资指定数量的底层资产。
     * @dev
     * - 一般由 FluentVault 调用
     * - 约定调用前、或在内部，底层资产已被转入策略合约
     * @param assets 本次新增投入的底层资产数量
     */
    function invest(uint256 assets) external;

    /**
     * @notice 查询指定资产在当前策略中的「总价值」（本金 + 收益）。
     * @dev
     * - 返回值必须包含原始本金与已累积收益
     * - 具体按 Vault 维度、Asset 维度或全局维度记账，由策略自行约定，但结果应可预测且不依赖外部副作用
     * @param asset 底层 ERC20 资产合约地址
     * @return totalValue 当前托管的总价值（资产单位）
     */
    function getTotalValue(address asset) external view returns (uint256 totalValue);
}

