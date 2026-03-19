---
name: CDP Page Explorer
description: 通过 Chrome DevTools Protocol 穷尽式探查页面，构建状态流图，输出结构化基线。所有 CDP 探查场景的唯一规范来源。
version: 1.0.0
allowed_tools: [mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__fill, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, Read, Write, Grep, Glob]
---

# CDP Page Explorer Skill

你是 CDP 页面探查专家。通过 Chrome DevTools Protocol 对真实浏览器页面执行**穷尽式探查**，发现所有可交互元素和隐藏状态，输出结构化基线。

> **本 Skill 是所有 CDP 探查场景的唯一规范来源。** 命令层（qa-explore、qa-from-issue）和 Skill 层（playwright-script-generator、test-case-generator）不再内联 CDP 探查逻辑，统一引用本文件。

---

## 核心理念：状态流图探查

静态扫描只能发现页面初始状态的元素。真实页面中大量元素隐藏在交互背后：

- 点击按钮 → 弹出 Modal
- 悬停菜单 → 展开下拉项
- 切换 Tab → 渲染新面板
- 滚动到底 → 加载更多
- 填写表单 → 启用提交按钮

**穷尽式探查** = 构建状态流图（State-Flow Graph）：

```
State₀ (初始页面)
  │── click "新建" ──→ State₁ (弹出表单 Modal)
  │                      │── fill 表单 → State₁ₐ (提交按钮启用)
  │                      │── click 关闭 → State₀ (回到初始)
  │── click Tab₂ ────→ State₂ (Tab₂ 面板)
  │── hover 头像 ────→ State₃ (用户菜单展开)
  │── scroll ────────→ State₄ (加载更多内容)
  ...
```

---

## 三种探查模式

| 模式 | 触发方 | 目标 | 深度 |
|------|--------|------|------|
| **full** | `/qa-explore` | 穷尽发现所有可交互元素和状态 | 递归探查所有交互 |
| **targeted** | `/qa-from-issue` | 只探查 issue 相关的功能区域 | 围绕目标元素定向探查 |
| **verify** | `playwright-script-generator` | 验证已有 locator 是否可用 | 无交互，仅查询 |

调用方通过 `mode` 参数指定：
```
mode: "full"      → 穷尽探查
mode: "targeted"  → 定向探查（需传入 targetSelectors / targetArea）
mode: "verify"    → Locator 验证（需传入 locators[]）
```

---

## Phase 1: 页面连接

### Step 1 — 列出并选择页面

```
mcp__chrome-devtools__list_pages
```

匹配策略（按优先级）：
1. 调用方传入的 `pageUrl` → URL 包含匹配
2. 浏览器已打开的页面中匹配 `baseURL` 的
3. 都不匹配 → `navigate_page` 导航到目标 URL

```
mcp__chrome-devtools__select_page  pageId=<matched>
```

### Step 2 — 确认页面就绪

```
mcp__chrome-devtools__evaluate_script
  function: () => document.readyState
```

如果不是 `complete`，等待：
```
mcp__chrome-devtools__wait_for  selector="body"  timeout=5000
```

### Step 3 — 登录墙检测与处理

页面就绪后，检测是否遇到登录页：

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const indicators = [
      document.querySelector('input[type="password"]'),
      document.querySelector('[name="email"], [name="username"]'),
      document.querySelector('form[action*="login"], form[action*="signin"]'),
    ];
    const isLoginPage = indicators.filter(Boolean).length >= 2;
    return {
      isLoginPage,
      url: location.href,
      title: document.title,
      hasPasswordField: !!indicators[0],
      hasUsernameField: !!indicators[1],
      hasLoginForm: !!indicators[2]
    };
  }
