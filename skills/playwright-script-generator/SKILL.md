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

**Validation process**: grep each spec for all `expect()` calls. `toBeVisible()` alone (non-spinner) → strengthen with content assertion. `toBeTruthy()` → always replace. Log: "Strengthened N weak assertions in {specFile}".

---

## 0b. Deduplication Check (Defensive Fallback)

Before generating any new spec, scan existing scripts to avoid duplication:

```
Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts")
Glob("$QA_WORKSPACE_DIR/tests/e2e/pages/*.ts")
```

For each test case entry in the handoff:
1. Grep existing spec files by test case ID (e.g., `TC-SIDEBAR-001`)
2. Grep existing spec files by test case title keywords
3. If existing spec already covers the same goal → **skip**
4. If existing POM already covers the same page → **reuse**
5. If all cases are duplicates → output "All test cases already have spec coverage" and stop

---

## 0c. Test Data Self-Sufficiency (Mandatory for every generated test)

> **Core rule**: Every `test()` block must be completely self-contained — sets up its own data, executes, verifies, and cleans up. No test may depend on another test's output.

**Rules:**
1. **No hardcoded data IDs** — no `const TASK_ID = 'abc123'` or `process.env.E2E_TASK_WITH_PDF ?? 'fallbackId'`
2. **Create data via worker-scope fixture** — all prerequisite data created in `fixtures.ts` as worker-scope fixtures (`{ scope: 'worker', timeout: 360_000 }`). Tests receive data via fixture parameter destructuring. **Do NOT use `beforeAll`** — it has a hidden 60s timeout limit, requires `serial` wrapper, and prevents parallel execution. See `references/test-data-patterns.md` Pattern D.
3. **Wait for async data to be ready** — use `waitForResponse` / polling to confirm before asserting
4. **Unique naming** — always use `Date.now()` or `crypto.randomUUID()` suffix: `Test-{Action}-${Date.now()}`
5. **POM must include setup/teardown methods** — `createTask()`, `deleteTask()`, etc.
6. **Handoff integration**: `setup[]` → worker-scope fixture; `teardown[]` → after-action cleanup; `{timestamp}` → `Date.now()`. For full schema, read `references/handoff-field-resolution.md` §1.
7. **Fixture timeout**: Every worker-scope fixture that creates data MUST specify `{ scope: 'worker', timeout: 360_000 }`. This is independent from test timeout and handles AI tasks (1-5 min) without any workaround.

**Setup validation (MANDATORY before generating each test)** — classify action type, then validate setup[] exists:

| Action keywords | Type | setup[] required? |
|----------------|------|:-----------------:|
| create, add, new, upload, submit | Create | No |
| view, detail, preview, read, open, search | Read | YES |
| edit, update, modify, rename, toggle | Update | YES |
| delete, remove, cancel, revoke | Delete | YES |
| download, export | Download | YES |
| list, filter, sort, paginate | List/Filter | YES |
| navigate, goto, redirect | Navigate | No |

If type requires setup but `setup[]` is empty → infer from `preconditions[]`. If both empty → flag error.

For full code examples of all 4 data preparation patterns (UI, API, no-setup, worker-scope fixture), read `references/test-data-patterns.md`.

---

## 0d. Test Data Resolution (Mandatory when handoff contains `dataType`)

When a handoff `uiElements[]` entry contains a `dataType` field, resolve it to a concrete inline literal — no factory imports. Append `Date.now()` where needed for uniqueness.

**Resolution**: look up `dataType` + `dataVariant` → generate concrete value → write as literal in spec.

For the full mapping table (contact, identity, finance, datetime, text, file types), read `references/data-type-resolution.md`.

---

## 1. Consuming Handoff from test-case-generator

When invoked after `test-case-generator`, check for the handoff JSON at `$QA_WORKSPACE_DIR/test-cases/generated/playwright-handoff-{slug}.json`.

**Handoff is MANDATORY — not optional.**
- Handoff exists → use as **sole source of truth**, 1:1 mapping to `test()` blocks
- Handoff NOT found → **STOP**: `"ERROR: playwright-handoff-{slug}.json not found."`

### 1.1 Mapping Rules

**Strict 1:1 mapping**: Each handoff entry → exactly one `test()` block. NEVER merge entries. Title must include TC ID.

**Group by `storyId`** → one `test.describe` per story.

**uiElements → locators** (`locatorHint` takes precedence when present):

1. `locatorHint` non-null (CDP source) → use directly, e.g. `page.getByTestId('download-btn')` or `page.getByRole('button', { name: 'Submit' })`
2. `locatorHint` null → resolve from `role` + `name`:

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

