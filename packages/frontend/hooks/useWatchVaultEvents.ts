/**
 * useWatchVaultEvents Hook
 * ------------------------
 * 作用：
 * - 使用 viem 的 watchContractEvent 订阅 FluentVault 与 OrderBook 合约事件
 * - 当发生 Deposit / Withdraw / OrderFilled 等事件时，触发前端状态更新
 *
 * 设计说明：
 * - 这里采用「事件驱动」刷新思路，而不是固定时间轮询 RPC
 * - 调用方可以根据返回的事件数组决定是否重新拉取资产列表 / 订单列表
 */

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address, Log, AbiEvent } from "viem";

// FluentVault 事件 ABI 片段
const fluentVaultEvents = [
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false }
    ],
    anonymous: false
  }
] as const satisfies AbiEvent[];

// OrderBook 事件 ABI 片段
const orderBookEvents = [
  {
    type: "event",
    name: "OrderFilled",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "vault", type: "address", indexed: true },
      { name: "sellAmount", type: "uint256", indexed: false },
      { name: "buyAmount", type: "uint256", indexed: false }
    ],
    anonymous: false
  }
] as const satisfies AbiEvent[];

export interface WatchedEventsState {
  vaultEvents: Log[];
  orderEvents: Log[];
}

export interface UseWatchVaultEventsParams {
  vaultAddress: Address;
  orderBookAddress: Address;
}

export function useWatchVaultEvents(params: UseWatchVaultEventsParams) {
  const { vaultAddress, orderBookAddress } = params;
  const publicClient = usePublicClient();

  const [state, setState] = useState<WatchedEventsState>({
    vaultEvents: [],
    orderEvents: []
  });

  useEffect(() => {
    if (!publicClient) return;

    // 订阅 Vault 的存取款事件，用于驱动资产列表刷新。
    const unwatchVault = publicClient.watchContractEvent({
      address: vaultAddress,
      abi: fluentVaultEvents,
      eventName: ["Deposit", "Withdraw"],
      onLogs: (logs) => {
        setState((prev) => ({
          ...prev,
          vaultEvents: [...prev.vaultEvents, ...logs]
        }));
      }
    });

    // 订阅 OrderBook 的订单成交事件，用于驱动订单历史刷新。
    const unwatchOrderBook = publicClient.watchContractEvent({
      address: orderBookAddress,
      abi: orderBookEvents,
      eventName: "OrderFilled",
      onLogs: (logs) => {
        setState((prev) => ({
          ...prev,
          orderEvents: [...prev.orderEvents, ...logs]
        }));
      }
    });

    return () => {
      unwatchVault?.();
      unwatchOrderBook?.();
    };
  }, [publicClient, vaultAddress, orderBookAddress]);

  return state;
}

