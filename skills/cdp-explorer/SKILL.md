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

### 理论基础

本 Skill 的探查方法论基于以下成熟的 Web 应用测试理论：

**1. Crawljax 模型驱动探查（Mesbah & van Deursen, 2009）**
现代 Web 应用是事件驱动的状态机。每一次用户交互（click、hover、input、keyboard）都可能触发 JavaScript 事件处理器，导致 DOM 状态变迁。传统爬虫只跟踪 URL 变化，无法覆盖 AJAX/SPA 应用中的隐藏状态。穷尽式探查的本质是：**将 Web 应用建模为有限状态机，系统性触发所有事件，发现所有可达状态。**

**2. 状态等价判定（State Abstraction）**
两次交互后的 DOM 是否代表"同一个状态"？这是避免状态爆炸的关键。采用**多层等价函数**：
- **结构等价**：忽略文本内容和动态属性（id、时间戳），只比较 DOM 树骨架（标签 + role + 层级）
- **语义等价**：相同的可交互元素集合（按 role + name 去重后一致）= 同一状态
- **视觉等价**：截图像素级对比（可选，作为辅助判定）

判定顺序：先用语义等价（快速），存疑时用结构等价（精确）。

**3. 探查策略：混合优先级 BFS**
纯 BFS 对所有元素一视同仁，效率低。采用**优先级驱动的 BFS**：
- **高优先级**：aria-haspopup、aria-expanded="false"、role="tab"（未选中）、role="menuitem" — 这些元素最可能揭示新状态
- **中优先级**：button、a[href]（站内）、input — 常规交互元素
- **低优先级**：纯展示性交互（tooltip、hover highlight）

**4. 页面分区独立探查（Region-Based Exploration）**
大型页面（如 Dashboard）将 UI 划分为独立区域（nav、sidebar、main、footer），每个区域独立构建子状态流图，最后合并。这避免了跨区域状态组合爆炸。

**5. 事件全覆盖原则**
不仅限于 click 和 hover。完整的事件覆盖包括：
- **鼠标事件**：click、dblclick、contextmenu、hover（mouseenter/mouseleave）、drag
- **键盘事件**：Enter、Escape、Tab、方向键、快捷键（Ctrl+S 等应用级快捷键）
- **输入事件**：input、change、blur、focus
- **触摸/手势**：swipe（移动端模式时）
- **窗口事件**：resize、scroll

### 状态流图

静态扫描只能发现页面初始状态的元素。真实页面中大量元素隐藏在交互背后：

- 点击按钮 → 弹出 Modal
- 悬停菜单 → 展开下拉项
- 切换 Tab → 渲染新面板
- 滚动到底 → 加载更多
- 填写表单 → 启用提交按钮
- 双击单元格 → 进入编辑模式
- 拖拽元素 → 重排列表
- 键盘快捷键 → 触发操作面板
- 右键菜单 → 上下文操作
- Resize 窗口 → 响应式布局变化

**穷尽式探查** = 构建状态流图（State-Flow Graph）：

```
State₀ (初始页面)
  │── click "新建" ──→ State₁ (弹出表单 Modal)
  │                      │── fill 表单 → State₁ₐ (提交按钮启用)
  │                      │── click 关闭 → State₀ (回到初始)
  │── click Tab₂ ────→ State₂ (Tab₂ 面板)
  │                      │── click Tab₂内按钮 → State₂ₐ (子状态)
  │── hover 头像 ────→ State₃ (用户菜单展开)
  │                      │── click 菜单项 → State₃ₐ (设置页/子面板)
  │── scroll ────────→ State₄ (加载更多内容)
  │── contextmenu 行 ─→ State₅ (右键菜单)
  │── dblclick 单元格 → State₆ (行内编辑)
  │── keyboard Ctrl+K → State₇ (命令面板)
  ...
```

---

## 三种探查模式

