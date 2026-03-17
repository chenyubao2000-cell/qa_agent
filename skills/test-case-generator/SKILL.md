---
name: Test Case Generator from User Stories
description: Automatically generate comprehensive test cases from user stories and acceptance criteria using BDD patterns, equivalence partitioning, and risk-based prioritization
version: 1.0.0
author: Pramod
allowed_tools: [Read, Write, Bash, Grep, Glob]
license: MIT
testingTypes: [bdd, tdd]
frameworks: [cucumber]
languages: [typescript, javascript, python, java]
domains: [web, api]
agents: [claude-code, cursor, github-copilot, windsurf, codex, aider, continue, cline, zed, bolt, gemini-cli, amp]
---

# Test Case Generator from User Stories Skill

You are an expert QA engineer specializing in systematic test case generation from user stories and acceptance criteria. When the user asks you to generate test cases, create Gherkin scenarios, derive equivalence classes, or build traceability matrices from requirements, follow these detailed instructions to produce comprehensive, prioritized, and traceable test suites.

## Supported Input Sources

Before generating test cases, identify which input type(s) the user has provided and apply the corresponding extraction process:

| Input Type | How to recognize | Extraction approach |
|---|---|---|
| User story text | "As a... I want... So that..." | Parse directly per Core Principles |
| Word / plain-text requirements | Numbered lists, "shall/must/should" statements, pasted prose | Convert to user stories first (see below) |
| Markdown requirements doc | `.md` file path or pasted Markdown with headings/tables/checklists | Parse Markdown structure to extract stories (see below) |
| Figma via MCP | User provides a Figma file URL or node ID, Figma MCP tools are available | Call Figma MCP tools to extract design data (see below) |
| Pencil via MCP | User provides a Pencil project file path, Pencil MCP tools are available | Call Pencil MCP tools to extract screens and components (see below) |
| MD + Figma/Pencil（对齐模式） | 同时提供 `.md` 需求文档和 Figma URL / Pencil 文件 | **先对齐再生成**，见「需求与设计对齐」章节 |
| **Chrome CDP 实时页面** | 用户指定目标页面（无需求文档），Chrome 正在运行 | **先通过 CDP 探查真实 DOM，再推断故事**，见「从 Chrome CDP 实时页面生成用例」章节 |
| Mixed | 其他任意组合 | 分别提取后合并去重 |

---

## 需求与设计对齐（MD × Figma/Pencil）

当用户**同时**提供 Markdown 需求文档和 Figma/Pencil 设计稿时，**不要**分别独立生成测试用例。必须先执行对齐流程，将两侧信息合并为统一的测试规格，再生成用例。

> MD 提供「做什么、为什么、业务规则」；设计稿提供「怎么做、用什么 UI、有哪些交互状态」。两者缺一不可——单独哪一份都不完整。

### 第一步 — 分别提取，建立索引

**从 MD 提取需求索引**（按各自章节规则处理后）：

```
RequirementIndex = [
  {
    reqId:    "FR-2.1",
    section:  "用户登录",          // 来自 ## 标题
    keywords: ["登录", "邮箱", "密码", "验证"],
    rules:    ["邮箱格式校验", "连续失败5次锁定"],
    criteria: ["Given ... When ... Then ..."]
  },
  ...
]
```

**从 Figma/Pencil 提取设计索引**：

```
DesignIndex = [
  {
    screenId:   "Frame:Login",
    screenName: "登录页",
    keywords:   ["登录", "邮箱", "密码", "Sign in"],
    elements: [
      { role: "textbox", name: "邮箱", required: true, placeholder: "you@example.com" },
      { role: "textbox", name: "密码", required: true, maxLength: 64 },
      { role: "button",  name: "登录", disabled: true }
    ],
    flows: [
      { trigger: "点击登录（表单有效）", destination: "Frame:Dashboard" },
      { trigger: "点击登录（表单无效）", destination: "Frame:Login（错误态）" }
    ],
    states: ["默认", "加载中", "错误态", "锁定态"]
  },
  ...
]
```

### 第二步 — 双向匹配

对 RequirementIndex 和 DesignIndex 执行匹配，匹配策略按优先级：

1. **精确 ID 映射**：设计稿 Frame/Page 名称中含有需求 ID（如 Frame 命名为 "FR-2 登录"）→ 直接绑定
2. **章节标题 ↔ 页面名称**：对 `section` 和 `screenName` 做相似度匹配（忽略大小写、忽略空格、支持中英文对照）
3. **关键词交集**：`keywords` 交集数量 ≥ 2 → 视为候选匹配，列出供确认
4. **流程衔接**：设计稿中某页面是另一页面跳转的目标 → 该目标页面的需求归属于触发页面的故事

匹配结果分三类：

| 类型 | 说明 | 处理方式 |
|---|---|---|
| ✅ 完全匹配 | MD 需求 + 设计页面一一对应 | 合并为统一故事，正常生成用例 |
| ⚠️ 需求缺设计 | MD 有需求，设计稿无对应页面/组件 | 标记 `[DESIGN MISSING]`，生成骨架用例，提醒用户补充设计 |
| ⚠️ 设计缺需求 | 设计稿有页面/交互，MD 无对应需求 | 标记 `[REQUIREMENT MISSING]`，从设计推断需求并标注 `[inferred]`，提醒用户确认 |

### 第三步 — 合并为统一测试规格

对每个完全匹配的对，将 MD 需求和设计数据合并为一个 `UnifiedSpec`：

```
UnifiedSpec = {
  id:          "US-LOGIN-01",
  source: {
    reqId:       "FR-2.1",               // 来自 MD
    screenId:    "Frame:Login",          // 来自设计稿
  },

  // 来自 MD —— 业务层
  narrative: {
    actor:   "已注册用户",
    action:  "使用邮箱和密码登录",
    benefit: "访问个人主页"
  },
  businessRules: [
    "邮箱必须符合格式",
    "连续失败 5 次锁定账号"
  ],

  // 来自设计稿 —— 实现层
  uiElements: [
    { role: "textbox", name: "邮箱",  required: true, placeholder: "you@example.com" },
    { role: "textbox", name: "密码",  required: true, maxLength: 64 },
    { role: "button",  name: "登录",  disabledWhen: "表单未填写完整" }
  ],
  flows: [
    { from: "登录页", via: "点击登录（有效）", to: "首页" },
    { from: "登录页", via: "点击登录（无效）", to: "登录页（错误态）" }
  ],
  states: ["默认", "加载中", "错误态", "锁定态"],

  // 对齐阶段补充的冲突检测
  conflicts: [
    // MD 要求「密码最少8位」，但设计稿输入框无 minLength 属性 → 提醒设计缺失约束展示
  ]
}
```

### 第四步 — 从 UnifiedSpec 生成用例

基于合并后的规格，每条用例**同时包含**：
- **业务验证点**（来自 MD 的 business rules 和 criteria）
- **UI 交互步骤**（来自设计稿的 uiElements 和 flows）
- **视觉状态断言**（来自设计稿的 states）

**生成规则：**

1. 对每个 `flow` 生成正向场景，结合 MD 的 `criteria` 验证业务结果
2. 对每条 `businessRule` 生成负向场景，结合设计稿的错误态确认错误 UI 表现
3. 对每个 `uiElement` 的约束（required、maxLength、disabled 条件）生成边界/等价类测试，用 MD 的规则说明「为什么」
4. 对每个设计 `state` 生成状态渲染测试，确认 MD 需求在该状态下的业务逻辑正确

**示例：**

```
MD 需求：
  FR-2.1 登录表单提交前必须校验邮箱格式
  FR-2.2 连续失败 5 次后锁定账号 30 分钟

设计稿：
  Frame:Login
    textbox "邮箱"（required, placeholder）
    textbox "密码"（required）
    button "登录"（disabled when 表单空）
    state "错误态"：显示红色提示文字
    state "锁定态"：按钮变灰，显示倒计时

合并生成的用例（含业务 + UI）：

  TC-001 [正向] 有效邮箱和密码登录成功
    Given 用户在登录页（Frame:Login 默认态）
    When  在「邮箱」输入框填入 "user@example.com"
    And   在「密码」输入框填入有效密码
    And   点击「登录」按钮
    Then  跳转到首页（FR-2.1 通过）

  TC-002 [负向 × 设计态] 邮箱格式无效时显示错误态
    Given 用户在登录页
    When  在「邮箱」输入框填入 "notanemail"
    And   点击「登录」按钮
    Then  页面呈现「错误态」（FR-2.1）
    And   邮箱输入框下方显示红色格式提示文字（设计稿 error state）

  TC-003 [负向 × 边界] 连续失败第5次后触发锁定态
    Given 用户已连续失败登录 4 次
    When  第 5 次输入错误密码并提交
    Then  页面呈现「锁定态」（FR-2.2）
    And   登录按钮变灰不可点击（设计稿 locked state）
    And   显示 30 分钟倒计时（FR-2.2 业务规则）
```

### 第五步 — 输出对齐报告

在生成用例前，先输出一份对齐摘要供用户确认：

```
## 对齐结果摘要

✅ 完全匹配：3 组
  - FR-2（用户登录）↔ Frame:Login
  - FR-3（注册）↔ Frame:Register
  - FR-5（密码重置）↔ Frame:ResetPassword

⚠️ 需求缺设计：1 条
  - FR-4（单点登录 SSO）→ 设计稿中未找到对应页面，将生成骨架用例 [DESIGN MISSING]

⚠️ 设计缺需求：1 个页面
  - Frame:OnboardingGuide → MD 中无对应需求，已从设计推断 [REQUIREMENT MISSING]，请确认

⚠️ 冲突：1 处
  - FR-2.1 要求密码最少 8 位，但 Frame:Login 的密码输入框无 minLength 提示，建议设计补充

确认后开始生成测试用例？
```

---

## Extracting Requirements from Word / Plain-Text Documents

When the user pastes text from a Word document or shares a `.docx`/`.txt` requirement document, follow these steps **before** generating test cases:

1. **Detect requirement statements** -- Scan for sentences containing "shall", "must", "should", "will", "is required to". Each statement is a candidate acceptance criterion.
2. **Group by feature** -- Use section headings, numbered prefixes (e.g. FR-1, UC-03), or topic clusters to group related requirements into a single user story.
3. **Synthesize the user story narrative** -- Infer the actor (who benefits), the action (what the system does), and the benefit (why). If the document doesn't state them explicitly, make a reasonable assumption and note it.
4. **Map statements to acceptance criteria** -- Each "shall/must" statement becomes one `Given / When / Then` criterion. Optional "should" statements become lower-priority criteria.
5. **Preserve IDs** -- If the document already has requirement IDs (e.g. FR-1.3), keep them as the `criterionId` in the traceability matrix.
6. **Flag ambiguities** -- If a requirement is vague ("the system should respond quickly"), flag it with `[AMBIGUOUS]` and generate a test case with a placeholder threshold (e.g. < 3s) while asking the user to confirm.

**Example conversion:**

