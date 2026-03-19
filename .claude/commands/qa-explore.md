---
description: 探查浏览器中打开的页面，生成 E2E 测试基线（page-baseline.json），然后衔接 test-case-generator + playwright-script-generator skill 生成用例和脚本
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

你是页面探查者。通过 chrome-devtools MCP 自动探查浏览器中打开的页面，生成结构化基线，然后衔接已有 skill 生成完整的 E2E 测试产物。

## 流程

```
/qa-explore [page-url] [--source <源码目录>]
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: CDP 穷尽式探查 → page-baseline.json（命令层独有）
     ↓
Phase 2: 顺序启动 Agent
         e2e-orchestrator (cdp) → 用例 → Excel → spec
              ↓ 完成后
         test-executor → 接收 spec → 执行测试 → 产出报告
              ↓ 完成后
         report-analyzer → 分析 → bug-reporter → Linear
```

## Phase 0: 加载项目上下文（强制，最先执行）

### 源码目录

读源码的目录优先级：`$ARGUMENTS` 中的 `--source` > `.env` 中的 `SOURCE_PROJECT_DIR` > `QA_WORKSPACE_DIR`
- **读源码**→ 从源码目录读
- **写文件**（spec/POM/用例/报告）→ 始终写入 QA_WORKSPACE_DIR

### Step 1 — 读取本项目 .env

```
Read(".env")  # valition_agent 根目录
```

提取：
- `QA_WORKSPACE_DIR` — 目标项目根目录
- `PREVIEW_URL` — 预览环境 URL（CDP 导航的默认目标）

### Step 2 — 读取源码项目配置

```
Read("$SOURCE_PROJECT_DIR/CLAUDE.md")        # 技术栈、架构、业务背景
Read("$SOURCE_PROJECT_DIR/.env")             # PLAYWRIGHT_BASE_URL、测试账号等
Read("$SOURCE_PROJECT_DIR/playwright.config.ts")  # auth setup、reporter、项目结构
```

提取关键信息缓存为 `projectContext`：
- `techStack` — 框架、UI 库、状态管理（来自 CLAUDE.md）
- `baseURL` — 测试基准 URL（来自目标 .env 的 PLAYWRIGHT_BASE_URL）
- `authSetup` — 是否有 auth.setup.ts、storageState 路径（来自 playwright.config.ts）
- `testCredentials` — TEST_USER_EMAIL / TEST_USER_PASSWORD（来自目标 .env）
- `existingTests` — 已有测试目录结构（来自 playwright.config.ts 的 testDir）

### Step 3 — 确定探查 URL

优先级：
1. 用户传入的 `$ARGUMENTS`（如果是 URL）
2. 目标项目 `.env` 中的 `PLAYWRIGHT_BASE_URL`
3. 本项目 `.env` 中的 `PREVIEW_URL`

---

## Phase 1: CDP 穷尽式探查

> **规范来源**：先读取 `skills/cdp-explorer/SKILL.md`，按其定义的完整流程执行。

读取 Skill 后，以 **full 模式** 执行：

```
Read("skills/cdp-explorer/SKILL.md")

执行参数：
- mode: "full"
- pageUrl: Phase 0 确定的探查 URL
- outputPath: $QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{page-slug}.json
```

按 cdp-explorer SKILL 的 Phase 1 → Phase 2 → Phase 3 → Phase 5 完整执行：
1. 连接页面（list_pages → select_page）
2. 初始状态三层扫描（DOM → 无障碍树 → 截图）
3. **交互式穷尽探查**（Tab 切换、Modal 打开、下拉展开、Hover 菜单等）
4. 输出带状态流图的基线 JSON

---

## Phase 2: 顺序启动 Agent

按依赖顺序逐个启动 Agent，每个等前一个完成后再启动。

**关键约束**：启动 agent 时，prompt 只传入**输入数据**（baseline、source、projectContext），
**不要**在 prompt 中写具体的代码规范、locator 策略、文件模板。
agent 必须自行读取 `agents/e2e-orchestrator.md` → `skills/*/SKILL.md` 链路获取规范。

**Agent 1 — e2e-orchestrator**（sonnet）：

prompt 模板：
```
你是 e2e-orchestrator。请先读取 agents/e2e-orchestrator.md 了解你的完整职责和步骤。

输入：
- source: "cdp"
- baselineFile: $QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{slug}.json
- projectContext: { targetProjectDir, baseURL, existingTests, ... }

按 agents/e2e-orchestrator.md 的步骤执行：
1. 读取 baseline JSON
2. 审查已有用例（步骤 2）
3. 读取 skills/test-case-generator/SKILL.md → 生成用例
4. 读取 skills/excel-case-export/SKILL.md → 导出 Excel
5. 读取 skills/playwright-script-generator/SKILL.md → 生成 POM + spec
6. 返回产物路径
```

**检查 orchestrator 返回值**：
- 如果 `specs` 和 `modified_specs` 均为空 → 所有用例已覆盖，跳过 test-executor 和 report-analyzer，直接告知用户"所有用例已有 spec 覆盖，无需执行测试"
- 否则 → 将 `specs` + `modified_specs` 合并为执行列表，传给 test-executor

**Locator 验证**（命令层执行，orchestrator 完成后）：
1. 读取 orchestrator 返回的 `page_objects` 列表
2. 从每个 POM 文件中提取所有 locator（private 属性）
3. 按 `skills/cdp-explorer/SKILL.md` 的 Phase 4 (verify 模式) 逐个验证
4. 结果为 ZERO 或 MULTIPLE → 修正 POM 中的 locator，重新验证
5. 全部 UNIQUE 后 → 继续启动 test-executor

**Agent 2 — test-executor**（haiku）：
- 等 e2e-orchestrator 完成后启动
- 接收 spec 文件路径 → 执行测试 → 产出报告到 `$QA_WORKSPACE_DIR/tests/reports/`

**Agent 3 — report-analyzer**（haiku）：
- 等 test-executor 完成后启动
- 分析报告 → bug-reporter → Linear 上报 → 汇总报告 → 打开 HTML 报告

---

## 产出物清单

| 文件 | 说明 |
|------|------|
| `test-cases/generated/page-baseline-{slug}.json` | CDP 探查: 页面状态流图基线 |
| `test-cases/generated/{slug}-cdp.md` | 用例生成: 测试用例 |
| `test-cases/generated/playwright-handoff-{slug}.json` | 用例生成: Playwright 移交文件 |
| `test-cases/excel/{slug}-cdp.xlsx` | Excel 导出: 用例表格 |
| `tests/e2e/pages/{slug}.page.ts` | 脚本生成: Page Object |
| `tests/e2e/testcases/generated/{slug}-cdp.test.ts` | 脚本生成: Playwright spec |
| `tests/reports/playwright-results.json` | 测试执行: JSON 报告 |
| `playwright-report/index.html` | 测试执行: HTML 报告 |
| `tests/reports/combined/summary.md` | 报告分析: 汇总报告（始终生成） |
| Linear Issue | 报告分析: 失败用例上报（去重后，全部通过时跳过） |
