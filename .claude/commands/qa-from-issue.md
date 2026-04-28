---
description: Generate or update E2E test cases and scripts from Linear issues
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__linear__get_issue, mcp__linear__search_issues, mcp__linear__update_issue, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

You are an issue-driven test generator. Starting from Linear issues, generate targeted E2E tests.

## Change Context (optional, injected by git-watcher or caller)

If the prompt contains the following sections (auto-injected by git-watcher from PRs), extract and utilize them:

**Changed file list**: Extract file paths for precise test scoping
1. **Prioritize coverage** of pages/components involved in the changelist (`.tsx`/`.vue` -> corresponding POM and spec)
2. Generate **more granular** test cases for changed files (boundary conditions, regression scenarios)
3. Pass changelist to e2e-orchestrator as `projectContext.changelist`

**Code change summary (changeSummary)**: AI-generated structured summary containing descriptions, files and line numbers, and change types for each modification. Based on this:
1. Generate test cases targeting the **changed logic** (e.g., modified conditional branch -> test both old and new paths)
2. Identify UI components/API endpoints mentioned in the summary to precisely target tests
3. Pass summary to e2e-orchestrator as `projectContext.changeSummary`

**PR source directory (prSourceDir)**: Full PR code copy created by git-watcher via worktree, fixed path `.qa-worktree-pr`.
1. **Read source code** from `prSourceDir` (e.g., viewing component implementation, understanding business logic)
2. **Write files** still to the original `QA_WORKSPACE_DIR` (spec/POM/cases/reports)
3. **Do not** write any files to prSourceDir
4. Pass prSourceDir to e2e-orchestrator as `projectContext.prSourceDir`

```
Identification format:
Changed file list (changelist):
- src/components/Chat.tsx
- src/api/tasks.ts
- ...

Code change summary (changeSummary):
1. [New Feature] Chat component adds language switching dropdown
   File: src/components/Chat.tsx L42-L68
2. [Bug Fix] Fix pagination parameter not being passed in task list
   File: src/api/tasks.ts L15, L23-L25

PR source directory (prSourceDir): D:\code\.qa-worktree-pr
```

## Phase 0: Load Context + Initialize Workspace (mandatory, execute first)

### Step 1 — Read .env + Build projectContext

```
Read(".env")  # valition_agent root directory
Read("$SOURCE_PROJECT_DIR/CLAUDE.md")  # tech stack (read source code only to understand business)
```

Extract all config from **this project's .env**: `QA_WORKSPACE_DIR`, `PREVIEW_URL`, `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`, `APP_LANGUAGES`, `I18N_MESSAGES_DIR`, `techStack` (source CLAUDE.md). `PREVIEW_URL` is the single source of truth for baseURL.

### Step 2 — Initialize Workspace (empty folder compatible, skip all if already initialized)

Execute `.claude/references/phase-0-workspace-init.md` Steps 2a–2f. Each sub-step is skip-if-exists.
Then run i18n + auth infrastructure validation per the same reference file.

> **Including i18n** (when `APP_LANGUAGES` is set): must also copy i18n messages (Step 2b-1), generate multi-language projects in playwright.config.ts (Step 2d), and generate i18n fixture in fixtures.ts (Step 2e). Skipping any of these will cause downstream test failures in all non-default locales.

> **Including auth** (when `E2E_TEST_EMAIL` is set): playwright.config.ts must include **per-locale** setup projects `setup-${locale}` (validation regex: `name:\s*['"]setup(-\w+)?['"]`); test projects depend on their matching `setup-${locale}` + `data-setup`. auth.setup.ts must exist and implement UI-driven locale switch per `.claude/references/phase-0-templates.md` § "auth.setup.ts Template". Rationale: `phase-0-templates.md` § "Multi-locale Design Overview". POM/spec rules: `i18n-locator-rules.md`.

auth.setup.ts is not generated at this point — it's written when CDP exploration encounters a login wall in Phase 2. When generated, it must follow qa-explore Phase 1 Step 1 template (setup project pattern).

### Step 3 — Determine Navigation URL

If `pageUrl` extracted from the issue is a relative path, concatenate with `baseURL`.

---

