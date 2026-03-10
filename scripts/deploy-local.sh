#!/usr/bin/env bash

set -euo pipefail

# 可选参数：从参数列表中寻找第一个 0x 开头的本地私钥，用于设置 DEPLOYER_PRIVATE_KEY
for arg in "$@"; do
  if [[ "$arg" =~ ^0x[0-9a-fA-F]+$ ]]; then
    export DEPLOYER_PRIVATE_KEY="$arg"
    echo "[deploy-local] DEPLOYER_PRIVATE_KEY 已从参数设置。"
    break
  fi
done

# 如果未显式设置 FAUCET_PRIVATE_KEY，则在本地场景下默认复用 DEPLOYER_PRIVATE_KEY
DEFAULT_FAUCET_PRIVATE_KEY="${FAUCET_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"

# 本地链配置
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
CHAIN_ID="${CHAIN_ID:-31337}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${ROOT_DIR}/packages/contracts"
ENV_LOCAL_PATH="${ROOT_DIR}/.env.local"
EXAMPLE_ENV_PATH="${ROOT_DIR}/.env.example"
FRONTEND_DIR="${ROOT_DIR}/packages/frontend"
FRONTEND_ENV_LOCAL_PATH="${FRONTEND_DIR}/.env.local"

echo "[deploy-local] Using ROOT_DIR=${ROOT_DIR}"
echo "[deploy-local] Using RPC_URL=${RPC_URL} (CHAIN_ID=${CHAIN_ID})"

if ! command -v forge >/dev/null 2>&1; then
  echo "[deploy-local] ERROR: forge 未安装，请先安装 Foundry (https://book.getfoundry.sh/)。" >&2
  exit 1
fi

if ! nc -z 127.0.0.1 8545 >/dev/null 2>&1; then
  echo "[deploy-local] WARNING: 未检测到 127.0.0.1:8545 上的本地节点，"
  echo "               请先在另一个终端运行 `anvil` 再重试。"
fi

LOG_FILE="$(mktemp -t fluent-vault-deploy-local.XXXXXX)"
trap 'rm -f "${LOG_FILE}"' EXIT

echo "[deploy-local] Running forge script against local node..."
(
  cd "${CONTRACTS_DIR}"
  forge script script/Deploy.s.sol:DeployFluentVault \
    --rpc-url "${RPC_URL}" \
    --broadcast \
    -vvv
) | tee "${LOG_FILE}"

MOCK_USDC="$(grep -Eo 'MOCK_USDC=0x[0-9a-fA-F]+' "${LOG_FILE}" | tail -n1 | cut -d= -f2 || true)"
FLUENT_VAULT="$(grep -Eo 'FLUENT_VAULT=0x[0-9a-fA-F]+' "${LOG_FILE}" | tail -n1 | cut -d= -f2 || true)"
ORDER_BOOK="$(grep -Eo 'ORDER_BOOK=0x[0-9a-fA-F]+' "${LOG_FILE}" | tail -n1 | cut -d= -f2 || true)"

if [[ -z "${MOCK_USDC}" || -z "${FLUENT_VAULT}" || -z "${ORDER_BOOK}" ]]; then
  echo "[deploy-local] ERROR: 无法从部署输出中解析合约地址。" >&2
  echo "请检查上方 forge script 日志是否包含 MOCK_USDC= / FLUENT_VAULT= / ORDER_BOOK= 行。" >&2
  exit 1
fi

echo "[deploy-local] Parsed addresses:"
echo "  MOCK_USDC=${MOCK_USDC}"
echo "  FLUENT_VAULT=${FLUENT_VAULT}"
echo "  ORDER_BOOK=${ORDER_BOOK}"

echo "[deploy-local] Writing root .env.local ..."

{
  echo "# 本地 Anvil 环境，由 scripts/deploy-local.sh 自动生成/更新"
  echo "SEPOLIA_RPC_URL=${RPC_URL}"
  echo "ETHERSCAN_API_KEY="
  echo
  echo "# Faucet / Relayer 私钥（使用 anvil 提供的测试私钥之一，仅限本地/测试）"
  echo "FAUCET_PRIVATE_KEY=${DEFAULT_FAUCET_PRIVATE_KEY}"
  echo
  echo "# 本地已部署合约地址（用于后端 viem 调用）"
  echo "MOCK_USDC_ADDRESS=${MOCK_USDC}"
  echo "ORDER_BOOK_ADDRESS=${ORDER_BOOK}"
  echo "FLUENT_VAULT_ADDRESS=${FLUENT_VAULT}"
  echo
  echo "# Upstash Redis（用于限流，可选，本地可留空或复用线上配置）"
  if [[ -f "${ENV_LOCAL_PATH}" ]]; then
    # 尝试从已有 .env.local 中保留 Upstash / Supabase 配置
    grep -E '^(UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|SUPABASE_URL|SUPABASE_ANON_KEY)=' "${ENV_LOCAL_PATH}" || true
  else
    if [[ -f "${EXAMPLE_ENV_PATH}" ]]; then
      grep -E '^(UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|SUPABASE_URL|SUPABASE_ANON_KEY)=' "${EXAMPLE_ENV_PATH}" || true
    else
      echo "UPSTASH_REDIS_REST_URL="
      echo "UPSTASH_REDIS_REST_TOKEN="
      echo "SUPABASE_URL="
      echo "SUPABASE_ANON_KEY="
    fi
  fi
} > "${ENV_LOCAL_PATH}"

echo "[deploy-local] root .env.local 已更新。"

echo "[deploy-local] Writing frontend .env.local ..."

mkdir -p "${FRONTEND_DIR}"
{
  echo "# frontend 本地 Anvil 环境，由 scripts/deploy-local.sh 自动生成/更新"
  # 服务端使用的环境变量（API / Hooks）
  echo "SEPOLIA_RPC_URL=${RPC_URL}"
  echo "FAUCET_PRIVATE_KEY=${DEFAULT_FAUCET_PRIVATE_KEY}"
  echo "MOCK_USDC_ADDRESS=${MOCK_USDC}"
  echo "FLUENT_VAULT_ADDRESS=${FLUENT_VAULT}"
  echo "ORDER_BOOK_ADDRESS=${ORDER_BOOK}"
  echo
  # 前端公开配置（NEXT_PUBLIC_*）
  echo "NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}"
  echo "NEXT_PUBLIC_RPC_URL=${RPC_URL}"
  echo "NEXT_PUBLIC_MOCK_USDC_ADDRESS=${MOCK_USDC}"
  echo "NEXT_PUBLIC_VAULT_ADDRESS=${FLUENT_VAULT}"
  echo "NEXT_PUBLIC_ORDER_BOOK_ADDRESS=${ORDER_BOOK}"
} > "${FRONTEND_ENV_LOCAL_PATH}"

echo "[deploy-local] frontend/.env.local 已更新。"
echo "[deploy-local] 现在可以在项目根目录运行：pnpm dev:frontend"

