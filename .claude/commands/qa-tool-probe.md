---
description: "工具白盒探针：4 桩注入 → tool.execute() 直调 → claude CLI 裁决 → Markdown 报告"
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob
---

You are a tool-probe pipeline orchestrator. Given one or more tool names defined in the source project, you:

1. Locate each tool's `execute` function + the provider client it calls
2. Inject 4 gated debug probes (model decides exact line numbers)
3. Generate a TS runner that calls `tool.execute()` directly (bypassing LLM/Worker) over a generated case list
4. Run it, capture per-case evidence
5. Invoke the local `claude -p` CLI as LLM-as-Judge to verdict each case
6. Write a Markdown report

This is **white-box probing**, not HTTP black-box testing (which is `/qa-api-test`).

```
/qa-tool-probe <tool1> [tool2 ...] [--prd <path>] [--source <dir>] [--extra-case "<one-liner>" ...] [--confirm-probes] [--dry-run]
     |
Phase 0: Load project context (.env → SOURCE_PROJECT_DIR + judge config); pick runId
     |
Phase 1: Tool discovery (Grep/Read — find tool factory + provider client + project logger module)
     |
Phase 2: Test case ideation (reuse test-case-generator skill + tool inputSchema + optional PRD + --extra-case)
     |
Phase 3: Dispatch tool-probe-orchestrator agent
         → decides probe positions, patches source files inline,
         → writes ONE config JSON at qa_agent/tests/reports/tool-probe/config-<runId>.json
     |
Phase 4: Execute runner — bun --env-file=<source-env> qa_agent/scripts/tool-probe/runner.ts --config <cfg>
         → writes evidence-<runId>.jsonl
     |
Phase 5: Execute judge — bun qa_agent/scripts/tool-probe/judge.ts --evidence ... --report ...
         → writes report-<runId>.md
     |
Phase 6: Surface report (failures + summary)
```

**Key architecture point**: `runner.ts` and `judge.ts` live ONCE inside qa_agent and are generic. The orchestrator does NOT generate them per-run. The only per-run artifact written into the source project is the inline probe patches; the per-run config JSON + evidence + report all live in qa_agent.

## Phase 0: Load Project Context

```
Read(".env")
```

Extract:
- `SOURCE_PROJECT_DIR` — source code dir (read tools + write runner/judge + insert probes here)
- `QA_WORKSPACE_DIR` — qa_agent workspace (fallback for evidence/report)
- `JUDGE_LANG` (default `zh`) — judge reason language
- `CLAUDE_JUDGE_CONCURRENCY` (default `4`) — parallel `claude -p` subprocesses
- `CLAUDE_JUDGE_TIMEOUT` (default `240`) — per judge call timeout (seconds)

Source code dir priority: `--source` > `SOURCE_PROJECT_DIR` > error out (this command requires source).

### Parameter Parsing

Parse `$ARGUMENTS`. Positional args before any flag are tool names.

| Flag | Default | Description |
|------|---------|-------------|
| `<toolN>` (positional, 1..N) | — | Tool names (e.g. `github_search`) or factory names (e.g. `createGithubSearchTool`). Required ≥1. |
| `--prd <path>` | — | Optional PRD doc; fed to case ideation. |
| `--source <dir>` | `SOURCE_PROJECT_DIR` | Override source code dir. |
| `--extra-case "<desc>"` | — | Free-form extra case description (repeatable); ideation will turn into structured cases. |
| `--confirm-probes` | **off** | If set, model lists planned probe locations and waits for user confirmation before inserting. |
| `--dry-run` | **off** | If set, instrument + generate runner/judge but do NOT execute. |

**Defaults the user already approved**:
- Probe placement is NOT confirmed by default — agent decides and writes directly.
- Execution runs by default.
- No cleanup of inserted probes — the user manages git themselves.
- No Linear reporting.
- All cases run to completion regardless of failure — failures are summarized in the report; command exits 0.

If no tool args supplied → exit with `Error: at least one tool name required. Usage: /qa-tool-probe <tool> [...]`.

## Phase 1: Tool Discovery

For each tool name `<toolN>`, locate its definition in `$SOURCE_PROJECT_DIR`:

```
# Strategy A: factory name (createXxxTool)
Grep("export function {toolName}\\(|export const {toolName} =", sourceDir, glob: "*.ts")

# Strategy B: tool registry key
Grep("\"{toolName}\"\\s*:|'{toolName}'\\s*:", sourceDir, glob: "*.ts")

# Strategy C: logName / description tag
Grep("logName:\\s*[\"']{toolName}[\"']|name:\\s*[\"']{toolName}[\"']", sourceDir, glob: "*.ts")

# Strategy D: Vercel AI SDK createTool call site
Grep("createTool\\(|tool\\(\\{", sourceDir, glob: "*.ts")
→ filter by description / inputSchema matching toolName
```

For each tool, capture:
- `toolFile` — absolute path of the file containing `execute`
- `executeLineRange` — start/end line numbers of `execute: async (...) => { ... }` body
- `inputSchemaSource` — source of the zod/JSON schema for the input (read it raw, do NOT execute)
- `descriptionSource` — the tool's exported description constant or inline string

Then trace from `execute`'s body to the provider client by following imports:
```
# Inside execute body, look for module calls like:
#   await searchUsers(...) / await client.request(...) / await fetch(...)
# Open the imported module and find the actual fetch site.
```

For each tool, capture:
- `providerFile` — absolute path of the fetch site (may be shared across tools)
- `providerFetchLine` — line number where `fetch(` / `request(` is called
- `providerResponseLine` — line number where the response is parsed (after `await res.json()` and rate-limit parsing)
- `hasProvider` — false if the tool is purely local (no HTTP). Then only `tool.input` + `tool.output` probes apply.

If discovery is ambiguous (multiple candidates), prefer the file with `createTool(`/`tool(` and the matching `inputSchema`/`description` pair. If still ambiguous, ask the user with `AskUserQuestion`.

Produce `discovery.json`:
```json
{
  "tools": [
    {
      "name": "github_search",
      "toolFile": "apps/mira-work/lib/ai/tools/github-search.ts",
      "executeStart": 154,
      "executeEnd": 255,
      "descriptionConst": "GITHUB_SEARCH_DESCRIPTION",
      "providerFile": "packages/sourcing/src/providers/github/github-client.ts",
      "providerFetchLine": 117,
      "providerResponseLine": 153,
      "hasProvider": true
    }
  ],
  "sharedProviders": ["packages/sourcing/src/providers/github/github-client.ts"],
  "prefix": "gh"
}
```

**Prefix derivation**: take the longest common root word across tool names (e.g. `github_search`+`github_lookup` → `gh`). Used for the gated env var name (`<PREFIX>_TOOL_DEBUG`) and event prefix (`<prefix>-debug.*`).

## Phase 2: Test Case Ideation

Generate the case list **without invoking sub-agents** for simple cases; only delegate if PRD is present.

Inputs to feed into ideation:
- `descriptionSource` (raw text)
- `inputSchemaSource` (raw zod/TS source)
- Optional PRD content from `--prd <path>`
- `--extra-case` strings

Use `skills/test-case-generator/SKILL.md` as the case-design guide, then transform output into the runner-expected shape (see `skills/tool-probe/SKILL.md (Part B — Generated Scripts)` for the schema).

**Required case categories** (generate at least 1 per category per tool):

| Category | Example |
|---|---|
| happy path (each major input mode) | search + lookup variants |
| input-schema validation (missing required / wrong type) | drop a required field |
| local validation early-rejection | invalid qualifier / sort |
| numeric clamping / normalization | per_page=0, page=15, float values |
| provider error mapping | 404 → not_found, 401 → auth_error |
| boundary / edge | empty result, max-length query |
| auto-behavior (if any documented) | type:org injection, user→org redirect |

If `--extra-case` provided, append one case per `--extra-case` flag.

**Truncation hint**: cases that fetch large responses (e.g. lists) should set `per_page` ≤ 5 so provider.response stays under the 8 KB per-case budget.

Output (in memory, passed to Phase 3): `cases.json` array, each item:
```json
{
  "name": "search-user-happy",
  "tool": "github_search",
  "description": "搜索 location=berlin 的 rust 开发者",
  "steps": [{ "input": { "target": "user", "q": "language:rust location:berlin", "per_page": 3 } }],
  "expect": "ok",
  "expectErrorCode": null,
  "judgeFocus": "verify provider hit /search/users with q intact; items shape (login/url/type/score)",
  "tokenOverride": null,
  "acceptPartialAsPass": false
}
```

## Phase 3: Dispatch tool-probe-orchestrator

Pick `runId = new Date().toISOString().replace(/[:.]/g, "-")` (e.g. `2026-05-21T08-22-43-114Z`).