```
Word text:
  FR-2.1 The login form shall validate email format before submission.
  FR-2.2 The system shall lock the account after 5 consecutive failed login attempts.

Converted user story:
  As a registered user
  I want my login credentials validated before submission
  So that I receive immediate feedback on input errors

  AC-FR-2.1: Given I am on the login page, When I enter an invalid email format, Then I see a format validation error
  AC-FR-2.2: Given I have failed login 4 times, When I fail once more, Then my account is locked and I see a lockout message
```

---

## Extracting Requirements from Markdown Requirement Documents

When the user provides a `.md` file path or pastes Markdown content, read the file (if a path) then parse its structure **before** generating test cases.

If a file path is given, read it first:
```
Read({ file_path: "/path/to/requirements.md" })
```

### Step 1 — Map Markdown structure to requirement types

| Markdown element | Requirement role | Action |
|---|---|---|
| `# Heading` / `## Heading` | Feature / module boundary | Start a new user story group |
| `### Heading` | Sub-feature or individual user story | Become the story title |
| `> blockquote` | Story narrative hint | Parse "As a / I want / So that" if present |
| `- [ ] checklist item` | Acceptance criterion (not yet done) | Convert to `Given/When/Then` |
| `- [x] checklist item` | Already-implemented criterion | Include with tag `@existing` |
| Numbered list `1.` under a heading | Ordered acceptance criteria | Convert each to one criterion |
| `**bold text**` in a list item | Business rule or constraint | Extract as a rule within the criterion |
| `| table |` | Scenario outline data / enumerated values | Convert to `Scenario Outline` with `Examples` table |
| `> NOTE:` / `> ⚠️` / `> 💡` annotations | Clarification or constraint | Treat as implicit requirement or ambiguity flag |
| Code fences ` ```  ``` ` | API contract / data schema / example payload | Extract field names and types as input parameters for equivalence partitioning |

### Step 2 — Reconstruct user story narratives

Markdown docs often omit the "As a / I want / So that" format. Reconstruct it:
- **Actor**: infer from the section heading (e.g. "## Admin Panel" → actor = admin user)
- **Action**: infer from the heading verb or the first list item
- **Benefit**: infer from any "so that", "in order to", or "goal:" text; otherwise leave as `[inferred]` and note it

### Step 3 — Handle common Markdown requirement patterns

**Pattern A — Checklist-style AC:**
```markdown
## User Login
- [ ] User can log in with email and password
- [ ] Show error if credentials are invalid
- [ ] Lock account after 5 failed attempts
```
→ Each `- [ ]` becomes one `Given/When/Then` criterion under story "User Login".

**Pattern B — Table-driven scenarios:**
```markdown
| Input         | Expected Result      |
|---------------|----------------------|
| valid email   | proceeds to password |
| missing @     | shows format error   |
| empty field   | shows required error |
```
→ Convert to a `Scenario Outline` with the table rows as `Examples`.

**Pattern C — Nested rules:**
```markdown
### Password Reset
- User requests a reset link
  - **Email must be registered**
  - **Link expires in 30 minutes**
  - **Link is single-use**
```
→ Top-level item = trigger (`When`); nested bold items = business rules appended as `And` steps.

**Pattern D — Mixed narrative + criteria:**
```markdown
## Checkout Flow
As a shopper I want to complete a purchase so that I receive my items.

### Acceptance Criteria
1. Cart must not be empty before proceeding
2. Payment details must be validated before order creation
3. Confirmation email sent within 60 seconds of order
```
→ Parse the narrative directly; numbered list → three acceptance criteria.

### Step 4 — Extract implicit tests from Markdown metadata

- Headings tagged `@wip`, `@draft`, `@tbd` → flag as `[AMBIGUOUS]`, generate skeleton test with TODO
- Items tagged `@P0`/`@P1`/`@critical` → set matching priority in traceability matrix
- Links to other `.md` files (`[see auth spec](auth.md)`) → offer to read linked file and merge requirements
- Code fences with JSON/YAML schemas → extract field names, types, and `required` arrays as input parameters for equivalence class generation

### Example

```markdown
## Password Reset

As a registered user I want to reset my forgotten password so that I can regain account access.

### Acceptance Criteria
- [ ] Reset link is sent to registered email within 2 minutes
- [ ] **Link expires after 30 minutes**
- [ ] Link can only be used once
- [ ] Unregistered email shows generic message (no account reveal)

> ⚠️ Rate-limit: max 3 reset requests per hour per email
```

Generated criteria:
  AC-1: Given I request a reset, When I check my inbox, Then I receive a link within 2 minutes
  AC-2: Given a link older than 30 minutes, When I click it, Then I see an "expired" error
  AC-3: Given I have used a reset link, When I click it again, Then I see a "used" error
  AC-4: Given the email is not registered, When I request a reset, Then I see a generic success message
  AC-5 [implicit from annotation]: Given I request reset 3 times in an hour, When I try a 4th, Then I am rate-limited

---

## Extracting Requirements from Figma via MCP

When the user provides a Figma file URL or node ID and the Figma MCP server is available, use MCP tools to pull structured design data — do **not** ask for a screenshot.

### Step 1 — Resolve the file and target nodes

Parse the user's input to extract `fileKey` and optional `nodeId` from the Figma URL:
```
https://www.figma.com/file/{fileKey}/...?node-id={nodeId}
```

Then call:
```
mcp__figma__get_file({ fileKey })                        // full document tree
mcp__figma__get_file_nodes({ fileKey, ids: [nodeId] })   // specific frame/component
mcp__figma__get_images({ fileKey, ids: [nodeId] })       // rendered preview (optional, for context)
```

### Step 2 — Walk the node tree and classify elements

Traverse the returned JSON node tree. For each node, map its `type` to a UI role:

| Figma node type | UI role | Test implications |
|---|---|---|
| `TEXT` with name containing "label", "hint", "placeholder" | Input label / placeholder | Test label presence, placeholder disappears on focus |
| `INSTANCE` of a component named "Button", "CTA" | Button | Test enabled/disabled states, click triggers action |
| `INSTANCE` named "Input", "TextField", "TextArea" | Form input | Test valid/invalid/boundary values, required flag |
| `INSTANCE` named "Checkbox", "Radio", "Toggle" | Selection control | Test checked/unchecked states |
| `INSTANCE` named "Dropdown", "Select", "Combobox" | Dropdown | Test option selection, default value, empty state |
| `INSTANCE` named "Error", "Alert", "Toast", "Banner" | Feedback | Test trigger condition, message content, dismissal |
| `FRAME` or `COMPONENT` at top level | Screen / page | Represents one user-facing view to derive a story from |
| `VECTOR` / `BOOLEAN_OPERATION` with fill color red/amber/green | Status indicator | Test each status state is reached under correct condition |

Also extract:
- **`characters`** on TEXT nodes → button labels, field labels, error message text, placeholder text
- **`componentProperties`** → look for `disabled`, `error`, `required`, `variant` props to enumerate states
- **`interactions`** (prototype connections) → map trigger → destination frame as user flow steps

### Step 3 — Derive user stories from frames and flows

For each top-level FRAME (screen), create one user story:
```
As a [actor inferred from frame name or annotation]
I want to [action implied by the dominant interactive component cluster]
So that [benefit implied by the screen's purpose]
```

For each interactive element and its states, write acceptance criteria:
```
Given [frame name / precondition from prototype flow]
When [user action on the element — derived from interaction trigger]
Then [expected outcome — derived from destination frame or component variant]
```

### Step 4 — Extract implicit test cases from design tokens and properties

- `componentProperties.required = true` → generate a test: submit with this field empty, expect error
- `componentProperties.disabled = true` → generate a test: verify the enabling condition from the flow
- `componentProperties.maxLength` or `characters` showing a counter → generate boundary tests
- Prototype connections with trigger `ON_HOVER` → generate tooltip / hover state tests
- Multiple variants of the same component (e.g. Button/Primary, Button/Disabled, Button/Loading) → generate one test per variant
- Color styles named "error", "warning", "success" applied to a node → generate a test that each state renders

### Example

```
Figma node data (simplified):
  FRAME "Registration"
    INSTANCE "TextField" { label: "Email", required: true, placeholder: "you@example.com" }
    INSTANCE "TextField" { label: "Password", required: true, maxLength: 64 }
    INSTANCE "PasswordStrengthMeter" { variants: ["weak","fair","strong"] }
    INSTANCE "Button/Primary" { label: "Register", disabled: true }
  Prototype: "Registration" → ON_CLICK "Register" → "Dashboard" (condition: form valid)

Generated stories and criteria:
  US-D1: User registration
  AC-D1-1: Given the form is empty, Then the Register button is disabled
  AC-D1-2: Given all required fields are valid, Then Register becomes enabled
  AC-D1-3: Given Email field is empty, When I submit, Then I see a required-field error on Email
  AC-D1-4: Given Password length = 65, When I submit, Then I see a max-length validation error
  AC-D1-5: Given a weak password is entered, Then the strength meter shows "weak"
  AC-D1-6: Given a strong password is entered, Then the strength meter shows "strong"
  AC-D1-7: Given the form is valid, When I click Register, Then I am redirected to Dashboard
```

---

## Extracting Requirements from Pencil via MCP

When the user provides a Pencil project file (`.ep` or `.epz`) and the Pencil MCP server is available, use MCP tools to pull screen and component data.

### Step 1 — Open the project and list pages

```
mcp__pencil__open_project({ filePath })   // open the .ep/.epz file
mcp__pencil__list_pages()                 // get all pages (screens)
```

### Step 2 — Extract shapes per page

For each page, call:
```
mcp__pencil__get_page_shapes({ pageId })
```

Map Pencil shape types to UI roles:

| Pencil shape / stencil | UI role | Test implications |
|---|---|---|
| `Input Box`, `Single-line Input` | Text input | Test valid/invalid/boundary, required |
| `Multiline Input`, `Text Area` | Textarea | Test length constraints |
| `Button`, `PushButton` | Button | Test enabled/disabled, click action |
| `Checkbox` | Checkbox | Test checked/unchecked state |
| `Radio Button` | Radio | Test selection, mutual exclusivity |
| `Combobox`, `Drop-down List` | Dropdown | Test option selection, default |
| `Label` with `*` suffix | Required field marker | Test empty submission |
| `Note`, `Callout` | Design annotation | Read as acceptance criterion hint |
| `Link` | Navigation | Test navigation target, active/visited states |

Also extract:
- **Shape label / `textContent`** → button labels, field labels, error text
- **Shape notes / annotations** → designers often write business rules here; treat each note as a candidate acceptance criterion
- **Page names** → use as the frame/screen identifier for the user story narrative
- **Page-to-page links** (navigation arrows) → trace as user flows between screens

### Step 3 — Derive stories and criteria (same as Figma Step 3)

Apply the same derivation rules as the Figma MCP section above, substituting Pencil shape data for Figma node data.

### Step 4 — Extract implicit tests from Pencil annotations

- Shape notes containing "must", "should", "shall" → treat as direct acceptance criteria
- Shapes with a red border or fill → error/validation state; generate a test to trigger it
- Greyed-out / low-opacity shapes → disabled state; generate a test for the enabling condition
- Repeated similar shapes across pages → same component in different states; enumerate each as a test case

---

## 从 Chrome CDP 实时页面生成用例（无需求文档模式）

