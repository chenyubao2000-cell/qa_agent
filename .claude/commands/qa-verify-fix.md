---
description: Verify whether a Linear bug issue has been fixed by generating fix-verification E2E tests (assertions target expectedBehavior, not current state)
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__linear__get_issue, mcp__linear__search_issues, mcp__linear__update_issue, mcp__linear__create_comment, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

You are a fix-verification executor. Given a Linear bug issue, generate E2E tests that **assert the expected (correct) behavior**, then run them to determine whether the bug has been fixed.

**Core difference from `/qa-from-issue`**: qa-from-issue generates tests adapted to the current page state (tests pass even when bug exists). This command generates tests that **fail when the bug is present** and **pass only when the bug is fixed**.

```
/qa-verify-fix <issue-key|url|keyword> [--source <source-code-dir>]

Examples:
/qa-verify-fix MIRA-1249
/qa-verify-fix https://linear.app/team/issue/MIRA-1249/title
/qa-verify-fix MIRA-1249 MIRA-1250          # batch
/qa-verify-fix MIRA-1249 --source D:\code\my-project
```

## Pipeline Overview

```
/qa-verify-fix MIRA-1249
     |
Phase 0: Load project context (.env → config)
     |
Phase 1: Read Issue → Extract expectedBehavior + actualBehavior
     |
Phase 2: CDP lightweight exploration → Locator discovery only (no full baseline)
     |
Phase 3: Generate verify-fix spec:
         - Assertions = expectedBehavior (correct behavior, NOT current bug state)
         - Tests designed to FAIL when bug exists, PASS when fixed
     |
Phase 4: Execute tests → Collect results
     |
Phase 5: Report to Linear:
         - All pass → "Fix verified ✅" + close issue
         - Any fail → "Fix NOT verified ❌, bug still present"
```

---

## Phase 0: Load Context + Initialize Workspace

### Step 1 — Read .env + Build projectContext

```
Read(".env")
Read("$SOURCE_PROJECT_DIR/CLAUDE.md")  # tech stack
```

Extract: `QA_WORKSPACE_DIR`, `PREVIEW_URL`, `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`, `APP_LANGUAGES`, `I18N_MESSAGES_DIR`, `LINEAR_*`.

### Step 2 — Initialize Workspace

Execute `.claude/references/phase-0-workspace-init.md` Steps 2a–2f (skip-if-exists).

### Step 3 — Source Code Directory

Priority: `--source` in args > `SOURCE_PROJECT_DIR` in .env > `QA_WORKSPACE_DIR`

---

## Phase 1: Read Issue + Extract Verification Context

### Step 1 — Get Issue Details

Same parsing logic as `/qa-from-issue` Phase 1 Step 1:
- Linear URL → extract key → `mcp__linear__get_issue`
- Issue key / UUID → `mcp__linear__get_issue`
- Keyword → `mcp__linear__search_issues` → select best match

### Step 2 — Extract Verification Context

Extract from issue title + description:

| Field | Source | Purpose |
|-------|--------|---------|
| `pageUrl` | URL in description | Navigation target |
| `expectedBehavior` | "Expected result" or inferred correct behavior | **Assertion target** (what to verify) |
| `actualBehavior` | "Actual result" or bug description | **What the bug looks like** (for logging, not assertions) |
| `reproSteps` | "Reproduction steps" | Test steps sequence |
| `priority` | Issue priority | P0-P3 mapping |
| `feature` | Module name from title | Slug for file naming |

**Critical rule**: If the issue doesn't clearly describe `expectedBehavior` (what SHOULD happen), ask the user before proceeding. Without a clear expected behavior, we can't write meaningful fix-verification assertions.

### Step 3 — Check for Existing Spec

```
Search for existing spec from prior /qa-from-issue run:
  Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/*{feature}*issue*.test.ts")
  OR Grep(issueKey, "$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/")

If existing spec found:
  → Mode R (Re-verify): Rewrite assertions in existing spec to target expectedBehavior
  → Skip Phase 3 generation, go to Phase 3-R (rewrite existing)

If no existing spec:
  → Mode N (New): Generate new verify-fix spec from scratch
  → Continue to Phase 2 + Phase 3
```

---

## Phase 2: CDP Lightweight Exploration

> **Purpose**: Discover locators and page structure only. NOT to build a full state-flow baseline.
> This is lighter than qa-from-issue Phase 2 — we only need enough info to write correct locators.

Launch a **cdp-explorer subagent**:

