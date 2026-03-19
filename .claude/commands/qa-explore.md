---
description: 探查浏览器中打开的页面，生成 E2E 测试基线（page-baseline.json），然后衔接 test-case-generator + playwright-script-generator skill 生成用例和脚本
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

你是页面探查者。通过 chrome-devtools MCP 自动探查浏览器中打开的页面，**边探边写**，按功能区域增量生成 E2E 测试产物。

## 流程

```
/qa-explore [page-url] [--source <源码目录>] [自然语言描述]
     ↓
Phase 0: 加载项目上下文（.env → 配置）
     ↓
Phase 1: 初始扫描 → 识别功能区域列表（轻量，只扫 State₀）
     ↓
Phase 2: 增量循环（核心改动）
         for each 功能区域:
           a. 深度探查该区域（CDP 交互）
           b. 生成该区域的 mini-baseline
           c. e2e-orchestrator → 用例 + POM + spec（只处理该区域）
           d. Locator 验证
           e. 如果已达到用户要求的数量 → 跳出循环
     ↓
Phase 3: 统一执行 + 报告
         test-executor → 执行所有累积的 spec
              ↓ 完成后
         report-analyzer → 分析 → Linear
```

## 用户意图解析

从 `$ARGUMENTS` 中解析用户意图，决定探查范围：

| 用户输入 | 解析结果 |
|----------|---------|
| `（无参数）` | 全量探查，所有区域 |
| `帮我探索一个用例` / `一个` | `maxAreas = 1`，只探查一个最有价值的区域 |
| `探索表单` / `探索登录` | `targetArea = "表单"/"登录"`，只探查匹配的区域 |
| `https://xxx/join-waitlist` | 指定 URL，全量探查该页面 |
| `https://xxx/join-waitlist 一个` | 指定 URL + 限制数量 |

解析规则：
1. 包含 URL → 作为探查 URL
2. 包含数字（"一个"→1、"三个"→3、"5个"→5）→ 设为 `maxAreas`
3. 包含功能关键词（表单/导航/弹窗/Tab 等）→ 设为 `targetArea` 过滤
4. 都没有 → 全量（`maxAreas = Infinity`）

---

## Phase 0: 加载上下文 + 初始化工作区（强制，最先执行）

### Step 1 — 读取 .env + 构建 projectContext

```
Read(".env")  # valition_agent 根目录
Read("$SOURCE_PROJECT_DIR/CLAUDE.md")  # 技术栈（仅读源码理解业务）
```

读源码的目录优先级：`$ARGUMENTS` 中的 `--source` > `.env` 中的 `SOURCE_PROJECT_DIR` > `QA_WORKSPACE_DIR`

从**本项目 .env** 提取所有配置：
- `QA_WORKSPACE_DIR` — 目标项目根目录
- `baseURL` — `PLAYWRIGHT_BASE_URL`，回退到 `PREVIEW_URL`
- `authSetup` — `E2E_TEST_EMAIL` 有值 → 需要登录态
- `testCredentials` — `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`
- `techStack` — 来自源码目录 CLAUDE.md

### Step 2 — 初始化工作区（空文件夹兼容，已初始化则全部跳过）

检查 `$QA_WORKSPACE_DIR`，不存在或为空时执行初始化：

#### 2a. 复制 .env（不存在时）

将本项目 `.env` 中 Playwright 相关变量写入 `$QA_WORKSPACE_DIR/.env`：

```
PLAYWRIGHT_BASE_URL=<从本项目 .env 取>
PLAYWRIGHT_HEADLESS=<从本项目 .env 取>
E2E_TEST_EMAIL=<从本项目 .env 取>
E2E_TEST_PASSWORD=<从本项目 .env 取>
```

> dotenv 在 playwright.config.ts 和 global-setup.ts 中加载此文件。

#### 2b. 目录结构（已存在则跳过）

```bash
mkdir -p tests/e2e/testcases/generated tests/e2e/pages tests/e2e/.auth
mkdir -p tests/reports/combined test-cases/generated test-cases/excel test-results
```

#### 2c. 安装 Playwright（package.json 不存在时）

