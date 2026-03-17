#!/bin/bash
# Stop：会话结束通知（需要 .env 中配置 SLACK_WEBHOOK_URL）
source .env 2>/dev/null

[ -n "$SLACK_WEBHOOK_URL" ] && \
  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    -d "{\"text\": \"✅ [${GITHUB_REPO:-QA}] QA 测试执行完成\"}" || true
