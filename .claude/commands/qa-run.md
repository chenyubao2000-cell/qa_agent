---
description: Run existing E2E tests, aggregate reports, report to Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

You are a test executor. Do not generate cases, export Excel, or generate specs — only execute existing tests and report.

```
/qa-run [spec-file-path|glob] [--suite smoke|regression|full] [--lang <language>] [--slug <keyword>] [--source-filter cdp|issue|prd] [--source <source-code-dir>]
     |
Phase 0: Load project context (.env -> target project config)
     |
Phase 1: Sequential launch (execute in order)
         test-executor -> execute existing specs -> produce reports
              | after completion
         report-analyzer -> analyze reports -> guide user to bug-submit skill -> Linear
```

## Phase 0: Load Project Context

```
Read(".env")
```

Only need to extract:
- `QA_WORKSPACE_DIR` — read specs, write reports
- `LINEAR_*` — pass through to report-analyzer (bug reporting)
- `APP_LANGUAGES` — if set, Playwright config has per-language projects (e.g., `e2e-en`, `e2e-zh`). test-executor must handle project selection.
  > **Per-locale execution strategy** (set by `phase-0-templates.md` config): the **default** locale (first in `APP_LANGUAGES`) runs the full test suite; **secondary** locales run only `@smoke` tests via per-project `grep`. Rationale: business logic is locale-agnostic — covering it once is enough; secondary locales only need to prove infra (per-locale auth / i18n rendering / locale cookie) works. Deep i18n coverage belongs to `/qa-i18n-audit`, not full regression. To opt out (force full suite on all locales) override with `--grep @regression` on the CLI and edit config to drop the per-project `grep`.

Not needed: PLAYWRIGHT_BASE_URL (already in config), E2E_TEST_EMAIL (already in auth.setup.ts).
Also extract: `SOURCE_PROJECT_DIR` — passed to report-analyzer for source code enrichment in bug reports.
No initialization — only runs existing specs. Workspace must have been initialized by `/qa-explore` or similar commands.
Required files: `playwright.config.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/testcases/**/*.test.ts`, `node_modules/@playwright/test`. If `E2E_TEST_EMAIL` is set: also `tests/e2e/auth.setup.ts` + `tests/e2e/data.setup.ts` + `playwright/.auth/` directory.

### Three-Stage Execution Pipeline

Playwright config defines a three-stage project chain that runs automatically:
```
setup(auth) → data-setup(parallel fixture data creation) → e2e-*(N workers)
```
- **data-setup**: Pre-creates expensive AI task data (completed tasks, share URLs) in parallel via `Promise.allSettled`. Results cached in `playwright/.test-data.json` (24h TTL). Skips creation if env vars or cache exist.
- **Workers**: `CI ? 3 : 5` — avoids overwhelming single-instance preview servers. Override with `--workers=N`.
- No manual intervention needed — Playwright handles dependencies automatically.
- See `.claude/references/test-data-setup.md` for full pipeline documentation.

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

**Parse parameters from $ARGUMENTS** (supports both flags and natural language):

### Suite (level)

Formal flags:
- `--suite smoke` → suite = "smoke"
- `--suite regression` → suite = "regression"
- `--suite full` or no --suite → suite = "full"
- `--suite P0` / `--suite P1` / `--suite P2` → suite = "P0" / "P1" / "P2"

Suite to Playwright --grep mapping:
- smoke → `--grep @smoke`
- regression → `--grep "@smoke|@regression"`
- full → no --grep (run all)
- P0 / P1 / P2 → `--grep @P0` / `--grep @P1` / `--grep @P2`

### Language

Formal flags:
- `--lang en` → projectFilter = `--project=e2e-en`
- `--lang zh` → projectFilter = `--project=e2e-zh`
- `--lang all` or no --lang → projectFilter omitted (run all language projects)

> Only effective when `APP_LANGUAGES` is set. When not set, project is always `e2e`.

### File scope

Multiple ways to narrow which specs to run (combined with AND logic):

| Flag | Example | Effect |
|------|---------|--------|
| Positional file path | `/qa-run tests/e2e/testcases/generated/login.test.ts` | Run exact file(s) |
| Positional glob | `/qa-run "tests/**/login*.test.ts"` | Glob match |
| `--slug <keyword>` | `/qa-run --slug login` | Match filenames containing `login` |
| `--source-filter cdp\|issue\|prd` | `/qa-run --source-filter cdp` | Only run `*-cdp.test.ts` specs |