**assertions → expect** (`assertions[].selector` is an **ARIA role**, not CSS — use `page.getByRole(selector, { name })`):

| `type` | Playwright assertion |
|---|---|
| `url` | `await expect(page).toHaveURL(expected)` |
| `visible` / `hidden` | `await expect(locator).toBeVisible()` / `.toBeHidden()` |
| `text` | `await expect(locator).toHaveText(expected)` |
| `value` | `await expect(locator).toHaveValue(expected)` |
| `count` | `await expect(locator).toHaveCount(expected)` |
| `enabled` / `disabled` | `await expect(locator).toBeEnabled()` / `.toBeDisabled()` |

**`expected` value resolution**: `expected` non-null → literal; `expected` null + `i18nKey` non-null → `i18n.t(key)`; both null → error for `text`/`url`/`value`/`count`, OK for others. Details in `references/handoff-field-resolution.md` §3.

**Tag system (both dimensions MUST apply to every test):**

| Priority | Tag | Included in suites |
|---|---|---|
| P0 | `@P0` | `@smoke` `@regression` `@full` |
| P1 | `@P1` | `@regression` `@full` |
| P2 | `@P2` | `@full` |

```typescript
// ✅ Correct
test('TC-001 ...', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page }) => { ... });
// ❌ Wrong — tags in title string
test('TC-001 ... @smoke @P0', async ({ page }) => { ... });
```

**timeout field (two-pass)**: ① handoff `timeout` non-null → `test.setTimeout(<ms>)` as first statement (primary); ② post-generation scan for long-wait code patterns → auto-insert `test.setTimeout(600_000)` if missing (fallback). Details in `references/handoff-field-resolution.md` §4.

### 1.2 Handoff Source Determines Locator Strategy

```
source = "prd":
  1. Grep "$sourceProjectDir" for data-testid (*.tsx,*.jsx,*.vue)
     - 0 matches → NEVER use getByTestId; priority: getByRole > getByLabel > getByPlaceholder > CSS
     - >0 matches → getByTestId (when found) > getByRole > getByLabel > CSS
  2. Store hasTestIds: boolean in generation context

source = "cdp":
  1. Use locatorHint directly from baseline
  2. Spec file name uses -cdp suffix; test.describe prefixed with [CDP]
  NOTE: Even when source is "cdp", if sourceProjectDir is available in projectContext,
  MUST read the component source to distinguish semantic classes from Tailwind utilities
  and prefer data-testid/aria-* over CDP-discovered CSS locators. See cdp-explorer/SKILL.md Phase 0.

source = "issue":
  1. Same as "cdp" when baselineFile available; fallback to "prd" strategy
```

For complete handoff→spec example and CRUD ordering rules, read `references/handoff-examples.md`.

After generating all `test()` blocks, **extract every locator into a Page Object class** — no raw locator strings in spec files.

**Handling existing POMs**: read existing POMs first → reuse public methods → add getters for missing accessors → never bypass POM with `chatPage.page.locator()`.

---

## 2. Locator Discovery and Selection

> The complete CDP discovery spec is in `skills/cdp-explorer/SKILL.md`. This section covers locator selection rules only.

### 2.1 Mandatory Rules

- **Never guess locators based on experience**
- **Never use MCP playwright browser** (headless, no login state, no real data)
- **Verification loop**: run each PO/spec immediately after writing, fix until all pass

### 2.2 Discovery Strategy (Source + CDP Co-Reading)

> **Rule**: Source code reading is NOT optional when `sourceProjectDir` is available.
> Grepping only for `data-testid` is insufficient — read the component to understand structure.
> See `cdp-explorer/SKILL.md` Phase 0 for the full rule.

```
Have project source code (sourceProjectDir available)?
  YES →
    Step A: Grep sourceProjectDir for data-testid: Grep "data-testid" --glob "*.tsx,*.jsx,*.vue"
    Step B: Read the page component rendering the target URL (grep for route/path)
            Extract: data-testid, aria-label, role, conditional rendering, i18n keys, semantic vs utility classes
    Step C: Select locator strategy per source findings:
            - Source has data-testid → getByTestId (most stable)
            - Source has aria-label/title but no testid → getByRole with name
            - Source shows conditional rendering → add waitFor / guard in spec
            - Source uses Tailwind utility class → NEVER use as locator
    Step D: When CDP locatorHint conflicts with source → prefer source-based identifier
  NO  → Use locatorHint from handoff
CDP verification → performed by command layer / e2e-orchestrator calling cdp-explorer verify mode
```

### 2.3 Locator Priority

