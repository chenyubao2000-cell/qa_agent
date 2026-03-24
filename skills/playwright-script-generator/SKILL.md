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

## 0a. Assertion Quality Validation (Mandatory after spec generation)

> After generating each spec file, scan ALL `expect()` calls and validate assertion quality. Weak assertions that only check existence without verifying business semantics must be strengthened.

**Assertion quality rules:**

| Pattern | Verdict | Required Fix |
|---------|---------|-------------|
| `expect(locator).toBeVisible()` alone | **WEAK** — only checks existence | Add content assertion: `.toHaveText()`, `.toContainText()`, or semantic check |
| `expect(locator).toBeVisible()` for loading spinner/skeleton | **OK** — existence IS the business meaning | No fix needed |
| `expect(locator).toHaveText('...')` with specific expected text | **STRONG** | No fix needed |
| `expect(locator).toHaveAttribute('...', '...')` | **STRONG** | No fix needed |
| `expect(page).toHaveURL('...')` | **STRONG** | No fix needed |
| `expect(items).toHaveCount(N)` where N > 0 | **STRONG** | No fix needed |
| `expect(locator).toBeTruthy()` | **WEAK** — doesn't validate content | Replace with specific assertion |
| `expect(locator).not.toBeVisible()` for error/empty state | **OK** — absence IS the business meaning | No fix needed |

**Validation process (run after generating each spec file):**
```
1. Grep the generated spec for all expect() calls
2. For each expect():
   a. Is it toBeVisible() alone (no chained content check)?
      → Check if the element is a spinner/skeleton/loading indicator (from POM context)
      → If NOT a loading indicator → WEAK → strengthen:
        - For text elements: add .toHaveText() or .toContainText() with expected content from handoff
        - For inputs: add .toHaveValue() or .toHaveAttribute('placeholder', '...')
        - For lists/tables: add .toHaveCount() with expected count
        - For buttons: add .toBeEnabled() or .toBeDisabled() depending on context
   b. Is it toBeTruthy()?
      → Always WEAK → replace with specific assertion
3. If any WEAK assertions were found and strengthened, log:
   "Strengthened N weak assertions in {specFile}"
```

> **Why this matters**: A test that only checks `toBeVisible()` will pass even if the element shows an error message instead of the expected content. This makes the test useless for catching regressions.

---

## 0b. Deduplication Check (Defensive Fallback)

> **Deduplication hierarchy**: The primary deduplication is performed by the **e2e-orchestrator** (agents/e2e-orchestrator.md Step 2) before this skill is invoked. The orchestrator already filtered out fully covered scenarios. This skill's check is a **defensive fallback** — if somehow a duplicate entry reaches the handoff, catch it here.

Before generating any new spec, scan existing scripts to avoid duplication:

```
Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts")
Glob("$QA_WORKSPACE_DIR/tests/e2e/pages/*.ts")
```

For each test case entry in the handoff:
1. Grep existing spec files by test case ID (e.g., `TC-SIDEBAR-001`)
2. Grep existing spec files by test case title keywords
3. If an existing spec already covers the same verification goal → **skip**, do not generate a duplicate test
4. If an existing POM already covers the same page → **reuse** the existing POM, do not create a new one
5. If all cases are duplicates, output "All test cases already have spec coverage, skipping generation" and stop

---

## 0c. Test Data Self-Sufficiency (Mandatory for every generated test)

> **Core rule**: Every generated `test()` block must be **completely self-contained** — it sets up its own test data, executes, verifies, and cleans up. No test may depend on another test's output. This enables `fullyParallel: true` and ensures a single test failure doesn't cascade.

### Setup & Teardown Code Generation Rules

For each `test()` block, generate setup and teardown based on the test case's preconditions and postconditions from the handoff:

**1. Setup (before test action) — via UI POM methods:**
```typescript
test('Delete task removes it from list', async ({ authenticatedPage: page }) => {
  const tasksPage = new TasksPage(page);
  const taskName = `Test-Del-${Date.now()}`;

  // ── Setup: create test data via UI ──
  await tasksPage.goto();
  await tasksPage.createTask(taskName);
  await expect(tasksPage.getTaskByName(taskName)).toBeVisible(); // confirm setup succeeded

  // ── Action: what we're actually testing ──
  await tasksPage.deleteTask(taskName);

  // ── Assertion ──
  await expect(tasksPage.getTaskByName(taskName)).not.toBeVisible();

  // ── Teardown: not needed (task deleted by the test itself) ──
});
```

**2. Teardown (after test action) — via UI POM methods:**
```typescript
test('Create task shows in list', async ({ authenticatedPage: page }) => {
  const tasksPage = new TasksPage(page);
  const taskName = `Test-Create-${Date.now()}`;

  // ── Action ──
  await tasksPage.goto();
  await tasksPage.createTask(taskName);

  // ── Assertion ──
  await expect(tasksPage.getTaskByName(taskName)).toBeVisible();

  // ── Teardown: clean up via UI ──
  await tasksPage.deleteTask(taskName);
});
```

**3. Unique test data naming:**
- Always use `Date.now()` or `crypto.randomUUID()` suffix in test data names
- Prevents collisions when tests run in parallel
- Pattern: `Test-{Action}-{timestamp}` (e.g., `Test-Edit-1711234567890`)

**4. When to use `test.beforeEach` / `test.afterEach`:**
- If ALL tests in a `test.describe` need the same setup → use `beforeEach`
- If cleanup is needed regardless of test pass/fail → use `afterEach` (ensures teardown even on failure)
- Individual tests with unique setup → inline setup in the test body