> **适用场景**：用户没有提供任何需求文档（无 `.md`、无 Figma、无 Pencil），但 Chrome 浏览器正在运行并已打开目标页面。此时通过 CDP 探查真实 DOM，推断出可测试的用户故事，再走标准用例生成流程。

> ⚠️ **场景隔离原则**：此模式与需求文档驱动模式**互相独立**，绝不混用。需求文档模式的输出以业务规则为核心；CDP 模式的输出以真实 UI 交互为核心。两种模式产生的产物（feature 文件、handoff）均带有明确标注，方便区分来源。

### 触发条件判断

| 用户输入 | 模式 |
|---|---|
| 提供了 `.md` / Figma / Pencil | **需求文档驱动**，不进入此章节 |
| 说「帮我给这个页面生成用例」「看一下这个页面能测什么」，无需求文档 | **CDP 实时页面模式** ← 本章节 |
| 两者都提供 | 先走需求文档，CDP 仅用于验证 locator，不用于推断故事 |

---

### 第一步 — 列出 Chrome 目标页面

```
mcp__chrome-devtools__list_pages
```

输出所有打开的 tab 及其 pageId。请用户确认要检查哪个 tab（或根据 URL/title 自动匹配）。

选中目标页面：
```
mcp__chrome-devtools__select_page  pageId=<id>
```

---

### 第二步 — 三层 DOM 探查

> **探查优先级：DOM (evaluate_script) > Snapshot (a11y tree) > Screenshot (视觉辅助)**
> DOM 层面的 data-testid、CSS class 是语言无关的，避免 headless 中英文差异导致 locator 不匹配。

按以下顺序执行，**不要跳步**：

**① DOM 探查 — 提取语言无关的 locator 信息（首选）**

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    // 只查 main 区域，避免 sidebar 噪音
    const root = document.querySelector('main') || document.body;
    const els = root.querySelectorAll('[data-testid], button, input, select, a, [role]');
    return Array.from(els).slice(0, 80).map(el => ({
      tag: el.tagName,
      testId: el.dataset?.testid,
      class: el.className?.toString().substring(0, 80),
      type: el.getAttribute('type'),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      required: el.required,
      text: el.textContent?.trim().substring(0, 60)
    }));
  }
```

从 DOM 输出中提取：
- 所有 `data-testid` → 首选 locator，语言无关
- 所有 `button / input / select / a` 的 class、属性
- 有 `disabled` 属性的元素 → 生成「启用条件」测试
- 有 `required` 属性的元素 → 生成「空提交」测试

**② Accessibility Tree — 理解页面结构和元素关系**

```
mcp__chrome-devtools__take_snapshot
```

从 snapshot 输出中补充：
- 元素层级关系（用于确定 locator 的父子结构）
- `role=heading` — 用于划分功能区块
- 元素的 expanded / checked 等交互状态

**③ Screenshot — 视觉辅助确认（可选）**

```
mcp__chrome-devtools__take_screenshot
```

观察页面整体布局：有哪些区域、卡片、表单、按钮组。截图不作为定位依据。

**④ evaluate_script — 深入补充细节**

```
mcp__chrome-devtools__evaluate_script
  function: (selector) => document.querySelector(selector)?.outerHTML || 'Not found'
  args: ["<CSS selector>"]
```

对 DOM 探查中语义不清晰的区域，用 CSS selector 精确提取 HTML。重点关注：
- `data-testid` 属性（首选 locator 来源）
- `placeholder` 文本
- 表单 `action`、`method`
- 动态加载区域（如分页、下拉列表选项）

---

### 第三步 — 去重检查（生成前必须执行）

推断用户故事之前，先检查已有产物：

```
Glob("$TARGET_PROJECT_DIR/test-cases/generated/*.md")       → 已有用例文件
Glob("$TARGET_PROJECT_DIR/tests/e2e/testcases/**/*.test.ts") → 已有 spec 文件
```

对每个已有文件，提取用例编号和验证目标。后续推断的故事如果与已有用例的验证目标重复，直接跳过，不生成重复用例。

---

### 第四步 — 从 DOM 推断用户故事

遍历 snap 中的每个功能区块（以 heading 为边界），生成对应的用户故事：

```
推断规则：
  heading "用户登录"
    textbox "邮箱" (required)
    textbox "密码" (required)
    button "登录"
    link "忘记密码"
  →
  US-CDP-01: 用户登录
    As a 用户
    I want to 使用邮箱和密码登录
    So that 访问系统功能

    AC-1: 有效邮箱 + 密码 → 登录成功
    AC-2: 邮箱为空 → 不可提交（required）
    AC-3: 密码为空 → 不可提交（required）
    AC-4: 点击"忘记密码" → 跳转到密码重置页
```

**推断优先级：**

| DOM 特征 | 推断的测试场景 |
|---|---|
| `button[disabled]` 或 `aria-disabled=true` | 验证启用条件：什么操作后按钮变为可用 |
| `input[required]` | 空提交测试：期望出现错误提示 |
| `input[maxlength]` | 边界值测试：maxlength 和 maxlength+1 |
| `role=dialog` / `[aria-modal]` | 弹窗开关测试：触发 → 展示 → 关闭 |
| `role=tab` | Tab 切换测试：每个 tab 的内容正确渲染 |
| `role=alert` / `[data-testid*=error]` | 错误状态测试：触发条件 → 消息可见 |
| `role=progressbar` / loading spinner | 加载状态测试：操作 → loading 出现 → 消失 |
| 分页按钮 (`上一页` / `下一页`) | 分页测试：边界页（第一页/最后一页） |
| 文件上传 `input[type=file]` | 上传格式、大小边界测试 |
| 下载链接 / download 按钮 | 下载触发 + 文件类型测试 |

---

### 第五步 — 生成测试用例（与需求文档模式相同的产出物）

从推断出的用户故事出发，走完整的用例生成流程：

1. **Gherkin feature 文件** — 保存至 `tests/generated/features/<page-slug>-cdp.feature`
   - 文件顶部必须包含注释：`# Source: Chrome CDP — <page URL> — <snapshot date>`
   - tag 中带 `@cdp-inferred` 以区分来源

2. **test_cases_data.json** — 追加新 key，命名为 `<页面名称>（CDP推断）`

3. **Excel** — 重新生成，新增对应 sheet，sheet 标签颜色用橙色（区别于需求文档驱动的蓝色标签）

4. **playwright-handoff.json** — 新增条目，所有条目的 `uiElements` 直接使用从 snap/html 提取的真实选择器：
   ```json
   {
     "id": "TC-CDP-001",
     "storyId": "cdp-<page-slug>",
     "source": "cdp",
     "pageUrl": "https://...",
     "snapshotDate": "2026-03-14",
     ...
     "uiElements": [
       { "role": "textbox", "name": "邮箱", "action": "fill", "value": "user@example.com",
         "locatorHint": "getByRole('textbox', { name: '邮箱' })" }
     ]
   }
   ```

5. **traceability-matrix.json** — criterionId 格式为 `CDP-<pageSlug>-<序号>`，requirementSection 填 `<page URL>`

---

### 第六步 — 向 playwright-e2e 移交

与需求文档模式完全一致，调用 `playwright-e2e` skill，但额外优势：

- CDP 模式生成的 handoff 中 `locatorHint` 字段已包含从真实 DOM 提取的精确选择器
- playwright-e2e 应**优先使用 `locatorHint`**，无需再重新推断 locator

---

### 两种模式产出物对比

| 产出物 | 需求文档模式 | CDP 实时页面模式 |
|---|---|---|
| feature 文件名 | `canvas-download.feature` | `canvas-download-cdp.feature` |
| tag | `@canvas-download` `@positive` | `@cdp-inferred` `@canvas-download` |
| criterionId | `FR-3.1`（来自需求） | `CDP-canvas-download-01` |
| Excel sheet 标签颜色 | 默认（蓝色表头） | 橙色标签 `[CDP]` 前缀 |
| traceability source | 需求文档章节 | 页面 URL + snapshot 时间 |
| locator 精度 | 推断（可能需调整） | 来自真实 DOM（高可信） |
| 业务规则覆盖 | 完整（来自需求） | 仅 UI 可见规则 |

---

## Core Principles

0. **Deduplicate before generating** -- Before generating any new test case, **must** check existing artifacts to avoid duplicates:
   - Scan `test-cases/generated/*.md` for existing case IDs (e.g. `TC-SIDEBAR-001`)
   - Scan `tests/e2e/testcases/**/*.test.ts` for existing test names and case IDs (via Grep)
   - For each candidate test case, compare its **验证目标**（what it asserts）against existing cases — if an existing case already covers the same scenario, skip it
   - Only generate cases for **genuinely new** scenarios not covered by any existing case or spec
   - If all candidates are duplicates, output "所有用例已存在，跳过生成" and stop
1. **Parse before generating** -- Before writing any test case, fully parse the user story format ("As a... I want... So that...") and extract every testable acceptance criterion. Missing this step leads to incomplete coverage.
2. **Apply equivalence partitioning systematically** -- Divide input domains into equivalence classes (valid, invalid, boundary) for every parameter mentioned in the story. Each class needs at least one representative test case.
3. **Derive boundary values from requirements** -- Requirements that mention ranges, limits, or thresholds imply boundary values. Extract and test at the boundary, one below, and one above.
4. **Generate both positive and negative scenarios** -- Every acceptance criterion implies what should happen and what should not happen. Generate explicit negative test cases for every positive scenario.
5. **Use Gherkin for traceability** -- BDD scenarios in Given/When/Then format provide a natural link between requirements and test cases. Every scenario should trace back to a specific acceptance criterion.
6. **Prioritize by risk, not by order** -- Not all test cases have equal value. Assign priority based on business impact, failure likelihood, and technical complexity. High-risk scenarios run first.
7. **Maintain a traceability matrix** -- Every generated test case must link back to its source requirement. This enables coverage gap analysis and impact assessment when requirements change.
8. **Consider implicit requirements** -- User stories rarely capture all requirements explicitly. Security, performance, accessibility, and error handling are often implicit. Generate test cases for these cross-cutting concerns.

## 用例设计方法论（强制，生成每组用例前必须应用）

> **强制规则**：生成任何功能的用例前，必须逐一检查以下 6 种方法是否适用。不适用的标注 `N/A`，适用的必须生成对应用例。禁止只写"happy path"就结束。

### 方法 1：等价类划分（Equivalence Partitioning）

将每个输入参数划分为有效等价类和无效等价类，每类至少一个代表值。

```
输入: 用户名（2-20 字符）
├─ 有效等价类: "张三" (2字符), "test_user" (9字符), "a]×20" (20字符)
├─ 无效等价类-过短: "" (0字符), "a" (1字符)
├─ 无效等价类-过长: "a×21" (21字符)
└─ 无效等价类-非法字符: "<script>", "user name"(含空格)
```

**适用场景**：所有有输入的场景（表单、搜索、API 参数）。

### 方法 2：边界值分析（Boundary Value Analysis）

对有范围约束的参数，测试边界及边界 ±1 的值。

```
约束: 密码 8-64 字符
├─ 下界: 7(无效), 8(有效), 9(有效)
├─ 上界: 63(有效), 64(有效), 65(无效)
└─ 特殊边界: 0(空), 1(最小非空)
```

