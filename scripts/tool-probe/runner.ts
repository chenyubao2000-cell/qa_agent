/* eslint-disable no-console */
/**
 * Tool-probe runner — generic, lives in qa_agent.
 *
 * Reads a JSON config and runs each case against its declared tool. Tools come
 * in two flavors discriminated by `kind`:
 *
 *   - "vercel-ai" : dynamically imports the source project's tool factory and
 *                   calls `tool.execute(input, opts)` in-process. Captures the
 *                   4 white-box probe events via monkey-patched logger.
 *
 *   - "mcp-http"  : connects to a remote MCP server via StreamableHTTP transport
 *                   and calls `client.callTool({name, arguments})`. No probe
 *                   injection possible (server is a separate process); evidence
 *                   contains only input + output.
 *
 * Per-case evidence rows are appended to a JSONL file in the schema judge.ts expects.
 *
 * Usage:
 *   bun --env-file=<source-project>/.env scripts/tool-probe/runner.ts --config <abs-path>
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { configSchema, type Config, type TestCase, type ToolEntry } from "./case-schema";

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
// Executor abstraction — the ONE fork point between vercel-ai and mcp-http
// ─────────────────────────────────────────────────────────────────────────────

interface Executor {
  description: string;
  /** Execute one step. Probe logs (if any) land in the shared captureBuffer. */
  execute(input: Record<string, unknown>): Promise<unknown>;
  close?(): Promise<void>;
}

type ExecFn = (input: unknown, opts: unknown) => Promise<unknown>;

async function createVercelExecutor(entry: Extract<ToolEntry, { kind: "vercel-ai" }>): Promise<Executor> {
  const mod = (await import(pathToFileURL(entry.module).href)) as Record<string, unknown>;
  const factory = mod[entry.factory] as (() => { execute?: ExecFn }) | undefined;
  const description = mod[entry.descriptionExport] as string | undefined;
  if (typeof factory !== "function") {
    throw new Error(`${entry.module} does not export factory "${entry.factory}"`);
  }
  if (typeof description !== "string") {
    throw new Error(`${entry.module} does not export description "${entry.descriptionExport}"`);
  }
  const tool = factory();
  const exec = tool.execute as ExecFn | undefined;
  if (!exec) throw new Error(`tool.execute undefined for kind=vercel-ai`);
  return {
    description,
    execute: async (input) => exec(input, { toolCallId: "test", messages: [] }),
  };
}

