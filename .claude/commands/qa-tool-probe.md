---
description: "工具白盒探针：4 桩注入 → tool.execute() 直调 → claude CLI 裁决 → Markdown 报告"
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob, WebFetch
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
/qa-tool-probe <tool1> [tool2 ...] [--prd <path>] [--source <dir>]
               [--mcp <url> [--mcp-auth-env <NAME>]]
               [--api-doc <url> ...]
               [--extra-case "<one-liner>" ...] [--confirm-probes] [--dry-run]
     |
Phase 0: Load .env (SOURCE_PROJECT_DIR / QA_WORKSPACE_DIR / judge config); pick runId
     |
Phase 1: Tool discovery — forks on mode
         ├─ vercel-ai (default): Grep/Read source to find factory + provider + logger
         └─ mcp-http (--mcp):    MCP Client listTools() over StreamableHTTP
     |
Phase 2: Test case ideation (tool-probe-case-generator skill → zod-validated cases[])
         · inputSchema source: zod TS (vercel) or JSON Schema (mcp)
     |
Phase 2.5: Cross-source contract diff (tool source vs apiDocs vs PRD)
         · skipped if <2 sources present
         · static analysis only, never blocks the pipeline
         · output: contract-diff-<runId>.json + .md
     |
Phase 3: Dispatch tool-probe-orchestrator agent
         · 3a write config.json → 3b validate-cases.ts gate → 3c patch source
         · 3c skipped entirely for kind=mcp-http tools
     |
Phase 4: bun runner.ts --config <cfg>  →  evidence-<runId>.jsonl
         · runner forks on tool.kind (vercel-ai: import+execute; mcp-http: MCP Client)
     |
Phase 5: bun judge.ts → report-<runId>.md + append to combined/summary.md
     |
Phase 6: Surface report (failures + summary)
```

**Key architecture point**: `runner.ts` / `judge.ts` / `validate-cases.ts` live ONCE inside qa_agent and are generic. The only per-run artifact written into the source project is the inline probe patches (vercel-ai mode only). The per-run config JSON + evidence + report all live in `$QA_WORKSPACE_DIR/tests/reports/tool-probe/`.

## Phase 0: Load Project Context

```
Read(".env")
```

Extract:
- `SOURCE_PROJECT_DIR` — source code dir (read tools + insert probes here in vercel-ai mode). **Not required in MCP mode.**
- `QA_WORKSPACE_DIR` — qa_agent workspace (config / evidence / report all written under `$QA_WORKSPACE_DIR/tests/reports/tool-probe/`)
- `JUDGE_LANG` (default `zh`) — judge reason language
- `CLAUDE_JUDGE_CONCURRENCY` (default `1`) — parallel `claude -p` subprocesses. **Keep at 1 when running inside a Claude Code session** (parallel `claude -p` contends with the parent session and gets killed, exit 9). Bump to 4+ only when invoking from a standalone shell.
- `CLAUDE_JUDGE_TIMEOUT` (default `240`) — per judge call timeout (seconds)
- `TOOL_PROBE_AUTH_ENV_VAR` (optional, no default) — name of the env var that holds the vercel-ai mode's API token. Used to populate `config.authEnvVar` so `tokenOverride` in cases can mutate it. If unset, cases that use `tokenOverride` will be **rejected by validate-cases.ts** with `missing-auth-env-var`. Example: `TOOL_PROBE_AUTH_ENV_VAR=GITHUB_API_TOKEN`.

Source code dir priority (vercel-ai mode only): `--source` > `SOURCE_PROJECT_DIR` > error out. In MCP mode (`--mcp <url>`), source dir is ignored.

**Generate `runId` once here, reuse across all subsequent phases**:

```
runId = new Date().toISOString().replace(/[:.]/g, "-")     // e.g. 2026-05-21T08-22-43-114Z
```

This single `runId` is the suffix on `discovery-<runId>.json` (MCP mode), `config-<runId>.json`, `evidence-<runId>.jsonl`, and `report-<runId>.md`. Generating it later (e.g. in Phase 3) would break Phase 1a's discovery output filename.

### Parameter Parsing

Parse `$ARGUMENTS`. Positional args before any flag are tool names.

| Flag | Default | Description |
|------|---------|-------------|
| `<toolN>` (positional, 1..N) | — | Tool names (e.g. `github_search`) or factory names (e.g. `createGithubSearchTool`). Required ≥1. |
| `--prd <path>` | — | Optional PRD doc; fed to case ideation. |
| `--source <dir>` | `SOURCE_PROJECT_DIR` | Override source code dir (vercel-ai mode only). |
| `--mcp <url>` | — | If set, treat the listed tools as **remote MCP tools** served by this StreamableHTTP URL. Skips source discovery and probe injection; tool schemas come from `tools/list` instead of grepping source. Auth: env var named by `--mcp-auth-env` (defaults to `MCP_AUTH_TOKEN`). |
| `--mcp-auth-env <NAME>` | `MCP_AUTH_TOKEN` | Env var holding the Bearer token for the MCP server. Only meaningful with `--mcp`. |
| `--api-doc <url>` | — | URL to the **official upstream API documentation** for what the tool wraps. **Endpoint-specific URL preferred** (e.g. `https://docs.github.com/en/rest/search/search`), but a TOC/root URL (e.g. `https://docs.github.com/en/rest`) also works — Phase 1.5 will use the endpoint hint extracted from the tool's source (`providerFile:providerFetchLine`) to instruct WebFetch to either pinpoint the section or return a `sub_url` for one auto-follow hop. Repeatable. Only affects Phase 2 ideation; not used by judge/runner. |
| `--extra-case "<desc>"` | — | Free-form extra case description (repeatable); ideation will turn into structured cases. |
| `--confirm-probes` | **off** | If set, model lists planned probe locations and waits for user confirmation before inserting (vercel-ai only; ignored in MCP mode). |
| `--dry-run` | **off** | If set, do all preparation (Phase 1–3 incl. validator) but skip runner+judge execution. In vercel-ai mode this still patches source; in MCP mode this only writes the config. |