**适用场景**：有数值范围、长度限制、数量限制、时间范围的场景。

### 方法 3：判定表 / 因果图（Decision Table / Cause-Effect Graph）

当多个条件组合影响结果时，用判定表穷举关键组合。

```
条件: 用户登录状态(Y/N) × 会员等级(普通/VIP) × 商品库存(有/无)

| 登录 | 会员 | 库存 | 预期结果 |
|------|------|------|----------|
| N    | -    | -    | 跳转登录页 |
| Y    | 普通 | 有   | 正常购买，原价 |
| Y    | VIP  | 有   | 正常购买，折扣价 |
| Y    | 普通 | 无   | 显示缺货提示 |
| Y    | VIP  | 无   | 显示缺货提示 + 到货通知选项 |
```

**适用场景**：多条件组合（权限 × 状态 × 角色）、复杂业务规则、开关组合。

### 方法 4：状态转换测试（State Transition Testing）

识别对象的状态机，验证每个合法转换和非法转换。

```
任务状态机:
  [创建中] → [进行中] → [已完成]
                ↓           ↑
           [已中止] ←───────┘

合法转换: 创建中→进行中, 进行中→已完成, 进行中→已中止
非法转换: 已完成→创建中(不允许), 已中止→进行中(不允许)
```

**适用场景**：有状态的对象（任务、订单、工单）、流程引擎、UI 组件状态（loading/done/error）。

### 方法 5：流程分析（Process Flow Analysis）

从用户操作流程出发，覆盖正常路径 + 异常分支 + 回退路径。

```
分享任务流程:
  1. 点击分享按钮 → dialog 弹出
  2. 点击"创建分享链接" → 生成链接 → 显示链接 + 复制按钮
  3. 点击复制 → 剪贴板有链接 → toast 提示"已复制"

异常分支:
  2a. 网络失败 → 显示错误提示
  3a. 已有分享链接 → 显示"移除分享"选项

回退路径:
  任何步骤 → 点击关闭/ESC → dialog 关闭，无副作用
```

**适用场景**：多步骤操作流程、向导式交互、CRUD 完整生命周期。

### 方法 6：错误推测（Error Guessing）

基于经验和常见 Bug 模式，补充方法 1-5 未覆盖的边缘场景。

```
常见 Bug 模式:
- 并发操作: 两个标签页同时重命名同一任务
- 特殊字符: 任务名含 <>&"'/ 等 HTML 特殊字符
- 空状态: 没有任何任务时的 UI 表现
- 长文本溢出: 任务名超长时的截断/换行
- 快速重复操作: 连续双击提交按钮
- 网络中断后恢复: 断网时操作 → 恢复后状态一致性
```

**适用场景**：所有场景的补充，尤其是前 5 种方法覆盖不到的边缘情况。

### 断言质量规范（强制）

> **核心原则：每个断言必须验证业务语义，禁止空洞断言。**

| 断言类型 | ❌ 空洞断言 | ✅ 有意义断言 |
|----------|-----------|-------------|
| 存在性 | `expect(label).toBeVisible()` | `expect(label).toHaveText('Credits Consumed')` + `expect(value).toMatch(/^\d+$/)` |
| 数值 | `expect(text).toBeTruthy()` | `expect(Number(text)).toBeGreaterThanOrEqual(0)` |
| 时间 | `expect(time).toBeVisible()` | `expect(Date.parse(time)).not.toBeNaN()` |
| 一致性 | `expect(title).toBeVisible()` | `expect(detailTitle).toBe(headerTitle)` — 与上下文关联验证 |
| 列表 | `expect(list).toBeVisible()` | `expect(items.length).toBeGreaterThan(0)` + 验证每项结构完整 |

**结构性内容（popover、card、table row）的断言模式：**

```typescript
// ❌ 错误：只验证 label 存在
await expect(page.getByText('Credits')).toBeVisible()

// ✅ 正确：验证 label + value 配对 + value 语义
const credits = await page.getByText('Credits Consumed').locator('..').locator('span').last().textContent()
expect(Number(credits)).toBeGreaterThanOrEqual(0)

const title = await page.getByText('Task Title').locator('..').locator('span').last().textContent()
expect(title).toBe(expectedTaskName) // 与上下文一致
```

## Project Structure

```
tests/
  generated/
    features/
      user-authentication.feature
      shopping-cart.feature
      payment-processing.feature
    step-definitions/
      user-authentication.steps.ts
      shopping-cart.steps.ts
      payment-processing.steps.ts
    equivalence-classes/
      authentication-classes.ts
      cart-classes.ts
      payment-classes.ts
    traceability/
      traceability-matrix.json
      coverage-report.ts
  generators/
    story-parser.ts
    scenario-generator.ts
    equivalence-generator.ts
    boundary-generator.ts
    negative-scenario-generator.ts
    priority-calculator.ts
    traceability-builder.ts
    gherkin-formatter.ts
  fixtures/
    sample-stories.ts
    domain-rules.ts
  utils/
    nlp-helpers.ts
    gherkin-validator.ts
cucumber.config.ts
```

## Configuration

```typescript
// cucumber.config.ts
export default {
  default: {
    paths: ['tests/generated/features/**/*.feature'],
    require: ['tests/generated/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: [
      'progress-bar',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json',
    ],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    publishQuiet: true,
  },
};
```

```typescript
// tests/fixtures/sample-stories.ts

export interface UserStory {
  id: string;
  title: string;
  narrative: {
    asA: string;
    iWant: string;
    soThat: string;
  };
  acceptanceCriteria: AcceptanceCriterion[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags?: string[];
}

export interface AcceptanceCriterion {
  id: string;
  given: string;
  when: string;
  then: string;
  rules?: string[];
}

export const sampleStories: UserStory[] = [
  {
    id: 'US-101',
    title: 'User Registration',
    narrative: {
      asA: 'new visitor',
      iWant: 'to create an account with my email and password',
      soThat: 'I can access personalized features',
    },
    acceptanceCriteria: [
      {
        id: 'AC-101-1',
        given: 'I am on the registration page',
        when: 'I submit a valid email and password',
        then: 'my account is created and I am logged in',
        rules: [
          'Email must be a valid email format',
          'Password must be 8-64 characters',
          'Password must contain at least one uppercase letter, one lowercase letter, and one number',
          'Email must not already be registered',
        ],
      },
      {
        id: 'AC-101-2',
        given: 'I am on the registration page',
        when: 'I submit an email that is already registered',
        then: 'I see an error message without revealing whether the email exists',
      },
      {
        id: 'AC-101-3',
        given: 'I am on the registration page',
        when: 'I submit a password that does not meet requirements',
        then: 'I see specific validation messages for each unmet requirement',
      },
    ],
    priority: 'critical',
    tags: ['authentication', 'registration'],
  },
  {
    id: 'US-102',
    title: 'Add Item to Shopping Cart',
    narrative: {
      asA: 'logged-in customer',
      iWant: 'to add products to my shopping cart',
      soThat: 'I can purchase them later',
    },
    acceptanceCriteria: [
      {
        id: 'AC-102-1',
        given: 'I am viewing a product detail page',
        when: 'I click "Add to Cart" with a valid quantity',
        then: 'the item is added to my cart and the cart count updates',
        rules: [
          'Quantity must be between 1 and 99',
          'Item must be in stock',
          'Cart total must not exceed 50 items',
        ],
      },
      {
        id: 'AC-102-2',
        given: 'I am viewing a product that is out of stock',
        when: 'I attempt to add it to my cart',
        then: 'the Add to Cart button is disabled and I see an "Out of Stock" message',
      },
    ],
    priority: 'high',
    tags: ['shopping', 'cart'],
  },
];
```

## How-To Guides

### Parsing User Stories and Extracting Testable Criteria

The first step in test generation is systematically parsing user stories to identify all testable aspects.

```typescript
// tests/generators/story-parser.ts

import { UserStory, AcceptanceCriterion } from '../fixtures/sample-stories';

export interface ParsedStory {
  storyId: string;
  actor: string;
  action: string;
  benefit: string;
  criteria: ParsedCriterion[];
  implicitRequirements: string[];
}

export interface ParsedCriterion {
  criterionId: string;
  preconditions: string[];
  trigger: string;
  expectedOutcome: string;
  businessRules: string[];
  inputParameters: InputParameter[];
}

export interface InputParameter {
  name: string;
  type: 'string' | 'number' | 'email' | 'date' | 'enum' | 'boolean';
  constraints: string[];
  extractedFrom: string;
}

/**
 * Parse a user story into structured, testable components.
 */
export function parseUserStory(story: UserStory): ParsedStory {
  const criteria = story.acceptanceCriteria.map((ac) => parseCriterion(ac));

  // Extract implicit requirements that are not stated but should be tested
  const implicitRequirements = deriveImplicitRequirements(story);

  return {
    storyId: story.id,
    actor: story.narrative.asA,
    action: story.narrative.iWant,
    benefit: story.narrative.soThat,
    criteria,
    implicitRequirements,
  };
}

function parseCriterion(ac: AcceptanceCriterion): ParsedCriterion {
  const inputParameters = extractInputParameters(ac);

  return {
    criterionId: ac.id,
    preconditions: [ac.given],
    trigger: ac.when,
    expectedOutcome: ac.then,
    businessRules: ac.rules || [],
    inputParameters,
  };
}

function extractInputParameters(ac: AcceptanceCriterion): InputParameter[] {
  const params: InputParameter[] = [];

  // Parse rules to extract input constraints
  for (const rule of ac.rules || []) {
    // Pattern: "X must be Y-Z characters"
    const charLengthMatch = rule.match(/(\w+)\s+must\s+be\s+(\d+)-(\d+)\s+characters/i);
    if (charLengthMatch) {
      params.push({
        name: charLengthMatch[1].toLowerCase(),
        type: 'string',
        constraints: [`minLength:${charLengthMatch[2]}`, `maxLength:${charLengthMatch[3]}`],
        extractedFrom: rule,
      });
    }

    // Pattern: "X must be a valid email"
    const emailMatch = rule.match(/(\w+)\s+must\s+be\s+a\s+valid\s+email/i);
    if (emailMatch) {
      params.push({
        name: emailMatch[1].toLowerCase(),
        type: 'email',
        constraints: ['validFormat'],
        extractedFrom: rule,
      });
    }

    // Pattern: "X must be between Y and Z"
    const rangeMatch = rule.match(/(\w+)\s+must\s+be\s+between\s+(\d+)\s+and\s+(\d+)/i);
    if (rangeMatch) {
      params.push({
        name: rangeMatch[1].toLowerCase(),
        type: 'number',
        constraints: [`min:${rangeMatch[2]}`, `max:${rangeMatch[3]}`],
        extractedFrom: rule,
      });
    }

    // Pattern: "must contain at least one X"
    const containsMatch = rule.match(/must\s+contain\s+at\s+least\s+one\s+([\w\s]+)/i);
    if (containsMatch) {
      params.push({
        name: containsMatch[1].trim().replace(/\s+/g, '_'),
        type: 'string',
        constraints: [`contains:${containsMatch[1].trim()}`],
        extractedFrom: rule,
      });
    }
  }

  return params;
}

function deriveImplicitRequirements(story: UserStory): string[] {
  const implicit: string[] = [];

  // Security: all forms need CSRF protection
  if (story.acceptanceCriteria.some((ac) => ac.when.includes('submit'))) {
    implicit.push('Form submission must include CSRF token validation');
  }

  // Accessibility: all interactive elements need keyboard support
  implicit.push('All interactive elements must be keyboard accessible');

  // Performance: page load within budget
  implicit.push('Page must load within 3 seconds');

  // Error handling: generic error fallback
  implicit.push('Server errors must show user-friendly error message');

  // Authentication stories need rate limiting
  if (story.tags?.includes('authentication')) {
    implicit.push('Authentication endpoints must have rate limiting');
    implicit.push('Failed attempts must not reveal whether the account exists');
  }

  return implicit;
}
```

