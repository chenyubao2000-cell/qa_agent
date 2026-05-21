---
name: Tool Probe
description: 工具白盒探针单 skill——内联 4 桩 (tool.input / tool.output / provider.request / provider.response, 全部 gated) + 写 1 份 JSON 配置 → qa_agent 内置的通用 runner.ts / judge.ts 完成执行 + 裁决。源项目零文件污染（除桩外）。
version: 1.0.0
author: qa-platform
allowed_tools: [Read, Write, Edit, Grep, Glob, Bash]
license: MIT
testingTypes: [white-box, llm-judge, observability]
frameworks: [vercel-ai-sdk, bun]
languages: [typescript]
domains: [tool-instrumentation, tool-testing]
agents: [claude-code]
---

# Tool Probe Skill

One-stop guide for `/qa-tool-probe`. Split into two parts:

- **Part A — Instrumentation**: where to insert the 4 probes (4 inline gated lines + at most one new `logger` import per file). No helper module.
- **Part B — Config & Execution**: write 1 JSON config; the command layer runs qa_agent's pre-built `scripts/tool-probe/runner.ts` and `scripts/tool-probe/judge.ts`. No template substitution; no scripts written into the source project.

The orchestrator agent (`.claude/agents/tool-probe-orchestrator.md`) reads this end-to-end before doing any work.

## Output Language

Code, log keys, and event names: **English**. Reason text in the final report is controlled by `JUDGE_LANG` (default `zh`).

---

# Part A — Instrumentation

## Inputs

| Input | Required | Description |
|------|------|------|
| `sourceProjectDir` | YES | Absolute path of the source project |
| Per-tool discovery `{ toolFile, executeStart, executeEnd, toolName }` | YES | From command Phase 1 |
| Per-provider discovery `{ providerFile, providerFetchLine, providerResponseLine }` | If `hasProvider` | From command Phase 1 |
| `prefix` | YES | Short identifier (e.g. `gh`) for env var name and event prefix |

## The 4 Probes (specification — strict)

Inline a single-line gated `logger.info` at each probe site. **Do NOT create a helper file.**

```ts
if (process.env.<PREFIX>_TOOL_DEBUG === "1") logger.info("[<prefix>-debug] <stage>", { event: "<prefix>-debug.<stage>", ...data });
```

Where `<stage>` ∈ `{ tool.input, tool.output, provider.request, provider.response }`.

### Logger import — one line at the top of each patched file

| Detect | Use |
|---|---|
| File already imports a `logger` | Reuse it (no new import) |
| Same package has a logger module (`Grep("export.*logger", <pkg>)`) | Add `import { logger } from "<path>"` |
| Project monorepo has a shared observability package | Import from there |
| Nothing found | Fall back to `console.log` inline (still gated); leave a TODO comment |

Examples observed in mira:
- `apps/mira-work/lib/ai/tools/*.ts` → `import { logger } from "@/lib/logger/logger";`
- `packages/sourcing/src/providers/**/*.ts` → `import { logger } from "@mira/observability/logger/server";`

If multiple files in the same package use different loggers, each file imports its own — do NOT unify them.

### Probe 1: `tool.input`

**Where**: First executable line inside `execute` body (skip blank lines, comments, JSDoc).

```ts
execute: async (input: SomeInput): Promise<SomeOutput> => {
  if (process.env.<PREFIX>_TOOL_DEBUG === "1") logger.info("[<prefix>-debug] tool.input", { event: "<prefix>-debug.tool.input", tool: "<toolName>", input });
  // ↑ inserted, original first line follows ↓
  ...original code unchanged...
}
```

### Probe 2: `tool.output` (the critical one — IIFE wrap)

**Why IIFE**: a typical tool has multiple `return` statements. A single probe before the final return misses the early returns. Wrapping the body in an IIFE funnels every return through one point.

Transform:

```ts
execute: async (input: I): Promise<O> => {
  if (bad(input)) return makeError("...");
  try {
    const r = await provider.call(...);
    return shape(r);
  } catch (err) {
    return mapError(err);
  }
}
```

into:

```ts
execute: async (input: I): Promise<O> => {
  if (process.env.<PREFIX>_TOOL_DEBUG === "1") logger.info("[<prefix>-debug] tool.input", { event: "<prefix>-debug.tool.input", tool: "<toolName>", input });
  const result: O = await (async (): Promise<O> => {
    if (bad(input)) return makeError("...");
    try {
      const r = await provider.call(...);
      return shape(r);
    } catch (err) {
      return mapError(err);
    }
  })();
  if (process.env.<PREFIX>_TOOL_DEBUG === "1") logger.info("[<prefix>-debug] tool.output", { event: "<prefix>-debug.tool.output", tool: "<toolName>", result });
  return result;
}
```