**Two modes — pick by flag**:
- **Vercel-AI mode (default)**: probe + import in-process. Requires `SOURCE_PROJECT_DIR` (or `--source`). Tools are grepped from the source tree.
- **MCP-HTTP mode (`--mcp <url>`)**: black-box RPC. Tools discovered via `client.listTools()`. No source patching. Evidence is `tool.input` + `tool.output` only (no provider.* probes).

**Flag conflict rules**:
- `--mcp` + `--source` — `--source` is **ignored** (MCP mode has no source side); print a one-line notice but proceed.
- `--mcp` + `--prd` — both honored; PRD informs case ideation regardless of mode.
- `--mcp` + `--confirm-probes` — `--confirm-probes` **ignored** (no probes to confirm).
- Mixing vercel-ai and mcp-http tools in one invocation is **not supported**. Call `/qa-tool-probe` twice — both runs append to the same `combined/summary.md` so reports merge cleanly.

**Defaults the user already approved**:
- Probe placement is NOT confirmed by default — agent decides and writes directly.
- Execution runs by default.
- No cleanup of inserted probes — the user manages git themselves.
- No Linear reporting.
- All cases run to completion regardless of failure — failures are summarized in the report; command exits 0.

If no tool args supplied → exit with `Error: at least one tool name required. Usage: /qa-tool-probe <tool> [...]`.

## Phase 1: Tool Discovery

### Branch 1a — MCP-HTTP mode (when `--mcp <url>` set)

Connect to the MCP server via StreamableHTTP, list tools, filter to the requested set. **Replaces** the source-grep flow below. Use the dedicated CLI:

```sh
bun $QA_WORKSPACE_DIR/scripts/tool-probe/mcp-discover.ts \
  --url       <value from --mcp> \
  --tools     <comma-separated tool names from positional args> \
  --auth-env  <value from --mcp-auth-env, default MCP_AUTH_TOKEN> \
  --out       $QA_WORKSPACE_DIR/tests/reports/tool-probe/discovery-<runId>.json
```

Exit codes:
- `0` — all requested tools resolved; discovery JSON written
- `1` — one or more tool names missing on the server; stderr lists what's available; **abort the pipeline**
- `2` — argv / connection / I/O error; abort

The script writes a discovery JSON matching the "MCP-HTTP shape" below — each entry carries `kind: "mcp-http"`, the server-returned `description` + `inputSchema`, plus the `serverUrl` / `authTokenEnv` bookkeeping the orchestrator needs to write a runner config. `loggerModule` / `sharedProviders` / `providerFile` are **omitted** (no source-side probes in this mode).

### Branch 1b — Vercel-AI mode (default)

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

**Compute `prefix` via the shared CLI** (same rule as Phase 1a uses internally — single source of truth, no drift risk):

```sh
bun $QA_WORKSPACE_DIR/scripts/tool-probe/prefix.ts <comma-separated tool names>
# e.g. → "github" for github_search,github_lookup
```

Then write `discovery-<runId>.json` to `$QA_WORKSPACE_DIR/tests/reports/tool-probe/` (symmetric with Phase 1a) so the orchestrator can pick it up.

