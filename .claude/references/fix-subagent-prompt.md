# Fix Subagent Prompt Template

> **Used by**: `/qa-fix-tests` Phase 2, `/qa-from-issue` Mode X
> Canonical fix subagent specification. Command files reference this instead of inlining the full prompt.
> Command-specific inputs and context-sharing logic are appended by the caller.

## Core Prompt

```
You are a test fix expert. Read skills/cdp-explorer/SKILL.md and skills/playwright-script-generator/SKILL.md.

Task: Fix one failed test file by exploring the real page via CDP.

CRITICAL PRINCIPLE: Not all failures should be "fixed". A test failure may indicate:
(A) Test issue — locator stale, timing, selector ambiguity → FIX the test
(B) Application bug — feature genuinely broken, real regression → DO NOT fix, REPORT as bug

You MUST classify each failure before deciding to fix or report.
```

## Required Inputs

All callers MUST provide these inputs:

```
- specFile: {absolute path to failed spec file}
- pomFile: {absolute path to corresponding POM, inferred from spec's import}
- handoffFile: {absolute path to corresponding handoff JSON — read from spec file header comment `// handoff: ...`, fallback: infer from spec filename → test-cases/generated/playwright-handoff-{slug}.json}
- pageUrl: {URL extracted from spec's page.goto() or issueContext.pageUrl, concatenated with baseURL if relative}
- sourceProjectDir: {SOURCE_PROJECT_DIR}  // for understanding business logic
- appLanguages: {APP_LANGUAGES from .env, if set}
- i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
  When set, the fix agent should:
  1. Detect the current page language via CDP
  2. When fixing text-based locators, prefer i18n.t('key') pattern over hardcoded text
  3. When fixing assertions, use i18n.t('key') if the expected text maps to a known i18n key
  4. Read messages JSON to understand the correct expected text for the current language
```

## Optional Inputs (command-specific)

### qa-fix-tests appends:

```
- failures: [{ testName, error, screenshot }]  // failed cases in this file
- baselineFile: {path to page-baseline-{slug}.json if it exists — may contain cdpFindings from qa-run-prd's page verify step or previous fix agents}
- previousFixContext: {cdpFindings from previous fix agents in this session, if any — includes verified locators, DOM structure, page notes}
  When present, SKIP redundant CDP exploration for pages already documented.
  Only perform new CDP exploration for elements NOT in the existing findings.
```

### qa-from-issue Mode X appends:

```
- issueContext: { pageUrl, expectedBehavior, actualBehavior, reproSteps, priority, feature }
- authSetup: {true/false}
- testCredentials: {if authSetup=true}
```

## Steps

```
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
      **Notes**: Use `click({ timeout: 30_000 })` instead of manual `toBeEnabled()` + `click()` — Playwright's click auto-waits for enabled (actionability checks), more resilient to slow hydration. `waitForURL` timeout ≥ 60s (network may be slow)
   d. Verify playwright.config.ts has setup project with `dependencies: ['setup']`
   e. Generate sign-in POM if not present
   This ensures Playwright can authenticate via setup project in subsequent test-executor runs.
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
       Fixtures that submit AI tasks MUST use `waitWithBlockerDismissal()` from `ai-wait.md` Strategy F.

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
```

## Return Schema

### qa-fix-tests return format:

```json
{
  "file": "{specFile}",
  "status": "fixed" | "needs_manual" | "has_bugs",
  "fixedCount": "N",
  "bugCount": "N",
  "needsManualCount": "N",
  "assertionsChanged": "true|false",
  "changedAssertions": [{ "tcId": "TC-XXX-001", "field": "expectedText", "oldValue": "...", "newValue": "..." }],
  "cdpFindings": { "staleLocators": ["..."], "newElements": ["..."] },
  "fixes": [
    { "testName": "...", "classification": "test_issue", "error": "...", "action": "replaced locator", "result": "fixed" },
    { "testName": "...", "classification": "bug", "error": "...", "expectedBehavior": "button enabled", "actualBehavior": "button disabled", "evidence": "src/Button.tsx removed onClick handler", "result": "bug_reported" },
    { "testName": "...", "classification": "test_issue", "error": "...", "action": "...", "result": "needs_manual" }
  ]
}
```

### qa-from-issue Mode X return format:

```json
{
  "specFile": "{path}",
  "status": "fixed" | "needs_manual" | "has_bugs",
  "locatorsFixed": "N",
  "assertionsFixed": "N",
  "assertionsChanged": "true|false",
  "changedAssertions": [{ "tcId": "TC-XXX-001", "field": "expectedText", "oldValue": "...", "newValue": "..." }],
  "bugs": [{ "testName": "...", "expectedBehavior": "...", "actualBehavior": "...", "evidence": "..." }],
  "behaviorMatch": { "expected": "...", "actual": "...", "matches": "true|false" }
}
```

## Context Sharing (Serial mode, qa-fix-tests only)

When qa-fix-tests runs in serial mode, CDP findings are shared between fix subagents:

```
cdpFindings return structure (subagent MUST include this in return JSON when serial mode):
{
  verifiedSelectors: { "selectorName": "verified CSS/role selector", ... },
  domStructureNotes: ["note about page structure", ...],
  appLanguage: "en" | "zh" | null,
  sourceContext: { testIds, ariaAttributes, conditionalElements, i18nKeys, utilityClasses }  // from Step 0.5
}

Serial mode command-layer implementation:
  fixContext = {}  // shared across all fix subagents in this session

  for each failedFile (SEQUENTIAL — MUST wait for previous to complete):
    Launch fix subagent with:
      - ...existing inputs...
      - previousFixContext: fixContext  // empty for first agent, accumulated for subsequent

    After subagent returns:
      if subagent.cdpFindings:
        fixContext.verifiedSelectors = { ...fixContext.verifiedSelectors, ...subagent.cdpFindings.verifiedSelectors }
        fixContext.domStructureNotes = [...new Set([...(fixContext.domStructureNotes || []), ...(subagent.cdpFindings.domStructureNotes || [])])]
        if (subagent.cdpFindings.sourceContext):
          fixContext.sourceContext = { ...fixContext.sourceContext, ...subagent.cdpFindings.sourceContext }
        fixContext.appLanguage = subagent.cdpFindings.appLanguage || fixContext.appLanguage

      Collect subagent result into fixResults[]

  Serial savings: Agent 1 explores fully (~20 min), agents 2-N reuse findings (~2 min each).
```

> Subagent performs all CDP interactions internally (~50-100K tokens).
> Only the summary (~200 tokens) enters the main command context.
> Spec/POM edits are written to disk by the subagent — persisted regardless of context.