**5. POM must include setup/teardown methods:**
```typescript
// POM should expose both "test action" methods and "setup/teardown" methods
export class TasksPage {
  // Setup methods (called in test setup, not the test action itself)
  async createTask(name: string) { /* navigate, click create, fill name, submit */ }
  async deleteTask(name: string) { /* find task, click delete, confirm */ }

  // Getter methods (for assertions)
  getTaskByName(name: string) { return this.page.getByText(name); }
}
```

> **Key principle**: Setup and teardown use the SAME POM methods as the tests. `createTask()` is both a setup helper (for delete/edit tests) and a test action (for create tests). This reuse keeps the code DRY and ensures setup stays in sync with the actual UI.

**6. Handoff integration:**
- The handoff JSON's `setup[]` field describes what UI operations are needed before the test action
- The `teardown[]` field describes what UI cleanup is needed after
- The `pomMethod` field in each setup/teardown entry maps directly to a POM method name
- `{timestamp}` placeholders are replaced with `Date.now()` in generated code

**7. Setup validation (MANDATORY before generating each test):**

Before generating each `test()` block, classify the test action and validate setup accordingly:

```
For each handoff entry:

  Step 1 — Classify the test action type:
    | Action keywords in handoff | Type | setup[] required? |
    |---------------------------|------|:-----------------:|
    | create, add, new, register, upload, submit | Create | No (navigate only) |
    | view, detail, preview, read, open, search | Read | YES |
    | edit, update, modify, rename, change, toggle | Update | YES |
    | delete, remove, cancel, revoke | Delete | YES |
    | download, export, save as | Download | YES |
    | list, filter, sort, paginate | List/Filter | YES |
    | navigate, goto, redirect, back | Navigate | No |
    | check, verify, validate, disabled, enabled | Validate | No |

  Step 2 — Validate setup:
    If type requires setup (Read/Update/Delete/Download/List):
      a. setup[] exists and has entries → generate setup code from entries
      b. setup[] is empty/missing → attempt to infer from preconditions[]:
         - Extract action verbs and target objects from preconditions text
         - Map to POM methods: "创建X" → createX(), "打开X" → openX(), "上传X" → uploadX()
         - Generate inferred setup with warning comment:
           // ── Setup (inferred from preconditions, handoff setup[] was empty) ──
      c. Both setup[] and preconditions[] are empty/missing → flag error:
         "ERROR: TC-{id} is a {type} operation but has no setup or preconditions.
          Cannot generate self-sufficient test. Fix the handoff."

  Step 3 — Generate teardown:
    If type is Create → generate teardown to delete created data
    If type is Delete → no teardown needed (test itself is the cleanup)
    If type is Read/Update/Download/List → generate teardown to delete setup-created data
    If teardown[] exists in handoff → use it; otherwise infer from setup (reverse operations)
```

> **Why this matters**: A test that does `goto()` then immediately operates on data that doesn't exist will always fail. The action type classification ensures every test has appropriate setup. This rule is universal — it applies to any project, any domain (e-commerce orders, CRM contacts, CMS articles, file management, etc.).

---

## 0d. Test Data Resolution (Mandatory when handoff contains `dataType`)

> When a handoff entry's `uiElements[]` contains a `dataType` field, resolve it to a **concrete inline value** in the generated spec. The generated spec must NOT import any factory or utility — all values are hardcoded literals. Each `test()` block gets unique values (append `Date.now()` suffix where applicable to prevent parallel test collisions).

### Resolution Rules

For each `uiElement` with `dataType` set:
1. Look up the `dataType` + `dataVariant` in the mapping table below
2. Generate a concrete value following the generation rule
3. Write the value directly into the spec as a string/number literal
4. If `dataType` is absent, fall back to the `value` field as before

### Mapping Table