Resolution order:
1. If positional file path or glob is provided → use that directly
2. If `--slug` → `Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*{slug}*.test.ts")`
3. If `--source-filter` → `Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*-{source-filter}.test.ts")`
4. If both `--slug` and `--source-filter` → intersect results
5. If none → run all specs

### Natural language (Chinese/English combined parsing)

Parse the entire $ARGUMENTS string for combined intent:

| Input | Parsed as |
|-------|-----------|
| `冒烟` / `smoke` | suite=smoke |
| `P0` (standalone) | suite=P0 (explicit priority level, `--grep @P0`) |
| `回归` / `regression` / `P0+P1` | suite=regression |
| `全量` / `full` / `所有` | suite=full |
| `中文` / `zh` / `chinese` | lang=zh |
| `英文` / `en` / `english` | lang=en |
| `冒烟中文` | suite=smoke, lang=zh |
| `回归英文` | suite=regression, lang=en |
| `P0 中文` | suite=P0, lang=zh |
| `全量 英文` | suite=full, lang=en |
| `只跑登录` | slug=login (extracted from keyword) |
| `冒烟 只跑登录` | suite=smoke, slug=login |

> Natural language tokens are matched greedily. Unrecognized tokens are treated as slug keywords.

### Headless Mode Detection

If the prompt contains `_trigger: git-watcher_`, set `headless: true` for report-analyzer (skip opening browser).

### Agent 1 — test-executor (sonnet)

Launch test-executor agent:

```
You are test-executor. First read .claude/agents/test-executor.md to understand your full responsibilities.

Input:
- mode: "full"
- suite: "{parsed suite, default full}"
- specFiles: [{resolved file list from scope parsing; omit to run all}]
- projectDir: "$QA_WORKSPACE_DIR"
- appLanguages: {APP_LANGUAGES or null}
- langProject: "{parsed --lang → e2e-{lang}, or null for all}"

Execute per .claude/agents/test-executor.md steps, return report paths and summary.
```

**Multi-language project selection** (when `APP_LANGUAGES` is set):
- `langProject` is null → run ALL language projects. Playwright automatically discovers `e2e-en`, `e2e-zh` etc.
  ```bash
  npx playwright test  # runs all projects, reporter from config
  ```
- `langProject` is set (e.g., `e2e-zh` from `--lang zh`) → run specific language only.
  ```bash
  npx playwright test --project=e2e-zh  # Chinese only
  ```
- The test-executor agent receives `langProject` and maps it to `--project` flag.
  Playwright's multi-project execution handles language switching automatically (each project has its own locale + NEXT_LOCALE cookie).

- Produce JSON + HTML reports to `$QA_WORKSPACE_DIR/tests/reports/`

### Agent 2 — report-analyzer (sonnet)

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
3. Build structured failure payload
4. Generate summary report
5. Open HTML report (unless headless)

Return the structured failure payload as JSON (see report-analyzer.md Step 3 for schema).
```

### Step 3 — Guide user to bug-submit (no longer auto-creates Linear issues)

Performed by the **command layer** after report-analyzer completes, ONLY if report-analyzer returned failures.

```
Check: parse report-analyzer's return for the `failures` array.

If failures.length > 0:
  1. Render a concise list to the user: for each failure, {TC ID} + name + error summary + screenshotPath (if any)
  2. Prompt: "以上 N 个用例失败，是否要用 bug-submit skill 逐条核实后提交 Linear？"
  3. If user confirms: for each failure, invoke the `bug-submit` skill (`skills/bug-submit/SKILL.md`),
     passing the failure's description (error message, page, repro steps from handoffFile if present,
     screenshotPath) as the bug description input. bug-submit independently handles code verification,
     dedup against existing issues, and submission — it will prompt the user for project link /
     assignees per its own flow if not already cached.
  4. If user declines: leave the failure list in the summary as-is, no Linear submission.

If allPassed is true or failures is empty:
  Skip this step entirely.
```

### Post-processing — Update Summary with Linear URLs (best-effort)

If the user went through bug-submit and issues were created/commented:
1. Read `$QA_WORKSPACE_DIR/tests/reports/combined/summary.md`
2. Replace the "Linear 上报（待命令层执行）" section with actual results:
   - 新建 Bug: N 条 — {issue URLs}
   - 追加评论: N 条 — {issue URLs}
3. Write updated summary back

If the user declined bug-submit, leave the summary's failure list untouched (no Linear section to fill in).
