---
description: Fix failed E2E test cases (non-skipped) in the target project by exploring real pages via CDP + correcting locators/assertions
allowed-tools: Agent, Bash, Read, Write, Edit, Glob, Grep, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

You are a test fix expert. Find failed non-skipped E2E cases in the target project, explore real page state via CDP, fix locators and assertions until tests pass (but always respect business logic — don't just make tests pass for the sake of passing; the failure may indicate a real bug).

```
/qa-fix-tests [spec-file-path] [--source <source-code-dir>] [--skip-baseline] [--upgrade-i18n]
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

### Argument Parsing

Parse `$ARGUMENTS` to extract flags and file paths:
```
skipBaseline = $ARGUMENTS contains "--skip-baseline"
specFiles = all tokens in $ARGUMENTS that end with ".test.ts" (file paths)
sourceDir = value after "--source" if present

If skipBaseline:
  // Skip Phase 1, go directly to Phase 2 with specFiles
  // specFiles are the newly generated specs from qa-run-prd
  If specFiles is empty → ERROR: "--skip-baseline requires spec file paths as arguments"
```

### Source Code Directory

Source code directory priority: `--source` in `$ARGUMENTS` > `prSourceDir` (from git-watcher prompt) > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`
- **Read source code** (viewing component implementation, locating locators) -> read from source directory
- **Write files** (fixed spec/POM) -> always write to QA_WORKSPACE_DIR

```
Read("$SOURCE_PROJECT_DIR/CLAUDE.md")        # only for understanding business logic
```

All Playwright config is extracted from **this project's .env**: `baseURL` (PREVIEW_URL, single source of truth), `testCredentials` (E2E_TEST_EMAIL / E2E_TEST_PASSWORD), `APP_LANGUAGES`, `I18N_MESSAGES_DIR`.

### Infrastructure Validation (i18n + Auth)

Execute `.claude/references/phase-0-workspace-init.md` § "i18n Infrastructure Validation" + § "Auth Infrastructure Validation".

> **Why here**: qa-fix-tests is often invoked standalone (not chained from qa-explore). If infrastructure is missing or changed since last run, tests fail for infrastructure reasons, not locator issues. Validating here catches this early.

### Spec Header Metadata Validation

For each spec file in the execution list, validate header metadata:
```
For each specFile:
  Read first 10 lines → extract "// source:", "// handoff:", "// generated:"
  If "// handoff:" missing → WARNING: "{specFile} missing handoff metadata, using filename-based inference"
  If "// source:" missing → WARNING: "{specFile} missing source metadata"
  Log inferred handoff path for traceability
```
> **Why**: Fix subagents use `// handoff:` to locate the handoff file. Missing header → fallback inference → may point to wrong file → assertion changes written to wrong handoff.

### --skip-baseline Mode (Skip Baseline, Direct Fix)

When `--skip-baseline` is present in `$ARGUMENTS` (chained from any upstream command: /qa-run-prd, /qa-explore, /qa-from-issue):
1. **Execute Phase 0 normally** — infrastructure validation (i18n, auth) is still required for Phase 2 CDP
2. **Skip Phase 1 entirely** — do not run baseline test execution
3. Treat ALL spec files from arguments as needing fixes (PRD-generated specs have never seen the real page)
4. Go directly to Phase 2 with the full spec file list — construct `failedTests` with one entry per spec file: `{ file: specFile, failures: [] }` (empty failures array signals "whole-file fix mode" — subagent scans all locators/assertions instead of targeting specific failures)
5. This saves the baseline execution round (typically 1-2h) since qa-run-prd's CDP verification already confirmed locator mismatches

When `--skip-baseline` is NOT present → execute Phase 1 normally (filter + execute + collect failures).

### --upgrade-i18n Mode (Upgrade Existing Specs to Multi-Language)

When `--upgrade-i18n` is present in `$ARGUMENTS`:

Execute the full i18n upgrade flow defined in `.claude/references/upgrade-i18n.md`.
That reference contains: precondition checks, spec file list determination, POM text scanning + i18n.t() replacement, locator conflict resolution, error handling, handoff JSON updates, fixture/config updates, and verification steps.

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
Launch test-executor (sonnet):
  Input:
  - mode: "selective"
  - specFiles: <non-skip-file-list>
  - projectDir: $QA_WORKSPACE_DIR
  - appLanguages: {APP_LANGUAGES or null}
```

> **Efficiency**: Only runs non-skipped files. If user specified specific files in arguments, the list is even smaller.

### Step 3 — Parse failure list

Read the test-executor result (JSON returned by test-executor agent, sourced from `tests/reports/playwright-results.json`), extract all cases with `status: "failed"`:

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

## Phase 2: Fix Failed Files

> **Context management**: Each failed file's fix cycle (CDP explore → analyze → fix → verify) runs in an **isolated subagent**. This prevents CDP data from accumulating in the main command context across multiple files (10 files × 3 rounds × CDP data would otherwise explode the context).

### Step 0 — Choose execution strategy

Determine fix strategy by priority:

0. **Special modes**: If `--upgrade-i18n` is present → skip strategy selection entirely (no Phase 1/2 agents, i18n upgrade runs directly)
1. **Explicit argument**: If `--strategy parallel` or `--strategy serial` in `$ARGUMENTS` → use that
2. **Called by upstream command** (e.g., `--skip-baseline` flag present → called by qa-explore/qa-run-prd/qa-from-issue): **default to parallel** (automation-friendly, no user prompt)
3. **Interactive (user invoked directly)**: Ask user:

```
Found {N} failed spec files to fix:
1. {file1} ({M1} failures)
2. {file2} ({M2} failures)
...

Choose fix strategy:
  (A) Parallel — launch all {N} fix agents simultaneously
      ✅ Fast: all files fixed concurrently
      ⚠️ Higher token cost: each agent does independent CDP exploration (~×N)
  (B) Serial — fix one file at a time, share CDP context between agents
      ✅ Lower token cost: agent 1 explores, agents 2-N reuse findings
      ⚠️ Slower: sequential execution

Which strategy? (A/B)
```

**Wait for user response before proceeding** (interactive mode only).

- If user chooses **(A) Parallel**: launch ALL fix subagents simultaneously (see Parallel mode below)
- If user chooses **(B) Serial**: launch fix subagents one by one, passing CDP context forward (see Serial mode below)

---

### Parallel mode

Group `failedTests` by file. Launch **ALL fix-single-file subagents simultaneously**:

> **IMPORTANT**: In parallel mode, `previousFixContext` is NOT available — each agent explores independently.

```
Launch ALL fix subagents in a single message (parallel):
  For each failed file, launch subagent with CDP tools + Edit tool, passing:
    - previousFixContext: {}  // empty — no cross-agent sharing in parallel mode
    - (all other inputs same as serial mode)

After ALL subagents complete:
  Collect all results into fixResults[]
```

### Serial mode

Group `failedTests` by file. Launch fix subagents **one at a time, sequentially**:

```
For each failed file (one at a time, MUST NOT launch next until current completes):

```
For each failed file:
  Launch subagent with CDP tools + Edit tool, passing:

  prompt: Read `.claude/references/fix-subagent-prompt.md` for full prompt template.

  Inputs (per reference file "Required Inputs" + "qa-fix-tests appends"):
  - specFile: {absolute path to failed spec file}
  - pomFile: {absolute path to corresponding POM, inferred from spec's import}
  - handoffFile: {absolute path to handoff JSON — from spec header `// handoff:`, fallback: infer from slug}
  - failures: [{ testName, error, screenshot }]
  - pageUrl: {URL extracted from spec's page.goto()}
  - sourceProjectDir: {SOURCE_PROJECT_DIR}
  - appLanguages: {APP_LANGUAGES from .env, if set}
  - i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
  - baselineFile: {path to page-baseline-{slug}.json if exists}
  - previousFixContext: {cdpFindings from previous fix agents — empty {} in parallel mode, accumulated in serial mode}

  Steps, classification logic, return schema, and context sharing protocol
  are all defined in `.claude/references/fix-subagent-prompt.md`.

  Collect subagent result into fixResults[]

  // ── Serial mode context accumulation (see reference file "Context Sharing" section) ──
  if subagent returned cdpFindings:
    1. Merge into shared fixContext (verifiedSelectors, domStructureNotes, sourceContext, appLanguage)
    2. Pass updated fixContext to NEXT fix subagent as previousFixContext
```

---

## Phase 2.5: Bug Summary (report only, no Linear escalation)

> **qa-fix-tests does NOT report to Linear.** Its job is fixing scripts. If bugs are found, inform the user and let them decide whether to run `/qa-run` for formal reporting.

**Handoff sync** (before bug summary): Execute `.claude/references/handoff-sync.md` procedure.
If any fix subagent returned `assertionsChanged: true`:
```
for each result in fixResults where result.assertionsChanged === true:
  1. Infer handoff path from spec header: Read spec file → extract `// handoff: ...` path
  2. Read handoff JSON
  3. For each entry in result.changedAssertions:
     - Find matching TC by tcId in handoff array
     - Update the assertion field: oldValue → newValue
  4. Write updated handoff JSON back to disk
  5. Log: "Updated handoff {path}: {N} assertions synced"
```

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
  To formally report these bugs to Linear, run /qa-run.
  ```
```

---

## Phase 3: Regression on Modified Files (via test-executor, changed mode)

After all files are fixed, run regression **only on modified files** (not the entire test suite):

```
modifiedFiles = fixResults
  .filter(r => r.status === "fixed")
  .map(r => r.file)

Launch test-executor (sonnet):
  Input:
  - mode: "changed"
  - specFiles: modifiedFiles  // only the files that were actually fixed
  - projectDir: $QA_WORKSPACE_DIR
  - appLanguages: {APP_LANGUAGES or null}
```

> **Efficiency**: If 3 files were fixed out of 50, only re-run those 3 — not all 50. Full regression across all specs is the job of `/qa-run`, not `/qa-fix-tests`.

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

> **Key principle**: Bugs in the "Application Bugs Detected" section mean the **test is correct but the app is broken**. These tests SHOULD fail. Do NOT modify them. Report them to the development team or create Linear issues via `/qa-run` to trigger report-analyzer's bug reporting flow.
