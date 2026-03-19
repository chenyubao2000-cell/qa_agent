#!/bin/bash
# ── Post-Notify Hook ──────────────────────────────
# 会话结束后执行。向 Slack 发送完成通知。
# 依赖 .env 中的 SLACK_WEBHOOK_URL（可选，未配置则跳过）。

source .env 2>/dev/null

[ -n "$SLACK_WEBHOOK_URL" ] && \
  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    -d "{\"text\": \"✅ [${GITHUB_REPO:-QA}] QA 测试执行完成\"}" || true
