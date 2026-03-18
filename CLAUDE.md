# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

QA 自动化测试平台 Plugin（qa-platform）。所有通用 QA 能力打包为 Plugin，一次开发，多项目复用。

## 架构

```
qa-platform-plugin/
├── skills/          → 4 个 Skill（测试用例生成、Playwright E2E、Excel 导出、Linear 上报）
├── agents/          → 4 个 Subagent（e2e-orchestrator、test-executor、report-analyzer、bug-reporter）
├── .claude/commands/→ 4 个 Slash Command（/qa-explore、qa-from-issue、qa-run-all、qa-run-prd）
<!-- ├── skills/vitest-testing/ — 单元测试 Skill（暂停） -->
<!-- ├── agents/unit-test-orchestrator.md — 单元测试 Agent（暂停） -->
<!-- ├── .claude/commands/qa-run-unit.md — 单元测试命令（暂停） -->
├── hooks/           → 2 个 Hook（session-start 校验+同步+变更检测、通知）
├── mcp-templates/   → MCP 配置模板（GitHub + Linear + Filesystem）
├── scripts/         → 环境加载、一键接入
└── project-template/→ .env.example + CLAUDE.md.template
```

## 流水线

```
命令层并行启动 Agent：
  ├─ e2e-orchestrator (sonnet) → 用例 → Excel → spec（生成层）
  ├─ test-executor (haiku)     → 接收 spec → 执行测试 → 产出报告（执行层）
  └─ report-analyzer (haiku)   → 监听报告 → 分析 → bug-reporter → Linear（报告层）

SessionStart hook 自动路由：
  hooks/session-start.sh → 校验 .env → 同步代码 → 检测新提交
    ├─ 有新提交 + PR 关联 Linear issue → 自动触发 /qa-from-issue（带 changelist）
    └─ 有新提交但无 issue → 自动触发 /qa-run-all

手动命令：
├── /qa-explore    → CDP 页面探查 → 并行启动
├── /qa-from-issue → Linear issue → 并行启动
├── /qa-run-prd    → PRD 文档 → 并行启动
└── /qa-run-all    → 直接执行已有 spec + report-analyzer 监听
```

## 命令

- `bash scripts/install.sh` — 在目标项目根目录运行，一键接入
- `/qa-explore` — 探查浏览器页面，自动生成 E2E 测试基线 + 用例 + POM + spec
- `/qa-from-issue <issues>` — 从 Linear issue 生成或更新 E2E 测试（支持批量：多个 key / 关键词 / --all-open）
- `/qa-run-all` — 执行已有 E2E 测试，汇总报告，上报 Linear（不生成用例/spec）
- `/qa-run-prd` — PRD 驱动 E2E 测试流水线

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
