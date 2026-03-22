---
description: PRD-driven E2E test pipeline
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__take_snapshot
---

You are an E2E test pipeline orchestrator.

```
/qa-run-prd [prd-path] [--source <source-code-dir>]
     |
Phase 0: Load project context (.env -> target project config)
     |
Phase 1: Read PRD (command layer exclusive)
     |
Phase 2: Sequential agent launch
         e2e-orchestrator (prd) -> cases -> Excel -> spec
              | after completion
         test-executor -> receive spec -> execute tests -> produce reports
              | after completion
         report-analyzer -> analyze -> bug-reporter -> Linear
```

## Phase 0: Load Context + Initialize Workspace (mandatory, execute first)

Source code directory priority: `--source` in `$ARGUMENTS` > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`
- **Read source code** -> read from source directory
- **Write files** (spec/POM/cases/reports) -> always write to QA_WORKSPACE_DIR

Read `.env` to get `QA_WORKSPACE_DIR`, `SOURCE_PROJECT_DIR`, `PREVIEW_URL`, `PLAYWRIGHT_BASE_URL`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`.
Read `$SOURCE_PROJECT_DIR/CLAUDE.md` to get tech stack (only for understanding business logic).

**Initialize workspace** (empty folder compatible, skip all if already initialized):
Same as `/qa-explore` Phase 0 Step 2: directories, npm install, playwright.config.ts, fixtures.ts.

> The PRD flow itself doesn't use CDP, but the Locator verification phase needs CDP to navigate to the page and verify selectors.
> If a login wall is encountered, handle the same as `/qa-explore` Phase 1 Step 1: explore login form -> generate global-setup.ts.

## Phase 1: Read PRD + Change Detection

Read PRD ($ARGUMENTS or default $SOURCE_PROJECT_DIR/docs/prd/).

### PRD Module Splitting Strategy

When PRD contains multiple feature modules, split by module before passing to orchestrator:
- Parse `##` level headings in the PRD, each heading is treated as a feature module
- Each module produces specs independently; failure in one module doesn't affect others

### PRD Change Detection (critical for incremental updates)

> **Problem**: If PRD v2 updates the "User Login" module but orchestrator sees existing login.test.ts and skips it, updated requirements are never reflected in tests.
>
> **Solution**: Before launching orchestrators, detect which PRD modules have changed since last generation.

```
1. Read existing test case .md files: Glob("$QA_WORKSPACE_DIR/test-cases/generated/*-prd.md")
2. For each existing .md, extract the PRD content hash stored in its header comment:
   // PRD-hash: {sha256 of the PRD module text at generation time}
3. For each current PRD module, compute its content hash
4. Compare:

   | Current PRD module | Existing .md | Hash match | Action |
   |--------------------|-------------|:----------:|--------|
   | Module A (login)   | login-prd.md | Match      | unchanged → pass prdChangeMode: "none" |
   | Module B (tasks)   | tasks-prd.md | Mismatch   | updated → pass prdChangeMode: "updated" |
   | Module C (reports) | (none)       | —          | new → pass prdChangeMode: "new" |
   | (deleted)          | chat-prd.md  | —          | removed → pass prdChangeMode: "removed" |

5. Pass prdChangeMode per module to the orchestrator
```

Each orchestrator receives `prdChangeMode` telling it how to handle existing tests:
- `"none"` → skip generation (existing tests are up-to-date)
- `"new"` → generate from scratch (no existing tests)
- `"updated"` → **incremental update** (see orchestrator Step 2.5 below)
- `"removed"` → mark existing tests as skipped/deprecated

> **Hash storage**: When test-case-generator produces a .md file from PRD, it must include a header comment:
> ```
> <!-- PRD-hash: {sha256(module text)} -->
> ```
> This enables future change detection without re-reading the full PRD.

## Phase 2: Pipeline with Parallel Generation

**Key constraint**: When launching agents, the prompt only passes **input data** (PRD content, source, projectContext),
**do not** include specific code conventions, locator strategies, or file templates in the prompt.
Agents must read the `agents/e2e-orchestrator.md` -> `skills/*/SKILL.md` chain to get specifications themselves.

### Step 1 — Parallel test generation (one orchestrator per module, all at once)

> PRD modules are independent — each can be generated in parallel. No CDP needed at this stage.

