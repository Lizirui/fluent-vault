// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OrderBook
 * @notice 支持 EIP-712 的链上订单簿合约，配合链下 Relayer 完成「链下撮合、链上结算」。
 * @dev
 * - 用户在前端对 Order 结构做 EIP-712 签名（不会立刻发送交易）
 * - 链下 Relayer 校验价格 / 期限等业务规则后，在合适时机调用 {executeOrder}
 * - 合约使用 Permit + transferFrom 完成扣款，并可选将资产直接存入 FluentVault
 */
contract OrderBook is EIP712, ReentrancyGuard {
    /// @dev EIP-712 中 Order 结构体的类型哈希，用于构造 structHash。
    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address sellToken,address buyToken,uint256 sellAmount,uint256 buyAmount,uint256 price,uint256 expiry,uint256 nonce,address vault)"
    );

    /// @dev maker 地址 => nonce => 是否已被使用，用于防止重放攻击。
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @dev 当某笔订单成功结算（部分或全部）时触发，便于前端 / Indexer 订阅。
    event OrderFilled(
        bytes32 indexed orderId,
        address indexed maker,
        address indexed vault,
        uint256 sellAmount,
        uint256 buyAmount
    );

    /// @dev 签名无效或签名者与订单 maker 不一致时抛出。
    error InvalidSignature();

    /// @dev 订单已过期或 nonce 已经使用过时抛出。
    error InvalidOrder();

    constructor() EIP712("FluentVaultOrderBook", "1") {}

    /**
     * @notice Order 结构体，用于 EIP-712 哈希与链下签名。
     * @param maker 下单人地址（签名者本人）
     * @param sellToken 卖出的代币（例如 MockUSDC）
     * @param buyToken 买入的代币（演示中可以忽略具体结算逻辑）
     * @param sellAmount 卖出数量
     * @param buyAmount 期望买入数量（用于价格展示或撮合逻辑）
     * @param price UI / Relayer 使用的报价字段，链上本合约不强校验
     * @param expiry 截止时间戳，超时后订单视为无效
     * @param nonce maker 级别的唯一序号，防止同一签名被多次复用
     * @param vault 可选的 ERC-4626 Vault 地址（如 FluentVault），用于「下单即入金库」的演示
     */
    struct Order {
        address maker;
        address sellToken;
        address buyToken;
        uint256 sellAmount;
        uint256 buyAmount;
        uint256 price;
        uint256 expiry;
        uint256 nonce;
        address vault;
    }

    /**
     * @notice 只读地验证一笔 EIP-712 订单签名是否有效。
     * @param order   订单结构体
     * @param signature 前端生成的 EIP-712 签名（r+s+v）
     * @return valid   当签名正确、nonce 未用、且未过期时返回 true
     */
    function verifyOrder(Order calldata order, bytes calldata signature)
        public
        view
        returns (bool valid)
    {
        // 快速检查：是否已经过期，或者 nonce 是否已被使用。
        if (block.timestamp > order.expiry || usedNonces[order.maker][order.nonce]) {
            return false;
        }

        // 先对 Order 做一次 keccak256 编码，得到 structHash。
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.sellToken,
                order.buyToken,
                order.sellAmount,
                order.buyAmount,
                order.price,
                order.expiry,
                order.nonce,
                order.vault
            )
        );

        // 再与 EIP-712 Domain 拼接，得到最终签名消息 digest。
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        return signer == order.maker;
    }

    /**
     * @notice 执行一笔已由用户链下签名的订单。
     * @dev 展示经典的「Off-chain Order, On-chain Settlement」流程：
     *  1. 使用 EIP-712 验证订单签名是否由 maker 发出；
     *  2. 消耗 nonce，防止同一订单被重复执行；
     *  3. 通过 ERC-20 Permit 授权本合约代扣资产（免前置 Approve 交易）；
     *  4. 使用 transferFrom 完成实际扣款，并可选将资产直接存入 FluentVault 等 Vault。
     * @param order         订单结构体，需与签名内容严格一致
     * @param signature     EIP-712 订单签名
     * @param permitDeadline Permit 授权有效截止时间
     * @param v             Permit 签名参数 v
     * @param r             Permit 签名参数 r
     * @param s             Permit 签名参数 s
     * @return orderId      订单唯一标识（基于 Order 内容的哈希）
     */
    function executeOrder(
        Order calldata order,
        bytes calldata signature,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (bytes32 orderId) {
        if (!verifyOrder(order, signature)) {
            revert InvalidOrder();
        }

        // Mark nonce as used to prevent replay before any external calls.
        usedNonces[order.maker][order.nonce] = true;

        orderId = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.sellToken,
                order.buyToken,
                order.sellAmount,
                order.buyAmount,
                order.price,
                order.expiry,
                order.nonce,
                order.vault
            )
        );

        // 1) Use ERC-20 Permit to grant this contract allowance to pull sellAmount.
        IERC20Permit(order.sellToken).permit(
            order.maker,
            address(this),
            order.sellAmount,
            permitDeadline,
            v,
            r,
            s
        );

        // 2) Pull tokens from maker into this contract.
        IERC20(order.sellToken).transferFrom(order.maker, address(this), order.sellAmount);

        // 3) For demo purposes, if a vault address is provided, deposit into the vault
        //    on behalf of the maker. Otherwise, tokens simply remain in this contract
        //    (a real implementation would forward to a taker / AMM / RFQ engine).
        if (order.vault != address(0)) {
            IERC20(order.sellToken).approve(order.vault, order.sellAmount);
            IVault4626(order.vault).deposit(order.sellAmount, order.maker);
        }

        emit OrderFilled(orderId, order.maker, order.vault, order.sellAmount, order.buyAmount);
    }
}

/**
 * @dev Minimal ERC-4626 interface used by OrderBook for vault interaction.
 */
interface IVault4626 {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
}

