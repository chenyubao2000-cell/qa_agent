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
Phase 2a: Serial CDP exploration (one subagent per area, sequential)
         for each functional area:
           a. Deep explore the area (CDP interaction, BFS from seed elements)
           a2. Dynamic area discovery (append newly revealed areas to the list)
           b. Write findings to baseline
     |
Phase 2a.5: Cross-area flow discovery (after ALL CDP exploration, before generation)
         Analyze baseline stateGraph for cross-area edges + page navigations
         → append cross-area flows to generation queue
     |
Phase 2b: Parallel test generation (one orchestrator per area + cross-area, all at once)
         e2e-orchestrator -> test cases + POM + spec
     |
Phase 3: Delegate to /qa-fix-tests (CDP verify + fix + execute, no Linear)
         /qa-fix-tests --skip-baseline -> locator fix -> regression -> local report
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

Source code directory priority: `--source` in `$ARGUMENTS` > `prSourceDir` (from git-watcher prompt) > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`

Extract all config from **this project's .env**:
- `QA_WORKSPACE_DIR` — target project root directory
- `baseURL` — `PREVIEW_URL` (recommended). Config template supports fallback: `PLAYWRIGHT_BASE_URL || PREVIEW_URL || localhost:3000`, but only set `PREVIEW_URL` in `.env`
- `authSetup` — `E2E_TEST_EMAIL` has value -> requires auth state
- `testCredentials` — `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`
- `techStack` — from source directory CLAUDE.md
- `appLanguages` — `APP_LANGUAGES` from .env (comma-separated, e.g., "en,zh"), default: single project mode
- `i18nMessagesDir` — `I18N_MESSAGES_DIR` from .env (**source path** of i18n message files, used to copy to target project), default: null
- `defaultLocale` — first language in APP_LANGUAGES, or infer from source project

### Step 2 — Initialize Workspace (empty folder compatible, skip all if already initialized)

Execute `.claude/references/phase-0-workspace-init.md` Steps 2a-2f. Each sub-step is skip-if-exists.
Then run i18n + auth infrastructure validation per the same reference file.

### Step 3 — Determine Exploration URL

Priority:
1. URL passed by user in `$ARGUMENTS`
2. `PREVIEW_URL` from this project's `.env`

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
   - Record: login page path (e.g., `/sign-in`), email input selector, password input selector, submit button selector, post-login URL pattern (e.g., `**/task**`), whether multi-step (email first → continue → then password), etc.
2. **CDP login**: Use discovered selectors + `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` from `.env` to complete login
3. **Generate auth.setup.ts** (`$QA_WORKSPACE_DIR/tests/e2e/auth.setup.ts`, if not present):
   - Write with verified real selectors from CDP exploration, no guessing
   - If exists -> skip (don't overwrite user-customized login logic)
   - **Template**: Use auth.setup.ts template from `.claude/references/phase-0-templates.md` § "auth.setup.ts template"
   - Replace `{loginPagePath}`, `{emailSelector}`, `{passwordSelector}`, `{submitSelector}`, `{postLoginUrlPattern}` with CDP-discovered real values
   - **`{submitSelector}` notes**: Use `^...$` anchors in regex to avoid matching partial text. Use `click({ timeout: 30_000 })` — Playwright's click auto-waits for actionability.

4. **Verify playwright.config.ts** has setup project: Ensure it includes `{ name: 'setup', testMatch: /auth\.setup\.ts/ }` and test projects have `dependencies: ['setup']`. The config template from Phase 0 Step 2d already includes this.
5. **Generate sign-in POM** (`tests/e2e/pages/sign-in.page.ts`) for login-related specs
6. After successful login, navigate to the original target URL, continue to Step 2

> **Closed-loop**: Selectors have only one source — CDP real exploration. The same set of selectors is used for: CDP login (for exploration), auth.setup.ts (for Playwright setup project), sign-in POM (for login specs).

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
  - sourceProjectDir: {resolved source code directory}
    MUST execute cdp-explorer Phase 0 (source pre-read) before any DOM scanning.
  - previousSourceContext: {sharedSourceContext from previous area subagents, if any}
    When present, reuse existing sourceContext for shared components — only read NEW components.

  Steps:
  1. Read the baseline file to understand existing states (avoid re-exploring)
  2. Connect to the page (list_pages → select_page, or navigate if needed)
  2.5. **Source Code Pre-Read**: Execute cdp-explorer SKILL.md Phase 0 using sourceProjectDir.
       Grep for components matching area.name and area.elements.
       Build sourceContext (testIds, ariaAttributes, conditionalElements, i18nKeys, utilityClasses).
       Use sourceContext in Step 3 BFS to prefer stable locators and understand conditional elements.
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
    "coverageReport": { "interactedElements": 15, "statesDiscovered": 3, "terminationReason": "queue_empty" },
    "sourceContext": { testIds, ariaAttributes, conditionalElements, i18nKeys, utilityClasses }
  }
  ```

  // Process dynamic area discovery
  If subagent returned discoveredAreas → append to areas list (subsequent iterations will explore them)

  // ── sourceContext sharing (sequential area exploration) ──
  // Merge sourceContext from this subagent into shared context for subsequent areas.
  // Areas on the same page share components — avoid redundant source reading.
  if subagent returned sourceContext:
    sharedSourceContext = { ...sharedSourceContext, ...subagent.sourceContext }
    // Pass sharedSourceContext to the NEXT area subagent as previousSourceContext

  exploredAreas.push({ area, summary: subagent result })

  // Report exploration progress
  ```
  Explored 1/M [Form] Join Waitlist Form — 3 states, 5 edges, 15 elements interacted
  ```

  If maxAreas reached → break

  // maxAreas limit explanation:
  // maxAreas limits the **total processed count** (initial + dynamically discovered combined)
  // Example: maxAreas=5: 3 initial areas + 2 dynamically discovered = exactly 5, stop
  // Dynamically discovered areas do not get extra quota, preventing infinite expansion
  // Unprocessed dynamic areas are recorded in baseline (status: "pending"), next /qa-explore can continue
