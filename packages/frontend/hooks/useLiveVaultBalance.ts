/**
 * useLiveVaultBalance Hook
 * ------------------------
 * 作用：
 * - 读取链上 FluentVault 中用户的份额（shares）与总资产（totalAssets）
 * - 基于 10% 年化收益率（与 MockYieldStrategy 对齐）在前端侧用 requestAnimationFrame
 *   模拟资产的「平滑增长」，提供一个不断跳动的 displayBalance
 *
 * 设计初衷：
 * - 真实收益计算在策略合约中通过时间戳完成，频繁调用 RPC 查看变化既浪费资源又不够丝滑
 * - 这里在前端用近似算法做视觉增强，既不影响真实资产，又能向面试官展示收益滚动效果
 */

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import type { Address } from "viem";

// FluentVault 最小 ABI：只保留本 Hook 需要的接口。
const fluentVaultAbi = [
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

export interface UseLiveVaultBalanceParams {
  vaultAddress: Address;
  /**
   * 底层资产的小数位数，用于将 BigInt 转成人类可读的数值（默认 6 位，对齐 MockUSDC）。
   */
  assetDecimals?: number;
}

export function useLiveVaultBalance(params: UseLiveVaultBalanceParams) {
  const { vaultAddress, assetDecimals = 6 } = params;
  const { address: account } = useAccount();

  const {
    data: totalAssets,
    isLoading: isTotalAssetsLoading
  } = useReadContract({
    address: vaultAddress,
    abi: fluentVaultAbi,
    functionName: "totalAssets"
  });

  const {
    data: totalSupply,
    isLoading: isTotalSupplyLoading
  } = useReadContract({
    address: vaultAddress,
    abi: fluentVaultAbi,
    functionName: "totalSupply"
  });

  const {
    data: userShares,
    isLoading: isSharesLoading
  } = useReadContract({
    address: vaultAddress,
    abi: fluentVaultAbi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: {
      enabled: Boolean(account)
    }
  });

  const [displayBalance, setDisplayBalance] = useState<string>("0.00");

  const baseInfo = useMemo(() => {
    if (!totalAssets || !totalSupply || !userShares || totalSupply === 0n) {
      return null;
    }

    const now = Date.now();
    const totalAssetsNumber = Number(totalAssets);
    const totalSupplyNumber = Number(totalSupply);
    const userSharesNumber = Number(userShares);

    // 用户在 Vault 中的实际资产占比（按资产量而非份额数）。
    const userAssetNow =
      (totalAssetsNumber * userSharesNumber) / (totalSupplyNumber || Number.EPSILON);

    return {
      timestamp: now,
      userAssetNow
    };
  }, [totalAssets, totalSupply, userShares]);

  useEffect(() => {
    if (!baseInfo) {
      setDisplayBalance("0.00");
      return;
    }

    let frameId: number;
    const { timestamp: baseTime, userAssetNow } = baseInfo;

    // 10% 年化的近似每秒增长率。
    const apy = 0.1;
    const secondsPerYear = 365 * 24 * 60 * 60;
    const ratePerSecond = apy / secondsPerYear;

    const loop = () => {
      const now = Date.now();
      const elapsedSeconds = (now - baseTime) / 1000;

      // 简单利息近似：future = principal * (1 + r * t)
      const estimated = userAssetNow * (1 + ratePerSecond * elapsedSeconds);

      const humanReadable = estimated / 10 ** assetDecimals;

      setDisplayBalance(humanReadable.toFixed(4));

      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [baseInfo, assetDecimals]);

  return {
    displayBalance,
    rawOnchainBalance: userShares,
    isLoading: isTotalAssetsLoading || isTotalSupplyLoading || isSharesLoading
  };
}

