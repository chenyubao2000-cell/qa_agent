---
name: Playwright E2E Testing
description: Comprehensive Playwright end-to-end testing patterns with Page Object Model, fixtures, and best practices
version: 2.0.0
allowed_tools: [Read, Write, Edit, Bash, Grep, Glob]
license: MIT
testingTypes: [e2e]
frameworks: [playwright]
languages: [typescript, javascript]
domains: [web]
---

# Playwright E2E Testing Skill

You are an expert QA automation engineer specializing in Playwright end-to-end testing. When the user asks you to write, review, or debug Playwright E2E tests, follow these detailed instructions.

---

## 0. 去重检查（生成 spec 前必须执行）

生成任何新 spec 之前，**必须**扫描已有脚本，避免重复：

```
Glob("$TARGET_PROJECT_DIR/tests/e2e/testcases/**/*.test.ts")
Glob("$TARGET_PROJECT_DIR/tests/e2e/pages/*.ts")
```

对 handoff 中的每个用例条目：
1. 用用例编号（如 `TC-SIDEBAR-001`）Grep 已有 spec 文件
2. 用用例标题关键词 Grep 已有 spec 文件
3. 如果已有 spec 覆盖了相同的验证目标 → **跳过**，不生成重复 test
4. 如果已有 POM 覆盖了相同页面 → **复用**已有 POM，不新建
5. 全部重复时输出"所有用例已有 spec 覆盖，跳过生成"并停止

---

## 1. Consuming Handoff from test-case-generator

When invoked after `test-case-generator`, check for `tests/generated/playwright-handoff.json`. If it exists, use it as the **sole source of truth** — do not ask the user to describe tests again.

### 1.1 Mapping Rules

**Group by `storyId`** → one `test.describe` block per story. For each entry, generate one `test()` block.

**uiElements → Playwright locators (role-first):**

| `role` | Playwright locator |
|---|---|
| `textbox` | `page.getByRole('textbox', { name })` |
| `button` | `page.getByRole('button', { name })` |
| `link` | `page.getByRole('link', { name })` |
| `checkbox` | `page.getByRole('checkbox', { name })` |
| `combobox` | `page.getByRole('combobox', { name })` |
| `heading` | `page.getByRole('heading', { name })` |

**uiElements[].action → Playwright calls:**

| `action` | Playwright call |
|---|---|
| `fill` | `await locator.fill(value)` |
| `click` | `await locator.click()` |
| `select` | `await locator.selectOption(value)` |
| `check` / `uncheck` | `await locator.check()` / `.uncheck()` |
| `hover` | `await locator.hover()` |
| `press` | `await locator.press(value)` |

**assertions → Playwright expect:**

| `type` | Playwright assertion |
|---|---|
| `url` | `await expect(page).toHaveURL(expected)` |
| `visible` | `await expect(locator).toBeVisible()` |
| `hidden` | `await expect(locator).toBeHidden()` |
| `text` | `await expect(locator).toHaveText(expected)` |
| `value` | `await expect(locator).toHaveValue(expected)` |
| `count` | `await expect(locator).toHaveCount(expected)` |
| `enabled` / `disabled` | `await expect(locator).toBeEnabled()` / `.toBeDisabled()` |

**priority → tags:**

| Priority | Tag |
|---|---|
| `P0-critical` | `@smoke @critical` |
| `P1-high` | `@regression` |
| `P2-medium` | `@regression` |
| `P3-low` | `@extended` |

**Equivalence-class / boundary entries** (same `criterionId`, different `value`): generate parametrized tests, not duplicate blocks.

### 1.2 Handoff source 决定 locator 策略

```
source = "requirements"：
  1. 读取 uiElements → CDP/源码 验证每个 locator → 修正 → 写 spec

source = "cdp"：
  1. 直接使用 locatorHint（已从真实 DOM 提取）→ 写 spec
  2. spec 文件名带 -cdp 后缀，test.describe 前缀 [CDP]
  3. 文件顶部注释：// Source: CDP snapshot — <pageUrl> — <date>
  4. 若后续有需求文档补充，CDP spec 应被替代，而非合并
```

### 1.3 Example: handoff → spec

