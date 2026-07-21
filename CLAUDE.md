# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

QA 自动化测试平台（qa-platform）。通用 QA 能力集中管理，多项目复用。

## 架构

```
qa-platform/
├── skills/          → 8 个 Skill
│   ├── E2E 相关 4 个：cdp-explorer、test-case-generator、playwright-script-generator、excel-case-export
│   ├── 前置数据 1 个：test-data-setup
│   ├── 白盒 1 个：whitebox-testing（普通代码 Vitest + Tool/MCP 插桩，Tool 插桩编排内联在 skill 里，不再有独立 orchestrator agent）
│   ├── 灰盒 1 个：greybox-testing（插桩运行中源码 + CDP 驱动 + 服务端日志对齐）
│   └── Bug 上报 1 个：bug-submit（读代码验证用户描述的 bug 后提交 Linear；测试失败后的上报也统一引导到这个 skill）
├── .claude/agents/  → 4 个 Agent
│   ├── E2E 3 个：e2e-orchestrator(opus)、test-executor(haiku)、report-analyzer(sonnet)
│   └── 灰盒 1 个：greybox-runner(sonnet)
├── .claude/commands/→ 7 个 Slash Command
│   ├── E2E 5 个：/qa-explore、qa-run、qa-run-prd、qa-gen-cases、qa-fix-tests
│   ├── 白盒 1 个：/qa-whitebox
│   └── 灰盒 1 个：/qa-greybox
├── .claude/references/ → 13 个共享 Reference（含 e2e-flakiness-playbook：fix-subagent 通用修复范式）
├── hooks/           → 1 个 Hook（session-start 校验）
└── scripts/         → 工具
    ├── demo-mcp-server.ts（whitebox MCP 示例服务）
    └── proxy-bootstrap.mjs（.mcp.json 里 linear MCP server 走代理用）
```

## 流水线

```
E2E 测试流水线（已有）：
  e2e-orchestrator (opus)   → 用例 → Excel → spec（生成层）
     ↓ 完成后
  test-executor (haiku)     → 执行测试 → 产出报告（执行层）
     ↓ 完成后
  report-analyzer (sonnet)  → 分析报告 → 返回失败列表（报告层）
     ↓ 命令层接收失败列表
  命令层展示失败列表 → 引导用户用 bug-submit skill 逐条核实后提交 Linear（不再自动创建 Issue）

白盒测试流水线：
  /qa-whitebox (命令层)      → classify-diff 分类变更 → 普通代码读源码生成 Vitest（Mode A）
     ↓ Tool/MCP 目标（Mode B）
  /qa-whitebox 内联执行      → 4 桩注入（按 instrumentation.md §七 编排，不再走独立 agent） → tool.execute() 直调脚本 → claude -p 裁决 → Markdown 报告

灰盒测试流水线：
  /qa-greybox (命令层)        → 插桩运行中源码 (复用白盒 4 探针) → 本地起服务 (带 DEBUG env)
     ↓ 完成后
  greybox-runner (sonnet)    → CDP 驱动真实流程 (每步埋 nonce) → 采集服务端探针簇 → 与 CDP 步骤对齐 → 断言内部行为
     ↓ 命令层收尾
  /qa-greybox               → 停服务 + 从备份还原源码 (必做) → CDP 步骤 × 内部证据对照报告

SessionStart hook：
  hooks/session-start.sh → 校验 .env 必需变量 → 输出 {"env":"ok"}；同时兜底清理白盒测试残留的沙箱（`$SOURCE_PROJECT_DIR/.qa-sandboxes/wb-*`，见 `.claude/settings.json` 注册）

手动命令：
├── /qa-explore    → CDP 页面探查 → 生成 + 执行（不汇报 Linear）
├── /qa-run-prd    → PRD 文档 → 生成 + /qa-fix-tests 修复（不汇报 Linear）
├── /qa-gen-cases  → PRD 文档 → 仅生成用例 + Excel
├── /qa-fix-tests  → CDP 探查 → 修复失败测试
├── /qa-run        → 直接执行 spec → report-analyzer
├── /qa-whitebox   → 分析分支最新提交或直测指定文件/工具 → 白盒测试（普通代码用 Vitest，Tool/MCP 加插桩）→ 报告
└── /qa-greybox    → 插桩运行中源码 + 本地起服务 → CDP 驱动真实流程 → 服务端探针与 CDP 对齐 → 断言内部行为
```

## 命令

### E2E 测试（已有）
- `/qa-explore` — 探查浏览器页面，自动生成 E2E 测试基线 + 用例 + POM + spec
- `/qa-run-prd` — PRD 驱动 E2E 测试流水线
- `/qa-gen-cases` — 仅从 PRD 生成用例 + Excel，不生成脚本
- `/qa-fix-tests` — 通过 CDP 探查真实页面，修复失败的测试
- `/qa-run` — 执行已有 E2E 测试，汇总报告，上报 Linear

### 白盒测试
- `/qa-whitebox [--branch <branch>] [--target <file[,file...]>] [--prd <path>] [--since <days=7>]` — 分析分支最新提交或直测指定文件/工具 → 普通代码生成 Vitest/pytest 用例；Tool/MCP 额外插桩 → 执行 + LLM 裁决 → Markdown 报告（`--prd` 可选）

### 灰盒测试
- `/qa-greybox --target <file|tool|route> --flow "<用户流程>" [--launch "<启动命令>"] [--port <n>] [--correlation nonce|time|marker] [--judge]` — 在运行中的服务端源码插桩（复用白盒 4 探针）→ 本地起服务 → CDP 驱动真实流程 → 服务端探针簇与 CDP 步骤对齐 → 断言内部行为 → 用完还原源码。适用「bug 只在真实 UI 复现、但断言目标是服务端内部逻辑」的场景；必须能本地起服务（远程 preview 插不了桩）

## 约定

- 各项目维护 3 个文件：`.env`、`CLAUDE.md`、`docs/prd/*.md`
- AI 生成文件存放路径及命名规则：
  - 用例文档：`test-cases/generated/{slug}-[{area-id}-]{source}.md`
  - Handoff JSON：`test-cases/generated/playwright-handoff-{slug}.json`
  - Excel 用例：`test-cases/excel/{slug}-[{area-id}-]{source}.xlsx`
  - Page Object：`tests/e2e/pages/{slug}.page.ts`
  - Playwright spec：`tests/e2e/testcases/generated/{slug}-[{area-id}-]{source}.test.ts`
  - 测试报告：`tests/reports/` (JSON) + `playwright-report/` (HTML)
  - Baseline：`test-cases/generated/page-baseline-{slug}.json`
- 文件名 `{area-id}` 规则：
  - `/qa-explore`（area 粒度）：含 area-id，如 `login-form-join-cdp.test.ts`
  - `/qa-run-prd`（feature 粒度）：不含 area-id，如 `login-issue.test.ts`
  - `{source}` 取值：`cdp` | `prd` | `verify-fix`（`issue`/`branch` 曾对应已移除的 `/qa-from-issue`、`/qa-from-branch`，历史生成文件可能仍带这两个值）
- 所有测试流水线输出统一 JSON 格式（见设计文档第九章）
- Subagent 模型选择：协调类用 opus，分析类用 sonnet，纯执行类用 haiku
- 去重通过扫描已有 spec 完成，已覆盖的模块跳过重新生成

## 依赖

- exceljs — Excel 生成
- @playwright/test — E2E 测试
- chrome-devtools MCP — CDP 页面探查与 locator 校验
