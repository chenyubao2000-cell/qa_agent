# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

QA 自动化测试平台（qa-platform）。通用 QA 能力集中管理，多项目复用。

## 架构

```
qa-platform/
├── skills/          → 10 个 Skill
│   ├── 已有 5 个：CDP 探查、测试用例生成、Playwright E2E、Excel 导出、前置数据管理
│   └── 新增 5 个：unit-test-generator、api-test-generator、perf-test-generator、llm-eval-builder、mock-config-generator
├── .claude/agents/  → 12 个 Agent
│   ├── 已有 5 个：e2e-orchestrator、test-executor、cdp-test-executor、report-analyzer、bug-reporter
│   ├── 新增 4 个：unit-test-agent(opus)、api-orchestrator(sonnet)、eval-agent(sonnet)、sentinel-agent(haiku)
│   └── i18n team 3 个：i18n-cdp-runner(sonnet)、i18n-issue-reviewer(sonnet)、i18n-html-reporter(haiku)
├── .claude/commands/→ 14 个 Slash Command
│   ├── 已有 8 个：/qa-explore、qa-from-issue、qa-from-branch、qa-verify-fix、qa-run、qa-run-prd、qa-gen-cases、qa-fix-tests
│   ├── 新增 5 个：/qa-unit-test、/qa-api-test、/qa-perf-test、/qa-eval、/qa-sentinel
│   └── i18n 1 个：/qa-i18n-audit
├── .claude/references/ → 12 个共享 Reference（含 e2e-flakiness-playbook：fix-subagent 通用修复范式）
├── hooks/           → 2 个 Hook（session-start 校验、通知）
├── scripts/         → PR 监控 + 质量守卫 + Eval 定时
│   ├── git-watcher.ts（已有）
│   ├── sentinel-watcher.ts（新增：多平台监控守护进程）
│   └── eval-cron.ts（新增：Langfuse eval 定时任务）
└── .github/workflows/
    └── test-flow.yml（新增：PR 级增量测试 CI）
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
  bug-reporter (sonnet)     → 创建/追加 Linear Issue（上报层）

单元测试流水线（新增）：
  unit-test-agent (opus)    → 分析 diff → 生成 Vitest/pytest 测试 → 执行 → 报告

API 测试流水线（新增）：
  api-orchestrator (sonnet) → 分析 Schema → 生成 API 测试 + MSW mock → 执行 → 报告

LLM Eval 流水线（新增）：
  eval-agent (sonnet)       → Langfuse trace → eval dataset → LLM-as-Judge → 趋势分析

质量守卫（新增）：
  sentinel-agent (haiku)    → 监控 Sentry/Langfuse/Railway/DB → 异常触发测试/告警

i18n 审查流水线（新增）：
  i18n-cdp-runner (sonnet)   → CDP 按 locale×viewport 跑 spec → 抓 snapshot/截图/元数据
     ↓ 完成后
  i18n-issue-reviewer (sonnet) → 对比 messages 字典 → 判定未翻译/溢出/lang 不一致
     ↓ 完成后
  i18n-html-reporter (haiku)  → 聚合 issues + 截图 → 单文件 HTML 报告（每 issue 必带截图）

CI 增量测试（新增）：
  test-flow.yml             → PR affected 分析 → coverage gap → AI 测试建议 → 选择性执行

SessionStart hook：
  hooks/session-start.sh → 校验 .env 必需变量 → 输出 {"env":"ok"}

PR 监控（独立流程）：
  scripts/git-watcher.ts → 监听 PR 变更 → 评论同步

手动命令：
├── /qa-explore    → CDP 页面探查 → 生成 + 执行（不汇报 Linear）
├── /qa-from-issue → Linear issue → 生成 + 执行 + 汇报 Linear
├── /qa-from-branch → GitHub 分支 vs main → 匹配已有 spec + 生成缺失 spec → 执行 + 可选 Linear 汇报
├── /qa-verify-fix → Linear bug issue → 验证修复（断言期望行为）+ 汇报 Linear
├── /qa-run-prd    → PRD 文档 → 生成 + /qa-fix-tests 修复（不汇报 Linear）
├── /qa-gen-cases  → PRD 文档 → 仅生成用例 + Excel
├── /qa-fix-tests  → CDP 探查 → 修复失败测试
├── /qa-run        → 直接执行 spec → report-analyzer
├── /qa-unit-test  → 分析变更 → 生成单元测试 → 执行 → 报告
├── /qa-api-test   → 分析 API Schema → 生成 API 测试 → 执行 → 报告
├── /qa-perf-test  → 分析 endpoint → 生成 k6 性能测试 → 执行 → 基线对比
├── /qa-eval       → 构建 eval dataset → LLM-as-Judge 评分 → 趋势分析
├── /qa-sentinel   → 启动多平台质量守卫监控
└── /qa-i18n-audit → CDP × (locale×viewport) 审查 → issues JSON → HTML 报告（带截图）
```

## 命令

### E2E 测试（已有）
- `/qa-explore` — 探查浏览器页面，自动生成 E2E 测试基线 + 用例 + POM + spec
- `/qa-from-issue <issues>` — 从 Linear issue 生成或更新 E2E 测试（支持批量：多个 key / 关键词 / --all-open）
- `/qa-from-branch [branch] [issue-key|url ...] [--source <dir>]` — 从 GitHub 分支变更驱动 QA 测试
- `/qa-verify-fix <issues>` — 验证 Linear bug issue 是否已修复
- `/qa-run-prd` — PRD 驱动 E2E 测试流水线
- `/qa-gen-cases` — 仅从 PRD 生成用例 + Excel，不生成脚本
- `/qa-fix-tests` — 通过 CDP 探查真实页面，修复失败的测试
- `/qa-run` — 执行已有 E2E 测试，汇总报告，上报 Linear

### 单元测试 / API 测试 / 性能测试（新增）
- `/qa-unit-test [--target <file-or-dir>] [--style <vitest|pytest>]` — 分析代码变更，生成增量单元测试，执行并报告
- `/qa-api-test [--target <api-dir-or-file>] [--mock-level L1|L2|L3|all]` — 分析 API Schema，生成 API/集成测试，执行并报告
- `/qa-perf-test [--target <api-endpoint>] [--concurrent <N>] [--duration <time>]` — 生成 k6 性能测试，执行并与基线对比

### LLM 评估 / 质量守卫（新增）
- `/qa-eval [--mode build|run|regression] [--project <langfuse-project>] [--days <N>]` — LLM Eval 评估流水线
- `/qa-sentinel [--platforms sentry,langfuse,railway,db] [--interval 5m]` — 启动多平台质量守卫监控

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
  - `/qa-from-issue`、`/qa-run-prd`（feature 粒度）：不含 area-id，如 `login-issue.test.ts`
  - `/qa-from-branch`（feature 粒度）：不含 area-id，如 `task-sidebar-branch.test.ts`
  - `{source}` 取值：`cdp` | `prd` | `issue` | `branch` | `verify-fix`
- 所有测试流水线输出统一 JSON 格式（见设计文档第九章）
- Subagent 模型选择：协调类用 opus，分析类用 sonnet，纯执行类用 haiku
- 去重通过扫描已有 spec 完成，已覆盖的模块跳过重新生成

## 依赖

- exceljs — Excel 生成
- @playwright/test — E2E 测试
- chrome-devtools MCP — CDP 页面探查与 locator 校验