```bash
npm init -y && npm install -D @playwright/test dotenv && npx playwright install chromium
```

#### 2d. 生成 playwright.config.ts（不存在时）

```typescript
import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

config();

export default defineConfig({
  testDir: "./tests/e2e",
  ...(fs.existsSync("./tests/e2e/global-setup.ts") ? { globalSetup: "./tests/e2e/global-setup.ts" } : {}),
  timeout: 60_000,
  fullyParallel: true,
  workers: 1,
  reporter: [["json", { outputFile: "tests/reports/playwright-results.json" }], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{
    name: "e2e",
    testDir: "./tests/e2e",
    testMatch: "**/testcases/**/*.test.ts",
    use: { ...devices["Desktop Chrome"] },
  }],
});
```

#### 2e. 生成 fixtures.ts（不存在时）

**有 E2E_TEST_EMAIL** → 带 auth 的完整版：

```typescript
import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

type TestFixtures = { authenticatedPage: Page };
type WorkerFixtures = { authenticatedContext: BrowserContext };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  authenticatedContext: [async ({ browser }, use) => {
    const ctx = fs.existsSync(AUTH_FILE)
      ? await browser.newContext({ storageState: AUTH_FILE })
      : await browser.newContext();
    await use(ctx);
    await ctx.close();
  }, { scope: "worker" }],

  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
```

**无 E2E_TEST_EMAIL** → 简单版：

```typescript
import { test as base, expect } from "@playwright/test";
export const test = base;
export { expect };
```

> **global-setup.ts 此时不生成**——需要 Phase 1 CDP 探查登录页后，用验证过的真实 selector 才能写。

### Step 3 — 确定探查 URL

优先级：
1. 用户传入的 `$ARGUMENTS`（如果是 URL）
2. 本项目 `.env` 中的 `PLAYWRIGHT_BASE_URL`
3. 本项目 `.env` 中的 `PREVIEW_URL`

---

## Phase 1: 初始扫描 + 区域识别（轻量）

> **规范来源**：先读取 `skills/cdp-explorer/SKILL.md`。

```
Read("skills/cdp-explorer/SKILL.md")
```

### Step 1 — 连接页面 + 登录墙处理

按 cdp-explorer SKILL 执行 **Phase 1（连接）**，然后检测登录墙（Phase 1 Step 3）：

**如果遇到登录页**（整个认证基础设施在此一次性闭环）：

1. **探查登录表单**：用 cdp-explorer 的三层扫描（DOM → 无障碍树 → 截图）发现真实 selector
   - 记录：邮箱输入 selector、密码输入 selector、提交按钮 selector、登录成功后的 URL 模式、是否分步（先邮箱再密码）等
2. **CDP 登录**：用发现的 selector + `.env` 中的 `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` 完成登录
3. **生成 global-setup.ts**（`$QA_WORKSPACE_DIR/tests/e2e/global-setup.ts`，不存在时）：
   - 用验证过的真实 selector 写入，不靠猜
   - 包含：12h storageState 缓存、登录流程、写 `.auth/user.json`
   - 已存在 → 跳过（不覆盖用户自定义的登录逻辑）
4. **更新 playwright.config.ts**：确保包含 `globalSetup: "./tests/e2e/global-setup.ts"`
5. **生成 sign-in POM**（`tests/e2e/pages/sign-in.page.ts`）供登录相关 spec 使用
6. 登录成功后导航到原目标 URL，继续 Step 2

> **闭环**：selector 只有一个来源——CDP 真实探查。同一套 selector 用于：CDP 登录（探查用）、global-setup.ts（Playwright 执行用）、sign-in POM（登录 spec 用）。

**如果不需要登录** → 直接进入 Step 2

### Step 2 — State₀ 扫描

按 cdp-explorer SKILL Phase 2（初始扫描），**不执行 Phase 3（交互式探查）**。

产出：State₀ 的 DOM 结构 + 无障碍树 + 截图。

### Step 3 — 识别功能区域

从 State₀ 扫描结果中，将页面拆分为**功能区域**（exploration unit）：

