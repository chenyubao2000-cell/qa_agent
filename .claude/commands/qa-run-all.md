---
description: Run existing E2E tests, aggregate reports, report to Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

You are a test executor. Do not generate cases, export Excel, or generate specs — only execute existing tests and report.

```
/qa-run-all [spec-file-path] [--suite smoke|regression|full] [--source <source-code-dir>]
            [--sentry] [--sentry-query "keyword"] [--sentry-minutes N]
     |
Phase 0: Load project context (.env -> target project config)
     |
Phase 1: Sequential launch (execute in order)
         ┌─ sentry-monitor (background, optional) ─── polls Sentry ──┐
         test-executor -> execute existing specs -> produce reports   │
              | after completion                                      │
         report-analyzer -> analyze reports -> bug-reporter -> Linear │
              | after completion                                      │
         ← sentry-monitor results (merge into summary) ──────────────┘
```

## Phase 0: Load Project Context

```
Read(".env")
```

Only need to extract:
- `QA_WORKSPACE_DIR` — read specs, write reports
- `LINEAR_*` — pass through to report-analyzer (bug reporting)
- `APP_LANGUAGES` — if set, Playwright config has per-language projects (e.g., `e2e-en`, `e2e-zh`). test-executor must handle project selection.

Not needed: PLAYWRIGHT_BASE_URL (already in config), E2E_TEST_EMAIL (already in auth.setup.ts).
Also extract: `SOURCE_PROJECT_DIR` — passed to report-analyzer for source code enrichment in bug reports.
Also extract: `SENTRY_KEY`, `SENTRY_PROJECT`, `SENTRY_ENV` — needed if `--sentry` flag is used.
No initialization — only runs existing specs. Workspace must have been initialized by `/qa-explore` or similar commands.
Required files: `playwright.config.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/testcases/**/*.test.ts`, `node_modules/@playwright/test`. If `E2E_TEST_EMAIL` is set: also `tests/e2e/auth.setup.ts` + `playwright/.auth/` directory.

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

### Sentry Monitor Detection

Parse `$ARGUMENTS` for Sentry monitoring flags:
- `--sentry` → enable Sentry monitoring (launches sentry-monitor as background agent)
- `--sentry-query "keyword"` → filter Sentry issues by keyword (e.g., `--sentry-query "Failed to pause E2B"`)
- `--sentry-minutes N` → monitoring duration in minutes (default: 10)

If `--sentry` is present (or `--sentry-query` is specified, which implies `--sentry`):

```
Launch sentry-monitor (haiku, run_in_background: true):

You are sentry-monitor. First read .claude/agents/sentry-monitor.md to understand your full responsibilities.

Input:
- projectDir: "$QA_WORKSPACE_DIR"
- query: "{parsed --sentry-query value, or null}"
- durationMinutes: {parsed --sentry-minutes value, or 10}
- pollIntervalSeconds: 60
```

This agent runs in the background. Continue immediately to test-executor.

### Agent 1 — test-executor (haiku)

Launch test-executor agent:

```
You are test-executor. First read .claude/agents/test-executor.md to understand your full responsibilities.

Input:
- mode: "full"
- suite: "{parsed suite parameter, default full}"
- specFiles: [{if $ARGUMENTS specifies file paths, list them; otherwise omit to run all}]
- projectDir: "$QA_WORKSPACE_DIR"
- appLanguages: {APP_LANGUAGES or null}

Execute per .claude/agents/test-executor.md steps, return report paths and summary.
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
You are report-analyzer. First read .claude/agents/report-analyzer.md to understand your full responsibilities.

Input:
- projectContext: { targetProjectDir: "$QA_WORKSPACE_DIR", ... }
- changeSummary: {code change summary from git-watcher, if available; otherwise omit}
- relatedIssueKeys: [{list of related Linear issue keys from git-watcher, if available; otherwise omit}]
- appLanguages: {APP_LANGUAGES or null}
- headless: {true if _trigger: git-watcher_, otherwise false}
- sourceProjectDir: {resolved source code directory per priority: --source > prSourceDir > SOURCE_PROJECT_DIR > QA_WORKSPACE_DIR, or null}

Execute per .claude/agents/report-analyzer.md steps:
1. Read test reports from $QA_WORKSPACE_DIR/tests/reports/
2. Parse results → route failed cases → deduplicate
3. Build structured failure payload (do NOT launch bug-reporter)
4. Generate summary report
5. Open HTML report (unless headless)

Return the structured failure payload as JSON (see report-analyzer.md Step 3 for schema).
```

### Agent 3 — bug-reporter (haiku) — Conditional

Launched by the **command layer** after report-analyzer completes, ONLY if report-analyzer returned failures.

> **Why command layer**: haiku agents cannot reliably launch nested agents. The command layer (sonnet/opus) handles this orchestration.

```
Check: parse report-analyzer's return for the `failures` array.

If failures.length > 0:

  Launch bug-reporter (haiku):

  You are bug-reporter. First read .claude/agents/bug-reporter.md to understand your full responsibilities.

  Input:
  - linearTeamId: "{reportAnalyzerResult.linearConfig.linearTeamId}"
  - linearProjectId: "{reportAnalyzerResult.linearConfig.linearProjectId}"
  - previewUrl: "{reportAnalyzerResult.linearConfig.previewUrl}"
  - failures: {reportAnalyzerResult.failures}

  Execute per .claude/agents/bug-reporter.md: process each failure entry
  (create new issues or append comments based on action field).
  Return created/appended issue list.

If allPassed is true or failures is empty:
  Skip bug-reporter. No Linear reporting needed.
```

### Post-processing — Merge Sentry Monitor Results (conditional)

If sentry-monitor was launched (background agent), check its results now:

1. The background agent should have completed by this point (test execution + analysis typically takes longer than the Sentry monitoring window)
2. If sentry-monitor returned issues:
   - Append a **Sentry 监控** section to `$QA_WORKSPACE_DIR/tests/reports/combined/summary.md`:
     ```markdown
     ## Sentry 错误监控（测试期间）

     环境: {env} | 项目: {project} | 监控时段: {monitorStart} ~ {monitorEnd}
     {query ? "过滤条件: " + query : ""}

     | # | Level | 次数 | 错误标题 | 调用栈顶帧 | 链接 |
     |---|-------|------|----------|------------|------|
     | 1 | error | 5    | Failed to pause E2B | file.ts:42 in fn | [查看](permalink) |
     ```
   - Cross-reference: if any Sentry error title matches a test failure name/error message, annotate the test failure with "Sentry 同步报错" in the summary

3. If sentry-monitor returned 0 issues:
   - Append: `## Sentry 错误监控（测试期间）\n\n监控期间无新增 Sentry 错误。`

### Post-processing — Update Summary with Linear URLs

After bug-reporter returns `{ created, appended }`:
1. Read `$QA_WORKSPACE_DIR/tests/reports/combined/summary.md`
2. Replace the "Linear 上报（待命令层执行）" section with actual results:
   - 新建 Bug: N 条 — {issue URLs}
   - 回写源 Issue: N 条 — {issue URLs}
3. Write updated summary back
