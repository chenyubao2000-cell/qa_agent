---
description: PRD-driven E2E test pipeline
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
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
         /qa-fix-tests -> CDP explore -> fix locators/assertions -> verify
```

## Phase 0: Load Context + Initialize Workspace (mandatory, execute first)

Source code directory priority: `--source` in `$ARGUMENTS` > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`
- **Read source code** -> read from source directory
- **Write files** (spec/POM/cases/reports) -> always write to QA_WORKSPACE_DIR

Read `.env` to get `QA_WORKSPACE_DIR`, `SOURCE_PROJECT_DIR`, `PREVIEW_URL`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`. `PREVIEW_URL` is the single source of truth for baseURL.
Read `$SOURCE_PROJECT_DIR/CLAUDE.md` to get tech stack (only for understanding business logic).

**Initialize workspace** (empty folder compatible, skip all if already initialized):
Same as `/qa-explore` Phase 0 Step 2: directories, npm install, playwright.config.ts, fixtures.ts.

> qa-run-prd itself does not use CDP. All CDP work (locator verification, login wall handling, page exploration)
> is uniformly handled by downstream `/qa-fix-tests`. This avoids redundant CDP exploration (qa-run-prd exploring once + fix-tests exploring again).

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
    - projectContext:
        targetProjectDir: {QA_WORKSPACE_DIR}
        baseURL: {PREVIEW_URL}
        existingTests: tests/e2e/testcases/
        techStack: {from CLAUDE.md}
        appLanguages: {APP_LANGUAGES or null}
        i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}

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

// Export Excel: merge all .md into one file (one Sheet per module)
// Only executes AFTER verification gate passes
node skills/excel-case-export/scripts/generate-excel.js \
  --input-dir $QA_WORKSPACE_DIR/test-cases/generated \
  --output $QA_WORKSPACE_DIR/test-cases/excel/{prd-name}-all-cases.xlsx

// Verify Excel output exists
if NOT Glob("$QA_WORKSPACE_DIR/test-cases/excel/{prd-name}-all-cases.xlsx"):
  ERROR: "Excel export failed — file not written"
```

**Check results**:
- If allSpecs is empty AND removedModules is empty -> inform user "all test cases already have spec coverage, PRD unchanged" -> end
- If allSpecs is empty AND removedModules is not empty -> inform user "N modules deprecated, no new/updated modules" -> still run test-executor to verify remaining tests pass
- Otherwise -> continue to Step 2

### Step 2 — Fix tests via /qa-fix-tests

> PRD-generated specs have never seen the real page — locators are almost always wrong.
> **All CDP work (page exploration, locator verification, login wall handling, assertion fixing) is uniformly handled by qa-fix-tests.**
> qa-run-prd does not perform any CDP operations. Clear separation of concerns: generate → hand off to fix.
>
> Why not do CDP verification in qa-run-prd?
> 1. qa-fix-tests performs the full CDP exploration + fix + verification cycle, a superset of page-verify
> 2. Removing page-verify saves ~20 minutes of redundant CDP exploration
> 3. qa-fix-tests' cross-file CDP sharing mechanism (fixContext) is more efficient than standalone page-verify

```
allGeneratedSpecs = results.flatMap(r => r.specs + r.modified_specs)

// Launch /qa-fix-tests targeting only the newly generated specs
// This will: execute → identify failures → CDP explore → fix locators/assertions → verify
Execute /qa-fix-tests with arguments: --from-prd {allGeneratedSpecs joined by space}
// Example:
// Execute /qa-fix-tests with arguments: --from-prd tests/e2e/testcases/generated/login-prd.test.ts tests/e2e/testcases/generated/tasks-prd.test.ts
// qa-fix-tests parsing rules: --from-prd flag skips baseline, .test.ts paths serve as the list of files to fix
```

> After qa-fix-tests completes, the user can run `/qa-run-all` for full regression + Linear reporting if needed.
