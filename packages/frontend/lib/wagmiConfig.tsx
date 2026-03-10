// lib/wagmiConfig.tsx
import { createClient, type Chain } from "viem";
import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

const LOCAL_CHAIN_ID = 31337;

const anvilChain: Chain = {
  id: LOCAL_CHAIN_ID,
  name: "Anvil Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545"] },
    public: { http: [process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545"] },
  },
};

const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);
const isLocal = envChainId === LOCAL_CHAIN_ID;

// 将应用支持的所有链都注册到 wagmi，这样 useChainId 才能反映“当前钱包真实网络”
// - 本地调试：支持 Anvil + Sepolia + Ethereum
// - 线上 / 测试网：支持 Sepolia + Ethereum
const chains = (
  isLocal ? [anvilChain, sepolia, mainnet] : [sepolia, mainnet]
) as [Chain, ...Chain[]];

export const wagmiConfig = createConfig({
  chains,
  client({ chain }) {
    return createClient({
      chain,
      // 这里的 RPC 主要用于 public client，真实钱包交互仍由浏览器钱包自身处理。
      // 即使钱包链是 mainnet，但 NEXT_PUBLIC_RPC_URL 指向 Sepolia，本应用只在「错误网络」提示时用到链信息，不会在 mainnet 发真实交易。
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    });
  },
});