**Rules**:
- IIFE's `Promise<O>` annotation must match the function's declared return type.
- If signature lacks an explicit return type, infer it, or fall back to `unknown` and cast.
- IIFE body is byte-for-byte identical to the original — don't touch any return path inside.
- `tool.input` probe stays OUTSIDE the IIFE so it fires unconditionally.

**Common failure mode**: forgetting `await` and `()` after the IIFE → Promise type mismatch.

### Probe 3: `provider.request`

**Where**: One line BEFORE `fetch(...)` (or equivalent), after URL/headers/body have been built but before the network call.

```ts
const url = buildUrl(...);
const headers = { Authorization: `token ${getToken()}` };
if (process.env.<PREFIX>_TOOL_DEBUG === "1") logger.info("[<prefix>-debug] provider.request", { event: "<prefix>-debug.provider.request", method, path, url, query });
const res = await fetch(url, { method, headers, body });
```

**Capture**: `method`, `path`, `url` (full), `query` (parsed). **Skip `headers`** — auth token leakage.

### Probe 4: `provider.response`

**Where**: AFTER the response body is parsed (`await res.json()`) AND after rate-limit / quota headers are read. NEVER before either.

```ts
const data = await res.json();
const rateLimitRemaining = Number(res.headers.get("x-ratelimit-remaining") ?? 0);
const rateLimitResetAt = Number(res.headers.get("x-ratelimit-reset") ?? 0);
if (process.env.<PREFIX>_TOOL_DEBUG === "1") logger.info("[<prefix>-debug] provider.response", { event: "<prefix>-debug.provider.response", statusCode: res.status, rateLimitRemaining, rateLimitResetAt, data });
```

**Capture**: `statusCode`, rate-limit / quota fields, full raw `data` (not the shaped output — the judge needs raw vs shaped).

## Insertion Workflow (per file)

1. `Read` the relevant region (10 lines around the anchor).
2. **Dedup**: `Grep` for `<prefix>-debug.<stage>` in the same function. If present, skip and record `"skipped": "existing log"`.
3. Confirm `logger` is in scope; add one import line at the top if missing.
4. Use `Edit` with a precise `old_string` anchored on a stable token (function signature, `fetch(` call). Never anchor on whitespace alone.
5. After patching, re-`Read` the patched region:
   - Braces balanced
   - Original code inside the IIFE unchanged
   - `logger` import present
6. If anything looks wrong, revert that `Edit` and report. Don't chain edits on a broken file.

## Instrumentation Constraints

- **Default off, zero overhead**: every probe is an inline `if (process.env...)` guard. Runtime cost = one env-var comparison.
- **No new files**: never create a helper module.
- **No backup**: user manages git.
- **Don't alter return semantics**: IIFE preserves every original return path.
- **Don't log secrets**: skip `Authorization` headers / cookies. URL query strings are OK.
- **Don't add a 5th probe**: if you find yourself wanting one, report the gap instead.
- **No tool tools description constants need `export`**: when a tool description constant is file-scoped (`const X = ...`), add `export` so qa_agent's runner can import it dynamically. This is the only logic-adjacent allowed change.

---

# Part B — Config & Execution (NO scripts written to source project)

The runner and judge live **once** in qa_agent at:

```
qa_agent/scripts/tool-probe/runner.ts          ← generic, dynamic-import driven
qa_agent/scripts/tool-probe/judge.ts           ← generic, shells out to `claude -p`
```

You only write **one JSON config file per invocation**, then the command layer runs the two scripts above with it. The config + evidence + report all live under qa_agent:

```
qa_agent/tests/reports/tool-probe/
  config-<runId>.json
  evidence-<runId>.jsonl
  report-<runId>.md
  .judge-debug/                    # judge failure dumps (auto)
```

`<runId>` = ISO timestamp with `:` and `.` replaced by `-`, e.g. `2026-05-21T08-22-43-114Z`.

## Config Schema (validated by runner via zod)