### Generating Equivalence Classes

Equivalence partitioning divides input domains into classes where all values in a class are expected to produce the same behavior. This reduces the number of test cases while maintaining coverage.

```typescript
// tests/generators/equivalence-generator.ts

import { InputParameter, ParsedCriterion } from './story-parser';

export interface EquivalenceClass {
  parameterId: string;
  parameterName: string;
  className: string;
  type: 'valid' | 'invalid' | 'boundary';
  representative: string | number;
  description: string;
}

/**
 * Generate equivalence classes for all input parameters of a parsed criterion.
 */
export function generateEquivalenceClasses(
  criterion: ParsedCriterion
): EquivalenceClass[] {
  const classes: EquivalenceClass[] = [];

  for (const param of criterion.inputParameters) {
    classes.push(...generateClassesForParameter(param));
  }

  return classes;
}

function generateClassesForParameter(param: InputParameter): EquivalenceClass[] {
  const classes: EquivalenceClass[] = [];
  const baseName = param.name;

  switch (param.type) {
    case 'email':
      classes.push(
        { parameterId: baseName, parameterName: baseName, className: 'Valid email', type: 'valid', representative: 'user@example.com', description: 'Standard email format' },
        { parameterId: baseName, parameterName: baseName, className: 'Email with subdomain', type: 'valid', representative: 'user@mail.example.com', description: 'Email with subdomain' },
        { parameterId: baseName, parameterName: baseName, className: 'Email with plus alias', type: 'valid', representative: 'user+tag@example.com', description: 'Email with plus addressing' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing @ symbol', type: 'invalid', representative: 'userexample.com', description: 'Email without @ symbol' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing domain', type: 'invalid', representative: 'user@', description: 'Email without domain' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing local part', type: 'invalid', representative: '@example.com', description: 'Email without local part' },
        { parameterId: baseName, parameterName: baseName, className: 'Double dots', type: 'invalid', representative: 'user@example..com', description: 'Domain with consecutive dots' },
        { parameterId: baseName, parameterName: baseName, className: 'Empty string', type: 'invalid', representative: '', description: 'Empty email field' },
      );
      break;

    case 'string': {
      const minLength = extractConstraintValue(param.constraints, 'minLength');
      const maxLength = extractConstraintValue(param.constraints, 'maxLength');

      if (minLength !== null && maxLength !== null) {
        classes.push(
          { parameterId: baseName, parameterName: baseName, className: 'At minimum length', type: 'boundary', representative: 'a'.repeat(minLength), description: `Exactly ${minLength} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Below minimum', type: 'invalid', representative: 'a'.repeat(Math.max(0, minLength - 1)), description: `${minLength - 1} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'At maximum length', type: 'boundary', representative: 'a'.repeat(maxLength), description: `Exactly ${maxLength} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Above maximum', type: 'invalid', representative: 'a'.repeat(maxLength + 1), description: `${maxLength + 1} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Mid-range valid', type: 'valid', representative: 'a'.repeat(Math.floor((minLength + maxLength) / 2)), description: 'Middle of valid range' },
          { parameterId: baseName, parameterName: baseName, className: 'Empty string', type: 'invalid', representative: '', description: 'Empty field' },
        );
      }
      break;
    }

    case 'number': {
      const min = extractConstraintValue(param.constraints, 'min');
      const max = extractConstraintValue(param.constraints, 'max');

      if (min !== null && max !== null) {
        classes.push(
          { parameterId: baseName, parameterName: baseName, className: 'Minimum value', type: 'boundary', representative: min, description: `Exactly ${min}` },
          { parameterId: baseName, parameterName: baseName, className: 'Below minimum', type: 'invalid', representative: min - 1, description: `${min - 1} (below minimum)` },
          { parameterId: baseName, parameterName: baseName, className: 'Maximum value', type: 'boundary', representative: max, description: `Exactly ${max}` },
          { parameterId: baseName, parameterName: baseName, className: 'Above maximum', type: 'invalid', representative: max + 1, description: `${max + 1} (above maximum)` },
          { parameterId: baseName, parameterName: baseName, className: 'Mid-range valid', type: 'valid', representative: Math.floor((min + max) / 2), description: 'Middle of valid range' },
          { parameterId: baseName, parameterName: baseName, className: 'Zero', type: min > 0 ? 'invalid' : 'valid', representative: 0, description: 'Zero value' },
          { parameterId: baseName, parameterName: baseName, className: 'Negative', type: 'invalid', representative: -1, description: 'Negative value' },
        );
      }
      break;
    }
  }

  return classes;
}

function extractConstraintValue(constraints: string[], prefix: string): number | null {
  const constraint = constraints.find((c) => c.startsWith(`${prefix}:`));
  if (!constraint) return null;
  return parseInt(constraint.split(':')[1], 10);
}
```

### Generating Gherkin Scenarios from Parsed Stories

Transform parsed user stories and equivalence classes into Gherkin feature files with complete Given/When/Then scenarios.

```typescript
// tests/generators/gherkin-formatter.ts

import { ParsedStory, ParsedCriterion } from './story-parser';
import { EquivalenceClass, generateEquivalenceClasses } from './equivalence-generator';

/**
 * Generate a complete Gherkin feature file from a parsed user story.
 */
export function generateFeatureFile(story: ParsedStory): string {
  const lines: string[] = [];

  // Feature header
  lines.push(`@${story.storyId.replace(/[^a-zA-Z0-9]/g, '-')}`);
  lines.push(`Feature: ${story.action}`);
  lines.push(`  As a ${story.actor}`);
  lines.push(`  I want ${story.action}`);
  lines.push(`  So that ${story.benefit}`);
  lines.push('');

  // Background (common preconditions)
  const commonPreconditions = extractCommonPreconditions(story.criteria);
  if (commonPreconditions.length > 0) {
    lines.push('  Background:');
    for (const precondition of commonPreconditions) {
      lines.push(`    Given ${precondition}`);
    }
    lines.push('');
  }

  // Generate scenarios for each criterion
  for (const criterion of story.criteria) {
    // Positive scenario
    lines.push(...generatePositiveScenario(criterion));
    lines.push('');

    // Negative scenarios from equivalence classes
    const eqClasses = generateEquivalenceClasses(criterion);
    const invalidClasses = eqClasses.filter((ec) => ec.type === 'invalid');

    for (const invalidClass of invalidClasses) {
      lines.push(...generateNegativeScenario(criterion, invalidClass));
      lines.push('');
    }

    // Boundary scenarios
    const boundaryClasses = eqClasses.filter((ec) => ec.type === 'boundary');
    if (boundaryClasses.length > 0) {
      lines.push(...generateBoundaryScenarioOutline(criterion, boundaryClasses));
      lines.push('');
    }
  }

  // Implicit requirement scenarios
  for (const implicit of story.implicitRequirements) {
    lines.push(`  @implicit @non-functional`);
    lines.push(`  Scenario: ${implicit}`);
    lines.push(`    Given the application is running`);
    lines.push(`    Then ${implicit.toLowerCase()}`);
    lines.push('');
  }

  return lines.join('\n');
}

function generatePositiveScenario(criterion: ParsedCriterion): string[] {
  const lines: string[] = [];

  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @positive`);
  lines.push(`  Scenario: ${criterion.trigger} - happy path`);

  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }

  lines.push(`    When ${criterion.trigger}`);
  lines.push(`    Then ${criterion.expectedOutcome}`);

  for (const rule of criterion.businessRules) {
    lines.push(`    And ${rule}`);
  }

  return lines;
}

function generateNegativeScenario(
  criterion: ParsedCriterion,
  invalidClass: EquivalenceClass
): string[] {
  const lines: string[] = [];

  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @negative`);
  lines.push(
    `  Scenario: Reject ${invalidClass.parameterName} - ${invalidClass.className}`
  );

  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }

  lines.push(
    `    When I provide ${invalidClass.parameterName} as "${invalidClass.representative}"`
  );
  lines.push(
    `    Then I should see a validation error for ${invalidClass.parameterName}`
  );
  lines.push(`    And the ${invalidClass.parameterName} error explains "${invalidClass.description}"`);

  return lines;
}

function generateBoundaryScenarioOutline(
  criterion: ParsedCriterion,
  boundaryClasses: EquivalenceClass[]
): string[] {
  const lines: string[] = [];

  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @boundary`);
  lines.push(`  Scenario Outline: Boundary values for ${criterion.trigger}`);

  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }

  lines.push(`    When I provide <parameter> as "<value>"`);
  lines.push(`    Then the result should be "<expected>"`);
  lines.push('');
  lines.push('    Examples:');
  lines.push('      | parameter | value | expected |');

  for (const boundary of boundaryClasses) {
    lines.push(
      `      | ${boundary.parameterName} | ${boundary.representative} | accepted |`
    );
  }

  return lines;
}

function extractCommonPreconditions(criteria: ParsedCriterion[]): string[] {
  if (criteria.length < 2) return [];

  const allPreconditions = criteria.map((c) => c.preconditions);
  return allPreconditions[0].filter((p) =>
    allPreconditions.every((pList) => pList.includes(p))
  );
}
```

### Generating Cucumber Step Definitions

Create step definition templates that connect Gherkin scenarios to executable test code.

```typescript
// tests/generators/scenario-generator.ts

import { ParsedStory } from './story-parser';

/**
 * Generate Cucumber step definitions for a parsed user story.
 */