```

如果检测到登录页：
1. 从本项目 `.env` 获取 `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD`（或从 `projectContext.testCredentials` 获取）
2. 填写登录表单并提交：
   ```
   mcp__chrome-devtools__fill  selector="input[type='email'], input[name='email'], input[name='username']"  value=E2E_TEST_EMAIL
   mcp__chrome-devtools__fill  selector="input[type='password']"  value=E2E_TEST_PASSWORD
   mcp__chrome-devtools__click  selector="button[type='submit'], button:has-text('Sign in'), button:has-text('登录')"
   ```
3. 等待导航完成，验证已离开登录页
4. 如果仍在登录页 → 报错"自动登录失败，请在浏览器中手动登录后重试"
5. 登录成功后，导航到原目标 URL，继续 Phase 2 探查

---

## Phase 2: 初始状态扫描（State₀）

> **三层扫描顺序：DOM → 无障碍树 → 截图。不可跳步。**

### Layer 1 — DOM 结构扫描（语言无关，首选）

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const root = document.querySelector('main') || document.body;

    function scanRegion(container, regionName) {
      // 交互元素
      const interactives = Array.from(container.querySelectorAll(
        'button, [role="button"], a[href], input, textarea, select, ' +
        '[role="tab"], [role="menuitem"], [role="option"], [role="switch"], ' +
        '[role="checkbox"], [role="radio"], [contenteditable="true"], ' +
        '[onclick], [data-testid]'
      )).map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        testId: el.dataset?.testid,
        ariaLabel: el.getAttribute('aria-label'),
        placeholder: el.getAttribute('placeholder'),
        text: el.textContent?.trim().substring(0, 60),
        href: el.getAttribute('href')?.substring(0, 100),
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        required: el.required || el.getAttribute('aria-required') === 'true',
        maxLength: el.getAttribute('maxlength'),
        checked: el.checked ?? (el.getAttribute('aria-checked') === 'true'),
        expanded: el.getAttribute('aria-expanded'),
        hasPopup: el.getAttribute('aria-haspopup'),
        class: el.className?.toString().substring(0, 80),
        visible: el.offsetParent !== null || el.offsetWidth > 0,
        rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
        region: regionName
      }));

      // 区块标题
      const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,[role="heading"]')).map(h => ({
        level: h.tagName.match(/\d/)?.[0] || h.getAttribute('aria-level') || '?',
        text: h.textContent?.trim().substring(0, 80),
        region: regionName
      }));

      return { interactives, headings };
    }

    // 分区域扫描
    const nav = document.querySelector('nav, [role="navigation"]');
    const sidebar = document.querySelector('aside, [role="complementary"]');
    const main = document.querySelector('main, [role="main"]') || root;
    const footer = document.querySelector('footer');

    const regions = {};
    if (nav) regions.nav = scanRegion(nav, 'nav');
    if (sidebar) regions.sidebar = scanRegion(sidebar, 'sidebar');
    regions.main = scanRegion(main, 'main');
    if (footer) regions.footer = scanRegion(footer, 'footer');

    // 弹窗/模态框（全局作用域）
    const dialogs = Array.from(document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'
    )).map(el => ({
      title: el.getAttribute('aria-label') || el.querySelector('h2,h3')?.textContent?.trim(),
      visible: el.offsetParent !== null,
      testId: el.dataset?.testid,
      class: el.className?.toString().substring(0, 80)
    }));

    // 状态元素
    const alerts = Array.from(document.querySelectorAll('[role="alert"],[role="status"]')).map(el => ({
      role: el.getAttribute('role'),
      text: el.textContent?.trim().substring(0, 80)
    }));

    return {
      url: location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      regions,
      dialogs,
      alerts,
      summary: {
        totalInteractives: Object.values(regions).reduce((n, r) => n + r.interactives.length, 0),
        totalHeadings: Object.values(regions).reduce((n, r) => n + r.headings.length, 0),
        dialogCount: dialogs.length,
        alertCount: alerts.length
      }
    };
  }
```

### Layer 2 — 无障碍树（层级关系 + 语义状态）

```
mcp__chrome-devtools__take_snapshot
```

从 snapshot 补充：
- 元素父子层级关系（用于构造收窄的 locator）
- `expanded` / `checked` / `selected` 等交互状态
- `role` 与 `name` 的精确对应（与 DOM 层交叉验证）

### Layer 3 — 截图（视觉辅助，可选）

```
mcp__chrome-devtools__take_screenshot
```

用于：
- 确认可视区域布局
- 辅助理解元素空间关系
- **不作为 locator 定位依据**

---

## Phase 3: 交互式探查（穷尽发现）

> **仅 `full` 和 `targeted` 模式执行。`verify` 模式跳过。**

### 核心算法：广度优先 + 安全分级

```
已知状态集 = { State₀ }
待探查队列 = [ State₀ 中所有可交互元素 ]
状态流图 = { nodes: [State₀], edges: [] }

while (待探查队列不为空 && 未超时 && 状态数 < MAX_STATES) {
  element = 待探查队列.shift()

  // 1. 安全分级
  if (element 是危险操作) → 标记为 ⚠️ 跳过，记录到 baseline.dangerousActions
  if (element 是导航离开) → 标记为 🔗 记录但不执行

  // 2. 执行交互
  interact(element)  // click / hover / fill / expand

  // 3. 等待 DOM 稳定
  waitForStable()

  // 4. 重新扫描 DOM
  newState = scanDOM()

  // 5. 状态对比
  if (newState 是新状态) {
    已知状态集.add(newState)
    状态流图.addEdge(currentState, element, newState)
    待探查队列.push(...newState 中的新元素)
  }

  // 6. 回退到探查前状态（如关闭 Modal、收起下拉）
  backtrack()
}
```