```
prompt:
You are a CDP page explorer. First read skills/cdp-explorer/SKILL.md.

Task: Lightweight exploration for locator discovery.

Input:
- mode: "targeted"
- pageUrl: {issueContext.pageUrl}
- targetArea: {derived from feature / reproSteps}
- reproSteps: {from issue}
- authSetup: {true/false}
- testCredentials: {if authSetup}
- appLanguages: {APP_LANGUAGES or null}
- i18nMessagesDir: {if APP_LANGUAGES set}
- sourceProjectDir: {resolved source directory}
- previousSourceContext: {}

IMPORTANT: This exploration is for LOCATOR DISCOVERY only.
- Perform Phase 2 (initial scan) normally
- In Phase 3, follow reproSteps to discover the elements involved
- You do NOT need to build a full state-flow graph
- Focus on: finding stable locators for elements mentioned in reproSteps + expectedBehavior
- Write a minimal baseline with locators found

Return summary with baselineFile path and locators discovered.
```

### Mode R (Re-verify with existing spec): Skip Phase 2

When an existing spec was found in Phase 1 Step 3, locators are already in the POM.
CDP exploration is **optional** — only run if:
- The existing spec's last run had locator-related failures (timeout, element not found)
- User explicitly requests `--force-cdp`

Otherwise skip directly to Phase 3-R.

---

## Phase 3: Generate Verify-Fix Spec

### Key Difference: Assertion Strategy

| | qa-from-issue | qa-verify-fix |
|---|---|---|
| **Assertion target** | Current page state (adapts to bug) | expectedBehavior (correct behavior) |
| **Test passes when** | Page matches current state (bug or not) | Bug is fixed |
| **Test fails when** | Page doesn't match current state | Bug still exists |

### Mode N — New Spec Generation

Launch **e2e-orchestrator** (sonnet) with verify-fix instructions:

```
prompt:
You are e2e-orchestrator. First read .claude/agents/e2e-orchestrator.md.

Input:
- source: "issue"
- issueKey: {issueKey}
- issueContext: { pageUrl, expectedBehavior, actualBehavior, reproSteps, priority, feature }
- baselineFile: {from Phase 2}
- projectContext: { targetProjectDir, sourceProjectDir, baseURL, ... }
- verifyFix: true   ← THIS IS THE KEY FLAG

VERIFY-FIX MODE INSTRUCTIONS (override normal assertion strategy):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **Assertion target = expectedBehavior, NOT current page state.**
   - Normal mode: if CDP shows 4 grid columns → assert columnCount >= 1 (passes with bug)
   - Verify-fix: if expectedBehavior says "single card should fill width" → assert columnCount === 1 (fails with bug)

2. **Test case generation is FOCUSED, not exhaustive.**
   - Do NOT apply all 6 design methods
   - Generate ONLY the cases needed to verify the specific bug fix:
     a. Primary: reproduce the bug scenario, assert expectedBehavior (P0)
     b. Boundary: test at critical breakpoints/thresholds mentioned in the issue (P1)
     c. Regression: verify the fix doesn't break the non-bug case (P1)
   - Target: 3-8 test cases total (not 13+)

3. **Assertion style: strict, not lenient.**
   - Use exact value assertions: `expect(x).toBe(1)`, NOT `expect(x).toBeGreaterThanOrEqual(1)`
   - If expectedBehavior is ambiguous, prefer the stricter interpretation
   - Each test should have a clear PASS = fixed / FAIL = not fixed semantic

4. **Bug evidence logging**: Each test should `console.log` the actual vs expected values,
   so the report clearly shows WHY the fix verification failed.

5. **Test naming**: Prefix with `[VERIFY-FIX]` for clear identification:
   `test('[VERIFY-FIX] TC-VF-TL-001 单人才最大化面板应显示单列', ...)`

6. **Spec header**: Add `// mode: verify-fix` in the spec header metadata.

Return artifact paths (same schema as normal orchestrator return).
```

### Mode R — Rewrite Existing Spec Assertions

When an existing spec was found (from prior `/qa-from-issue` run):

```
1. Read the existing spec file
2. Read the corresponding POM file
3. Identify assertions that "adapt to the bug" (lenient assertions like >= 1)
4. Rewrite them to assert expectedBehavior (strict assertions like === 1)
5. Add [VERIFY-FIX] prefix to test names
6. Add // mode: verify-fix to spec header
7. Write the modified spec to a NEW file: {slug}-verify-fix.test.ts
   (preserve the original issue spec untouched)
