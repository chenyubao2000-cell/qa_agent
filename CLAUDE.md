# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

QA 自动化测试平台（qa-platform）。通用 QA 能力集中管理，多项目复用。

## 架构

```
qa-platform/
├── skills/          → 4 个 Skill（CDP 探查、测试用例生成、Playwright E2E、Excel 导出）
├── .claude/agents/  → 4 个 Agent（e2e-orchestrator、test-executor、report-analyzer、bug-reporter）
├── .claude/commands/→ 8 个 Slash Command（/qa-explore、qa-from-issue、qa-from-branch、qa-verify-fix、qa-run、qa-run-prd、qa-gen-cases、qa-fix-tests）
├── .claude/references/ → 8 个共享 Reference（Phase 0 初始化 + 模板、fix-subagent-prompt、POM merge、Excel export、VG、upgrade-i18n、handoff-sync）
├── hooks/           → 2 个 Hook（session-start 校验、通知）
└── scripts/         → PR 监控（git-watcher）
```

## 流水线

```
命令层顺序启动 Agent：
  e2e-orchestrator (opus)   → 用例 → Excel → spec（生成层）
     ↓ 完成后
  test-executor (haiku)     → 执行测试 → 产出报告（执行层）
     ↓ 完成后
  report-analyzer (sonnet)  → 分析报告 → 返回失败列表（报告层）
     ↓ 命令层接收失败列表
  bug-reporter (sonnet)     → 创建/追加 Linear Issue（上报层，命令层直接调度）

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
└── /qa-run        → 直接执行 spec → report-analyzer
```

## 命令

- `/qa-explore` — 探查浏览器页面，自动生成 E2E 测试基线 + 用例 + POM + spec
- `/qa-from-issue <issues>` — 从 Linear issue 生成或更新 E2E 测试（支持批量：多个 key / 关键词 / --all-open）
- `/qa-from-branch [branch] [issue-key|url ...] [--source <dir>]` — 从 GitHub 分支变更驱动 QA 测试（对比 main，匹配已有 spec 或生成新 spec；可传 Linear issue 丰富上下文并汇报结果）
- `/qa-verify-fix <issues>` — 验证 Linear bug issue 是否已修复（生成断言期望行为的测试，pass=已修复，fail=未修复）
- `/qa-run-prd` — PRD 驱动 E2E 测试流水线
- `/qa-gen-cases` — 仅从 PRD 生成用例 + Excel，不生成脚本
- `/qa-fix-tests` — 通过 CDP 探查真实页面，修复失败的测试（支持 `--upgrade-i18n` 升级已有 spec 为多语言模式）
- `/qa-run` — 执行已有 E2E 测试，汇总报告，上报 Linear（支持 `--suite`、`--lang`、`--slug`、`--source-filter` 参数）

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
