/* eslint-disable no-console */
/**
 * Tool-probe LLM judge — shells out to local `claude` CLI. Generic, lives in qa_agent.
 *
 * Usage:
 *   bun scripts/tool-probe/judge.ts \
 *     --evidence tests/reports/tool-probe/evidence-<id>.jsonl \
 *     --report   tests/reports/tool-probe/report-<id>.md
 *
 * Env:
 *   JUDGE_LANG=zh|en              reason language (default zh)
 *   CLAUDE_JUDGE_CONCURRENCY=1    parallel `claude -p` subprocesses (default 1; parallel breaks
 *                                 inside Claude Code sessions — exit 9)
 *   CLAUDE_JUDGE_TIMEOUT=240      per-call timeout (s)
 *   CLAUDE_JUDGE_DEBUG_DIR=...    failure dump dir (default <reportDir>/.judge-debug)
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Verdict schema — field order MATTERS (reasoning before verdict, so the model
// thinks before concluding; Anthropic's recommended structured-output pattern).
const verdictSchema = z.object({
  reasoning: z.string().describe("2-4 sentences citing specific log evidence. End with a conclusion."),
  issues: z.array(z.string()).describe("Concrete issues found. Empty array if none."),
  verdict: z.enum(["pass", "partial", "fail"]),
  confidence: z.enum(["high", "medium", "low"]),
});
type Verdict = z.infer<typeof verdictSchema>;

const TIMEOUT_S = Number(process.env.CLAUDE_JUDGE_TIMEOUT ?? "240");
const MAX_RETRIES = 3;
const BACKOFF_MS = 2000;
// Default 1: parallel `claude -p` invoked from inside a Claude Code session contends
// with the parent session; the bun process gets killed (exit 9).
const CONCURRENCY = Number(process.env.CLAUDE_JUDGE_CONCURRENCY ?? "1");
const REASON_LANG = (process.env.JUDGE_LANG ?? "zh").toLowerCase();

const JUDGE_SYSTEM = `You are evaluating whether a tool behaved correctly for a test case.

You will be given:
1. Tool description (what it promises to do)
2. Test case intent + judge focus
3. Expected outcome (ok / tool_error, optionally with an error code)
4. Captured logs from every step: tool.input, provider.request (URL + query), provider.response (RAW data, BEFORE shaping), tool.output (final shaped value the LLM would see), any thrown error

You must determine:
- Did the tool honor qualifiers / sort / filters?
- Did auto-behaviors (injections, redirects, clamps) fire when expected?
- For error cases: correct error code? message LLM-actionable?
- For local-validation errors: NO provider call (short-circuited correctly)?

Verdict scale:
- pass: behavior fully matches expectation
- partial: mostly works OR evidence insufficient to fully verify focus point
- fail: clear bug (wrong code, ignored qualifier, wrong shape, sort violated, etc.)

Be specific. Cite evidence by quoting log fields. Don't say "looks fine" without naming what you checked.`;

const LANG_ZH = `

---
OUTPUT LANGUAGE: 请用简体中文撰写 reasoning / issues 自由文本。
硬性约束：JSON 键名（reasoning/issues/verdict/confidence）与枚举值（pass/partial/fail/high/medium/low）必须保持英文；仅返回一个合法 JSON 对象，无 prose、无 markdown 围栏。`;

interface EvidenceRow {
  name: string;
  tool: string;
  toolDescription: string;
  description: string;
  expect: "ok" | "tool_error";
  expectErrorCode?: string | null;
  judgeFocus?: string;
  acceptPartialAsPass?: boolean;
  evidence: { steps: Array<{ input: Record<string, unknown>; output: unknown; logs: Array<{ event: string; data: Record<string, unknown> }>; threw?: string }> };
}

const VERDICT_SCHEMA_JSON = {
  type: "object",
  required: ["reasoning", "issues", "verdict", "confidence"],
  properties: {
    reasoning: { type: "string" },
    issues: { type: "array", items: { type: "string" } },
    verdict: { type: "string", enum: ["pass", "partial", "fail"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

function buildPrompt(row: EvidenceRow): string {
  const body = [
    JUDGE_SYSTEM,
    "",
    `# Tool description`,
    "",
    row.toolDescription,
    "",
    `# Test case: ${row.name}`,
    `Tool: ${row.tool}`,
    `Intent: ${row.description}`,
    `Expected: ${row.expect}${row.expectErrorCode ? ` (code: ${row.expectErrorCode})` : ""}`,
    `Judge focus: ${row.judgeFocus ?? "(none — general correctness)"}`,
    row.acceptPartialAsPass ? `Note: this case is allowed to resolve as "partial" if evidence is insufficient — documented and acceptable.` : "",
    "",
    `# Evidence`,
    "```json",
    JSON.stringify(row.evidence, null, 2),
    "```",
    "",
    "---",
    "Respond with ONLY one JSON object matching the schema below. No prose, no markdown fences.",
    "",
    "JSON Schema:",
    JSON.stringify(VERDICT_SCHEMA_JSON, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
  return REASON_LANG.startsWith("zh") ? body + LANG_ZH : body;
}

const FENCE_RE = /^```(?:json)?\s*|\s*```$/gm;

function extractJson(text: string): string {
  const t = text.replace(FENCE_RE, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  return s >= 0 && e > s ? t.slice(s, e + 1) : t;
}

function dumpFail(debugDir: string, prompt: string, stdout: string, stderr: string, err: string, attempt: number): void {
  try {
    mkdirSync(debugDir, { recursive: true });
    const f = path.join(
      debugDir,
      `fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-att${attempt}.log`,
    );
    writeFileSync(
      f,
      `=== ERROR ===\n${err}\n\n=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}\n\n=== PROMPT ===\n${prompt}\n`,
      "utf-8",
    );
  } catch {
    /* best-effort */
  }
}

