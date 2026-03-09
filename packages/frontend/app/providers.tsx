/**
 * 应用级 Provider 组合：
 * - WagmiProvider：提供以 viem 为底层实现的钱包与链路配置
 * - QueryClientProvider：提供 React Query 进行数据缓存与请求状态管理
 * - Toaster：挂载全局 Toast，用于显示网络错误、签名拒绝、Relayer 失败等提示
 *
 * 所有页面都应通过 RootLayout 使用本组件包裹，避免在各子页面重复配置。
 */
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";
import { ReactNode } from "react";

import { wagmiConfig } from "../lib/wagmiConfig";

// 全局复用一个 QueryClient 实例，保证缓存与请求状态在应用内共享。
const queryClient = new QueryClient();

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
        {/* 全局 Toast 容器，后续任何地方调用 sonner 都会在这里展示提示 */}
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