```json
{
  "id": "TC-001", "storyId": "US-101",
  "title": "Successful login with valid credentials",
  "priority": "P0-critical",
  "preconditions": ["User is on /login"],
  "uiElements": [
    { "role": "textbox", "name": "Email", "action": "fill", "value": "user@example.com" },
    { "role": "textbox", "name": "Password", "action": "fill", "value": "ValidPass123!" },
    { "role": "button", "name": "Sign in", "action": "click", "value": null }
  ],
  "assertions": [
    { "type": "url", "expected": "/dashboard" },
    { "type": "visible", "selector": "heading", "name": "Welcome" }
  ]
}
```

```typescript
test.describe('US-101 · User Login', () => {
  test('TC-001 · Successful login with valid credentials @smoke @critical', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('ValidPass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });
});
```

### 1.4 CRUD 用例依赖排序

CRUD 场景（新建、编辑、删除、详情）存在天然依赖关系——编辑、删除、详情都必须依赖新建产生的数据。生成 spec 时**必须**处理这种依赖：

**强制规则：**
1. 同一模块的 CRUD 用例必须放在同一个 `test.describe` 内，使用 `test.describe.serial` 保证顺序执行
2. **新建用例必须排在最前面**，编辑/删除/详情用例排在其后
3. 新建用例产生的数据（如名称、ID）通过 `test.describe` 级别的变量在后续用例间共享
4. 删除用例必须排在最后（删除后其他用例无法执行）

**推荐顺序：** 新建 → 详情 → 编辑 → 删除

**示例：**
```typescript
test.describe.serial('订单管理 CRUD', { tag: ['@all'] }, () => {
  let createdOrderName: string;

  test('新建订单', async ({ page }) => {
    createdOrderName = `Order-${Date.now()}`;
    // ... 新建操作 ...
    await expect(page.getByText(createdOrderName)).toBeVisible();
  });

  test('查看订单详情', async ({ page }) => {
    // 依赖上一步新建的 createdOrderName
    await page.getByText(createdOrderName).click();
    await expect(page).toHaveURL(/\/orders\/\d+/);
  });

  test('编辑订单', async ({ page }) => {
    // 依赖新建的数据
    await page.getByText(createdOrderName).click();
    // ... 编辑操作 ...
  });

  test('删除订单', async ({ page }) => {
    // 必须最后执行
    await page.getByText(createdOrderName).click();
    // ... 删除操作 ...
  });
});
```

**handoff 映射时的处理：**
- 扫描同一 `storyId` 下的用例标题，识别 CRUD 关键词（新建/创建/create、编辑/修改/edit/update、删除/delete/remove、详情/查看/view/detail）
- 自动将这些用例归入同一个 `test.describe.serial` 块
- 非 CRUD 用例仍使用普通 `test.describe`（可并行）

After generating all `test()` blocks, **extract every locator into a Page Object class** — no locator string should appear directly in spec files.

**已有 POM 的处理**：
1. 先读取已有 POM（如 `tests/e2e/pages/chat.ts`），列出所有 public 方法和 getter
2. 已有 public 方法可直接用 → 在 spec 中调用（如 `chatPage.collapseSidebar()`）
3. 已有 private 属性但无 public getter → **先添加 getter**（如 `getWelcomeHeading()`），再在 spec 中用
4. 完全没有的 locator → **先添加 private 属性 + public getter/方法**，再在 spec 中用
5. **禁止**在 spec 中通过 `chatPage.page.locator()` / `chatPage.page.getByRole()` 绕过 POM

---

## 2. Locator 探查与选择

### 2.1 强制规则

- **禁止凭经验猜测 locator**
- **禁止使用 MCP playwright browser**（`mcp__playwright__browser_*`，headless 无登录态、无真实数据）
- CDP 探查通过 **chrome-devtools MCP 工具**完成
- **验证循环**：每个 PO/spec 写完立即跑一次（单文件、单 worker），修正到全部通过。不要一次写完再跑

### 2.2 语言差异警告

CDP 连接本地 Chrome（可能中文），Playwright headless 默认英文。按钮/标题文本可能不同（"继续" vs "Continue"）。

**解决方案**：优先用语言无关选择器（data-testid、aria-label）；若必须文本匹配，以 Playwright 错误输出的页面快照为准。

