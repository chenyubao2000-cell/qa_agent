---
description: 启动 CI Watcher，监控 PR 合并后自动触发 E2E 测试
allowed-tools: Bash, Read, Glob, Grep
---

启动 QA Watcher 本地轮询服务。

## 用法
- `/qa-watch` — 默认 3 分钟轮询
- `/qa-watch 300` — 自定义轮询间隔（秒）
- `/qa-watch once` — 只检查一次（调试用）

## 完整流程

```
轮询 GitHub Deployments API（Railway 部署状态）
  │
  ├─ 发现新的 success 部署
  ├─ 通过 commit sha 反查关联 PR
  ├─ 分析 PR diff → 受影响的页面/组件
  ├─ 搜索 Linear 关联 Bug
  ├─ CDP 自动探查受影响页面
  │
  ├─ PR diff 含 PRD 变更（docs/prd/*.md）→ e2e-orchestrator (source: "prd")
  ├─ PR 关联 Linear issue → e2e-orchestrator (source: "issue")
  ├─ 其他情况 → /qa-run-all（直接跑已有 spec）
  │
  └─ 统一走 report-analyzer → bug-reporter → linear-bug-report
```

## 执行

```bash
ARGS="$ARGUMENTS"

if [ "$ARGS" = "once" ]; then
  bash scripts/ci/watcher.sh --once
elif [ -n "$ARGS" ]; then
  bash scripts/ci/watcher.sh --interval "$ARGS"
else
  bash scripts/ci/watcher.sh
fi
```

## 前置条件
- `.env` 已配置（GITHUB_TOKEN, TARGET_BRANCH, PREVIEW_URL, LINEAR_API_KEY 等）
- Chrome 浏览器已打开（CDP 探查需要）
- 目标项目已 clone 到 TARGET_PROJECT_DIR

## 产出
- `logs/pr-{number}-{timestamp}.log` — 每个 PR 的完整执行日志
- `logs/pr-{number}-summary.md` — 执行摘要
- `scripts/ci/state.json` — 已处理 PR 记录（防重复）
- Linear issues — 新 Bug 自动上报 / 已有 issue 自动回写
