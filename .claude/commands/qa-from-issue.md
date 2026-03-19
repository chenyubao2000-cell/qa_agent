---
description: 从 Linear issue 生成或更新 E2E 测试用例和脚本
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__linear__get_issue, mcp__linear__search_issues, mcp__linear__update_issue, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

你是 Issue 驱动的测试生成者。从 Linear issue 出发，生成针对性的 E2E 测试。

## 变更上下文（可选，由 SessionStart hook 或调用方注入）

如果调用方传入了 `changelist`（变更文件列表），在生成用例和脚本时：
1. **优先覆盖** changelist 中涉及的页面/组件
2. 针对变更的文件生成**更细粒度**的测试用例（边界条件、回归场景）
3. 将 changelist 传递给 e2e-orchestrator，作为 `projectContext.changelist`

## Phase 0: 加载项目上下文（强制，最先执行）

### Step 1 — 读取本项目 .env

```
Read(".env")  # valition_agent 根目录
```

提取 `TARGET_PROJECT_DIR`、`PREVIEW_URL`。

### Step 2 — 读取目标项目配置

```
Read("$TARGET_PROJECT_DIR/CLAUDE.md")
Read("$TARGET_PROJECT_DIR/.env")
Read("$TARGET_PROJECT_DIR/playwright.config.ts")
```

提取 `projectContext`：techStack、baseURL、authSetup、testCredentials、existingTests。

### Step 3 — 确定导航 URL

issue 中提取的 `pageUrl` 如果是相对路径，拼接 `baseURL`。

---

## 输入

`$ARGUMENTS` 支持多种格式，**可批量**：

```
/qa-from-issue STE-9                     # 单个 issue key
/qa-from-issue STE-9 STE-10 STE-11      # 多个 issue key（空格分隔）
/qa-from-issue 790b5957-...              # 单个 issue ID
/qa-from-issue 下载格式选择               # 搜索关键词（匹配所有结果）
/qa-from-issue --status backlog          # 按状态批量（处理该状态下的所有 issue）
/qa-from-issue --all-open                # 所有 Open/Backlog issue
```

### 批量处理逻辑

1. 解析 $ARGUMENTS，收集所有目标 issue
2. 按 **pageUrl 分组** — 同一页面的 issue 合并为一次 CDP 探查
3. 每组内逐个 issue 生成/更新 test case
4. 共享同一 POM（同页面的 issue 复用同一个 Page Object）

```
/qa-from-issue STE-9 STE-10
     ↓
收集: STE-9 (pageUrl=/task/abc), STE-10 (pageUrl=/task/abc)
     ↓
同一页面 → 1 次 CDP 探查 → 2 个 test case → 共享 POM
```

## 单个 Issue 流程

```
/qa-from-issue STE-9
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: 读取 Issue → 提取测试上下文（命令层独有）
     ↓
Phase 2: CDP 定向探查 → 验证 issue 描述的页面状态（命令层独有）
     ↓
Phase 3: 并行启动
         ├─ e2e-orchestrator (issue) → 用例 → Excel → spec
         ├─ test-executor → 接收 spec → 执行测试 → 产出报告
         └─ report-analyzer → 监听报告 → 分析 → bug-reporter → Linear
     ↓
Phase 4: 回写原 Issue
```

---

## Phase 1: 读取 Issue

### Step 1 — 获取 Issue 详情

```
mcp__linear__get_issue  issueId=$ARGUMENTS
```

如果传入的是搜索关键词（非 ID/key 格式），先搜索：
```
mcp__linear__search_issues  query=$ARGUMENTS
```
列出匹配结果，选最相关的一条。

### Step 2 — 提取测试上下文

从 issue 的 title + description 中提取：

| 字段 | 来源 | 示例 |
|------|------|------|
| `pageUrl` | description 中的 URL | `/task/YoEjBY4PNBFMwZWz` |
| `expectedBehavior` | "期望结果" 段落 | 弹出格式选择下拉 |
| `actualBehavior` | "实际结果" 段落 | 显示 toast "文件信息不完整" |
| `reproSteps` | "复现步骤" 段落 | 1. 登录 2. 打开任务 3. 点击下载 |
| `priority` | issue priority | Urgent(1) → P0 |
| `feature` | issue title 中的模块名 | canvas-download |
| `existingSpec` | 搜索是否已有对应 spec | tests/e2e/testcases/generated/canvas-download.test.ts |

