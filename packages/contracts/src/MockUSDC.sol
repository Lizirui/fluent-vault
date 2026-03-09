// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice 简化版 USDC 测试代币，支持 EIP-2612 Permit，用于 FluentVault 相关交互的本地 / 测试网演示。
 * @dev
 * - 通过继承 ERC20 + ERC20Permit 实现标准代币与 Permit 能力
 * - 通过 Ownable 做「中心化铸币」，方便 Faucet、脚本等快速发币
 * - 仅用于演示与测试，不适合作为真实生产稳定币实现
 */
contract MockUSDC is ERC20, ERC20Permit, Ownable {
    /// @dev Emitted when new tokens are minted.
    event Mint(address indexed to, uint256 amount);

    /// @dev Thrown when a non-owner attempts to call an owner-only function.
    error NotOwner();

    /**
     * @param initialOwner 初始 owner 地址，后续只有该地址可以调用 mint
     */
    constructor(address initialOwner)
        ERC20("Mock USDC", "mUSDC")
        ERC20Permit("Mock USDC")
        Ownable(initialOwner)
    {
        // 为 owner 预铸一部分测试代币，方便后续给用户转账或作为 Faucet 资金来源。
        uint256 initialSupply = 1_000_000e6;
        _mint(initialOwner, initialSupply);
        emit Mint(initialOwner, initialSupply);
    }

    /**
     * @notice 向指定地址铸造新的测试代币。
     * @dev
     * - 仅 owner 可调用，用于 Faucet 或测试脚本按需发放资金
     * - amount 单位为最小精度（6 位小数）
     * @param to 接收新代币的账户地址
     * @param amount 铸造数量（含 6 位小数）
     */
    function mint(address to, uint256 amount) external {
        if (msg.sender != owner()) {
            revert NotOwner();
        }

        _mint(to, amount);
        emit Mint(to, amount);
    }

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        // 模拟真实 USDC，使用 6 位小数而不是 ERC20 默认的 18 位。
        return 6;
    }
}

