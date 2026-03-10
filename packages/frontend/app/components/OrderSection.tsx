"use client";

import { useEffect, useState } from "react";

type OrderSectionProps = {
  amount: string;
  price: string;
  enableGasless: boolean;
  isConnected: boolean;
  onWrongNetwork: boolean;
  isSigning: boolean;
  onChangeAmount: (value: string) => void;
  onChangePrice: (value: string) => void;
  onToggleGasless: () => void;
  onPlaceOrder: () => void;
};

export function OrderSection({
  amount,
  price,
  enableGasless,
  isConnected,
  onWrongNetwork,
  isSigning,
  onChangeAmount,
  onChangePrice,
  onToggleGasless,
  onPlaceOrder,
}: OrderSectionProps) {
  // 避免 SSR 与客户端首次渲染的 disabled 状态不一致导致 Hydration 报错
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const isDisabled = ready ? !isConnected || onWrongNetwork || isSigning : false;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-400">Intent Trading Terminal</div>
            <div className="text-base font-semibold">Place Limit Order with Yield</div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs text-slate-400 flex flex-col gap-1">
            下单数量（mUSDC）
            <input
              value={amount}
              onChange={(e) => onChangeAmount(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
            />
          </label>

          <label className="text-xs text-slate-400 flex flex-col gap-1">
            目标价格（示意字段）
            <input
              value={price}
              onChange={(e) => onChangePrice(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
            />
          </label>

          <div className="flex items-center justify-between text-xs text-slate-300 mt-2">
            <span>Enable Gasless Permit</span>
            <button
              type="button"
              onClick={onToggleGasless}
              aria-pressed={enableGasless}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                enableGasless ? "bg-sky-500" : "bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enableGasless ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            onClick={onPlaceOrder}
            disabled={isDisabled}
            className="mt-4 inline-flex w-full justify-center rounded-md bg-sky-500 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enableGasless ? "Sign & Place Gasless Order" : "Place On-chain Order"}
          </button>
        </div>
      </div>
    </section>
  );
}

