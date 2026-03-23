---
description: Explore pages open in the browser, generate E2E test baselines (page-baseline.json), then chain test-case-generator + playwright-script-generator skills to produce test cases and scripts
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

You are a page explorer. Automatically explore pages open in the browser via chrome-devtools MCP, **exploring and writing incrementally**, generating E2E test artifacts by functional area.

## Workflow

```
/qa-explore [page-url] [--source <source-code-dir>] [natural language description]
     |
Phase 0: Load project context (.env -> config)
     |
Phase 1: Initial scan -> Identify initial functional area list (lightweight, only scan State_0)
     |
Phase 2: Incremental loop (core logic)
         for each functional area:
           a. Deep explore the area (CDP interaction, BFS from seed elements)
           a2. Dynamic area discovery (append newly revealed areas to the list)
           b. Generate a mini-baseline for that area
           c. e2e-orchestrator -> test cases + POM + spec (only for that area)
           d. Locator verification
           e. If the user-requested count is reached -> break out of loop
     |
Phase 2.5: Cross-area flow discovery
         Identify cross-area edges + page navigations -> integration test cases
     |
Phase 3: Unified execution (no Linear reporting)
         test-executor -> execute all accumulated specs -> local report only
```

## User Intent Parsing

Parse user intent from `$ARGUMENTS` to determine exploration scope:

| User Input | Parsed Result |
|------------|---------------|
| `(no arguments)` | Full exploration, all areas |
| `explore N test cases` | Only explore the most valuable area + N test cases |
| `explore form` / `explore login` | `targetArea = "form"/"login"`, only explore matching areas |
| `https://xxx/join-waitlist` | Specified URL, full exploration of that page |
| `https://xxx/join-waitlist N cases` | Specified URL + limit count |
| `https://xxx/join-waitlist https://xxx/join-waitlist2...` | Multiple URLs, explore cross-page functional relationships, full |
| `https://xxx/join-waitlist https://xxx/join-waitlist2... N cases` | Multiple URLs, explore cross-page functional relationships + limit count |

Parsing rules:
1. Contains URL -> use as exploration URL
2. Contains functional keywords (form/navigation/modal/Tab etc.) -> set as `targetArea` filter
3. N cases refers to how many test cases to generate; avoid over-generating to control exploration time

---

## Phase 0: Load Context + Initialize Workspace (mandatory, execute first)

### Step 1 — Read .env + Build projectContext

```
Read(".env")  # valition_agent root directory
Read("$SOURCE_PROJECT_DIR/CLAUDE.md")  # tech stack (read source code only to understand business)
```

