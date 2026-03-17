#!/bin/bash
# 拉取目标项目最新 preview 分支代码
set -e

PROJECT_PATH="${PROJECT_PATH:-.}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-preview}"

if [ ! -d "$PROJECT_PATH/.git" ]; then
  echo "❌ $PROJECT_PATH 不是 Git 仓库"
  exit 1
fi

cd "$PROJECT_PATH"

echo "📥 拉取 $DEFAULT_BRANCH 分支最新代码..."
git fetch origin "$DEFAULT_BRANCH"
git checkout "$DEFAULT_BRANCH"
git pull origin "$DEFAULT_BRANCH"

echo "✅ 已切换到 $DEFAULT_BRANCH 分支（$(git log -1 --format='%h %s')）"