**`hasTestIds = true`**: `getByTestId` (when found) > `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > CSS

**`hasTestIds = false`**: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > CSS — NEVER use `getByTestId`

**CDP source**: use `locatorHint` from baseline directly.

**i18n** (`projectContext.appLanguages` set): use `i18n.t('key')` for text-based locators. For full i18n POM/spec patterns, read `references/handoff-examples.md` §2.3.1.

### 2.4 Common Locator Scenarios

**Has data-testid** → `page.getByTestId('download-btn')`

**Standard input** → `page.getByLabel('Email')` or `page.getByRole('textbox', { name: 'Email' })`

**Strict mode violation (multiple matches)**:
```typescript
page.locator('.file-card').first().locator('button.btn-download')
```

**React/Vue controlled input** (`fill()` doesn't trigger onChange):
```typescript
await page.locator('textarea').evaluate((el, text) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, inputText);
```

**Iframe**: `page.frameLocator('#iframe-id').getByRole('button', { name: 'Submit' })`

### 2.5 Selector Uniqueness (Avoiding Strict Mode)

1. Determine if duplicates exist (same text/role in nav, hero, footer)
2. Narrow with parent scope: `page.getByRole('navigation').getByRole('link', { name: /join/i }).first()`
3. Self-check: each locator matches ≤1 element, or parent+`.first()/.last()` used with comment

---

## 3. Project Structure

```
tests/e2e/
  testcases/    pages/    fixtures.ts    common/    files/
playwright.config.ts
```

- **Test files**: `tests/e2e/testcases/generated/{slug}-[{area-id}-]{source}.test.ts`
  - `{source}` ∈ `cdp | prd | issue` (MANDATORY suffix per CLAUDE.md convention)
  - `{area-id}` only for `/qa-explore` area-scoped generation; omitted for `/qa-run-prd` and `/qa-from-issue`
- **Imports**: `import { test, expect } from "../../fixtures"` + `import { XxxPage } from "../../pages/xxx"`
- **Auth state**: `playwright/.auth/user.json`
- **Spec file header (MANDATORY)**: Every generated spec MUST include a metadata header comment as the first lines:
  ```typescript
  // source: cdp | prd | issue
  // handoff: test-cases/generated/playwright-handoff-{slug}.json
  // baseline: test-cases/generated/page-baseline-{slug}.json  (CDP/issue only, omit for PRD)
  // generated: {ISO 8601 timestamp}
  ```
  This enables: qa-fix-tests to locate handoff files, cross-command dedup, and traceability from spec back to handoff.
  Defined in `e2e-orchestrator.md` Step 5.2.

---

## 4. Page Object Model

```typescript
import { Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}
  async navigate(path: string) { await this.page.goto(path); }
  async waitForPageLoad() { await this.page.waitForLoadState('domcontentloaded'); }
}

export class LoginPage extends BasePage {
  readonly emailInput = this.page.getByLabel('Email');
  readonly passwordInput = this.page.getByLabel('Password');
  readonly submitButton = this.page.getByRole('button', { name: 'Sign in' });

