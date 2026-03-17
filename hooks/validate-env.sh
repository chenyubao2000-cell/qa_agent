#!/bin/bash
# SessionStart：校验 .env 完整性
set -e

ENV_FILE="${PROJECT_DIR:-.}/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  未找到 .env 文件，请先创建"
  exit 0
fi

source "$ENV_FILE" 2>/dev/null

REQUIRED=("PREVIEW_URL" "GITHUB_TOKEN" "LINEAR_API_KEY" "LINEAR_PROJECT_ID")
MISSING=()
for var in "${REQUIRED[@]}"; do
  [ -z "${!var}" ] && MISSING+=("$var")
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️  缺少配置项：${MISSING[*]}"
  echo "   请编辑 .env 文件补充"
fi