Produce `discovery.json`. The shape depends on `kind`:

**Vercel-AI shape** (from Branch 1b):
```json
{
  "tools": [
    {
      "kind": "vercel-ai",
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

**MCP-HTTP shape** (from Branch 1a):
```json
{
  "tools": [
    {
      "kind": "mcp-http",
      "name": "cts_search_candidates",
      "description": "Search CTS candidate database by filters",
      "inputSchema": { "type": "object", "properties": { "q": { "type": "string" } }, "required": ["q"] },
      "serverUrl": "https://cts-mcp.example.com/mcp",
      "authTokenEnv": "CTS_MCP_TOKEN"
    }
  ],
  "prefix": "cts"
}
```

**Prefix derivation**: longest common leading underscore-segment(s) across tool names (e.g. `github_search`+`github_lookup` → `github`; single tool `cts_search_candidates` → `cts`). Used in vercel-ai mode for the gated env var name (`<PREFIX>_TOOL_DEBUG`) and event prefix (`<prefix>-debug.*`); in MCP mode it's bookkeeping only (no probes use it). For mcp-http mode, this is computed automatically by `mcp-discover.ts`.

## Phase 1.5: Official API Doc Fetch (skipped if no `--api-doc`)

For each `--api-doc <url>` flag, fetch the upstream documentation so Phase 2 ideation can ground cases against the real API contract — not just the tool's hand-written description string.

### Step A: Build endpoint hints (one per tool)

Phase 1 already told us where each tool's upstream call happens. Extract a **real endpoint signature** so the doc fetch can find the right section even if the user passed a TOC URL.

```
for tool in tools:
    if tool.kind == "vercel-ai" and tool.hasProvider:
        # Read ±10 lines around providerFile:providerFetchLine.
        # Regex/eyeball for one of:
        #   fetch("https://api.github.com/search/users", ...)   →  "GET /search/users"
        #   client.get('/repos/{owner}/{repo}', ...)            →  "GET /repos/{owner}/{repo}"
        #   request({ method: 'POST', url: '/users' })          →  "POST /users"
        # If method can't be determined, record just the path. If nothing matches, hint = null.
        tool.endpointHint = extract_endpoint_signature(tool.providerFile, tool.providerFetchLine)
    else:
        # MCP mode (no source) or pure-local tool — fall back to name + description first line.
        tool.endpointHint = `${tool.name} — ${first_line(tool.description)}`
```

### Step B: Fetch with hint + 1-hop follow protocol

```
followBudget = 1   # hard cap; never recurse further

for url in apiDocUrls:
    hintsBlock = tools.filter(hasHint).map(t => `- tool "${t.name}" → ${t.endpointHint}`).join("\n")
    result = WebFetch(url, prompt: """
        I'm extracting upstream API contract for these tools:
        {hintsBlock}

        If THIS page documents the relevant endpoint(s) → extract concise structured markdown:
        HTTP method+path, all params (name/type/required/enum/min/max/default),
        documented error codes / status mappings, rate limit, pagination limits,
        any auto-behaviors (redirects, type coercion, server-side normalization).
        Drop marketing copy.

        If THIS page is an INDEX/TOC and does NOT itself contain the endpoint's params/errors →
        DO NOT GUESS. Return EXACTLY this JSON on a single line, nothing else:
          {"sub_url": "<best link from the page that documents the endpoint(s) above>"}
        Pick the link by matching the endpoint path/name. The sub_url must be on the SAME HOST as the current page.

        If THIS page covers MANY endpoints → extract only the section(s) matching the hints above.
    """)

    if result starts with "{" and parses as { sub_url: string } and followBudget > 0:
        subUrl = result.sub_url
        if hostOf(subUrl) != hostOf(url):
            warn("model returned cross-host sub_url; refusing to follow:", subUrl)
            apiDocs.append("(TOC page — model failed to locate sub-page on same host)")
            continue
        followBudget--
        result = WebFetch(subUrl, prompt: <same prompt minus the sub_url branch — must extract or fail>)

    apiDocs.append(result)
    followBudget = 1   # reset budget per --api-doc URL
