"use client";

type TechStep = "idle" | "sign_eip712" | "permit" | "vault_deposit" | "gasless_order";

type RightPanelProps = {
  recentOrders: any[];
  techStep: TechStep;
  onResetTechStep: () => void;
};

export function RightPanel({ recentOrders, techStep, onResetTechStep }: RightPanelProps) {
  return (
    <aside className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs font-medium text-slate-400 mb-2">Recent OrderFills</div>
        <div className="space-y-2 text-xs">
          {recentOrders.length === 0 && (
            <div className="text-slate-500">暂时还没有成交事件，可稍后再试。</div>
          )}
          {recentOrders.map((log, idx) => (
            <div
              key={`${log.transactionHash}-${idx}`}
              className="flex flex-col rounded-md bg-slate-900/60 border border-slate-800 px-2 py-1.5"
            >
              <span className="text-[11px] text-slate-400">
                Tx: {(log.transactionHash as string | undefined)?.slice(0, 18) ?? "N/A"}...
              </span>
              <span className="text-[11px] text-slate-500">Block #{String(log.blockNumber ?? "")}</span>
            </div>
          ))}
        </div>
      </div>

      {techStep !== "idle" && (
        <div className="relative rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-200">
          <button
            type="button"
            onClick={onResetTechStep}
            className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-xs"
          >
            ×
          </button>
          {techStep === "permit" && (
            <p>
              你刚刚触发的是 <strong>EIP-2612 Permit 授权签名</strong>。相比传统 Approve 交易，Permit
              通过链下签名完成授权，不需要额外发送一笔上链交易，从而节省 Gas。
            </p>
          )}
          {techStep === "sign_eip712" && (
            <p>
              接下来是 <strong>EIP-712 订单签名</strong>。通过对结构化数据签名，Relayer
              可以在链下安全地聚合、排序和过滤用户意图，再在价格合适时触发链上结算。
            </p>
          )}
          {techStep === "vault_deposit" && (
            <p>
              Faucet 发放的 MockUSDC 可以存入 <strong>FluentVault（ERC-4626 标准金库）</strong>。Vault
              会把资产转给收益策略，由 MockYieldStrategy 按区块时间模拟约 10% 年化收益。
            </p>
          )}
          {techStep === "gasless_order" && (
            <p>
              当前订单以 <strong>Gasless Intent</strong> 的方式提交到后端 Relayer。Relayer
              在看到合适价格时，会携带你的订单签名与 Permit 授权，一次性调用
              OrderBook.executeOrder 完成扣款与入金库。
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

