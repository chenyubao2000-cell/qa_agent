#!/bin/bash
# 加载项目 .env 文件到当前 shell 环境
# CI 环境下若 .env 不存在，自动从环境变量生成
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${PROJECT_DIR:-.}/.env"

# CI 环境下自动生成 .env
if [ ! -f "$ENV_FILE" ] && [ -n "$CI" ]; then
  echo "🔧 检测到 CI 环境，自动生成 .env ..."
  bash "$SCRIPT_DIR/generate-env.sh" "$ENV_FILE"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 未找到 .env 文件：$ENV_FILE"
  echo "   本地开发：请运行 install.sh 或手动创建 .env"
  echo "   CI 环境：请设置 CI=true 并配置必要的 Secrets"
  exit 1
fi

# 逐行加载，跳过注释和空行
while IFS='=' read -r key value; do
  key=$(echo "$key" | xargs)
  [[ -z "$key" || "$key" == \#* ]] && continue
  value=$(echo "$value" | xargs)
  value=$(eval echo "$value")
  export "$key=$value"
done < "$ENV_FILE"

echo "✅ 已加载 .env（$(grep -c '=' "$ENV_FILE" | xargs) 项配置）"