```

### Failure handling

- Single URL WebFetch fails (network/404) → print one-line warning, continue with remaining URLs
- All URLs fail → proceed to Phase 2 without `apiDocs` (don't block); ideation falls back to inputSchema + description only
- Follow-up fetch (second hop) returns another `sub_url` → ignore the suggestion, use whatever extracted content the second fetch produced; **never make a 3rd hop**
- Cross-host sub_url → refuse, log warning, keep first-fetch content (or empty if TOC)

### Notes

- Why fetch in the command layer instead of the skill: skills are markdown without runtime; WebFetch must happen here so the skill receives plain text strings as input.
- Why endpoint hint matters: prevents the model from hallucinating params/errors when the fetched page is a TOC — official spec absence is better than fabricated official spec.
- **Idempotency**: WebFetch results are not cached across runs. If you're iterating on the same tool and don't want to refetch, save the extracted markdown locally and feed it via `--prd <path>` instead (PRD slot already accepts arbitrary supplementary context).

## Phase 2: Test Case Ideation

**Use `skills/tool-probe-case-generator/SKILL.md`** (NOT the generic `test-case-generator` skill — that one targets E2E / Playwright and outputs Markdown + handoff JSON, which is the wrong shape for this pipeline).

The tool-probe-case-generator skill:
- Borrows test-case-generator's 6 design methods & dedup logic, but maps them to tool-probe's 7 required categories
- Outputs JSON cases **directly conforming to** `scripts/tool-probe/case-schema.ts` (the single source of truth shared with `runner.ts`)
- Self-validates via `casesArraySchema.safeParse(cases)` before returning — catches schema drift at ideation time, not at runner startup
- Returns in-memory array; no file write (command layer embeds into config)

Generate **without invoking sub-agents**; only delegate to a sub-agent if PRD is present and complex.

Inputs to feed into the skill (skill auto-detects which form based on `kind`):
- `descriptionSource` (raw text — Vercel: tool's description constant; MCP: `tools[].description` from listTools)
- `inputSchemaSource` — **two shapes by mode**:
  - vercel-ai → raw zod TS source (parse via regex/AST)
  - mcp-http → JSON Schema object from `tools[].inputSchema` (read directly)
- `hasProvider` from Phase 1 discovery (vercel-ai only; MCP mode always treats as `false` — no provider-level probes exist)
- `kind` from Phase 1 discovery (`"vercel-ai"` | `"mcp-http"`)
- Optional PRD content from `--prd <path>`
- Optional `apiDocs: string[]` from Phase 1.5 (official upstream API docs fetched via `--api-doc`); **when present, ideation should prefer official enums/error codes/limits over inferring from inputSchema alone, and add cases for any auto-behaviors documented officially but not mentioned in the tool's own description**
- `--extra-case` strings

**Required case categories** (skill enforces ≥ 5/7 produce real cases; remaining can be N/A with reason):

| Category | Example |
|---|---|
| ① happy path (each major input mode) | search + lookup variants |
| ② input-schema validation (missing required / wrong type) | drop a required field |
| ③ local validation early-rejection | invalid qualifier / sort |
| ④ numeric clamping / normalization | per_page=0, page=15, float values |
| ⑤ provider error mapping | 404 → not_found, 401 → auth_error |
| ⑥ boundary / edge | empty result, max-length query |
| ⑦ auto-behavior (if any documented) | type:org injection, user→org redirect |

If `--extra-case` provided, the skill appends one case per flag with `name: "extra-<n>"` (input inferred from description, falls back to `{}` + `requires manual input fill` judgeFocus note when not inferrable — never guesses silently).

**Truncation hint**: skill applies this automatically — cases that fetch large responses (lists) set `per_page` ≤ 5 so provider.response stays under runner.ts's 8 KB per-case budget.

Output (in memory, passed to Phase 3): zod-validated `cases[]` array. Schema is `casesArraySchema` from `scripts/tool-probe/case-schema.ts`. Example item:

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

If the skill's zod validation fails, **stop here** and surface the failed case names + zod error paths to the user. Do not proceed to Phase 3 with invalid cases.

**Persist cases for reproducibility** (mandatory):

```
Write($QA_WORKSPACE_DIR/tests/reports/tool-probe/cases-<runId>.json, JSON.stringify(cases, null, 2))
```

LLM-driven ideation is non-deterministic — without persistence, re-running after any later failure produces a different case set. By snapshotting `cases-<runId>.json` immediately after Phase 2 succeeds, the user (or the orchestrator on retry) can re-feed the exact same batch via `--cases-file <path>` (see "Re-run from existing cases" section if implemented; for now treat the file as documentation of what ran).

## Phase 2.5: Cross-Source Contract Diff (skipped if <2 sources)

Static analysis pass: compare what the **tool implementation** says vs what the **official API docs** say vs what the **PRD** says about the same API. Surfaces contract violations the runtime tests don't catch — e.g. tool clamps `per_page` at 50 while the upstream allows 100, or tool fails to implement an auto-redirect documented by the official spec.

This phase is **audit, not enforcement**. Even when findings include `severity=error`, Phase 3/4/5/6 still proceed normally. The diff goes into the final report as a separate section so reviewers can spot static issues alongside runtime ones.

### Source budget (≥ 2 required to run)

| Source | Origin | Always present? |
|---|---|---|
| Tool source | Phase 1 (`descriptionSource` + `inputSchemaSource` + `providerCall`) | ✅ yes |
| Official API docs | Phase 1.5 `apiDocs[]` (set only if `--api-doc <url>` passed) | ❌ optional |
| PRD | `--prd <path>` content | ❌ optional |

If only the tool source is available (no `--api-doc`, no `--prd`), **skip Phase 2.5 entirely** and note in the final report:
```
Contract diff skipped: only 1 source available. Pass --api-doc and/or --prd to enable.
```

For MCP-HTTP tools, `providerCall` is absent (no source visibility) — the diff still runs on inputSchema vs apiDocs/PRD but cannot inspect clamping / redirect / branch logic. Note this in the rendered `.md` so the reader knows the diff has a blind spot.

### Step A: Collect raw material per tool

For each tool in `discovery.tools`, assemble:

```ts
toolMaterial = {
  name,
  descriptionSource,    // raw text from Phase 1
  inputSchemaSource,    // raw zod TS (vercel) or JSON Schema object (mcp)
  providerCall: {       // null for kind=mcp-http
    file,
    line,
    endpointHint,           // from Phase 1.5 Step A — e.g. "GET /search/users"
    surroundingLines,       // ±20 lines around providerFetchLine; captures clamping / branch / redirect logic
  } | null,
}
```

### Step B: Synthesize the diff (Claude inline, no subagent)

This is a one-shot synthesis task — do it directly in the command layer, no subagent. **One Claude call per tool** (don't batch — different tools have different sources). Prompt template:

```
You are a contract auditor. Three sources describe the same tool/API. List all material inconsistencies as a JSON array.