Launch the orchestrator agent (sonnet) with this brief:

```
You are tool-probe-orchestrator. First read .claude/agents/tool-probe-orchestrator.md.
Then read skills/tool-probe/SKILL.md (Part A — Instrumentation; Part B — Config & Execution).

Input:
- sourceProjectDir: "$SOURCE_PROJECT_DIR"
- discovery: {discovery.json from Phase 1, including loggerModule absolute path}
- cases: {cases.json from Phase 2}
- prefix: "{discovery.prefix}"
- confirmProbes: {true|false from --confirm-probes}
- runId: "<runId>"

Tasks:
1. Decide exact insertion lines for the 4 probes per tool (you choose, not me).
2. If confirmProbes=true, print the plan and STOP. Otherwise instrument directly:
   - Inline the gated `logger.info` call at each probe site (NO helper file).
   - Add a `logger` import to each patched file if absent.
   - Patch tool and provider files in place. Do NOT back up — user manages git.
   - Add `export` to file-scoped description constants the runner needs to import.
   - Dedup: Grep for existing `<prefix>-debug.<stage>` in the same function; skip if present.
3. Write ONE config JSON to:
   D:\work\code\qa_agent\tests\reports\tool-probe\config-<runId>.json
   Schema: see Part B of the skill. Includes runId, sourceProjectDir, loggerModule (abs path),
   tools map (abs paths to .ts + factory + descriptionExport), authEnvVar, debugEnvVar
   (=<PREFIX>_TOOL_DEBUG), eventPrefix (=<prefix>-debug), cases, evidenceOutPath.

Return: { patchedFiles[], skippedProbes[], configFile, evidenceTarget, reportTarget }.
```

If `--confirm-probes` is set and the agent returns a plan, surface it to the user and exit (the user reruns without the flag once they're happy).

## Phase 4: Execute Runner (skipped if `--dry-run`)

Locate the source project's `.env` (e.g. `apps/mira-work/.env` for monorepos, or `<source>/.env` for flat projects).

```powershell
$env:<PREFIX>_TOOL_DEBUG = "1"
bun --env-file=<absolute-path-to-source-env> `
  D:\work\code\qa_agent\scripts\tool-probe\runner.ts `
  --config D:\work\code\qa_agent\tests\reports\tool-probe\config-<runId>.json
```

The runner `process.chdir(sourceProjectDir)` internally so the source project's tsconfig / workspaces / relative paths resolve correctly during dynamic import. It writes `evidence-<runId>.jsonl` and prints per-case progress. Failures inside the runner (e.g. one case threw) are captured into the evidence row's `threw` field — the runner does NOT exit on a single case failure. Only catastrophic errors (import failure, fs error) cause non-zero exit; surface those to the user but still continue to Phase 5 if the evidence file is partially populated.

## Phase 5: Execute Judge (skipped if `--dry-run`)

```powershell
bun D:\work\code\qa_agent\scripts\tool-probe\judge.ts `
  --evidence D:\work\code\qa_agent\tests\reports\tool-probe\evidence-<runId>.jsonl `
  --report   D:\work\code\qa_agent\tests\reports\tool-probe\report-<runId>.md
```

The judge runs all cases through `claude -p` (concurrency = `CLAUDE_JUDGE_CONCURRENCY`, default 1), then writes Markdown. It exits 0 regardless of individual verdicts — failure status lives in the report.

## Phase 6: Surface Report

Read `report-<ts>.md`. Extract:
- Summary line (counts of ✅ / ⚠️ / ❌ / 💥)
- Per-failure mini-summary (case name + 1-line reasoning)

Print to user. End with the absolute path of the full report.

**Final return** (always exit 0):

```json
{
  "patchedFiles": ["apps/.../github-search.ts", "packages/.../github-client.ts"],
  "configFile": "D:\\work\\code\\qa_agent\\tests\\reports\\tool-probe\\config-<runId>.json",
  "evidenceFile": "D:\\work\\code\\qa_agent\\tests\\reports\\tool-probe\\evidence-<runId>.jsonl",
  "reportFile": "D:\\work\\code\\qa_agent\\tests\\reports\\tool-probe\\report-<runId>.md",
  "summary": { "total": 24, "pass": 19, "partial": 2, "fail": 2, "error": 1 },
  "failures": [
    { "name": "search-repo-sort-by-stars", "reasoning": "items[2].stars > items[1].stars — sort not honored" }
  ]
}
```