async function createMcpHttpExecutor(
  toolKey: string,
  entry: Extract<ToolEntry, { kind: "mcp-http" }>,
): Promise<Executor> {
  // Dynamic import keeps SDK out of the load path when no mcp-http tools are configured.
  const { Client } = (await import("@modelcontextprotocol/sdk/client/index.js")) as {
    Client: new (
      info: { name: string; version: string },
      opts: { capabilities: Record<string, unknown> },
    ) => {
      connect(t: unknown): Promise<void>;
      listTools(): Promise<{ tools: Array<{ name: string; description?: string }> }>;
      callTool(p: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
      close(): Promise<void>;
    };
  };
  const { StreamableHTTPClientTransport } = (await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  )) as {
    StreamableHTTPClientTransport: new (
      url: URL,
      opts: { requestInit?: { headers?: Record<string, string> } },
    ) => unknown;
  };

  const headers: Record<string, string> = {};
  if (entry.authTokenEnv) {
    const token = process.env[entry.authTokenEnv];
    if (!token) {
      throw new Error(
        `kind=mcp-http tool "${toolKey}" expects auth env var ${entry.authTokenEnv} but it is unset`,
      );
    }
    headers["Authorization"] = `Bearer ${token}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(entry.serverUrl), {
    requestInit: { headers },
  });
  const client = new Client(
    { name: "tool-probe-runner", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  const remoteName = entry.toolName ?? toolKey;
  const { tools: remoteTools } = await client.listTools();
  const meta = remoteTools.find((t) => t.name === remoteName);
  const description = meta?.description ?? `(MCP tool ${remoteName}; description unavailable)`;

  return {
    description,
    execute: async (input) =>
      client.callTool({ name: remoteName, arguments: input }),
    close: async () => client.close(),
  };
}

async function buildExecutors(cfg: Config): Promise<Record<string, Executor>> {
  const executors: Record<string, Executor> = {};
  for (const [name, entry] of Object.entries(cfg.tools)) {
    if (entry.kind === "vercel-ai") {
      executors[name] = await createVercelExecutor(entry);
    } else if (entry.kind === "mcp-http") {
      executors[name] = await createMcpHttpExecutor(name, entry);
    } else {
      // exhaustiveness guard
      const _exhaustive: never = entry;
      throw new Error(`unknown tool kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
  return executors;
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

async function main(): Promise<void> {
  const { config: configPath } = parseArgs();
  const raw = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
  const cfg: Config = configSchema.parse(raw);

  const toolEntries = Object.entries(cfg.tools);
  const hasVercel = toolEntries.some(([, e]) => e.kind === "vercel-ai");
  const hasMcp = toolEntries.some(([, e]) => e.kind === "mcp-http");

  // DEBUG gate only matters for vercel-ai (probes feed through logger monkey-patch).
  // MCP-only runs have no probes to capture, so the gate is bypassed.
  if (hasVercel && process.env[cfg.debugEnvVar] !== "1") {
    console.error(`❌ ${cfg.debugEnvVar} must be '1' to capture vercel-ai probe logs. Aborting.`);
    process.exit(2);
  }

  // chdir + logger monkey-patch are ONLY relevant when any vercel-ai tool exists.
  let captureBuffer: CapturedEvent[] | null = null;
  if (hasVercel) {
    process.chdir(cfg.sourceProjectDir);

    if (!cfg.loggerModule) {
      console.error(`❌ vercel-ai tool requires cfg.loggerModule, but it is null/missing`);
      process.exit(2);
    }
    const loggerMod = (await import(pathToFileURL(cfg.loggerModule).href)) as {
      logger: { info: (msg: string, ctx?: Record<string, unknown>) => void };
    };
    const logger = loggerMod.logger;
    if (!logger || typeof logger.info !== "function") {
      console.error(`❌ ${cfg.loggerModule} does not export a logger with .info()`);
      process.exit(2);
    }
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
  }

  // Build all executors (init MCP clients once per tool, etc.).
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
        const row = makeErrorRow(c, entryMaybe?.kind ?? null, "", `unknown tool: ${c.tool}`);
        appendFileSync(cfg.evidenceOutPath, JSON.stringify(row) + "\n", "utf-8");
        continue;
      }

      // Auth env override applies to vercel-ai only (legacy single-env model).
      // For mcp-http, auth is bound at connect time via entry.authTokenEnv.
      const entry = entryMaybe;
      const envVar = cfg.authEnvVar;
      const overrideApplies =
        entry.kind === "vercel-ai" && c.tokenOverride !== undefined && !!envVar;
      const tokenWasSet = envVar ? envVar in process.env : false;
      const originalToken = envVar ? process.env[envVar] : undefined;
      if (overrideApplies && envVar) {
        if (c.tokenOverride === null) delete process.env[envVar];
        else if (typeof c.tokenOverride === "string") process.env[envVar] = c.tokenOverride;
      }

      try {
        const stepResults: StepResult[] = [];
        for (const step of c.steps) {
          captureBuffer = hasVercel ? [] : null;
          let output: unknown = null;
          let threw: string | undefined;
          try {
            output = await ex.execute(step.input);
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
          toolKind: entry.kind,                       // "vercel-ai" | "mcp-http" — judge uses this to adapt prompt
          toolDescription: ex.description,
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
        const row = makeErrorRow(c, entry.kind, ex.description, msg);
        appendFileSync(cfg.evidenceOutPath, JSON.stringify(row) + "\n", "utf-8");
      } finally {
        if (overrideApplies && envVar) {
          if (tokenWasSet) process.env[envVar] = originalToken;
          else delete process.env[envVar];
        }
      }
    }
  } finally {
    // Close any executors with cleanup (e.g. MCP clients).
    for (const [name, ex] of Object.entries(executors)) {
      if (ex.close) {
        try {
          await ex.close();
        } catch (err) {
          console.warn(
            `   ⚠ executor close failed for ${name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  console.log(`\n✓ Wrote ${cfg.cases.length} rows to ${cfg.evidenceOutPath}`);
  // Silence unused-var: hasMcp is captured in the startup banner; nothing else uses it.
  void hasMcp;
}

function makeErrorRow(
  c: TestCase,
  toolKind: "vercel-ai" | "mcp-http" | null,
  toolDescription: string,
  threw: string,
): Record<string, unknown> {
  return {
    name: c.name,
    tool: c.tool,
    toolKind,
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
