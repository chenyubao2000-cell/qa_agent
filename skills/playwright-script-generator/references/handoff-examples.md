# Handoff Mapping Examples

## §1.3 Complete handoff → spec example

**Input handoff entry:**
```json
{
  "id": "TC-001", "storyId": "US-101",
  "title": "Successful login with valid credentials",
  "priority": "P0",
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

**Generated spec:**
```typescript
test.describe('US-101 · User Login', () => {
  test('TC-001 · Successful login with valid credentials', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('ValidPass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });
});
```

---

## §1.4 CRUD Test Case Dependency Ordering

CRUD scenarios (create, edit, delete, detail/view) have natural dependencies. When generating specs:

**Mandatory rules:**
1. CRUD test cases for the same module → single `test.describe.serial` block
2. Create test case must come first
3. Data produced by create (name, ID) is shared via `test.describe`-level variables
4. Delete must come last

**Recommended order:** Create → Detail/View → Edit → Delete

```typescript
test.describe.serial('Order Management CRUD', { tag: ['@all'] }, () => {
  let createdOrderName: string;

  test('Create order', async ({ page }) => {
    createdOrderName = `Order-${Date.now()}`;
    // ... create operation ...
    await expect(page.getByText(createdOrderName)).toBeVisible();
  });

  test('View order details', async ({ page }) => {
    await page.getByText(createdOrderName).click();
    await expect(page).toHaveURL(/\/orders\/\d+/);
  });

  test('Edit order', async ({ page }) => {
    await page.getByText(createdOrderName).click();
    // ... edit operation ...
  });

  test('Delete order', async ({ page }) => {
    await page.getByText(createdOrderName).click();
    // ... delete operation ...
  });
});
```

**Handling during handoff mapping:**
- Scan test case titles under the same `storyId` for CRUD keywords (create/new, edit/modify/update, delete/remove, detail/view)
- Group them into `test.describe.serial`
- Non-CRUD test cases still use regular `test.describe` (parallel)

---

## §2.3.1 i18n-Aware Locators

**i18n prerequisite check** (before generating any i18n-aware code):
When `projectContext.appLanguages` is set, verify:
1. `projectContext.i18nMessagesDir` is set AND directory exists → proceed with `i18n.t()` pattern
2. `i18nMessagesDir` is null or missing → WARNING: fall back to regex pattern; still generate POM with `i18n?: I18n` parameter

**FORBIDDEN anti-patterns (when appLanguages is set):**
1. ❌ `import enMessages from '../../messages/en.json'` — spec must NOT import message files directly
2. ❌ `makeI18n()` or any custom i18n helper — use the `i18n` fixture from `fixtures.ts`
3. ❌ Separate `test.describe` blocks for zh/i18n — ALL tests run for both languages via Playwright projects
4. ❌ `changeLanguage("zh")` or manual switching — NEXT_LOCALE cookie set automatically by each project

**Required POM constructor pattern:**
```typescript
type I18n = { t: (key: string) => string; locale: string };

export class CanvasPage {
  constructor(private readonly page: Page, private readonly i18n?: I18n) {}

  // Language-agnostic (preferred)
  getDownloadButton() { return this.page.locator('button[title="Download file"]'); }

  // i18n-aware (when text is the only differentiator)
  getMaximizeButton() {
    return this.i18n
      ? this.page.getByRole('button', { name: this.i18n.t('canvas.maximize') })
      : this.page.getByRole('button', { name: /Maximize|最大化/i });
  }
}
```

**Required spec generation pattern:**
```typescript
import { test, expect } from '../../fixtures';
import { CanvasPage } from '../../pages/canvas.page';

test.describe('Canvas Preview', () => {
  test('download button visible', async ({ page, i18n }) => {
    const canvas = new CanvasPage(page, i18n);
    await page.goto('/task/abc');
    await expect(canvas.getDownloadButton()).toBeVisible();
  });
});
```

**i18n key discovery:**
1. If `i18nMessagesDir` available → read default locale JSON, reverse-lookup text to find key
2. If handoff has `i18nKey` field → use it directly
3. If neither → use bilingual regex fallback (`/English|中文/i`)

**POM locator from handoff i18nKey:**
```typescript
// When uiElement.i18nKey is present
getDownloadButton() {
  return this.i18n
    ? this.page.getByRole('button', { name: this.i18n.t('canvas.downloadFile') })
    : this.page.getByRole('button', { name: /Download file|下载文件/i });
}

// When uiElement.i18nKey is null
getDownloadButton() {
  return this.page.getByRole('button', { name: /Download file/i });
}

// Assertion with i18nKey
await expect(canvas.getToast()).toHaveText(i18n.t('toast.downloadSuccess'));
```

When `appLanguages` is NOT set: do NOT import i18n from fixtures, do NOT pass i18n to POM constructors.