function callClaudeOnce(prompt: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["-p"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf-8");
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf-8");
    });
    const killer = setTimeout(() => proc.kill("SIGKILL"), TIMEOUT_S * 1000);
    proc.on("close", (code) => {
      clearTimeout(killer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

type JudgeResult =
  | { verdict: "pass" | "partial" | "fail"; reasoning: string; issues: string[]; confidence: "high" | "medium" | "low" }
  | { verdict: "error"; reasoning: string; issues: []; confidence: "low" };

async function judgeOne(row: EvidenceRow, debugDir: string): Promise<JudgeResult> {
  const prompt = buildPrompt(row);
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { code, stdout, stderr } = await callClaudeOnce(prompt);
    if (code === 0) {
      try {
        return verdictSchema.parse(JSON.parse(extractJson(stdout)));
      } catch (e) {
        lastErr = `parse: ${e instanceof Error ? e.message : String(e)}; raw=${stdout.slice(0, 300)}`;
        dumpFail(debugDir, prompt, stdout, stderr, lastErr, attempt);
      }
    } else {
      lastErr = `rc=${code}; stderr=${stderr.slice(0, 300)}`;
      dumpFail(debugDir, prompt, stdout, stderr, lastErr, attempt);
    }
    if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, BACKOFF_MS));
  }
  return { verdict: "error", reasoning: lastErr, issues: [], confidence: "low" };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

function effectiveStatus(row: EvidenceRow, v: JudgeResult): "pass" | "partial_expected" | "partial" | "fail" | "error" {
  if (v.verdict === "error") return "error";
  if (v.verdict === "pass") return "pass";
  if (v.verdict === "partial") return row.acceptPartialAsPass ? "partial_expected" : "partial";
  return "fail";
}

const STATUS_EMOJI: Record<string, string> = {
  pass: "✅",
  partial_expected: "🟡",
  partial: "⚠️",
  fail: "❌",
  error: "💥",
};

function renderReport(rows: EvidenceRow[], verdicts: JudgeResult[], started: string, finished: string): string {
  const counts = { pass: 0, partial_expected: 0, partial: 0, fail: 0, error: 0 };
  rows.forEach((r, i) => {
    const s = effectiveStatus(r, verdicts[i]!);
    counts[s]++;
  });

  const summary = rows
    .map((r, i) => {
      const v = verdicts[i]!;
      const s = effectiveStatus(r, v);
      const conf = v.verdict === "error" ? "-" : v.confidence;
      return `| ${i + 1} | \`${r.name}\` | ${r.tool} | ${STATUS_EMOJI[s]} ${s} | ${conf} | ${v.issues.length} |`;
    })
    .join("\n");

  const details = rows
    .map((r, i) => {
      const v = verdicts[i]!;
      const s = effectiveStatus(r, v);
      const issues = v.issues.length ? v.issues.map((x) => `- ${x}`).join("\n") : "_None_";
      return [
        `### [${i + 1}] ${r.name} — ${STATUS_EMOJI[s]} ${s}`,
        ``,
        `**Tool:** \`${r.tool}\`  \n**Intent:** ${r.description}  \n**Expected:** ${r.expect}${r.expectErrorCode ? ` (code: \`${r.expectErrorCode}\`)` : ""}`,
        ``,
        `**Judge focus:**`,
        ``,
        `> ${(r.judgeFocus ?? "(none)").replace(/\n/g, "\n> ")}`,
        ``,
        `**Reasoning:**`,
        ``,
        `> ${v.reasoning.replace(/\n/g, "\n> ")}`,
        ``,
        `**Issues:**`,
        ``,
        issues,
        ``,
        `<details><summary>Evidence</summary>`,
        ``,
        "```json",
        JSON.stringify(r.evidence, null, 2),
        "```",
        ``,
        `</details>`,
        ``,
        `---`,
      ].join("\n");
    })
    .join("\n\n");

  const effectivePass = counts.pass + counts.partial_expected;

  return [
    `# Tool-Probe Report`,
    ``,
    `- Started: ${started}`,
    `- Finished: ${finished}`,
    `- Judge: \`claude -p\` (local CLI)`,
    `- Cases: ${rows.length}`,
    `- Effective pass: ${effectivePass} (✅ ${counts.pass} + 🟡 ${counts.partial_expected})`,
    `- Real partial: ${counts.partial}  ❌ Fail: ${counts.fail}  💥 Judge error: ${counts.error}`,
    ``,
    `Legend: ✅ pass | 🟡 partial-expected | ⚠️ partial | ❌ fail | 💥 judge error`,
    ``,
    `## Summary`,
    ``,
    `| # | Case | Tool | Status | Confidence | Issues |`,
    `| - | ---- | ---- | ------ | ---------- | ------ |`,
    summary,
    ``,
    `## Details`,
    ``,
    details,
  ].join("\n");
}

function parseArgs(): { evidence: string; report: string } {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = args[i + 1] ?? "";
  }
  if (!out.evidence || !out.report) {
    console.error("Usage: bun judge.ts --evidence <jsonl> --report <md>");
    process.exit(2);
  }
  return { evidence: out.evidence, report: out.report };
}

