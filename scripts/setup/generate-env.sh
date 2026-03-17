#!/bin/bash
# CI/CD 环境下从系统环境变量生成 .env 文件
# 用法：bash scripts/setup/generate-env.sh [输出路径]
#
# 前置条件：CI 平台（GitHub Actions / GitLab CI 等）已配置以下 Secrets 为环境变量：
#   必填：PREVIEW_URL, GITHUB_TOKEN, LINEAR_API_KEY, LINEAR_PROJECT_ID, LINEAR_TEAM_ID
#   可选：TARGET_PROJECT_DIR, TARGET_GITHUB_URL, SLACK_WEBHOOK_URL 等
set -e

OUTPUT="${1:-.env}"

# 必填变量检查
REQUIRED_VARS=(PREVIEW_URL GITHUB_TOKEN LINEAR_API_KEY LINEAR_PROJECT_ID LINEAR_TEAM_ID)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ 缺少必填环境变量：${MISSING[*]}"
  echo "   请在 CI 平台的 Secrets 中配置这些变量"
  exit 1
fi

# 从 GitHub 仓库 URL 提取 owner/repo（如未单独设置）
GITHUB_OWNER="${GITHUB_OWNER:-${GITHUB_REPOSITORY_OWNER:-}}"
GITHUB_REPO="${GITHUB_REPO:-${GITHUB_REPOSITORY##*/}}"

cat > "$OUTPUT" << EOF
# ── 自动生成 by generate-env.sh ─────────────────
# 生成时间：$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── 目标项目 ──────────────────────────────────
TARGET_PROJECT_DIR=${TARGET_PROJECT_DIR:-.}
TARGET_GITHUB_URL=${TARGET_GITHUB_URL:-https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}}
TARGET_GITHUB_OWNER=${GITHUB_OWNER}
TARGET_GITHUB_REPO=${GITHUB_REPO}
TARGET_BRANCH=${TARGET_BRANCH:-main}

# ── Preview 环境 ──────────────────────────────
PREVIEW_URL=${PREVIEW_URL}

# ── GitHub ───────────────────────────────────
GITHUB_TOKEN=${GITHUB_TOKEN}
GITHUB_OWNER=${GITHUB_OWNER}
GITHUB_REPO=${GITHUB_REPO}

# ── Linear ───────────────────────────────────
LINEAR_API_KEY=${LINEAR_API_KEY}
LINEAR_PROJECT_ID=${LINEAR_PROJECT_ID}
LINEAR_TEAM_ID=${LINEAR_TEAM_ID}

# ── Playwright ───────────────────────────────
PLAYWRIGHT_BASE_URL=${PREVIEW_URL}
PLAYWRIGHT_HEADLESS=${PLAYWRIGHT_HEADLESS:-true}

# ── 通知（可选）──────────────────────────────
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-}
EOF

echo "✅ 已生成 $OUTPUT（从 CI 环境变量）"
