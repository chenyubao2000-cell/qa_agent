---
description: PRD 驱动 E2E 测试流水线
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__take_snapshot
---

你是 E2E 测试流水线调度者。

```
/qa-run-prd [prd-path] [--source <源码目录>]
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: 读取 PRD（命令层独有）
     ↓
Phase 2: 顺序启动 Agent
         e2e-orchestrator (prd) → 用例 → Excel → spec
              ↓ 完成后
         test-executor → 接收 spec → 执行测试 → 产出报告
              ↓ 完成后
         report-analyzer → 分析 → bug-reporter → Linear
```

## Phase 0: 加载上下文 + 初始化工作区（强制，最先执行）

读源码的目录优先级：`$ARGUMENTS` 中的 `--source` > `.env` 中的 `SOURCE_PROJECT_DIR` > `QA_WORKSPACE_DIR`
- **读源码**→ 从源码目录读
- **写文件**（spec/POM/用例/报告）→ 始终写入 QA_WORKSPACE_DIR

读取 `.env` 获取 `QA_WORKSPACE_DIR`、`SOURCE_PROJECT_DIR`、`PREVIEW_URL`、`PLAYWRIGHT_BASE_URL`、`E2E_TEST_EMAIL`、`E2E_TEST_PASSWORD`。
读取 `$SOURCE_PROJECT_DIR/CLAUDE.md` 获取技术栈（仅用于理解业务逻辑）。

**初始化工作区**（空文件夹兼容，已初始化则全部跳过）：
与 `/qa-explore` Phase 0 Step 2 相同：目录、npm install、playwright.config.ts、fixtures.ts。

> PRD 流程本身无 CDP，但 Locator 验证阶段需要 CDP 导航到页面验证 selector。
> 如果遇到登录墙，与 `/qa-explore` Phase 1 Step 1 相同处理：探查登录表单 → 生成 global-setup.ts。

## Phase 1: 读取 PRD

读取 PRD（$ARGUMENTS 或默认 $SOURCE_PROJECT_DIR/docs/prd/）。

### PRD 分模块策略

PRD 包含多个功能模块时，按模块拆分后传给 orchestrator：
- 解析 PRD 的 ## 级标题，每个标题视为一个功能模块
- orchestrator 接收完整 PRD，但按模块逐个处理（步骤 2 去重 → 步骤 3 生成 → 步骤 5 生成 spec）
- 每个模块独立产出 spec，某个模块生成失败不影响其他模块

## Phase 2: 顺序启动 Agent

**关键约束**：启动 agent 时，prompt 只传入**输入数据**（PRD 内容、source、projectContext），
**不要**在 prompt 中写具体的代码规范、locator 策略、文件模板。
agent 必须自行读取 `agents/e2e-orchestrator.md` → `skills/*/SKILL.md` 链路获取规范。

**Agent 1 — e2e-orchestrator**（sonnet）：

prompt 模板：
```
你是 e2e-orchestrator。请先读取 agents/e2e-orchestrator.md 了解你的完整职责和步骤。

输入：
- source: "prd"
- prdFiles: [PRD 文件路径列表]
- projectContext: { targetProjectDir, baseURL, existingTests, ... }

按 agents/e2e-orchestrator.md 的步骤执行（读 SKILL.md → 生成），返回产物路径。
```

**检查 orchestrator 返回值**：
- 如果 `specs` 和 `modified_specs` 均为空 → 跳过 test-executor 和 report-analyzer，告知用户"所有用例已有 spec 覆盖"
- 否则 → 合并为执行列表，继续启动 test-executor

**Locator 验证**（命令层执行，orchestrator 完成后）：

PRD 流程不做 CDP 探查，浏览器中可能没有目标页面。验证前需先导航：

1. 从 orchestrator 返回的 `page_objects` 中提取每个 POM 对应的页面路径（从 POM 的 `goto()` 方法或 spec 的 `page.goto()` 调用推断）
2. 拼接 `projectContext.baseURL` + 页面路径 → 用 `mcp__chrome-devtools__navigate_page` 打开目标页面
3. 按 `skills/cdp-explorer/SKILL.md` Phase 1 Step 3 检测并处理登录墙
4. 从 POM 文件提取所有 locator → cdp-explorer verify 模式逐个验证
5. 结果为 ZERO 或 MULTIPLE → 修正 POM 中的 locator，重新验证
6. 全部 UNIQUE 后 → 继续启动 test-executor
7. 多个 POM 对应不同页面时，逐页面串行验证

**Agent 2 — test-executor**（haiku）：
- 等 e2e-orchestrator 完成后启动
- 接收 spec 文件路径 → 执行测试 → 产出报告

**Agent 3 — report-analyzer**（haiku）：
- 等 test-executor 完成后启动
- 分析报告 → bug-reporter → Linear 上报 → 汇总报告 → 打开 HTML 报告
