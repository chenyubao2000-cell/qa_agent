/* eslint-disable no-console */
/**
 * White-box probe pipeline — validate → run cases → judge → Markdown report.
 *
 * Usage:
 *   bun runner.ts --config <file> --report <file>
 *
 * For vercel-ai tools: automatically loads <sourceProjectDir>/.env and enables
 * the debug env var — no external PREFIX_TOOL_DEBUG=1 or --env-file needed.
 *
 * MCP tool discovery is a separate pre-step: see discover.ts
 *
 * Env:
 *   JUDGE_LANG=zh|en              reason language (default zh)
 *   CLAUDE_JUDGE_CONCURRENCY=1    parallel claude -p processes (keep 1 inside Claude Code sessions)
 *   CLAUDE_JUDGE_TIMEOUT=240      per-call timeout (s)
 *   CLAUDE_JUDGE_DEBUG_DIR=...    failure dump dir
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// Schema
// ═══════════════════════════════════════════════════════════════════════════════

const stepSchema = z.object({
  input: z.record(z.string(), z.unknown()),
});

const caseSchema = z.object({
  name: z.string(),                                  // unique slug, kebab-case
  tool: z.string(),                                  // must match a key in config.tools
  description: z.string(),                           // one-line description
  steps: z.array(stepSchema).min(1),
  expect: z.enum(["ok", "tool_error"]),
  expectErrorCode: z.string().nullable().optional(), // when expect="tool_error"
  judgeFocus: z.string().optional(),                 // hint for judge (tool/mcp only)
  tokenOverride: z.union([z.string(), z.null()]).optional(),
  acceptPartialAsPass: z.boolean().optional(),
  // vercel-ai only: forwarded as the tool's `experimental_context` (2nd exec arg).
  // Lets cases simulate caller-provided session state (e.g. MiraContext.icpProfile)
  // that isn't part of the LLM-supplied `input` schema.
  context: z.record(z.string(), z.unknown()).optional(),
});

const casesArraySchema = z.array(caseSchema).min(1);

const vercelToolEntrySchema = z.object({
  kind: z.literal("vercel-ai"),
  module: z.string(),            // absolute path to tool .ts file
  factory: z.string(),           // export name of factory function
  descriptionExport: z.string(), // export name of description constant
  // Whether execute() makes an outbound provider/fetch call. Default true (existing
  // configs assume a provider). Set false for tools that delegate to internal
  // logic only — the judge is told NOT to penalize the resulting absence of
  // provider.request/provider.response evidence for those tools.
  hasProvider: z.boolean().optional(),
});

const mcpHttpToolEntrySchema = z.object({
  kind: z.literal("mcp-http"),
  serverUrl: z.string(),
  toolName: z.string().optional(),
  authTokenEnv: z.string().nullable().optional(),
});

const toolEntrySchema = z.preprocess(
  (v) => {
    if (v && typeof v === "object" && !("kind" in (v as Record<string, unknown>))) {
      return { kind: "vercel-ai", ...(v as Record<string, unknown>) };
    }
    return v;
  },
  z.discriminatedUnion("kind", [vercelToolEntrySchema, mcpHttpToolEntrySchema]),
);

const configSchema = z.object({
  runId: z.string(),
  sourceProjectDir: z.string(),
  loggerModule: z.string().nullable().optional(),
  tools: z.record(z.string(), toolEntrySchema),
  authEnvVar: z.string().nullable().optional(),
  debugEnvVar: z.string(),
  eventPrefix: z.string(),
  cases: casesArraySchema,
  evidenceOutPath: z.string(),
});

type TestCase = z.infer<typeof caseSchema>;
type ToolEntry = z.infer<typeof toolEntrySchema>;
type Config = z.infer<typeof configSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════════

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

function loadEnvFile(filePath: string): void {
  let content: string;
  try { content = readFileSync(filePath, "utf-8"); }
  catch { return; }
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eqIdx = t.indexOf("=");
    if (eqIdx < 1) continue;
    const key = t.slice(0, eqIdx).trim();
    let val = t.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Config validation
// ═══════════════════════════════════════════════════════════════════════════════

interface ValidationIssue {
  level: "error" | "warning";
  path: string;
  code: string;
  message: string;
}

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MANUAL_FILL_HINT = "requires manual input fill";

function validateConfig(rawConfig: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const parsed = configSchema.safeParse(rawConfig);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push({ level: "error", path: e.path.join("."), code: "schema", message: e.message });
    }
    return issues;
  }
  const cfg = parsed.data;

  // 1. Case name uniqueness
  const seen = new Map<string, number>();
  cfg.cases.forEach((c, i) => {
    const prior = seen.get(c.name);
    if (prior !== undefined) {
      issues.push({ level: "error", path: `cases[${i}].name`, code: "duplicate-name",
        message: `case name "${c.name}" already used at cases[${prior}]` });
    } else { seen.set(c.name, i); }
  });

  // 2. Kebab-case naming
  cfg.cases.forEach((c, i) => {
    if (!NAME_PATTERN.test(c.name))
      issues.push({ level: "warning", path: `cases[${i}].name`, code: "non-kebab-case",
        message: `case name "${c.name}" should be lowercase kebab-case` });
  });

  // 3. case.tool ∈ config.tools
  const toolKeys = new Set(Object.keys(cfg.tools));
  cfg.cases.forEach((c, i) => {
    if (!toolKeys.has(c.tool))
      issues.push({ level: "error", path: `cases[${i}].tool`, code: "unknown-tool",
        message: `case references tool "${c.tool}" not in config.tools (known: ${[...toolKeys].join(", ") || "<none>"})` });
  });

  // 4. tokenOverride sanity
  cfg.cases.forEach((c, i) => {
    if (c.tokenOverride === undefined) return;
    if (cfg.tools[c.tool]?.kind === "mcp-http")
      issues.push({ level: "warning", path: `cases[${i}].tokenOverride`, code: "token-override-not-supported-for-mcp",
        message: `case "${c.name}" sets tokenOverride but tool is mcp-http; use a separate tool entry with a different authTokenEnv` });
  });
  if (cfg.cases.some(c => c.tokenOverride !== undefined && cfg.tools[c.tool]?.kind === "vercel-ai") && !cfg.authEnvVar)
    issues.push({ level: "error", path: "authEnvVar", code: "missing-auth-env-var",
      message: "vercel-ai cases set tokenOverride but config.authEnvVar is null/missing" });

  // 5. vercel-ai without loggerModule → no probe capture (warning only; runner degrades gracefully)
  if (Object.values(cfg.tools).some(e => e.kind === "vercel-ai") && !cfg.loggerModule)
    issues.push({ level: "warning", path: "loggerModule", code: "missing-logger-module",
      message: "config contains vercel-ai tools but loggerModule is null/missing — probe events will not be captured" });

  // 6. mcp-http auth env (best-effort)
  for (const [name, entry] of Object.entries(cfg.tools)) {
    if (entry.kind !== "mcp-http") continue;
    if (entry.authTokenEnv && !process.env[entry.authTokenEnv])
      issues.push({ level: "warning", path: `tools.${name}.authTokenEnv`, code: "mcp-auth-env-unset",
        message: `tool "${name}" expects env var ${entry.authTokenEnv} but it is unset at validation time` });
  }

  // 7. Empty-input sanity
  cfg.cases.forEach((c, i) => {
    if (!c.steps.every(s => Object.keys(s.input).length === 0)) return;
    if (c.expect !== "tool_error" && !(c.judgeFocus ?? "").includes(MANUAL_FILL_HINT))
      issues.push({ level: "error", path: `cases[${i}].steps`, code: "empty-input-no-intent",
        message: `case "${c.name}" has empty input but expect="ok" with no manual-fill hint` });
  });

  // 8. expectErrorCode only when expect="tool_error"
  cfg.cases.forEach((c, i) => {
    if (c.expectErrorCode && c.expect !== "tool_error")
      issues.push({ level: "warning", path: `cases[${i}]`, code: "error-code-without-error-expect",
        message: `case "${c.name}" sets expectErrorCode but expect="ok" — will be ignored` });
  });

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Executors
// ═══════════════════════════════════════════════════════════════════════════════

const TRUNCATE_BYTES = 8192;

function truncateValue<T>(v: T): T {
  if (v == null) return v;
  if (typeof v !== "object" && typeof v !== "string") return v;
  const json = JSON.stringify(v);
  if (json.length <= TRUNCATE_BYTES) return v;
  return (json.slice(0, TRUNCATE_BYTES) + `[truncated:${json.length}]`) as unknown as T;
}

interface CapturedEvent { event: string; data: Record<string, unknown> }

function truncateLogPayload(ev: CapturedEvent): CapturedEvent {
  const data: Record<string, unknown> = { ...ev.data };
  for (const [k, val] of Object.entries(data)) {
    if (k === "event") continue;
    data[k] = truncateValue(val);
  }
  return { event: ev.event, data };
}

interface Executor {
  description: string;
  execute(input: Record<string, unknown>, context?: Record<string, unknown>): Promise<unknown>;
  close?(): Promise<void>;
}

type ExecFn = (input: unknown, opts: unknown) => Promise<unknown>;

async function createVercelExecutor(entry: Extract<ToolEntry, { kind: "vercel-ai" }>): Promise<Executor> {
  const mod = (await import(pathToFileURL(entry.module).href)) as Record<string, unknown>;
  const factory = mod[entry.factory] as (() => { execute?: ExecFn }) | undefined;
  const description = mod[entry.descriptionExport] as string | undefined;
  if (typeof factory !== "function") throw new Error(`${entry.module} does not export factory "${entry.factory}"`);
  if (typeof description !== "string") throw new Error(`${entry.module} does not export description "${entry.descriptionExport}"`);
  const tool = factory();
  const exec = tool.execute as ExecFn | undefined;
  if (!exec) throw new Error(`tool.execute undefined for kind=vercel-ai`);
  return {
    description,
    execute: async (input, context) => exec(input, { toolCallId: "test", messages: [], experimental_context: context }),
  };
}

async function createMcpHttpExecutor(toolKey: string, entry: Extract<ToolEntry, { kind: "mcp-http" }>): Promise<Executor> {
  const { Client } = (await import("@modelcontextprotocol/sdk/client/index.js")) as {
    Client: new (info: { name: string; version: string }, opts: { capabilities: Record<string, unknown> }) => {
      connect(t: unknown): Promise<void>;
      listTools(): Promise<{ tools: Array<{ name: string; description?: string }> }>;
      callTool(p: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
      close(): Promise<void>;
    };
  };
  const { StreamableHTTPClientTransport } = (await import("@modelcontextprotocol/sdk/client/streamableHttp.js")) as {
    StreamableHTTPClientTransport: new (url: URL, opts: { requestInit?: { headers?: Record<string, string> } }) => unknown;
  };

  const headers: Record<string, string> = {};
  if (entry.authTokenEnv) {
    const token = process.env[entry.authTokenEnv];
    if (!token) throw new Error(`kind=mcp-http tool "${toolKey}" expects auth env var ${entry.authTokenEnv} but it is unset`);
    headers["Authorization"] = `Bearer ${token}`;
  }
  const transport = new StreamableHTTPClientTransport(new URL(entry.serverUrl), { requestInit: { headers } });
  const client = new Client({ name: "qa-whitebox-runner", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  const remoteName = entry.toolName ?? toolKey;
  const { tools: remoteTools } = await client.listTools();
  const meta = remoteTools.find(t => t.name === remoteName);
  const description = meta?.description ?? `(MCP tool ${remoteName}; description unavailable)`;
  return {
    description,
    execute: async (input) => client.callTool({ name: remoteName, arguments: input }),
    close: async () => client.close(),
  };
}

async function buildExecutors(cfg: Config): Promise<Record<string, Executor>> {
  const executors: Record<string, Executor> = {};
  try {
    for (const [name, entry] of Object.entries(cfg.tools)) {
      if (entry.kind === "vercel-ai") executors[name] = await createVercelExecutor(entry);
      else if (entry.kind === "mcp-http") executors[name] = await createMcpHttpExecutor(name, entry);
      else { const _: never = entry; throw new Error(`unknown tool kind: ${JSON.stringify(_)}`); }
    }
  } catch (err) {
    // Close any executors already created before re-throwing
    for (const ex of Object.values(executors)) {
      if (ex.close) await ex.close().catch(() => undefined);
    }
    throw err;
  }
  return executors;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run cases
// ═══════════════════════════════════════════════════════════════════════════════

interface StepResult {
  input: Record<string, unknown>;
  output: unknown;
  logs: CapturedEvent[];
  threw?: string;
}

type ToolKind = "vercel-ai" | "mcp-http";

function makeErrorRow(c: TestCase, toolKind: ToolKind | null, toolDescription: string, threw: string): Record<string, unknown> {
  return { name: c.name, tool: c.tool, toolKind, toolDescription, description: c.description,
    expect: c.expect, expectErrorCode: c.expectErrorCode ?? null, judgeFocus: c.judgeFocus,
    acceptPartialAsPass: c.acceptPartialAsPass ?? false,
    evidence: { steps: [{ input: {}, output: null, logs: [], threw }] } };
}

async function runCases(cfg: Config): Promise<void> {
  const toolEntries = Object.entries(cfg.tools);
  const hasVercel = toolEntries.some(([, e]) => e.kind === "vercel-ai");

  let captureBuffer: CapturedEvent[] | null = null;
  let probeCapture = false;
  if (hasVercel) {
    process.chdir(cfg.sourceProjectDir);
    if (!cfg.loggerModule) {
      console.warn(`⚠ loggerModule not set — probe events will not be captured (tool output still collected)`);
    } else {
      try {
        type LoggerLike = Record<"info" | "warn" | "error", ((msg: string, ctx?: Record<string, unknown>) => void) | undefined>;
        const loggerMod = (await import(pathToFileURL(cfg.loggerModule).href)) as { logger: LoggerLike };
        const logger = loggerMod.logger;
        if (!logger || typeof logger.info !== "function") {
          console.warn(`⚠ ${cfg.loggerModule} has no .logger.info() — probe events will not be captured`);
        } else {
          // Probes always call logger.info() (see instrumentation.md §一), but patch
          // warn/error too — a probe snippet hand-edited or written by a different
          // convention may log at those levels, and silently dropping those events
          // is worse than the small cost of patching two more methods.
          for (const level of ["info", "warn", "error"] as const) {
            const original = logger[level];
            if (typeof original !== "function") continue;
            const bound = original.bind(logger);
            logger[level] = (msg: string, ctx?: Record<string, unknown>): void => {
              bound(msg, ctx);
              if (captureBuffer && ctx && typeof ctx.event === "string" && ctx.event.startsWith(`${cfg.eventPrefix}.`))
                captureBuffer.push({ event: ctx.event, data: ctx });
            };
          }
          probeCapture = true;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`⚠ Could not load loggerModule (${msg.slice(0, 120)}) — probe events will not be captured; tool output still collected`);
      }
    }
  }

  const executors = await buildExecutors(cfg);
  console.log(
    `🚀 Running ${cfg.cases.length} cases ` +
    `[vercel-ai: ${toolEntries.filter(([, e]) => e.kind === "vercel-ai").length}, ` +
    `mcp-http: ${toolEntries.filter(([, e]) => e.kind === "mcp-http").length}] ` +
    `→ ${cfg.evidenceOutPath}`,
  );

  mkdirSync(path.dirname(cfg.evidenceOutPath), { recursive: true });
  writeFileSync(cfg.evidenceOutPath, "", "utf-8");

  try {
    for (const [i, c] of cfg.cases.entries()) {
      console.log(`  [${i + 1}/${cfg.cases.length}] ${c.name} ...`);
      const ex = executors[c.tool];
      const entryMaybe = cfg.tools[c.tool];
      if (!ex || !entryMaybe) {
        appendFileSync(cfg.evidenceOutPath, JSON.stringify(makeErrorRow(c, entryMaybe?.kind ?? null, "", `unknown tool: ${c.tool}`)) + "\n", "utf-8");
        continue;
      }
      const entry = entryMaybe;
      const envVar = cfg.authEnvVar;
      const overrideApplies = entry.kind === "vercel-ai" && c.tokenOverride !== undefined && !!envVar;
      const tokenWasSet = envVar ? envVar in process.env : false;
      const originalToken = envVar ? process.env[envVar] : undefined;
      if (overrideApplies && envVar) {
        if (c.tokenOverride === null) delete process.env[envVar];
        else if (typeof c.tokenOverride === "string") process.env[envVar] = c.tokenOverride;
      }
      try {
        const stepResults: StepResult[] = [];
        for (const step of c.steps) {
          captureBuffer = probeCapture ? [] : null;
          let output: unknown = null;
          let threw: string | undefined;
          try { output = await ex.execute(step.input, c.context); }
          catch (err) { threw = err instanceof Error ? err.message : String(err); }
          const logs = (captureBuffer ?? []).map(truncateLogPayload);
          captureBuffer = null;
          stepResults.push({ input: step.input, output: truncateValue(output), logs, threw });
        }
        const row = { name: c.name, tool: c.tool, toolKind: entry.kind, toolDescription: ex.description,
          description: c.description, expect: c.expect, expectErrorCode: c.expectErrorCode ?? null,
          judgeFocus: c.judgeFocus, acceptPartialAsPass: c.acceptPartialAsPass ?? false,
          hasProvider: entry.kind === "vercel-ai" ? (entry.hasProvider ?? true) : undefined,
          evidence: { steps: stepResults } };
        appendFileSync(cfg.evidenceOutPath, JSON.stringify(row) + "\n", "utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`     runner error on ${c.name}: ${msg}`);
        appendFileSync(cfg.evidenceOutPath, JSON.stringify(makeErrorRow(c, entry.kind, ex.description, msg)) + "\n", "utf-8");
      } finally {
        if (overrideApplies && envVar) {
          if (tokenWasSet) process.env[envVar] = originalToken;
          else delete process.env[envVar];
        }
      }
    }
  } finally {
    for (const [name, ex] of Object.entries(executors)) {
      if (ex.close) {
        try { await ex.close(); }
        catch (err) { console.warn(`   ⚠ executor close failed for ${name}: ${err instanceof Error ? err.message : String(err)}`); }
      }
    }
  }
  console.log(`\n✓ Wrote ${cfg.cases.length} rows to ${cfg.evidenceOutPath}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Judge
// ═══════════════════════════════════════════════════════════════════════════════

const verdictSchema = z.object({
  reasoning: z.string(),
  issues: z.array(z.string()),
  verdict: z.enum(["pass", "partial", "fail"]),
  confidence: z.enum(["high", "medium", "low"]),
});
type Verdict = z.infer<typeof verdictSchema>;

const VERDICT_SCHEMA_JSON = {
  type: "object", required: ["reasoning", "issues", "verdict", "confidence"],
  properties: {
    reasoning: { type: "string" }, issues: { type: "array", items: { type: "string" } },
    verdict: { type: "string", enum: ["pass", "partial", "fail"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

const JUDGE_SYSTEM = `You are evaluating whether a tool behaved correctly for a test case.

You will be given:
1. Tool description (what it promises to do)
2. Evidence model — tells you which logs are available for this case
3. Test case intent + judge focus
4. Expected outcome (ok / tool_error, optionally with an error code)
5. Captured evidence — per-step inputs, outputs, and logs

You must determine:
- Did the tool honor the user's intent (qualifiers / sort / filters / auto-behaviors)?
- Does the output shape match what the tool description promises?
- For error cases: correct error code/shape? message actionable?
- For local-validation errors: NO outbound provider call?

Verdict scale:
- pass: behavior fully matches expectation
- partial: mostly works OR evidence insufficient to fully verify focus point
- fail: clear bug (wrong code, ignored qualifier, wrong shape, etc.)

Be specific. Cite evidence by quoting log fields.
Do NOT mark a case "fail" for evidence types the model declares unavailable.`;

const EVIDENCE_MODEL_WHITEBOX = `# Evidence model: WHITE-BOX (in-process Vercel AI SDK tool)
  - tool.input, provider.request, provider.response, tool.output
Use ALL four when judging. For local-validation errors there should be NO provider.request.`;

const EVIDENCE_MODEL_WHITEBOX_NO_PROVIDER = `# Evidence model: WHITE-BOX (in-process Vercel AI SDK tool, no outbound provider)
  - tool.input, tool.output only
This tool is declared hasProvider=false — it delegates to internal logic (calc/orchestration/local
lookup) and never calls an external provider directly. There are NO provider.request / provider.response
logs BY DESIGN. Do NOT mark fail or lower confidence for their absence.`;

const EVIDENCE_MODEL_MCP = `# Evidence model: BLACK-BOX (remote MCP-HTTP tool via JSON-RPC)
  - tool.input, tool.output only
There are NO provider.request / provider.response logs. Do NOT mark fail for their absence.`;

const LANG_ZH = `\n\n---\nOUTPUT LANGUAGE: 请用简体中文撰写 reasoning / issues。JSON 键名与枚举值必须保持英文。仅返回一个合法 JSON 对象，无 prose，无 markdown 围栏。`;

const FENCE_RE = /^```(?:json)?\s*|\s*```$/gm;
function extractJson(text: string): string {
  const t = text.replace(FENCE_RE, "").trim();
  const s = t.indexOf("{"); const e = t.lastIndexOf("}");
  return s >= 0 && e > s ? t.slice(s, e + 1) : t;
}

interface EvidenceRow {
  name: string; tool: string; toolKind?: ToolKind | null;
  toolDescription: string; description: string; expect: "ok" | "tool_error";
  expectErrorCode?: string | null; judgeFocus?: string; acceptPartialAsPass?: boolean;
  hasProvider?: boolean; // vercel-ai only; false = tool never calls an outbound provider (see EVIDENCE_MODEL_WHITEBOX_NO_PROVIDER)
  evidence: { steps: Array<{ input: Record<string, unknown>; output: unknown; logs: Array<{ event: string; data: Record<string, unknown> }>; threw?: string }> };
}

function buildPrompt(row: EvidenceRow, lang: string): string {
  const isMcp = row.toolKind === "mcp-http";
  const evidenceModel = isMcp
    ? EVIDENCE_MODEL_MCP
    : row.hasProvider === false
      ? EVIDENCE_MODEL_WHITEBOX_NO_PROVIDER
      : EVIDENCE_MODEL_WHITEBOX;
  const body = [
    JUDGE_SYSTEM, "", evidenceModel, "",
    `# Tool description`, "", row.toolDescription, "",
    `# Test case: ${row.name}`,
    `Tool: ${row.tool}${row.toolKind ? ` (kind=${row.toolKind})` : ""}`,
    `Intent: ${row.description}`,
    `Expected: ${row.expect}${row.expectErrorCode ? ` (code: ${row.expectErrorCode})` : ""}`,
    `Judge focus: ${row.judgeFocus ?? "(none — general correctness)"}`,
    row.acceptPartialAsPass ? `Note: "partial" is acceptable if evidence is insufficient.` : "",
    "", `# Evidence`, "```json", JSON.stringify(row.evidence, null, 2), "```", "",
    "---", "Respond with ONLY one JSON object. No prose, no markdown fences.", "",
    "JSON Schema:", JSON.stringify(VERDICT_SCHEMA_JSON, null, 2),
  ].filter(Boolean).join("\n");
  return lang.startsWith("zh") ? body + LANG_ZH : body;
}

function dumpFail(debugDir: string, prompt: string, stdout: string, stderr: string, err: string, attempt: number): void {
  try {
    mkdirSync(debugDir, { recursive: true });
    const f = path.join(debugDir, `fail-${Date.now()}-att${attempt}.log`);
    writeFileSync(f, `=== ERROR ===\n${err}\n\n=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}\n\n=== PROMPT ===\n${prompt}\n`, "utf-8");
  } catch { /* best-effort */ }
}

