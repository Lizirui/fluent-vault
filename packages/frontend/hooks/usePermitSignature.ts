/**
 * usePermitSignature Hook
 * -----------------------
 * 作用：
 * - 封装 EIP-2612 Permit 的签名流程，为前端业务提供统一的「授权签名」能力
 * - 自动：
 *   - 读取代币的 nonces(owner)
 *   - 构造 EIP-712 Domain / Types / Message
 *   - 使用当前连接钱包发起 signTypedData
 *
 * 使用场景：
 * - Gasless 下单前，将用户的 MockUSDC 授权给 OrderBook 合约 / FluentVault 等合约消费
 * - 避免用户先手动点一笔 Approve 交易，再点一次业务交易
 */

import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";

// 最小 ERC20Permit ABI：仅包含 name() 与 nonces(owner) 两个只读函数。
const erc20PermitAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export interface UsePermitSignatureParams {
  tokenAddress: Address;
  spender: Address;
  value: bigint;
  /**
   * 允许外部显式指定 chainId；如果未传，则使用当前 PublicClient 上的链 ID。
   */
  chainId?: bigint;
  /**
   * Permit 截止时间（Unix 时间戳，秒），例如当前时间 + 1 小时。
   */
  deadline: bigint;
}

export interface PermitSignatureResult {
  signature: Hex;
  v: number;
  r: Hex;
  s: Hex;
  nonce: bigint;
  deadline: bigint;
}

export function usePermitSignature(params: UsePermitSignatureParams) {
  const { tokenAddress, spender, value, chainId: maybeChainId, deadline } = params;

  const { address: owner } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PermitSignatureResult | null>(null);

  /**
   * 拆分 65 字节的 ECDSA 签名为 v/r/s 三部分。
   */
  function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
    const sig = signature.slice(2); // 去掉 0x
    const r = `0x${sig.slice(0, 64)}` as Hex;
    const s = `0x${sig.slice(64, 128)}` as Hex;
    const v = parseInt(sig.slice(128, 130), 16);
    return { v, r, s };
  }

  const signPermit = useCallback(async (): Promise<PermitSignatureResult | null> => {
    if (!owner) {
      setError("请先连接钱包。");
      return null;
    }
    if (!publicClient || !walletClient) {
      setError("钱包或网络尚未就绪，请稍后再试。");
      return null;
    }

    try {
      setIsSigning(true);
      setError(null);

      // 1. 读取代币名称与当前 nonce，用于构造 EIP-712 Domain / Message。
      const [tokenName, nonce] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20PermitAbi,
          functionName: "name"
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20PermitAbi,
          functionName: "nonces",
          args: [owner]
        }) as Promise<bigint>
      ]);

      const effectiveChainId = maybeChainId ?? BigInt(publicClient.chain?.id ?? 0);

      // 2. 构造 EIP-712 Domain / Types / Message，严格对齐 EIP-2612 规范。
      const domain = {
        name: tokenName,
        version: "1",
        chainId: effectiveChainId,
        verifyingContract: tokenAddress
      } as const;

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      } as const;

      const message = {
        owner,
        spender,
        value,
        nonce,
        deadline
      } as const;

      // 3. 调用钱包的 signTypedData，生成 EIP-712 签名。
      const signature = await walletClient.signTypedData({
        domain,
        types,
        primaryType: "Permit",
        message
      });

      const { v, r, s } = splitSignature(signature as Hex);

      const payload: PermitSignatureResult = {
        signature: signature as Hex,
        v,
        r,
        s,
        nonce,
        deadline
      };

      setResult(payload);
      return payload;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      setIsSigning(false);
    }
  }, [owner, publicClient, walletClient, tokenAddress, spender, value, maybeChainId, deadline]);

  return {
    signPermit,
    isSigning,
    error,
    permit: result
  };
}

