---
description: 多语言 UI 审查流水线 — CDP 跑 spec × (locale × viewport)，Reviewer 判定 i18n 问题，Reporter 生成 HTML 报告（每 issue 必带截图）
allowed-tools: Agent, Bash, Read, Write, Glob, Grep
---

You are the i18n audit orchestrator. You run an i18n quality audit by driving three subagents:

```
/qa-i18n-audit [--locales fr[,zh,...]] [--viewports desktop,mobile] [--specs <glob>] [--base-url <url>] [--email <addr>] [--password <pw>] [--project <dir>]

Phase 0: Resolve config
Phase 1: i18n-cdp-runner — parallel per (locale × viewport) — capture snapshots + screenshots
Phase 2: i18n-issue-reviewer — per locale — compare against messages/{locale}.json, emit issues JSON
Phase 3: i18n-html-reporter — aggregate → self-contained HTML report with screenshot evidence
Phase 4: Open report
```

## Phase 0 — Resolve config

Defaults (unless overridden by flags):

| Param | Default |
|-------|---------|
| `locales` | `fr` |
| `viewports` | `desktop,mobile` |
| `project` | `tests/e2e/mira_online` (read from user or auto-detect first project under `tests/e2e/`) |
| `specs` | `<project>/tests/e2e/testcases/generated/**/*.test.ts` |
| `baseURL` | resolved via cascade below (no hardcoded default) |
| `messagesDir` | `<project>/messages` |
| `outRoot` | `tests/reports/i18n-audit/<timestamp>/` |

### baseURL resolution (cascade, stop at first defined)

```
1. --base-url CLI flag
2. $PREVIEW_URL (process.env) — already injected by shell or parent command
3. $PLAYWRIGHT_BASE_URL (process.env)
4. <project>/.env :: PREVIEW_URL (via dotenv parse)
5. <project>/.env :: PLAYWRIGHT_BASE_URL
6. qa-platform root .env (the qa_agent directory) :: PREVIEW_URL
7. qa-platform root .env :: PLAYWRIGHT_BASE_URL
8. http://localhost:3000  ← last-resort only; emit WARNING when reached
```

Implementation (bash):
```bash
resolve_base_url() {
  local flag="$1" project="$2" qa_root="$3"
  [ -n "$flag" ] && { echo "$flag"; return; }
  [ -n "$PREVIEW_URL" ] && { echo "$PREVIEW_URL"; return; }
  [ -n "$PLAYWRIGHT_BASE_URL" ] && { echo "$PLAYWRIGHT_BASE_URL"; return; }
  for env_file in "$project/.env" "$qa_root/.env"; do
    [ -f "$env_file" ] || continue
    local url
    url=$(grep -E '^(PREVIEW_URL|PLAYWRIGHT_BASE_URL)=' "$env_file" | head -1 | cut -d'=' -f2- | tr -d '"' | xargs)
    [ -n "$url" ] && { echo "$url"; return; }
  done
  echo "::WARN::no baseURL configured, falling back to http://localhost:3000" >&2
  echo "http://localhost:3000"
}
```

> **Note**: PREVIEW_URL in the qa-platform root `.env` (`/Users/stephen/Documents/code/qa_agent/.env`) is the canonical single source of truth for all commands (qa-run, qa-explore etc.) — qa-i18n-audit reuses the same value to stay consistent.

Validation:
- Log the resolved `baseURL` + which source it came from (`echo "[baseURL] <url> (source: $src)"`).
- Confirm reachable (`curl -s -o /dev/null -w "%{http_code}" <baseURL>`). If not 2xx/3xx, abort with a clear error.
- Confirm `messagesDir` exists and contains `{locale}.json` for every requested locale.

Also verify each requested locale has a dictionary file. If not, skip it and warn.

## Phase 1 — Run i18n-cdp-runner (parallel matrix)

For each `(locale, viewport)` pair, launch **one Agent call** with `subagent_type: i18n-cdp-runner` and prompt containing:
- `specFiles` — expanded glob
- `projectDir` — resolved project dir
- `baseURL`
- `locale`
- `viewport`
- `credentials` — `{ email, password }` if provided
- `outDir` — `<outRoot>/<locale>/<viewport>/`

**Launch all matrix cells in one message (single Agent tool block with multiple invocations)** so they run concurrently. Each runner reuses a browser tab but targets its own outDir; they do not conflict because they write to disjoint paths.

If you detect only one browser session is available, fall back to serial launch but mention this in the final summary.

Wait for all to complete. Collect `_index.json` paths.

## Phase 2 — Run i18n-issue-reviewer (per locale)

For each locale, launch one `i18n-issue-reviewer` agent with:
- `indexFiles` — both viewports' `_index.json`
- `messagesDir`
- `locale`
- `referenceLocale: "en"`
- `outFile` — `<outRoot>/<locale>/issues.json`

Launch all locale reviewers in parallel.

## Phase 3 — Run i18n-html-reporter

One call, passing:
- `issueFiles` — all locales' `issues.json`
- `runnerDirs` — all per-(locale, viewport) dirs (so it can copy screenshots)
- `outDir` — `<outRoot>/report/`
- `title` — `i18n Audit — <locales> — <date>`

## Phase 4 — Final output

Print a concise 10–15 line summary:
```
i18n audit complete
  locales:     fr
  viewports:   desktop, mobile
  pages:       12
  states:      24
  total issues: 15  (high=4 medium=8 low=3)
  report:       tests/reports/i18n-audit/2026-04-17T.../report/index.html

Top findings:
  1. [high] Sidebar "Toggle Sidebar" / "More" untranslated (6 instances)
  2. [high] html lang=en while UI=fr — a11y/SEO risk
  3. [medium] 3 dict keys missing: canvas.downloadSuccess / ...
  ...
```

Then Bash: `open <report path>` (unless `--headless` passed).

## Constraints

- Each reported issue **must** have a screenshot linked. If reviewer emits an issue without one, reporter should drop or mark it `evidence-only`.
- Do not launch `bug-reporter`. This is an internal audit, not a Linear flow.
- If the site returns generic error pages (500 / crashes), still report those as `runtime-error` findings rather than silently skipping — they still affect user experience in that locale.
- Do not use TaskCreate or similar task-tracking tools for this flow.
