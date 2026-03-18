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
  │
  ├─ 判断触发哪些流水线（可同时触发多条，互不冲突）：
  │
  │   判断触发模式：
  │
  │   ┌─ 只有 PRD 变更 → /qa-run-prd（完整流水线）
  │   ├─ 只有 issue → /qa-from-issue（完整流水线）
  │   ├─ 都没有 → /qa-run-all（只跑已有 spec）
  │   └─ PRD + issue 同时有 → 合并模式（见下方）
  │
  └─ 所有模式最终都走 test-executor → report-analyzer
```

## 分发规则

| PR 特征 | 触发方式 | 说明 |
|---------|---------|------|
| 只有 PRD 变更 | /qa-run-prd | 完整流水线 |
| 只有 issue | /qa-from-issue | 完整流水线 |
| 都没有 | /qa-run-all | 只跑已有 spec |
| PRD + issue 同时有 | 合并模式 | 见下方 |

## 合并模式（PRD + issue 同时存在）

避免 test-executor 重复执行全量 spec，合并为一条流水线：

```
Phase 1: 并行生成（Agent tool, run_in_background: true）
  ├─ Agent(e2e-orchestrator, source: "prd")   → 生成 PRD 相关 spec
  └─ Agent(e2e-orchestrator, source: "issue") → 生成 issue 相关 spec

Phase 2: 两个都完成后（Agent tool 自动通知）
  └─ Agent(test-executor) → 收集所有 spec，跑一次全量

Phase 3: 并行监听
  └─ Agent(report-analyzer) → 监听报告 → 分析 → bug-reporter → Linear
```

**关键：两个生成器并行跑（各写不同 spec 文件），但 test-executor 只跑一次，不重复执行。**

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