## Input

`$ARGUMENTS` supports multiple formats, **batch-capable**:

```
/qa-from-issue STE-9                     # single issue key
/qa-from-issue STE-9 STE-10 STE-11      # multiple issue keys (space-separated)
/qa-from-issue 790b5957-...              # single issue ID
/qa-from-issue https://linear.app/team/issue/STE-9/title  # Linear URL (extracts key)
/qa-from-issue https://linear.app/team/issue/STE-9 https://linear.app/team/issue/STE-10  # multiple URLs
/qa-from-issue STE-9 https://linear.app/team/issue/STE-10  # mixed keys + URLs
/qa-from-issue download format selection  # search keyword (matches all results)
/qa-from-issue --status backlog          # batch by status (process all issues under that status)
/qa-from-issue --all-open                # all Open/Backlog issues
/qa-from-issue STE-9 --source D:\code\my-project  # specify source directory (for reading source; file writes still go to QA_WORKSPACE_DIR)
```

### Source Code Directory

Source code directory priority: `--source` in `$ARGUMENTS` > `prSourceDir` in prompt > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`
- **Read source code** (viewing component implementation, understanding business logic) -> read from source directory
- **Write files** (spec/POM/cases/reports) -> always write to `QA_WORKSPACE_DIR`

### Batch Processing Logic (Pipeline with Parallel Generation)

1. Parse $ARGUMENTS, collect all target issues
2. **Group by pageUrl** — issues on the same page are merged
3. **Pipeline execution**:
   ```
   Step 1 — Serial CDP exploration (one subagent per pageUrl group, sequential):
     sharedSourceContext = {}
     for each pageUrl group:
       CDP targeted exploration → write baseline (subagent, serial due to CDP)
       Pass previousSourceContext: sharedSourceContext to each subagent
       After return: merge subagent.sourceContext into sharedSourceContext

   Step 2 — Parallel test generation (one orchestrator per pageUrl group, all at once):
     for each pageUrl group: (launched in parallel)
       orchestrator → test cases + POM + spec

   Step 3 — Delegate to /qa-fix-tests (verify + fix + execute):
     /qa-fix-tests --skip-baseline → locator fix → regression

   Step 4 — Linear reporting:
     report-analyzer → bug-reporter → Linear
   ```
4. Share the same POM (issues on the same page reuse the same Page Object)
5. CDP operations serial (one browser), AI generation parallel (no browser needed)

## Single Issue Flow

```
/qa-from-issue STE-9
     |
Phase 0: Load project context (.env -> target project config)
     |
Phase 1: Read Issue -> Extract test context (command layer exclusive)
     |
Phase 2: CDP targeted exploration -> Verify page state described in issue (command layer exclusive)
     |
Phase 3: Sequential launch (execute in order)
         e2e-orchestrator (issue) -> cases -> Excel -> spec
              | after completion
         /qa-fix-tests --skip-baseline -> CDP verify + fix + execute
              | after completion
         report-analyzer -> route failures:
               +-- source issue spec failures -> write back to original issue
               +-- other failures -> dedup + create new issue
```

---

## Phase 1: Read Issue

### Step 1 — Get Issue Details

Parse each input token to determine its type, then fetch:

```
for each token in $ARGUMENTS (excluding flags like --source, --status, --all-open):
  if token contains "linear.app":
    // Linear URL → extract issue key from path
    // e.g., https://linear.app/team/issue/STE-9/title → "STE-9"
    // Pattern: /issue/([A-Z]+-\d+)/ in URL path
    issueKey = extract key from URL path segment after "/issue/"
    mcp__linear__get_issue  issueId=issueKey
  elif token matches key pattern ([A-Z]+-\d+) or UUID:
    mcp__linear__get_issue  issueId=token
  else:
    // search keyword
    mcp__linear__search_issues  query=token
    List matching results, select the most relevant one.
