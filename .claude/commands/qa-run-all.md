---
description: Run existing E2E tests, aggregate reports, report to Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

You are a test executor. Do not generate cases, export Excel, or generate specs — only execute existing tests and report.

```
/qa-run-all [spec-file-path] [--suite smoke|regression|full] [--source <source-code-dir>]
     |
Phase 0: Load project context (.env -> target project config)
     |
Phase 1: Sequential launch (execute in order)
         test-executor -> execute existing specs -> produce reports
              | after completion
         report-analyzer -> analyze reports -> bug-reporter -> Linear
```

## Phase 0: Load Project Context

```
Read(".env")
```

Only need to extract:
- `QA_WORKSPACE_DIR` — read specs, write reports
- `LINEAR_*` — pass through to report-analyzer (bug reporting)
- `APP_LANGUAGES` — if set, Playwright config has per-language projects (e.g., `e2e-en`, `e2e-zh`). test-executor must handle project selection.

Not needed: SOURCE_PROJECT_DIR (no source reading), PLAYWRIGHT_BASE_URL (already in config), E2E_TEST_EMAIL (already in global-setup).
No initialization — only runs existing specs; workspace must have been initialized by `/qa-explore` or similar commands.

### Source Code Directory (optional, injected by git-watcher)

Source code directory priority: `--source` in `$ARGUMENTS` > `prSourceDir` in prompt > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`
- **Write files** (reports) -> always write to QA_WORKSPACE_DIR

## Phase 1: Sequential Launch (execute in order)

### Pre-check

Before launching test-executor, check for executable specs:

```
Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts")
```

- If result is empty -> inform user "No spec files in target project, please run /qa-explore or /qa-run-prd to generate tests first"
- Otherwise -> launch test-executor

### Change Context (optional, injected by git-watcher)

If the prompt contains the following sections, extract and utilize them:

**Changed file list (changelist)**: Prioritize executing specs for modules involved in the changelist, rather than running all:
```
changelist contains src/components/Chat.tsx
  -> find specs in tests/e2e/testcases/ that import ChatPage or have filenames containing chat
  -> prioritize executing these specs, still run all for the rest
```

**Code change summary (changeSummary)**: AI-generated structured change summary, passed to report-analyzer to determine if failures are directly related to this change.

**PR source directory (prSourceDir)**: Full PR code copy created by git-watcher via worktree. Read source from this directory; write files still to the original QA_WORKSPACE_DIR.

**Related Linear Issues**: If the prompt contains `Related Linear Issues (for failure attribution): STE-123, STE-456`, extract the issue key list and pass to report-analyzer as `relatedIssueKeys`. report-analyzer uses this to associate failed cases with PR-related issues, annotating the relationship in summary reports and Linear comments.

```
Identification format:
Related Linear Issues (for failure attribution): STE-123, STE-456
PR source directory (prSourceDir): D:\code\.qa-worktree-pr
```

**Parse suite parameter from $ARGUMENTS** (supports both flags and natural language):

Formal flags:
- `--suite smoke` → suite = "smoke"
- `--suite regression` → suite = "regression"
- `--suite full` or no --suite → suite = "full"

Natural language (Chinese/English):
- Contains "smoke" / "冒烟" / "P0" / "只跑smoke" → suite = "smoke"
- Contains "regression" / "回归" / "P0+P1" → suite = "regression"
- Contains "full" / "全量" / "所有" → suite = "full"

Suite to Playwright --grep mapping:
- smoke → `--grep @smoke`
- regression → `--grep "@smoke|@regression"`
- full → no --grep (run all)

### Headless Mode Detection

If the prompt contains `_trigger: git-watcher_`, set `headless: true` for report-analyzer (skip opening browser).

### Agent 1 — test-executor (haiku)

Launch test-executor agent:

```
You are test-executor. First read agents/test-executor.md to understand your full responsibilities.

Input:
- mode: "full"
- suite: "{parsed suite parameter, default full}"
- specFiles: [{if $ARGUMENTS specifies file paths, list them; otherwise omit to run all}]
- projectDir: "$QA_WORKSPACE_DIR"
- appLanguages: {APP_LANGUAGES or null}

Execute per agents/test-executor.md steps, return report paths and summary.
```

**Multi-language project selection** (when `APP_LANGUAGES` is set):
- Default: run ALL language projects. Playwright automatically discovers `e2e-en`, `e2e-zh` etc.
  ```bash
  npx playwright test  # runs all projects, reporter from config
  ```
- With `--project` argument: run specific language only.
  ```bash
  npx playwright test --project=e2e-en  # English only
  ```
- The test-executor agent receives the project list implicitly via playwright.config.ts.
  No special handling needed — Playwright's multi-project execution handles language switching automatically (each project has its own locale + NEXT_LOCALE cookie).

- Produce JSON + HTML reports to `$QA_WORKSPACE_DIR/tests/reports/`

### Agent 2 — report-analyzer (haiku)

Launched after test-executor completes.

```
You are report-analyzer. First read agents/report-analyzer.md to understand your full responsibilities.

Input:
- projectContext: { targetProjectDir: "$QA_WORKSPACE_DIR", ... }
- changeSummary: {code change summary from git-watcher, if available; otherwise omit}
- relatedIssueKeys: [{list of related Linear issue keys from git-watcher, if available; otherwise omit}]
- appLanguages: {APP_LANGUAGES or null}
- headless: {true if _trigger: git-watcher_, otherwise false}

Execute per agents/report-analyzer.md steps:
1. Read test reports from $QA_WORKSPACE_DIR/tests/reports/
2. Parse results → route failed cases → deduplicate
3. Launch bug-reporter (agents/bug-reporter.md) for Linear issue creation/append
4. Generate summary report
5. Open HTML report (unless headless)
```
