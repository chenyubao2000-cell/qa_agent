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

Extract all config from **this project's .env**: `QA_WORKSPACE_DIR`, `PREVIEW_URL`, `PLAYWRIGHT_BASE_URL`, `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`, `APP_LANGUAGES`, `I18N_MESSAGES_DIR`, `techStack` (source CLAUDE.md).

### Step 2 — Initialize Workspace (empty folder compatible, skip all if already initialized)

Same as `/qa-explore` Phase 0 Step 2: directories, npm install, playwright.config.ts, fixtures.ts.
> Including i18n fixture generation: when APP_LANGUAGES is configured, generate i18n fixture per qa-explore Phase 0 Step 2e specification.

global-setup.ts is not generated at this point — it's written when CDP exploration encounters a login wall in Phase 2 (see below).

### Step 3 — Determine Navigation URL

If `pageUrl` extracted from the issue is a relative path, concatenate with `baseURL`.

---

## Input

`$ARGUMENTS` supports multiple formats, **batch-capable**:

```
/qa-from-issue STE-9                     # single issue key
/qa-from-issue STE-9 STE-10 STE-11      # multiple issue keys (space-separated)
/qa-from-issue 790b5957-...              # single issue ID
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
     for each pageUrl group:
       CDP targeted exploration → write baseline (subagent, serial due to CDP)

   Step 2 — Parallel test generation (one orchestrator per pageUrl group, all at once):
     for each pageUrl group: (launched in parallel)
       orchestrator → test cases + POM + spec

   Step 3 — Delegate to /qa-fix-tests (verify + fix + execute):
     /qa-fix-tests --from-prd → locator fix → regression

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
         /qa-fix-tests --from-prd -> CDP verify + fix + execute
              | after completion
         report-analyzer -> route failures:
               +-- source issue spec failures -> write back to original issue
               +-- other failures -> dedup + create new issue
```

---

## Phase 1: Read Issue

### Step 1 — Get Issue Details

```
mcp__linear__get_issue  issueId=$ARGUMENTS
```

If the input is a search keyword (not ID/key format), search first:
```
mcp__linear__search_issues  query=$ARGUMENTS
```
List matching results, select the most relevant one.

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

### Step 3 — Determine Operation Type

> Detailed dedup review rules are defined uniformly in `agents/e2e-orchestrator.md` Step 2, shared across all generation flows.
> Only issue-specific quick determination is done here:

Determine operation mode via explicit if-else:

```
Step 3a — Search for existing spec match:
  tcId = extract TC ID from issue title/description (regex: /TC-\w+-\d+/)
  specFilename = extract .test.ts filename from issue description (regex: /[\w-]+\.test\.ts/)

  if tcId found:
    Grep(tcId, "$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/")
    → matchedSpec = first file containing this TC ID
  elif specFilename found:
    Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/{specFilename}")
    → matchedSpec = matched file (if exists)
  else:
    matchedSpec = null

Step 3b — Determine mode:
  if matchedSpec exists AND issue describes a test failure (error message, screenshot, "failed", "broken"):
    → Mode X: Fix existing test (bypass orchestrator, launch fix subagent)
  elif matchedSpec exists AND issue describes a NEW scenario not covered by the existing spec:
    → Mode A: Append new test angles to existing spec (orchestrator with existing spec context)
  else:
    → Mode B: Create new cases + POM + spec (orchestrator from scratch)
```

> **Key distinction**: Mode X = "existing test is broken, fix it". Mode A = "existing spec exists but doesn't cover this scenario, add to it". Mode B = "no existing spec, create everything".

### Mode X Execution (fix existing test, no new cases)

When Mode X is determined, the flow **bypasses orchestrator** and launches a single **fix subagent** that combines CDP exploration + spec/POM fixing:

```
Launch fix-from-issue subagent with CDP tools + Edit tool:

prompt:
```
You are a test fix expert. Read skills/cdp-explorer/SKILL.md.

Task: Fix an existing test that is failing, based on a Linear issue report.