[SOURCE A — tool implementation]
- name: {toolName}
- description: {descriptionSource}
- inputSchema: {inputSchemaSource}
- provider call: {endpointHint or "N/A (mcp-http tool, no source visibility)"}
- code around the call (±20 lines): {surroundingLines or "N/A"}

[SOURCE B — official API documentation, {N} segment(s)]
{apiDocs.join("\n\n---\n\n") or "(not provided)"}

[SOURCE C — PRD]
{prd or "(not provided)"}

Scan along these 8 dimensions and emit one finding per material inconsistency:
  1. endpoint        — URL path / HTTP method
  2. params          — field set (missing in tool? missing in spec?)
  3. enums           — allowed value lists
  4. required        — required vs optional flag
  5. numeric_limit   — .min / .max / clamping boundaries
  6. error_mapping   — upstream status code → tool error code
  7. auto_behavior   — server-side redirect / normalization / injection documented by spec
  8. auth            — header / scope / token type

Rules:
- All three sources agree → NOT a finding, skip
- Tool stricter than official (e.g. lower .max) → severity=warn, note may be intentional
- Tool conflicts with official (wrong endpoint, missing error mapping, missing documented auto-behavior) → severity=error
- Spec or PRD mentions something tool doesn't implement → severity=error if silently wrong, severity=warn if tool actively rejects with a clear error
- A source doesn't mention a dimension → that source's field = null; still record the finding if the other two disagree
- No findings → return []

Output shape (JSON array, nothing else — no prose, no markdown fence):
[
  {
    "id": "f-001",                  // sequential f-NNN within this tool
    "dimension": "<one of the 8>",
    "field": "<param name / error code / null>",
    "severity": "error" | "warn" | "info",
    "tool": "<one-line description of tool side, or null if silent>",
    "spec": "<one-line description of official spec side, or null if silent>",
    "prd": "<one-line description of PRD side, or null if silent>",
    "summary": "<one-sentence Chinese summary of the divergence>",
    "recommendation": "<one-sentence Chinese fix suggestion>"
  }
]
```

### Step C: Truncation safeguards

Before sending to Claude, cap source sizes to keep the prompt manageable:
- `apiDocs` joined → 12 KB max (drop tail entries first; log which were truncated)
- `prd` → 8 KB max (truncate tail; log the cut)
- `surroundingLines` → already bounded by ±20 lines, no truncation needed

If truncation happened, append a one-line note to the `.md` output: `> ⚠️ Source X truncated to N KB — diff may have missed content past that point.`

### Step D: Persist outputs

Write two files in the standard report directory:

```
$QA_WORKSPACE_DIR/tests/reports/tool-probe/
├─ contract-diff-<runId>.json   ← structured findings (one object per tool: {tool, findings[]})
└─ contract-diff-<runId>.md     ← rendered Markdown for human consumption
```

JSON shape (multi-tool runs aggregate under one file):

```json
{
  "runId": "<runId>",
  "sources": { "toolCount": 2, "apiDocCount": 1, "prdProvided": true },
  "perTool": [
    {
      "tool": "github_search",
      "kind": "vercel-ai",
      "findings": [ /* array of finding objects from Step B */ ],
      "counts": { "error": 1, "warn": 2, "info": 0 }
    },
    {
      "tool": "github_lookup",
      "kind": "vercel-ai",
      "findings": [ ... ],
      "counts": { "error": 0, "warn": 1, "info": 1 }
    }
  ],
  "totals": { "error": 1, "warn": 3, "info": 1 }
}
```

Markdown template (one H2 section per tool):

```markdown
## 跨源契约 Diff (Static Analysis)

