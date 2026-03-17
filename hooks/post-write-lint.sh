#!/bin/bash
# PostToolUse(Write)：写入测试文件后自动 lint
FILE="$1"
if [[ "$FILE" == tests/**/*.ts ]]; then
  pnpm eslint "$FILE" --fix --quiet 2>/dev/null || true
fi