Input:
- specFile: {absolute path to the existing spec identified in Phase 1 Step 3}
- pomFile: {absolute path to corresponding POM, inferred from spec's import}
- handoffFile: {absolute path to handoff JSON — read from spec header comment `// handoff:`, fallback: infer from slug}
- issueContext: { pageUrl, expectedBehavior, actualBehavior, reproSteps, priority, feature }
- pageUrl: {issueContext.pageUrl, concatenated with baseURL if relative}
- authSetup: {true/false}
- testCredentials: {if authSetup=true}

Steps:
1. Read the existing spec file and its POM
2. Connect to the page (list_pages → select_page, or navigate to pageUrl)
3. Login wall detection → handle if needed
4. CDP targeted exploration around the issue's target area:
   - mode: "targeted"
   - If reproSteps available → follow steps, record state changes
   - Three-layer scan (DOM → accessibility tree → screenshot)
5. Compare CDP findings with existing spec/POM:
   - For each locator in POM → CDP verify: count matches on live page
   - ZERO matches → DOM scan to find correct selector → Edit POM
   - MULTIPLE matches → DOM scan for narrowing parent → Edit POM
   - For each assertion in spec → evaluate_script to get real values
   - Text/URL mismatches → Edit spec with correct expected values
6. Run single-file verification:
   PLAYWRIGHT_JSON_OUTPUT_NAME=$QA_WORKSPACE_DIR/tests/reports/fix-verify.json \
   cd $QA_WORKSPACE_DIR && npx playwright test {specFile} --reporter=json,html
7. If still fails → re-analyze and fix (max 3 rounds)

Return:
{
  "specFile": "{path}",
  "status": "fixed" | "needs_manual",
  "locatorsFixed": N,
  "assertionsFixed": N,
  "behaviorMatch": { "expected": "...", "actual": "...", "matches": true|false }
}
```
```

After subagent returns:
- Add `subagentResult.specFile` to `modified_specs` list (convert singular to array: `modified_specs.push(specFile)`)
- Set `specs = []` (Mode X generates no NEW specs, only modifies existing)
- If `status: "fixed"` → continue to test-executor with `modified_specs`
- If `status: "needs_manual"` → report to user, still include in `modified_specs` for test-executor to verify
- **Skip orchestrator entirely** (no new test cases, no Excel)
- **Sync handoff**: if spec assertions were changed during fix, read the corresponding `playwright-handoff-{slug}.json`, update the matching entry's assertions to reflect the fix, then write back. This keeps handoff in sync with the fixed spec.

  **Handoff sync implementation** (after Mode X fix subagent returns):
  1. Read the fixed spec file, extract all TC IDs from test() block comments (regex: `TC-\w+-\d+`)
  2. Read the corresponding handoff JSON (inferred from spec header `// handoff: ...`)
  3. For each TC ID found in the fixed spec:
     a. Find the matching entry in handoff by `id` field
     b. If the fix subagent changed an assertion text (e.g., updated expected URL or text):
        - Read the new assertion from the fixed spec's expect() call
        - Update the handoff entry's `assertions[]` to match
     c. If the fix subagent added new waits or locator changes: no handoff update needed (handoff tracks WHAT, not HOW)
  4. Write updated handoff JSON back to disk
  This keeps handoff in sync with the fixed spec for future /qa-run-prd incremental updates.

  **Responsibility boundary**:
  - The **fix subagent** returns `{ assertionsChanged: true/false, changedAssertions: [{ tcId, field, oldValue, newValue }] }` in its result
  - The **command layer** reads this flag and performs the handoff file update (not the subagent)
  - This ensures the subagent only does CDP + Edit, while the command layer owns artifact consistency

- When building `specToIssueMap`, map the Mode X specFile to its source issueKey:
  `specToIssueMap[specFile] = issueKey`

> **Key difference from Mode A/B**: No orchestrator call. The subagent reads the spec, uses CDP to understand the real page, then directly edits the spec/POM. This is essentially what `/qa-fix-tests` does for a single file, but scoped to the issue's context and running in an isolated subagent.

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
- targetArea: {functional area referenced by the issue, e.g., "button:download" or ".download-section"}
- reproSteps: {reproduction steps extracted in Phase 1, if available}
- expectedBehavior: {from issue}
- actualBehavior: {from issue}
- baselineFile: {$QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{slug}.json}
- authSetup: {true/false}
- testCredentials: {E2E_TEST_EMAIL / E2E_TEST_PASSWORD, if authSetup=true}
- appLanguages: {APP_LANGUAGES or null}
- i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
  When set, perform i18n reverse-lookup per cdp-explorer SKILL.md Step 3.5

Steps:
1. Connect to page (list_pages → select_page, or navigate to pageUrl)
2. Login wall handling: detect login page → fill credentials → login → generate global-setup.ts if not present → generate sign-in POM
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
     - **Append** new states (use next available state ID, never overwrite existing)
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
Agents must read the `agents/e2e-orchestrator.md` -> `skills/*/SKILL.md` chain to get specifications themselves.

**Agent 1 — e2e-orchestrator** (sonnet):

prompt template:
```
You are e2e-orchestrator. First read agents/e2e-orchestrator.md to understand your full responsibilities and steps.

Input:
- source: "issue"
- issueKey: <issue-key>
- issueContext: { pageUrl, expectedBehavior, actualBehavior, reproSteps, priority, feature }
- baselineFile: <baseline JSON path from Phase 2 exploration>
- projectContext:
        targetProjectDir: {QA_WORKSPACE_DIR}
        baseURL: {PLAYWRIGHT_BASE_URL}
        existingTests: tests/e2e/testcases/
        techStack: {from CLAUDE.md}
        appLanguages: {APP_LANGUAGES or null}
        i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}

Execute per agents/e2e-orchestrator.md steps (read SKILL.md -> generate), return artifact paths.
```

**Check orchestrator return value**:
- If both `specs` and `modified_specs` are empty -> skip qa-fix-tests and report-analyzer, inform user directly
- Otherwise -> merge into execution list, continue

**MANDATORY VERIFICATION GATE** (after ALL orchestrators complete):

Execute the Post-Return File Verification checklist from `agents/e2e-orchestrator.md` (Steps V1-V5). Pipeline **STOPS** if any check fails.

```
For EACH orchestrator result, verify:
  V1: .md files exist + contain "## Merged Test Case List" + at least 1 "**TC-"
  V2: handoff JSON exists + valid JSON array + entry count matches .md TC count
  V3: spec files exist + contain "test(" + contain "import"
  V4: POM files exist + contain "export class"
  V5: cross-artifact consistency (spec imports match POM, spec header references handoff)

If ANY verification fails → STOP, report error to user, do NOT proceed to test-executor.
Only proceed after ALL checks pass.
```

**Build specToIssueMap** (command layer, after orchestrator returns):
- Read `specToIssueMap` directly from the orchestrator's return value (the orchestrator populates this field in issue mode)
- Merge mappings from all orchestrator results: `specToIssueMap = Object.assign({}, ...results.map(r => r.specToIssueMap))`
- For Mode X (fix existing): add the mapping manually: `specToIssueMap[specFile] = issueKey`
- Example:
  ```json
  { "tests/e2e/testcases/generated/feature-a.test.ts": "STE-9",
    "tests/e2e/testcases/generated/feature-b.test.ts": "STE-10" }
  ```

**Export Excel** (after orchestrator completes + verification gate passes):
```bash
node skills/excel-case-export/scripts/generate-excel.js \
  --input-dir $QA_WORKSPACE_DIR/test-cases/generated \
  --output $QA_WORKSPACE_DIR/test-cases/excel/{slug}-all-cases.xlsx
```

Verify: `Glob("$QA_WORKSPACE_DIR/test-cases/excel/{slug}-all-cases.xlsx")` → if missing, ERROR

### Step 2 — Delegate to /qa-fix-tests (Locator verification + fix + execution)

> **Separation of concerns**: qa-from-issue only handles CDP exploration + generation.
> Locator verification + fix + execution are all handled by `/qa-fix-tests` (consistent with qa-explore and qa-run-prd).

```
allGeneratedSpecs = orchestrator.specs + orchestrator.modified_specs

// Delegate to qa-fix-tests: CDP verify + fix + execute + regression
Execute /qa-fix-tests with arguments: --from-prd {allGeneratedSpecs joined by space}
```

### Step 3 — Linear Reporting (after fix-tests completes)

> qa-from-issue is the only generation entry point that reports to Linear.
> After fix-tests completes, launch report-analyzer to analyze reports and submit.

**Agent — report-analyzer** (haiku):
- Launched after qa-fix-tests completes
- Reads test reports produced by qa-fix-tests' test-executor
- **Must pass sourceIssueKey**; report-analyzer uses this to distinguish writeback vs. new creation

prompt template:
```
You are report-analyzer. First read agents/report-analyzer.md to understand your full responsibilities.

Input:
- sourceIssueKeys: [<issue-key-1>, <issue-key-2>, ...]
- sourceSpecs: [{allGeneratedSpecs}]
- specToIssueMap: { "tests/e2e/testcases/generated/feature-a.test.ts": "STE-9", ... }
- projectContext: { targetProjectDir, ... }
- appLanguages: {APP_LANGUAGES or null}

Note: This run was triggered by /qa-from-issue. Failed cases need to be categorized:
1. Failures in sourceSpecs -> route to the corresponding sourceIssueKey via specToIssueMap, write back comments
2. Failures in other specs -> normal dedup + create new issues
```

---

## Artifacts

| File | Description |
|------|-------------|
| `test-cases/generated/{slug}-{source}.md` | Phase 3: Test cases |
| `test-cases/generated/playwright-handoff-{slug}.json` | Phase 3: Playwright handoff |
| `test-cases/excel/{slug}-{source}.xlsx` | Phase 3: Excel test case spreadsheet |
| `tests/e2e/pages/{slug}.page.ts` | Phase 3: Page Object |
| `tests/e2e/testcases/generated/{slug}-{area-id}-{source}.test.ts` | Phase 3: Playwright spec |
| `tests/reports/playwright-results.json` | Phase 4: JSON report |
| `playwright-report/index.html` | Phase 4: HTML report |
| `tests/reports/combined/summary.md` | Phase 5: Summary report (always generated) |
| Linear issue (original) | Phase 6: Write back test file paths + execution results |
| Linear issue (new) | Phase 5: Failed case reporting (after dedup) |
