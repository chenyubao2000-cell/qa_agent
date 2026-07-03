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

# ── 清理白盒测试沙箱残留 ──────────────────────────────
# /qa-whitebox 的 Mode B 会在 $SOURCE_PROJECT_DIR/.qa-sandboxes/wb-<slug>/ 下建 git worktree 沙箱，
# 正常情况下 Phase 7 跑完会自动删除；如果上一次会话中途崩溃/被中断，沙箱可能残留在磁盘上没人发现。
# 这里做一次尽力而为的兜底清理，不影响本 hook 现有的 .env 校验输出格式。
# 安全性：沙箱内的 node_modules 现在是从模板拷贝来的独立文件，不是 symlink/junction 连到真实项目，
# 所以这里的删除不会波及 $SOURCE_PROJECT_DIR 里的真实源码
# （详见 skills/whitebox-testing/references/instrumentation.md §2a）。
if [ -n "$SOURCE_PROJECT_DIR" ] && [ -d "$SOURCE_PROJECT_DIR/.qa-sandboxes" ]; then
  cleaned=0
  for sandbox in "$SOURCE_PROJECT_DIR"/.qa-sandboxes/wb-*; do
    [ -d "$sandbox" ] || continue
    if git -C "$SOURCE_PROJECT_DIR" worktree remove --force "$sandbox" 2>/dev/null; then
      cleaned=$((cleaned + 1))
    elif rm -rf "$sandbox" 2>/dev/null; then
      cleaned=$((cleaned + 1))
    fi
  done
  git -C "$SOURCE_PROJECT_DIR" worktree prune 2>/dev/null || true
  [ "$cleaned" -gt 0 ] && echo "[session-start] 清理了 $cleaned 个残留的白盒测试沙箱" >&2
fi

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
