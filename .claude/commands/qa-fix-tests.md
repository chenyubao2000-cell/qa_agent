---
description: Fix failed E2E test cases (non-skipped) in the target project by exploring real pages via CDP + correcting locators/assertions
allowed-tools: Agent, Bash, Read, Write, Edit, Glob, Grep, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

You are a test fix expert. Find failed non-skipped E2E cases in the target project, explore real page state via CDP, fix locators and assertions until tests pass (but always respect business logic — don't just make tests pass for the sake of passing; the failure may indicate a real bug).

```
/qa-fix-tests [spec-file-path] [--source <source-code-dir>] [--from-prd]
     |
Phase 0: Load project context
     |
Phase 1: Filter non-skipped cases -> Execute -> Collect failure list
     |
Phase 2: Fix one by one (CDP explore -> Analyze error -> Fix spec/POM -> Single-file verify)
     |
Phase 3: Full regression -> Summary report
```

## Phase 0: Load Project Context

```
Read(".env")
```

Extract `QA_WORKSPACE_DIR`.

### Source Code Directory

Source code directory priority: `--source` in `$ARGUMENTS` > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`
- **Read source code** (viewing component implementation, locating locators) -> read from source directory
- **Write files** (fixed spec/POM) -> always write to QA_WORKSPACE_DIR

```
Read("$SOURCE_PROJECT_DIR/CLAUDE.md")        # only for understanding business logic
```

All Playwright config is extracted from **this project's .env**: `baseURL` (PLAYWRIGHT_BASE_URL), `testCredentials` (E2E_TEST_EMAIL / E2E_TEST_PASSWORD).

### --from-prd Mode (Skip Baseline, Direct Fix)

When `--from-prd` is present in `$ARGUMENTS` (chained from /qa-run-prd):
1. **Skip Phase 1 entirely** — do not run baseline test execution
2. Treat ALL spec files from arguments as needing fixes (PRD-generated specs have never seen the real page)
3. Go directly to Phase 2 with the full spec file list
4. This saves the baseline execution round (typically 1-2h) since qa-run-prd's CDP verification already confirmed locator mismatches

When `--from-prd` is NOT present → execute Phase 1 normally (filter + execute + collect failures).

---

## Phase 1: Filter and Execute

### Step 1 — Find non-skipped spec files

```
Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts")
```

- If result is empty -> inform user "No spec files in target project, please run /qa-explore or /qa-run-prd to generate tests first" -> end

For each file, Grep to check if **entire file is skipped** (`test.describe.skip` or all `test(` replaced by `test.skip(`):
- Entire file skipped -> exclude
- Partially skipped or no skip -> include in execution list

If `$ARGUMENTS` specifies file paths, only process specified files.

### Step 2 — Execute baseline tests (via test-executor, selective mode)

Launch **test-executor** agent to identify failures:

```
Launch test-executor (haiku):
  Input:
  - mode: "selective"
  - specFiles: <non-skip-file-list>
  - projectDir: $QA_WORKSPACE_DIR
```

> **Efficiency**: Only runs non-skipped files. If user specified specific files in arguments, the list is even smaller.

### Step 3 — Parse failure list

Read `fix-baseline.json`, extract all cases with `status: "failed"`:

```
failedTests = [
  {
    file: "tests/e2e/testcases/chat-workspace.test.ts",
    testName: "Workspace page - sidebar collapse button visible",
    error: "locator.click: Error: strict mode violation: getByRole('button', { name: /collapse/i }) resolved to 3 elements",
    screenshot: "test-results/.../test-failed-1.png"
  },
  ...
]
```

If all pass -> inform user "All non-skipped cases have passed, no fixes needed" -> end.

---

## Phase 2: Fix One by One

> **Context management**: Each failed file's fix cycle (CDP explore → analyze → fix → verify) runs in an **isolated subagent**. This prevents CDP data from accumulating in the main command context across multiple files (10 files × 3 rounds × CDP data would otherwise explode the context).

Group `failedTests` by file. For each failed file, launch a **fix-single-file subagent**:

```
For each failed file:
  Launch subagent with CDP tools + Edit tool, passing:

  prompt:
  ```
  You are a test fix expert. Read skills/cdp-explorer/SKILL.md and skills/playwright-script-generator/SKILL.md.

  Task: Fix one failed test file by exploring the real page via CDP.

  CRITICAL PRINCIPLE: Not all failures should be "fixed". A test failure may indicate:
  (A) Test issue — locator stale, timing, selector ambiguity → FIX the test
  (B) Application bug — feature genuinely broken, real regression → DO NOT fix, REPORT as bug

  You MUST classify each failure before deciding to fix or report.

  Input:
  - specFile: {absolute path to failed spec file}
  - pomFile: {absolute path to corresponding POM, inferred from spec's import}
  - handoffFile: {absolute path to corresponding handoff JSON — read from spec file header comment `// handoff: ...`, fallback: infer from spec filename → test-cases/generated/playwright-handoff-{slug}.json}
  - failures: [{ testName, error, screenshot }]  // failed cases in this file
  - pageUrl: {URL extracted from spec's page.goto()}
  - sourceProjectDir: {SOURCE_PROJECT_DIR}  // for understanding business logic
  - baselineFile: {path to page-baseline-{slug}.json if it exists — may contain cdpFindings from qa-run-prd's page verify step or previous fix agents}
  - previousFixContext: {cdpFindings from previous fix agents in this session, if any — includes verified locators, DOM structure, page notes}
    When present, SKIP redundant CDP exploration for pages already documented.
    Only perform new CDP exploration for elements NOT in the existing findings.

  Steps:
  0. **Read handoff as source of truth**:
     Read handoffFile. For each failed test, find the matching handoff entry by TC ID.
     The handoff entry defines WHAT the test should verify (assertions, expected behavior).
     Your job is to make the test PASS by fixing HOW it verifies (locators, waits, selectors),
     NOT by changing WHAT it verifies. If the handoff says "expect heading 'Welcome'",
     you fix the locator to find the heading, you do NOT change the assertion to match
     whatever text happens to be on the page.

     If handoffFile does NOT exist → log warning, proceed with spec-only analysis (degraded mode).

  1. Connect to page (list_pages → select_page, or navigate if needed)
  2. Login wall detection per cdp-explorer Phase 1 Step 3
  3. For each failure, FIRST CLASSIFY (using handoff assertions as reference), then act:

     === Step 3a: Classify failure type ===

     | Error Pattern | Classification | Reasoning |
     |--------------|---------------|-----------|
     | strict mode violation: resolved to N elements | TEST ISSUE | Selector matches too broadly — UI restructured but feature works |
     | locator resolved to 0 elements, BUT similar element exists with different selector | TEST ISSUE | Element moved/renamed — locator stale |
     | locator resolved to 0 elements, AND no similar element on page | POSSIBLE BUG | Feature element was removed entirely |
     | toHaveText expected "X" got "Y", AND "Y" is reasonable business content | TEST ISSUE | Text updated legitimately (e.g., copy change) |
     | toHaveText expected "X" got "Y", AND "Y" is error/empty/broken | POSSIBLE BUG | Feature is broken, showing error instead of content |
     | toHaveText expected "X" got "", element exists but empty | POSSIBLE BUG | Data not loading, possible API regression |
     | button expected enabled but is disabled | POSSIBLE BUG | Feature constraint changed or broken |
     | button expected visible but hidden | POSSIBLE BUG | Feature removed or access control changed |
     | Timeout waiting for element | AMBIGUOUS | Could be slow load (test issue) or missing element (bug) |
     | Target closed / navigation error | TEST ISSUE | Page routing changed |

     === Step 3b: For TEST ISSUE — fix normally ===
     b1. CDP verify mode: check locator match count
         - 0 matches → full DOM scan to find correct selector
         - N matches → DOM scan to find narrowing parent
     b2. Fix POM (Edit tool): replace/narrow locators, add new getters
     b3. Fix spec (Edit tool): add waits, fix timing issues
     b4. **Do NOT change business assertions** (what the test checks). Only change technical implementation (how it locates/waits). The handoff defines WHAT; you fix HOW.
     b5. If real page content has legitimately changed (e.g., copy update) AND handoff assertion is now wrong → this is an UPDATE scenario, not a fix. Update the handoff entry's assertion first, then update the spec to match.
     b6. Strictly follow POM rules: no bare locators in specs

     === Step 3c: For POSSIBLE BUG — do NOT fix ===
     c1. Read source code (from sourceProjectDir) to understand the intended behavior
     c2. Compare: What does the code/PRD say SHOULD happen vs. what actually happens?
     c3. If source code confirms the current behavior is WRONG → classify as BUG:
         - Do NOT modify the test assertion (the original assertion is correct)
         - Record as: { classification: "bug", testName, expectedBehavior, actualBehavior, evidence }
     c4. If source code confirms the behavior change is INTENTIONAL → reclassify as TEST ISSUE → go to Step 3b

     === Step 3d: For AMBIGUOUS — investigate deeper ===
     d1. Wait longer (increase timeout to 30s) and retry
     d2. If element appears → TEST ISSUE (add explicit wait)
     d3. If element never appears → check source code → BUG or TEST ISSUE

  4. After processing all failures:
     - For TEST ISSUES fixed: run single-file verification via test-executor (mode: "single", specFiles: [specFile])
     - For BUGs: do NOT run verification (test is supposed to fail; the app needs fixing)
  5. If test issues still fail after fix → re-analyze (max 3 rounds)
  6. If still fails after 3 rounds → mark as needs manual intervention

  Return:
  {
    "file": "{specFile}",
    "status": "fixed" | "needs_manual" | "has_bugs",
    "fixedCount": N,
    "bugCount": N,
    "needsManualCount": N,
    "fixes": [
      { "testName": "...", "classification": "test_issue", "error": "...", "action": "replaced locator", "result": "fixed" },
      { "testName": "...", "classification": "bug", "error": "...", "expectedBehavior": "button enabled", "actualBehavior": "button disabled", "evidence": "src/Button.tsx removed onClick handler", "result": "bug_reported" },
      { "testName": "...", "classification": "test_issue", "error": "...", "action": "...", "result": "needs_manual" }
    ]
  }
  ```

  // Subagent performs all CDP interactions internally (~50-100K tokens).
  // Only the summary (~200 tokens) enters the main command context.
  // Spec/POM edits are written to disk by the subagent — persisted regardless of context.

  Collect subagent result into fixResults[]

  // ── Cross-File CDP Context Sharing ──
  // After each fix subagent completes, persist its CDP findings for subsequent agents:
  if subagent returned cdpFindings:
    1. Read existing page-baseline-{slug}.json (or create if absent)
    2. Merge cdpFindings into baseline.fixContext field:
       { verifiedLocators: {...}, domStructure: {...}, pageNotes: [...] }
    3. Pass updated fixContext to the NEXT fix subagent as previousFixContext

  // This prevents Agent N from re-exploring the same page that Agent 1 already mapped.
  // Typical savings: 4 agents × 20 min CDP exploration = 80 min → 20 min (only first agent explores).
```

---

## Phase 2.5: Bug Summary (report only, no Linear escalation)

> **qa-fix-tests does NOT report to Linear.** Its job is fixing scripts. If bugs are found, inform the user and let them decide whether to run `/qa-run-all` for formal reporting.

After all fix subagents complete, check if any classified failures as application bugs:

```
detectedBugs = fixResults.filter(r => r.bugCount > 0).flatMap(r =>
  r.fixes.filter(f => f.classification === "bug")
)

if detectedBugs.length > 0:
  // Do NOT launch report-analyzer. Only inform the user.
  Report to user:
  ```
  Found N possible application bugs during test fixing (NOT reported to Linear):
  1. [task-create.test.ts] Submit button stays disabled — expected enabled after form fill
  2. [chat-main.test.ts] Empty chat area — expected message displayed
  Tests for these bugs were NOT modified (assertions are correct per handoff).
  To formally report these bugs to Linear, run /qa-run-all.
  ```
```

---

## Phase 3: Regression on Modified Files (via test-executor, changed mode)

After all files are fixed, run regression **only on modified files** (not the entire test suite):

```
modifiedFiles = fixResults
  .filter(r => r.status === "fixed")
  .map(r => r.file)

Launch test-executor (haiku):
  Input:
  - mode: "changed"
  - specFiles: modifiedFiles  // only the files that were actually fixed
  - projectDir: $QA_WORKSPACE_DIR
```

> **Efficiency**: If 3 files were fixed out of 50, only re-run those 3 — not all 50. Full regression across all specs is the job of `/qa-run-all`, not `/qa-fix-tests`.

### Summary Report

Output fix results:

```
## Fix Report

### Before Fix
- Total cases: N
- Passed: N
- Failed: N

### After Fix
- Total cases: N
- Passed: N
- Failed: N (includes N bugs that SHOULD fail)
- Successfully fixed (test issues): N cases
- Bugs detected (not fixed, test preserved): N cases
- Needs manual intervention: N cases

### Test Issues Fixed

| # | File | Case | Error | Action | Result |
|---|------|------|-------|--------|--------|
| 1 | chat-workspace.test.ts | Sidebar collapse | strict mode 3 elements | POM parent scope narrowing | Fixed |
| 2 | homepage.test.ts | Nav link | 0 elements | POM locator replacement | Fixed |

### Application Bugs Detected (tests NOT modified — failures are correct)

| # | File | Case | Expected Behavior | Actual Behavior | Evidence |
|---|------|------|--------------------|-----------------|----------|
| 1 | task-create.test.ts | Submit button enabled | Button enabled after form fill | Button stays disabled | src/TaskForm.tsx removed validation logic |
| 2 | chat-main.test.ts | Message displayed | Message shows in chat | Empty chat area | API returns 500 |

### Needs Manual Review

| # | File | Case | Error | Reason |
|---|------|------|-------|--------|
| 1 | dashboard.test.ts | Chart render | Timeout | Cannot determine if test issue or bug after 3 rounds |
```

> **Key principle**: Bugs in the "Application Bugs Detected" section mean the **test is correct but the app is broken**. These tests SHOULD fail. Do NOT modify them. Report them to the development team or create Linear issues via `/qa-run-all` to trigger report-analyzer's bug reporting flow.