  async goto() { await this.navigate('/login'); }
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

For multilingual scenarios: `getByRole('button', { name: /sign in|登录/i })`

**i18n type** (exported from fixtures.ts when APP_LANGUAGES is set):
```typescript
export type I18n = { t: (key: string) => string; locale: string };
// POM: constructor(private readonly page: Page, private readonly i18n?: I18n) {}
```

---

## 5. Writing Test Specs

```typescript
import { test, expect } from '../../fixtures';
import { SignInPage } from '../../pages/sign-in';

test.describe('Sign-in Page', { tag: ['@all', '@smoke'] }, () => {
  test('Sign-in page loads and form is visible', async ({ page }) => {
    const signInPage = new SignInPage(page);
    await signInPage.goto();
    await expect(signInPage.emailInput).toBeVisible();
  });
});
```

Tests are automatically authenticated via setup project storageState — do not log in manually.

---

## 6. Assertions

```typescript
await expect(locator).toBeVisible();
await expect(locator).toHaveText('Expected text');
await expect(locator).toContainText('partial');
await expect(locator).toHaveValue('expected');
await expect(locator).toBeChecked();
await expect(locator).toBeDisabled();
await expect(page).toHaveURL('/expected-path');
await expect(page.getByRole('listitem')).toHaveCount(5);
```

---

## 7. Fixtures & Authentication

- **storageState**: setup project runs `auth.setup.ts`, saves to `playwright/.auth/user.json`. Test projects load via config.
- **Public pages**: opt out with `test.use({ storageState: { cookies: [], origins: [] } })`
- **Env vars**: `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `PREVIEW_URL`

```typescript
import { test, expect } from '../../fixtures';
test('needs login', async ({ chatPage }) => { await chatPage.gotoNewTask(); });
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
  await route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 1, name: 'Mocked Product', price: 9.99 }]) });
});
```

### API Response Wait
```typescript
const responsePromise = page.waitForResponse('**/api/submit');
await page.getByRole('button', { name: 'Submit' }).click();
expect((await responsePromise).status()).toBe(200);
```

### AI / Long-running Async Waits

For tests involving AI responses, streaming output, or any async operation expected to take longer than ~10 seconds, read `references/ai-wait.md`.

### Dropdowns
```typescript
await page.getByLabel('Country').selectOption({ label: 'United States' });
await page.getByRole('combobox', { name: 'Country' }).click();
await page.getByRole('option', { name: 'United States' }).click();
```

---

## 9. Configuration

> **Mandatory** (prerequisite for bug reporting pipeline):
> - `reporter` must include `['json', { outputFile: '...' }]`
> - `screenshot: 'only-on-failure'`
> - `trace: 'retain-on-failure'`

Key settings (auto-generated by test-executor):
- **testDir**: `./tests/e2e` | **testMatch**: `**/testcases/**/*.test.ts`
- **baseURL**: `process.env.PREVIEW_URL`
- **Reporter**: `json` (tests/reports/) + `html`

```typescript
use: {
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
}
```

---

## 10. Best Practices

1. **Never use `page.waitForTimeout()`** — use auto-waiting or explicit event waits
2. **Use `test.describe` to group** related tests
3. **Tag annotations** for selective execution: `{ tag: ['@smoke'] }`
4. **Soft assertions** for non-blocking checks: `await expect.soft(locator).toHaveText('...')`
5. **Parameterized tests** using loops + arrays, do not copy-paste
6. **Timeout enforcement (MANDATORY)**: add `test.setTimeout()` at test level for AI or long-running tasks.

   | Scenario | `test.setTimeout` value |
   |----------|------------------------|
   | Standard AI single-turn | `180_000` (3 min) |
   | Long generation / multi-turn | `300_000` (5 min) |
   | Background job / export | `120_000` (2 min) |
   | Suspected very slow AI | `600_000` (10 min) — use sparingly |

   **Never raise `timeout` in `playwright.config.ts`** — that slows every test.

7. **Trace viewer debugging**: `pnpm exec playwright show-trace trace.zip`
8. **fullyParallel: true** but ensure test isolation
9. **afterEach cleanup** of test data
10. **Sign-out tests must use isolated context**:
```typescript
// ✅ CORRECT — isolated context, sign-out doesn't affect other tests
test('sign out redirects to login', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
  const page = await ctx.newPage();
  await signOutPage.clickSignOut();
  await expect(page).toHaveURL(/\/sign-in/);
  await ctx.close();
});
```

---

## 11. Anti-Patterns

1. `waitForTimeout(3000)` — fragile and slow
2. Sharing mutable state between tests
3. Testing implementation details instead of user behavior
4. Overly specific CSS selectors (`div > ul > li:nth-child(3)`)
5. Too many tests in a single file
6. Execution order dependencies between unrelated test cases (except CRUD, see `references/handoff-examples.md`)
7. Not using baseURL, hardcoding absolute paths
8. Directly testing third-party services (should mock)
9. **Using shared `page` for sign-out tests** — destroys shared worker auth session
10. Not cleaning up side effects

---

## 12. Debugging

```bash
pnpm exec playwright test --headed --project=e2e
pnpm exec playwright test --ui --project=e2e
pnpm exec playwright test --debug tests/e2e/testcases/x.test.ts
pnpm exec playwright codegen <url>
pnpm exec playwright show-trace test-results/.../trace.zip
```

Use `test.only` to focus on a single test, `await page.pause()` to pause and inspect.

---

## Reference files

- `references/test-data-patterns.md` — Setup/teardown code patterns (Patterns A–D), full examples for UI/API/worker-scope data prep, and setup validation logic. Read when generating tests that need data creation or CRUD ordering.
- `references/data-type-resolution.md` — Full dataType → value mapping table (contact, identity, finance, datetime, text, file). Read when a handoff entry contains a `dataType` field.
- `references/handoff-examples.md` — Complete handoff→spec example, CRUD ordering pattern, i18n-aware POM/spec patterns. Read when generating from handoff or when `projectContext.appLanguages` is set.
- `references/ai-wait.md` — AI response wait strategies (streaming, loading anchors, multi-turn, expect.poll). Read when writing any test that waits for AI content or async operations > 10 seconds.
- `references/handoff-field-resolution.md` — setup[]/teardown[] schema, assertions[].selector clarification, expected value resolution rules, timeout two-pass strategy. Read when consuming handoff fields that need non-trivial mapping.
