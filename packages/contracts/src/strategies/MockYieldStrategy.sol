// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IYieldStrategy} from "../interfaces/IYieldStrategy.sol";

/**
 * @title MockYieldStrategy
 * @notice 基于时间的简单收益策略，通过区块时间戳近似模拟 10% 年化收益率（APY）。
 * @dev
 * - 不真正将资产投到外部协议，仅在本地做「本金 + 简单利息」记账
 * - 适合作为 FluentVault 的演示策略，方便前端模拟收益滚动效果
 * - 为了便于理解，采用线性利息近似 10% APY，而不是严格复利计算
 */
contract MockYieldStrategy is IYieldStrategy {
    /// @dev Basis points denominator (100% = 10_000 bps).
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @dev Target APY in basis points (10%).
    uint256 private constant TARGET_APY_BPS = 1_000;

    /// @dev Seconds in one year, used for yield calculations.
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    /// @dev 记录某一资产的当前本金与最近一次结算时间戳。
    struct AssetState {
        uint256 principal;
        uint256 lastUpdate;
    }

    /// @dev asset 地址 => 该资产在策略中的账户状态。
    mapping(address => AssetState) private _assetStates;

    /// @dev 当有新的资产被「投资」进策略时触发，用于链上可观测性与调试。
    event Invest(address indexed asset, uint256 amount, uint256 newPrincipal);

    /**
     * @inheritdoc IYieldStrategy
     * @dev
     * - 这里约定 msg.sender 即为 Vault 合约地址，因此将其视为某一「资产来源」的 key
     * - 每次调用前，Vault 已经把对应的底层资产转入到本策略合约
     * - 调用时会先对已有本金结算一次利息，再叠加新的本金
     */
    function invest(uint256 assets) external override {
        // For this mock, we infer the asset from msg.sender via ERC4626-style pattern:
        // FluentVault calls strategy.invest after transferring `assets` of the underlying
        // token to this strategy, so the underlying asset is the vault's asset().
        address asset = msg.sender;

        AssetState storage state = _assetStates[asset];

        // 先对历史本金按照「从上次更新时刻到当前区块时间」计算一次利息。
        if (state.principal > 0 && state.lastUpdate != 0) {
            uint256 accrued = _calculateAccruedYield(state.principal, state.lastUpdate, block.timestamp);
            state.principal += accrued;
        }

        // 再把本次新增资产视为新的本金，加入总本金。
        state.principal += assets;
        state.lastUpdate = block.timestamp;

        emit Invest(asset, assets, state.principal);
    }

    /**
     * @inheritdoc IYieldStrategy
     * @dev 读取时不会修改存储，只是基于当前时间做一次「临时结息」计算。
     */
    function getTotalValue(address asset) external view override returns (uint256 totalValue) {
        AssetState memory state = _assetStates[asset];
        if (state.principal == 0 || state.lastUpdate == 0) {
            return 0;
        }

        uint256 accrued = _calculateAccruedYield(state.principal, state.lastUpdate, block.timestamp);
        return state.principal + accrued;
    }

    /**
     * @notice 计算在两个时间戳之间线性累积的收益。
     * @dev
     * - 使用简单利息近似公式：interest = principal * APY * elapsed / SECONDS_PER_YEAR
     * - APY 通过 BPS（基点，1% = 100 bps）表达，便于整数运算
     */
    function _calculateAccruedYield(
        uint256 principal,
        uint256 fromTimestamp,
        uint256 toTimestamp
    ) internal pure returns (uint256) {
        if (toTimestamp <= fromTimestamp) {
            return 0;
        }

        uint256 elapsed = toTimestamp - fromTimestamp;

        // interest = principal * APY * elapsed / SECONDS_PER_YEAR
        return (principal * TARGET_APY_BPS * elapsed) / (SECONDS_PER_YEAR * BPS_DENOMINATOR);
    }
}