### 2.3 探查策略选择

```
有项目源码？
  ├─ YES → 先源码 Grep（秒级）→ 再 CDP 验证渲染结果
  └─ NO  → 直接 CDP 探查
```

**源码探查**（有源码时优先）：
```bash
Grep "data-testid" --glob "*.tsx,*.jsx,*.vue"
Grep "aria-label|role=" --glob "*.tsx,*.jsx"
```

**CDP 探查**（无源码 / 需验证真实渲染）：

| 用途 | MCP 工具 |
|---|---|
| 列出/选择页面 | `list_pages` → `select_page` |
| DOM 探查（优先） | `evaluate_script` — 语言无关 |
| 无障碍树 | `take_snapshot` — 理解结构，但 name 可能有语言差异 |
| 截图 | `take_screenshot` — 视觉辅助，不作为定位依据 |
| 交互验证 | `click` / `fill` / `wait_for` |

**CDP 探查步骤：**

1. `list_pages` → `select_page` 选中目标 tab
2. `evaluate_script` — DOM 探查（优先，语言无关）：
   ```javascript
   () => {
     const root = document.querySelector('main') || document.body;
     const els = root.querySelectorAll('[data-testid], button, input, a, [role]');
     return Array.from(els).slice(0, 50).map(el => ({
       tag: el.tagName, testId: el.dataset?.testid,
       class: el.className?.toString().substring(0, 80),
       type: el.getAttribute('type'),
       ariaLabel: el.getAttribute('aria-label'),
       text: el.textContent?.trim().substring(0, 60)
     }));
   }
   ```
3. `take_snapshot` — 理解层级关系、role、状态（disabled/expanded）
4. `evaluate_script` — 验证候选 selector 命中数量
5. `take_screenshot` — 可选，验证视觉状态

### 2.4 Locator 优先级（统一标准）

> **两个场景，一个原则：稳定性优先。**
>
> - **CDP 探查后写 locator**：按语言无关性排序（testid > CSS > aria-label > role+name > text）
> - **直接写 spec（无 CDP）**：按语义性排序（getByRole > getByLabel > getByPlaceholder > getByText > getByTestId > CSS）
>
> **冲突时的决策规则**：如果页面存在多语言/i18n，或 CDP 与 headless 文本不一致，**始终优先语言无关的 locator**。如果确认单语言且文本稳定，优先语义性 locator。

**语言无关优先级（CDP 探查后 / 多语言场景）：**

1. `page.getByTestId('xxx')` — 最稳定
2. `page.locator('button.btn-download')` — CSS class，语言无关
3. `page.getByLabel('xxx')` — aria-label 硬编码英文时可用
4. `page.getByRole('button', { name: '...' })` — 注意 headless 语言差异
5. `page.getByText('...')` — 最易受语言影响

**语义性优先级（单语言、无 CDP 差异）：**

1. `page.getByRole('button', { name: 'Submit' })` — 语义最佳
2. `page.getByLabel('Email')` — 表单 input
3. `page.getByPlaceholder('Search...')` — 无 label 时
4. `page.getByText('Welcome')` — 非交互元素
5. `page.getByTestId('checkout-total')` — 语义不可行时
6. `page.locator('.legacy-widget')` — 最后手段，需注释原因

### 2.5 常见 locator 情形

**A. 有 data-testid** → `page.getByTestId('download-btn')`

**B. 无 testid，有稳定 CSS class** → `page.locator('button.btn-download')`

**C. 标准 input + label** → `page.getByLabel('Email address')` 或 `page.getByRole('textbox', { name: 'Email address' })`

**D. strict mode violation（命中多个）**：
```typescript
// 先用 evaluate_script 确认数量，再用父级收窄
page.locator('.file-card').first().locator('button.btn-download')
// 或
page.getByTestId('file-card').first().getByRole('button', { name: /download/i })
```

**E. React/Vue 受控 input，fill() 不触发 onChange**：
```typescript
await page.locator('textarea').evaluate((el, text) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype, 'value'
  ).set;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, inputText);
```

**F. iframe 内元素**：
```typescript
const frame = page.frameLocator('#iframe-id');
await frame.getByRole('button', { name: 'Submit' }).click();
```