```

### Step 2 — Extract Test Context

Extract from the issue's title + description:

| Field | Source | Example |
|-------|--------|---------|
| `pageUrl` | URL in description | `/task/YoEjBY4PNBFMwZWz` |
| `expectedBehavior` | "Expected result" section | Format selection dropdown appears |
| `actualBehavior` | "Actual result" section | Shows toast "File info incomplete" |
| `reproSteps` | "Reproduction steps" section | 1. Login 2. Open task 3. Click download |
| `priority` | issue priority | Urgent(1) -> P0 |
| `feature` | module name from issue title | canvas-download |
| `existingSpec` | search for existing spec | tests/e2e/testcases/generated/canvas-download.test.ts |

**Missing field handling**:
- `pageUrl` is empty -> skip Phase 2 (CDP exploration), generate cases only from issue text description (orchestrator source is still "issue", but no baselineFile is passed)
- `reproSteps` is empty -> Phase 2 CDP exploration degrades to full mode (instead of targeted), exploring the entire page

### Step 3 — Find Existing Spec

Search for an existing spec that covers the same module. Try multiple strategies (in order, stop on first match):

```
Step 3a — Extract clues from issue:
  tcId = extract TC ID from issue title/description (regex: /TC-\w+-\d+/)
  specFilename = extract .test.ts filename from issue description (regex: /[\w-]+\.test\.ts/)
  pageUrl = issueContext.pageUrl (extracted in Step 2)

