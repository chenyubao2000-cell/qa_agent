---
description: PRD 驱动 E2E 测试流水线
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click
---

你是 E2E 测试流水线调度者。

```
/qa-run-prd [prd-path]
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: 读取 PRD + 增量检测（命令层独有）
     ↓
Phase 2: 并行启动
         ├─ e2e-orchestrator (prd) → 用例 → Excel → spec
         ├─ test-executor → 接收 spec → 执行测试 → 产出报告
         └─ report-analyzer → 监听报告 → 分析 → bug-reporter → Linear
```

## Phase 0: 加载项目上下文

读取 valition_agent/.env 获取 TARGET_PROJECT_DIR 和 PREVIEW_URL。
读取 $TARGET_PROJECT_DIR 的 CLAUDE.md 获取技术栈。

## Phase 1: 读取 PRD + 增量检测

读取 PRD（$ARGUMENTS 或默认 $TARGET_PROJECT_DIR/docs/prd/），用 checksums.json 增量检测，未变更的跳过。

## Phase 2: 并行启动 Agent

**Agent 1 — e2e-orchestrator**（sonnet）：
- 传入：PRD 内容 + `source: "prd"` + `projectContext`
- 内部完成：去重 → 用例 → Excel → spec

**Agent 2 — test-executor**（haiku）：
- 接收 e2e-orchestrator 产出的 spec → 执行测试 → 产出报告

**Agent 3 — report-analyzer**（haiku）：
- 监听报告目录 → 分析 → bug-reporter → Linear 上报 → 汇总报告 → 打开 HTML 报告