| 识别信号 | 区域类型 | 示例 |
|----------|---------|------|
| `<form>` / `[role="form"]` / 多个 input 聚集 | 表单区域 | 登录表单、注册表单 |
| `[role="tab"]` + `[role="tabpanel"]` | Tab 切换区域 | 功能 Tab（核心/招聘） |
| `[role="navigation"]` / `<nav>` | 导航区域 | 顶部导航栏 |
| `[aria-haspopup]` / `[role="combobox"]` | 下拉/选择器 | 语言切换 |
| `button` + 文本含"新建/创建/添加" | 创建型 Modal | 新建任务按钮 |
| `[role="dialog"]` 已可见 | 当前弹窗 | 当前打开的 Modal |
| 独立的内容区块（h2 + 内容 + 按钮） | 内容区域 | CTA 区、特性展示区 |

输出一个有序列表，按测试价值排序（表单 > Tab > Modal > 导航 > 下拉 > 内容）：

```
areas = [
  { id: "form-join-waitlist", type: "form", name: "加入等待名单表单", elements: [...], priority: 1 },
  { id: "tabs-features", type: "tabs", name: "功能 Tab 切换", elements: [...], priority: 2 },
  { id: "nav-top", type: "navigation", name: "顶部导航", elements: [...], priority: 3 },
  { id: "combobox-lang", type: "combobox", name: "语言选择器", elements: [...], priority: 4 },
]
```

### Step 4 — 过滤 + 排序

1. 如果用户指定了 `targetArea` → 只保留名称/类型匹配的区域
2. 按 priority 排序
3. 如果用户指定了 `maxAreas` → 截断列表

**此时向用户报告**：
```
发现 N 个功能区域，将按以下顺序探查（计划处理 M 个）：
1. [表单] 加入等待名单表单 — 5 个交互元素
2. [Tab] 功能 Tab 切换 — 2 个 tab
3. ...
```

---

## Phase 2: 增量循环 — 边探边写

**核心理念**：
- **状态流图是累积的**：整个页面共享一个 `page-baseline-{slug}.json`，每个区域的探查往里**追加**新 state 和 edge
- **用例生成是增量的**：每个区域探查完后，只把**本轮新增的 states** 传给 orchestrator 生成用例
- **上下文是可控的**：orchestrator 只看到当前区域的 delta，不需要消化整个页面

### 状态流图文件（全页面共享，增量追加）

文件路径：`$QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{slug}.json`

Phase 1 初始扫描后创建，包含 State₀。后续每个区域探查**追加**新 state 和 edge：

```json
{
  "meta": { "url": "...", "title": "...", "mode": "full", "areasCompleted": ["form-join-waitlist"] },
  "states": {
    "S0": { "name": "初始页面", "trigger": null, "regions": {...} },
    "S1": { "name": "新建任务 Modal", "trigger": {"action":"click","element":"button:新建","fromState":"S0"}, "sourceArea": "modal-create-task" }
  },
  "stateGraph": {
    "edges": [
      { "from": "S0", "action": "click", "element": "button:新建任务", "to": "S1", "sourceArea": "modal-create-task" }
    ]
  },
  "areas": {
    "form-join-waitlist": { "status": "completed", "stateIds": ["S0"], "specFile": "...", "casesGenerated": 7 },
    "tabs-features": { "status": "pending", "stateIds": [] }
  },
  ...
}
```

每个 state/edge 上的 `sourceArea` 字段标记它属于哪个区域，orchestrator 据此提取 delta。

### 循环流程

