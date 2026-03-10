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
import { HeaderSection } from "./components/HeaderSection";
import { AssetsPanel } from "./components/AssetsPanel";
import { OrderSection } from "./components/OrderSection";
import { RightPanel } from "./components/RightPanel";

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
  // 只要当前链 ID 与目标链不同，就认为在“错误网络”上。
  const onWrongNetwork = chainId !== targetChainId;

  const { data: balanceData } = useBalance({
    address,
    token: MOCK_USDC_ADDRESS,
    query: {
      enabled: Boolean(address && MOCK_USDC_ADDRESS),
    },
  });

  const { displayBalance } = useLiveVaultBalance({
    vaultAddress: VAULT_ADDRESS as Address,
    assetDecimals: 6,
  });

  const eventsState = useWatchVaultEvents({
    vaultAddress: VAULT_ADDRESS as Address,
    orderBookAddress: ORDER_BOOK_ADDRESS as Address,
  });

  const recentOrders = useMemo(
    () => eventsState.orderEvents.slice(-5).reverse(),
    [eventsState.orderEvents],
  );

  const walletBalance = balanceData ? balanceData.formatted : "0.00";

  const {
    signPermit,
    isSigning,
    error: permitError,
  } = usePermitSignature({
    tokenAddress: MOCK_USDC_ADDRESS as Address,
    spender: ORDER_BOOK_ADDRESS as Address,
    value: BigInt(Number(amount || "0") * 10 ** 6),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 60),
    chainId: BigInt(targetChainId),
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
        body: JSON.stringify({ address }),
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
        vault: VAULT_ADDRESS,
      };

      // 构造与后端 / 合约一致的 EIP-712 Domain / Types，用于订单签名。
      const domain: TypedDataDomain = {
        name: "FluentVaultOrderBook",
        version: "1",
        chainId: BigInt(targetChainId),
        verifyingContract: ORDER_BOOK_ADDRESS,
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
          { name: "vault", type: "address" },
        ],
      };

      // 使用钱包对 Order 数据进行 EIP-712 签名。
      const orderSignature = await walletClient.signTypedData({
        domain,
        types,
        primaryType: "Order",
        message: orderPayload,
      });

      // 为了通过 JSON.stringify，需要把 bigint 字段转换为字符串再发送给后端，
      // 后端会在 /api/orders 中再将这些字符串转换回 bigint。
      const orderForJson = {
        ...orderPayload,
        sellAmount: sellAmount.toString(),
        buyAmount: sellAmount.toString(),
        price: priceBig.toString(),
        expiry: orderPayload.expiry.toString(),
        nonce: orderPayload.nonce.toString(),
      };

      const permitForJson = {
        ...permit,
        nonce: permit.nonce.toString(),
        deadline: permit.deadline.toString(),
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: orderForJson,
          orderSignature,
          permit: permitForJson,
        }),
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
      <HeaderSection
        onWrongNetwork={onWrongNetwork}
        onSwitchNetwork={handleSwitchNetwork}
        onFaucet={handleFaucet}
      />

      <section className="flex-1 grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1.2fr)_340px] gap-4 px-6 py-4">
        <AssetsPanel walletBalance={walletBalance} displayBalance={displayBalance} />

        <OrderSection
          amount={amount}
          price={price}
          enableGasless={enableGasless}
          isConnected={isConnected}
          onWrongNetwork={onWrongNetwork}
          isSigning={isSigning}
          onChangeAmount={setAmount}
          onChangePrice={setPrice}
          onToggleGasless={() => setEnableGasless((v) => !v)}
          onPlaceOrder={handlePlaceOrder}
        />

        <RightPanel
          recentOrders={recentOrders}
          techStep={techStep}
          onResetTechStep={() => setTechStep("idle")}
        />
      </section>
    </main>
  );
}
