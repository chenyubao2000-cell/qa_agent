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
4. Go directly to Phase 2 with the full spec file list
4. This saves the baseline execution round (typically 1-2h) since qa-run-prd's CDP verification already confirmed locator mismatches

When `--skip-baseline` is NOT present → execute Phase 1 normally (filter + execute + collect failures).

### --upgrade-i18n Mode (Upgrade Existing Specs to Multi-Language)

**Scenario**: Initially explored and generated spec/POM in a single language (e.g., English), then later set `APP_LANGUAGES=en,zh` to support multi-language.
Existing POMs use hardcoded English (`getByRole('button', { name: 'Download file' })`), incompatible with Chinese environment.

When `--upgrade-i18n` is present in `$ARGUMENTS`:

**Precondition check**:
- `APP_LANGUAGES` must be set in .env → if not: ERROR "APP_LANGUAGES not set, nothing to upgrade"
- `$QA_WORKSPACE_DIR/messages/` must contain .json files for all languages → if not: ERROR "i18n message files missing, run Phase 0 Step 2b-1 first"
- Spec files must exist (from arguments or Glob `tests/e2e/testcases/**/*.test.ts`) → if empty: ERROR "No spec files found to upgrade"
- For each spec, infer handoff path from spec header `// handoff: ...` → if handoff file missing: WARNING "Handoff not found for {specFile}, i18n key reverse-lookup will be limited to POM text scanning"

1. **Skip Phase 1** (no test execution)
2. **Skip Phase 2** (no CDP fixes)
3. **Execute i18n upgrade flow**:

```
Determine spec file list:
- If specific files provided in `$ARGUMENTS` (after `--upgrade-i18n`): use those files only
  Example: `/qa-fix-tests --upgrade-i18n tests/e2e/testcases/generated/task-cdp.test.ts`
- If no files specified: Glob all `$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts` (upgrade entire project)

For each spec file:
  1. Read the spec's corresponding POM file (inferred from import)
  1.5. **Read source component (when sourceProjectDir available)**:
       Grep sourceProjectDir for the component rendering this spec's page.
       Extract all `t("key")` / `useTranslations("namespace")` calls → build element→i18nKey mapping.
       This is MORE accurate than reverse-lookup (Step 3) because it knows WHICH element uses WHICH key.
  2. Read i18n messages JSON from $QA_WORKSPACE_DIR/messages/{defaultLocale}.json
  3. Build flat value→key map: { "Download file": "canvas.downloadFile", ... }
     Merge with source-extracted element→key mapping from Step 1.5 (source wins on conflicts).
  4. Scan POM for all hardcoded text patterns:
     - getByRole('button', { name: 'Download file' })
     - getByText('Loading...')
     - getByLabel('Email')
     - locator('[title="Download file"]')
  5. For each hardcoded text found:
     a. Reverse-lookup in i18n flat map → find i18nKey
     b. If found → replace with i18n.t() pattern:
        BEFORE: getByRole('button', { name: 'Download file' })
        AFTER:  this.i18n
                  ? this.page.getByRole('button', { name: this.i18n.t('canvas.downloadFile') })
                  : this.page.getByRole('button', { name: /Download file/i })
     c. If NOT found → keep original (language-agnostic or regex already)

  **Locator conflict resolution**:
  - Language-agnostic locators (CSS class, `[title="..."]`, `[data-testid="..."]`) → **do not upgrade**, keep as-is
    These locators are language-independent; converting to i18n would reduce stability
  - getByRole with hardcoded English name → **upgrade** to i18n.t()
  - getByText with hardcoded text → **upgrade** to i18n.t()
  - Already has i18n.t() → **skip** (already upgraded)
  - Already has bilingual regex (/English|Chinese/i) → **upgrade** to i18n.t() (more precise)

  **Error handling**:
  - i18n message file does not exist → ERROR: "I18N_MESSAGES_DIR target {path}/{locale}.json not found, check .env configuration", abort upgrade
  - i18n JSON parse failure → ERROR: "Message file format error: {path}", abort upgrade
  - Reverse-lookup hit rate < 30% → WARNING: "Only {N}% of text locators matched an i18n key, consider checking if I18N_MESSAGES_DIR is correct", continue execution

  6. Update POM constructor: add `i18n?: I18n` parameter if not already present
  7. Update spec: add `i18n` destructuring from fixture, pass to POM constructor
  8. **Update handoff JSON** (MANDATORY, after all POM updates complete):
     Pre-check: For each spec, infer handoff path from header `// handoff: ...`.
     If handoff not found → WARNING: "Handoff missing for {spec}, skipping i18n key update"
     For each spec with valid handoff:
     a. Read handoff JSON. If parse fails → ERROR: "Handoff corrupted", skip this spec
     b. For each uiElement upgraded to i18n.t() → set uiElement.i18nKey
     c. For each assertion with i18n text match → set assertion.i18nKey
     d. Write via atomic pattern: backup → temp file → verify → rename (per `.claude/references/handoff-sync.md`)
     e. Log summary: "Updated {N} handoff files, {M} skipped"
