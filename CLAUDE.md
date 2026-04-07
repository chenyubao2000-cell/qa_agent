# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

QA 自动化测试平台（qa-platform）。通用 QA 能力集中管理，多项目复用。

## 架构

```
qa-platform/
├── skills/          → 4 个 Skill（CDP 探查、测试用例生成、Playwright E2E、Excel 导出）
├── .claude/agents/  → 5 个 Agent（e2e-orchestrator、test-executor、report-analyzer、bug-reporter、sentry-monitor）
├── .claude/commands/→ 6 个 Slash Command（/qa-explore、qa-from-issue、qa-run-all、qa-run-prd、qa-gen-cases、qa-fix-tests）
├── hooks/           → 2 个 Hook（session-start 校验、通知）
└── scripts/         → PR 监控（git-watcher）
```

## 流水线

```
命令层顺序启动 Agent：
  e2e-orchestrator (sonnet) → 用例 → Excel → spec（生成层）
     ↓ 完成后
  test-executor (haiku)     → 执行测试 → 产出报告（执行层）
     ↓ 完成后
  report-analyzer (haiku)   → 分析报告 → 返回失败列表（报告层）
     ↓ 命令层接收失败列表
  bug-reporter (haiku)      → 创建/追加 Linear Issue（上报层，命令层直接调度）

SessionStart hook：
  hooks/session-start.sh → 校验 .env 必需变量 → 输出 {"env":"ok"}

PR 监控（独立流程）：
  scripts/git-watcher.ts → 监听 PR 变更 → 评论同步

手动命令：
├── /qa-explore    → CDP 页面探查 → 生成 + 执行（不汇报 Linear）
├── /qa-from-issue → Linear issue → 生成 + 执行 + 汇报 Linear
├── /qa-run-prd    → PRD 文档 → 生成 + /qa-fix-tests 修复（不汇报 Linear）
├── /qa-gen-cases  → PRD 文档 → 仅生成用例 + Excel
├── /qa-fix-tests  → CDP 探查 → 修复失败测试
├── /qa-run-all    → 直接执行 spec → report-analyzer
└── /qa-run-all --sentry [--sentry-query "keyword"] → 执行 + Sentry 并行监控
```

## 命令

- `/qa-explore` — 探查浏览器页面，自动生成 E2E 测试基线 + 用例 + POM + spec
- `/qa-from-issue <issues>` — 从 Linear issue 生成或更新 E2E 测试（支持批量：多个 key / 关键词 / --all-open）
- `/qa-run-prd` — PRD 驱动 E2E 测试流水线
- `/qa-gen-cases` — 仅从 PRD 生成用例 + Excel，不生成脚本
- `/qa-fix-tests` — 通过 CDP 探查真实页面，修复失败的测试（支持 `--upgrade-i18n` 升级已有 spec 为多语言模式）
- `/qa-run-all` — 执行已有 E2E 测试，汇总报告，上报 Linear（不生成用例/spec）

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
  - `{source}` 取值：`cdp` | `prd` | `issue`
- 所有测试流水线输出统一 JSON 格式（见设计文档第九章）
- Subagent 模型选择：协调类用 sonnet，执行类用 haiku
- 去重通过扫描已有 spec 完成，已覆盖的模块跳过重新生成

## CDP 多窗口并行测试（手动探查模式）

当使用 `/qa-explore` 或手动 CDP 方式执行大量用例时，采用多标签页并行策略提高效率。

### 工具依赖

- **Chrome DevTools MCP**（`mcp__chrome-devtools__*`）：浏览器自动化
- 所有标签页**共享同一 browser context**（不使用 isolatedContext），共享登录 session
- Claude Code 在同一条消息中并行发起多个 `new_page` 调用

### 分批并行策略

每批最多 **10 个标签页**并行，上一批全部完成后再启动下一批。

```
示例：84 个用例
  第 1 批：用例 01~10  → 10 个标签页
  第 2 批：用例 11~20  → 10 个标签页
  ...
  第 9 批：用例 81~84  →  4 个标签页
```

### Phase 0 — 复用 about:blank 页 + 登录

浏览器启动时固定存在 page 1 = `about:blank`，直接 `navigate_page` 到目标 URL 作为第一个测试标签页。

```
1. select_page(pageId=1)
2. navigate_page(type="url", url="{PREVIEW_URL}/task")
3. wait_for ["新建任务", "我能为你做什么"] timeout=15000
   ├─ 命中 → 已登录，继续
   └─ 超时 → 执行登录流程：
        take_snapshot → fill textbox"请输入您的电子邮件地址" → click button"继续"
        wait_for ["输入密码"] timeout=10000
        take_snapshot → fill textbox"密码" → click button"继续"
        wait_for ["新建任务"] timeout=15000
```

### Phase 1 — 并行开剩余标签页

在**同一条消息**中并行发出 N-1 个 `new_page` 调用（N = 本批用例数）：

```
page 2: new_page(url="{PREVIEW_URL}/task")
page 3: new_page(url="{PREVIEW_URL}/task")
...
page N: new_page(url="{PREVIEW_URL}/task")
```

### Phase 2 — 每个标签页执行用例

```
select_page(pageId)

① wait_for ["新建任务", "我能为你做什么"] timeout=10000
  └─ 超时 → take_screenshot，标记 TAB_NOT_READY，跳过

② take_snapshot → click button "新建任务"（开新会话，防止上下文污染）

③ wait_for ["我能为你做什么"] timeout=8000

④ take_snapshot → fill textbox "请输入..." → 填入该 tab 对应的用例输入

⑤ take_snapshot → click button "Submit"

⑥ wait_for [预期关键词] timeout=90000
  └─ 超时 → take_screenshot 仍读取内容，标记 TIMEOUT 但不丢结果

⑦ take_snapshot → 拼接所有 StaticText 为完整回复

⑧ 按该用例验收标准逐条核查 → 记录 Pass / Fail + 原因
```

### Phase 3 — 下一批

关闭当前批所有标签页，重复 Phase 0~2 直到所有批次完成。

### 关键交互规则

> **UID 是动态的**，每次页面刷新后会变化。
> 执行前必须先 `take_snapshot`，用元素的 **role + name** 定位，再取当次 uid 操作。

### 常见问题

| 现象 | 处理方式 |
|------|----------|
| `wait_for` 超时但 AI 实际已回复 | 超时后立即 `take_snapshot` 读取内容，不丢弃结果 |
| "继续"按钮点击无效 | 先 fill，再 `take_snapshot` 获取新 uid，再 click |
| Submit 按钮仍 disabled | 确认 fill 的是 multiline textbox uid |
| select_page 后报"No snapshot found" | 每次 `select_page` 后必须先 `take_snapshot` |
| 跨会话 tab 消失 | 每次执行前 `list_pages`，若缺 tab 则重新 `new_page` + 登录 |
| session 已缓存跳过登录页 | wait_for 同时等多个关键词，任意命中即可 |

## 依赖

- exceljs — Excel 生成
- @playwright/test — E2E 测试
- chrome-devtools MCP — CDP 页面探查与 locator 校验
