#!/bin/bash
# Phase 0: 同步目标项目 + 收集 projectContext，输出 JSON
# 用法: bash scripts/phase0-context.sh [explore-url]
# 失败时 exit 1，调用方应终止流水线
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# ── Step 0: 读取本项目 .env ──────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 未找到 .env 文件" >&2
  exit 1
fi

set +e
source "$ENV_FILE" 2>/dev/null
set -e

TARGET_DIR="${TARGET_PROJECT_DIR:-}"
TARGET_BRANCH_VAL="${TARGET_BRANCH:-main}"
PREVIEW="${PREVIEW_URL:-}"

if [ -z "$TARGET_DIR" ]; then
  echo "❌ .env 中未配置 TARGET_PROJECT_DIR" >&2
  exit 1
fi

if [ ! -d "$TARGET_DIR/.git" ]; then
  echo "❌ $TARGET_DIR 不是 git 仓库" >&2
  exit 1
fi

# ── Step 1: 同步目标项目最新代码 ─────────────────
cd "$TARGET_DIR"

if ! git diff --quiet HEAD 2>/dev/null; then
  echo "⚠️  目标项目有未提交的变更，跳过 pull" >&2
else
  FETCH_OK=false
  for i in $(seq 1 10); do
    if git fetch origin "$TARGET_BRANCH_VAL" --quiet 2>/dev/null; then
      FETCH_OK=true
      break
    fi
    echo "⚠️  git fetch 第 ${i}/10 次失败，重试中..." >&2
    sleep 2
  done

  if [ "$FETCH_OK" = true ]; then
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse "origin/$TARGET_BRANCH_VAL" 2>/dev/null)
    if [ "$LOCAL" != "$REMOTE" ]; then
      git pull origin "$TARGET_BRANCH_VAL" --quiet 2>/dev/null || {
        echo "⚠️  git pull 失败，使用本地已有代码继续" >&2
      }
      echo "✅ 已同步到最新 ($TARGET_BRANCH_VAL)" >&2
    else
      echo "✅ 目标项目已是最新 ($TARGET_BRANCH_VAL)" >&2
    fi
  else
    echo "❌ git fetch 10 次均失败，终止流水线" >&2
    exit 1
  fi
fi

HEAD_HASH=$(git rev-parse --short HEAD)
echo "📌 HEAD: $HEAD_HASH" >&2

# ── Step 2: 读取目标项目配置 ─────────────────────
# CLAUDE.md
CLAUDE_MD=""
if [ -f "$TARGET_DIR/CLAUDE.md" ]; then
  CLAUDE_MD=$(cat "$TARGET_DIR/CLAUDE.md")
fi

# 目标 .env
TARGET_BASE_URL=""
TEST_EMAIL=""
TEST_PASSWORD=""
if [ -f "$TARGET_DIR/.env" ]; then
  set +e
  source "$TARGET_DIR/.env" 2>/dev/null
  set -e
  TARGET_BASE_URL="${PLAYWRIGHT_BASE_URL:-${PLAYWRIGHT_TEST_BASE_URL:-}}"
  TEST_EMAIL="${E2E_TEST_EMAIL:-}"
  TEST_PASSWORD="${E2E_TEST_PASSWORD:-}"
fi

# playwright.config.ts
PW_CONFIG=""
PW_CONFIG_PATH="$TARGET_DIR/playwright.config.ts"
if [ -f "$PW_CONFIG_PATH" ]; then
  PW_CONFIG=$(cat "$PW_CONFIG_PATH")
fi

# auth setup 检测
HAS_AUTH_SETUP="false"
if [ -f "$TARGET_DIR/tests/e2e/global-setup.ts" ]; then
  HAS_AUTH_SETUP="true"
fi

# 已有测试文件
EXISTING_TESTS=$(find "$TARGET_DIR/tests/e2e/testcases" -name "*.test.ts" 2>/dev/null | sed "s|.*tests/e2e/|tests/e2e/|" | sort)

# ── Step 3: 确定探查 URL ────────────────────────
USER_URL="${1:-}"
if [ -n "$USER_URL" ]; then
  EXPLORE_URL="$USER_URL"
elif [ -n "$TARGET_BASE_URL" ]; then
  EXPLORE_URL="$TARGET_BASE_URL"
else
  EXPLORE_URL="$PREVIEW"
fi

# ── 输出 JSON（stdout 仅输出 JSON，日志全走 stderr）──
cat <<ENDJSON
{
  "targetProjectDir": "$TARGET_DIR",
  "targetBranch": "$TARGET_BRANCH_VAL",
  "headCommit": "$HEAD_HASH",
  "exploreUrl": "$EXPLORE_URL",
  "baseURL": "${TARGET_BASE_URL:-$PREVIEW}",
  "previewUrl": "$PREVIEW",
  "testCredentials": {
    "email": "$TEST_EMAIL",
    "password": "$TEST_PASSWORD"
  },
  "hasAuthSetup": $HAS_AUTH_SETUP,
  "existingTests": [$(echo "$EXISTING_TESTS" | sed '/^$/d' | while read -r f; do printf '"%s",' "$f"; done | sed 's/,$//')],
  "hasClamdeMd": $([ -n "$CLAUDE_MD" ] && echo "true" || echo "false"),
  "hasPlaywrightConfig": $([ -n "$PW_CONFIG" ] && echo "true" || echo "false")
}
ENDJSON
