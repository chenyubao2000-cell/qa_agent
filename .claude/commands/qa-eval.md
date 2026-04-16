---
description: "LLM Eval评估：构建eval dataset -> 执行LLM-as-Judge评分 -> 趋势分析 -> 退化告警"
allowed-tools: Agent, Bash, Read, Write, Grep, Glob, WebFetch
---

You are an LLM evaluation orchestrator. Do not generate test cases or execute E2E tests — only build eval datasets, run LLM-as-Judge scoring, and detect prompt regressions.

```
/qa-eval [--mode build|run|regression] [--project <langfuse-project>] [--days <N>]
     |
Phase 0: Load eval config (.env -> Langfuse credentials)
     |
Phase 1: Execute selected mode
         mode=build    -> eval-agent mode 1 -> export traces -> build dataset
         mode=run      -> eval-agent mode 2 -> LLM-as-Judge scoring -> report
         mode=regression -> eval-agent mode 3 -> prompt diff -> impact assessment
```

## Phase 0: Load Eval Config

```
Read(".env")
```

Extract required variables:
- `LANGFUSE_HOST` — Langfuse API endpoint (e.g., `https://cloud.langfuse.com`)
- `LANGFUSE_PUBLIC_KEY` — Langfuse public API key
- `LANGFUSE_SECRET_KEY` — Langfuse secret API key

Optional:
- `EVAL_BASELINE_FILE` — custom baseline path (default: `eval-reports/baseline.json`)
- `EVAL_LATENCY_THRESHOLD_MS` — latency threshold in ms (default: 30000)
- `QA_WORKSPACE_DIR` — workspace root for output paths

If `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, or `LANGFUSE_SECRET_KEY` are missing:
- Report: "Missing Langfuse credentials in .env. Required: LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY"
- Abort

### Parse Arguments from $ARGUMENTS

```
--mode build|run|regression    (default: run)
--project <name>               (optional: Langfuse project filter)
--days <N>                     (default: 7, only for mode=build)
--dataset <path>               (optional: specific dataset file for mode=run)
--baseline <path>              (optional: override baseline file)
```

Natural language parsing:

| Input | Parsed as |
|-------|-----------|
| `构建` / `build` / `导出` | mode=build |
| `评分` / `run` / `执行` / `评估` | mode=run |
| `回归` / `regression` / `对比` | mode=regression |
| `最近3天` / `3 days` | days=3 |
| `项目 my-project` | project=my-project |

### Ensure Output Directories

```bash
mkdir -p eval-datasets eval-reports
```

## Phase 1: Execute Selected Mode

### Mode: build — Build Eval Dataset

Launch eval-agent (sonnet):

```
You are eval-agent. First read .claude/agents/eval-agent.md to understand your full responsibilities.

Input:
- mode: "build"
- langfuseHost: "{LANGFUSE_HOST}"
- langfusePublicKey: "{LANGFUSE_PUBLIC_KEY}"
- langfuseSecretKey: "{LANGFUSE_SECRET_KEY}"
- project: "{parsed --project or null}"
- days: {parsed --days or 7}

Execute Mode 1 per .claude/agents/eval-agent.md:
1. Fetch traces from Langfuse API
2. Extract input/output/tool_calls/metadata
3. Generate rubric annotation templates
4. Output JSONL to eval-datasets/

Return dataset file path and entry count.
```

After eval-agent completes:

```
Dataset Built:
- Entries: {count}
- Output: eval-datasets/{filename}.jsonl
- Annotations: eval-datasets/{filename}-annotations.jsonl
- Date range: {startDate} ~ {endDate}

Next step: Run `/qa-eval --mode run --dataset eval-datasets/{filename}.jsonl` to score.
```

### Mode: run — Execute LLM-as-Judge Scoring

Resolve dataset file:
1. If `--dataset` provided → use that path
2. Else → find latest `.jsonl` in `eval-datasets/` (by modification time, exclude `-annotations.jsonl`)
3. If no dataset found → report "No eval dataset found. Run `/qa-eval --mode build` first." and abort

Launch eval-agent (sonnet):

```
You are eval-agent. First read .claude/agents/eval-agent.md to understand your full responsibilities.

Input:
- mode: "run"
- datasetPath: "{resolved dataset path}"
- baselineFile: "{EVAL_BASELINE_FILE or eval-reports/baseline.json}"
- langfuseHost: "{LANGFUSE_HOST}"
- langfusePublicKey: "{LANGFUSE_PUBLIC_KEY}"
- langfuseSecretKey: "{LANGFUSE_SECRET_KEY}"

Execute Mode 2 per .claude/agents/eval-agent.md:
1. Load dataset
2. LLM-as-Judge scoring (use Claude Batch API for cost optimization)
3. Aggregate scores per dimension
4. Compare against baseline, detect degradations
5. Output report

Return scored report path and degradation alerts.
```

After eval-agent completes:

```
Eval Report:
- Entries scored: {count}
- Report: eval-reports/eval-{date}.json
- Summary: eval-reports/eval-{date}.md

Score Summary:
| Dimension | Mean | Median | Status |
|-----------|------|--------|--------|
| accuracy  | X.X  | X      | OK/WARN/DEGRADED |
| safety    | X.X  | X      | OK/WARN/DEGRADED |
| format    | X.X  | X      | OK/WARN/DEGRADED |
| tool_use  | X.X  | X      | OK/WARN/DEGRADED |
| latency   | XX%  | -      | OK/WARN/DEGRADED |

{If degradations exist:}
DEGRADATION ALERT:
- {dimension}: dropped {pct}% from baseline ({baseline} -> {current})
```

### Mode: regression — Prompt Regression Detection

Launch eval-agent (sonnet):

```
You are eval-agent. First read .claude/agents/eval-agent.md to understand your full responsibilities.

Input:
- mode: "regression"
- baselineFile: "{EVAL_BASELINE_FILE or eval-reports/baseline.json}"
- langfuseHost: "{LANGFUSE_HOST}"
- langfusePublicKey: "{LANGFUSE_PUBLIC_KEY}"
- langfuseSecretKey: "{LANGFUSE_SECRET_KEY}"
- promptFiles: [list of .md files in .claude/agents/, .claude/commands/, skills/]

Execute Mode 3 per .claude/agents/eval-agent.md:
1. Detect prompt file changes (git diff)
2. Re-score sample entries with current prompts
3. Compare against baseline
4. Produce impact assessment report

Return regression report path and impact summary.
```

After eval-agent completes:

```
Prompt Regression Report:
- Changed files: {count}
- Report: eval-reports/regression-{date}.md

Impact Summary:
| Dimension | Before | After | Delta | Impact |
|-----------|--------|-------|-------|--------|
| ...       | ...    | ...   | ...   | ...    |

{If no changes detected:}
No prompt file changes detected since last eval. Skipping regression analysis.

{If degradation detected:}
ACTION REQUIRED: Prompt changes caused quality regression in: {dimensions}
Review: eval-reports/regression-{date}.md
```

## Output Files

All outputs are written relative to `QA_WORKSPACE_DIR` (or current directory):

| Mode | Output |
|------|--------|
| build | `eval-datasets/{project}-{date}.jsonl` + `*-annotations.jsonl` |
| run | `eval-reports/eval-{date}.json` + `eval-reports/eval-{date}.md` |
| regression | `eval-reports/regression-{date}.md` |
| (shared) | `eval-reports/baseline.json` — updated when quality is stable |
