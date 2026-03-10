"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

type HeaderSectionProps = {
  onWrongNetwork: boolean;
  onSwitchNetwork: () => void;
  onFaucet: () => void;
};

export function HeaderSection({ onWrongNetwork, onSwitchNetwork, onFaucet }: HeaderSectionProps) {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();

  // 避免 SSR 与首帧客户端渲染不一致导致的 Hydration 报错
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const handleConnect = async () => {
    if (!connectors.length) return;
    const connector = connectors[0];
    try {
      await connectAsync({ connector });
    } catch {
      // 连接错误由全局 toast 处理，这里静默失败即可
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectAsync();
    } catch {
      // 断开错误同样静默处理
    }
  };

  const shortAddress =
    address && address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
  const showConnected = ready && isConnected;

  return (
    <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-sky-500/20 border border-sky-500/50 flex items-center justify-center text-sky-300 text-xl font-bold">
          F
        </div>
        <div>
          <div className="text-sm font-semibold">FluentVault Protocol</div>
          <div className="text-xs text-slate-400">
            Senior Web3 Engineer · DeFi Intent Trading Terminal
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* 只有在钱包已连接时才显示网络状态 */}
        {showConnected &&
          (onWrongNetwork ? (
            <button
              type="button"
              onClick={onSwitchNetwork}
              className="flex items-center gap-2 rounded-md bg-[#0f1419] border border-red-500/60 px-3 py-1.5 text-xs hover:bg-red-500/10 transition-colors"
            >
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-xs text-gray-200">Switch to Sepolia</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-[#0f1419] border border-white/10 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
              <span className="text-xs text-gray-300">Sepolia Testnet</span>
            </div>
          ))}

        {/* Wallet Address / Connect 按钮 */}
        {!showConnected ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={ready && isPending}
            className="flex items-center gap-2 rounded-md bg-[#0f1419] border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-sm">🦊</span>
            <span className="font-mono">
              {ready && isPending ? "Connecting..." : "Connect Wallet"}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            className="flex items-center gap-2 rounded-md bg-[#0f1419] border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-slate-800"
          >
            <span className="text-sm">🦊</span>
            <span className="font-mono">{shortAddress}</span>
          </button>
        )}

        {/* Faucet 按钮 */}
        <button
          type="button"
          onClick={onFaucet}
          className="flex items-center gap-2 rounded-md bg-[#3B82F6] px-4 py-1.5 text-xs text-white hover:bg-[#2563eb] transition-colors"
        >
          Get Test Tokens (Faucet)
        </button>
      </div>
    </header>
  );
}
