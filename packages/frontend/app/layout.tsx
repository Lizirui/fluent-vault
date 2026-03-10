/**
 * 应用根布局：
 * - 负责引入全局样式 `globals.css`
 * - 挂载 AppProviders，统一注入 Wagmi、React Query、全局 Toast 等上下文
 * - 设置页面基础元信息（Meta），并固定语言为简体中文
 */
import { AppProviders } from "./providers";

import type { Metadata } from "next";
import "./globals.css";

// Next.js App Router 使用的页面级元数据配置
export const metadata: Metadata = {
  title: "FluentVault – DeFi Intent Trading Terminal",
  description: "FluentVault: ERC-4626 yield vault with gasless intent trading built on Sepolia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        {/* 统一包裹应用上下文（链、数据、Toast 等），子页面不需要重复配置 */}
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