### Step 3 — 判断操作类型

> 去重审查的详细规则在 `agents/e2e-orchestrator.md` 步骤 2 中统一定义，所有生成流程共享。
> 此处仅做 issue 特有的快速判断：

从 issue title / description 中提取 test case ID（如 `TC-VF-001`），然后：

```
Glob("tests/e2e/testcases/generated/*.test.ts")  → 搜索匹配的 test case
Grep("TC-VF-001", "tests/e2e/testcases/generated/")  → 精确匹配
```

```
issue 描述的场景已有完全对应的 test case？
  ├─ YES → 模式 X: 不新增用例，仅修正已有 test 的 locator / 断言 / 参数化 URL
  ├─ PARTIAL → 模式 A: 在已有 spec 中补充缺失的测试角度
  └─ NO  → 模式 B: 新建用例 + POM + spec
```

**模式 X 判定条件**：issue 是已有 test 的失败报告（title 含 test case ID，或 description 含 spec 文件名）

---

## Phase 2: CDP 定向探查

> **规范来源**：先读取 `skills/cdp-explorer/SKILL.md`，按其定义的流程执行。

读取 Skill 后，以 **targeted 模式** 执行：

```
Read("skills/cdp-explorer/SKILL.md")

执行参数：
- mode: "targeted"
- pageUrl: Phase 1 提取的 issue pageUrl
- targetArea: issue 涉及的功能区域（如 "button:下载" 或 ".download-section"）
- reproSteps: Phase 1 提取的复现步骤
```

按 cdp-explorer SKILL 的 targeted 模式执行：
1. 连接页面（Phase 1）
2. 初始状态三层扫描（Phase 2）
3. 围绕 targetArea 定向交互式探查（Phase 3 targeted 规则）
4. 如果有 reproSteps → 按步骤逐步操作，记录每步状态变化
5. 对比 expectedBehavior vs actualBehavior

---

## Phase 3: 并行启动 Agent

**关键约束**：启动 agent 时，prompt 只传入**输入数据**（issue 上下文、CDP 探查结果、source、projectContext），
**不要**在 prompt 中写具体的代码规范、locator 策略、文件模板。
agent 必须自行读取 `agents/e2e-orchestrator.md` → `skills/*/SKILL.md` 链路获取规范。

**Agent 1 — e2e-orchestrator**（sonnet）：

prompt 模板：
```
你是 e2e-orchestrator。请先读取 agents/e2e-orchestrator.md 了解你的完整职责和步骤。

输入：
- source: "issue"
- issueKey: <issue-key>
- issueContext: { pageUrl, expectedBehavior, actualBehavior, reproSteps, priority, feature }
- cdpBaseline: <Phase 2 探查产出的 baseline JSON 路径>
- projectContext: { targetProjectDir, baseURL, existingTests, ... }

按 agents/e2e-orchestrator.md 的步骤执行（读 SKILL.md → 生成），返回产物路径。
```

**Agent 2 — test-executor**（sonnet）：
- 等 e2e-orchestrator 完成后启动
- 接收 spec 文件路径 → 执行测试 → 产出报告

**Agent 3 — report-analyzer**（sonnet）：
- 等 test-executor 完成后启动
- 分析报告 → bug-reporter → Linear 上报 → 汇总报告 → 打开 HTML 报告

---

## Phase 4: 回写原 Issue

```
mcp__linear__update_issue
  issueId: <issue-id>
  description: 追加测试文件路径 + 执行结果摘要
```

---

## 产出物

| 文件 | 说明 |
|------|------|
| `test-cases/generated/{feature}.md` | Phase 3: 测试用例 |
| `test-cases/excel/{feature}.xlsx` | Phase 3: Excel 用例表格 |
| `tests/e2e/pages/{feature}.ts` | Phase 3: Page Object |
| `tests/e2e/testcases/generated/{feature}.test.ts` | Phase 3: Playwright spec |
| `tests/reports/playwright-results.json` | Phase 4: JSON 报告 |
| `playwright-report/index.html` | Phase 4: HTML 报告 |
| `tests/reports/combined/summary.md` | Phase 5: 汇总报告（始终生成） |
| Linear issue（原） | Phase 6: 回写测试文件路径 + 执行结果 |
| Linear issue（新） | Phase 5: 失败用例上报（去重后） |