```

4. **Update fixtures.ts**: If i18n fixture does not exist, generate per qa-explore Phase 0 Step 2e specification
5. **Update playwright.config.ts**: If multi-project is not configured, regenerate per qa-explore Phase 0 Step 2d specification
6. **Verify**: For each upgraded spec, run `--project=e2e-en` and `--project=e2e-zh` separately to verify

```
/qa-fix-tests --upgrade-i18n
  → Upgrade all spec/POM to i18n mode
/qa-fix-tests --upgrade-i18n tests/e2e/testcases/generated/canvas-preview-prd.test.ts
  → Upgrade only the specified file
```

> **Preserves existing fixes**: upgrade-i18n does not delete files, only replaces text patterns. Previously CDP-fixed locators (e.g., `button[title="Download file"]`) are unaffected (title attribute is language-agnostic). Only text-matching locators like getByText/getByRole name are upgraded.

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

  prompt (base template: `.claude/templates/fix-subagent-prompt.md`, appended with command-specific inputs):
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
  - appLanguages: {APP_LANGUAGES from .env, if set}
  - i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
    When set, the fix agent should:
    1. Detect the current page language via CDP
    2. When fixing text-based locators, prefer i18n.t('key') pattern over hardcoded text
    3. When fixing assertions, use i18n.t('key') if the expected text maps to a known i18n key
    4. Read messages JSON to understand the correct expected text for the current language
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

  0.5. **Read component source code (MANDATORY when sourceProjectDir is available)**:
       Per cdp-explorer/SKILL.md Phase 0, BEFORE any CDP interaction:
       a. From pageUrl, grep sourceProjectDir for the page component:
          Grep("{pageUrl path segment}", "$sourceProjectDir", glob: "*.tsx,*.jsx,*.vue")
       b. Read matched component file(s) (max 3: page + key child components)
       c. Extract: data-testid, aria-label, role, conditional rendering, i18n keys, semantic vs utility CSS
       d. Build sourceContext = { testIds[], ariaAttributes[], conditionalElements[], i18nKeys[], utilityClasses[] }
       e. Use sourceContext throughout Steps 1-3 to:
          - Prefer data-testid/aria-* from source over CSS locators from CDP
          - Understand conditional rendering before declaring elements "missing"
          - Distinguish Tailwind utility classes (never use as locators) from semantic identifiers
          - Know which i18n keys map to which button/text (avoid guessing from CDP text)
       f. If sourceProjectDir is not available → log WARNING, proceed with CDP-only (degraded mode)

  1. Connect to page (list_pages → select_page, or navigate if needed)
  2. Login wall detection per cdp-explorer Phase 1 Step 3
     **If login wall detected AND auth.setup.ts does NOT exist**:
     a. Use cdp-explorer three-layer scan to discover login form selectors (email, password, submit)
     b. CDP login with testCredentials from .env
     c. Generate `$QA_WORKSPACE_DIR/tests/e2e/auth.setup.ts` with verified real selectors
        (same as qa-explore Phase 1 Step 1 template — setup project pattern)
     d. Verify playwright.config.ts has setup project with `dependencies: ['setup']`
     e. Generate sign-in POM if not present
     This ensures Playwright can authenticate via setup project in subsequent test-executor runs (Phase 3).
     If auth.setup.ts already exists → skip (don't overwrite user-customized login logic).
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
     b1.5. **Cross-reference with sourceContext** (from Step 0.5):
           - Source has data-testid for this element? → use it, even if CDP found a CSS match
           - Source shows conditional rendering? → check condition; add waitFor if needed
           - CDP locator uses a Tailwind utility class? → replace with testId/aria from source
           - Source component hierarchy shows parent scope? → use for strict mode narrowing
     b2. Fix POM (Edit tool): replace/narrow locators, add new getters
     b3. Fix spec (Edit tool): add waits, fix timing issues
     b4. **Do NOT change business assertions** (what the test checks). Only change technical implementation (how it locates/waits). The handoff defines WHAT; you fix HOW.
     b5. If real page content has legitimately changed (e.g., copy update) AND handoff assertion is now wrong → this is an UPDATE scenario. Do NOT directly edit the handoff file. Instead, include `assertionsChanged: true` and `changedAssertions: [{ tcId, field, oldValue, newValue }]` in your return JSON. The **command layer** will perform the handoff file update to ensure artifact consistency.
     b6. Strictly follow POM rules: no bare locators in specs
     b7. **Test data self-sufficiency check (§0c)**: Scan the spec for hardcoded data IDs
         (e.g., `const TASK_URL = '/task/abc123'`, `process.env.XXX ?? '/task/fallbackId'`).
         Also scan for `beforeAll` that creates data → refactor to worker-scope fixture.
         If found → refactor to **worker-scope fixture** in `fixtures.ts` (`{ scope: 'worker', timeout: 360_000 }`).
         Tests receive data via fixture parameter. No `beforeAll`, no `serial` wrapper needed.
         Follow `playwright-script-generator/SKILL.md` §0c and `references/test-data-patterns.md` Pattern D.

     === Step 3c: For POSSIBLE BUG — do NOT fix ===
     c1. Using sourceContext from Step 0.5 (already built), review the component's intended rendering logic and behavior
     c2. Compare: What does the code/PRD say SHOULD happen vs. what actually happens?
     c3. If source code confirms the current behavior is WRONG → classify as BUG:
         - Do NOT modify the test assertion (the original assertion is correct)
         - Record as: { classification: "bug", testName, expectedBehavior, actualBehavior, evidence }
     c4. If source code confirms the behavior change is INTENTIONAL → reclassify as TEST ISSUE → go to Step 3b

     === Step 3d: For AMBIGUOUS — investigate deeper (max 3 retries) ===
     d1. Wait longer (increase timeout to 30s) and retry (max 3 attempts with 30s each)
     d2. If element appears → TEST ISSUE (add explicit wait)
     d3. If element never appears after retries → check source code → BUG or TEST ISSUE
     d4. If still unresolvable after source code check → classify as POSSIBLE BUG with note "ambiguous-unresolved"

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

  // ── Cross-File CDP Context Sharing (Serial mode ONLY) ──
  // After each fix subagent completes, persist its CDP findings for the next agent.
  //
  // cdpFindings return structure (subagent MUST include this in return JSON when serial mode):
  // {
  //   verifiedSelectors: { "selectorName": "verified CSS/role selector", ... },
  //   domStructureNotes: ["note about page structure", ...],
  //   appLanguage: "en" | "zh" | null,
  //   sourceContext: { testIds, ariaAttributes, conditionalElements, i18nKeys, utilityClasses }  // from Step 0.5
  // }
  //
  if subagent returned cdpFindings:
    1. Read existing page-baseline-{slug}.json (or create if absent)
    2. Merge cdpFindings into baseline.fixContext field
    3. Pass updated fixContext to the NEXT fix subagent as previousFixContext

  **Serial mode command-layer implementation:**
  ```
  fixContext = {}  // shared across all fix subagents in this session

  for each failedFile (SEQUENTIAL — MUST wait for previous to complete):
    Launch fix subagent with:
      - ...existing inputs...
      - previousFixContext: fixContext  // empty for first agent, accumulated for subsequent

    After subagent returns:
      if subagent.cdpFindings:
        fixContext.verifiedSelectors = { ...fixContext.verifiedSelectors, ...subagent.cdpFindings.verifiedSelectors }
        fixContext.domStructureNotes = [...new Set([...(fixContext.domStructureNotes || []), ...(subagent.cdpFindings.domStructureNotes || [])])]
        // Share sourceContext so subsequent agents skip redundant source reading for the same page
        if (subagent.cdpFindings.sourceContext):
          fixContext.sourceContext = { ...fixContext.sourceContext, ...subagent.cdpFindings.sourceContext }
        fixContext.appLanguage = subagent.cdpFindings.appLanguage || fixContext.appLanguage

      Collect subagent result into fixResults[]
  ```

  Serial savings: Agent 1 explores fully (~20 min), agents 2-N reuse findings (~2 min each).
```

---

## Phase 2.5: Bug Summary (report only, no Linear escalation)

> **qa-fix-tests does NOT report to Linear.** Its job is fixing scripts. If bugs are found, inform the user and let them decide whether to run `/qa-run-all` for formal reporting.

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
  - appLanguages: {APP_LANGUAGES or null}
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
