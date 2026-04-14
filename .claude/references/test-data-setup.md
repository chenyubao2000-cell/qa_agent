# Test Data Setup — Shared Reference

> **Authoritative source**: This file defines the test data management strategy for E2E tests.
> Covers: data-setup pipeline, fixture data lifecycle, worker-scope patterns.
> Used by: all commands that generate or execute Playwright specs.
> Commands MUST reference this file, NOT duplicate the patterns inline.

## Problem

E2E tests often depend on expensive pre-existing data (e.g., completed AI tasks with generated files).
Creating this data in every test or every worker causes:
- **Server overload**: N workers × M tests = hundreds of simultaneous task creations
- **Timeout failures**: fixture creation blocks test execution for 2-10 minutes per task
- **Flaky results**: parallel creation causes race conditions and session conflicts

## Solution: Three-Stage Pipeline

```
setup(auth) → data-setup(parallel data creation) → e2e-*(N workers parallel)
```

### Stage 1: auth setup
Existing `auth.setup.ts` — authenticates and saves session state.

### Stage 2: data-setup (NEW)
`data.setup.ts` — creates all expensive test data in parallel (each task gets its own browser context via `Promise.allSettled`), writes URLs to `playwright/.test-data.json`.
Only creates data that isn't already cached or set via env vars.

### Stage 3: test execution
Test projects run with multiple workers. All fixtures read from env vars or `.test-data.json` — zero creation overhead.

## Data Flow

```
Env vars (E2E_TASK_WITH_*_URL)     ← CI / manual preset (highest priority)
         ↓ fallback
.test-data.json                    ← data-setup creates, 24h TTL
         ↓ fallback
Fixture inline creation            ← last resort, single-file runs
```

## Key Patterns

### 1. readTestData helper (in fixtures.ts)

```typescript
import path from 'node:path';
import fs from 'node:fs';

const TEST_DATA_PATH = path.join(__dirname, '..', '..', 'playwright', '.test-data.json');

function readTestData(key: string): string | undefined {
  try {
    if (!fs.existsSync(TEST_DATA_PATH)) return undefined;
    const data = JSON.parse(fs.readFileSync(TEST_DATA_PATH, 'utf-8'));
    return data[key] || undefined;
  } catch { return undefined; }
}
```

### 2. Fixture fast-path pattern

Every expensive fixture MUST follow this pattern:

```typescript
fixtureUrl: [async ({ browser }, use) => {
  // 1. Check env var → check .test-data.json → skip creation if found
  const presetUrl = process.env.E2E_FIXTURE_URL || readTestData('fixtureUrl');
  if (presetUrl) {
    console.log(`[fixture:fixtureUrl] Using preset URL: ${presetUrl}`);
    await use(presetUrl);
    return;
  }

  // 2. Fallback: create via UI (only when no data-setup ran)
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  try {
    // ... creation logic
    await use(new URL(page.url()).pathname);
  } finally {
    await ctx.close().catch(() => {});
  }
}, { scope: 'worker', timeout: 480_000 }],
```

**Critical rules:**
- **Always `scope: 'worker'`** for data-creating fixtures — test-scope creates data per test case (N×)
- **Always `{ browser }` not `{ page }`** — worker-scoped fixtures can't use test-scoped `page`
- **Always `try/finally`** with `ctx.close()` — worker-scoped contexts must be cleaned up
- **Always check env var AND readTestData** — supports both CI presets and local data-setup
- **Always keep inline creation as fallback** — supports single-file runs without data-setup

### 3. Env var naming convention

| Fixture key | Env var | Description |
|---|---|---|
| `taskWithFilesUrl` | `E2E_TASK_WITH_FILES_URL` | Task with generated files (PPT, etc.) |
| `taskWithPeopleDataUrl` | `E2E_TASK_WITH_PEOPLE_DATA_URL` | Task with people data results |
| `taskWithCodeUrl` | `E2E_TASK_WITH_CODE_URL` | Task with code generation |
| `taskWithToolChainUrl` | `E2E_TASK_WITH_TOOL_CHAIN_URL` | Task using multiple tool chains |
| `shareUrl` | `E2E_SHARE_URL` | Share page URL with token |

Pattern: `E2E_{SCREAMING_SNAKE_CASE}_URL` → camelCase key in `.test-data.json`.

### 4. data.setup.ts structure

```typescript
// Key responsibilities:
// 1. Check each key: env var → cached JSON → needs creation
// 2. Create missing data IN PARALLEL — each task gets its own browser context
// 3. Use Promise.allSettled to collect results (partial success is OK)
// 4. Write all URLs to playwright/.test-data.json with _createdAt timestamp
// 5. 24h TTL — stale cache is ignored and recreated

setup('create test data', async ({ browser }) => {
  const cached = readTestData();
  const results = { ...cached };
  const tasks: Array<{ key: string; promise: Promise<string> }> = [];

  if (needsCreation('taskWithCodeUrl', 'E2E_TASK_WITH_CODE_URL', cached)) {
    tasks.push({ key: 'taskWithCodeUrl', promise: createInContext(browser, prompt, waitPattern) });
  }
  // ... repeat for each fixture

  const settled = await Promise.allSettled(tasks.map(t => t.promise));
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results[tasks[i].key] = r.value;
  });
  writeTestData(results);
});
```

### 5. playwright.config.ts project chain

```typescript
projects: [
  // Stage 1: auth
  ...(hasAuth ? [{ name: 'setup', testMatch: /auth\.setup\.ts/ }] : []),
  // Stage 2: data creation (depends on auth)
  {
    name: 'data-setup',
    testMatch: /data\.setup\.ts/,
    timeout: 20 * 60_000,
    ...(hasAuth ? { dependencies: ['setup'] } : {}),
  },
  // Stage 3: test execution (depends on data-setup, runs with N workers)
  ...testProjects.map(p => ({
    ...p,
    ...(hasAuth ? { dependencies: ['data-setup'] } : {}),
  })),
],
```

## Environment Switch Workflow

1. Change `PREVIEW_URL` in `.env`
2. Delete `playwright/.test-data.json` (or wait 24h for TTL expiry)
3. Run tests → data-setup auto-creates all needed data → subsequent runs use cache

## Workers Guidelines

| Environment | Workers | Rationale |
|---|---|---|
| Local dev | 5 | Preview server can handle 5 concurrent browser sessions |
| CI | 3 | Shared resources, conservative |
| Single file debug | 1 | Use `--workers=1` override |

Config: `workers: process.env.CI ? 3 : 5`

> **10 workers is too many** for single-instance preview servers. Causes page load timeouts even for simple tests (sign-in, home page). 5 workers is the sweet spot for most preview environments.

## Checklist for Adding New Fixtures

When a spec needs new pre-existing data:

1. Add fixture to `TestDataFixtures` type in fixtures.ts
2. Add env var `E2E_NEW_FIXTURE_URL` to env var table above
3. Add `readTestData('newFixture')` fast path in fixture definition
4. Add creation logic to `data.setup.ts` with `needsCreation()` check
5. Keep inline creation fallback in fixture for single-file runs
6. Use `scope: 'worker'` + `{ browser }` pattern