```

This mode is handled directly by the command layer (no orchestrator needed):
- Read spec + POM → identify lenient assertions → rewrite → save as new file

---

## Phase 4: Execute Tests

Launch **test-executor** (haiku):

```
prompt:
You are test-executor. First read .claude/agents/test-executor.md.

Input:
- mode: "selective"
- specFiles: ["{verify-fix spec path}"]
- projectDir: "$QA_WORKSPACE_DIR"
- appLanguages: {APP_LANGUAGES or null}

Run ONLY the verify-fix spec. Do not run smoke or regression suites.
Output report to: tests/reports/verify-fix-results.json
```

---

## Phase 5: Interpret Results + Report to Linear

### Step 1 — Parse Results

Read `tests/reports/verify-fix-results.json`:
- Count passed / failed / skipped
- Extract failure details (if any)

### Step 2 — Determine Verdict

```
if all [VERIFY-FIX] tests passed:
  verdict = "FIXED"
elif some passed, some failed:
  verdict = "PARTIALLY_FIXED"
  failedTests = [list of still-failing test names + error messages]
else:
  verdict = "NOT_FIXED"
  failedTests = [all test names + error messages]
```

### Step 3 — Report to Linear

**When FIXED** (all tests pass):

```
mcp__linear__create_comment(issueId, body):
```
```markdown
## ✅ Bug 修复已验证 — {timestamp}

自动化 E2E 测试确认此 bug 已修复。

| 项目 | 值 |
|------|-----|
| 验证用例数 | {total} |
| 全部通过 | ✅ {passed}/{total} |
| Spec 文件 | `{spec file path}` |
| 执行耗时 | {duration}s |
| 验证环境 | {PREVIEW_URL} |

所有验证用例均通过，bug 行为已消除，期望行为已确认。
```

Then update issue status:
```
mcp__linear__update_issue(issueId, stateId: "Done")
```

**When NOT_FIXED or PARTIALLY_FIXED** (any test fails):

```
mcp__linear__create_comment(issueId, body):
```
```markdown
## ❌ Bug 修复未通过验证 — {timestamp}

自动化 E2E 测试显示此 bug **仍然存在**。

| 项目 | 值 |
|------|-----|
| 验证用例数 | {total} |
| 通过 | {passed}/{total} |
| 失败 | {failed}/{total} |
| 验证环境 | {PREVIEW_URL} |

### 仍然失败的用例

| # | 用例 | 期望行为 | 实际结果 |
|---|------|----------|----------|
{for each failed test:}
| {n} | {test name} | {expectedBehavior from assertion} | {actual error message} |

### 下一步

Bug 行为仍可复现，请继续修复后重新运行 `/qa-verify-fix {issueKey}` 验证。
```

Do NOT update issue status (leave it as-is).

### Step 4 — Generate Summary

Write to `$QA_WORKSPACE_DIR/tests/reports/combined/verify-fix-summary.md`:

```markdown
# Bug 修复验证报告

Issue: {issueKey} — {issue title}
验证时间: {timestamp}
结论: {FIXED | NOT_FIXED | PARTIALLY_FIXED}

## 验证结果

| # | 用例 | 结果 | 说明 |
|---|------|------|------|
| 1 | [VERIFY-FIX] TC-VF-xxx | ✅/❌ | {pass: 期望行为已确认 / fail: 错误信息} |

## Issue 详情

- 期望行为: {expectedBehavior}
- Bug 行为: {actualBehavior}
- 复现步骤: {reproSteps}
```

---

## Batch Processing

When multiple issues are provided:

```
/qa-verify-fix MIRA-1249 MIRA-1250

For each issue (sequential):
  Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
  (each issue gets its own verify-fix spec and Linear comment)
```

CDP exploration is serial (one browser). Test execution can be batched (all verify-fix specs run together).

---

## Artifacts

| File | Description |
|------|-------------|
| `tests/e2e/testcases/generated/{slug}-verify-fix.test.ts` | Verify-fix spec (strict assertions targeting expectedBehavior) |
| `tests/e2e/pages/{slug}.page.ts` | POM (reused from prior run or newly generated) |
| `test-cases/generated/page-baseline-{slug}.json` | Lightweight CDP baseline (locators only) |
| `tests/reports/verify-fix-results.json` | Test execution report |
| `tests/reports/combined/verify-fix-summary.md` | Human-readable summary |
| Linear issue comment | Fix verified / not verified |
