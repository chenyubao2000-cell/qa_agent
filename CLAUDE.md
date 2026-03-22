# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

QA 自动化测试平台（qa-platform）。通用 QA 能力集中管理，多项目复用。

## 架构

```
qa-platform/
├── skills/          → 4 个 Skill（CDP 探查、测试用例生成、Playwright E2E、Excel 导出）
├── agents/          → 4 个 Agent（e2e-orchestrator、test-executor、report-analyzer、bug-reporter）
├── .claude/commands/→ 6 个 Slash Command（/qa-explore、qa-from-issue、qa-run-all、qa-run-prd、qa-gen-cases、qa-fix-tests）
├── hooks/           → 2 个 Hook（session-start 校验、通知）
└── scripts/         → PR 监控（git-watcher）
```

## 流水线

```
命令层顺序启动 Agent：
  e2e-orchestrator (sonnet) → 用例 → Excel → spec（生成层）
     ↓ 完成后
  test-executor (sonnet)    → 执行测试 → 产出报告（执行层）
     ↓ 完成后
  report-analyzer (haiku)   → 分析报告 → bug-reporter → Linear（报告层）

SessionStart hook：
  hooks/session-start.sh → 校验 .env 必需变量 → 输出 {"env":"ok"}

PR 监控（独立流程）：
  scripts/git-watcher.ts → 监听 PR 变更 → 评论同步

手动命令：
├── /qa-explore    → CDP 页面探查 → 生成 + 执行（不汇报 Linear）
├── /qa-from-issue → Linear issue → 生成 + 执行 + 汇报 Linear
├── /qa-run-prd    → PRD 文档 → 生成 + 执行 + 汇报 Linear
├── /qa-gen-cases  → PRD 文档 → 仅生成用例 + Excel
├── /qa-fix-tests  → CDP 探查 → 修复失败测试
└── /qa-run-all    → 直接执行 spec → report-analyzer
```

## 命令

- `/qa-explore` — 探查浏览器页面，自动生成 E2E 测试基线 + 用例 + POM + spec
- `/qa-from-issue <issues>` — 从 Linear issue 生成或更新 E2E 测试（支持批量：多个 key / 关键词 / --all-open）
- `/qa-run-prd` — PRD 驱动 E2E 测试流水线
- `/qa-gen-cases` — 仅从 PRD 生成用例 + Excel，不生成脚本
- `/qa-fix-tests` — 通过 CDP 探查真实页面，修复失败的测试
- `/qa-run-all` — 执行已有 E2E 测试，汇总报告，上报 Linear（不生成用例/spec）

## 约定

- 各项目维护 3 个文件：`.env`、`CLAUDE.md`、`docs/prd/*.md`
- AI 生成文件存放路径：
  - 用例文档：`test-cases/generated/*.md`
  - Excel 用例：`test-cases/excel/*.xlsx`
  - Page Object：`tests/e2e/pages/*.ts`
  - Playwright spec：`tests/e2e/testcases/generated/*.test.ts`
  - 测试报告：`tests/reports/` + `playwright-report/`
- 所有测试流水线输出统一 JSON 格式（见设计文档第九章）
- Subagent 模型选择：协调类用 opus，执行类用 sonnet
- 去重通过扫描已有 spec 完成，已覆盖的模块跳过重新生成

## 依赖

- exceljs — Excel 生成
- @playwright/test — E2E 测试
- chrome-devtools MCP — CDP 页面探查与 locator 校验