> 对比来源：工具源码 · 官方 API 文档（N 段）· PRD
> 总计 X 项差异：❌ Y errors / ⚠️ Z warnings / ℹ️ W info

### Tool: github_search

❌ 1 error / ⚠️ 2 warnings / ℹ️ 0 info

#### F-001 · auto_behavior — 未实现官方 user→org 跳转
| 来源 | 内容 |
|---|---|
| 工具 | type=user 且 404 时直接抛错 |
| 官方 | 同样请求会 302 redirect 到 /orgs/:login |
| PRD | （未提及）|
| **建议** | execute 内检测到 404 时重试 /orgs/:login |

#### F-002 · numeric_limit — per_page 上限被人为压低
...
```

If a tool's `findings` array is empty, render `✅ 三源一致，未发现契约不一致。` for that tool. If all tools have empty findings, the full `.md` is just that single line under the H2.

### Step E: Failure handling

- Claude returns malformed JSON → retry once with `Reply with valid JSON only — no prose, no markdown fences`; if still bad, write a stub `.md` (`⚠️ Contract diff failed: <error>. See logs.`) and continue with the pipeline. **Never block.**
- Claude returns valid JSON but with extra prose around it → strip everything before the first `[` and after the last `]`, then parse
- Single tool synthesis fails but others succeed → still write the aggregated outputs; failed tool's section says `⚠️ Diff synthesis failed for this tool — see logs`
- All synthesis fails → write a stub `contract-diff-<runId>.md` noting the failure; pipeline continues to Phase 3

### Step F: Pipeline continuation

After Phase 2.5, proceed to Phase 3 unconditionally. The contract diff is **read-only** with respect to Phase 3 — it doesn't modify `cases-<runId>.json` or `config-<runId>.json`. Its only effect on the final output is the appended report section produced in Phase 6 Step A below.

## Phase 3: Dispatch tool-probe-orchestrator

`runId` was generated in Phase 0; reuse it. Launch the orchestrator agent (sonnet). The brief is **deliberately minimal** — the agent file (`.claude/agents/tool-probe-orchestrator.md`) holds the authoritative phase order (3a write config → 3b validator gate → 3c patch source) and the kind-skip rule for mcp-http. Don't duplicate that here.

```
You are tool-probe-orchestrator. First read .claude/agents/tool-probe-orchestrator.md, then skills/tool-probe/SKILL.md (Part A applies to vercel-ai only; Part B applies to both kinds).

Input:
- discovery: { tools: [...], prefix: "<prefix>" }   // Phase 1 output; each tool carries its own "kind"
- cases: [...]                                       // Phase 2 zod-validated cases
- confirmProbes: <bool>                              // from --confirm-probes (ignored when all tools are kind=mcp-http)
- runId: "<runId>"                                   // generated in Phase 0
- sourceProjectDir: "<abs path | null>"              // null when all tools are kind=mcp-http
- authEnvVar: "<env var name | null>"                // from .env's TOOL_PROBE_AUTH_ENV_VAR (vercel-ai mode only; null if unset)

Config schema (one entry per tool):
- kind=vercel-ai → { module, factory, descriptionExport }
- kind=mcp-http  → { serverUrl, authTokenEnv, toolName? }
See scripts/tool-probe/case-schema.ts for the authoritative zod definition.
Top-level fields the orchestrator must fill: { runId, sourceProjectDir, loggerModule, tools, authEnvVar, debugEnvVar, eventPrefix, cases, evidenceOutPath }.
  - authEnvVar = caller-provided value (no fabrication); leave null if caller passed null.

