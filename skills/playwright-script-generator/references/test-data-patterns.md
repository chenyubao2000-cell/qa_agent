# Test Data Patterns

## Setup & Teardown Code Generation Rules

For each `test()` block, generate setup and teardown based on the test case's preconditions and postconditions from the handoff.

**1. Setup (before test action) — via UI POM methods:**
```typescript
test('Delete task removes it from list', async ({ page }) => {
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
test('Create task shows in list', async ({ page }) => {
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

**4. Data lifecycle:**
- **Shared prerequisite data** (task URL, session) → worker-scope fixture (Pattern D)
- **Per-test cleanup** (delete created record) → `test.afterEach` (ensures cleanup even on failure)
- **CRUD ordering** (create→read→update→delete) → `test.describe.serial` (for ordering, NOT for data sharing)
- **Inline setup** (fill a form field) → directly in test body

**5. POM must include setup/teardown methods:**
```typescript
export class TasksPage {
  async createTask(name: string) { /* navigate, click create, fill name, submit */ }
  async deleteTask(name: string) { /* find task, click delete, confirm */ }
  getTaskByName(name: string) { return this.page.getByText(name); }
}
```

**6. Handoff integration:**
- `setup[]` with `type: "fixture"` → destructure named fixture from Fixture Registry (see `.claude/references/test-data-setup.md`)
- `setup[]` with `type: "ui"` → UI operations needed before the test action
- `teardown[]` field → UI cleanup needed after
- `pomMethod` field in each entry → maps directly to a POM method name
- `{timestamp}` placeholders → replace with `Date.now()` in generated code
- `fixtureId` field → maps to fixture name via Fixture Registry. **Generator MUST validate fixtureId exists.**

**7. Setup validation (MANDATORY before generating each test):**

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
         "ERROR: TC-{id} is a {type} operation but has no setup or preconditions."

  Step 3 — Generate teardown:
    If type is Create → generate teardown to delete created data
    If type is Delete → no teardown needed (test itself is the cleanup)
    If type is Read/Update/Download/List → generate teardown to delete setup-created data
    If teardown[] exists in handoff → use it; otherwise infer from setup (reverse operations)
```

---

## Data Preparation Patterns (§1.5)

**Pattern A — DEPRECATED (do NOT use for new code):**

> ⚠️ beforeAll has a hidden 60s default timeout, requires `serial` wrapper, and prevents parallel execution.
> Use Pattern D (worker-scope fixture) instead. Pattern A is kept here only as reference for understanding legacy code.

<details><summary>Legacy Pattern A code (click to expand)</summary>

```typescript
// ❌ DEPRECATED — do NOT copy this pattern
test.describe.serial('Canvas Preview', { tag: ['@all'] }, () => {
  let taskUrl: string;
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto('/task');
    await page.getByRole('textbox', { name: /please enter/ }).fill('Help me find a full-stack engineer');
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForSelector('text=Task completed', { timeout: 120_000 });
    taskUrl = page.url();
    await ctx.close();
  });
  test('test', async ({ page }) => { await page.goto(taskUrl); });
});
```
</details>

**Pattern B — DEPRECATED (same issues as Pattern A):**

<details><summary>Legacy Pattern B code (click to expand)</summary>

```typescript
// ❌ DEPRECATED — use Pattern D with request fixture instead
test.describe('File Download', { tag: ['@all'] }, () => {
  let taskId: string;
  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    const resp = await request.post('/api/tasks', { data: { prompt: '...' } });
    taskId = (await resp.json()).id;
    await expect.poll(async () => {
      return (await (await request.get(`/api/tasks/${taskId}`)).json()).status;
    }, { timeout: 120_000 }).toBe('completed');
  });
  test('test', async ({ page }) => { await page.goto(`/task/${taskId}`); });
});
```
</details>

**Pattern C — No data creation needed (the test IS the create operation):**
```typescript
test('After creating a task, redirects to task detail page', async ({ page }) => {
  await page.goto('/task');
  await page.getByRole('textbox').fill('Test content');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(/\/task\/.+/);
});
```

**Pattern D — Worker-scope fixture (RECOMMENDED for all data creation):**

> ✅ Independent timeout (not limited by beforeAll 60s). Runs once per worker. Tests stay parallel. No `serial` wrapper needed.

```typescript
// fixtures.ts — worker-scope fixture
// IMPORTANT: AI workflows may present interactive blockers (clarification forms,
// consent dialogs) before producing results. Use waitWithBlockerDismissal()
// from ai-wait.md Strategy F to handle these automatically.
// IMPORTANT: Worker-scope fixtures don't get the ensureAuthenticated auto-fixture.
// Check for session expiry after navigation and call reAuthenticate() if needed.
// See session-guard.md for the reAuthenticate() helper.
taskWithFilesUrl: [async ({ browser }, use) => {
  const ctx = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
  const page = await ctx.newPage();
  await page.goto('/task');

  // Session guard — worker-scope fixtures must check manually
  if (page.url().includes('/sign-in')) {
    await reAuthenticate(page);
    await page.goto('/task');
  }

  await page.locator('textarea').fill('Create a recruiting task');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

  // Wait for result, auto-dismissing any clarification forms
  const resultCard = page.locator('[role="log"] div[role="button"]').filter({
    hasText: /\.pptx|\.pdf|PPT|PDF/i,
  }).first();
  await waitWithBlockerDismissal(page, resultCard);
  await use(new URL(page.url()).pathname);
  await ctx.close();
}, { scope: 'worker', timeout: 360_000 }],  // ← independent timeout, 6 minutes

// In spec — no beforeAll, no serial, just destructure the fixture
test('Canvas preview works', async ({ page, taskWithFilesUrl }) => {
  await page.goto(taskWithFilesUrl);
});
```

> **Blocker handling**: AI apps often interpose clarification forms, consent dialogs, or error retries between user input and result output. Fixtures MUST handle these — see `ai-wait.md` Strategy F for the reusable `waitWithBlockerDismissal()` helper and common blocker patterns.

**Handoff example for Pattern D:**
```json
{
  "setup": [{
    "type": "fixture",
    "fixtureId": "tool-chain"
  }]
}
```
Generator reads `fixtureId: "tool-chain"` → looks up Fixture Registry → finds `taskWithToolChainUrl` → generates:
```typescript
test('...', async ({ page, i18n, taskWithToolChainUrl }) => {
  await page.goto(taskWithToolChainUrl, { timeout: 60_000, waitUntil: 'domcontentloaded' });
  // ...
});
```

**Why Pattern D over Pattern A/B:**

| | Pattern A/B (beforeAll) | Pattern D (worker-scope fixture) |
|---|---|---|
| Timeout | Shares test timeout (default 60s) | Independent (`{ timeout: 360_000 }`) |
| Execution | Once per describe | Once per worker (fewer runs) |
| Parallelism | Requires `serial` wrapper | Tests stay parallel |
| Complexity | `let` variable + serial + setTimeout | Clean fixture parameter |
| Handoff signal | — | `setup[].type = "fixture"`, `fixtureId` from registry |
| Validation | Runtime error | Generation-time error (fixtureId validated) |