```
orchestratorAgents = []
removedModules = []

for module in prdModules:
  if module.prdChangeMode == "none":
    // PRD unchanged for this module → skip entirely, existing tests are up-to-date
    continue

  if module.prdChangeMode == "removed":
    // PRD no longer contains this module → mark existing specs as deprecated
    removedModules.push(module)
    continue

  // "new" or "updated" → launch orchestrator
  orchestratorAgents.push(
    Launch e2e-orchestrator (sonnet) in background:

    prompt:
    ```
    You are e2e-orchestrator. First read agents/e2e-orchestrator.md.

    Input:
    - source: "prd"
    - prdFiles: [PRD file path]
    - prdModuleScope: "{module heading}"
    - prdChangeMode: "{module.prdChangeMode}"  // "new" or "updated"
    - projectContext: { targetProjectDir, baseURL, existingTests, ... }

    Execute per agents/e2e-orchestrator.md steps, return artifact paths.
    Note: prdChangeMode affects Step 2 dedup behavior — see Step 2.5 for "updated" mode.
    ```
  )

// Handle removed modules: add test.describe.skip wrapper to existing specs
for module in removedModules:
  // Reliable module → spec mapping via feature-slug stored in .md header
  // Each generated .md file contains: <!-- PRD-module: {module heading} | feature-slug: {slug} -->
  // The feature-slug is the same slug used for spec filenames: {slug}-prd.test.ts
  1. Read the existing .md file for this module (from Phase 1 change detection, already identified)
  2. Extract feature-slug from .md header: <!-- PRD-module: ... | feature-slug: {slug} -->
  3. Find spec file: Glob("tests/e2e/testcases/generated/{slug}*.test.ts")
  4. Find POM file: Glob("tests/e2e/pages/{slug}*.page.ts")
  5. If spec found:
     Wrap entire test.describe with test.describe.skip (preserve code, mark as deprecated)
     Add comment: // DEPRECATED: PRD module "{module heading}" removed in latest version
     Record in deprecatedSpecs[]
  6. If spec NOT found → log warning, skip (module may never have generated a spec)
  7. Mark the .md file with deprecation header: <!-- DEPRECATED: module removed from PRD -->

// Wait for ALL orchestrators to complete (parallel)
results = await all(orchestratorAgents)

allSpecs = results.flatMap(r => r.specs + r.modified_specs)
allPageObjects = results.flatMap(r => r.page_objects)

// Export Excel: merge all .md into one file (one Sheet per module)
node skills/excel-case-export/scripts/generate-excel.js \
  --input-dir $QA_WORKSPACE_DIR/test-cases/generated \
  --output $QA_WORKSPACE_DIR/test-cases/excel/{prd-name}-all-cases.xlsx
```

**Check results**:
- If allSpecs is empty AND removedModules is empty -> inform user "all test cases already have spec coverage, PRD unchanged" -> end
- If allSpecs is empty AND removedModules is not empty -> inform user "N modules deprecated, no new/updated modules" -> still run test-executor to verify remaining tests pass
- Otherwise -> continue to Step 2

**CDP Page Exploration + Locator Verification** (after orchestrator completes):

> PRD generates specs from text requirements — the orchestrator has never seen the real page. Before executing tests, we must:
> 1. Explore the real page to validate that the PRD's assumptions match reality
> 2. Verify and fix all locators against the live DOM
>
> Both steps run in an isolated subagent per page to avoid context accumulation.

For each unique page referenced by orchestrator's returned `page_objects`:

Launch a **prd-page-verify subagent** with CDP tools + Edit tool:

```
prompt:
```
You are a page explorer and locator verifier. Read skills/cdp-explorer/SKILL.md.

Task: Explore a real page and verify/fix all locators from a POM file generated from PRD.

Input:
- pageUrl: {projectContext.baseURL + page path inferred from POM's goto() method}
- pomFile: {absolute path to the POM file}
- specFiles: [{list of spec files that use this POM}]
- authSetup: {true/false}
- testCredentials: {if authSetup=true}

Steps:
1. Navigate to pageUrl (mcp__chrome-devtools__navigate_page)
2. Login wall detection → handle if needed (fill credentials, generate global-setup.ts if not present)
3. Three-layer scan (DOM → accessibility tree → screenshot) to understand the real page structure
4. For each locator in the POM file:
   a. CDP verify: evaluate selector on live page → count matches
   b. UNIQUE (1 match) → pass
   c. ZERO (0 matches) → use the DOM scan results to find the correct selector → Edit POM file
   d. MULTIPLE (N matches) → use DOM scan to find narrowing parent → Edit POM file
   e. Max 3 fix attempts per locator
5. Check if any spec assertions reference content that doesn't exist on the real page:
   - Text assertions → evaluate_script to confirm real text
   - URL assertions → confirm actual routing
   - Fix spec files if assertions are wrong
6. Record page exploration findings (structure, actual content, discrepancies from PRD assumptions)

Return:
{
  "pageUrl": "...",
  "locatorsVerified": N,
  "locatorsFixed": N,
  "locatorsFailed": N,
  "assertionsFixed": N,
  "discrepancies": ["PRD says X but page shows Y", ...]
}
```
```

When multiple POMs correspond to different pages, launch one subagent per page (serially, to avoid CDP conflicts).

After all pages verified → continue launching test-executor

**Agent 2 — test-executor** (haiku):
- Launched after e2e-orchestrator + Locator verification complete
- Receives merged spec file list: `orchestrator.specs + orchestrator.modified_specs` -> execute tests -> produce reports

**Agent 3 — report-analyzer** (haiku):
- Launched after test-executor completes
- Analyze report -> bug-reporter -> Linear reporting -> summary report -> open HTML report