Phase 3 task summary (full ordering rules in your agent file):
  3a) Write config-<runId>.json
  3b) Run validate-cases.ts; exit ≠ 0 → return validationFailed:true, no patches
  3c) Patch source — only for kind=vercel-ai tools; mcp-http tools skipped entirely

Return on success: { validationFailed: false, patchedFiles[], skippedProbes[], configFile, evidenceFile, reportFile }
Return on validation failure: { validationFailed: true, patchedFiles: [], configFile, validatorOutput }
```

> Field naming alignment: brief returns `evidenceFile` / `reportFile` (was `evidenceTarget` / `reportTarget` in an earlier draft) — matches Phase 6's final return shape. Pass-through without rename.

**Confirm-probes short-circuit**: if `--confirm-probes` was set (vercel-ai only) and the agent returns a plan, surface it and exit so the user can rerun without the flag.

**Validator short-circuit**: when `validationFailed=true`, print the validator's `issues[]` (errors first) and **skip Phase 4/5/6** — exit 0 with a clear message. No patches to clean up because Phase 3 ordering guarantees patches happen after validator passes.

## Phase 4: Execute Runner (skipped if `--dry-run`)

**Vercel-AI mode** — locate the source project's `.env` (e.g. `$SOURCE_PROJECT_DIR/apps/mira-work/.env` for monorepos, or `$SOURCE_PROJECT_DIR/.env` for flat projects):

```sh
<PREFIX>_TOOL_DEBUG=1 \
bun --env-file=<abs-path-to-source-env> \
  $QA_WORKSPACE_DIR/scripts/tool-probe/runner.ts \
  --config $QA_WORKSPACE_DIR/tests/reports/tool-probe/config-<runId>.json
```

**MCP-HTTP mode** — no source `.env`; the auth env var (from `--mcp-auth-env`) must be present in the shell:

```sh
<MCP_AUTH_ENV_NAME>=<token> \
bun $QA_WORKSPACE_DIR/scripts/tool-probe/runner.ts \
  --config $QA_WORKSPACE_DIR/tests/reports/tool-probe/config-<runId>.json
```

(No `--env-file` and no `<PREFIX>_TOOL_DEBUG=1` because there's no probe to gate.)

The runner internally:
- For vercel-ai tools: `process.chdir(sourceProjectDir)` + dynamic import + monkey-patch logger.
- For mcp-http tools: connect via MCP Client + `callTool(...)`. No chdir, no logger patch.
- DEBUG env (`cfg.debugEnvVar`) is **only enforced when ≥1 vercel-ai tool present**; MCP-only runs skip the gate.

It writes `evidence-<runId>.jsonl` and prints per-case progress. Failures inside the runner (e.g. one case threw) are captured into the evidence row's `threw` field — the runner does NOT exit on a single case failure. Only catastrophic errors (executor init failure, fs error) cause non-zero exit; surface those to the user but still continue to Phase 5 if the evidence file is partially populated.

## Phase 5: Execute Judge (skipped if `--dry-run`)

```sh
bun $QA_WORKSPACE_DIR/scripts/tool-probe/judge.ts \
  --evidence $QA_WORKSPACE_DIR/tests/reports/tool-probe/evidence-<runId>.jsonl \
  --report   $QA_WORKSPACE_DIR/tests/reports/tool-probe/report-<runId>.md
```

The judge runs all cases through `claude -p` (concurrency = `CLAUDE_JUDGE_CONCURRENCY`, default 1), then writes Markdown and **automatically appends a row to `$QA_WORKSPACE_DIR/tests/reports/combined/summary.md`** (between `<!-- tool-probe-runs:start -->` / `:end -->` markers — report-analyzer preserves this block when rewriting summary.md for E2E). It exits 0 regardless of individual verdicts — failure status lives in the per-run report.

**Judge-side debug artifacts**: if a `claude -p` call fails to parse JSON / returns rc≠0, judge.ts retries up to 3× with backoff. **Each failed attempt dumps the prompt + stdout + stderr to `$QA_WORKSPACE_DIR/tests/reports/tool-probe/.judge-debug/fail-<ts>-<id>-att<N>.log`** (override via env `CLAUDE_JUDGE_DEBUG_DIR`). If a verdict comes back as `💥 error` in the report, this dir is where the raw evidence of the judge's failure lives.

## Phase 6: Surface Report

### Step A: Append contract diff (if Phase 2.5 produced one)

If `contract-diff-<runId>.md` exists, append its content to `report-<runId>.md` so the final report is self-contained — runtime verdicts and static analysis in one file:

```sh
cat $QA_WORKSPACE_DIR/tests/reports/tool-probe/contract-diff-<runId>.md \
  >> $QA_WORKSPACE_DIR/tests/reports/tool-probe/report-<runId>.md