```

### Phase 2a.5: Cross-Area Flow Discovery (after ALL CDP exploration, before generation)

> **Timing**: Executed after all area CDP exploration completes and before test case generation. At this point the baseline has a complete stateGraph,
> allowing analysis of cross-area flows to add to the generation queue, so Phase 2b can generate all cases in parallel (per-area + cross-area) in one pass.
>
> **Executor**: Main command layer directly analyzes baseline JSON (no CDP needed). Only Step 2 (cross-page navigation exploration) requires a CDP subagent.

#### Step 1 — Identify cross-area edges (main command, no CDP)

Read `page-baseline-{slug}.json` and scan `stateGraph.edges` for transitions that cross area boundaries:
- Edge where `sourceArea` of `from` state differs from `sourceArea` of `to` state
- Edge that causes URL change (compare `states[from].url` vs `states[to].url`)
- Edge where the target state contains elements belonging to a different area

Output: `crossAreaFlows` + `pageNavigationEdges`. If none found → skip to Phase 2b.

#### Step 2 — Handle page navigations (CDP subagent, serial, 1-hop limit)

For URL-changing edges, launch cdp-explorer subagent:
- Navigate to target page (1 hop only)
- State₀ scan only (no BFS)
- Write to baseline with `crossPage: true`
- Do NOT follow links on the new page (prevents infinite recursion)

#### Step 3 — Queue cross-area flows for Phase 2b

```
crossAreaFlows = [
  { steps: ["click sidebar (area: sidebar)", "verify detail (area: main)"],
    involvedAreas: ["sidebar", "main"] }
]
// These flows are passed to an additional orchestrator in Phase 2b
// alongside per-area orchestrators, all running in parallel
```

> **Scope control**: Only discover flows for areas already explored. Do not recursively explore all reachable pages.

---

### Phase 2b: Parallel Test Generation

> After all areas are explored AND cross-area flows identified, launch **all e2e-orchestrator agents in parallel**.
> This includes: one orchestrator per area + one orchestrator for cross-area integration tests (if any).

```
// Launch ALL e2e-orchestrator agents simultaneously (parallel)
orchestratorAgents = []

for area in exploredAreas:
  orchestratorAgents.push(
    Launch e2e-orchestrator (sonnet) in background:

    prompt:
    ```
    You are e2e-orchestrator. First read .claude/agents/e2e-orchestrator.md.

    Input:
    - source: "cdp"
    - baselineFile: {baselineFile absolute path}
    - areaScope: { id: "{area.id}", name: "{area.name}", type: "{area.type}" }
    - projectContext:
        targetProjectDir: {QA_WORKSPACE_DIR}
        sourceProjectDir: {SOURCE_PROJECT_DIR}
        baseURL: {PREVIEW_URL}
        authSetup: {true/false}
        testCredentials: {E2E_TEST_EMAIL / E2E_TEST_PASSWORD, if authSetup=true}
        existingTests: tests/e2e/testcases/
        techStack: {from CLAUDE.md}
        appLanguages: {APP_LANGUAGES or null}
        i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
    - existingPageObjects: [list of already-generated POM file paths]

    Execute per .claude/agents/e2e-orchestrator.md steps, return artifact paths.
    ```
  )