| dataType | dataVariant | Generation Rule | Example Output |
|----------|-------------|-----------------|----------------|
| `contact.mobile` | `valid` | `"1" + random(38/39/50/51/52/58/59/80/81/82) + 8 random digits` | `"13856781234"` |
| `contact.mobile` | `invalid` | Short string or letters: `"1234"` or `"abc"` | `"1234"` |
| `contact.email` | `valid` | `"test_" + Date.now() + "@test.com"` | `"test_1711234567890@test.com"` |
| `contact.email` | `invalid` | Missing @ or domain: `"not-an-email"` | `"not-an-email"` |
| `contact.address` | `valid` | `"上海市浦东新区测试路" + random(1-999) + "号"` | `"上海市浦东新区测试路42号"` |
| `contact.address` | `long:N` | N characters of repeated address text | `"上海市浦东新区测试路...（500字）"` |
| `identity.name` | `valid` | `"测试用户_" + Date.now()` | `"测试用户_1711234567890"` |
| `identity.name` | `long:N` | N characters of repeated text | `"测测测测...（200字）"` |
| `identity.idCard` | `valid` | 6-digit area code + 8-digit birth date (19800101-20051231) + 3-digit sequence + Luhn check digit. Must pass `∑(aᵢ × wᵢ) mod 11` verification | `"310101199001011234"` |
| `identity.idCard` | `invalid` | Wrong length or bad check digit: `"12345678"` | `"12345678"` |
| `account.password` | `strong` | `"Aa1@" + 8 random alphanumeric chars` | `"Aa1@xK9mPq2n"` |
| `account.password` | `weak` | Common weak password | `"123456"` |
| `account.captcha` | `valid` | 4-6 random alphanumeric chars | `"a3Kd"` |
| `account.captcha` | `invalid` | Empty string or wrong length | `""` |
| `finance.amount` | `valid` | Random decimal between 0.01 and 99999.99, 2 decimal places | `"128.50"` |
| `finance.amount` | `boundary:0` | Zero or negative value | `"0"` or `"-1"` |
| `finance.bankCard` | `valid` | 16-digit number passing Luhn algorithm (prefix 6222/6217/4367/5187) | `"6222021234567890"` |
| `finance.bankCard` | `invalid` | Wrong length or bad Luhn: `"1234"` | `"1234"` |
| `datetime.date` | `past` | Date within last 30 days, format `YYYY-MM-DD` | `"2026-02-20"` |
| `datetime.date` | `future` | Date within next 7 days, format `YYYY-MM-DD` | `"2026-03-28"` |
| `datetime.date` | `invalid` | Malformed date string | `"not-a-date"` |
| `text.random` | `valid` | 10-50 random Chinese characters | `"这是一段测试文本用于验证输入"` |
| `text.random` | `long:N` | N characters (test max-length boundary) | `"测" × N` |
| `text.random` | `xss` | XSS payload | `"<script>alert(1)</script>"` |
| `text.random` | `sqlInject` | SQL injection payload | `"'; DROP TABLE users; --"` |
| `text.random` | `emoji` | Emoji + mixed text | `"😀🎉测试Emoji✅"` |
| `text.random` | `whitespace` | Spaces, tabs, newlines | `"  \t\n  "` |
| `file.image` | `png` | Static fixture file path | `"tests/e2e/test-data/files/sample.png"` |
| `file.image` | `jpg` | Static fixture file path | `"tests/e2e/test-data/files/sample.jpg"` |
| `file.document` | `pdf` | Static fixture file path | `"tests/e2e/test-data/files/sample.pdf"` |
| `file.document` | `csv` | Static fixture file path | `"tests/e2e/test-data/files/sample.csv"` |
| `file.document` | `xlsx` | Static fixture file path | `"tests/e2e/test-data/files/sample.xlsx"` |
| `file.document` | `txt` | Static fixture file path | `"tests/e2e/test-data/files/sample.txt"` |
| `file.document` | `oversized` | Static oversized file (6MB) | `"tests/e2e/test-data/files/oversized-6mb.bin"` |
| `file.document` | `empty` | Static empty file | `"tests/e2e/test-data/files/empty.txt"` |

### File Upload Resolution

For `file.*` dataTypes, the resolved value is a **file path** relative to `$QA_WORKSPACE_DIR`. Use with `page.setInputFiles()` or POM upload methods:

```typescript
// Generated from: { "dataType": "file.image", "dataVariant": "png" }
await profilePage.uploadAvatar('tests/e2e/test-data/files/sample.png');

// Generated from: { "dataType": "file.document", "dataVariant": "oversized" }
await uploadPage.selectFile('tests/e2e/test-data/files/oversized-6mb.bin');
```

### Uniqueness Guarantee

For dataTypes that generate unique values (`contact.email`, `identity.name`, etc.), always append `Date.now()` to prevent parallel test collisions:

```typescript
// Each test() gets a unique value at generation time
const email = `test_${Date.now()}@test.com`;
const name = `测试用户_${Date.now()}`;
```

### Fallback

If a `uiElement` has NO `dataType` (field omitted or `null`), use the `value` field directly as before. This maintains backward compatibility with handoff files that don't use the dataType system.

---

## 1. Consuming Handoff from test-case-generator

When invoked after `test-case-generator`, check for the handoff JSON file at `$QA_WORKSPACE_DIR/test-cases/generated/playwright-handoff-{slug}.json`.

> **Handoff schema reference**: The complete handoff entry structure is defined in `skills/test-case-generator/SKILL.md` § "Handoff to Playwright E2E". Each entry contains: `id`, `storyId`, `criterionId`, `title`, `priority`, `scenarioType`, `setup[]`, `preconditions[]`, `action`, `expectedOutcome`, `uiElements[]` (with optional `dataType`/`dataVariant` for test data resolution — see §0d), `assertions[]`, `teardown[]`, `tags[]`, `timeout`.

**Handoff is MANDATORY — not optional.**
- If handoff exists → use it as the **sole source of truth**, 1:1 mapping to test() blocks
- If handoff does NOT exist → **STOP with error**: `"ERROR: playwright-handoff-{slug}.json not found. Cannot generate spec without handoff. The orchestrator Step 4.5 should have ensured it exists."` Do NOT fall back to reading .md text. Do NOT attempt to generate specs from .md alone.

### 1.1 Mapping Rules

**Strict 1:1 mapping**: Each handoff entry generates exactly one `test()` block. **NEVER merge multiple entries into one test()**, even if they test similar scenarios. The test title must include the TC ID (e.g., `test("TC-001 ...")`). This ensures TC count in .md = test() count in spec = Excel row count.

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

**Tag system (two dimensions, both MUST be applied to every test):**

**Dimension 1 — Priority (from handoff `priority` field):**

| Priority | Tag | 含义 |
|---|---|---|
| P0 | `@P0` | 核心主流程，必须通过 |
| P1 | `@P1` | 重要功能和异常路径 |
| P2 | `@P2` | 边缘场景和体验优化 |

**Dimension 2 — Suite type (derived from priority):**

