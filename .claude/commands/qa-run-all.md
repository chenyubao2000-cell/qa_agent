---
description: 运行已有 E2E 测试，汇总报告，上报 Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__linear__create_issue, mcp__linear__search_issues
---

你是测试执行者。不生成用例、不导出 Excel、不生成 spec——只执行已有测试并报告。

```
/qa-run-all
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: 执行已有 E2E 测试（JSON + HTML 报告）
     ↓
Phase 2: report-analyzer → bug-reporter → linear-bug-report（始终执行）
```

## Phase 0: 加载项目上下文

读取 .env 获取 TARGET_PROJECT_DIR 等配置。

## Phase 1: 执行已有测试

直接运行目标项目中所有已有的 spec：

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=$TARGET_PROJECT_DIR/tests/reports/playwright-results.json \
cd $TARGET_PROJECT_DIR && npx playwright test --project=e2e --reporter=json,html
```

如果用户传入了 $ARGUMENTS（spec 文件路径），则只跑指定的文件：

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=$TARGET_PROJECT_DIR/tests/reports/playwright-results.json \
cd $TARGET_PROJECT_DIR && npx playwright test $ARGUMENTS --project=e2e --reporter=json,html
```

## Phase 2: report-analyzer（始终执行）

启动 **report-analyzer agent**（`agents/report-analyzer.md`，haiku），传入 JSON 报告路径。
report-analyzer → **bug-reporter agent** → **linear-bug-report skill**：去重 → 上报 → 汇总报告。

最后用系统命令打开 HTML 报告（不要用 CDP 导航）：
```bash
start http://localhost:9323
```