### Step 1 — 识别可交互元素并分级

从 Phase 2 的 DOM 扫描结果中，按**安全性**分级：

| 等级 | 判定条件 | 处理 |
|------|----------|------|
| ✅ 安全（只读） | Tab 切换、手风琴展开、hover 菜单、详情查看 | 直接交互 |
| ⚠️ 可逆写入 | 表单填写（未提交）、checkbox toggle、搜索 | 交互后回退 |
| 🔴 危险（不可逆） | 删除、提交表单(POST)、登出、关闭账号 | **不执行**，仅记录 |
| 🔗 导航离开 | 外部链接、跳转到其他页面的按钮 | **不执行**，记录 href |

**危险操作识别规则：**
```
文本匹配（不区分大小写）：
  delete, remove, 删除, 移除, logout, 登出, 注销,
  submit, 提交, confirm, 确认（在 Modal 内时）,
  close account, 注销账号, drop, clear all, 清空

属性匹配：
  form[method="POST"] 的 submit 按钮
  button[type="submit"]（在含 action 的 form 内）

结构匹配：
  确认弹窗内的"确定"按钮 → 标记为危险
```

### Step 2 — 按 UI 模式分类探查

#### A. Tab / 导航切换

```
发现 role="tab" 元素列表
for each tab（当前未选中的）:
  1. click(tab)
  2. wait_for  对应的 tabpanel 可见
  3. scanDOM() → 记录 tabpanel 内的新元素
  4. 将新元素加入待探查队列
```

```
mcp__chrome-devtools__click  selector="[role='tab']:nth-child(2)"
mcp__chrome-devtools__wait_for  selector="[role='tabpanel']"  state="visible"
mcp__chrome-devtools__evaluate_script  // 重新扫描 tabpanel 内容
```

#### B. 下拉菜单 / Combobox

```
发现 aria-haspopup / role="combobox" / role="listbox" 触发器
  1. click(trigger)
  2. wait_for  listbox/menu 出现
  3. scanDOM() → 记录所有 option/menuitem
  4. click(trigger) 或 press Escape → 关闭
```

```
mcp__chrome-devtools__click  selector="[role='combobox']"
mcp__chrome-devtools__wait_for  selector="[role='listbox']"  state="visible"
mcp__chrome-devtools__evaluate_script
  function: () => Array.from(document.querySelectorAll('[role="option"]')).map(el => ({
    text: el.textContent?.trim(), value: el.getAttribute('data-value'),
    selected: el.getAttribute('aria-selected') === 'true'
  }))
mcp__chrome-devtools__press_key  key="Escape"
```

#### C. Modal / Dialog

```
发现触发 Modal 的按钮（aria-haspopup="dialog" / 文本含"新建""编辑"等）
  1. click(trigger)
  2. wait_for  [role="dialog"] 出现
  3. scanDOM() → 记录 dialog 内所有表单元素和按钮
  4. 关闭 dialog（点击关闭按钮 / press Escape）
  5. 验证 dialog 已消失
```

```
mcp__chrome-devtools__click  selector="button:has-text('新建')"
mcp__chrome-devtools__wait_for  selector="[role='dialog']"  state="visible"
mcp__chrome-devtools__evaluate_script  // 扫描 dialog 内容
mcp__chrome-devtools__press_key  key="Escape"
mcp__chrome-devtools__wait_for  selector="[role='dialog']"  state="hidden"
```

#### D. Hover 菜单 / Tooltip

```
发现可能触发 hover 效果的元素（头像、导航项、带 title 的元素）
  1. hover(element)
  2. 短暂等待（DOM 变化检测）
  3. scanDOM() → 检测是否有新元素出现
  4. 移开 hover → 恢复
```

```
mcp__chrome-devtools__hover  selector=".avatar"
mcp__chrome-devtools__evaluate_script
  function: () => {
    const menus = document.querySelectorAll('[role="menu"]:not([hidden])');
    return Array.from(menus).map(m => ({
      items: Array.from(m.querySelectorAll('[role="menuitem"]')).map(i => i.textContent?.trim())
    }));
  }
```

#### E. 手风琴 / 折叠面板

```
发现 aria-expanded="false" 的元素
  1. click(element)
  2. wait_for  aria-expanded="true"
  3. scanDOM() → 记录展开后的新内容
  4. click(element) → 收起（回退）
```

#### F. 滚动加载（Infinite Scroll / 分页）