| Suite | 包含 | 使用场景 |
|---|---|---|
| `@smoke` | P0 only | 快速验证核心功能（CI、部署后） |
| `@regression` | P0 + P1 | 回归测试（PR 合并前） |
| `@full` | P0 + P1 + P2 | 全量测试（发版前） |

**Mapping rules:**
- P0 → `{ tag: ['@P0', '@smoke', '@regression', '@full'] }`
- P1 → `{ tag: ['@P1', '@regression', '@full'] }`
- P2 → `{ tag: ['@P2', '@full'] }`

**Implementation**: Use Playwright's `tag` option on `test()`, NOT in the test title:

```typescript
// ✅ Correct — tags in test options
test('TC-CDP-NAV-001 点击登录链接跳转至 /task', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page }) => {
  // ...
});

// ❌ Wrong — tags in test title string
test('TC-CDP-NAV-001 点击登录链接 @smoke @P0', async ({ page }) => {
  // ...
});
```

**Execution examples:**
```bash
npx playwright test --grep @smoke          # 只跑 P0 冒烟
npx playwright test --grep @regression     # 跑 P0 + P1 回归
npx playwright test --grep @full           # 跑全部
npx playwright test --grep @P1             # 只跑 P1
npx playwright test --grep "@P0"           # 只跑 P0（不含 P1/P2）
```

**Equivalence-class or boundary-value entries** (same `criterionId`, different `value`): generate parametrized tests, not duplicate blocks. Note: equivalence partitioning (Method 1) and boundary value analysis (Method 2) are independent methods but produce entries in the same format.

**timeout field**: When a handoff entry contains `"timeout": 600000`, insert `test.setTimeout(600_000);` at the top of the generated `test()` block. If `null` or absent, do not insert.

**Timeout auto-detection safety net** (mandatory post-generation check):
After generating each spec file, scan for long-wait patterns:
1. Grep the spec for: `waitForSelector.*timeout.*[3-9]\d{4}`, `waitForResponse`, `expect.poll`, `waitFor.*[6-9]\d{4}`, `sendMessage`, `createTask`, `waitForTask`, `Task completed`
2. For each `test()` block containing any of these patterns AND missing `test.setTimeout()`:
   → Auto-insert `test.setTimeout(600_000);` as the first statement inside the test body
3. For each `test.beforeAll()` containing these patterns AND the parent describe missing `test.describe.configure({ timeout })`:
   → Insert `test.describe.configure({ timeout: 600_000 });` at the top of the describe body
4. Log: "Auto-set timeout for {testName} — contains AI/long-wait pattern without explicit setTimeout"

This catches cases where the handoff's timeout field was null but the generated code still has long waits.

### 1.2 Handoff Source Determines Locator Strategy