// If Phase 2a.5 found cross-area flows, add a cross-area orchestrator (runs in parallel with area orchestrators)
if crossAreaFlows.length > 0:
  orchestratorAgents.push(
    Launch e2e-orchestrator (sonnet) in background:
    prompt: """
    You are e2e-orchestrator. First read .claude/agents/e2e-orchestrator.md.
    Input:
    - source: "cdp"
    - baselineFile: {baselineFile}
    - crossAreaFlows: {crossAreaFlows from Phase 2a.5}
    - projectContext: { ...same as above... }
    Note: Generate integration test cases that chain multiple POM interactions across areas.
    """
  )

// Wait for ALL orchestrators to complete (area + cross-area, all parallel)
results = await all(orchestratorAgents)

// ══ MANDATORY VERIFICATION GATE ══
// Execute `.claude/references/verification-gate-v1-v5.md` (Steps V1-V5) for EACH orchestrator result.
// Pipeline STOPS if any check fails — do NOT proceed.
//
// On failure:
//   - Delete INCOMPLETE artifacts from the failed orchestrator (spec, POM, handoff for that area)
//   - Keep artifacts from other orchestrators that passed verification
//   - Report detailed error: area, V step, reason, deleted files, suggested action

// Collect all verified artifacts
allSpecs = results.flatMap(r => r.specs + r.modified_specs)
allPageObjects = results.flatMap(r => r.page_objects)

Execute `.claude/references/excel-export-gate.md` (with `{name}` = `{slug}`)

// Report generation progress
```
Generated test cases for M areas in parallel:
  [Form] Join Waitlist Form — 7 cases, spec: join-waitlist-form-cdp.test.ts
  [Tab] Feature Tabs — 5 cases, spec: feature-tabs-cdp.test.ts
  [Nav] Top Navigation — 3 cases, spec: nav-top-cdp.test.ts
Combined Excel: test-cases/excel/{slug}-all-cases.xlsx
```
```

### Context Budget

| Phase | Execution | Context cost to main command |
|-------|-----------|------------------------------|
| 2a. CDP exploration | serial subagents | ~100 tokens × M areas |
| 2a.5 Cross-area | main command (no subagent) | ~50 tokens |
| 2b. Test generation | **parallel** subagents | ~200 tokens × M areas |
| **Total (5 areas)** | | **~1.5K tokens** |

**Speed improvement**: Phase 2b runs all orchestrators in parallel. If each takes ~3 minutes, 5 areas complete in ~3 minutes instead of ~15 minutes.

> **Why not do locator verification in qa-explore?**
> Locator verification + fix + execution + regression are all handled by `/qa-fix-tests` (Phase 3).
> Same reasoning as qa-run-prd: qa-fix-tests is a superset of verification+fix, avoiding redundant CDP exploration.

### Same-Page POM Merge Rules (Parallel-Safe)

Execute `.claude/references/pom-merge.md`

**During serial generation** (single area at a time): orchestrators can directly append to the POM as before — no fragment needed.

### Interruption Recovery + Page Change Detection

If the user runs `/qa-explore` again on a previously explored page:

1. Read the existing `page-baseline-{slug}.json`
2. **Page change detection** — before resuming, verify the page hasn't changed:
   - CDP connect to the page → take State₀ snapshot (quick, lightweight)
   - Compare current State₀ fingerprint with `baseline.states.S0.fingerprint` (stored at last exploration)
   - **Fingerprint matches** → page unchanged → resume mode:
     - Check `areas[*].status`: skip `completed` ones, continue `pending` ones
     - **Completion validation**: for each `completed` area, verify it has at least 1 state and 1 edge in baseline stateGraph. If a `completed` area has 0 states/edges → reclassify as `pending` (likely interrupted mid-write)
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

## Phase 3: Delegate to /qa-fix-tests (no Linear reporting)

> **Separation of concerns**: qa-explore only handles exploration + generation. Locator verification + fix + execution are all handled by `/qa-fix-tests`.
> This is consistent with the qa-run-prd pattern: after generation, hand off to fix-tests.
>
> qa-explore does not report to Linear. Run `/qa-run` when formal reporting is needed.

**Pre-check**: If allSpecs is empty (all areas already covered) -> inform user "all test cases already have spec coverage" -> end

```
allGeneratedSpecs = results.flatMap(r => r.specs + r.modified_specs)

// Delegate to qa-fix-tests: CDP verify + fix locators/assertions + execute + regression
Execute /qa-fix-tests with arguments: --skip-baseline {allGeneratedSpecs joined by space}
// Note: although the source is CDP not PRD, --skip-baseline semantics mean "skip baseline execution, fix directly"
// CDP-generated specs also need locator fixing (CDP baseline locators may be inaccurate due to headless/headed differences)
```

```
## Exploration Complete

Explored {N} areas, generated {M} test cases, {K} specs.
qa-fix-tests will verify locators, fix issues, and run tests.
When ready for formal testing + Linear reporting, run /qa-run.
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
