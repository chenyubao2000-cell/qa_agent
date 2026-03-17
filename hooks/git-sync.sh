#!/bin/bash
# SessionStart：检查目标项目代码是否与远程同步，落后则自动拉取
set -e

ENV_FILE="${PROJECT_DIR:-.}/.env"
[ ! -f "$ENV_FILE" ] && exit 0

source "$ENV_FILE" 2>/dev/null

TARGET_DIR="${TARGET_PROJECT_DIR:-}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"

TARGET_URL="${TARGET_GITHUB_URL:-}"

[ -z "$TARGET_DIR" ] && exit 0

# 目标目录不存在 → 自动 clone
if [ ! -d "$TARGET_DIR" ]; then
  if [ -z "$TARGET_URL" ]; then
    echo "⚠️  $TARGET_DIR 不存在且未配置 TARGET_GITHUB_URL，无法 clone"
    exit 0
  fi
  echo "🔄 目标项目不存在，正在 clone..."
  git clone --branch "$TARGET_BRANCH" "$TARGET_URL" "$TARGET_DIR" --quiet 2>/dev/null || {
    echo "⚠️  git clone 失败（检查 TARGET_GITHUB_URL 和网络）"
    exit 0
  }
  echo "✅ 已 clone 到 $TARGET_DIR ($TARGET_BRANCH)"
  exit 0
fi

# 目标目录存在但不是 git 仓库
[ ! -d "$TARGET_DIR/.git" ] && {
  echo "⚠️  $TARGET_DIR 不是 git 仓库，跳过同步"
  exit 0
}

cd "$TARGET_DIR"

# fetch 最新远程状态
git fetch origin "$TARGET_BRANCH" --quiet 2>/dev/null || {
  echo "⚠️  git fetch 失败，跳过同步（可能网络不通）"
  exit 0
}

# 比较本地与远程
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse "origin/$TARGET_BRANCH" 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "✅ 目标项目代码已是最新 ($TARGET_BRANCH)"
elif git merge-base --is-ancestor "$LOCAL" "$REMOTE" 2>/dev/null; then
  BEHIND=$(git rev-list --count HEAD.."origin/$TARGET_BRANCH")
  echo "🔄 目标项目落后远程 $BEHIND 个提交，正在拉取..."
  git pull origin "$TARGET_BRANCH" --quiet
  echo "✅ 已同步到最新 ($TARGET_BRANCH)"
else
  echo "⚠️  本地有未推送的提交，跳过自动拉取（请手动处理）"
fi