```ts
{
  runId: string;                                  // ISO timestamp, used in output filenames
  sourceProjectDir: string;                       // absolute path; runner does process.chdir() here
  loggerModule: string;                           // absolute path to source's logger .ts file (must export `logger`)
  tools: Record<string, {
    module: string;                               // absolute path to tool .ts
    factory: string;                              // export name of factory function
    descriptionExport: string;                    // export name of description constant
  }>;
  authEnvVar: string | null;                      // env var to override per-case (e.g. "GITHUB_API_TOKEN"); null = no override mechanism
  debugEnvVar: string;                            // e.g. "GH_TOOL_DEBUG" — runner refuses to start unless this is set to "1" in env
  eventPrefix: string;                            // e.g. "gh-debug" — what the monkey-patch listens for
  cases: TestCase[];
  evidenceOutPath: string;                        // absolute path where runner writes evidence JSONL
}

interface TestCase {
  name: string;
  tool: string;                                   // key into config.tools
  description: string;
  steps: Array<{ input: Record<string, unknown> }>;
  expect: "ok" | "tool_error";
  expectErrorCode?: string | null;
  judgeFocus?: string;                            // English, what the judge specifically verifies
  tokenOverride?: string | null;                  // string→replace authEnvVar; null→delete; undefined→leave alone
  acceptPartialAsPass?: boolean;
}
```

## How Runner Works (informational)

1. `process.chdir(cfg.sourceProjectDir)` → relative paths + tsconfig + workspaces resolve correctly inside dynamic-imported source files.
2. Dynamic `import(pathToFileURL(cfg.loggerModule).href)` → grab `logger`, monkey-patch its `.info()` to capture `<eventPrefix>.*` events into a per-case buffer.
3. Dynamic `import(...)` each tool module → pluck factory + description from named exports.
4. Sequential case loop with per-case auth env override, truncation (8 KB per field), JSONL append.

Order is critical: logger imported BEFORE tools, so the monkey-patch is in place when tools resolve `logger.info` at runtime (bun caches modules — subsequent imports see the patched copy).

## Evidence Row Schema (what runner emits per line)

```ts
{
  name: string;
  tool: string;
  toolDescription: string;        // full tool description (judge needs context)
  description: string;
  expect: "ok" | "tool_error";
  expectErrorCode?: string | null;
  judgeFocus?: string;
  acceptPartialAsPass?: boolean;
  evidence: {
    steps: Array<{
      input: Record<string, unknown>;
      output: unknown;            // shaped tool result OR null if it threw
      logs: Array<{ event: string; data: Record<string, unknown> }>;
      threw?: string;             // only if exec threw
    }>;
  };
}
```

Truncation: any object > 8192 chars JSON-encoded is replaced with `<first 8KB>"[truncated:N]"`. Applied to `output` and each `data` field. Inputs are never truncated.

## Verdict Schema (inlined in qa_agent/scripts/tool-probe/judge.ts)

```ts
z.object({
  reasoning: z.string(),                                     // 2-4 sentences, log-quoting
  issues: z.array(z.string()),
  verdict: z.enum(["pass", "partial", "fail"]),
  confidence: z.enum(["high", "medium", "low"]),
})
```

Field order is critical: `reasoning` BEFORE `verdict` so the model commits to a chain of thought before naming the conclusion. Don't reorder.

## Execution Contract (the command layer runs these)

```bash
# 1. Runner (depends on $SOURCE_ENV being passed via --env-file so source's .env applies)
$env:<DEBUG_ENV_VAR> = "1"
bun --env-file=<absolute-source-env-path> D:\work\code\qa_agent\scripts\tool-probe\runner.ts \
  --config D:\work\code\qa_agent\tests\reports\tool-probe\config-<runId>.json

# 2. Judge
bun D:\work\code\qa_agent\scripts\tool-probe\judge.ts \
  --evidence D:\work\code\qa_agent\tests\reports\tool-probe\evidence-<runId>.jsonl \
  --report   D:\work\code\qa_agent\tests\reports\tool-probe\report-<runId>.md
```

Both scripts exit 0 regardless of individual case outcomes. Failure status lives in the report.

## Generation Constraints (for agent — what NOT to do)

- **Do NOT write runner.ts or judge.ts into the source project.** Both already exist in qa_agent.
- **Do NOT use templates with placeholders** — the config IS the per-run input.
- **One file write per invocation**: the config JSON, period.
- **Concurrency**: judge defaults to `CLAUDE_JUDGE_CONCURRENCY=1` (env). Parallel `claude -p` from inside a Claude Code session breaks (exit 9). Sequential is safe.
- **Runner is sequential by design**: cases may share state via env-var overrides.
- **Token override is per-case**: handled inside runner.ts; agent just sets `tokenOverride` field in the case.
- **No network in the judge**: only `claude -p` subprocess + filesystem.
- **8 KB truncation per field**: handled inside runner.ts.