```
source = "prd" (PRD-driven, also matches "requirements"):
  1. **Mandatory source code scan** before generating locators:
     a. Grep "$sourceProjectDir" for data-testid:
        Grep "data-testid" --glob "*.tsx,*.jsx,*.vue" → count results
     b. If 0 matches → project does NOT use data-testid:
        - **NEVER** use getByTestId or [data-testid="..."] in POM
        - Locator priority: getByRole > getByLabel > getByPlaceholder > getByText > CSS
     c. If >0 matches → project uses data-testid:
        - For each uiElement, Grep source for specific component's data-testid
        - Found → use getByTestId; not found → fall back to getByRole
        - Locator priority: getByTestId (when found in source) > getByRole > getByLabel > CSS
     d. Store `hasTestIds: boolean` in generation context
  2. Read uiElements → generate locators using determined strategy → write spec
  3. CDP verification (by command layer) will catch remaining mismatches

source = "cdp":
  1. Use locatorHint directly (already extracted from real DOM) → write spec
  2. Spec file name uses -cdp suffix, test.describe prefixed with [CDP]
  3. File header comment: // Source: CDP snapshot — <pageUrl> — <date>
  4. If locatorProfile.hasTestIds is present in baseline → use it to skip testid Grep

source = "issue":
  1. Same as "cdp" when baselineFile is available
  2. Fallback to "prd" strategy when no baseline
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

### 1.4 CRUD Test Case Dependency Ordering

CRUD scenarios (create, edit, delete, detail/view) have natural dependencies — edit, delete, and detail all depend on data produced by the create operation. When generating specs, you **must** handle these dependencies:

**Mandatory rules:**
1. CRUD test cases for the same module must be placed within a single `test.describe`, using `test.describe.serial` to guarantee sequential execution
2. **The create test case must come first**, with edit/delete/detail test cases following it
3. Data produced by the create test case (e.g., name, ID) is shared across subsequent test cases via `test.describe`-level variables
4. The delete test case must come last (other test cases cannot execute after deletion)

**Recommended order:** Create → Detail/View → Edit → Delete

**Example:**
```typescript
test.describe.serial('Order Management CRUD', { tag: ['@all'] }, () => {
  let createdOrderName: string;

  test('Create order', async ({ page }) => {
    createdOrderName = `Order-${Date.now()}`;
    // ... create operation ...
    await expect(page.getByText(createdOrderName)).toBeVisible();
  });

  test('View order details', async ({ page }) => {
    // Depends on createdOrderName from previous step
    await page.getByText(createdOrderName).click();
    await expect(page).toHaveURL(/\/orders\/\d+/);
  });

  test('Edit order', async ({ page }) => {
    // Depends on created data
    await page.getByText(createdOrderName).click();
    // ... edit operation ...
  });

  test('Delete order', async ({ page }) => {
    // Must execute last
    await page.getByText(createdOrderName).click();
    // ... delete operation ...
  });
});
```

**Handling during handoff mapping:**
- Scan test case titles under the same `storyId` to identify CRUD keywords (create/new, edit/modify/update, delete/remove, detail/view)
- Automatically group these test cases into a single `test.describe.serial` block
- Non-CRUD test cases still use regular `test.describe` (can run in parallel)

### 1.5 Test Data Preparation Strategy (Data Self-Sufficiency)

E2E tests must be **data self-sufficient**: each test.describe creates its own prerequisite data and does not depend on externally pre-seeded data.

**Mandatory rules:**
1. **No hardcoded data IDs** — spec files must not contain hardcoded task IDs, file IDs, user IDs, or other external identifiers. `const TASK_ID = 'abc123'` or `process.env.E2E_TASK_WITH_PDF ?? 'fallbackId'` are both **forbidden**
2. **Create data in beforeAll/beforeEach** — prerequisite data (tasks, files, records, etc.) required by tests must be created in `beforeAll` or `beforeEach` via UI operations or API calls
3. **Wait for async data to be ready** — if a prerequisite operation is asynchronous (e.g., Agent executing a task, file generation), you must use `waitForResponse` / `waitForSelector` / polling to confirm data is ready before executing assertions
4. **Cross-module data dependencies** — when module B's tests depend on data produced by module A (e.g., testing Canvas preview requires a task + file first), complete module A's operations in `beforeAll` and store the resulting IDs/URLs in `test.describe`-level variables for subsequent test cases

**Common patterns:**

**Pattern A — Create data via UI operations (recommended, closest to real user behavior):**
```typescript
test.describe.serial('Canvas Preview', { tag: ['@all'] }, () => {
  let taskUrl: string;

  test.beforeAll(async ({ browser }) => {
    // 1. Log in and create a new task
    const ctx = await browser.newContext({ storageState: '.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto('/task');
    // 2. Enter prompt to trigger Agent execution
    await page.getByRole('textbox', { name: /please enter/ }).fill('Help me find a full-stack engineer');
    await page.getByRole('button', { name: 'Submit' }).click();
    // 3. Wait for task completion (file generation)
    await page.waitForSelector('text=Task completed', { timeout: 120_000 });
    // 4. Save taskUrl for subsequent test cases
    taskUrl = page.url();
    await ctx.close();
  });

  test('Canvas shows download button after file opens', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(taskUrl);
    // ... assert Canvas functionality ...
  });
});
```

**Pattern B — Create data via API (faster, suitable for large amounts of prerequisite data):**
```typescript
test.describe('File Download', { tag: ['@all'] }, () => {
  let taskId: string;

  test.beforeAll(async ({ request }) => {
    // Create task via API (if the project has a corresponding endpoint)
    const resp = await request.post('/api/tasks', {
      data: { prompt: 'Help me find a full-stack engineer' },
    });
    const body = await resp.json();
    taskId = body.id;
    // Poll until completion
    await expect.poll(async () => {
      const r = await request.get(`/api/tasks/${taskId}`);
      return (await r.json()).status;
    }, { timeout: 120_000 }).toBe('completed');
  });

  test('Download button triggers file download', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`/task/${taskId}`);
    // ...
  });
});
```

**Pattern C — No data creation needed (the test target itself is the create operation):**
```typescript
// When testing "create task" functionality, the operation itself is data creation — no beforeAll needed
test('After creating a task, redirects to task detail page', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/task');
  await authenticatedPage.getByRole('textbox').fill('Test content');
  await authenticatedPage.getByRole('button', { name: 'Submit' }).click();
  await expect(authenticatedPage).toHaveURL(/\/task\/.+/);
});
```

**Handling during handoff mapping:**
- Analyze each test case's `preconditions` to identify whether prerequisite data is needed (e.g., "Canvas has loaded a file" → need to create a task first and wait for file generation)
- Group test cases under the same `storyId` that share the same prerequisite data into a single `test.describe.serial`, creating data once in `beforeAll`
- When prerequisite data creation takes a long time (e.g., Agent tasks > 30s), you must use `test.describe.serial` + `beforeAll` (create only once) rather than recreating for each test case
- Set a reasonable timeout when creating data in `beforeAll` (e.g., `test.setTimeout(180_000)`); Agent tasks typically take 1-2 minutes

**Pattern D — Worker-scope fixture for expensive shared data (cross-describe sharing):**

When multiple test.describe blocks all need the same expensive setup (e.g., creating an AI task that takes 2+ minutes), use a **worker-scope fixture** in `fixtures.ts` to create data once per worker and share across all tests:

```typescript
// fixtures.ts — worker-scope fixture
testDataContext: [async ({ browser }, use) => {
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  await page.goto('/task');
  await page.getByRole('textbox', { name: /please enter/i }).fill('Create a recruiting task');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForSelector('text=Task completed', { timeout: 300_000 });
  const data = { taskUrl: page.url() };
  await ctx.close();
  await use(data);
}, { scope: 'worker' }],
```

```typescript
// In spec — consumed directly, no beforeAll needed
test('Canvas preview works', async ({ authenticatedPage, testDataContext }) => {
  await authenticatedPage.goto(testDataContext.taskUrl);
  // ... assertions ...
});
```

**When to use worker-scope vs beforeAll:**
| Criterion | beforeAll (Pattern A) | worker-scope fixture (Pattern D) |
|-----------|----------------------|----------------------------------|
| Setup cost | < 30 seconds | > 30 seconds (AI tasks, file processing) |
| Sharing scope | Within one test.describe | Across all tests in the same worker |
| Data mutation | Tests may modify data | Tests only read data (read-only shared) |
| Handoff signal | `setup[].scope` absent or `"test"` | `setup[].scope = "worker"` |

**Handoff integration**: When the handoff's `setup[]` contains `{ "scope": "worker" }`, generate the setup as a worker-scope fixture instead of inline `beforeAll`.

---

After generating all `test()` blocks, **extract every locator into a Page Object class** — no locator string should appear directly in spec files.

**Handling existing POMs**:
1. First read existing POMs (e.g., `tests/e2e/pages/chat.ts`), list all public methods and getters
2. If an existing public method can be used directly → call it in the spec (e.g., `chatPage.collapseSidebar()`)
3. If a private property exists but has no public getter → **add a getter first** (e.g., `getWelcomeHeading()`), then use it in the spec
4. If the locator is completely missing → **add a private property + public getter/method first**, then use it in the spec
5. **Forbidden** to bypass the POM in specs via `chatPage.page.locator()` / `chatPage.page.getByRole()`

---

## 2. Locator Discovery and Selection

> **The complete specification for CDP discovery is defined in `skills/cdp-explorer/SKILL.md`.** This section only retains locator selection rules specific to playwright-script-generator.
> When CDP discovery is needed, read the cdp-explorer SKILL and follow its process.

### 2.1 Mandatory Rules

- **Never guess locators based on experience**
- **Never use MCP playwright browser** (`mcp__playwright__browser_*` — headless, no login state, no real data)
- CDP discovery specification: see `skills/cdp-explorer/SKILL.md`
- **Verification loop**: run each PO/spec immediately after writing (single file, single worker), fix until all pass. Do not write everything first then run

### 2.2 Discovery Strategy Selection

```
Have project source code?
  ├─ YES → Source code Grep first (instant)
  └─ NO  → Rely on locatorHint from the handoff
