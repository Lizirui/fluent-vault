## FluentVault 本地部署与调试指南

本指南帮助你在本机完成 FluentVault 的两种运行模式：

- **本地链模式（Anvil）**：最快速的开发与调试方式。
- **Sepolia 测试网模式**：接近真实环境的链上测试。

前提：你已经完成 `git clone` 并在根目录执行过：

```bash
pnpm install
```

---

## 一、本地链模式（推荐日常开发）

> 目标：一条命令部署所有合约，并自动生成前后端所需的 `.env.local`，然后在浏览器中完整走通 Faucet + Vault + 下单流程。

### 1. 启动本地链（Anvil）

在任意目录执行：

```bash
anvil
```

默认配置：

- RPC：`http://127.0.0.1:8545`
- Chain ID：`31337`
- Anvil 控制台会打印 10 个测试账户和私钥（有大量本地测试 ETH）。

> 提示：保持这个终端窗口一直开着，作为本地链节点。

### 2. 一键部署合约并生成本地环境变量

在 **项目根目录** 新开一个终端，执行：

```bash
cd fluent-vault

# 推荐写法：把同一个 anvil 账户用作「合约部署者 + Faucet 账户」
pnpm deploy:local -- 0x你从anvil控制台复制的私钥
```

部署脚本会完成以下几件事：

1. 在 `packages/contracts` 下运行 Foundry 脚本，向本地链部署所有核心合约：

   ```bash
   forge script script/Deploy.s.sol:DeployFluentVault \
     --rpc-url http://127.0.0.1:8545 \
     --broadcast
   ```

2. 解析部署日志中标准化输出的地址：
   - `MOCK_USDC=0x...`
   - `FLUENT_VAULT=0x...`
   - `ORDER_BOOK=0x...`

3. 自动生成/覆盖两份环境文件，并区分后端与前端配置：
   - 根目录 `.env.local`（后端 / 脚本使用）：
     - `SEPOLIA_RPC_URL=http://127.0.0.1:8545`（名称沿用，值指向本地 RPC）
     - `MOCK_USDC_ADDRESS` / `FLUENT_VAULT_ADDRESS` / `ORDER_BOOK_ADDRESS`（本地部署地址，用于脚本和 API）
     - `FAUCET_PRIVATE_KEY`：如果你通过 `pnpm deploy:local -- 0x...` 传入了私钥，脚本会自动把同一个值写到这里，方便本地 Faucet 使用；你也可以在之后手动修改为任意 anvil 账户私钥。
     - 如果原先 `.env.local` 或 `.env.example` 中已经有 Upstash / Supabase 配置，会尽量保留。

   - `packages/frontend/.env.local`（前端 + API 使用）：
     - 服务端变量（供 `/api/faucet`、Hooks 等使用）：
       - `SEPOLIA_RPC_URL=http://127.0.0.1:8545`
       - `FAUCET_PRIVATE_KEY=0x...`（与 `DEPLOYER_PRIVATE_KEY` 相同，或你之后手动修改）
       - `MOCK_USDC_ADDRESS` / `FLUENT_VAULT_ADDRESS` / `ORDER_BOOK_ADDRESS`
     - 前端公开变量：
       - `NEXT_PUBLIC_CHAIN_ID=31337`
       - `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545`
       - `NEXT_PUBLIC_MOCK_USDC_ADDRESS` / `NEXT_PUBLIC_VAULT_ADDRESS` / `NEXT_PUBLIC_ORDER_BOOK_ADDRESS`

> 小贴士：本地调试时，`FAUCET_PRIVATE_KEY` 复用部署合约用的 anvil 账户最简单；如果你希望 Faucet 用另一个账户，只需要修改 `.env.local` / `packages/frontend/.env.local` 中的 `FAUCET_PRIVATE_KEY` 为新的 anvil 私钥即可。

### 3. 钱包网络设置

为了让网络指示和交易调用都正常，本地调试时建议在钱包中添加一个自定义网络，配置为：

- Network Name：任意，例如 `Anvil Local`
- RPC URL：`http://127.0.0.1:8545`
- Chain ID：`31337`
- Currency Symbol：`ETH`

然后在浏览器中连接钱包时，选择这个本地网络：

- 当钱包网络为本地 `31337` 时，页面顶部网络指示会显示绿色状态（例如 `Sepolia Testnet` 文案可以按需调整为 `Local Anvil`），并允许进行 Faucet / 下单等操作。
- 当钱包切到其他网络（如 Ethereum / Sepolia）时，顶部会显示红色的切换提示按钮，要求你切回本地链。

### 4. 启动前端并在本地链上完整调试

仍然在项目根目录：

```bash
pnpm dev:frontend
```

然后访问：

- 地址：`http://localhost:3000`（或终端提示的端口）
- 钱包网络：确保选中上一步配置的本地 `Anvil Local (Chain ID 31337)`。

在本地链模式下你可以：

