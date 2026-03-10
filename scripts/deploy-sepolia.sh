#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${ROOT_DIR}/packages/contracts"
ENV_PATH="${ROOT_DIR}/.env"
FRONTEND_DIR="${ROOT_DIR}/packages/frontend"
FRONTEND_ENV_PATH="${FRONTEND_DIR}/.env"

echo "[deploy-sepolia] Using ROOT_DIR=${ROOT_DIR}"

if ! command -v forge >/dev/null 2>&1; then
  echo "[deploy-sepolia] ERROR: forge 未安装，请先安装 Foundry (https://book.getfoundry.sh/)。" >&2
  exit 1
fi

if [[ ! -f "${ENV_PATH}" ]]; then
  echo "[deploy-sepolia] ERROR: 未找到 ${ENV_PATH}，请先根据 .env.example 创建并填好 SEPOLIA_RPC_URL / DEPLOYER_PRIVATE_KEY 等配置。" >&2
  exit 1
fi

export "$(grep -E '^(SEPOLIA_RPC_URL|DEPLOYER_PRIVATE_KEY)=' "${ENV_PATH}" | xargs -0 echo || true)"

if [[ -z "${SEPOLIA_RPC_URL:-}" ]]; then
  echo "[deploy-sepolia] ERROR: SEPOLIA_RPC_URL 未在 .env 中配置。" >&2
  exit 1
fi

if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]]; then
  echo "[deploy-sepolia] ERROR: DEPLOYER_PRIVATE_KEY 未在 .env 中配置。" >&2
  exit 1
fi

LOG_FILE="$(mktemp -t fluent-vault-deploy-sepolia.XXXXXX)"
trap 'rm -f "${LOG_FILE}"' EXIT

echo "[deploy-sepolia] Running forge script against Sepolia..."
(
  cd "${CONTRACTS_DIR}"
  forge script script/Deploy.s.sol:DeployFluentVault \
    --rpc-url "${SEPOLIA_RPC_URL}" \
    --broadcast \
    -vvv
) | tee "${LOG_FILE}"

MOCK_USDC="$(grep -Eo 'MOCK_USDC=0x[0-9a-fA-F]+' "${LOG_FILE}" | tail -n1 | cut -d= -f2 || true)"
FLUENT_VAULT="$(grep -Eo 'FLUENT_VAULT=0x[0-9a-fA-F]+' "${LOG_FILE}" | tail -n1 | cut -d= -f2 || true)"
ORDER_BOOK="$(grep -Eo 'ORDER_BOOK=0x[0-9a-fA-F]+' "${LOG_FILE}" | tail -n1 | cut -d= -f2 || true)"

if [[ -z "${MOCK_USDC}" || -z "${FLUENT_VAULT}" || -z "${ORDER_BOOK}" ]]; then
  echo "[deploy-sepolia] ERROR: 无法从部署输出中解析合约地址。" >&2
  echo "请检查上方 forge script 日志是否包含 MOCK_USDC= / FLUENT_VAULT= / ORDER_BOOK= 行。" >&2
  exit 1
fi

echo "[deploy-sepolia] Parsed addresses:"
echo "  MOCK_USDC=${MOCK_USDC}"
echo "  FLUENT_VAULT=${FLUENT_VAULT}"
echo "  ORDER_BOOK=${ORDER_BOOK}"

echo "[deploy-sepolia] Updating root .env ..."

tmp_env="$(mktemp -t fluent-vault-env.XXXXXX)"
trap 'rm -f "${tmp_env}"' EXIT

# 在保留其他配置的前提下，仅更新合约地址（根 .env 不再维护 NEXT_PUBLIC_*）
awk -v mu="${MOCK_USDC}" -v fv="${FLUENT_VAULT}" -v ob="${ORDER_BOOK}" '
BEGIN {
  updated_mu = 0; updated_fv = 0; updated_ob = 0;
}
/^MOCK_USDC_ADDRESS=/ { print "MOCK_USDC_ADDRESS=" mu; updated_mu = 1; next }
/^ORDER_BOOK_ADDRESS=/ { print "ORDER_BOOK_ADDRESS=" ob; updated_ob = 1; next }
/^FLUENT_VAULT_ADDRESS=/ { print "FLUENT_VAULT_ADDRESS=" fv; updated_fv = 1; next }
{ print }
END {
  if (!updated_mu) print "MOCK_USDC_ADDRESS=" mu;
  if (!updated_ob) print "ORDER_BOOK_ADDRESS=" ob;
  if (!updated_fv) print "FLUENT_VAULT_ADDRESS=" fv;
}
' "${ENV_PATH}" > "${tmp_env}"

mv "${tmp_env}" "${ENV_PATH}"

echo "[deploy-sepolia] root .env 已更新。"

echo "[deploy-sepolia] Writing frontend .env ..."

mkdir -p "${FRONTEND_DIR}"
{
  echo "# frontend Sepolia 环境，由 scripts/deploy-sepolia.sh 自动生成/更新"
  # 服务端使用的环境变量（API / Hooks）
  echo "SEPOLIA_RPC_URL=${SEPOLIA_RPC_URL}"
  echo "MOCK_USDC_ADDRESS=${MOCK_USDC}"
  echo "FLUENT_VAULT_ADDRESS=${FLUENT_VAULT}"
  echo "ORDER_BOOK_ADDRESS=${ORDER_BOOK}"
  echo
  # 前端公开配置
  echo "NEXT_PUBLIC_CHAIN_ID=11155111"
  echo "NEXT_PUBLIC_RPC_URL=${SEPOLIA_RPC_URL}"
  echo "NEXT_PUBLIC_MOCK_USDC_ADDRESS=${MOCK_USDC}"
  echo "NEXT_PUBLIC_VAULT_ADDRESS=${FLUENT_VAULT}"
  echo "NEXT_PUBLIC_ORDER_BOOK_ADDRESS=${ORDER_BOOK}"
} > "${FRONTEND_ENV_PATH}"

echo "[deploy-sepolia] frontend/.env 已更新。"
echo "[deploy-sepolia] 请确保钱包网络选择 Sepolia，然后在项目根目录运行：pnpm dev:frontend"

