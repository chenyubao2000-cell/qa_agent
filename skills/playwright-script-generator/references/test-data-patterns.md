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

**4. When to use `test.beforeEach` / `test.afterEach`:**
- If ALL tests in a `test.describe` need the same setup → use `beforeEach`
- If cleanup is needed regardless of test pass/fail → use `afterEach` (ensures teardown even on failure)
- Individual tests with unique setup → inline setup in the test body

**5. POM must include setup/teardown methods:**
```typescript
export class TasksPage {
  async createTask(name: string) { /* navigate, click create, fill name, submit */ }
  async deleteTask(name: string) { /* find task, click delete, confirm */ }
  getTaskByName(name: string) { return this.page.getByText(name); }
}
```

**6. Handoff integration:**
- `setup[]` field → UI operations needed before the test action
- `teardown[]` field → UI cleanup needed after
- `pomMethod` field in each entry → maps directly to a POM method name
- `{timestamp}` placeholders → replace with `Date.now()` in generated code

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

**Pattern A — Create data via UI operations (recommended):**
```typescript
test.describe.serial('Canvas Preview', { tag: ['@all'] }, () => {
  let taskUrl: string;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
    const page = await ctx.newPage();
    await page.goto('/task');
    await page.getByRole('textbox', { name: /please enter/ }).fill('Help me find a full-stack engineer');
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForSelector('text=Task completed', { timeout: 120_000 });
    taskUrl = page.url();
    await ctx.close();
  });

  test('Canvas shows download button after file opens', async ({ page }) => {
    await page.goto(taskUrl);
  });
});
```

**Pattern B — Create data via API (faster, large amounts of prerequisite data):**
```typescript
test.describe('File Download', { tag: ['@all'] }, () => {
  let taskId: string;

  test.beforeAll(async ({ request }) => {
    const resp = await request.post('/api/tasks', {
      data: { prompt: 'Help me find a full-stack engineer' },
    });
    const body = await resp.json();
    taskId = body.id;
    await expect.poll(async () => {
      const r = await request.get(`/api/tasks/${taskId}`);
      return (await r.json()).status;
    }, { timeout: 120_000 }).toBe('completed');
  });

  test('Download button triggers file download', async ({ page }) => {
    await page.goto(`/task/${taskId}`);
  });
});
```

**Pattern C — No data creation needed (the test IS the create operation):**
```typescript
test('After creating a task, redirects to task detail page', async ({ page }) => {
  await page.goto('/task');
  await page.getByRole('textbox').fill('Test content');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(/\/task\/.+/);
});
```

**Pattern D — Worker-scope fixture for expensive shared data:**
```typescript
// fixtures.ts — worker-scope fixture
testDataContext: [async ({ browser }, use) => {
  const ctx = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
  const page = await ctx.newPage();
  await page.goto('/task');
  await page.getByRole('textbox', { name: /please enter/i }).fill('Create a recruiting task');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.waitForSelector('text=Task completed', { timeout: 300_000 });
  const data = { taskUrl: page.url() };
  await ctx.close();
  await use(data);
}, { scope: 'worker' }],

// In spec — no beforeAll needed
test('Canvas preview works', async ({ page, testDataContext }) => {
  await page.goto(testDataContext.taskUrl);
});
```

**When to use worker-scope vs beforeAll:**
| Criterion | beforeAll (Pattern A) | worker-scope fixture (Pattern D) |
|-----------|----------------------|----------------------------------|
| Setup cost | < 30 seconds | > 30 seconds (AI tasks, file processing) |
| Sharing scope | Within one test.describe | Across all tests in the same worker |
| Data mutation | Tests may modify data | Tests only read data (read-only shared) |
| Handoff signal | `setup[].scope` absent or `"test"` | `setup[].scope = "worker"` |