- 反复运行 `pnpm deploy:local -- 0x...` 重新部署合约（状态会重置，env 也会同步更新）。
- 使用 Trading Terminal UI 进行完整交互：
  - `Get Test Tokens (Faucet)`：领取本地 MockUSDC（本地限流窗口为约 **10 秒**，超过后可再次请求；线上/测试网仍为 1 小时）。
  - 在中间面板输入下单数量 / 价格，开启 `Enable Gasless Permit`，执行 `Sign & Place Gasless Order`，观察右侧订单与技术讲解浮窗的变化。

---

## 二、Sepolia 测试网模式

当你对逻辑比较有信心后，可以在 Sepolia 上做「接近真实」的测试。

### 1. 准备 `.env`

在项目根目录复制模板：

```bash
cp .env.example .env
```

根据需要至少填写以下字段：

- `SEPOLIA_RPC_URL`：Sepolia RPC（Infura/Alchemy/自建节点等）。
- `DEPLOYER_PRIVATE_KEY`：用于部署的测试网私钥（需要有 Sepolia 测试 ETH）。
- `ETHERSCAN_API_KEY`：可选，用于验证合约。

> 安全提示：`DEPLOYER_PRIVATE_KEY` 只用于测试网，不要与主网私钥混用。

### 2. 一键部署到 Sepolia 并更新 `.env`

在项目根目录执行：

```bash
cd fluent-vault
pnpm deploy:sepolia
```

这个命令会：

1. 从 `.env` 中读取 `SEPOLIA_RPC_URL` 与 `DEPLOYER_PRIVATE_KEY`。
2. 在 `packages/contracts` 下执行：

   ```bash
   forge script script/Deploy.s.sol:DeployFluentVault \
     --rpc-url $SEPOLIA_RPC_URL \
     --broadcast
   ```

3. 解析部署日志中的：
   - `MOCK_USDC=0x...`
   - `FLUENT_VAULT=0x...`
   - `ORDER_BOOK=0x...`

4. 在保留其他字段的前提下，更新 `.env` 中：
   - `MOCK_USDC_ADDRESS` / `FLUENT_VAULT_ADDRESS` / `ORDER_BOOK_ADDRESS`
   - `NEXT_PUBLIC_MOCK_USDC_ADDRESS=${MOCK_USDC_ADDRESS}`
   - `NEXT_PUBLIC_VAULT_ADDRESS=${FLUENT_VAULT_ADDRESS}`
   - `NEXT_PUBLIC_ORDER_BOOK_ADDRESS=${ORDER_BOOK_ADDRESS}`
   - `NEXT_PUBLIC_CHAIN_ID=11155111`
   - `NEXT_PUBLIC_RPC_URL=${SEPOLIA_RPC_URL}`

### 3. 使用 Sepolia 运行前端

前端部分优先读取 `packages/frontend` 目录下的 `.env.local` / `.env`，因此如果你想「切换到 Sepolia」：

1. 暂时重命名或移除 `packages/frontend/.env.local`，或直接在其中改回测试网配置。
2. 确认根目录 `.env` 中的 Sepolia 配置已由 `pnpm deploy:sepolia` 更新，同时 `packages/frontend/.env` 也已自动生成。
3. 在项目根目录重新启动前端：

   ```bash
   pnpm dev:frontend
   ```

4. 在浏览器中打开 `http://localhost:3000`，并在钱包中将网络切换到 Sepolia。

此时：

- 所有交互（Faucet、Permit、下单）都会发送到 Sepolia。
- 可以在 Etherscan Sepolia 站点上看到交易与合约信息。

---

## 三、Upstash / Supabase 相关说明

- **Upstash Redis**：
  - 用于 `/api/faucet` 的限流（按 IP + 地址限制调用频率）。
  - 本地开发时，如果不想配置 Upstash，可以临时在代码中关闭限流逻辑，或在 `.env(.local)` 中留空相关字段并根据实际报错进行调整。

- **Supabase**：
  - 当前版本的 `/api/orders` 使用的是进程内内存数组作为订单池，并未真正接入 Supabase。
  - `.env(.local)` 中的 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 主要是为未来扩展预留，可以留空，不影响当前 Demo 跑通。

---

## 四、常见问题（FAQ）

- **Q：可以频繁重新部署吗？**  
  A：在本地链上完全可以，`pnpm deploy:local` 每次都会重新部署一套合约并更新 `.env.local`。在 Sepolia 上也可以多次部署，但请注意测试 ETH 的消耗，以及 `.env` 会被最新一轮部署覆盖合约地址。

- **Q：如果发现合约有 Bug 怎么办？**  
  A：合约代码本身在链上是不可变的，只能「重新部署一个新版本」。当前流程就是通过再次运行本地或 Sepolia 部署脚本，生成新的合约地址，并让前端/后端指向新地址。

- **Q：如何快速确认当前前端连接的是本地链还是 Sepolia？**  
  A：可以通过浏览器控制台 / Network 面板观察 RPC 请求的目标 URL；或者在 `.env.local` / `.env` 中查看 `NEXT_PUBLIC_CHAIN_ID` 与 `NEXT_PUBLIC_RPC_URL` 的当前值。一般规则是：存在 `.env.local` 时优先使用其配置。