async function main(): Promise<void> {
  const { evidence: evidencePath, report: reportPath } = parseArgs();
  const rows = readFileSync(evidencePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvidenceRow);

  const debugDir =
    process.env.CLAUDE_JUDGE_DEBUG_DIR ?? path.join(path.dirname(reportPath), ".judge-debug");

  const started = new Date().toISOString();
  console.log(`⚖️  Judging ${rows.length} cases, concurrency=${CONCURRENCY} ...`);

  const verdicts = await pool(rows, CONCURRENCY, async (r, i) => {
    const v = await judgeOne(r, debugDir);
    const tag = v.verdict === "error" ? "💥 error" : `${v.verdict} (${v.confidence})`;
    console.log(`  [${i + 1}/${rows.length}] ${r.name}: ${tag}`);
    return v;
  });

  const finished = new Date().toISOString();
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderReport(rows, verdicts, started, finished), "utf-8");

  const counts = { pass: 0, partial_expected: 0, partial: 0, fail: 0, error: 0 };
  rows.forEach((r, i) => {
    const s = effectiveStatus(r, verdicts[i]!);
    counts[s]++;
  });

  console.log(`\n✓ Report: ${reportPath}`);
  console.log(
    `   ✅ ${counts.pass}  🟡 ${counts.partial_expected}  ⚠️ ${counts.partial}  ❌ ${counts.fail}  💥 ${counts.error}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("judge.ts threw:", err);
  process.exit(2);
});
