---
description: 运行已有 E2E 测试，汇总报告，上报 Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__linear__create_issue, mcp__linear__search_issues
---

你是测试执行者。不生成用例、不导出 Excel、不生成 spec——只执行已有测试并报告。

```
/qa-run-all [spec文件路径]
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: 并行启动
         ├─ 执行已有 E2E spec → 产出 JSON + HTML 报告
         └─ report-analyzer → 监听报告 → 分析 → bug-reporter → Linear
```

## Phase 0: 加载项目上下文

读取 .env 获取 TARGET_PROJECT_DIR 等配置。

## Phase 1: 并行启动

**任务 1 — 执行测试**（直接 bash，不走 e2e-orchestrator）：

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=$TARGET_PROJECT_DIR/tests/reports/playwright-results.json \
cd $TARGET_PROJECT_DIR && npx playwright test $ARGUMENTS --project=e2e --reporter=json,html
```

如果 $ARGUMENTS 为空则跑全量已有 spec。

**Agent — report-analyzer**（haiku）：
- 并行监听 `$TARGET_PROJECT_DIR/tests/reports/` 目录
- 测试产出报告后立即分析 → bug-reporter → Linear 上报 → 汇总报告 → 打开 HTML 报告
