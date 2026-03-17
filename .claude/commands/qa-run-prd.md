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
Phase 2: e2e-orchestrator (source: "prd")
         → 用例 → Excel → POM + spec → 执行测试
     ↓
Phase 3: report-analyzer → bug-reporter → linear-bug-report（始终执行）
```

## Phase 0: 加载项目上下文

读取 valition_agent/.env 获取 TARGET_PROJECT_DIR 和 PREVIEW_URL。
读取 $TARGET_PROJECT_DIR 的 CLAUDE.md 获取技术栈。

## Phase 1: 读取 PRD + 增量检测

读取 PRD（$ARGUMENTS 或默认 $TARGET_PROJECT_DIR/docs/prd/），用 checksums.json 增量检测，未变更的跳过。

## Phase 2: 启动 e2e-orchestrator

读取 `agents/e2e-orchestrator.md`，启动 agent（sonnet），传入 PRD 内容 + `source: "prd"` + `projectContext`。

e2e-orchestrator 内部完成：
1. 去重检查
2. test-case-generator skill → 用例 .md
3. excel-case-export skill → Excel
4. playwright-e2e skill → POM + spec
5. 执行测试（JSON + HTML 报告）

## Phase 3: report-analyzer（始终执行）

e2e-orchestrator 返回后，启动 **report-analyzer agent**（haiku），传入 JSON 报告路径。
report-analyzer → **bug-reporter agent** → **linear-bug-report skill**：去重 → 上报 → 汇总报告。

最后用系统命令打开 HTML 报告（不要用 CDP 导航）：
```bash
start http://localhost:9323
```
