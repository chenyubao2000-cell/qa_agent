#!/bin/bash
# user-prompt-submit hook: 当用户提交 /qa-explore、/qa-from-issue、/qa-run-prd 时
# 自动运行 phase0-context.sh，将最新 projectContext 注入 prompt
# 模型无论有什么历史消息，都会看到最新上下文，无法跳过

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 读取 stdin（用户输入内容）
USER_INPUT=$(cat)

# 只在 /qa-explore、/qa-from-issue、/qa-run-prd 命令时触发
if echo "$USER_INPUT" | grep -qiE '/qa-(explore|from-issue|run-prd)'; then
  # 提取命令后的参数
  ARGS=$(echo "$USER_INPUT" | sed -E 's|.*/qa-[a-z-]+\s*||')

  # 用临时文件分离 stdout(JSON) 和 stderr(日志)
  TMPFILE=$(mktemp)
  STDERR_LOG=$(bash "$PROJECT_ROOT/scripts/phase0-context.sh" $ARGS 2>&1 1>"$TMPFILE")
  EXIT_CODE=$?
  CONTEXT_JSON=$(cat "$TMPFILE")
  rm -f "$TMPFILE"

  if [ $EXIT_CODE -eq 0 ]; then
    echo "[Phase0-Hook] 自动注入最新项目上下文（hook 强制，不受模型历史影响）"
    echo "$STDERR_LOG"
    echo "projectContext=$CONTEXT_JSON"
    echo "[Phase0-Hook] 完成。跳过命令中的 Phase 0，直接从 Phase 1 开始。"
  else
    echo "❌ [Phase0-Hook] phase0-context.sh 执行失败 (exit $EXIT_CODE)"
    echo "$STDERR_LOG"
  fi
fi