### 2.6 选择器唯一性（避免 strict mode）

Playwright strict mode 要求交互 locator 只匹配一个元素。

**步骤 1 — 判断是否会重复**：同一文案/角色是否出现在多处（nav、hero、footer）？

**步骤 2 — 用父级收窄**：
```typescript
// ❌ 匹配 3 个
page.getByRole("link", { name: /join waitlist/i })

// ✅ 限定在导航内
page.getByRole("navigation")
  .getByRole("link", { name: /join waitlist/i })
  .first(); // 桌面与移动两个 nav，取第一个
```

**步骤 3 — 自检清单**：
- [ ] 每个 locator 最多匹配 1 个，或已用父级 + `.first()/.last()` 明确
- [ ] 多处同文案已用区域收窄
- [ ] `.first()/.last()` 有注释说明原因

**步骤 4 — 脚本校验（必须）**：

生成或修改 PO 后，必须在真实页面上验证：

```
CDP
```

输出：`UNIQUE`（可用）/ `MULTIPLE(n)`（需收窄）/ `ZERO`（未匹配）。

> 注：正则必须写 `new RegExp("...", "i")`，不能写 `/xxx/i`（命令行限制）。

---

## 3. Project Structure

```
tests/
  e2e/
    testcases/           # 用例：**/*.test.ts
    pages/               # Page Object，与用例解耦
    fixtures.ts          # 扩展 test/expect
    common/              # 共享 mock、工具
    files/               # 上传等用的静态文件
playwright.config.ts     # testDir: ./tests/e2e，testMatch: **/testcases/**/*.test.ts
```

- **Test files**: `tests/e2e/testcases/**/*.test.ts`（不用 `*.spec.ts`）
- **Imports**: `import { test, expect } from "../fixtures"` + `import { XxxPage } from "../pages/xxx"`
- **Snapshots**: `tests/e2e/snapshots/<testFileName>/<name>.png`，由 config `snapshotPathTemplate` 控制
- **Auth state**: `.auth/user.json`（仓库根目录）

---

## 4. Page Object Model

每个页面/组件封装为一个 PO class。Locator 作为属性/getter，操作作为 async 方法。

### Base Page Class（可选）

```typescript
import { Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async navigate(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }
}
```

### Concrete Page Class

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto(): Promise<void> { await this.navigate('/login'); }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectErrorMessage(message: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toHaveText(message);
  }
}
```

多语言场景用 regex：`getByRole('button', { name: /sign in|登录/i })`

---

## 5. Writing Test Specs

```typescript
import { test, expect } from '../fixtures';
import { SignInPage } from '../pages/sign-in';

test.describe('登录页', { tag: ['@all', '@smoke'] }, () => {
  test('登录页加载且表单可见', async ({ page }) => {
    const signInPage = new SignInPage(page);
    await signInPage.goto();
    await expect(signInPage.emailInput).toBeVisible();
  });
});
```

需要登录态的测试使用 fixture 中的 `authenticatedPage` 或 `chatPage`，不要在用例里手动登录。

---

## 6. Assertions

每个测试必须至少一个断言。

```typescript
// Visibility
await expect(locator).toBeVisible();
await expect(locator).toBeHidden();

// Text
await expect(locator).toHaveText('Expected text');
await expect(locator).toContainText('partial');

// Input
await expect(locator).toHaveValue('expected');
await expect(locator).toBeChecked();
await expect(locator).toBeDisabled();

// Page-level
await expect(page).toHaveURL('/expected-path');
await expect(page).toHaveTitle('Page Title');

// Count
await expect(page.getByRole('listitem')).toHaveCount(5);

// CSS
await expect(locator).toHaveCSS('color', 'rgb(255, 0, 0)');
await expect(locator).toHaveClass(/active/);

```

---

## 7. Fixtures & Authentication

项目使用单一 `tests/e2e/fixtures.ts`，提供：

- **storageStatePath**（worker-scoped）：每 worker 登录一次，保存到 `.auth/user.json`
- **authenticatedPage**：带登录态的 page
- **chatPage**：封装 authenticatedPage 的 ChatPage 实例

环境变量：`E2E_TEST_EMAIL`、`E2E_TEST_PASSWORD`、`PLAYWRIGHT_BASE_URL`

```typescript
import { test, expect } from '../fixtures';

