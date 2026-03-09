/**
 * FluentVault Trading Terminal 主页面
 * ------------------------------------
 * - 顶部导航：品牌、网络状态、钱包连接、Faucet 按钮
 * - 左侧：资产与收益看板（MockUSDC 钱包余额 + FluentVault 中的动态收益）
 * - 中间：下单区域，包含「Enable Gasless Permit」开关
 * - 右侧：订单列表与技术讲解浮窗（实时解释当前操作背后的协议与架构）
 */
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { sepolia } from "viem/chains";
import type { Address, TypedData, TypedDataDomain } from "viem";
import { useAccount, useBalance, useChainId, useSwitchChain, useWalletClient } from "wagmi";
import { useLiveVaultBalance } from "../hooks/useLiveVaultBalance";
import { usePermitSignature } from "../hooks/usePermitSignature";
import { useWatchVaultEvents } from "../hooks/useWatchVaultEvents";

type TechStep = "idle" | "sign_eip712" | "permit" | "vault_deposit" | "gasless_order";

const MOCK_USDC_ADDRESS = process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS as Address | undefined;
const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Address | undefined;
const ORDER_BOOK_ADDRESS = process.env.NEXT_PUBLIC_ORDER_BOOK_ADDRESS as Address | undefined;

export default function HomePage() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [amount, setAmount] = useState<string>("1000");
  const [price, setPrice] = useState<string>("1");
  const [enableGasless, setEnableGasless] = useState<boolean>(true);
  const [techStep, setTechStep] = useState<TechStep>("idle");

  const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);
  const onWrongNetwork = isConnected && chainId !== targetChainId;

  const {
    data: balanceData
  } = useBalance({
    address,
    token: MOCK_USDC_ADDRESS,
    query: {
      enabled: Boolean(address && MOCK_USDC_ADDRESS)
    }
  });

  const { displayBalance } = useLiveVaultBalance({
    vaultAddress: VAULT_ADDRESS as Address,
    assetDecimals: 6
  });

  const eventsState = useWatchVaultEvents({
    vaultAddress: VAULT_ADDRESS as Address,
    orderBookAddress: ORDER_BOOK_ADDRESS as Address
  });

  const recentOrders = useMemo(
    () => eventsState.orderEvents.slice(-5).reverse(),
    [eventsState.orderEvents]
  );

  const { signPermit, isSigning, error: permitError } = usePermitSignature({
    tokenAddress: MOCK_USDC_ADDRESS as Address,
    spender: ORDER_BOOK_ADDRESS as Address,
    value: BigInt(Number(amount || "0") * 10 ** 6),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 60),
    chainId: BigInt(targetChainId)
  });

  async function handleSwitchNetwork() {
    try {
      await switchChainAsync({ chainId: targetChainId });
      toast.success("已切换到 Sepolia 网络");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`切换网络失败：${msg}`);
    }
  }

  async function handleFaucet() {
    if (!address) {
      toast.error("请先连接钱包再领测试币。");
      return;
    }
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Faucet 请求失败");
        return;
      }
      toast.success(`Faucet 交易已发送：${(data.txHash as string).slice(0, 10)}...`);
      setTechStep("vault_deposit");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Faucet 调用异常：${msg}`);
    }
  }

  async function handlePlaceOrder() {
    if (!address) {
      toast.error("请先连接钱包。");
      return;
    }
    if (!MOCK_USDC_ADDRESS || !VAULT_ADDRESS || !ORDER_BOOK_ADDRESS) {
      toast.error("合约地址未配置，请检查环境变量。");
      return;
    }
    if (onWrongNetwork) {
      toast.error("请先切换到 Sepolia 网络。");
      return;
    }

    const sellAmount = BigInt(Math.floor(Number(amount || "0") * 10 ** 6));
    const priceBig = BigInt(Math.floor(Number(price || "0") * 10 ** 6));

    if (sellAmount <= 0n) {
      toast.error("下单数量必须大于 0。");
      return;
    }

    if (!enableGasless) {
      toast.info("普通链上交易暂未实现，本 Demo 主要展示 Gasless Permit 流程。");
      return;
    }

    if (!walletClient) {
      toast.error("钱包客户端尚未就绪，请稍后重试。");
      return;
    }

    try {
      setTechStep("permit");
      const permit = await signPermit();
      if (!permit || permitError) {
        toast.error(`Permit 签名失败：${permitError ?? "未知错误"}`);
        return;
      }
      setTechStep("sign_eip712");

      // 将订单发送给后端 /api/orders 做 EIP-712 验证与存储。
      const orderPayload = {
        maker: address as Address,
        sellToken: MOCK_USDC_ADDRESS,
        buyToken: MOCK_USDC_ADDRESS,
        sellAmount,
        buyAmount: sellAmount,
        price: priceBig,
        expiry: BigInt(Math.floor(Date.now() / 1000) + 60 * 60),
        nonce: BigInt(Date.now()),
        vault: VAULT_ADDRESS
      };

      // 构造与后端 / 合约一致的 EIP-712 Domain / Types，用于订单签名。
      const domain: TypedDataDomain = {
        name: "FluentVaultOrderBook",
        version: "1",
        chainId: BigInt(targetChainId),
        verifyingContract: ORDER_BOOK_ADDRESS
      };

      const types: TypedData = {
        Order: [
          { name: "maker", type: "address" },
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "sellAmount", type: "uint256" },
          { name: "buyAmount", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "vault", type: "address" }
        ]
      };

      // 使用钱包对 Order 数据进行 EIP-712 签名。
      const orderSignature = await walletClient.signTypedData({
        domain,
        types,
        primaryType: "Order",
        message: orderPayload
      });

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: orderPayload,
          orderSignature,
          permit
        })
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "订单提交失败");
        return;
      }

      setTechStep("gasless_order");
      toast.success(`订单已提交到 Relayer，ID: ${data.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`下单失败：${msg}`);
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      {/* 顶部导航栏 */}
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
          {onWrongNetwork && (
            <button
              onClick={handleSwitchNetwork}
              className="px-3 py-1.5 rounded-md bg-red-600 text-xs font-medium hover:bg-red-500"
            >
              Switch to Sepolia Network
            </button>
          )}
          <button
            onClick={handleFaucet}
            className="px-3 py-1.5 rounded-md bg-sky-500 text-xs font-medium hover:bg-sky-400"
          >
            Get Test Tokens (Faucet)
          </button>
        </div>
      </header>

      {/* 主体三栏布局 */}
      <section className="flex-1 grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1.2fr)_340px] gap-4 px-6 py-4">
        {/* 左侧：资产与收益 Dashboard */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-xs font-medium text-slate-400 mb-1">
              My Assets &amp; Yield Dashboard
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[11px] text-slate-500">Wallet mUSDC</div>
                <div className="text-xl font-semibold tabular-nums">
                  {balanceData ? balanceData.formatted : "0.00"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Vault Estimated Balance</div>
                <div className="text-xl font-semibold tabular-nums">{displayBalance}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* 中间：下单区域 */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-400">
                  Intent Trading Terminal
                </div>
                <div className="text-base font-semibold">Place Limit Order with Yield</div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs text-slate-400 flex flex-col gap-1">
                下单数量（mUSDC）
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
                />
              </label>

              <label className="text-xs text-slate-400 flex flex-col gap-1">
                目标价格（示意字段）
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
                />
              </label>

              <div className="flex items-center justify-between text-xs text-slate-300 mt-2">
                <span>Enable Gasless Permit</span>
                <button
                  type="button"
                  onClick={() => setEnableGasless((v) => !v)}
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
                onClick={handlePlaceOrder}
                disabled={!isConnected || onWrongNetwork || isSigning}
                className="mt-4 w-full rounded-md bg-sky-500 py-2 text-sm font-medium hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enableGasless ? "Sign & Place Gasless Order" : "Place On-chain Order"}
              </button>
            </div>
          </div>
        </section>

        {/* 右侧：订单列表 + 技术讲解浮窗 */}
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
                  <span className="text-[11px] text-slate-500">
                    Block #{String(log.blockNumber ?? "")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 技术讲解浮窗：按当前 techStep 切换文案，支持点击关闭 / 切换 */}
          {techStep !== "idle" && (
            <div className="relative rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-200">
              <button
                type="button"
                onClick={() => setTechStep("idle")}
                className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-xs"
              >
                ×
              </button>
              {techStep === "permit" && (
                <p>
                  你刚刚触发的是 <strong>EIP-2612 Permit 授权签名</strong>。相比传统 Approve
                  交易，Permit 通过链下签名完成授权，不需要额外发送一笔上链交易，从而节省 Gas。
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
                  Faucet 发放的 MockUSDC 可以存入 <strong>FluentVault（ERC-4626 标准金库）</strong>
                  。Vault 会把资产转给收益策略，由 MockYieldStrategy
                  按区块时间模拟约 10% 年化收益。
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
      </section>
    </main>
  );
}

