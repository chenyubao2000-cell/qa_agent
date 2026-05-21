/* eslint-disable no-console */
/**
 * Tool-probe runner — generic, lives in qa_agent.
 *
 * Reads a JSON config that points at the source project's tool factories,
 * dynamically imports them, calls tool.execute() per case, and writes
 * evidence-<run-id>.jsonl.
 *
 * Usage:
 *   bun --env-file=<source-project>/.env scripts/tool-probe/runner.ts --config <abs-path>
 *
 * Config schema: see `scripts/tool-probe/config.schema.ts` (zod) below.
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Config schema
// ─────────────────────────────────────────────────────────────────────────────

const stepSchema = z.object({ input: z.record(z.string(), z.unknown()) });

const caseSchema = z.object({
  name: z.string(),
  tool: z.string(),
  description: z.string(),
  steps: z.array(stepSchema).min(1),
  expect: z.enum(["ok", "tool_error"]),
  expectErrorCode: z.string().nullable().optional(),
  judgeFocus: z.string().optional(),
  tokenOverride: z.union([z.string(), z.null()]).optional(),
  acceptPartialAsPass: z.boolean().optional(),
});

const toolEntrySchema = z.object({
  module: z.string(),               // absolute path to the tool's .ts file
  factory: z.string(),              // export name of the factory function
  descriptionExport: z.string(),    // export name of the description constant
});

const configSchema = z.object({
  runId: z.string(),                                // e.g. "2026-05-21T08-22-43-114Z"
  sourceProjectDir: z.string(),                     // chdir target
  loggerModule: z.string(),                         // absolute path to logger source file (must export `logger`)
  tools: z.record(z.string(), toolEntrySchema),
  authEnvVar: z.string().nullable().optional(),     // env var to override per-case
  debugEnvVar: z.string(),                          // e.g. "GH_TOOL_DEBUG"
  eventPrefix: z.string(),                          // e.g. "gh-debug"
  cases: z.array(caseSchema),
  evidenceOutPath: z.string(),                      // absolute path to write evidence JSONL
});

type Config = z.infer<typeof configSchema>;
type TestCase = z.infer<typeof caseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// CLI parse
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(): { config: string } {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = args[i + 1] ?? "";
  }
  if (!out.config) {
    console.error("Usage: bun runner.ts --config <abs-path-to-config.json>");
    process.exit(2);
  }
  return { config: out.config };
}

// ─────────────────────────────────────────────────────────────────────────────
// Truncation (8 KB per field)
// ─────────────────────────────────────────────────────────────────────────────

const TRUNCATE_BYTES = 8192;

function truncateValue<T>(v: T): T {
  if (v == null) return v;
  if (typeof v !== "object" && typeof v !== "string") return v;
  const json = JSON.stringify(v);
  if (json.length <= TRUNCATE_BYTES) return v;
  return (json.slice(0, TRUNCATE_BYTES) + `[truncated:${json.length}]`) as unknown as T;
}

interface CapturedEvent {
  event: string;
  data: Record<string, unknown>;
}

function truncateLogPayload(ev: CapturedEvent): CapturedEvent {
  const data: Record<string, unknown> = { ...ev.data };
  for (const [k, val] of Object.entries(data)) {
    if (k === "event") continue;
    data[k] = truncateValue(val);
  }
  return { event: ev.event, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

interface StepResult {
  input: Record<string, unknown>;
  output: unknown;
  logs: CapturedEvent[];
  threw?: string;
}

type ExecFn = (input: unknown, opts: unknown) => Promise<unknown>;

async function main(): Promise<void> {
  const { config: configPath } = parseArgs();
  const raw = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
  const cfg: Config = configSchema.parse(raw);

  if (process.env[cfg.debugEnvVar] !== "1") {
    console.error(`❌ ${cfg.debugEnvVar} must be '1' to capture logs. Aborting.`);
    process.exit(2);
  }

  // 1. Make the source project's relative paths + tsconfig + workspaces resolve.
  process.chdir(cfg.sourceProjectDir);

  // 2. Import the source project's logger module FIRST, patch it, THEN import tools.
  //    bun caches the module instance, so tool files importing the same logger get our patched copy.
  const loggerMod = (await import(pathToFileURL(cfg.loggerModule).href)) as {
    logger: { info: (msg: string, ctx?: Record<string, unknown>) => void };
  };
  const logger = loggerMod.logger;
  if (!logger || typeof logger.info !== "function") {
    console.error(`❌ ${cfg.loggerModule} does not export a logger with .info()`);
    process.exit(2);
  }

  let captureBuffer: CapturedEvent[] | null = null;
  const originalInfo = logger.info.bind(logger);
  logger.info = (msg: string, ctx?: Record<string, unknown>): void => {
    originalInfo(msg, ctx);
    if (
      captureBuffer &&
      ctx &&
      typeof ctx.event === "string" &&
      ctx.event.startsWith(`${cfg.eventPrefix}.`)
    ) {
      captureBuffer.push({ event: ctx.event, data: ctx });
    }
  };

  // 3. Load tool factories + descriptions.
  type ToolEntry = { factory: () => { execute?: ExecFn }; description: string };
  const TOOLS: Record<string, ToolEntry> = {};
  for (const [name, entry] of Object.entries(cfg.tools)) {
    const mod = (await import(pathToFileURL(entry.module).href)) as Record<string, unknown>;
    const factory = mod[entry.factory] as ToolEntry["factory"] | undefined;
    const description = mod[entry.descriptionExport] as string | undefined;
    if (typeof factory !== "function") {
      console.error(`❌ ${entry.module} does not export factory "${entry.factory}"`);
      process.exit(2);
    }
    if (typeof description !== "string") {
      console.error(`❌ ${entry.module} does not export description "${entry.descriptionExport}"`);
      process.exit(2);
    }
    TOOLS[name] = { factory, description };
  }

  // 4. Prepare evidence file.
  mkdirSync(path.dirname(cfg.evidenceOutPath), { recursive: true });
  writeFileSync(cfg.evidenceOutPath, "", "utf-8");
  console.log(`🚀 Running ${cfg.cases.length} cases → ${cfg.evidenceOutPath}`);

  // 5. Run cases sequentially.
  for (const [i, c] of cfg.cases.entries()) {
    console.log(`  [${i + 1}/${cfg.cases.length}] ${c.name} ...`);
    const entry = TOOLS[c.tool];
    if (!entry) {
      const row = makeErrorRow(c, "", `unknown tool: ${c.tool}`);
      appendFileSync(cfg.evidenceOutPath, JSON.stringify(row) + "\n", "utf-8");
      continue;
    }

    // Auth env override
    const envVar = cfg.authEnvVar;
    const overrideApplies = c.tokenOverride !== undefined && envVar;
    const tokenWasSet = envVar ? envVar in process.env : false;
    const originalToken = envVar ? process.env[envVar] : undefined;
    if (overrideApplies && envVar) {
      if (c.tokenOverride === null) delete process.env[envVar];
      else if (typeof c.tokenOverride === "string") process.env[envVar] = c.tokenOverride;
    }

    try {
      const tool = entry.factory();
      const exec = tool.execute as ExecFn | undefined;
      if (!exec) throw new Error(`tool.execute undefined for ${c.tool}`);

      const stepResults: StepResult[] = [];
      for (const step of c.steps) {
        captureBuffer = [];
        let output: unknown = null;
        let threw: string | undefined;
        try {
          output = await exec(step.input, { toolCallId: "test", messages: [] });
        } catch (err) {
          threw = err instanceof Error ? err.message : String(err);
        }
        const logs = (captureBuffer ?? []).map(truncateLogPayload);
        captureBuffer = null;
        stepResults.push({
          input: step.input,
          output: truncateValue(output),
          logs,
          threw,
        });
      }

      const row = {
        name: c.name,
        tool: c.tool,
        toolDescription: entry.description,
        description: c.description,
        expect: c.expect,
        expectErrorCode: c.expectErrorCode ?? null,
        judgeFocus: c.judgeFocus,
        acceptPartialAsPass: c.acceptPartialAsPass ?? false,
        evidence: { steps: stepResults },
      };
      appendFileSync(cfg.evidenceOutPath, JSON.stringify(row) + "\n", "utf-8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`     runner error on ${c.name}: ${msg}`);
      const row = makeErrorRow(c, entry.description, msg);
      appendFileSync(cfg.evidenceOutPath, JSON.stringify(row) + "\n", "utf-8");
    } finally {
      if (overrideApplies && envVar) {
        if (tokenWasSet) process.env[envVar] = originalToken;
        else delete process.env[envVar];
      }
    }
  }

  console.log(`\n✓ Wrote ${cfg.cases.length} rows to ${cfg.evidenceOutPath}`);
}

function makeErrorRow(c: TestCase, toolDescription: string, threw: string): Record<string, unknown> {
  return {
    name: c.name,
    tool: c.tool,
    toolDescription,
    description: c.description,
    expect: c.expect,
    expectErrorCode: c.expectErrorCode ?? null,
    judgeFocus: c.judgeFocus,
    acceptPartialAsPass: c.acceptPartialAsPass ?? false,
    evidence: { steps: [{ input: {}, output: null, logs: [], threw }] },
  };
}

main().catch((err) => {
  console.error("runner threw:", err);
  process.exit(2);
});