test('needs login', async ({ chatPage }) => {
  await chatPage.gotoNewTask();
});
```

---

## 8. Common Scenarios

### Navigation
```typescript
await page.goto('/wizard');
await page.getByLabel('Full name').fill('Jane Doe');
await page.getByRole('button', { name: 'Next' }).click();
await expect(page).toHaveURL('/wizard/step-2');
```

### Dialogs
```typescript
page.on('dialog', async (dialog) => {
  expect(dialog.message()).toBe('Are you sure?');
  await dialog.accept();
});
await page.getByRole('button', { name: 'Delete' }).click();
```

### File Upload
```typescript
await page.getByLabel('Upload document').setInputFiles('tests/e2e/files/sample.pdf');
await expect(page.getByText('sample.pdf')).toBeVisible();
```

### Iframe
```typescript
const frame = page.frameLocator('#payment-iframe');
await frame.getByLabel('Card number').fill('4111111111111111');
```

### Network Interception
```typescript
await page.route('**/api/products', async (route) => {
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 1, name: 'Mocked Product', price: 9.99 }]),
  });
});
await page.goto('/products');
await expect(page.getByText('Mocked Product')).toBeVisible();
```

### API Response Wait
```typescript
const responsePromise = page.waitForResponse('**/api/submit');
await page.getByRole('button', { name: 'Submit' }).click();
const response = await responsePromise;
expect(response.status()).toBe(200);
```

### Dropdowns
```typescript
// Native select
await page.getByLabel('Country').selectOption({ label: 'United States' });
// Custom dropdown
await page.getByRole('combobox', { name: 'Country' }).click();
await page.getByRole('option', { name: 'United States' }).click();
```

---

## 9. Configuration

> **强制配置**（Bug 上报流程前置依赖）：
> - `reporter` 必须包含 `['json', { outputFile: '...' }]` — report-analyzer 依赖

项目 `playwright.config.ts` 关键设置：

- **testDir**: `./tests/e2e`
- **testMatch**: `**/testcases/**/*.test.ts`
- **baseURL**: `process.env.PLAYWRIGHT_TEST_BASE_URL`
- **Reporter**: CI 使用 `html` + `junit` + `json`
- **Run**: `pnpm test:e2e` 或 `pnpm exec playwright test --project=e2e`

---

## 10. Best Practices

1. **永远不用 `page.waitForTimeout()`** — 用 auto-waiting 或显式事件等待
2. **用 `test.describe` 分组**相关测试
3. **Tag 标记**用于选择性执行：`{ tag: ['@smoke'] }`
4. **Soft assertions** 用于非阻塞检查：`await expect.soft(locator).toHaveText('...')`
5. **参数化测试**用循环 + 数组，不要复制粘贴
6. **timeout 在 config 层设置**，不在单个测试里
7. **trace viewer 调试**：`pnpm exec playwright show-trace trace.zip`
8. **fullyParallel: true** 但确保测试隔离
9. **afterEach 清理**测试数据

---

## 11. Anti-Patterns

1. `waitForTimeout(3000)` — 脆弱且慢
2. 测试间共享可变状态
3. 测试实现细节而非用户行为
4. 过度具体的 CSS 选择器（`div > ul > li:nth-child(3)`）
5. 单文件塞太多测试
6. 无关用例之间依赖执行顺序（CRUD 场景除外，见 §1.4）
7. 不用 baseURL，写死绝对路径
8. 直接测试第三方服务（应 mock）
9. 不清理副作用

---

## 12. Debugging

```bash
pnpm exec playwright test --headed --project=e2e          # headed 模式
pnpm exec playwright test --ui --project=e2e               # UI 模式
pnpm exec playwright test --debug tests/e2e/testcases/x.test.ts  # 单文件调试
pnpm exec playwright codegen <url>                         # 录制生成
pnpm exec playwright show-trace test-results/.../trace.zip # trace 查看
```

测试中用 `test.only` 聚焦单个测试，`await page.pause()` 暂停检查页面。