```

If Phase 2.5 was skipped (only 1 source), still append a one-line `## 跨源契约 Diff\n\nSkipped: only tool source available. Pass --api-doc and/or --prd to enable.\n` so readers know it was considered.

### Step B: Read & surface

Read the updated `report-<runId>.md`. Extract:
- Runtime summary line (counts of ✅ / ⚠️ / ❌ / 💥)
- Per-failure mini-summary (case name + 1-line reasoning)
- **Contract diff summary if present** (counts of ❌ / ⚠️ / ℹ️ and the top error finding)

Print to user. End with the absolute path of the full report and a note that the combined cross-pipeline summary has been updated at `$QA_WORKSPACE_DIR/tests/reports/combined/summary.md`.

**Final return** (always exit 0). `patchedFiles` may be empty in MCP mode; `contractDiff*` keys are `null` when Phase 2.5 was skipped:

```json
{
  "mode": "vercel-ai | mcp-http",
  "patchedFiles": ["apps/.../github-search.ts", "packages/.../github-client.ts"],
  "configFile":      "$QA_WORKSPACE_DIR/tests/reports/tool-probe/config-<runId>.json",
  "evidenceFile":    "$QA_WORKSPACE_DIR/tests/reports/tool-probe/evidence-<runId>.jsonl",
  "reportFile":      "$QA_WORKSPACE_DIR/tests/reports/tool-probe/report-<runId>.md",
  "contractDiffFile": "$QA_WORKSPACE_DIR/tests/reports/tool-probe/contract-diff-<runId>.md",
  "contractDiff":     { "error": 1, "warn": 3, "info": 1 },
  "combinedSummary": "$QA_WORKSPACE_DIR/tests/reports/combined/summary.md",
  "summary": { "total": 24, "pass": 19, "partial": 2, "fail": 2, "error": 1 },
  "failures": [
    { "name": "search-repo-sort-by-stars", "reasoning": "items[2].stars > items[1].stars — sort not honored" }
  ],
  "topContractFinding": {
    "id": "f-001",
    "tool": "github_search",
    "dimension": "auto_behavior",
    "severity": "error",
    "summary": "未实现官方 user→org 跳转"
  }
}
```

For MCP mode, the same shape applies with `mode: "mcp-http"`, `patchedFiles: []`, and evidence rows containing only `tool.input` + `tool.output` (no `provider.*` log entries).

### Triage guide — what to do with each verdict

| Verdict | Likely cause | What to do |
|---|---|---|
| ✅ `pass` | Tool behaved as expected | Nothing |
| 🟡 `partial_expected` | Case was authored with `acceptPartialAsPass: true`; judge had to guess but it's documented as acceptable | Nothing, but periodically review whether the case can be tightened |
| ⚠️ `partial` | Evidence didn't fully verify the judge focus point | **Read `judgeFocus` + evidence in `report-<runId>.md`**. Usually means either (a) the case input doesn't exercise the focus condition strongly enough — refine the case; or (b) provider logs are sparse — add more inputs |
| ❌ `fail` | Three possibilities — distinguish before filing a bug | See decision tree below |
| 💥 `error` | judge.ts retries exhausted (claude CLI failed to return parseable JSON) | Inspect `.judge-debug/fail-*.log` from Phase 5; usually a transient claude CLI issue — re-run just judge.ts (or the full pipeline) |

**`fail` decision tree** — before filing a product bug, classify it:

1. **Read the failing case's `judgeFocus` + reasoning + evidence** in `report-<runId>.md`
2. Ask in this order:
   - **Is the tool actually broken?** Pattern: judge cites concrete violations from logs (e.g. "items[2].stars > items[1].stars — sort:stars not honored"). The evidence speaks for itself → **product bug**, file/escalate.
   - **Is the case wrong?** Pattern: the case asserts something the tool never promised (e.g. expected a field that's not in the inputSchema, or set `expect: tool_error` for a happy-path input). Look at the case in `cases-<runId>.json` → **case bug**, refine in next ideation pass.
   - **Is the judge misreading?** Pattern: judge reasoning doesn't match what the evidence actually shows (e.g. claims a field is missing that's clearly present, or applies criteria not in `judgeFocus`). Rare — usually transient model variance → **rerun judge.ts on the same evidence**; if it persists, sharpen `judgeFocus` or set `acceptPartialAsPass: true` on cases where the judge can't be sure.
3. Re-run after each fix uses the **same** `cases-<runId>.json` so the diff is comparable — this is why Phase 2 persists cases to disk.