```
allSpecs = []
allPageObjects = []
baseline = Phase 1 产出的初始 baseline（含 State₀ + areas 列表）

for area in areas:
  // ── a. 深度探查该区域 ──
  执行 cdp-explorer Phase 3（交互式探查），范围限定在该区域的元素内：
  - 只对 area.elements 中的可交互元素执行交互
  - 发现的新状态 → 编号为 S{n}，标记 sourceArea = area.id
  - 新 edge 加入 stateGraph，标记 sourceArea = area.id
  - 回退后继续下一个元素

  // ── b. 更新状态流图基线 ──
  将新发现的 states/edges/forms 追加到 baseline 文件
  更新 areas[area.id].status = "completed"
  更新 areas[area.id].stateIds = [本轮新增的 state ID 列表]
  写回 $QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{slug}.json

  // ── c. 立即生成该区域的用例 + spec ──
  启动 e2e-orchestrator（sonnet），传入完整 baseline 文件路径，但指定只处理当前区域的 delta：

  prompt 模板：
  ```
  你是 e2e-orchestrator。请先读取 agents/e2e-orchestrator.md 了解你的完整职责和步骤。

  输入：
  - source: "cdp"
  - baselineFile: $QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{slug}.json
  - areaScope: { id: "{area.id}", name: "{area.name}", type: "{area.type}" }
  - projectContext: { targetProjectDir, baseURL, existingTests, ... }
  - existingPageObjects: [已生成的 POM 文件路径列表，供追加 locator 而非新建]

  约束：
  - 读取 baseline 后，只处理 sourceArea = "{area.id}" 的 states/edges/forms
  - 如果 POM 文件已存在（前一个区域创建的同页面 POM），追加新 locator 和方法，不重建
  - 按 agents/e2e-orchestrator.md 步骤执行，返回产物路径
  ```

  收集返回的 specs、page_objects 到 allSpecs、allPageObjects

  // ── d. Locator 验证 ──
  对该区域新增的 locator 执行 CDP verify 模式验证
  ZERO 或 MULTIPLE → 修正 → 重新验证

  // ── e. 向用户报告进度 ──
  ```
  ✅ 区域 1/M [表单] 加入等待名单表单 — 生成 7 条用例
     spec: tests/e2e/testcases/generated/join-waitlist-form-cdp.test.ts
     状态流图: S0 → S1(表单提交确认), 共 2 states, 3 edges
  ```

  // ── f. 检查是否继续 ──
  如果已达到 maxAreas → 跳出循环
```

### 同页面 POM 合并规则

多个区域属于同一页面时，共享一个 POM 文件：
- 第一个区域 → 创建 POM（如 `join-waitlist.page.ts`）
- 后续区域 → 读取已有 POM，追加新的 private 属性 + public getter/方法
- orchestrator 通过 `existingPageObjects` 参数获知已有 POM

### 中断恢复

如果用户中途打断或下次执行 `/qa-explore`：
- 读取已有的 `page-baseline-{slug}.json`
- 检查 `areas[*].status`：`completed` 的跳过，`pending` 的继续
- 状态流图不丢失，从上次断点继续

---

## Phase 3: 统一执行 + 报告

所有区域处理完成后（或达到 maxAreas），统一执行测试。

**前置检查**：如果 allSpecs 为空（所有区域已覆盖） → 告知用户"所有用例已有 spec 覆盖" → 结束

**Agent — test-executor**（sonnet）：
- 接收 allSpecs 全部文件路径
- 执行测试 → 产出报告到 `$QA_WORKSPACE_DIR/tests/reports/`

**Agent — report-analyzer**（haiku）：
- 等 test-executor 完成后启动
- 分析报告 → bug-reporter → Linear 上报 → 汇总报告 → 打开 HTML 报告

---

## 产出物清单

| 文件 | 说明 |
|------|------|
| `test-cases/generated/page-baseline-{slug}.json` | CDP 探查: 页面状态流图基线（累积，含所有区域的 states/edges） |
| `test-cases/generated/{slug}-{area-id}-cdp.md` | 用例生成: 该区域的测试用例 |
| `test-cases/generated/playwright-handoff-{slug}-{area-id}.json` | 用例生成: Playwright 移交文件 |
| `test-cases/excel/{slug}-{area-id}-cdp.xlsx` | Excel 导出: 用例表格 |
| `tests/e2e/pages/{slug}.page.ts` | 脚本生成: Page Object（同页面共享，增量追加） |
| `tests/e2e/testcases/generated/{slug}-{area-id}-cdp.test.ts` | 脚本生成: Playwright spec |
| `tests/reports/playwright-results.json` | 测试执行: JSON 报告 |
| `playwright-report/index.html` | 测试执行: HTML 报告 |
| `tests/reports/combined/summary.md` | 报告分析: 汇总报告（始终生成） |
| Linear Issue | 报告分析: 失败用例上报（去重后，全部通过时跳过） |