| 模式 | 触发方 | 目标 | 深度 |
|------|--------|------|------|
| **full** | `/qa-explore` | 穷尽发现所有可交互元素和状态 | 递归探查所有交互，无深度限制 |
| **targeted** | `/qa-from-issue` | 以 issue 相关区域为起点，递归探查所有关联状态 | 从目标区域出发，递归探查所有可达状态 |
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
      // 广覆盖选择器：覆盖所有可交互元素类型
      const interactives = Array.from(container.querySelectorAll(
        'button, [role="button"], a[href], input, textarea, select, ' +
        '[role="tab"], [role="menuitem"], [role="option"], [role="switch"], ' +
        '[role="checkbox"], [role="radio"], [role="slider"], [role="spinbutton"], ' +
        '[role="treeitem"], [role="gridcell"], [role="link"], [role="searchbox"], ' +
        '[role="combobox"], [role="listbox"], ' +
        '[contenteditable="true"], [draggable="true"], ' +
        '[onclick], [onchange], [onkeydown], [onkeyup], [ondblclick], [oncontextmenu], ' +
        '[data-testid], [data-action], [data-toggle], [data-target], [data-bs-toggle], ' +
        '[tabindex]:not([tabindex="-1"]), ' +
        'summary, details, label[for]'
      )).map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        testId: el.dataset?.testid,
        ariaLabel: el.getAttribute('aria-label'),
        ariaDescribedby: el.getAttribute('aria-describedby'),
        ariaControls: el.getAttribute('aria-controls'),
        placeholder: el.getAttribute('placeholder'),
        text: el.textContent?.trim().substring(0, 200),
        title: el.getAttribute('title'),
        href: el.getAttribute('href'),
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        required: el.required || el.getAttribute('aria-required') === 'true',
        readOnly: el.readOnly || el.getAttribute('aria-readonly') === 'true',
        maxLength: el.getAttribute('maxlength'),
        checked: el.checked ?? (el.getAttribute('aria-checked') === 'true'),
        selected: el.selected ?? (el.getAttribute('aria-selected') === 'true'),
        expanded: el.getAttribute('aria-expanded'),
        hasPopup: el.getAttribute('aria-haspopup'),
        draggable: el.getAttribute('draggable'),
        tabIndex: el.getAttribute('tabindex'),
        class: el.className?.toString().substring(0, 200),
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

    // 分区域扫描（广覆盖：标准语义区域 + 常见 UI 框架布局）
    const nav = document.querySelector('nav, [role="navigation"]');
    const sidebar = document.querySelector('aside, [role="complementary"], [class*="sidebar"], [class*="side-panel"]');
    const main = document.querySelector('main, [role="main"]') || root;
    const footer = document.querySelector('footer, [role="contentinfo"]');
    const header = document.querySelector('header, [role="banner"]');
    const toolbar = document.querySelector('[role="toolbar"]');

    const regions = {};
    if (header) regions.header = scanRegion(header, 'header');
    if (nav) regions.nav = scanRegion(nav, 'nav');
    if (toolbar) regions.toolbar = scanRegion(toolbar, 'toolbar');
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

### 核心算法：优先级驱动 BFS + 状态等价判定

```
已知状态集 = { State₀ }
优先级队列 = PriorityQueue(State₀ 中所有可交互元素，按优先级排序)
状态流图 = { nodes: [State₀], edges: [] }
覆盖率追踪 = { 已交互元素数: 0, 总可交互元素数: N }

while (优先级队列不为空 && 未达到终止条件) {
  element = 优先级队列.pop()  // 取最高优先级

  // 1. 仅排除真正破坏性操作
  if (element 是破坏性操作) → 记录到 baseline.destructiveActions，继续下一个

  // 2. 执行交互（根据元素类型选择交互方式）
  interact(element)  // click / hover / fill / dblclick / contextmenu / keyboard

  // 3. 等待 DOM 稳定
  waitForStable()

  // 4. 重新扫描 DOM
  newState = scanDOM()

  // 5. 状态等价判定
  equivalentState = findEquivalent(newState, 已知状态集)
  if (!equivalentState) {
    已知状态集.add(newState)
    状态流图.addEdge(currentState, element, newState)
    优先级队列.push(...newState 中的新元素)  // 递归发现的新元素也进入队列
  } else {
    状态流图.addEdge(currentState, element, equivalentState)  // 记录边，不重复探查
  }

  // 6. 更新覆盖率
  覆盖率追踪.已交互元素数++

  // 7. 回退到探查前状态
  backtrack()
}
```

### Step 1 — 识别可交互元素并分级

从 Phase 2 的 DOM 扫描结果中，按**探查优先级**和**操作类型**分级：

**优先级分级（决定探查顺序）：**

| 优先级 | 元素特征 | 原因 |
|--------|----------|------|
| P0 最高 | `aria-haspopup`、`aria-expanded="false"`、`role="tab"`(未选中) | 最可能揭示隐藏状态 |
| P1 高 | `role="menuitem"`、`role="treeitem"`、导航链接（站内） | 可能通向新页面/区域 |
| P2 中 | `button`、`a[href]`（站内）、`input`、`select` | 常规交互 |
| P3 低 | tooltip 触发器、纯视觉 hover 效果 | 状态变化小但仍需记录 |

**操作类型分级（决定怎么交互）：**

