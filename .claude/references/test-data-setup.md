# Test Data Setup — Shared Reference

> **Scope**: this file covers the **execution-time** data-setup pipeline — how the three-stage
> Playwright project chain runs, the fixture fast-path pattern, and ops guidance (workers,
> env switching). Used by all commands that generate or execute Playwright specs.
> Commands MUST reference this file, NOT duplicate these patterns inline.
>
> **Generation-time mechanics live in the skill, not here**: how `data.setup.ts`/`fixtures.ts`
> get generated from `test-data.config.json`, the Fixture Registry, and CRUD/abstraction workflows
> are all owned by `skills/test-data-setup/SKILL.md` (config schema, generation rules, CRUD
> cheatsheet, inline→fixture abstraction flow) and `skills/test-data-setup/references/fixture-registry.md`
> (validation rules). Don't duplicate those here — link to them.

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

Pattern: `E2E_{SCREAMING_SNAKE_CASE}_URL` → camelCase key in `.test-data.json`. The current
per-project list of fixture keys/env vars lives in that project's `test-data.config.json`
(schema + example in `skills/test-data-setup/SKILL.md` §输入).

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

## Fixture Registry, CRUD & Abstraction

Moved to the skill — this file no longer keeps its own copy:

- **Fixture Registry** (fixtureId ↔ fixture name ↔ env var ↔ timeout): the authoritative source is
  each project's `test-data.config.json`. See `skills/test-data-setup/SKILL.md` §输入 for the schema
  and §Fixture Registry 校验 for validation rules (also `references/fixture-registry.md`).
- **Adding / updating / removing a fixture** (CRUD): `skills/test-data-setup/SKILL.md` §CRUD 操作速查.
- **Abstracting repeated inline data creation into a shared fixture**: `skills/test-data-setup/SKILL.md`
  §抽象模式（路径 B → A）— scan → cluster → propose → execute, with safety rules.

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

Adding a new fixture (checklist, generation-time detail): `skills/test-data-setup/SKILL.md` §CRUD 操作速查.