Step 3b — Search for matching spec (try in order, stop on first match):
  1. TC ID grep:
     if tcId found → Grep(tcId, "$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/")
     → matchedSpec = first file containing this TC ID

  2. Spec filename from issue description:
     if specFilename found → Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/{specFilename}")
     → matchedSpec = matched file (if exists)

  3. pageUrl grep (search for the page route across all specs):
     if pageUrl found → Grep the route path (e.g., "/sign-in") in spec files and POM files
     → matchedSpec = spec that navigates to the same page

  4. Feature keyword fuzzy match:
     Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/*{feature-slug}*")
     → matchedSpec = closest match by filename

  If no match found → matchedSpec = null

Step 3c — Read matched spec content (if found):
  Read the full spec file to understand what it already covers.
  This content is passed to the orchestrator as existingSpecContent so it can
  decide whether to update, extend, or regenerate.
```

### Step 3d — Determine action

```
if matchedSpec is null:
  → action: "create" — generate new cases + POM + spec from scratch
else:
  → action: "update" — pass existingSpecContent + matchedSpec path to orchestrator
    The orchestrator reads the existing spec, compares with the issue context,
    and decides to either modify in-place or delete and regenerate.
```

> **No Mode X/A/B classification.** The command layer does not guess whether the issue is a test failure or a real bug. It simply finds the relevant spec (or not) and delegates to the orchestrator with full context.

---

## Phase 2: CDP Targeted Exploration (in isolated subagent)

> **Context management**: CDP exploration runs in an isolated subagent to prevent raw DOM/snapshot data from accumulating in the main command context. This is especially important for batch processing (multiple issues = multiple CDP explorations).

Launch a **cdp-explorer subagent** with CDP tools:

```
prompt:
```
You are a CDP page explorer. First read skills/cdp-explorer/SKILL.md.

Task: Targeted exploration of a page area related to a Linear issue.

Input:
- mode: "targeted"
- pageUrl: {issue pageUrl extracted in Phase 1}
- targetArea: {derived from issueContext.feature — e.g., feature "canvas-download" → targetArea "download" or ".download-section". If feature is vague, use reproSteps[0] to infer the UI area}
- reproSteps: {reproduction steps extracted in Phase 1, if available}
- expectedBehavior: {from issue}
- actualBehavior: {from issue}
- baselineFile: {$QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{slug}.json}
- authSetup: {true/false}
- testCredentials: {E2E_TEST_EMAIL / E2E_TEST_PASSWORD, if authSetup=true}
- appLanguages: {APP_LANGUAGES or null}
- i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
  When set, perform i18n reverse-lookup per cdp-explorer SKILL.md Step 3.5
- sourceProjectDir: {resolved source code directory per priority: --source > prSourceDir > SOURCE_PROJECT_DIR > QA_WORKSPACE_DIR}
  MUST execute cdp-explorer Phase 0 (source pre-read) before any DOM scanning.
- previousSourceContext: {sharedSourceContext from previous CDP subagents in batch mode, or {} for first/single issue}

Steps:
1. Connect to page (list_pages → select_page, or navigate to pageUrl)
1.5. **Source Code Pre-Read**: Per cdp-explorer/SKILL.md Phase 0, grep sourceProjectDir for
     the component rendering targetArea. Build sourceContext for use in Steps 3-5.
2. Login wall handling: detect login page → fill credentials → login → generate auth.setup.ts if not present → generate sign-in POM
3. Initial state three-layer scan (DOM → accessibility tree → screenshot)
4. Targeted interactive exploration around targetArea:
   - If targetArea is found on the page → explore around it (cdp-explorer Phase 3 targeted rules)
   - **If targetArea is NOT found** → degrade to full mode: scan all interactive elements on the page, identify the most likely area matching the issue description, then explore that
   - If reproSteps available → operate step by step, record state changes at each step
5. Compare expectedBehavior vs actualBehavior — record discrepancies
6. Write findings to baselineFile using **merge strategy**:

   **Pre-merge existence check** (before writing to baseline):
   - If baselineFile exists AND was created by a different source (check `meta.mode`):
     a. If existing baseline `meta.mode` = "full" (from qa-explore) and current is "targeted" (from qa-from-issue):
        → Use merge strategy below (targeted adds to existing full scan)
     b. If existing baseline `meta.mode` = "targeted" and current is also "targeted":
        → Merge (both are partial scans, combine them)
     c. If existing baseline has states that conflict with new states (same element, different selectors):
        → Prefer newer scan (current exploration is more recent)
   - If baselineFile does NOT exist → create new file with initial structure

   - If baselineFile already exists (from a previous /qa-explore or /qa-from-issue run):
     - **Read existing** states, edges, areas first
     - **Append** new states (next ID = `max(existing numeric IDs) + 1`, e.g., existing S1,S2,S5 → next is S6. Never overwrite existing)
     - **Append** new edges (skip duplicates by `from+action+element` key)
     - **Update** area status for the targeted area only
     - **Preserve** all other areas' data untouched
   - If baselineFile does not exist → create new file with initial structure
   - Always record: states, edges, forms, activation attempts, coverage report
   - If login was handled, record login selectors used

Return summary:
{
  "baselineFile": "{path}",
  "newStates": ["S1", "S2"],
  "newEdges": 3,
  "targetAreaFound": true|false,
  "degradedToFull": true|false,
  "behaviorMatch": { "expected": "...", "actual": "...", "matches": true|false }
}
```
```

> The subagent performs the full CDP exploration. All raw data stays in its context and is released when it finishes. Only the summary (~200 tokens) enters the main command context. All detailed findings are persisted in the baseline JSON file.

---

## Phase 3: Sequential Agent Launch (execute in order)

**Key constraint**: When launching agents, the prompt only passes **input data** (issue context, CDP exploration results, source, projectContext),
**do not** include specific code conventions, locator strategies, or file templates in the prompt.
Agents must read the `.claude/agents/e2e-orchestrator.md` -> `skills/*/SKILL.md` chain to get specifications themselves.

**Agent 1 — e2e-orchestrator** (sonnet):

prompt template:
```
You are e2e-orchestrator. First read .claude/agents/e2e-orchestrator.md to understand your full responsibilities and steps.

Input:
- source: "issue"
- issueKey: <issue-key>
- issueContext: { pageUrl, expectedBehavior, actualBehavior, reproSteps, priority, feature }
- baselineFile: <baseline JSON path from Phase 2 exploration>
- existingSpec: {matchedSpec path from Phase 1 Step 3, or null if no match}
- existingSpecContent: {full content of matched spec file, or null — so orchestrator can compare with issue and decide to update/extend/regenerate}
- projectContext:
        targetProjectDir: {QA_WORKSPACE_DIR}
        sourceProjectDir: {resolved source code directory per priority: --source > prSourceDir > SOURCE_PROJECT_DIR > QA_WORKSPACE_DIR}
        baseURL: {PREVIEW_URL}
        existingTests: tests/e2e/testcases/
        techStack: {from CLAUDE.md}
        authSetup: {true/false based on E2E_TEST_EMAIL}
        appLanguages: {APP_LANGUAGES or null}
        i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}