| 类型 | 判定条件 | 处理 |
|------|----------|------|
| 探查 | Tab 切换、手风琴展开、hover 菜单、详情查看、树节点展开 | 直接交互，记录新状态 |
| 探查+回退 | 表单填写（未提交）、checkbox toggle、搜索框输入、排序切换 | 交互 → 记录 → 回退 |
| 探查+回退 | 站内导航链接、路由跳转按钮 | 交互 → 记录目标页面状态 → 返回（browser back） |
| 探查+回退 | 提交表单(POST)、创建/编辑操作 | 填写表单探查字段约束，但**不点提交**，记录表单结构 |
| 仅记录 | 删除、登出、关闭账号、不可逆操作 | **不执行**，记录到 destructiveActions |
| 仅记录 | 外部链接（跨域） | **不执行**，记录 href 到 externalLinks |

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
  2. 如果有分页 → 翻阅前 3 页，记录每页的内容结构和分页状态变化
  3. 滚动到底部 → 检测是否有新内容加载（IntersectionObserver / scroll 事件）
  4. 如果是无限滚动 → 连续滚动 3 次，记录每次加载的新内容结构
  5. 记录加载模式（分页/无限滚动/虚拟滚动/静态）
  6. 检测虚拟滚动（只渲染可视区域的行）→ 记录 viewport 内元素和总数据量
```

#### G. 右键菜单

```
对可能有右键菜单的元素（表格行、文件卡片、列表项、画布元素）：
  1. evaluate_script 触发 contextmenu 事件
  2. 检测是否有 [role="menu"] 出现
  3. 扫描所有菜单项，包括子菜单（hover menuitem 检测子菜单展开）
  4. press Escape 关闭
```

#### H. 拖拽交互（Drag & Drop）

```
发现 [draggable="true"] 或 sortable 容器（含 data-sortable、class 含 sortable/draggable）：
  1. 记录所有可拖拽元素及其容器
  2. 记录 drop zone（[data-droppable]、接受 drop 的区域）
  3. 不执行实际拖拽（避免改变数据顺序），但记录拖拽交互的完整结构
```

#### I. 键盘快捷键探查

```
检测应用级键盘快捷键：
  1. evaluate_script 检查是否有全局 keydown/keyup 事件监听器
  2. 查找页面中的快捷键提示（tooltip 中的 Ctrl+X 标注、快捷键帮助面板）
  3. 尝试常见快捷键：Ctrl+K（命令面板）、?（帮助）、/（搜索）、Escape
  4. 记录每个快捷键触发的状态变化
```

```
mcp__chrome-devtools__press_key  key="/"
mcp__chrome-devtools__evaluate_script
  function: () => {
    const searchBox = document.querySelector('[role="searchbox"]:focus, input[type="search"]:focus, [role="combobox"]:focus');
    return searchBox ? { triggered: true, element: searchBox.tagName, role: searchBox.getAttribute('role') } : { triggered: false };
  }
```

#### J. 双击交互

```
对可能支持双击的元素（表格单元格、列表项、文本区域）：
  1. evaluate_script 检查元素是否有 dblclick 事件监听
  2. 在安全元素上执行 dblclick
  3. 检测是否进入编辑模式（出现 input/contenteditable）
  4. press Escape 退出编辑模式
```

#### K. 树形结构（Tree View）

```
发现 role="tree" 或 role="treeitem"：
  1. 展开所有折叠的 treeitem（aria-expanded="false"）
  2. 记录完整的树结构层级
  3. 递归展开子节点，直到所有层级可见
  4. 逐个收起恢复原状
```

#### L. Shadow DOM 和 Web Components

```
检测 Shadow DOM：
  1. evaluate_script 遍历所有元素，检查 el.shadowRoot
  2. 对有 shadowRoot 的元素，进入 shadow DOM 扫描可交互元素
  3. 记录 shadow host 和内部元素的对应关系
```

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const shadowHosts = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        const interactives = el.shadowRoot.querySelectorAll('button, input, a, [role]');
        shadowHosts.push({
          host: { tag: el.tagName, class: el.className?.toString().substring(0, 100) },
          shadowElements: Array.from(interactives).map(s => ({
            tag: s.tagName, role: s.getAttribute('role'), text: s.textContent?.trim().substring(0, 100)
          }))
        });
      }
    });
    return shadowHosts;
  }
```

#### M. iframe 探查

```
检测页面中的 iframe：
  1. 列出所有 iframe 及其 src
  2. 对同源 iframe，进入其 document 执行 DOM 扫描
  3. 对跨域 iframe，仅记录 src 和尺寸信息
  4. 将 iframe 内发现的元素标记来源为 iframe
```

#### N. Toast / Notification / Snackbar

