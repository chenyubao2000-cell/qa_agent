#!/bin/bash
# SessionStart hook：校验 .env 必填项

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo '{"error":"未找到 .env 文件，请先创建"}'
  exit 0
fi

set +e
source "$ENV_FILE" 2>/dev/null
set -e

REQUIRED=("PREVIEW_URL" "GITHUB_TOKEN" "LINEAR_API_KEY" "TARGET_PROJECT_DIR")
MISSING=()
for var in "${REQUIRED[@]}"; do
  [ -z "${!var}" ] && MISSING+=("$var")
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "{\"error\":\"缺少配置项：${MISSING[*]}\"}"
  exit 0
fi

echo '{"env":"ok"}'