```
检测页面是否有分页控件或无限滚动：
  1. 查找分页按钮（"下一页"、">"、role="navigation" 内的链接）
  2. 如果有 → 记录分页结构，不逐页翻（避免状态爆炸）
  3. 滚动到底部 → 检测是否有新内容加载
  4. 记录加载模式（分页/无限滚动/静态）
```

#### G. 右键菜单

```
对可能有右键菜单的元素（表格行、文件卡片、列表项）：
  1. evaluate_script 触发 contextmenu 事件
  2. 检测是否有 [role="menu"] 出现
  3. 扫描菜单项
  4. press Escape 关闭
```

### Step 3 — 表单探查（发现输入约束）

对每个表单区域，提取输入约束用于后续用例生成：

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const forms = document.querySelectorAll('form, [role="form"]');
    return Array.from(forms).map(form => ({
      action: form.getAttribute('action'),
      method: form.getAttribute('method'),
      fields: Array.from(form.querySelectorAll('input,textarea,select')).map(f => ({
        name: f.getAttribute('name'),
        type: f.getAttribute('type') || f.tagName.toLowerCase(),
        required: f.required,
        minLength: f.getAttribute('minlength'),
        maxLength: f.getAttribute('maxlength'),
        min: f.getAttribute('min'),
        max: f.getAttribute('max'),
        pattern: f.getAttribute('pattern'),
        options: f.tagName === 'SELECT'
          ? Array.from(f.options).map(o => ({ value: o.value, text: o.text }))
          : undefined
      })),
      submitButton: (() => {
        const btn = form.querySelector('[type="submit"], button:not([type="button"])');
        return btn ? { text: btn.textContent?.trim(), disabled: btn.disabled } : null;
      })()
    }));
  }
```

### Step 4 — 状态稳定性检测

每次交互后，需要确认 DOM 已稳定再扫描：

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    return new Promise(resolve => {
      let timer;
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => { observer.disconnect(); resolve(true); }, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      timer = setTimeout(() => { observer.disconnect(); resolve(true); }, 2000);
    });
  }
```

### Step 5 — 回退策略

交互后必须回退到探查前的状态：

| 交互类型 | 回退方式 |
|----------|----------|
| Tab 切换 | 点回原 Tab |
| Modal 打开 | press Escape 或 click 关闭按钮 |
| 下拉展开 | press Escape |
| Hover 菜单 | hover 空白区域 |
| 手风琴展开 | 再次 click 收起 |
| Checkbox toggle | 再次 click 恢复 |
| 表单填写 | 清空输入框（fill ""） |

回退后验证：重新扫描 DOM，确认与交互前状态一致。

---

## Phase 4: Locator 验证（verify 模式专用）

> **由 playwright-script-generator 在生成/修改 POM 后调用。**

验证已有 locator 在真实页面上是否唯一命中：

```
mcp__chrome-devtools__evaluate_script
  function: (selector, isRole) => {
    let count;
    if (isRole) {
      // role-based selector 无法直接用 querySelectorAll，用近似
      count = document.querySelectorAll(selector).length;
    } else {
      count = document.querySelectorAll(selector).length;
    }
    return count === 1 ? 'UNIQUE' : count === 0 ? 'ZERO' : `MULTIPLE(${count})`;
  }
  args: ["<CSS selector>", false]
```

对 Playwright role-based locator，用等价 CSS + aria 属性验证：

```
mcp__chrome-devtools__evaluate_script
  function: (role, name) => {
    const pattern = name ? new RegExp(name, 'i') : null;
    const els = document.querySelectorAll(`[role="${role}"], ${role}`);
    const matched = Array.from(els).filter(el =>
      !pattern || pattern.test(el.textContent?.trim()) ||
      pattern.test(el.getAttribute('aria-label') || '')
    );
    return matched.length === 1 ? 'UNIQUE' : matched.length === 0 ? 'ZERO' : `MULTIPLE(${matched.length})`;
  }
  args: ["button", "提交"]
```

输出：`UNIQUE`（可用）/ `MULTIPLE(n)`（需收窄）/ `ZERO`（未匹配）。

---

## Phase 5: 输出基线

### 基线文件格式

保存到 `$QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{page-slug}.json`：