function callClaudeOnce(prompt: string, timeoutS: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const proc = spawn("claude", ["-p"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf-8"); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf-8"); });
    const killer = setTimeout(() => proc.kill("SIGKILL"), timeoutS * 1000);
    proc.on("close", code => { clearTimeout(killer); resolve({ code: code ?? -1, stdout, stderr }); });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

type JudgeResult = (Verdict) | { verdict: "error"; reasoning: string; issues: []; confidence: "low" };

async function judgeOne(row: EvidenceRow, debugDir: string, lang: string, timeoutS: number): Promise<JudgeResult> {
  const prompt = buildPrompt(row, lang);
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { code, stdout, stderr } = await callClaudeOnce(prompt, timeoutS);
    if (code === 0) {
      try { return verdictSchema.parse(JSON.parse(extractJson(stdout))); }
      catch (e) { lastErr = `parse: ${e instanceof Error ? e.message : String(e)}; raw=${stdout.slice(0, 300)}`; dumpFail(debugDir, prompt, stdout, stderr, lastErr, attempt); }
    } else {
      lastErr = `rc=${code}; stderr=${stderr.slice(0, 300)}`; dumpFail(debugDir, prompt, stdout, stderr, lastErr, attempt);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
  }
  return { verdict: "error", reasoning: lastErr, issues: [], confidence: "low" };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (true) { const i = cursor++; if (i >= items.length) return; out[i] = await fn(items[i]!, i); }
  }));
  return out;
}

