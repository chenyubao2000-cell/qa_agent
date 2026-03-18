---
description: 探查浏览器中打开的页面，生成 E2E 测试基线（page-baseline.json），然后衔接 test-case-generator + playwright-script-generator skill 生成用例和脚本
allowed-tools: Bash, Read, Write, Glob, Grep, Edit, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__navigate_page
---

你是页面探查者。通过 chrome-devtools MCP 自动探查浏览器中打开的页面，生成结构化基线，然后衔接已有 skill 生成完整的 E2E 测试产物。

## 流程

```
/qa-explore [page-url]
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: CDP 自动探查 → page-baseline.json（命令层独有）
     ↓
Phase 2: 并行启动
         ├─ e2e-orchestrator (cdp) → 用例 → Excel → spec
         ├─ test-executor → 接收 spec → 执行测试 → 产出报告
         └─ report-analyzer → 监听报告 → 分析 → bug-reporter → Linear
```

## Phase 0: 加载项目上下文（强制，最先执行）

### Step 1 — 读取本项目 .env

```
Read(".env")  # valition_agent 根目录
```

提取：
- `TARGET_PROJECT_DIR` — 目标项目根目录
- `PREVIEW_URL` — 预览环境 URL（CDP 导航的默认目标）

### Step 2 — 读取目标项目配置

```
Read("$TARGET_PROJECT_DIR/CLAUDE.md")        # 技术栈、架构、业务背景
Read("$TARGET_PROJECT_DIR/.env")             # PLAYWRIGHT_BASE_URL、测试账号等
Read("$TARGET_PROJECT_DIR/playwright.config.ts")  # auth setup、reporter、项目结构
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

## Phase 1: 自动 CDP 探查

### Step 1 — 选择目标页面

```
mcp__chrome-devtools__list_pages
```

如果浏览器已有匹配 Phase 0 确定的 URL 的页面，直接选中。
否则用 `navigate_page` 导航到目标 URL。

```
mcp__chrome-devtools__select_page  pageId=<matched>
```

### Step 2 — DOM 全量探查（main 区域）

执行以下 evaluate_script，一次性提取完整页面基线：

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const root = document.querySelector('main') || document.body;

    // 1. 功能区块（以 heading 为边界）
    const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,[role="heading"]')).map(h => ({
      level: h.tagName.match(/\d/)?.[0] || h.getAttribute('aria-level') || '?',
      text: h.textContent?.trim().substring(0, 80)
    }));

    // 2. 表单元素
    const forms = Array.from(root.querySelectorAll('input,textarea,select,[contenteditable="true"]')).map(el => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      testId: el.dataset?.testid,
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
      required: el.required || el.getAttribute('aria-required') === 'true',
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      maxLength: el.getAttribute('maxlength'),
      value: el.tagName === 'SELECT'
        ? Array.from(el.options || []).map(o => o.text).join(', ')
        : undefined,
      class: el.className?.toString().substring(0, 60)
    }));

    // 3. 按钮
    const buttons = Array.from(root.querySelectorAll('button,[role="button"]')).map(el => ({
      text: el.textContent?.trim().substring(0, 60),
      testId: el.dataset?.testid,
      ariaLabel: el.getAttribute('aria-label'),
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      type: el.getAttribute('type'),
      class: el.className?.toString().substring(0, 60)
    }));

    // 4. 链接
    const links = Array.from(root.querySelectorAll('a[href]')).map(el => ({
      text: el.textContent?.trim().substring(0, 60),
      href: el.getAttribute('href')?.substring(0, 100),
      testId: el.dataset?.testid
    }));

    // 5. 弹窗/模态框
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"]')).map(el => ({
      title: el.getAttribute('aria-label') || el.querySelector('h2,h3')?.textContent?.trim(),
      visible: el.offsetParent !== null
    }));

    // 6. Tab/导航
    const tabs = Array.from(root.querySelectorAll('[role="tab"]')).map(el => ({
      text: el.textContent?.trim(),
      selected: el.getAttribute('aria-selected') === 'true'
    }));

    // 7. 文件卡片（Mira 特有）
    const fileCards = Array.from(root.querySelectorAll('div[role="button"]')).filter(el =>
      el.className?.includes('rounded-xl') && el.className?.includes('border')
    ).map(el => ({
      text: el.textContent?.trim().substring(0, 80),
      class: el.className?.toString().substring(0, 60)
    }));

    // 8. 状态元素
    const alerts = Array.from(document.querySelectorAll('[role="alert"],[role="status"]')).map(el => ({
      role: el.getAttribute('role'),
      text: el.textContent?.trim().substring(0, 80)
    }));

    return {
      url: location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      headings,
      forms,
      buttons,
      links,
      dialogs,
      tabs,
      fileCards,
      alerts,
      summary: {
        headingCount: headings.length,
        formFieldCount: forms.length,
        buttonCount: buttons.length,
        linkCount: links.length,
        fileCardCount: fileCards.length,
        hasDisabledElements: forms.some(f => f.disabled) || buttons.some(b => b.disabled),
        hasRequiredFields: forms.some(f => f.required),
        hasDialogs: dialogs.length > 0,
        hasTabs: tabs.length > 0
      }
    };
  }
```

### Step 3 — Snapshot 补充结构

```
mcp__chrome-devtools__take_snapshot
```

从 snapshot 提取补充信息：元素层级关系、expanded/checked 状态。合并到 baseline。

### Step 4 — 保存基线

将探查结果写入 `$TARGET_PROJECT_DIR/test-cases/generated/page-baseline-{page-slug}.json`。

page-slug 从 URL 提取（如 `/task/abc123` → `task-abc123`）。

---

## Phase 2: 并行启动 Agent

同时启动两个 Agent（同一条消息中并行）：

**Agent 1 — e2e-orchestrator**（sonnet）：
- 传入：Phase 1 的 baseline JSON + `source: "cdp"` + `projectContext`
- 内部完成：去重 → 用例 → Excel → spec
- 完成后将 spec 路径交给 test-executor

**Agent 2 — test-executor**（haiku）：
- 接收 e2e-orchestrator 产出的 spec 文件路径
- 执行测试，产出 JSON + HTML 报告到 `$TARGET_PROJECT_DIR/tests/reports/`

**Agent 3 — report-analyzer**（haiku）：
- 并行监听 `$TARGET_PROJECT_DIR/tests/reports/` 目录
- test-executor 产出报告后立即分析 → bug-reporter → Linear 上报 → 汇总报告 → 打开 HTML 报告

---

## 产出物清单

| 文件 | 说明 |
|------|------|
| `test-cases/generated/page-baseline-{slug}.json` | Phase 1: 页面 DOM 基线 |
| `test-cases/generated/{slug}-cdp.md` | Phase 2: 测试用例 |
| `test-cases/generated/playwright-handoff-{slug}.json` | Phase 2: Playwright 移交文件 |
| `test-cases/excel/{slug}-cdp.xlsx` | Phase 3: Excel 用例表格 |
| `tests/e2e/pages/{slug}.page.ts` | Phase 4: Page Object |
| `tests/e2e/testcases/generated/{slug}-cdp.test.ts` | Phase 4: Playwright spec |
| `tests/reports/playwright-results.json` | Phase 5: JSON 报告 |
| `playwright-report/index.html` | Phase 5: HTML 报告 |
| `tests/reports/combined/summary.md` | Phase 6: 汇总报告（始终生成） |
| Linear Issue | Phase 6: 失败用例上报（去重后，全部通过时跳过） |