When CDP verification is needed, it is performed by the command layer or e2e-orchestrator calling cdp-explorer verify mode — this Skill does not directly execute CDP tools.
```

**Source code discovery** (preferred when source code is available):
```bash
Grep "data-testid" --glob "*.tsx,*.jsx,*.vue"
Grep "aria-label|role=" --glob "*.tsx,*.jsx"
```

**CDP verification** (no source code / need to verify real rendering):
Follow **Phase 4: Locator Verification (verify mode)** in `skills/cdp-explorer/SKILL.md`.

### 2.3 Locator Priority (Context-Dependent)

> Priority depends on `hasTestIds` (from §1.2 source scan) and the source mode.

**When `hasTestIds = true` (source code uses data-testid):**
`getByTestId` (when specific testid found in source) > `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > CSS

**When `hasTestIds = false` (no data-testid in source — default for PRD mode until verified):**
`getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > CSS
> **NEVER** use `getByTestId` or `[data-testid="..."]` — they will always fail.

**CDP source (source = "cdp"):**
Use `locatorHint` from baseline directly. If baseline contains `locatorProfile.hasTestIds`, use it as context. The CDP DOM scan already captured actual selectors.

**When conflicts arise**: If multilingual/i18n exists (projectContext.appLanguages is set) or CDP vs headless text differs → prefer language-agnostic locators (`getByRole` with `name` from i18n, or CSS class).

### 2.3.1 i18n-Aware Locators (Multi-Language Testing)

When `projectContext.appLanguages` is configured (e.g., `"en,zh"`), POM must use i18n for all text-based locators.

> **FORBIDDEN ANTI-PATTERNS (when appLanguages is set):**
> 1. ❌ `import enMessages from '../../messages/en.json'` — spec MUST NOT directly import message files
> 2. ❌ `makeI18n()` or any custom i18n helper function — use the `i18n` fixture from `fixtures.ts`
> 3. ❌ Separate `test.describe` blocks for zh/i18n/Chinese — ALL test() run for both languages via Playwright projects
> 4. ❌ `changeLanguage("zh")` or manual language switching — NEXT_LOCALE cookie is set automatically by each project
>
> **REQUIRED PATTERN (mandatory when appLanguages is set):**
> - Spec imports `i18n` from `../../fixtures`: `import { test, expect } from '../../fixtures';`
> - Every `test()` destructures i18n: `async ({ page, i18n }) => { ... }`
> - POM constructor receives i18n: `const home = new HomePage(page, i18n);`
> - Text assertions use `i18n.t('key')`: `await expect(el).toHaveText(i18n.t('homepage.hero.title'));`
> - Playwright config has per-language projects (e2e-en, e2e-zh) that set locale + NEXT_LOCALE cookie
> - Same test code runs under each project — language switching is transparent to the spec

**POM constructor pattern:**
```typescript
type I18n = { t: (key: string) => string; locale: string };

export class CanvasPage {
  constructor(private readonly page: Page, private readonly i18n?: I18n) {}

  // Language-agnostic (preferred — no i18n needed)
  getDownloadButton() { return this.page.locator('button[title="Download file"]'); }

