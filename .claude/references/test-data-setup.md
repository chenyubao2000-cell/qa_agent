# Test Data Setup — Shared Reference

> **Authoritative source**: This file defines the test data management strategy for E2E tests.
> Covers: data-setup pipeline, fixture data lifecycle, worker-scope patterns.
> Used by: all commands that generate or execute Playwright specs.
> Commands MUST reference this file, NOT duplicate the patterns inline.
>
> **Skill**: 通用生成能力已沉淀到 `skills/test-data-setup/SKILL.md`。
> 项目专属配置声明在各项目的 `test-data.config.json` 中。
> Fixture Registry 校验规则见 `skills/test-data-setup/references/fixture-registry.md`。

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

## Fixture Registry (Authoritative Source)

> **This table is the single source of truth** for all fixture data types.
> Handoff JSON, fixtures.ts, data.setup.ts, and playwright-script-generator MUST all reference this registry.
> Adding/removing a fixture requires updating ALL four locations.

| fixtureId | Fixture name | Env var | Data description | Timeout |
|---|---|---|---|---|
| `file-gen` | `taskWithFilesUrl` | `E2E_TASK_WITH_FILES_URL` | Completed task with generated files (PPT, etc.) | 480_000 |
| `code-gen` | `taskWithCodeUrl` | `E2E_TASK_WITH_CODE_URL` | Completed task with code generation output | 480_000 |
| `people-data` | `taskWithPeopleDataUrl` | `E2E_TASK_WITH_PEOPLE_DATA_URL` | Completed task with people/candidate search results | 360_000 |
| `tool-chain` | `taskWithToolChainUrl` | `E2E_TASK_WITH_TOOL_CHAIN_URL` | Completed multi-tool-chain task (search + files + code) | 600_000 |
| `share` | `shareUrl` | `E2E_SHARE_URL` | Share page URL with access token | 600_000 |

### Handoff→Fixture mapping

Handoff `setup[]` entries use `fixtureId` to reference the registry:

```json
{
  "setup": [{
    "type": "fixture",
    "fixtureId": "tool-chain"
  }]
}
```

The playwright-script-generator maps `fixtureId` → fixture name from the registry:
- `"tool-chain"` → destructure `taskWithToolChainUrl` in test function
- Unknown `fixtureId` → **ERROR** at generation time (not runtime)

### When NO fixtureId fits

If a test needs pre-existing data that doesn't match any registry entry:
1. **Check if an existing fixture covers the need** — e.g., a test needing "a completed task with any files" can reuse `file-gen` even if the exact files differ
2. **If no match**: add a new entry to the registry, then follow the CRUD checklist below

## Data Dependency Flows

### Forward: New Data → New Tests

When adding a new fixture type (e.g., a new kind of AI task):

```
1. Add to Fixture Registry table above (fixtureId, name, env var)
2. Add to fixtures.ts: type + implementation with fast-path pattern
3. Add to data.setup.ts: parallel creation entry
4. Handoff generator can now emit setup[].fixtureId referencing the new entry
5. Specs generated by any command automatically use the new fixture
```

### Backward: Existing Tests → Abstract Common Data

When multiple specs independently create similar data (e.g., several specs each create a task in `beforeAll`):

```
1. Identify the pattern: grep for repeated beforeAll/setup patterns across specs
2. Check Fixture Registry: does an existing fixtureId cover this?
   - YES → refactor specs to use the existing fixture
   - NO → create new registry entry (follow Forward flow)
3. Replace inline setup with fixture destructuring:
   BEFORE: test.beforeAll(async ({browser}) => { /* create task */ })
   AFTER:  test('...', async ({ page, taskWithXxxUrl }) => { ... })
4. Remove the describe.serial wrapper (no longer needed)
```

## CRUD Impact on Fixture Data

### Create (adding new fixture)
1. Add entry to **Fixture Registry** table
2. Add type to `TestDataFixtures` in **fixtures.ts**
3. Add creation entry to **data.setup.ts** (inside `Promise.allSettled` task list)
4. Update **handoff-field-resolution.md** with new `fixtureId` value
5. Verify: `npx playwright test --list` should show data-setup test

### Read (referencing existing fixture)
- Handoff emits `setup[].fixtureId = "xxx"` → generator maps to fixture name
- Generator **MUST validate** fixtureId exists in registry before generating spec
- If unknown fixtureId → stop and flag error, don't generate broken spec

### Update (changing fixture behavior)
- Changing prompt/wait pattern → update **fixtures.ts** + **data.setup.ts** (both must match)
- Changing timeout → update **Fixture Registry** table + fixtures.ts `{ timeout: ... }`
- After update: delete `playwright/.test-data.json` to force recreation

### Delete (removing unused fixture)
1. Grep all specs for the fixture name — ensure zero references
2. Remove from **Fixture Registry** table
3. Remove type from `TestDataFixtures` in fixtures.ts
4. Remove creation entry from data.setup.ts
5. Remove env var from `.env` (if set)

## Parallel Data Creation

data.setup.ts creates all missing fixture data **in parallel** using `Promise.allSettled`:

```
┌─ Browser ─────────────────────────────────────┐
│  Context 1 → Page 1 → createTask(code-gen)    │ ─┐
│  Context 2 → Page 2 → createTask(file-gen)    │  │
│  Context 3 → Page 3 → createTask(people-data) │  ├─ Promise.allSettled
│  Context 4 → Page 4 → createTask(tool-chain)  │  │
│  Context 5 → Page 5 → createShare()           │ ─┘
└───────────────────────────────────────────────┘
                    ↓
         playwright/.test-data.json
```

- Each task gets its **own browser context** (isolated cookies/session)
- All share the same `browser` instance (Playwright manages the multiplexing)
- `Promise.allSettled` not `Promise.all` — partial success writes what succeeded
- Total time ≈ slowest task (~5 min for tool-chain), not sum of all (~15 min serial)

> **Workers vs Promise.allSettled**: Playwright's `workers` config controls how many **test files** run in parallel. data-setup is a single test file with one test that internally parallelizes via `Promise.allSettled`. The `workers` setting does not affect data-setup's internal parallelism.

## Checklist for Adding New Fixtures

When a spec needs new pre-existing data:

1. Check **Fixture Registry** — does an existing fixtureId cover the need?
2. If no match, add entry to **Fixture Registry** table above
3. Add fixture to `TestDataFixtures` type in fixtures.ts
4. Add `readTestData('newFixture')` fast path in fixture definition
5. Add creation logic to `data.setup.ts` (inside the parallel task list)
6. Update `handoff-field-resolution.md` with new fixtureId value
7. Keep inline creation fallback in fixture for single-file runs
8. Use `scope: 'worker'` + `{ browser }` pattern
9. Verify: run data-setup alone → check `.test-data.json` has the new key
