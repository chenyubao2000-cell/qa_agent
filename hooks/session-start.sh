#!/bin/bash
# ── SessionStart Hook ──────────────────────────────
# Claude Code 会话启动时自动执行。
# 校验 .env 中的必填配置项，缺失则输出 JSON 错误信息。
# 输出格式：{"env":"ok"} 或 {"error":"缺少配置项：XXX"}

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

# 四项必填：预览地址、GitHub token、Linear API key、目标项目路径
REQUIRED=("PREVIEW_URL" "GITHUB_TOKEN" "LINEAR_API_KEY" "QA_WORKSPACE_DIR")
MISSING=()
for var in "${REQUIRED[@]}"; do
  [ -z "${!var}" ] && MISSING+=("$var")
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "{\"error\":\"缺少配置项：${MISSING[*]}\"}"
  exit 0
fi

echo '{"env":"ok"}'