```json
{
  "meta": {
    "url": "https://app.example.com/tasks",
    "title": "任务管理",
    "timestamp": "2026-03-18T10:30:00Z",
    "mode": "full",
    "explorationStats": {
      "statesDiscovered": 5,
      "interactionsPerformed": 23,
      "elementsFound": 87,
      "duration": "45s"
    }
  },

  "states": {
    "S0": {
      "name": "初始页面",
      "trigger": null,
      "regions": {
        "nav": { "interactives": [...], "headings": [...] },
        "main": { "interactives": [...], "headings": [...] },
        "sidebar": { "interactives": [...], "headings": [...] }
      },
      "dialogs": [],
      "alerts": []
    },
    "S1": {
      "name": "新建任务 Modal",
      "trigger": { "action": "click", "element": "button:新建任务", "fromState": "S0" },
      "regions": {
        "dialog": { "interactives": [...], "headings": [...] }
      }
    }
  },

  "stateGraph": {
    "edges": [
      { "from": "S0", "action": "click", "element": "button:新建任务", "to": "S1" },
      { "from": "S1", "action": "press:Escape", "element": null, "to": "S0" },
      { "from": "S0", "action": "click", "element": "tab:已完成", "to": "S2" }
    ]
  },

  "dangerousActions": [
    { "element": "button:删除", "reason": "text matches '删除'", "context": "table row action" }
  ],

  "externalLinks": [
    { "text": "帮助文档", "href": "https://docs.example.com" }
  ],

  "forms": [
    {
      "location": "S1 (新建任务 Modal)",
      "fields": [
        { "name": "title", "type": "text", "required": true, "maxLength": "100" },
        { "name": "description", "type": "textarea", "required": false }
      ],
      "submitButton": { "text": "创建", "disabled": true }
    }
  ],

  "summary": {
    "totalStates": 5,
    "totalInteractives": 87,
    "totalForms": 2,
    "totalDangerousActions": 3,
    "coveredPatterns": ["tabs", "modal", "dropdown", "form"],
    "scrollMode": "pagination"
  }
}
```

### page-slug 命名规则

从 URL 提取：
- `/task/abc123` → `task-abc123`
- `/settings/profile` → `settings-profile`
- `/` → `home`

---

## Targeted 模式补充规则

当 `mode: "targeted"` 时：

1. **缩小扫描范围**：调用方传入 `targetArea`（CSS selector 或文本描述），DOM 扫描只在该区域内执行
2. **深度限制**：只探查目标元素的**一级交互**（点击目标 → 发现新状态 → 扫描该状态内元素），不递归
3. **输出精简**：baseline 只包含目标区域的元素和相关状态，不包含全页面

```
// 调用示例（qa-from-issue 传入）
mode: "targeted"
targetArea: "button:下载"  // 或 CSS selector ".download-section"
reproSteps: ["点击下载按钮", "选择格式", "确认下载"]
```

执行时：
1. Phase 2 正常扫描全页 → 但只标记 targetArea 内的元素
2. Phase 3 只对 targetArea 相关元素执行交互式探查
3. 如果 `reproSteps` 存在 → 按步骤逐步操作并记录每步的状态变化

---

## 语言差异处理

CDP 连接本地 Chrome（可能中文），Playwright headless 默认英文。

**强制规则：**
1. DOM 扫描结果中的 `text` 字段记录的是**真实页面文本**（可能是中文）
2. 生成 locator 时优先使用**语言无关属性**：`data-testid` > CSS class > `aria-label`
3. 如果必须用文本匹配 → 同时记录中英文文本（如果可推断）
4. 基线 JSON 中标注 `lang: "zh-CN"` 或检测到的语言

---

## 探查终止条件

| 条件 | 阈值 | 说明 |
|------|------|------|
| 最大状态数 | 20 | 防止状态爆炸 |
| 最大交互次数 | 50 | 单次探查的交互上限 |
| 无新状态轮次 | 3 | 连续 3 个元素交互后无新发现 → 停止 |
| 超时 | 5 分钟 | 硬性超时 |
| 所有可交互元素已处理 | — | 理想终止条件 |

---

## Locator 优先级（统一标准）

> 探查时记录 locator 信息，供下游 playwright-script-generator 使用。

**语言无关优先（CDP 探查后 / 多语言场景）：**

1. `data-testid` — 最稳定
2. CSS class 组合 — 语言无关
3. `aria-label` — 硬编码英文时可用
4. `role` + `name` — 注意 headless 语言差异
5. 纯文本 — 最易受语言影响

**语义性优先（单语言、确认无差异时）：**

1. `getByRole('button', { name: 'Submit' })` — 语义最佳
2. `getByLabel('Email')` — 表单 input
3. `getByPlaceholder('Search...')` — 无 label 时
4. `getByText('Welcome')` — 非交互元素
5. `getByTestId('checkout-total')` — 语义不可行时
6. `page.locator('.legacy-widget')` — 最后手段

**冲突时**：如果页面存在多语言/i18n，或 CDP 与 headless 文本不一致 → 始终优先语言无关 locator。