function effectiveStatus(row: EvidenceRow, v: JudgeResult): "pass" | "partial_expected" | "partial" | "fail" | "error" {
  if (v.verdict === "error") return "error";
  if (v.verdict === "pass") return "pass";
  if (v.verdict === "partial") return row.acceptPartialAsPass ? "partial_expected" : "partial";
  return "fail";
}

const STATUS_EMOJI: Record<string, string> = { pass: "✅", partial_expected: "🟡", partial: "⚠️", fail: "❌", error: "💥" };

function renderReport(rows: EvidenceRow[], verdicts: JudgeResult[], started: string, finished: string): string {
  const counts = { pass: 0, partial_expected: 0, partial: 0, fail: 0, error: 0 };
  rows.forEach((r, i) => { const s = effectiveStatus(r, verdicts[i]!); counts[s]++; });
  const summary = rows.map((r, i) => {
    const v = verdicts[i]!; const s = effectiveStatus(r, v);
    return `| ${i + 1} | \`${r.name}\` | ${r.tool} | ${STATUS_EMOJI[s]} ${s} | ${v.verdict === "error" ? "-" : v.confidence} | ${v.issues.length} |`;
  }).join("\n");
  const details = rows.map((r, i) => {
    const v = verdicts[i]!; const s = effectiveStatus(r, v);
    return [
      `### [${i + 1}] ${r.name} — ${STATUS_EMOJI[s]} ${s}`, ``,
      `**Tool:** \`${r.tool}\`  \n**Intent:** ${r.description}  \n**Expected:** ${r.expect}${r.expectErrorCode ? ` (code: \`${r.expectErrorCode}\`)` : ""}`,
      ``, `**Judge focus:**`, ``, `> ${(r.judgeFocus ?? "(none)").replace(/\n/g, "\n> ")}`,
      ``, `**Reasoning:**`, ``, `> ${v.reasoning.replace(/\n/g, "\n> ")}`,
      ``, `**Issues:**`, ``, v.issues.length ? v.issues.map(x => `- ${x}`).join("\n") : "_None_",
      ``, `<details><summary>Evidence</summary>`, ``, "```json", JSON.stringify(r.evidence, null, 2), "```", ``, `</details>`, ``, `---`,
    ].join("\n");
  }).join("\n\n");
  return [
    `# Tool-Probe Report`, ``,
    `- Started: ${started}`, `- Finished: ${finished}`, `- Judge: \`claude -p\``, `- Cases: ${rows.length}`,
    `- Effective pass: ${counts.pass + counts.partial_expected} (✅ ${counts.pass} + 🟡 ${counts.partial_expected})`,
    `- Real partial: ${counts.partial}  ❌ Fail: ${counts.fail}  💥 Judge error: ${counts.error}`,
    ``, `Legend: ✅ pass | 🟡 partial-expected | ⚠️ partial | ❌ fail | 💥 judge error`, ``,
    `## Summary`, ``,
    `| # | Case | Tool | Status | Confidence | Issues |`, `| - | ---- | ---- | ------ | ---------- | ------ |`,
    summary, ``, `## Details`, ``, details,
  ].join("\n");
}

const TP_START = "<!-- tool-probe-runs:start -->";
const TP_END = "<!-- tool-probe-runs:end -->";

function appendToCombinedSummary(rows: EvidenceRow[], counts: Record<string, number>, started: string, finished: string, reportPath: string): void {
  const combinedPath = process.env.QA_WORKSPACE_DIR
    ? path.join(process.env.QA_WORKSPACE_DIR, "tests", "reports", "combined", "summary.md")
    : path.join(path.dirname(path.dirname(reportPath)), "combined", "summary.md");
  const tools = [...new Set(rows.map(r => r.tool))].join(",");
  const durationS = Math.max(0, Math.round((new Date(finished).getTime() - new Date(started).getTime()) / 1000));
  const runId = path.basename(reportPath, ".md").replace(/^report-/, "");
  const relReport = path.relative(path.dirname(combinedPath), reportPath).replace(/\\/g, "/");
  const newRow = `| ${runId} | ${tools} | ${rows.length} | ${counts.pass} | ${counts.partial_expected} | ${counts.partial} | ${counts.fail} | ${counts.error} | ${durationS}s | [report](${relReport}) |`;
  const HEADER = ["## Tool-Probe Runs", "", "| Run | Tools | Total | ✅ | 🟡 | ⚠️ | ❌ | 💥 | Duration | Report |", "| --- | ----- | ----- | -- | -- | -- | -- | -- | -------- | ------ |"];
  mkdirSync(path.dirname(combinedPath), { recursive: true });
  let existing = ""; try { existing = readFileSync(combinedPath, "utf-8"); } catch { /* new file */ }
  let next: string;
  if (existing.includes(TP_START) && existing.includes(TP_END)) {
    next = existing.replace(TP_END, `${newRow}\n${TP_END}`);
  } else {
    const block = [TP_START, ...HEADER, newRow, TP_END, ""].join("\n");
    next = existing ? (existing.endsWith("\n") ? existing + "\n" + block : existing + "\n\n" + block) : block;
  }
  writeFileSync(combinedPath, next, "utf-8");
  console.log(`   ↪ Combined summary: ${combinedPath}`);
}

async function judgeCases(evidencePath: string, reportPath: string): Promise<void> {
  const rows = readFileSync(evidencePath, "utf-8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l) as EvidenceRow);
  const debugDir = process.env.CLAUDE_JUDGE_DEBUG_DIR ?? path.join(path.dirname(reportPath), ".judge-debug");
  const concurrency = Number(process.env.CLAUDE_JUDGE_CONCURRENCY ?? "1");
  const timeoutS = Number(process.env.CLAUDE_JUDGE_TIMEOUT ?? "240");
  const lang = (process.env.JUDGE_LANG ?? "zh").toLowerCase();
  const started = new Date().toISOString();
  console.log(`⚖️  Judging ${rows.length} cases, concurrency=${concurrency} ...`);
  const verdicts = await pool(rows, concurrency, async (r, i) => {
    try {
      const v = await judgeOne(r, debugDir, lang, timeoutS);
      console.log(`  [${i + 1}/${rows.length}] ${r.name} [claude -p]: ${v.verdict === "error" ? "💥 error" : `${v.verdict} (${v.confidence})`}`);
      return v;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [${i + 1}/${rows.length}] ${r.name}: unexpected judge error — ${msg}`);
      return { verdict: "error" as const, reasoning: msg, issues: [] as string[], confidence: "low" as const };
    }
  });
  const finished = new Date().toISOString();
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderReport(rows, verdicts, started, finished), "utf-8");
  const counts = { pass: 0, partial_expected: 0, partial: 0, fail: 0, error: 0 };
  rows.forEach((r, i) => { const s = effectiveStatus(r, verdicts[i]!); counts[s]++; });
  console.log(`\n✓ Report: ${reportPath}`);
  console.log(`   ✅ ${counts.pass}  🟡 ${counts.partial_expected}  ⚠️ ${counts.partial}  ❌ ${counts.fail}  💥 ${counts.error}`);
  try { appendToCombinedSummary(rows, counts, started, finished, reportPath); }
  catch (e) { console.warn(`   ⚠ combined summary skipped: ${e instanceof Error ? e.message : String(e)}`); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline (main entry)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate-only entry point: schema + semantic checks, no case execution, no judging.
 * Prints a single JSON object to stdout: { valid, errors, warnings }.
 * Exit codes: 0 = valid (warnings allowed), 1 = validation errors, 2 = I/O/parse error.
 */
async function cmdValidate(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  if (!flags.config) {
    console.error("Usage: bun runner.ts validate --config <file>");
    process.exit(2);
  }
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(flags.config, "utf-8")); }
  catch (e) {
    console.log(JSON.stringify({ valid: false, errors: [{ path: "<file>", code: "io", message: e instanceof Error ? e.message : String(e) }], warnings: [] }));
    process.exit(2);
  }
  const issues = validateConfig(raw);
  const errors = issues.filter(i => i.level === "error");
  const warnings = issues.filter(i => i.level === "warning");
  console.log(JSON.stringify({ valid: errors.length === 0, errors, warnings }, null, 2));
  process.exit(errors.length === 0 ? 0 : 1);
}

async function cmdPipeline(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  if (!flags.config || !flags.report) {
    console.error("Usage: bun runner.ts --config <file> --report <file> [--judge-only]");
    console.error("       bun runner.ts validate --config <file>");
    process.exit(2);
  }
  // Resolve to absolute BEFORE runCases() may process.chdir() into the sandbox.
  // Relative --config/--report would otherwise be re-resolved against the sandbox cwd
  // after chdir, silently writing the report inside the sandbox — which Phase 7 then
  // deletes along with the rest of the worktree, losing the report with no error.
  flags.config = path.resolve(flags.config);
  flags.report = path.resolve(flags.report);
  const judgeOnly = Object.prototype.hasOwnProperty.call(flags, "judge-only");

  // Step 1: validate
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(flags.config, "utf-8")); }
  catch (e) { console.error(`❌ Failed to read config: ${e instanceof Error ? e.message : String(e)}`); process.exit(2); }

  const issues = validateConfig(raw);
  const errors = issues.filter(i => i.level === "error");
  const warnings = issues.filter(i => i.level === "warning");
  if (warnings.length > 0)
    for (const w of warnings) console.warn(`  ⚠ [${w.path}] ${w.message}`);
  if (errors.length > 0 && !judgeOnly) {
    console.error(`❌ Config validation failed (${errors.length} error(s)):`);
    for (const e of errors) console.error(`  [${e.path}] ${e.message}`);
    process.exit(1);
  }
  if (errors.length > 0 && judgeOnly)
    for (const e of errors) console.warn(`  ⚠ (judge-only, skipping run) [${e.path}] ${e.message}`);
  console.log(`✓ Config valid (${warnings.length} warning(s))`);

  const cfg: Config = configSchema.parse(raw);
  // Defensive: same chdir hazard as --config/--report above. evidenceOutPath is
  // documented as "always absolute" but a relative value would otherwise silently
  // land inside the sandbox once runCases() chdir()s into sourceProjectDir.
  cfg.evidenceOutPath = path.resolve(cfg.evidenceOutPath);

  if (!judgeOnly) {
    // Step 2: auto-setup for vercel-ai
    const hasVercel = Object.values(cfg.tools).some(e => e.kind === "vercel-ai");
    if (hasVercel) {
      loadEnvFile(path.join(cfg.sourceProjectDir, ".env"));
      process.env[cfg.debugEnvVar] = "1";
    }

    // Step 3: run cases → evidence JSONL
    await runCases(cfg);
  } else {
    console.log(`⏩ --judge-only: skipping runCases, judging existing evidence at ${cfg.evidenceOutPath}`);
  }

  // Step 4: judge evidence → Markdown report
  await judgeCases(cfg.evidenceOutPath, flags.report);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════════════

const rawArgv = process.argv.slice(2);
if (rawArgv[0] === "validate") await cmdValidate(rawArgv.slice(1));
else await cmdPipeline(rawArgv);