export function generateStepDefinitions(story: ParsedStory): string {
  const lines: string[] = [];

  lines.push(`import { Given, When, Then } from '@cucumber/cucumber';`);
  lines.push(`import { expect } from '@playwright/test';`);
  lines.push(`import { page } from '../support/world';`);
  lines.push('');

  const steps = new Set<string>();

  for (const criterion of story.criteria) {
    // Given steps
    for (const precondition of criterion.preconditions) {
      const stepKey = `Given:${precondition}`;
      if (!steps.has(stepKey)) {
        steps.add(stepKey);
        lines.push(`Given('${escapeGherkin(precondition)}', async function () {`);
        lines.push(`  // Navigate to the appropriate page`);
        lines.push(`  await page.goto('/');`);
        lines.push(`  // TODO: Implement precondition setup`);
        lines.push(`});`);
        lines.push('');
      }
    }

    // When steps
    const whenKey = `When:${criterion.trigger}`;
    if (!steps.has(whenKey)) {
      steps.add(whenKey);
      lines.push(`When('${escapeGherkin(criterion.trigger)}', async function () {`);
      lines.push(`  // TODO: Implement action`);
      lines.push(`});`);
      lines.push('');
    }

    // Then steps
    const thenKey = `Then:${criterion.expectedOutcome}`;
    if (!steps.has(thenKey)) {
      steps.add(thenKey);
      lines.push(`Then('${escapeGherkin(criterion.expectedOutcome)}', async function () {`);
      lines.push(`  // TODO: Implement assertion`);
      lines.push(`});`);
      lines.push('');
    }
  }

  // Parameterized steps for equivalence classes
  lines.push(`When('I provide {word} as {string}', async function (parameter: string, value: string) {`);
  lines.push(`  const input = page.getByTestId(\`input-\${parameter}\`);`);
  lines.push(`  await input.clear();`);
  lines.push(`  await input.fill(value);`);
  lines.push(`});`);
  lines.push('');

  lines.push(`Then('I should see a validation error for {word}', async function (parameter: string) {`);
  lines.push(`  const error = page.getByTestId(\`error-\${parameter}\`);`);
  lines.push(`  await expect(error).toBeVisible();`);
  lines.push(`});`);
  lines.push('');

  lines.push(`Then('the {word} error explains {string}', async function (parameter: string, message: string) {`);
  lines.push(`  const error = page.getByTestId(\`error-\${parameter}\`);`);
  lines.push(`  const text = await error.textContent();`);
  lines.push(`  expect(text).toBeTruthy();`);
  lines.push(`});`);

  return lines.join('\n');
}

