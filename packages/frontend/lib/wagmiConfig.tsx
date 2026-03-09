import { createClient } from "viem";
import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  client({ chain }) {
    return createClient({
      chain,
      // 使用前端环境变量注入的 RPC，方便在不同环境（本地 / 测试网）切换
      transport: http(process.env.NEXT_PUBLIC_RPC_URL)
    });
  }
});

