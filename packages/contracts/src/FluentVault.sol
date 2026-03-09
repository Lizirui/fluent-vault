// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

/**
 * @title FluentVault
 * @notice 基于 ERC-4626 标准实现的收益金库，将资产托管给可插拔的收益策略合约。
 * @dev
 * - Vault 负责份额（shares）与存取逻辑，对外暴露标准化接口
 * - 具体资产如何产生收益（如 Aave、Lending、Mock 策略）由 IYieldStrategy 实现决定
 * - 通过覆盖 totalAssets() 将策略中的「本金 + 收益」映射为 Vault 视角的总资产
 */
contract FluentVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;
    /// @notice Yield strategy used by the vault.
    IYieldStrategy public immutable strategy;

    /// @dev Emitted when a new strategy is set at construction.
    event StrategySet(address indexed strategy);

    /**
     * @notice 构造函数，指定底层资产与收益策略。
     * @param asset_ Vault 接受的底层 ERC20 资产（例如 MockUSDC）
     * @param strategy_ 实际负责产生收益的策略合约，实现 IYieldStrategy 接口
     */
    constructor(IERC20 asset_, IYieldStrategy strategy_)
        ERC20("FluentVault Share", "fVAULT")
        ERC4626(asset_)
    {
        strategy = strategy_;
        emit StrategySet(address(strategy_));
    }

    /**
     * @inheritdoc ERC4626
     * @dev
     * - 与标准实现不同，这里不再简单返回 Vault 自身持仓
     * - 而是委托给策略合约，返回其视角下「本金 + 累积收益」之和
     */
    function totalAssets() public view override returns (uint256) {
        return strategy.getTotalValue(address(asset()));
    }

    /**
     * @inheritdoc ERC4626
     * @dev
     * - 外部入口增加 nonReentrant，作为对重入攻击的「额外防线」
     * - 虽然 ERC-4626 本身流程较安全，但这里显式声明有助于安全审计与面试讲解
     */
    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    /**
     * @inheritdoc ERC4626
     */
    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.mint(shares, receiver);
    }

    /**
     * @inheritdoc ERC4626
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256) {
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @inheritdoc ERC4626
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override nonReentrant returns (uint256) {
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @dev 重写 ERC4626 的底层资产转入逻辑：
     * - 默认实现是将资产从 `from` 转入 Vault 合约自身
     * - 这里改为：
     *   1. 先将资产从用户地址转到 Vault（保持 ERC4626 语义）
     *   2. 再把资产从 Vault 转入策略合约地址
     *   3. 调用策略的 invest 进行记账
     *
     * 资产最终流向：User → FluentVault → Strategy。
     */
    function _transferIn(address from, uint256 assets) internal override {
        IERC20 underlying = IERC20(asset());

        // 先按照 ERC4626 默认语义，从用户转入 Vault。
        underlying.safeTransferFrom(from, address(this), assets);
        // 再将资产转入策略合约，并通知策略进行投资记账。
        underlying.safeTransfer(address(strategy), assets);
        strategy.invest(assets);
    }
}