```
这类元素是瞬态的，需要在交互后立即检测：
  1. 每次交互后，检查是否有新出现的 [role="alert"]、[role="status"]、.toast、.notification、.snackbar
  2. 记录 toast 的文本内容、类型（success/error/warning）、自动消失时间
  3. 这些信息对断言生成至关重要
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

### Step 5 — 状态等价判定

每次交互后扫描得到新 DOM 状态，需要判断是否与已知状态等价：

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    // 提取页面状态指纹：可交互元素集合 + 对话框状态 + URL
    const interactives = Array.from(document.querySelectorAll(
      'button, [role="button"], a[href], input, textarea, select, [role="tab"], [role="menuitem"], [role="dialog"]'
    )).map(el => {
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const name = el.getAttribute('aria-label') || el.getAttribute('name') || el.textContent?.trim().substring(0, 50);
      return `${role}:${name}`;
    }).sort().join('|');

    const dialogs = document.querySelectorAll('[role="dialog"]:not([hidden]), [aria-modal="true"]');
    const openDialogCount = Array.from(dialogs).filter(d => d.offsetParent !== null).length;

    return {
      fingerprint: interactives,
      url: location.href,
      openDialogs: openDialogCount,
      hash: btoa(interactives).substring(0, 32)  // 简化指纹用于快速比对
    };
  }
```

等价判定规则：
1. URL 不同 → 一定是不同状态
2. URL 相同 + dialog 数量不同 → 不同状态
3. URL 相同 + dialog 相同 + 元素指纹 hash 一致 → 等价状态（跳过重复探查）
4. 指纹相似度 > 90% → 可能等价，用完整指纹做精确比对

### Step 6 — 回退策略

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

  "destructiveActions": [
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

  "shadowDom": [
    { "host": { "tag": "MY-COMPONENT", "class": "widget" }, "shadowElements": [...] }
  ],

  "iframes": [
    { "src": "https://...", "sameOrigin": false, "dimensions": { "w": 600, "h": 400 } }
  ],

  "keyboardShortcuts": [
    { "key": "Ctrl+K", "action": "opens command palette", "stateTransition": "S0 → S8" }
  ],

  "dragTargets": [
    { "draggable": "task-card", "dropZones": ["column-todo", "column-done"] }
  ],

  "summary": {
    "totalStates": 12,
    "totalInteractives": 234,
    "totalForms": 4,
    "totalDestructiveActions": 3,
    "coveredPatterns": ["tabs", "modal", "dropdown", "form", "tree", "contextmenu", "dblclick", "keyboard-shortcut", "drag", "infinite-scroll"],
    "scrollMode": "pagination",
    "hasShadowDom": true,
    "hasIframes": false,
    "coverageRate": 0.95
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

1. **起点聚焦**：调用方传入 `targetArea`（CSS selector 或文本描述），以该区域为探查起点
2. **递归探查**：从目标区域出发，递归探查所有可达状态（点击 → 发现新状态 → 扫描新元素 → 继续探查），不设人为深度限制
3. **上下文保留**：Phase 2 正常扫描全页（用于理解页面结构和导航关系），Phase 3 从 targetArea 开始递归探查
4. **关联发现**：如果目标区域的交互导致其他区域变化（如点击按钮后 sidebar 更新），也要跟踪并记录这些关联状态

```
// 调用示例（qa-from-issue 传入）
mode: "targeted"
targetArea: "button:下载"  // 或 CSS selector ".download-section"
reproSteps: ["点击下载按钮", "选择格式", "确认下载"]
```

执行时：
1. Phase 2 正常扫描全页 → 理解完整页面结构
2. Phase 3 从 targetArea 开始，递归探查所有可达状态
3. 如果 `reproSteps` 存在 → 先按步骤逐步操作并记录每步状态变化，然后继续探查步骤中发现的新元素
4. 关注目标区域交互对其他区域的连锁影响（如表单提交后列表刷新）

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

探查在满足以下**任一**条件时终止：

| 条件 | 说明 |
|------|------|
| **覆盖率饱和** | 连续 10 次交互未发现新状态或新元素（所有交互都导向已知状态） |
| **队列清空** | 优先级队列为空，所有可交互元素已处理 |
| **时间上限** | 单页面探查超过 2 小时（full 模式）或 1 小时（targeted 模式） |

**注意：不设 MAX_STATES 硬限制。** 状态数量由页面复杂度决定，不人为截断。通过状态等价判定自然收敛，避免重复探查。

探查结束时，在 baseline 的 `explorationStats` 中记录终止原因：
```json
"explorationStats": {
  "terminationReason": "coverage_saturated | queue_empty | timeout",
  "statesDiscovered": 12,
  "interactionsPerformed": 87,
  "elementsFound": 234,
  "coverageRate": 0.95,
  "duration": "23m"
}
```

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
