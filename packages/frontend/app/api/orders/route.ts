/**
 * Orders API（/api/orders）
 * -------------------------
 * 职责：
 * - 接收前端上传的 EIP-712 签名订单（与链上 OrderBook.Order 结构一致）
 * - 使用 viem 的 recoverTypedDataAddress 做离线签名恢复，校验签名者是否为 maker
 * - 将验证通过的订单存入内存级「订单池」，供后续 Relayer 或前端查询演示
 *
 * 说明：
 * - 为了简化 Demo，这里使用进程内数组作为存储；在真实生产中建议使用数据库（如 Supabase）。
 * - 订单最终的链上结算由独立的 Relayer 进程调用 OrderBook.executeOrder 完成。
 */

import { NextResponse } from "next/server";
import {
  Address,
  Hex,
  TypedData,
  TypedDataDomain,
  TypedDataParameter,
  recoverTypedDataAddress
} from "viem";
import { sepolia } from "viem/chains";

// 与 Solidity 中 OrderBook.Order 结构保持字段顺序一致。
export type Order = {
  maker: Address;
  sellToken: Address;
  buyToken: Address;
  sellAmount: bigint;
  buyAmount: bigint;
  price: bigint;
  expiry: bigint;
  nonce: bigint;
  vault: Address;
};

// 存储前端上传的 Permit 签名信息，便于 Relayer 之后调用 executeOrder。
export type PermitPayload = {
  signature: Hex;
  v: number;
  r: Hex;
  s: Hex;
  nonce: bigint;
  deadline: bigint;
};

type StoredOrder = {
  id: string;
  order: Order;
  orderSignature: Hex;
  permit: PermitPayload;
  createdAt: string;
  status: "pending" | "filled" | "cancelled";
};

// 简单的内存订单池（仅用于本进程，Serverless 环境下不保证持久化）。
const orderBookInMemory: StoredOrder[] = [];

// EIP-712 typed data 类型定义，需要与合约中 ORDER_TYPEHASH 对齐。
const orderTypes = {
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
  ] satisfies TypedDataParameter[]
} satisfies TypedData;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    const rawOrder = body?.order as any;
    const orderSignature: Hex | undefined = body?.orderSignature;
    const rawPermit = body?.permit as any;

    const order: Order | undefined = rawOrder && {
      maker: rawOrder.maker as Address,
      sellToken: rawOrder.sellToken as Address,
      buyToken: rawOrder.buyToken as Address,
      sellAmount: BigInt(rawOrder.sellAmount),
      buyAmount: BigInt(rawOrder.buyAmount),
      price: BigInt(rawOrder.price),
      expiry: BigInt(rawOrder.expiry),
      nonce: BigInt(rawOrder.nonce),
      vault: rawOrder.vault as Address,
    };

    const permit: PermitPayload | undefined = rawPermit && {
      signature: rawPermit.signature as Hex,
      v: rawPermit.v as number,
      r: rawPermit.r as Hex,
      s: rawPermit.s as Hex,
      nonce: BigInt(rawPermit.nonce),
      deadline: BigInt(rawPermit.deadline),
    };

    if (!order || !orderSignature || !permit) {
      return NextResponse.json(
        { error: "缺少 order、orderSignature 或 permit 字段" },
        { status: 400 }
      );
    }

    const chainId = BigInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);
    const verifyingContract = process.env.ORDER_BOOK_ADDRESS as Address | undefined;

    if (!verifyingContract) {
      return NextResponse.json(
        { error: "服务器未配置 ORDER_BOOK_ADDRESS 环境变量" },
        { status: 500 }
      );
    }

    // 构造 EIP-712 Domain，与 Solidity OrderBook 构造函数保持一致。
    const domain: TypedDataDomain = {
      name: "FluentVaultOrderBook",
      version: "1",
      chainId,
      verifyingContract
    };

    // 使用 viem 的 recoverTypedDataAddress 恢复签名者。
    const recovered = await recoverTypedDataAddress({
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: order,
      signature: orderSignature
    });

    if (recovered.toLowerCase() !== order.maker.toLowerCase()) {
      return NextResponse.json(
        {
          error: "签名者与订单 maker 不一致，拒绝接收订单。",
          expected: order.maker,
          actual: recovered
        },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const stored: StoredOrder = {
      id,
      order,
      orderSignature,
      permit,
      createdAt: new Date().toISOString(),
      status: "pending"
    };

    orderBookInMemory.push(stored);

    return NextResponse.json(
      {
        success: true,
        id,
        verified: true
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "订单接收或验证失败。",
        detail: message
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // 提供一个简单的读取接口，方便前端显示最近订单（仅演示，无分页）。
  return NextResponse.json(
    {
      orders: orderBookInMemory
    },
    { status: 200 }
  );
}