  // i18n-aware (when text is the only differentiator)
  getMaximizeButton() {
    return this.i18n
      ? this.page.getByRole('button', { name: this.i18n.t('canvas.maximize') })
      : this.page.getByRole('button', { name: /Maximize|最大化/i });
  }
}
```

**Rules:**
1. POM constructor: `constructor(page: Page, i18n?: I18n)` — i18n is optional for backward compatibility
2. Locators that match by structure (role, CSS, testid): no i18n needed
3. Locators that match by text (getByText, getByLabel, button name): use `this.i18n.t('key')` with regex fallback
4. Specs instantiate POM with i18n: `const canvas = new CanvasPage(page, i18n);`
5. i18n keys come from handoff's `uiElements[].i18nKey` field (populated by CDP explorer or inferred from source i18n messages)

**Spec code generation pattern** (when appLanguages is set):

Every generated spec MUST:
1. Import `i18n` from fixtures: `import { test, expect, type I18n } from '../../fixtures';`
   (The i18n fixture is auto-generated in fixtures.ts when APP_LANGUAGES is configured)
2. Destructure `i18n` in every test() block, using the correct page fixture:
   - **Public pages** (authSetup=false): `test('...', async ({ page, i18n }) => { ... })`
   - **Auth-required pages** (authSetup=true): `test('...', async ({ authenticatedPage: page, i18n }) => { ... })`
   Both patterns destructure `i18n` alongside the page fixture. The `i18n` fixture is always available regardless of auth mode.
3. Pass `i18n` to POM constructors: `const canvas = new CanvasPage(page, i18n);`

Example generated spec:
```typescript
import { test, expect } from '../../fixtures';
import { CanvasPage } from '../../pages/canvas.page';

test.describe('Canvas Preview', () => {
  test('download button visible', async ({ authenticatedPage: page, i18n }) => {
    const canvas = new CanvasPage(page, i18n);
    await page.goto('/task/abc');
    // i18n-aware assertion — resolves to "Download file" (en) or "下载文件" (zh)
    await expect(canvas.getDownloadButton()).toBeVisible();
  });
});
```

When `appLanguages` is NOT set (backward compatibility):
- Do NOT import i18n from fixtures
- Do NOT pass i18n to POM constructors: `const canvas = new CanvasPage(page);`
- POM's `i18n?` parameter receives undefined → falls back to regex

**i18n key discovery** (during POM generation):
1. If `projectContext.i18nMessagesDir` is available: Read the default locale messages JSON, reverse-lookup each UI text to find its i18n key
2. If handoff entry has `i18nKey` field: use it directly
3. If neither available: use bilingual regex fallback (`/English|中文/i`)

**POM locator generation from handoff i18nKey:**

When generating POM locators from handoff entries:
1. If `uiElement.i18nKey` is present AND `projectContext.appLanguages` is set:
   ```typescript
   // Generated POM getter
   getDownloadButton() {
     return this.i18n
       ? this.page.getByRole('button', { name: this.i18n.t('canvas.downloadFile') })
       : this.page.getByRole('button', { name: /Download file|下载文件/i });
   }
   ```
2. If `uiElement.i18nKey` is null (not found in messages):
   ```typescript
   // Fallback: bilingual regex from handoff name + reverse-translated name
   getDownloadButton() {
     return this.page.getByRole('button', { name: /Download file/i });
   }
   ```
3. For assertions with i18nKey:
   ```typescript
   // In spec
   await expect(canvas.getToast()).toHaveText(i18n.t('toast.downloadSuccess'));
   // Resolves to "Download successful" (en) or "下载成功" (zh)
   ```

### 2.4 Common Locator Scenarios

**A. Has data-testid** → `page.getByTestId('download-btn')`

**B. No testid, has stable CSS class** → `page.locator('button.btn-download')`

**C. Standard input + label** → `page.getByLabel('Email address')` or `page.getByRole('textbox', { name: 'Email address' })`

**D. Strict mode violation (matches multiple elements)**:
```typescript
// Narrow down using parent
page.locator('.file-card').first().locator('button.btn-download')
// Or
page.getByTestId('file-card').first().getByRole('button', { name: /download/i })
```

**E. React/Vue controlled input, fill() doesn't trigger onChange**:
```typescript
await page.locator('textarea').evaluate((el, text) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype, 'value'
  ).set;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, inputText);
```

**F. Elements inside iframe**:
```typescript
const frame = page.frameLocator('#iframe-id');
await frame.getByRole('button', { name: 'Submit' }).click();
```

### 2.5 Selector Uniqueness (Avoiding Strict Mode)

Playwright strict mode requires interactive locators to match exactly one element.

**Step 1 — Determine if duplicates exist**: Does the same text/role appear in multiple places (nav, hero, footer)?

**Step 2 — Narrow down using parent**:
```typescript
// ❌ Matches 3 elements
page.getByRole("link", { name: /join waitlist/i })

// ✅ Scoped to navigation
page.getByRole("navigation")
  .getByRole("link", { name: /join waitlist/i })
  .first(); // Desktop and mobile nav, take the first one
```

**Step 3 — Self-check checklist**:
- [ ] Each locator matches at most 1 element, or parent scoping + `.first()/.last()` has been used explicitly
- [ ] Duplicate text across locations has been narrowed by region
- [ ] `.first()/.last()` has a comment explaining the reason

**Step 4 — CDP verification (executed by the caller)**:

After generating or modifying a PO, return the locator list to the caller (e2e-orchestrator or command layer), which performs verification via cdp-explorer verify mode. Output: `UNIQUE` (usable) / `MULTIPLE(n)` (needs narrowing) / `ZERO` (no match).

---

## 3. Project Structure

```
tests/
  e2e/
    testcases/           # Test cases: **/*.test.ts
    pages/               # Page Objects, decoupled from test cases
    fixtures.ts          # Extended test/expect
    common/              # Shared mocks, utilities
    files/               # Static files for uploads, etc.