Source code directory priority: `--source` in `$ARGUMENTS` > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`

Extract all config from **this project's .env**:
- `QA_WORKSPACE_DIR` — target project root directory
- `baseURL` — `PLAYWRIGHT_BASE_URL`, fallback to `PREVIEW_URL`
- `authSetup` — `E2E_TEST_EMAIL` has value -> requires auth state
- `testCredentials` — `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`
- `techStack` — from source directory CLAUDE.md
- `appLanguages` — `APP_LANGUAGES` from .env (comma-separated, e.g., "en,zh"), default: single project mode
- `i18nMessagesDir` — `I18N_MESSAGES_DIR` from .env (i18n 消息文件的**源路径**，用于复制到目标项目), default: null
- `defaultLocale` — first language in APP_LANGUAGES, or infer from source project

### Step 2 — Initialize Workspace (empty folder compatible, skip all if already initialized)

Check `$QA_WORKSPACE_DIR`; if it doesn't exist or is empty, perform initialization: create `$QA_WORKSPACE_DIR` if it doesn't exist

#### 2a. Copy .env (if not present)

Write Playwright-related variables from this project's `.env` into `$QA_WORKSPACE_DIR/.env`:

```
PLAYWRIGHT_BASE_URL=<from this project's .env>
PLAYWRIGHT_HEADLESS=<from this project's .env>
E2E_TEST_EMAIL=<from this project's .env>
E2E_TEST_PASSWORD=<from this project's .env>
```

> dotenv loads this file in playwright.config.ts and global-setup.ts.

#### 2b. Directory Structure (skip if exists)

```bash
mkdir -p tests/e2e/testcases/generated tests/e2e/pages tests/e2e/.auth tests/e2e/test-data/files
mkdir -p tests/reports/combined test-cases/generated test-cases/excel test-results messages
```

#### 2b-1. Copy i18n Messages (when APP_LANGUAGES is set, skip if messages/ already exists)

```bash
# 将源项目的 i18n 消息文件复制到 $QA_WORKSPACE_DIR/messages/
# 这样 fixtures.ts 使用本地相对路径引用，不依赖源码位置
if [ -n "$I18N_MESSAGES_DIR" ] && [ ! -f "$QA_WORKSPACE_DIR/messages/en.json" ]; then
  cp "$I18N_MESSAGES_DIR"/*.json "$QA_WORKSPACE_DIR/messages/"
  echo "Copied i18n messages to $QA_WORKSPACE_DIR/messages/"
fi
```

> **为什么复制而非引用**：生成的 fixtures.ts 用 `import from '../messages/en.json'`（本地相对路径），
> 不依赖 SOURCE_PROJECT_DIR 在测试运行时可达。复制一次，后续执行自包含。

#### 2c. Install Playwright (if package.json doesn't exist)

```bash
npm init -y && npm install -D @playwright/test dotenv && npx playwright install chromium
```

#### 2d. Generate playwright.config.ts (if not present)

```typescript
import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

config();

export default defineConfig({
  testDir: "./tests/e2e",
  ...(fs.existsSync("./tests/e2e/global-setup.ts") ? { globalSetup: "./tests/e2e/global-setup.ts" } : {}),
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: "./test-results",
  reporter: [
    ["json", { outputFile: "tests/reports/playwright-results.json" }],
    ["html", { open: "never" }],
  ],
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    locale: process.env.APP_LANGUAGES?.split(',')[0]?.trim() === 'zh' ? 'zh-CN' : 'en-US',
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  // ── i18n multi-language projects ──
  // When APP_LANGUAGES is set (e.g., "en,zh"), generate one project per language.
  // Each project sets locale + NEXT_LOCALE cookie to switch app language.
  // When APP_LANGUAGES is not set, generate a single "e2e" project (default behavior).
  projects: process.env.APP_LANGUAGES
    ? process.env.APP_LANGUAGES.split(',').map(lang => ({
        name: `e2e-${lang.trim()}`,
        testDir: "./tests/e2e",
        testMatch: "**/testcases/**/*.test.ts",
        use: {
          ...devices["Desktop Chrome"],
          locale: lang.trim() === 'zh' ? 'zh-CN' : lang.trim(),
          extraHTTPHeaders: { 'Cookie': `NEXT_LOCALE=${lang.trim()}` },
        },
      }))
    : [{
        name: "e2e",
        testDir: "./tests/e2e",
        testMatch: "**/testcases/**/*.test.ts",
        use: { ...devices["Desktop Chrome"] },
      }],
  // ── NEXT_LOCALE cookie 说明 ──
  // cookie 值使用短码（"en", "zh"）匹配 next-intl 的 locale 配置
  // Playwright 的 locale 字段使用标准码（"en-US", "zh-CN"）用于浏览器行为（日期格式等）
  // 两者不需要完全一致：cookie 控制 app 语言，locale 控制浏览器行为
});
```

> **配置说明**:
> - `reporter`: 始终输出 JSON（供 report-analyzer 消费）+ HTML（供人工查看）。test-executor 命令行也会覆盖此设置以确保双输出
> - `headless`: 由环境变量控制，默认 true。目标项目 config 可能硬编码 false，test-executor 的 `--reporter` 覆盖不影响 headless，需要通过 .env 的 `PLAYWRIGHT_HEADLESS` 控制
> - `retries`: CI 环境重试 1 次，减少 flaky 误报；本地不重试，快速暴露问题
> - `trace` + `video`: 失败时保留，用于排查。`on-first-retry` 不如 `retain-on-failure`（不需要 retry 也能留证据）
> - `locale`: 动态推断——有 APP_LANGUAGES 时用首语言，无则默认 `en-US`。各语言 project 独立设置 locale。
> - `outputDir`: 显式指定，避免产物散落
> - `expect.timeout`: 默认 5s 对远程环境偏短，设为 10s

#### 2e. Generate fixtures.ts (if not present)

**With E2E_TEST_EMAIL** -> full version with auth:

```typescript
import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

type TestFixtures = { authenticatedPage: Page };
type WorkerFixtures = { authenticatedContext: BrowserContext };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  authenticatedContext: [async ({ browser }, use) => {
    const ctx = fs.existsSync(AUTH_FILE)
      ? await browser.newContext({ storageState: AUTH_FILE })
      : await browser.newContext();
    await use(ctx);
    await ctx.close();
  }, { scope: "worker" }],

  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
