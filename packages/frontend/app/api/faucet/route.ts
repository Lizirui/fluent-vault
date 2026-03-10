/**
 * Faucet API（/api/faucet）
 * -------------------------
 * 职责：
 * - 为指定钱包地址在 Sepolia 上发放一定数量的 MockUSDC 测试代币
 * - 使用 Upstash Redis 基于「IP + 地址」做双重限流，防止被恶意刷取
 * - 通过 viem 使用后端持有的私钥直接调用 MockUSDC 合约的 mint 函数
 *
 * 重要说明：
 * - FAUCET_PRIVATE_KEY 仅用于测试环境，请勿在生产环境使用真实私钥
 * - MOCK_USDC_ADDRESS 需与实际部署到 Sepolia 的合约地址保持一致
 */

import { NextResponse } from "next/server";
import { Address, Hex, createWalletClient, http, isAddress, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { incrementAndCheckLimit } from "../../../lib/redis";

// 简化版 MockUSDC ABI，只包含 faucet 需要的 mint 接口。
const mockUsdcAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  }
] as const;

// 每次 Faucet 发放的数量（以 6 位小数计，10_000 mUSDC）
const FAUCET_AMOUNT = 10_000n * 10n ** 6n;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const to: string | undefined = body?.address;

    if (!to || !isAddress(to)) {
      return NextResponse.json(
        { error: "无效的收款地址" },
        {
          status: 400
        }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for") ??
      // Next.js 局部开发时可使用自带 ip 字段
      // @ts-expect-error 非标准字段，仅在部分运行时存在
      request.ip ??
      "unknown";

    // 简单限流策略：同一 IP / 地址在一定时间内只允许请求若干次。
    const windowSeconds = 60 * 60; // 1 小时
    const maxPerWindow = 1;

    const [ipAllowed, addrAllowed] = await Promise.all([
      incrementAndCheckLimit(`faucet:ip:${ip}`, maxPerWindow, windowSeconds),
      incrementAndCheckLimit(`faucet:addr:${to}`, maxPerWindow, windowSeconds)
    ]);

    if (!ipAllowed || !addrAllowed) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试。" },
        {
          status: 429
        }
      );
    }

    const privateKey = process.env.FAUCET_PRIVATE_KEY as Hex | undefined;
    const mockUsdcAddress = process.env.MOCK_USDC_ADDRESS as Address | undefined;
    const rpcUrl = process.env.SEPOLIA_RPC_URL;

    if (!privateKey || !mockUsdcAddress || !rpcUrl) {
      return NextResponse.json(
        { error: "Faucet 服务端配置不完整，请检查环境变量。" },
        { status: 500 }
      );
    }

    // 使用 viem 基于私钥创建 WalletClient，用于发送 mint 交易。
    const account = privateKeyToAccount(privateKey);

    // 根据当前环境选择链配置：
    // - 本地开发：NEXT_PUBLIC_CHAIN_ID=31337，对应 anvil 本地链
    // - 线上 / 测试网：使用 viem 预置的 sepolia 配置
    const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

    const chain: Chain =
      envChainId === 31337
        ? {
            id: 31337,
            name: "Anvil Local",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: {
              default: { http: [rpcUrl] },
              public: { http: [rpcUrl] }
            }
          }
        : sepolia;

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl)
    });

    const hash = await walletClient.writeContract({
      address: mockUsdcAddress,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [to as Address, FAUCET_AMOUNT]
    });

    return NextResponse.json(
      {
        success: true,
        txHash: hash
      },
      { status: 200 }
    );
  } catch (error) {
    // 将错误打平为字符串，便于前端 Toast 显示。
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Faucet 调用失败，请稍后重试。",
        detail: message
      },
      { status: 500 }
    );
  }
}