Execute per .claude/agents/e2e-orchestrator.md steps (read SKILL.md -> generate), return artifact paths.
```

**Check orchestrator return value**:
- If both `specs` and `modified_specs` are empty -> skip qa-fix-tests and report-analyzer, inform user directly
- Otherwise -> merge into execution list, continue

**MANDATORY VERIFICATION GATE** (after ALL orchestrators complete):

Execute `.claude/references/verification-gate-v1-v5.md` (Steps V1-V5) for EACH orchestrator result.
Pipeline **STOPS** if any check fails — do NOT proceed to test-executor.

**POM Fragment Merge** (when multiple orchestrators target the same page):
Execute `.claude/references/pom-merge.md`

**Build specToIssueMap** (command layer, after orchestrator returns):
- Read `specToIssueMap` directly from the orchestrator's return value (the orchestrator populates this field in issue mode)
- Merge mappings from all orchestrator results. **Multiple issues may map to the same spec** (same page):
  - For each orchestrator result, iterate its specToIssueMap entries
  - If spec already in map → convert value to array: `specToIssueMap[spec] = [...existing, newIssueKey]`
  - If spec not in map → `specToIssueMap[spec] = [issueKey]`
- Example:
  ```json
  { "tests/e2e/testcases/generated/feature-a-issue.test.ts": ["STE-9"],
    "tests/e2e/testcases/generated/feature-b-issue.test.ts": ["STE-10", "STE-11"] }
  ```

**Export Excel** (after orchestrator completes + verification gate passes):
Execute `.claude/references/excel-export-gate.md` (with `{name}` = `{slug}`)

### Step 2 — Delegate to /qa-fix-tests (Locator verification + fix + execution)

> **Separation of concerns**: qa-from-issue only handles CDP exploration + generation.
> Locator verification + fix + execution are all handled by `/qa-fix-tests` (consistent with qa-explore and qa-run-prd).

```
allGeneratedSpecs = orchestrator.specs + orchestrator.modified_specs

// Delegate to qa-fix-tests: CDP verify + fix + execute + regression
// Note: --skip-baseline means "skip baseline execution, fix directly" — applies to all sources (issue/cdp/prd), not just PRD
Execute /qa-fix-tests with arguments: --skip-baseline {allGeneratedSpecs joined by space}
```

**After qa-fix-tests completes, run smoke regression**:

```
// qa-fix-tests fixes the generated specs. Now run them together with smoke suite for regression.

// 1. Collect detectedBugs from qa-fix-tests output
detectedBugs = extract bug entries from qa-fix-tests output:
  [{ testName, expectedBehavior, actualBehavior, evidence, specFile }]

// 2. Launch test-executor with "changed+smoke" mode
//    Runs: (a) issue-related specs (all tests) + (b) all other specs (@smoke only)
Launch test-executor (sonnet):
  mode: "changed+smoke"
  specFiles: allGeneratedSpecs
  projectDir: "$QA_WORKSPACE_DIR"
  appLanguages: {APP_LANGUAGES or null}
  // See "Issue-Source Smoke Regression" section below for execution details.

// 3. Determine reportFile
reportFile = "tests/reports/fix-regression.json"
```

### Step 3 — Linear Reporting (after fix-tests completes)

> qa-from-issue is the only generation entry point that reports to Linear.
> After fix-tests completes, launch report-analyzer to analyze reports and submit.

**Agent — report-analyzer** (sonnet):
- Launched after qa-fix-tests completes
- Reads test reports produced by qa-fix-tests' test-executor
- **Must pass sourceIssueKey**; report-analyzer uses this to distinguish writeback vs. new creation
- **Must pass reportFile**; qa-fix-tests produces `fix-regression.json`, not the default `playwright-results.json`
- **Must pass detectedBugs** (if any); application bugs found by qa-fix-tests that need Linear reporting
- **Returns structured failure payload** — does NOT launch bug-reporter (command layer handles that)

prompt template:
```
You are report-analyzer. First read .claude/agents/report-analyzer.md to understand your full responsibilities.

