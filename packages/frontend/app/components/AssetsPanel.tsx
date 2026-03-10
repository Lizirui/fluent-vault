"use client";

type AssetsPanelProps = {
  walletBalance: string;
  displayBalance: string;
};

export function AssetsPanel({ walletBalance, displayBalance }: AssetsPanelProps) {
  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs font-medium text-slate-400 mb-1">
          My Assets &amp; Yield Dashboard
        </div>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] text-slate-500">Wallet mUSDC</div>
            <div className="text-xl font-semibold tabular-nums">{walletBalance}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Vault Estimated Balance</div>
            <div className="text-xl font-semibold tabular-nums">{displayBalance}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

