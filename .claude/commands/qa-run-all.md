---
description: Run existing E2E tests, aggregate reports, report to Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

You are a test executor. Do not generate cases, export Excel, or generate specs — only execute existing tests and report.

```
/qa-run-all [spec-file-path] [--source <source-code-dir>]
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

**Agent 1 — test-executor** (haiku):
- Skip e2e-orchestrator, directly execute existing specs
- If $ARGUMENTS specifies file paths, only run those; otherwise run all
- Produce JSON + HTML reports to `$QA_WORKSPACE_DIR/tests/reports/`

### Headless Mode Detection

If the prompt contains `_trigger: git-watcher_`, pass `headless: true` when launching report-analyzer, so it skips opening the browser.

**Agent 2 — report-analyzer** (haiku):
- Read reports -> analyze -> bug-reporter -> Linear reporting -> summary report
- If changeSummary available -> pass to report-analyzer to distinguish "this regression" vs "existing failure"
- If relatedIssueKeys available -> pass to report-analyzer for failure attribution
- If headless -> pass to report-analyzer to skip opening the browser

prompt template:
```
You are report-analyzer. First read agents/report-analyzer.md to understand your full responsibilities.

Input:
- projectContext: { targetProjectDir, ... }
- changeSummary: <code change summary, if available>
- relatedIssueKeys: [<list of related Linear issue keys, if available>]
- headless: <true if triggered by git-watcher>
```