```

**With APP_LANGUAGES** → add i18n fixture to fixtures.ts (after authenticatedPage fixture):

```typescript
// ── i18n fixture (auto-generated when APP_LANGUAGES is set) ──
// messages/ 目录由 Phase 0 Step 2b-1 从源项目复制到 QA_WORKSPACE_DIR/messages/
import enMessages from '../messages/en.json';
import zhMessages from '../messages/zh.json';
// ... import additional locales as needed from APP_LANGUAGES

const i18nMessages: Record<string, Record<string, any>> = {
  en: enMessages,
  zh: zhMessages,
};

export type I18n = { t: (key: string) => string; locale: string };

// Add to the extend<TestFixtures, WorkerFixtures> call:
i18n: [async ({}, use, testInfo) => {
  const locale = testInfo.project.name.replace('e2e-', '') || 'en';
  const dict = i18nMessages[locale] ?? i18nMessages['en'];
  const t = (key: string): string => {
    const parts = key.split('.');
    let val: any = dict;
    for (const p of parts) { val = val?.[p]; }
    return typeof val === 'string' ? val : key; // fallback to key if not found
  };
  await use({ t, locale });
}, { scope: 'worker' }],
```

> **Import 路径**: fixtures.ts 位于 `tests/e2e/fixtures.ts`，messages 在 `$QA_WORKSPACE_DIR/messages/`，
> 所以 import 路径是 `'../messages/{locale}.json'`（固定，不依赖源项目结构）。
> Phase 0 Step 2b-1 已将消息文件从源项目复制到 `$QA_WORKSPACE_DIR/messages/`。
> 如果 `messages/` 目录不存在或为空 → ERROR: "messages 目录不存在，请检查 I18N_MESSAGES_DIR 配置"
> 如果 APP_LANGUAGES is NOT set → 不生成 i18n fixture（向后兼容）。

**Without E2E_TEST_EMAIL** -> simple version:

```typescript
import { test as base, expect } from "@playwright/test";
export const test = base;
export { expect };
```

> **global-setup.ts is not generated at this point** — it requires Phase 1 CDP exploration of the login page to write with verified real selectors.

#### 2f. Copy static test data files (if not present)

Copy test data fixture files from qa-platform to the target project. Only copy files that don't already exist (preserve user customizations):

```
Source: <qa-platform-dir>/tests/e2e/fixtures/files/*
Target: $QA_WORKSPACE_DIR/tests/e2e/test-data/files/

Files: sample.png, sample.jpg, sample.pdf, sample.csv, sample.xlsx, sample.txt, empty.txt, oversized-6mb.bin
```

```bash
# Copy each static file only if it doesn't exist in target
for f in <qa-platform-dir>/tests/e2e/fixtures/files/*; do
  target="$QA_WORKSPACE_DIR/tests/e2e/test-data/files/$(basename $f)"
  [ ! -f "$target" ] && cp "$f" "$target"
done

# Generate oversized test file dynamically (not stored in repo due to size)
if [ ! -f "$QA_WORKSPACE_DIR/tests/e2e/test-data/files/oversized-6mb.bin" ]; then
  node -e "require('fs').writeFileSync('$QA_WORKSPACE_DIR/tests/e2e/test-data/files/oversized-6mb.bin', Buffer.alloc(6*1024*1024, 0x41))"
fi
```

> These files are referenced by generated specs when handoff entries use `file.*` dataTypes (see `skills/playwright-script-generator/SKILL.md` §0d). Without them, file upload tests will fail with "file not found". The oversized file is generated dynamically to avoid bloating the qa-platform repository.

### Step 3 — Determine Exploration URL

Priority:
1. URL passed by user in `$ARGUMENTS`
2. `PLAYWRIGHT_BASE_URL` from this project's `.env`
3. `PREVIEW_URL` from this project's `.env`

---

## Phase 1: Initial Scan + Area Identification (lightweight)

> **Specification source**: First read `skills/cdp-explorer/SKILL.md`.

```
Read("skills/cdp-explorer/SKILL.md")
```

### Step 1 — Connect to Page + Login Wall Handling

Execute cdp-explorer SKILL **Phase 1 (Connection)**, then detect login wall (Phase 1 Step 3):

**If a login page is encountered** (entire auth infrastructure is closed-loop here):

1. **Explore login form**: Use cdp-explorer's three-layer scan (DOM -> accessibility tree -> screenshot) to discover real selectors
   - Record: email input selector, password input selector, submit button selector, post-login URL pattern, whether multi-step (email first then password), etc.
2. **CDP login**: Use discovered selectors + `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` from `.env` to complete login
3. **Generate global-setup.ts** (`$QA_WORKSPACE_DIR/tests/e2e/global-setup.ts`, if not present):
   - Write with verified real selectors, no guessing
   - Includes: 12h storageState cache, login flow, write `.auth/user.json`
   - If exists -> skip (don't overwrite user-customized login logic)
4. **Update playwright.config.ts**: Ensure it includes `globalSetup: "./tests/e2e/global-setup.ts"`
5. **Generate sign-in POM** (`tests/e2e/pages/sign-in.page.ts`) for login-related specs
6. After successful login, navigate to the original target URL, continue to Step 2

> **Closed-loop**: Selectors have only one source — CDP real exploration. The same set of selectors is used for: CDP login (for exploration), global-setup.ts (for Playwright execution), sign-in POM (for login specs).

**If login is not required** -> proceed directly to Step 2

### Step 2 — State_0 Scan

Execute cdp-explorer SKILL Phase 2 (Initial Scan), **do not execute Phase 3 (Interactive Exploration)**.

Output: State_0 DOM structure + accessibility tree + screenshot.

### Step 3 — Identify Functional Areas (initial, will grow during Phase 2)

From the State_0 scan results, identify the **initial** set of functional areas. This is NOT the final list — Phase 2 exploration will dynamically discover and append new areas that only appear after interaction (Modals, expanded panels, lazy-loaded sections, etc.).

| Identification Signal | Area Type | Example |
|----------------------|-----------|---------|
| `<form>` / `[role="form"]` / clustered inputs | Form area | Login form, registration form |
| `[role="tab"]` + `[role="tabpanel"]` | Tab switching area | Feature tabs (Core/Recruiting) |
| `[role="navigation"]` / `<nav>` | Navigation area | Top navigation bar |
| `[aria-haspopup]` / `[role="combobox"]` | Dropdown/selector | Language switcher |
| `button` + text contains "new/create/add" | Create-type Modal | New task button |
| `[role="dialog"]` visible | Current modal | Currently open Modal |
| Independent content block (h2 + content + button) | Content area | CTA section, feature showcase |

Output an ordered list, sorted by test value (form > tab > modal > navigation > dropdown > content):

```
areas = [
  { id: "form-join-waitlist", type: "form", name: "Join Waitlist Form", elements: [...], priority: 1 },
  { id: "tabs-features", type: "tabs", name: "Feature Tab Switching", elements: [...], priority: 2 },
  { id: "nav-top", type: "navigation", name: "Top Navigation", elements: [...], priority: 3 },
  { id: "combobox-lang", type: "combobox", name: "Language Selector", elements: [...], priority: 4 },
]
```

> **Important**: This is the initial seed list. Areas discovered during Phase 2 (e.g., a Modal triggered by clicking a button, a new Tab Panel rendered after switching tabs) will be appended to this list dynamically.

### Step 4 — Filter + Sort

1. If user specified `targetArea` -> only keep areas matching by name/type
2. Sort by priority
3. If user specified `maxAreas` -> truncate list (but dynamically discovered areas may still be appended within this limit)

**Report to user at this point**:
```
Discovered N functional areas (initial), will explore in the following order (planning to process M):
1. [Form] Join Waitlist Form — 5 interactive elements
2. [Tab] Feature Tab Switching — 2 tabs
3. ...
Note: Additional areas may be discovered during exploration.
```

---

## Phase 2: Incremental Loop — Explore and Write

**Core principles**:
- **State-flow graph is cumulative**: The entire page shares one `page-baseline-{slug}.json`; each area's exploration **appends** new states and edges
- **Test case generation is incremental**: After each area is explored, only the **newly added states** are passed to the orchestrator for case generation
- **Context is controllable**: The orchestrator only sees the current area's delta, no need to digest the entire page

### State-Flow Graph File (shared across page, incrementally appended)

File path: `$QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{slug}.json`

Created after Phase 1 initial scan, containing State_0. Each subsequent area exploration **appends** new states and edges:

```json
{
  "meta": { "url": "...", "title": "...", "mode": "full", "areasCompleted": ["form-join-waitlist"] },
  "states": {
    "S0": { "name": "Initial page", "trigger": null, "regions": {...} },
    "S1": { "name": "New Task Modal", "trigger": {"action":"click","element":"button:Create","fromState":"S0"}, "sourceArea": "modal-create-task" }
  },
  "stateGraph": {
    "edges": [
      { "from": "S0", "action": "click", "element": "button:New Task", "to": "S1", "sourceArea": "modal-create-task" }
    ]
  },
  "areas": {
    "form-join-waitlist": { "status": "completed", "stateIds": ["S0"], "specFile": "...", "casesGenerated": 7 },
    "tabs-features": { "status": "pending", "stateIds": [] }
  },
  ...
}
```

The `sourceArea` field on each state/edge marks which area it belongs to; the orchestrator uses this to extract the delta.

### Architecture: Pipeline with Parallel Generation

> **Two problems solved simultaneously**:
> 1. **Context explosion**: Each CDP exploration runs in an isolated subagent; raw data doesn't enter the main context
> 2. **Efficiency**: Test case generation for all areas runs in parallel (no CDP needed, pure AI work)
>
> **Key insight**: CDP operations (exploration, locator verification) need the browser → must be serial. AI generation (test cases, POM, spec) doesn't need the browser → can be parallel.

```
Phase 2a: Serial CDP exploration (one subagent per area, sequential)
  area1: CDP explore → write baseline → return summary
  area2: CDP explore → write baseline → return summary (reads area1's results from file)
  area3: CDP explore → write baseline → return summary
  ... (dynamic areas appended here and explored in the same serial loop)
     ↓ all areas explored, baseline file is complete
Phase 2b: Parallel test generation (one orchestrator per area, all launched simultaneously)
  area1: orchestrator → test cases + POM + spec  ←─┐
  area2: orchestrator → test cases + POM + spec  ←─┤ all running in parallel
  area3: orchestrator → test cases + POM + spec  ←─┘
     ↓ all specs generated
Phase 2c: Serial locator verification (one subagent per POM, sequential)
  pom1: CDP verify → fix locators → return results
  pom2: CDP verify → fix locators → return results
```

### Phase 2a: Serial CDP Exploration

```
exploredAreas = []
baseline = Phase 1 output initial baseline (containing State_0 + areas list)

for area in areas:
  // Launch cdp-explorer subagent (serial — one browser, one page at a time)
  Launch subagent with CDP tools:

  prompt:
  ```
  You are a CDP page explorer. First read skills/cdp-explorer/SKILL.md.

  Task: Explore one functional area on the current page.

  Input:
  - mode: "full"
  - baselineFile: {absolute path to page-baseline-{slug}.json}
  - area: { id: "{area.id}", name: "{area.name}", type: "{area.type}", elements: [...] }
  - pageUrl: {exploration URL}
  - nextStateId: {next available state number}
  - appLanguages: {APP_LANGUAGES or null}
  - i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
    When set, perform i18n reverse-lookup per cdp-explorer SKILL.md Step 3.5

  Steps:
  1. Read the baseline file to understand existing states (avoid re-exploring)
  2. Connect to the page (list_pages → select_page, or navigate if needed)
  3. Execute Phase 3 BFS using area.elements as initial seeds
     - Allow BFS to discover and interact with NEW elements after interaction
     - Mark all new states/edges with sourceArea = "{area.id}"
  4. Dynamic Area Discovery: check for newly revealed functional areas
     - New Modal/Dialog → discoveredArea { type: "modal" }
     - New Tab Panel → discoveredArea { type: "tab-panel" }
     - Expanded menu → discoveredArea { type: "menu" }
     - Lazy-loaded content → discoveredArea { type: "lazy-content" }
  5. Write ALL findings to the baseline file (states, edges, forms, areas, coverageReport)

  Return summary:
  {
    "areaId": "{area.id}",
    "newStates": ["S3", "S4"],
    "newEdges": 5,
    "discoveredAreas": [{ "id": "modal-create", "type": "modal", "name": "Create Modal" }],
    "coverageReport": { "interactedElements": 15, "statesDiscovered": 3, "terminationReason": "queue_empty" }
  }
  ```

  // Process dynamic area discovery
  If subagent returned discoveredAreas → append to areas list (subsequent iterations will explore them)

  exploredAreas.push({ area, summary: subagent result })

  // Report exploration progress
  ```
  Explored 1/M [Form] Join Waitlist Form — 3 states, 5 edges, 15 elements interacted
  ```

  If maxAreas reached → break

  // maxAreas 限制说明：
  // maxAreas 限制的是 **总处理数量**（初始 + 动态发现的合计）
  // 例如 maxAreas=5：初始 3 个区域 + 动态发现 2 个 = 恰好 5 个，停止
  // 动态发现的区域不享有额外配额，避免无限膨胀
  // 未处理的动态区域记录在 baseline 中（status: "pending"），下次 /qa-explore 可继续
```

### Phase 2b: Parallel Test Generation

> After all areas are explored, the baseline file contains the complete state-flow graph. Now launch **all orchestrator agents in parallel** — they only read the baseline file and write to separate output files, no CDP needed.

```
// Launch ALL orchestrator agents simultaneously (parallel)
orchestratorAgents = []

for area in exploredAreas:
  orchestratorAgents.push(
    Launch e2e-orchestrator (sonnet) in background:

    prompt:
    ```
    You are e2e-orchestrator. First read agents/e2e-orchestrator.md.

    Input:
    - source: "cdp"
    - baselineFile: {baselineFile absolute path}
    - areaScope: { id: "{area.id}", name: "{area.name}", type: "{area.type}" }
    - projectContext:
        targetProjectDir: {QA_WORKSPACE_DIR}
        sourceProjectDir: {SOURCE_PROJECT_DIR}
        baseURL: {PLAYWRIGHT_BASE_URL}
        authSetup: {true/false}
        existingTests: tests/e2e/testcases/
        techStack: {from CLAUDE.md}
        appLanguages: {APP_LANGUAGES or null}
        i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
    - existingPageObjects: [list of already-generated POM file paths]

    Execute per agents/e2e-orchestrator.md steps, return artifact paths.
    ```
  )

// Wait for ALL orchestrators to complete
results = await all(orchestratorAgents)

// ══ MANDATORY VERIFICATION GATE ══
// Execute the Post-Return File Verification checklist from agents/e2e-orchestrator.md
// (Steps V1-V5). Pipeline STOPS if any check fails.
//
// For EACH orchestrator result, verify:
//   V1: .md files exist + contain "## Merged Test Case List" + at least 1 "**TC-"
//   V2: handoff JSON exists + valid JSON array + entry count matches .md TC count
//   V3: spec files exist + contain "test(" + contain "import"
//   V4: POM files exist + contain "export class"
//   V5: cross-artifact consistency (spec imports match POM, spec header references handoff)
//
// If ANY verification fails → STOP, report error to user, do NOT proceed.

// Collect all verified artifacts
allSpecs = results.flatMap(r => r.specs + r.modified_specs)
allPageObjects = results.flatMap(r => r.page_objects)

// Export Excel: merge all .md into one file (one Sheet per area)
// Only executes AFTER verification gate passes
node skills/excel-case-export/scripts/generate-excel.js \
  --input-dir $QA_WORKSPACE_DIR/test-cases/generated \
  --output $QA_WORKSPACE_DIR/test-cases/excel/{slug}-all-cases.xlsx

// Verify Excel output exists
if NOT Glob("$QA_WORKSPACE_DIR/test-cases/excel/{slug}-all-cases.xlsx"):
  ERROR: "Excel export failed — file not written"

// Report generation progress
```
Generated test cases for M areas in parallel:
  [Form] Join Waitlist Form — 7 cases, spec: join-waitlist-form-cdp.test.ts
  [Tab] Feature Tabs — 5 cases, spec: feature-tabs-cdp.test.ts
  [Nav] Top Navigation — 3 cases, spec: nav-top-cdp.test.ts
Combined Excel: test-cases/excel/{slug}-all-cases.xlsx
```
```

### Phase 2c: Serial Locator Verification

> Verify all generated locators against the live page. Serial because CDP needs the browser.

```
for pomFile in allPageObjects:
  Launch locator-verify subagent with CDP tools:

  prompt:
  ```
  You are a locator verifier. Read skills/cdp-explorer/SKILL.md Phase 4 (verify mode).

  Input:
  - pomFile: {pomFile path}
  - pageUrl: {exploration URL}

  Steps:
  1. Connect to the page
  2. Read POM, extract all locator properties
  3. For each locator: CDP verify → UNIQUE/ZERO/MULTIPLE → fix if needed → re-verify
  4. Max 3 fix attempts per locator

  Return: { "verified": N, "fixed": N, "failed": N, "failedLocators": [...] }
  ```
```

### Context Budget

| Phase | Execution | Context cost to main command |
|-------|-----------|------------------------------|
| 2a. CDP exploration | serial subagents | ~100 tokens × M areas |
| 2b. Test generation | **parallel** subagents | ~200 tokens × M areas |
| 2c. Locator verify | serial subagents | ~100 tokens × N POMs |
| **Total (5 areas)** | | **~2K tokens** |

**Speed improvement**: Phase 2b runs all orchestrators in parallel. If each takes ~3 minutes, 5 areas complete in ~3 minutes instead of ~15 minutes.

### Same-Page POM Merge Rules (Parallel-Safe)

When multiple areas belong to the same page, they share a single POM file. In parallel generation mode (Phase 2b), **concurrent writes to the same POM would cause data loss**. Solution: fragment-then-merge.

**During Phase 2b (parallel generation)**:
- Each orchestrator writes a **POM fragment file** instead of appending to the shared POM directly
- Fragment naming: `tests/e2e/pages/{slug}.page.{area-id}.fragment.ts`
- Each fragment contains only the private properties + public getters/methods for that area
- No read-modify-write of the shared POM → no write conflicts

**After Phase 2b completes, before Phase 2c (main command merges)**:
1. Read the base POM file (created by the first area, or existing)
2. Read all fragment files for the same page: `Glob("tests/e2e/pages/{slug}.page.*.fragment.ts")`
3. Merge: for each fragment, append its private properties and public methods to the base POM (skip duplicates by property name)
4. Write the merged POM back to `tests/e2e/pages/{slug}.page.ts`
5. Delete all fragment files
6. Update spec imports if needed (fragments used temporary names)

**During serial generation** (single area at a time): orchestrators can directly append to the POM as before — no fragment needed.

### Interruption Recovery + Page Change Detection

If the user runs `/qa-explore` again on a previously explored page:

1. Read the existing `page-baseline-{slug}.json`
2. **Page change detection** — before resuming, verify the page hasn't changed:
   - CDP connect to the page → take State₀ snapshot (quick, lightweight)
   - Compare current State₀ fingerprint with `baseline.states.S0.fingerprint` (stored at last exploration)
   - **Fingerprint matches** → page unchanged → resume mode:
     - Check `areas[*].status`: skip `completed` ones, continue `pending` ones
     - State-flow graph is not lost; resume from the last breakpoint
   - **Fingerprint differs** → page has changed → re-explore mode:
     - Log: "Page has changed since last exploration (UI update detected)"
     - For each `completed` area: re-run CDP exploration subagent to detect what changed
     - Compare new exploration results with existing baseline states:
       - Elements added/removed → mark area as `needs_update`
       - Elements unchanged → keep existing status
     - For `needs_update` areas: re-generate test cases + update existing specs + **update handoff entries** (same as orchestrator `prdChangeMode: "updated"` logic — keep unchanged tests, update changed ones, add new ones, skip removed ones. Handoff must stay in sync with .md and spec.)
     - For unchanged areas: skip (existing tests still valid)
     - For `pending` areas (not yet explored before interruption):
       - **Discard old baseline data** for these areas (the page has changed, old State₀ elements may no longer exist)
       - **Re-identify** from current State₀: run area identification again on current DOM
       - If the pending area still exists on the new page → explore normally (treat as new)
       - If the pending area no longer exists (element removed by page change) → remove from areas list, log "area {id} no longer present after page update"
     - Update baseline fingerprint to current State₀

> **Why not just re-explore everything?** Re-exploring all areas from scratch is wasteful if only one area changed (e.g., a button label updated). The fingerprint comparison + per-area re-check finds exactly what changed, minimizing unnecessary regeneration.

> **Fingerprint storage**: Phase 1 State₀ scan must store the fingerprint (from cdp-explorer Step 6) in `baseline.states.S0.fingerprint` for future comparison.

---

## Phase 2.5: Cross-Area Flow Discovery (after loop completes, before execution)

> **Executor**: The **main command** executes this phase directly (not a subagent). It reads the baseline file (pure JSON analysis, no CDP needed for Step 1 and Step 3). Only Step 2 (page navigation) needs a CDP subagent.

After all areas have been individually explored, the baseline file contains the complete state-flow graph. The main command analyzes it for cross-area flows:

### Step 1 — Identify cross-area edges (main command, no CDP)

Read `page-baseline-{slug}.json` and scan `stateGraph.edges` for transitions that cross area boundaries:
- Edge where `sourceArea` of `from` state differs from `sourceArea` of `to` state (e.g., sidebar click → main content update)
- Edge that causes URL change (compare `states[from].url` vs `states[to].url`)
- Edge where the target state contains elements belonging to a different area

Output: list of `crossAreaFlows` and `pageNavigationEdges`.

If no cross-area edges found → skip to Phase 3.

### Step 2 — Handle page navigations (CDP subagent, serial)

For edges that cause URL changes (navigation to a different page), launch a **cdp-explorer subagent**:

```
prompt:
You are a CDP page explorer. Read skills/cdp-explorer/SKILL.md.

Task: Explore a new page discovered via navigation from the original page.

Input:
- pageUrl: {URL from the navigation edge target}
- baselineFile: {baseline file path}
- parentEdge: { from: "S3", action: "click", element: "nav:Dashboard" }

Steps:
1. Navigate to pageUrl
2. Three-layer scan (State₀ of new page)
3. Identify functional areas on the new page
4. Write new page states to baseline with crossPage: true marker
5. Record cross-page edge in stateGraph

Return: { newPageStates: [...], newAreas: [...] }
```

**Strict 1-hop limit** — prevents infinite recursion:
```
For each cross-page navigation edge from the ORIGINAL page:
  1. Navigate to the target page (1 hop)
  2. Three-layer scan: State₀ only (NO interactive BFS exploration on the new page)
  3. Identify initial functional areas on the new page
  4. Write to baseline with crossPage: true
  5. Do NOT follow any navigation links discovered on the new page (that would be 2 hops)

If new areas discovered AND remaining maxAreas budget > 0:
  → Run ONLY these new-page areas through Phase 2a (serial CDP) + Phase 2b (parallel gen)
  → These areas are explored with BFS on the new page, but any further navigation edges
    found during this BFS are RECORDED in the baseline only, NOT followed
  → This guarantees: original page explored fully, 1-hop pages explored for areas, no 2+ hops
```

### Step 3 — Generate cross-area integration test cases (main command → orchestrator)

For significant cross-area dependencies found in Step 1:

```
crossAreaFlows = [
  { steps: ["click sidebar item (area: sidebar)", "verify detail (area: main)", "click action (area: main)", "confirm modal (area: modal)"],
    involvedAreas: ["sidebar", "main", "modal"] }
]
```

Launch orchestrator (sonnet) with:
```
Input:
- source: "cdp"
- baselineFile: {baseline path}
- crossAreaFlows: {the flows identified above}
- projectContext: { ... }

Note: Generate integration test cases that chain multiple POM interactions across areas.
Each flow becomes one test case that exercises the cross-area dependency end-to-end.
```

> **Scope control**: Only discover cross-area flows for areas already explored. Do not recursively explore all reachable pages.

---

## Phase 3: Unified Execution (no Linear reporting)

After all areas are processed (or maxAreas is reached), execute tests uniformly.

> **qa-explore does NOT report to Linear.** Its purpose is exploration + generation + validation. If tests fail, the user should run `/qa-fix-tests` to fix them, then `/qa-run-all` to formally execute + report. This avoids flooding Linear with issues from first-generation spec failures (locator mismatches etc.).

**Pre-check**: If allSpecs is empty (all areas already covered) -> inform user "all test cases already have spec coverage" -> end

**Agent — test-executor** (haiku):
- mode: `selective` — only run newly generated specs, not the entire test suite
- specFiles: allSpecs (only this session's generated specs)
- appLanguages: {APP_LANGUAGES or null} — test-executor 据此决定 projectFilter
- Execute tests -> produce reports to `$QA_WORKSPACE_DIR/tests/reports/`
- Open HTML report: `start http://localhost:9323` (or `npx playwright show-report`)

**No report-analyzer.** Only output local summary:
```
## Exploration Complete

Explored {N} areas, generated {M} test cases, {K} specs.
Test results: {passed}/{total} passed.
HTML report: playwright-report/index.html

If tests fail, run /qa-fix-tests to fix locator issues.
When ready for formal testing + Linear reporting, run /qa-run-all.
```

---

## Artifact Checklist

| File | Description |
|------|-------------|
| `test-cases/generated/page-baseline-{slug}.json` | CDP exploration: Page state-flow graph baseline (cumulative, containing all areas' states/edges) |
| `test-cases/generated/{slug}-{area-id}-cdp.md` | Case generation: Test cases for the area |
| `test-cases/generated/playwright-handoff-{slug}.json` | Case generation: Playwright handoff file (one per area, slug includes area id) |
| `test-cases/excel/{slug}-{area-id}-cdp.xlsx` | Excel export: Test case spreadsheet |
| `tests/e2e/pages/{slug}.page.ts` | Script generation: Page Object (shared per page, incrementally appended) |
| `tests/e2e/testcases/generated/{slug}-{area-id}-cdp.test.ts` | Script generation: Playwright spec |
| `tests/reports/playwright-results.json` | Test execution: JSON report |
| `playwright-report/index.html` | Test execution: HTML report |
| `tests/reports/combined/summary.md` | Report analysis: Summary report (always generated) |
| Linear Issue | Report analysis: Failed case reporting (after dedup, skipped when all pass) |