function escapeGherkin(text: string): string {
  return text.replace(/'/g, "\\'");
}
```

### Building a Risk-Based Priority Calculator

Not all test cases are equally important. This calculator assigns priority based on business impact, failure probability, and complexity.

```typescript
// tests/generators/priority-calculator.ts

export interface RiskAssessment {
  scenarioId: string;
  businessImpact: 1 | 2 | 3 | 4 | 5;  // 5 = critical
  failureLikelihood: 1 | 2 | 3 | 4 | 5; // 5 = very likely
  complexity: 1 | 2 | 3 | 4 | 5;        // 5 = very complex
  riskScore: number;
  priority: 'P0-critical' | 'P1-high' | 'P2-medium' | 'P3-low';
}

export function calculateRiskPriority(
  scenarioId: string,
  storyPriority: 'critical' | 'high' | 'medium' | 'low',
  scenarioType: 'positive' | 'negative' | 'boundary' | 'implicit',
  affectsPayment: boolean,
  affectsAuth: boolean,
  affectsData: boolean
): RiskAssessment {
  // Business impact based on story priority and scenario characteristics
  let businessImpact: 1 | 2 | 3 | 4 | 5 = 1;
  const priorityMap = { critical: 5, high: 4, medium: 3, low: 2 } as const;
  businessImpact = priorityMap[storyPriority] as 1 | 2 | 3 | 4 | 5;

  if (affectsPayment) businessImpact = 5;
  if (affectsAuth) businessImpact = Math.max(businessImpact, 4) as 1 | 2 | 3 | 4 | 5;

  // Failure likelihood based on scenario type
  let failureLikelihood: 1 | 2 | 3 | 4 | 5 = 2;
  switch (scenarioType) {
    case 'boundary':
      failureLikelihood = 4; // Boundary cases are error-prone
      break;
    case 'negative':
      failureLikelihood = 3; // Negative paths are often under-tested
      break;
    case 'implicit':
      failureLikelihood = 3; // Implicit requirements are often missed
      break;
    case 'positive':
      failureLikelihood = 2; // Happy paths are usually tested
      break;
  }

  // Complexity
  let complexity: 1 | 2 | 3 | 4 | 5 = 2;
  if (affectsPayment) complexity = 5;
  if (affectsData && affectsAuth) complexity = 4;

  // Risk score: weighted combination
  const riskScore =
    businessImpact * 0.5 + failureLikelihood * 0.3 + complexity * 0.2;

  // Priority classification
  let priority: RiskAssessment['priority'];
  if (riskScore >= 4.0) priority = 'P0-critical';
  else if (riskScore >= 3.0) priority = 'P1-high';
  else if (riskScore >= 2.0) priority = 'P2-medium';
  else priority = 'P3-low';

  return {
    scenarioId,
    businessImpact,
    failureLikelihood,
    complexity,
    riskScore: Math.round(riskScore * 100) / 100,
    priority,
  };
}
```

### Building a Traceability Matrix

A traceability matrix links every test case to its source requirement, enabling coverage analysis and change impact assessment.

```typescript
// tests/generators/traceability-builder.ts

import { ParsedStory } from './story-parser';
import { EquivalenceClass } from './equivalence-generator';

export interface TraceabilityEntry {
  testCaseId: string;
  storyId: string;
  criterionId: string;
  scenarioType: 'positive' | 'negative' | 'boundary' | 'implicit';
  scenarioTitle: string;
  priority: string;
  equivalenceClass?: string;
  featureFile: string;
  status: 'generated' | 'implemented' | 'passing' | 'failing' | 'skipped';
}

export interface TraceabilityMatrix {
  generated: string;
  totalStories: number;
  totalCriteria: number;
  totalTestCases: number;
  coverageByStory: Record<string, { total: number; implemented: number; passing: number }>;
  entries: TraceabilityEntry[];
}

export function buildTraceabilityMatrix(
  stories: ParsedStory[],
  equivalenceClasses: Map<string, EquivalenceClass[]>
): TraceabilityMatrix {
  const entries: TraceabilityEntry[] = [];
  let testCaseCounter = 1;
  let totalCriteria = 0;

  for (const story of stories) {
    for (const criterion of story.criteria) {
      totalCriteria++;

      // Positive scenario
      entries.push({
        testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
        storyId: story.storyId,
        criterionId: criterion.criterionId,
        scenarioType: 'positive',
        scenarioTitle: `${criterion.trigger} - happy path`,
        priority: 'P1-high',
        featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
        status: 'generated',
      });

      // Equivalence class scenarios
      const classes = equivalenceClasses.get(criterion.criterionId) || [];
      for (const ec of classes) {
        entries.push({
          testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
          storyId: story.storyId,
          criterionId: criterion.criterionId,
          scenarioType: ec.type === 'invalid' ? 'negative' : 'boundary',
          scenarioTitle: `${ec.parameterName} - ${ec.className}`,
          priority: ec.type === 'boundary' ? 'P1-high' : 'P2-medium',
          equivalenceClass: ec.className,
          featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
          status: 'generated',
        });
      }
    }

    // Implicit requirements
    for (const implicit of story.implicitRequirements) {
      entries.push({
        testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
        storyId: story.storyId,
        criterionId: 'implicit',
        scenarioType: 'implicit',
        scenarioTitle: implicit,
        priority: 'P2-medium',
        featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
        status: 'generated',
      });
    }
  }

  // Build coverage summary
  const coverageByStory: Record<string, { total: number; implemented: number; passing: number }> = {};
  for (const entry of entries) {
    if (!coverageByStory[entry.storyId]) {
      coverageByStory[entry.storyId] = { total: 0, implemented: 0, passing: 0 };
    }
    coverageByStory[entry.storyId].total++;
    if (entry.status === 'implemented' || entry.status === 'passing') {
      coverageByStory[entry.storyId].implemented++;
    }
    if (entry.status === 'passing') {
      coverageByStory[entry.storyId].passing++;
    }
  }

  return {
    generated: new Date().toISOString(),
    totalStories: stories.length,
    totalCriteria,
    totalTestCases: entries.length,
    coverageByStory,
    entries,
  };
}
```

### Python Implementation: Generating Test Cases from User Stories

For teams using Python with pytest-bdd, here is the equivalent test generation approach.

```python
# tests/generators/story_parser.py

from dataclasses import dataclass, field
import re


@dataclass
class InputParameter:
    name: str
    param_type: str  # 'string', 'number', 'email', 'date'
    constraints: list[str] = field(default_factory=list)
    extracted_from: str = ""


@dataclass
class ParsedCriterion:
    criterion_id: str
    preconditions: list[str]
    trigger: str
    expected_outcome: str
    business_rules: list[str]
    input_parameters: list[InputParameter]


@dataclass
class ParsedStory:
    story_id: str
    actor: str
    action: str
    benefit: str
    criteria: list[ParsedCriterion]
    implicit_requirements: list[str]


def parse_user_story(story: dict) -> ParsedStory:
    """Parse a user story dictionary into structured components."""
    criteria = []
    for ac in story.get("acceptance_criteria", []):
        params = extract_input_parameters(ac.get("rules", []))
        criteria.append(
            ParsedCriterion(
                criterion_id=ac["id"],
                preconditions=[ac["given"]],
                trigger=ac["when"],
                expected_outcome=ac["then"],
                business_rules=ac.get("rules", []),
                input_parameters=params,
            )
        )

    implicit = derive_implicit_requirements(story)

    return ParsedStory(
        story_id=story["id"],
        actor=story["narrative"]["as_a"],
        action=story["narrative"]["i_want"],
        benefit=story["narrative"]["so_that"],
        criteria=criteria,
        implicit_requirements=implicit,
    )


def extract_input_parameters(rules: list[str]) -> list[InputParameter]:
    """Extract input parameters and their constraints from business rules."""
    params = []

    for rule in rules:
        # Pattern: "X must be Y-Z characters"
        char_match = re.search(
            r"(\w+)\s+must\s+be\s+(\d+)-(\d+)\s+characters", rule, re.IGNORECASE
        )
        if char_match:
            params.append(
                InputParameter(
                    name=char_match.group(1).lower(),
                    param_type="string",
                    constraints=[
                        f"min_length:{char_match.group(2)}",
                        f"max_length:{char_match.group(3)}",
                    ],
                    extracted_from=rule,
                )
            )

        # Pattern: "X must be between Y and Z"
        range_match = re.search(
            r"(\w+)\s+must\s+be\s+between\s+(\d+)\s+and\s+(\d+)", rule, re.IGNORECASE
        )
        if range_match:
            params.append(
                InputParameter(
                    name=range_match.group(1).lower(),
                    param_type="number",
                    constraints=[
                        f"min:{range_match.group(2)}",
                        f"max:{range_match.group(3)}",
                    ],
                    extracted_from=rule,
                )
            )

    return params


def derive_implicit_requirements(story: dict) -> list[str]:
    """Derive implicit requirements from story context."""
    implicit = [
        "All interactive elements must be keyboard accessible",
        "Page must load within 3 seconds",
        "Server errors must show user-friendly error message",
    ]

    tags = story.get("tags", [])
    if "authentication" in tags:
        implicit.append("Authentication endpoints must have rate limiting")

    return implicit
```

```python
# tests/generators/gherkin_generator.py

from story_parser import ParsedStory, ParsedCriterion


def generate_feature_file(story: ParsedStory) -> str:
    """Generate a complete Gherkin feature file from a parsed story."""
    lines = []

    tag = story.story_id.replace(" ", "-")
    lines.append(f"@{tag}")
    lines.append(f"Feature: {story.action}")
    lines.append(f"  As a {story.actor}")
    lines.append(f"  I want {story.action}")
    lines.append(f"  So that {story.benefit}")
    lines.append("")

    for criterion in story.criteria:
        # Positive scenario
        lines.append(f"  @{criterion.criterion_id} @positive")
        lines.append(f"  Scenario: {criterion.trigger} - happy path")
        for pre in criterion.preconditions:
            lines.append(f"    Given {pre}")
        lines.append(f"    When {criterion.trigger}")
        lines.append(f"    Then {criterion.expected_outcome}")
        for rule in criterion.business_rules:
            lines.append(f"    And {rule}")
        lines.append("")

    return "\n".join(lines)
```

### Java Implementation: Generating Test Cases

For Java teams using Cucumber-JVM, the approach translates to the following structure.

```java
// src/test/java/generators/StoryParser.java

package generators;

import java.util.*;
import java.util.regex.*;

public class StoryParser {

    public record InputParameter(
        String name,
        String type,
        List<String> constraints,
        String extractedFrom
    ) {}

    public record ParsedCriterion(
        String criterionId,
        List<String> preconditions,
        String trigger,
        String expectedOutcome,
        List<String> businessRules,
        List<InputParameter> inputParameters
    ) {}

    public record ParsedStory(
        String storyId,
        String actor,
        String action,
        String benefit,
        List<ParsedCriterion> criteria,
        List<String> implicitRequirements
    ) {}

    public static List<InputParameter> extractInputParameters(List<String> rules) {
        List<InputParameter> params = new ArrayList<>();

        for (String rule : rules) {
            // Pattern: "X must be Y-Z characters"
            Matcher charMatch = Pattern.compile(
                "(\\w+)\\s+must\\s+be\\s+(\\d+)-(\\d+)\\s+characters",
                Pattern.CASE_INSENSITIVE
            ).matcher(rule);

            if (charMatch.find()) {
                params.add(new InputParameter(
                    charMatch.group(1).toLowerCase(),
                    "string",
                    List.of(
                        "minLength:" + charMatch.group(2),
                        "maxLength:" + charMatch.group(3)
                    ),
                    rule
                ));
            }

            // Pattern: "X must be between Y and Z"
            Matcher rangeMatch = Pattern.compile(
                "(\\w+)\\s+must\\s+be\\s+between\\s+(\\d+)\\s+and\\s+(\\d+)",
                Pattern.CASE_INSENSITIVE
            ).matcher(rule);

            if (rangeMatch.find()) {
                params.add(new InputParameter(
                    rangeMatch.group(1).toLowerCase(),
                    "number",
                    List.of(
                        "min:" + rangeMatch.group(2),
                        "max:" + rangeMatch.group(3)
                    ),
                    rule
                ));
            }
        }

        return params;
    }
}
```

## Best Practices

1. **Start with acceptance criteria, not implementation** -- Generate test cases from the requirements as written, not from how you think the system works. This prevents tests that merely confirm existing behavior rather than validating intended behavior.

2. **Generate negative scenarios for every positive path** -- If the acceptance criterion says "user can log in with valid credentials," generate explicit scenarios for invalid credentials, expired accounts, locked accounts, and missing fields.

3. **Use Scenario Outlines for data-driven tests** -- When multiple equivalence classes test the same flow with different data, use Gherkin Scenario Outlines with Examples tables rather than duplicating scenarios.

4. **Tag scenarios for selective execution** -- Tag scenarios by priority (@P0, @P1), type (@positive, @negative, @boundary), and feature area (@auth, @cart). This enables targeted test runs in CI.

5. **Review generated scenarios with business stakeholders** -- Gherkin is readable by non-technical stakeholders. Use generated scenarios as a review artifact to validate that all acceptance criteria are covered.

6. **Regenerate when requirements change** -- When acceptance criteria are updated, re-run the generator to identify new test cases and flag obsolete ones. The traceability matrix makes change impact analysis straightforward.

7. **Supplement generated tests with exploratory scenarios** -- Generators cover systematic cases but miss creative edge cases. Augment generated suites with manually written scenarios discovered through exploratory testing.

8. **Keep feature files focused** -- One feature file per user story. Do not combine unrelated stories into a single feature file. This maintains the traceability link between stories and tests.

9. **Validate Gherkin syntax before committing** -- Use a Gherkin linter (cucumber-lint, gherkin-lint) to ensure generated feature files have valid syntax and consistent formatting.

10. **Generate cross-cutting concern tests separately** -- Security, performance, and accessibility tests that apply to all features should be in dedicated feature files, not scattered across individual story features.

## Anti-Patterns to Avoid

1. **Generating tests without reading the story** -- Blindly applying templates without understanding the business context produces irrelevant test cases. Always read and parse the full user story narrative before generating.

2. **Ignoring implicit requirements** -- User stories rarely capture security, performance, and accessibility requirements explicitly. If you only generate tests for stated criteria, you miss critical coverage areas.

3. **Over-generating trivial tests** -- Not every equivalence class needs its own scenario. A password field with 56 boundary values does not need 56 separate scenarios. Use Scenario Outlines and focus on the most informative values.

4. **Generating without prioritizing** -- A flat list of 200 test cases with no priority is unusable. Every generated test must have a risk-based priority that determines execution order.

5. **Treating generated tests as final** -- Generated scenarios are a starting point, not a finished product. They need human review, refinement, and augmentation with domain-specific edge cases that no generator can anticipate.

6. **Duplicating step definitions** -- Generated step definitions should be reusable. "Given I am on the registration page" should be one step definition used across all scenarios, not duplicated in every feature file.

7. **Ignoring the traceability matrix** -- If you generate tests but do not maintain the traceability link to requirements, you lose the ability to assess coverage gaps and change impact.

## Debugging Tips

- **Parser misses parameters**: If the story parser fails to extract input parameters, check the phrasing of business rules. The parser expects specific patterns like "must be X-Y characters" or "must be between X and Y." Adjust regex patterns for your team's writing style.

- **Too many equivalence classes generated**: If the generator produces an overwhelming number of classes, check whether it is generating redundant classes for overlapping constraints. Deduplicate classes with the same representative values.

- **Gherkin syntax errors in generated files**: Ensure that quotes, special characters, and line breaks in acceptance criteria are properly escaped before inserting into Gherkin templates. Use a Gherkin parser to validate output.

- **Cucumber cannot find step definitions**: Generated step definitions use exact string matching. If the Gherkin scenario uses "I submit a valid email and password" but the step definition expects "I submit valid email and password," the step will not match. Normalize articles and prepositions.

- **Traceability matrix shows low coverage**: If coverage appears low, check whether the generator is correctly identifying all acceptance criteria from the source stories. Stories with non-standard formatting (missing Given/When/Then structure) may be partially parsed.

- **Priority calculator assigns everything as P1**: If risk scores are uniformly high, recalibrate the weights and thresholds. Ensure that the business impact, failure likelihood, and complexity inputs vary across scenarios rather than defaulting to maximum values.

- **Generated feature files are too long**: If a single feature file exceeds 200 lines, the source user story may be too large. Consider splitting the story into smaller stories with focused acceptance criteria before generating tests.

- **Step definition collisions**: When multiple feature files generate similar step definitions, Cucumber may raise ambiguous step errors. Use parameterized steps with regular expressions to handle variations rather than creating nearly-identical literal steps.

---

## Handoff to Playwright E2E

After all test cases are generated, **always** produce a `playwright-handoff.json` file and then invoke the `playwright-e2e` skill to implement them as runnable Playwright tests.

### Step 1 — Write playwright-handoff.json

Save to `tests/generated/playwright-handoff.json`. Each entry maps one Gherkin scenario to the data Playwright needs:

```json
[
  {
    "id": "TC-001",
    "storyId": "US-101",
    "criterionId": "AC-101-1",
    "title": "Successful login with valid credentials",
    "priority": "P0-critical",
    "scenarioType": "positive",
    "preconditions": ["User is on the login page"],
    "action": "User submits valid email and password",
    "expectedOutcome": "User is redirected to /dashboard",
    "uiElements": [
      { "role": "textbox", "name": "Email",    "action": "fill",  "value": "user@example.com" },
      { "role": "textbox", "name": "Password", "action": "fill",  "value": "ValidPass123!" },
      { "role": "button",  "name": "Sign in",  "action": "click", "value": null }
    ],
    "assertions": [
      { "type": "url",     "expected": "/dashboard" },
      { "type": "visible", "selector": "heading", "name": "Welcome" }
    ],
    "tags": ["authentication", "smoke"]
  }
]
```

**Field rules:**
- `uiElements[].role` — use ARIA roles: `textbox`, `button`, `link`, `checkbox`, `combobox`, `heading`
- `uiElements[].action` — one of: `fill`, `click`, `select`, `check`, `uncheck`, `hover`, `press`
- `assertions[].type` — one of: `url`, `visible`, `hidden`, `text`, `value`, `count`, `enabled`, `disabled`
- For equivalence-class / boundary scenarios, include one entry per class with `value` set to the representative value
- For negative scenarios, set `assertions` to the expected error state (e.g. `{ "type": "visible", "selector": "alert" }`)

### Step 2 — Invoke playwright-e2e

After writing `playwright-handoff.json`, tell the user:

> ✅ Test cases written to `tests/generated/playwright-handoff.json`.
> Now running `/playwright-e2e` to implement these as Playwright `.spec.ts` files.

Then immediately apply the `playwright-e2e` skill, passing the handoff file as the input source.

---

## Excel 手工测试用例导出

生成测试用例后，**总是**同时产出一份 Excel 文件，供手工测试使用。每个功能模块对应一个独立 Sheet，便于测试人员按模块执行。

### 输出规范

**文件路径**：`tests/generated/test-cases.xlsx`

**每个 Sheet 的列定义：**

| 列 | 字段名 | 说明 |
|---|---|---|
| A | 用例编号 | TC-001、TC-002 … |
| B | 用例标题 | 一句话描述测试目的 |
| C | 优先级 | P0 / P1 / P2 |
| D | 用例类型 | 正向 / 负向 / 边界值 |
| E | 前置条件 | Given 部分，多条用换行分隔 |
| F | 测试步骤 | When 部分，按步骤编号（1. 2. 3.） |
| G | 预期结果 | Then 部分，多条断言换行分隔 |
| H | 需求来源 | 对应需求文档章节/ID |
| I | 执行状态 | 留空（手工填写：通过/失败/阻塞/跳过） |
| J | 实际结果 | 留空（手工填写） |
| K | 备注 | 留空 |

**Sheet 命名规则**：使用功能模块中文名（如 `Canvas预览`、`Canvas下载`、`查看所有文件`）；名称超过 31 字符时截断（Excel 限制）。

**样式要求**：
- 第一行为表头，背景色 `#2E75B6`（蓝色），字体白色加粗
- P0 行：左侧 A 列单元格填充 `#FFE0E0`（浅红）
- P1 行：左侧 A 列单元格填充 `#FFF2CC`（浅黄）
- P2 行：无特殊填充
- 所有列启用自动列宽（按内容最大宽度，最大 60）
- 冻结首行（freeze panes）
- 每行高度自适应（wrap text）

### 生成脚本（Python + openpyxl）

调用以下 Python 脚本生成 Excel。脚本从内存中的测试用例数据直接写入，无需先写 JSON 文件。

生成 Excel 时，构造如下数据结构后调用脚本：

```python
# tests/generated/export_excel.py
# 用法：python tests/generated/export_excel.py
# 也可作为模块导入：from export_excel import export_test_cases_to_excel

import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import os

def export_test_cases_to_excel(sheets_data: dict, output_path: str) -> None:
    """
    sheets_data: {
      "Sheet名称": [
        {
          "id": "TC-001",
          "title": "...",
          "priority": "P0",
          "type": "正向",
          "preconditions": "...",
          "steps": "1. ...\n2. ...",
          "expected": "...",
          "req_ref": "3.2.1",
        },
        ...
      ],
      ...
    }
    output_path: Excel 文件保存路径
    """
    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # 删除默认 Sheet

    HEADER_FILL  = PatternFill("solid", fgColor="2E75B6")
    P0_FILL      = PatternFill("solid", fgColor="FFE0E0")
    P1_FILL      = PatternFill("solid", fgColor="FFF2CC")
    HEADER_FONT  = Font(bold=True, color="FFFFFF", size=11)
    WRAP_ALIGN   = Alignment(wrap_text=True, vertical="top")
    THIN_BORDER  = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin")
    )

    HEADERS = ["用例编号", "用例标题", "优先级", "用例类型",
               "前置条件", "测试步骤", "预期结果", "需求来源",
               "执行状态", "实际结果", "备注"]
    COL_WIDTHS = [12, 40, 8, 10, 30, 50, 40, 14, 10, 20, 20]

    for sheet_name, cases in sheets_data.items():
        ws = wb.create_sheet(title=sheet_name[:31])

        # 表头
        for col_idx, (header, width) in enumerate(zip(HEADERS, COL_WIDTHS), start=1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.fill   = HEADER_FILL
            cell.font   = HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = THIN_BORDER
            ws.column_dimensions[get_column_letter(col_idx)].width = width

        ws.freeze_panes = "A2"
        ws.row_dimensions[1].height = 20

        # 数据行
        for row_idx, case in enumerate(cases, start=2):
            priority = case.get("priority", "")
            row_fill = P0_FILL if priority == "P0" else (P1_FILL if priority == "P1" else None)

            values = [
                case.get("id", ""),
                case.get("title", ""),
                priority,
                case.get("type", ""),
                case.get("preconditions", ""),
                case.get("steps", ""),
                case.get("expected", ""),
                case.get("req_ref", ""),
                "",   # 执行状态（手工填写）
                "",   # 实际结果（手工填写）
                "",   # 备注（手工填写）
            ]

            for col_idx, value in enumerate(values, start=1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                cell.alignment = WRAP_ALIGN
                cell.border    = THIN_BORDER
                if row_fill and col_idx == 1:
                    cell.fill = row_fill

            ws.row_dimensions[row_idx].height = 40

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    wb.save(output_path)
    print(f"✅ Excel 已保存至：{output_path}")


if __name__ == "__main__":
    # 示例数据，实际使用时替换为从 feature 文件或内存解析的用例数据
    sample = {
        "示例功能": [
            {
                "id": "TC-001",
                "title": "用户使用有效凭据登录成功",
                "priority": "P0",
                "type": "正向",
                "preconditions": "用户已注册\n用户处于登录页",
                "steps": "1. 输入有效邮箱\n2. 输入正确密码\n3. 点击登录按钮",
                "expected": "跳转至首页\n顶部显示欢迎信息",
                "req_ref": "FR-2.1",
            }
        ]
    }
    export_test_cases_to_excel(sample, "tests/generated/test-cases.xlsx")
```

### 调用时机

在完成 Gherkin feature 文件生成后，立即：

1. 将所有 feature 文件中的场景转换为上述 `sheets_data` 结构（每个 feature → 一个 Sheet）
2. 将 Given 内容填入「前置条件」，When 内容（多步骤换行编号）填入「测试步骤」，Then 内容填入「预期结果」
3. Scenario Outline 的每一行 Example 展开为独立用例行
4. **只写入** `tests/generated/test_cases_data.json`（纯数据，每次覆盖）
5. 检查 `tests/utils/export_excel.py` 是否存在：
   - **存在** → 直接执行：`python tests/utils/export_excel.py`
   - **不存在** → 首次初始化：将下方工具脚本写入 `tests/utils/export_excel.py`，再执行
6. 告知用户：`✅ 手工测试 Excel 已生成：tests/generated/test-cases.xlsx，共 N 个 Sheet，M 条用例`

> `tests/utils/export_excel.py` 是**一次性初始化的工具脚本**，写入后永久复用，**不要每次重写**。

### 字段映射规则

| Gherkin 元素 | Excel 字段 |
|---|---|
| `@TC-xxx` tag | 用例编号 |
| `Scenario:` 标题 | 用例标题 |
| `@P0` / `@P1` / `@P2` tag | 优先级 |
| `@positive` / `@negative` / `@boundary` tag | 用例类型（正向/负向/边界值） |
| `Given` 步骤（拼接） | 前置条件 |
| `When` + `And`（操作部分） | 测试步骤（编号） |
| `Then` + `And`（断言部分） | 预期结果 |
| `Scenario Outline` + `Examples` | 每行展开为一条独立用例，标题追加参数值 |
| 需求来源注释 / reqRef | 需求来源 |

---

## 需求变更时的更新策略

当用户提供**更新后的需求文档**时，不要全量重写所有文件。执行以下流程，精准更新受影响的产出物。

### 完整产出物链

需求文档的每次变更最终影响 7 类文件，必须全部联动：

```
需求文档 (.md / Figma / Pencil)
  ├── [1] tests/generated/features/*.feature          — Gherkin 用例
  ├── [2] tests/generated/test_cases_data.json        — Excel 数据源（每次重新生成）
  ├── [3] tests/generated/test-cases.xlsx             — 手工测试 Excel（执行脚本产出）
  ├── [4] tests/generated/traceability/traceability-matrix.json
  ├── [5] tests/generated/playwright-handoff.json     — 自动化交接文件
  ├── [6] tests/e2e/**/*.spec.ts                      — Playwright 自动化用例
  └── [7] tests/pages/*.page.ts                       — Page Object（UI 变更时）

tools/（一次初始化，永久复用，不随需求变更重写）
  └── tests/utils/export_excel.py                    — Excel 生成工具脚本
```

### 第一步 — 变更识别

拿到更新后的需求文档后，与上一版本进行**章节级 diff**：

1. 读取新版需求文档（MD 解析 / Figma MCP / Pencil MCP）
2. 与已存在的 `traceability-matrix.json` 对比，以 `requirementSection` 字段为 key
3. 对每个功能模块判断变更类型：

| 变更类型 | 判断依据 | 处理方式 |
|---|---|---|
| ✅ 无变化 | 章节内容与上版一致 | 跳过，不更新任何文件 |
| ✏️ 内容修改 | 章节存在但描述/规则/流程有改动 | 重新生成该模块所有产出物 |
| ➕ 新增模块 | traceability 中无对应 section | 新建该模块的所有产出物 |
| ❌ 删除模块 | 旧版有该 section，新版无 | 删除或标记 deprecated（见下） |

> 如果无法自动判断某章节是否变更（如 Figma 无版本历史），**询问用户**哪些模块发生了变化，再执行对应操作。

### 第二步 — 按变更类型执行更新

#### ✏️ 模块内容修改

对该模块依次更新所有 7 类产出物：

1. **feature 文件** — 删除旧 `.feature` 文件，重新生成
2. **test_cases_data.json** — 替换该模块对应的 key（sheet）
3. **Excel** — 只更新数据 JSON，执行 `python tests/utils/export_excel.py` 重新生成 `test-cases.xlsx`
4. **traceability-matrix.json** — 更新该模块的 entries，保留未变更模块
5. **playwright-handoff.json** — 更新该模块相关的 handoff entries
6. **spec 文件** — 调用 `playwright-e2e` skill，传入更新后的 handoff，让其重写对应 spec 文件
7. **Page Object** — 若 UI 元素（locator、组件名、交互方式）有变化，同步更新对应 `.page.ts`

#### ➕ 新增模块

1. 新建 `tests/generated/features/<新模块>.feature`
2. 在 `test_cases_data.json` 中添加新 sheet key
3. 重新生成 Excel（新增一个 Sheet）
4. 在 traceability-matrix 中追加新模块的 entries
5. 在 playwright-handoff.json 中追加新模块的 handoff entries
6. 调用 `playwright-e2e` skill 新建对应 spec 文件
7. 若有新页面/新组件，新建或更新 Page Object

#### ❌ 删除模块

**不直接删除文件**，而是：
1. 在对应 `.feature` 文件顶部添加注释 `# DEPRECATED: 此模块已从需求中移除，版本 X.X`
2. 在 traceability-matrix 中将该模块所有 entries 的 `status` 改为 `"deprecated"`
3. 在 Excel 中将该 Sheet 标签颜色改为灰色，表头添加 `[已废弃]` 前缀
4. 在 playwright-handoff.json 中移除该模块 entries
5. 在对应 spec 文件顶部添加 `test.skip` 或 `// DEPRECATED` 注释
6. **告知用户**哪些用例被废弃，让其决定是否彻底删除

### 第三步 — 输出变更摘要

更新完成后，向用户报告变更全貌：

```
## 需求变更更新摘要

📄 需求版本：V 1.0 → V 1.1
📅 更新时间：2026-03-14

### 变更模块

✏️ 修改（2 个模块）：
  - Canvas下载：格式转换规则新增 txt→xlsx 支持
    → 更新：canvas-download.feature / Excel Canvas下载 Sheet / spec / handoff
  - 查看所有文件：新增搜索功能
    → 更新：view-all-files.feature / Excel 查看所有文件 Sheet / spec / handoff

➕ 新增（1 个模块）：
  - 文件分享：全新功能模块
    → 新建：file-share.feature / Excel 新 Sheet / spec / Page Object

❌ 删除（0 个模块）

### 文件变更清单

| 文件 | 操作 |
|---|---|
| tests/generated/features/canvas-download.feature | 重新生成 |
| tests/generated/features/view-all-files.feature | 重新生成 |
| tests/generated/features/file-share.feature | 新建 |
| tests/generated/test-cases.xlsx | 重新生成（3 个 Sheet 更新） |
| tests/generated/playwright-handoff.json | 更新 |
| tests/e2e/canvas/download.spec.ts | 重新生成 |
| tests/e2e/canvas/view-all-files.spec.ts | 重新生成 |
| tests/e2e/canvas/file-share.spec.ts | 新建 |
| tests/pages/file-share.page.ts | 新建 |
| tests/generated/traceability/traceability-matrix.json | 更新 |

📊 用例变化：+8 新增 / ~12 修改 / 0 废弃
```

### 快捷指令约定

用户可以用以下方式触发更新模式（无需解释，直接执行）：

| 用户输入 | 执行动作 |
|---|---|
| `更新需求：<文件路径>` | 执行增量更新流程 |
| `重新生成所有用例` | 删除全部产出物，从零全量生成 |
| `只更新 <模块名>` | 仅更新指定模块的 7 类产出物 |
| `删除 <模块名> 的用例` | 将该模块所有产出物标记 deprecated |