Input:
- sourceIssueKeys: [<issue-key-1>, <issue-key-2>, ...]
- sourceSpecs: [{allGeneratedSpecs}]
- specToIssueMap: { "tests/e2e/testcases/generated/feature-a.test.ts": ["STE-9"], "tests/e2e/testcases/generated/feature-b.test.ts": ["STE-10", "STE-11"] }
- reportFile: "fix-regression.json"
- detectedBugs: [{detectedBugs from qa-fix-tests, or empty list if none}]
- projectContext: { targetProjectDir, ... }
- appLanguages: {APP_LANGUAGES or null}
- sourceProjectDir: {resolved source code directory per priority: --source > prSourceDir > SOURCE_PROJECT_DIR > QA_WORKSPACE_DIR, or null}

Note: This run was triggered by /qa-from-issue. Analyze and route failures:
1. Failures in sourceSpecs -> mark action: "append" with targetIssueId from specToIssueMap
2. Failures in other specs -> mark action: "create" after dedup check
3. detectedBugs -> transform to failure format with action: "create"
4. If ALL tests pass -> write success comment to source issues (you handle this directly via Linear MCP)

Return structured failure payload as JSON (see report-analyzer.md Step 3). Do NOT launch bug-reporter.
```

### Step 4 — Launch bug-reporter (conditional)

> **Why command layer**: The command layer (opus) handles bug-reporter orchestration to maintain clear agent hierarchy.

After report-analyzer returns, check if there are failures to report:

```
Parse report-analyzer's return for the `failures` array.

// Filter: only keep "append" actions (write back to source issue).
// "create" actions (new bug issues) are DISABLED.
appendFailures = failures.filter(f => f.action === "append")

If appendFailures.length > 0:

  Launch bug-reporter (sonnet):

  You are bug-reporter. First read .claude/agents/bug-reporter.md to understand your full responsibilities.

  Input:
  - linearTeamId: "{reportAnalyzerResult.linearConfig.linearTeamId}"
  - linearProjectId: "{reportAnalyzerResult.linearConfig.linearProjectId}"
  - previewUrl: "{reportAnalyzerResult.linearConfig.previewUrl}"
  - failures: {appendFailures}

  IMPORTANT: Only process action="append" entries (comment on existing source issues).
  Do NOT create any new Linear issues. Skip any action="create" entries.
  Return appended issue list.

If allPassed is true or failures is empty:
  report-analyzer already handled the success write-back to source issues.
  No bug-reporter needed.
```

### Post-processing — Update Summary with Linear URLs

After bug-reporter returns `{ appended }`:
1. Read `$QA_WORKSPACE_DIR/tests/reports/combined/summary.md`
2. Replace the "Linear 上报（待命令层执行）" section with actual results:
   - 回写源 Issue: N 条 — {issue URLs}
   - 新发现的 Bug: N 条（已跳过，未创建 Linear issue）
3. Write updated summary back

---

> **Issue-Source Smoke Regression**: See `.claude/agents/test-executor.md` § "changed+smoke Mode Execution" for execution details (two-run merge + dedup). report-analyzer uses `specToIssueMap` to route failures: issue specs → append to source issue, smoke specs → dedup + create new issue.

---

## Artifacts

| File | Description |
|------|-------------|
| `test-cases/generated/{slug}-{source}.md` | Phase 3: Test cases |
| `test-cases/generated/playwright-handoff-{slug}.json` | Phase 3: Playwright handoff |
| `test-cases/excel/{slug}-{source}.xlsx` | Phase 3: Excel test case spreadsheet |
| `tests/e2e/pages/{slug}.page.ts` | Phase 3: Page Object |
| `tests/e2e/testcases/generated/{slug}-{source}.test.ts` | Phase 3: Playwright spec (feature-granular, no area-id) |
| `tests/reports/fix-regression.json` | Phase 4: JSON report (from qa-fix-tests regression) |
| `playwright-report/index.html` | Phase 4: HTML report |
| `tests/reports/combined/summary.md` | Phase 5: Summary report (always generated) |
| Linear issue (original) | Phase 6: Write back test file paths + execution results |
| Linear issue (new) | Phase 5: Failed case reporting (after dedup) |
