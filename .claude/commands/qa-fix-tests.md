---
description: 修复目标项目中失败的 E2E 测试用例（非 skip 的），通过 CDP 探查真实页面 + 修正 locator/断言
allowed-tools: Agent, Bash, Read, Write, Edit, Glob, Grep, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

你是测试修复专家。找到目标项目中失败的非 skip E2E 用例，通过 CDP 探查真实页面状态，修正 locator 和断言，直到测试通过。

```
/qa-fix-tests [spec文件路径] [--source <源码目录>]
     ↓
Phase 0: 加载项目上下文
     ↓
Phase 1: 筛选非 skip 用例 → 执行 → 收集失败列表
     ↓
Phase 2: 逐个修复（CDP 探查 → 分析错误 → 修正 spec/POM → 单文件验证）
     ↓
Phase 3: 全量回归 → 汇总报告
```

## Phase 0: 加载项目上下文

```
Read(".env")
```

提取 `QA_WORKSPACE_DIR`。

### 源码目录

读源码的目录优先级：`$ARGUMENTS` 中的 `--source` > `.env` 中的 `SOURCE_PROJECT_DIR` > `QA_WORKSPACE_DIR`
- **读源码**（查看组件实现、定位 locator）→ 从源码目录读
- **写文件**（修正的 spec/POM）→ 始终写入 QA_WORKSPACE_DIR

```
Read("$SOURCE_PROJECT_DIR/playwright.config.ts")
Read("$SOURCE_PROJECT_DIR/.env")
```

提取 `baseURL`、`testCredentials`。

---

## Phase 1: 筛选并执行

### Step 1 — 找出非 skip 的 spec 文件

```
Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts")
```

对每个文件，Grep 检查是否**全文件 skip**（`test.describe.skip` 或文件内所有 `test(` 都被 `test.skip(` 替换）：
- 全文件 skip → 排除
- 部分 skip 或无 skip → 纳入执行列表

如果 `$ARGUMENTS` 指定了文件路径，只处理指定文件。

### Step 2 — 执行一轮测试

```bash
cd $QA_WORKSPACE_DIR && PLAYWRIGHT_JSON_OUTPUT_NAME=tests/reports/fix-baseline.json \
npx playwright test <非skip文件列表> --project=e2e --reporter=json
```

### Step 3 — 解析失败列表

读取 `fix-baseline.json`，提取所有 `status: "failed"` 的用例：

```
failedTests = [
  {
    file: "tests/e2e/testcases/chat-workspace.test.ts",
    testName: "工作区页面 · 侧边栏折叠按钮可见",
    error: "locator.click: Error: strict mode violation: getByRole('button', { name: /collapse/i }) resolved to 3 elements",
    screenshot: "test-results/.../test-failed-1.png"
  },
  ...
]
```

如果全部通过 → 告知用户"所有非 skip 用例已通过，无需修复" → 结束。

---

## Phase 2: 逐个修复

> **规范来源**：读取 `skills/cdp-explorer/SKILL.md` 和 `skills/playwright-script-generator/SKILL.md`。

对 `failedTests` 按文件分组，逐文件修复：

### Step 1 — 读取失败的 spec 和 POM

```
Read("$QA_WORKSPACE_DIR/<failed spec file>")
Read("$QA_WORKSPACE_DIR/tests/e2e/pages/<对应 POM>.ts")  # 从 spec 的 import 推断
```

### Step 2 — 分析错误类型

| 错误模式 | 修复策略 |
|----------|----------|
| `strict mode violation: resolved to N elements` | CDP 探查 → 用父级收窄 locator |
| `locator.click: Target closed` / `page.goto: Target closed` | 检查导航逻辑、等待条件 |
| `expect(locator).toBeVisible(): locator resolved to 0 elements` | CDP 探查 → locator 已失效，需重新定位 |
| `expect(locator).toHaveText("xxx"): expected "yyy"` | CDP 探查 → 确认当前真实文本，更新断言 |
| `expect(page).toHaveURL("xxx")` | CDP 探查 → 确认实际 URL 路由 |
| `Timeout waiting for` | CDP 探查 → 检查元素是否存在、是否需要交互触发 |

### Step 3 — CDP 探查真实页面

按 `skills/cdp-explorer/SKILL.md` 的流程：

1. `list_pages` → `select_page`（选择目标页面）
2. 如果浏览器没有目标页面 → `navigate_page` 导航到 spec 中的 URL
3. 登录墙检测（Phase 1 Step 3）
4. 针对失败的 locator，用 verify 模式检查：
   - 当前页面上该 selector 匹配几个元素？
   - 如果 0 个 → DOM 探查找到正确的 locator
   - 如果多个 → DOM 探查确定收窄策略
5. 对于断言失败 → evaluate_script 获取元素当前真实文本/属性

### Step 4 — 修正 POM 和 spec

根据 CDP 探查结果修正：

**修 POM**（`tests/e2e/pages/*.ts`）：
- locator 失效 → 替换为 CDP 发现的正确 locator
- strict mode → 添加父级收窄（`.locator('section.main')` 等）
- 缺少元素 → 添加新的 private 属性 + public getter

**修 spec**（`tests/e2e/testcases/*.test.ts`）：
- 断言文本不匹配 → 更新 expected 值
- URL 不匹配 → 更新 expected URL
- 等待条件不足 → 添加显式等待

**严格遵守 POM 规则**：spec 中不得出现裸 locator，所有修正通过 POM 完成。

### Step 5 — 单文件验证

每修完一个文件立即验证：

```bash
cd $QA_WORKSPACE_DIR && npx playwright test <修复的文件> --project=e2e --reporter=list
```

- 通过 → 标记为 ✅ 已修复，继续下一个文件
- 仍失败 → 回到 Step 2 重新分析（最多 3 轮）
- 3 轮仍失败 → 标记为 ⚠️ 需人工介入，记录已尝试的修复和最新错误

---

## Phase 3: 全量回归

所有文件修复完成后，执行全量回归：

```bash
cd $QA_WORKSPACE_DIR && npx playwright test <所有非skip文件> --project=e2e --reporter=json,html
```

### 汇总报告

输出修复结果：

```
## 修复报告

### 修复前
- 总用例: N
- 通过: N
- 失败: N

### 修复后
- 总用例: N
- 通过: N
- 失败: N
- 修复成功: N 个用例
- 需人工介入: N 个用例

### 修复详情

| # | 文件 | 用例 | 原始错误 | 修复操作 | 结果 |
|---|------|------|----------|----------|------|
| 1 | chat-workspace.test.ts | 侧边栏折叠 | strict mode 3 elements | POM 添加父级收窄 | ✅ |
| 2 | homepage.test.ts | 导航链接 | 0 elements | POM locator 替换 | ✅ |
| 3 | chat-main.test.ts | 发送消息 | timeout | ⚠️ 需人工 | |
```