playwright.config.ts     # testDir: ./tests/e2e, testMatch: **/testcases/**/*.test.ts
```

- **Test files**: `tests/e2e/testcases/**/*.test.ts` (not `*.spec.ts`)
- **Imports**: `import { test, expect } from "../../fixtures"` + `import { XxxPage } from "../../pages/xxx"` (paths relative to `testcases/generated/`)
- **Snapshots**: `tests/e2e/snapshots/<testFileName>/<name>.png`, controlled by config `snapshotPathTemplate`
- **Auth state**: `.auth/user.json` (repository root)

---

## 4. Page Object Model

Each page/component is encapsulated as a PO class. Locators are properties/getters, operations are async methods.

### Base Page Class (optional)

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

For multilingual scenarios use regex: `getByRole('button', { name: /sign in|登录/i })`

**i18n type definition** (exported from fixtures.ts when APP_LANGUAGES is set):
```typescript
export type I18n = { t: (key: string) => string; locale: string };
```

POM files import this type:
```typescript
import type { I18n } from '../fixtures';

export class CanvasPage {
  constructor(private readonly page: Page, private readonly i18n?: I18n) {}
  // ...
}
```

This ensures POM → fixtures type dependency is clean and circular imports are avoided.

---

## 5. Writing Test Specs

```typescript
import { test, expect } from '../fixtures';
import { SignInPage } from '../pages/sign-in';

test.describe('Sign-in Page', { tag: ['@all', '@smoke'] }, () => {
  test('Sign-in page loads and form is visible', async ({ page }) => {
    const signInPage = new SignInPage(page);
    await signInPage.goto();
    await expect(signInPage.emailInput).toBeVisible();
  });
});
```

Tests requiring login state should use `authenticatedPage` or `chatPage` from fixtures — do not log in manually within test cases.

---

## 6. Assertions

Every test must have at least one assertion.

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

The project uses a single `tests/e2e/fixtures.ts`, providing:

- **storageStatePath** (worker-scoped): logs in once per worker, saves to `.auth/user.json`
- **authenticatedPage**: a page with login state
- **chatPage**: a ChatPage instance wrapping authenticatedPage

Environment variables: `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `PLAYWRIGHT_BASE_URL`

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

> **Mandatory configuration** (prerequisite for the bug reporting pipeline):
> - `reporter` must include `['json', { outputFile: '...' }]` — required by report-analyzer
> - `screenshot: 'only-on-failure'` — failure screenshots used as Linear Bug attachments
> - `trace: 'retain-on-failure'` — failure traces used for debugging

Key settings in the project's `playwright.config.ts` (auto-generated by test-executor from environment variables, not copied from the source project):

- **testDir**: `./tests/e2e`
- **testMatch**: `**/testcases/**/*.test.ts`
- **baseURL**: `process.env.PLAYWRIGHT_BASE_URL` (from this project's .env)
- **Reporter**: `json` (output to tests/reports/) + `html`
- **Run**: `npx playwright test --project=e2e`

**Failure evidence configuration (required)**:

```typescript
// playwright.config.ts → use
use: {
  screenshot: 'only-on-failure',   // Auto-screenshot on failure → test-results/
  trace: 'retain-on-failure',      // Retain trace on failure → test-results/
}
```

Failure screenshots automatically appear in the Playwright JSON report's `attachments` array:
```json
{ "name": "screenshot", "contentType": "image/png", "path": "test-results/.../test-failed-1.png" }
```
report-analyzer → bug-reporter → Linear Issue — the entire pipeline depends on this data.

---

## 10. Best Practices

1. **Never use `page.waitForTimeout()`** — use auto-waiting or explicit event waits
2. **Use `test.describe` to group** related tests
3. **Tag annotations** for selective execution: `{ tag: ['@smoke'] }`
4. **Soft assertions** for non-blocking checks: `await expect.soft(locator).toHaveText('...')`
5. **Parameterized tests** using loops + arrays, do not copy-paste
6. **Timeout enforcement (MANDATORY)**: For test cases involving AI processing or long-running async tasks (e.g., `sendMessage`, `createTask`, `waitForTaskCompleted`, `waitForSelector` with timeout > 30s), you **must** add `test.setTimeout(600_000)` (10 minutes) at the test level. This is a **hard requirement** enforced by post-generation validation (§1.1 timeout auto-detection), not a suggestion. Missing timeouts will be auto-injected with a warning.
7. **Trace viewer debugging**: `pnpm exec playwright show-trace trace.zip`
8. **fullyParallel: true** but ensure test isolation
9. **afterEach cleanup** of test data

---

## 11. Anti-Patterns

1. `waitForTimeout(3000)` — fragile and slow
2. Sharing mutable state between tests
3. Testing implementation details instead of user behavior
4. Overly specific CSS selectors (`div > ul > li:nth-child(3)`)
5. Too many tests in a single file
6. Execution order dependencies between unrelated test cases (except CRUD scenarios, see §1.4)
7. Not using baseURL, hardcoding absolute paths
8. Directly testing third-party services (should mock)
9. Not cleaning up side effects

---

## 12. Debugging

```bash
pnpm exec playwright test --headed --project=e2e          # headed mode
pnpm exec playwright test --ui --project=e2e               # UI mode
pnpm exec playwright test --debug tests/e2e/testcases/x.test.ts  # single file debug
pnpm exec playwright codegen <url>                         # record and generate
pnpm exec playwright show-trace test-results/.../trace.zip # trace viewer
```

Use `test.only` in tests to focus on a single test, and `await page.pause()` to pause and inspect the page.
