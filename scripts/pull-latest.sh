#!/bin/bash
# 拉取目标项目最新代码（供命令层 Phase 0 调用）
# 失败时 exit 1，调用方应终止流水线
set -e

ENV_FILE="${PROJECT_DIR:-.}/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ 未找到 .env 文件，无法确定目标项目"
  exit 1
fi

set +e
source "$ENV_FILE" 2>/dev/null
set -e

TARGET_DIR="${TARGET_PROJECT_DIR:-}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"

if [ -z "$TARGET_DIR" ]; then
  echo "❌ .env 中未配置 TARGET_PROJECT_DIR"
  exit 1
fi

if [ ! -d "$TARGET_DIR/.git" ]; then
  echo "❌ $TARGET_DIR 不是 git 仓库"
  exit 1
fi

cd "$TARGET_DIR"

# 检查是否有未提交的变更
if ! git diff --quiet HEAD 2>/dev/null; then
  echo "⚠️  目标项目有未提交的变更，跳过 pull（请先处理）"
  echo "📌 当前 HEAD: $(git rev-parse --short HEAD)"
  exit 0
fi

# fetch + pull
git fetch origin "$TARGET_BRANCH" --quiet || {
  echo "❌ git fetch 失败（检查网络）"
  exit 1
}

LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse "origin/$TARGET_BRANCH" 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "✅ 目标项目已是最新 ($TARGET_BRANCH)"
else
  BEHIND=$(git rev-list --count HEAD.."origin/$TARGET_BRANCH" 2>/dev/null || echo "?")
  echo "🔄 落后远程 $BEHIND 个提交，正在拉取..."
  git pull origin "$TARGET_BRANCH" --quiet || {
    echo "❌ git pull 失败（可能有冲突），请手动处理"
    exit 1
  }
  echo "✅ 已同步到最新 ($TARGET_BRANCH)"
fi

echo "📌 当前 HEAD: $(git rev-parse --short HEAD)"
