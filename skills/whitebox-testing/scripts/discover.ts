/* eslint-disable no-console */
/**
 * MCP tool discovery — one-time pre-step for mcp-http targets.
 *
 * Usage:
 *   bun discover.ts --url <mcp-server-url> --tools <n1,n2,...>
 *                   [--auth-env <env-var-name>] [--out <file>]
 *
 * Connects to the MCP server, resolves the requested tool schemas,
 * and writes a discovery JSON consumed by qa-whitebox Phase 5d when
 * generating the MCP Vitest spec (see mcp-testing.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

function derivePrefix(toolNames: string[]): string {
  if (toolNames.length === 0) return "tool";
  const split = toolNames.map(n => n.split(/[_-]/).filter(Boolean));
  const first = split[0]!;
  const common: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const seg = first[i]!;
    if (split.every(parts => parts[i] === seg)) common.push(seg);
    else break;
  }
  if (toolNames.length === 1) return common[0] ?? toolNames[0]!.slice(0, 4);
  if (common.length === 0) return (toolNames[0] ?? "tool").slice(0, 4);
  return common.join("_");
}

interface RemoteTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const flags = parseFlags(process.argv.slice(2));

if (!flags.url) { console.error("missing --url <mcp-server-url>"); process.exit(2); }
if (!flags.tools) { console.error("missing --tools <name1,name2,...>"); process.exit(2); }

const toolNames = flags.tools.split(",").map(s => s.trim()).filter(Boolean);
if (toolNames.length === 0) { console.error("--tools must list at least one tool name"); process.exit(2); }

const authEnv = flags["auth-env"] ?? "MCP_AUTH_TOKEN";
const outPath = flags.out || null;

const { Client } = (await import("@modelcontextprotocol/sdk/client/index.js")) as {
  Client: new (
    info: { name: string; version: string },
    opts: { capabilities: Record<string, unknown> },
  ) => {
    connect(t: unknown): Promise<void>;
    listTools(): Promise<{ tools: RemoteTool[] }>;
    close(): Promise<void>;
  };
};
const { StreamableHTTPClientTransport } = (await import("@modelcontextprotocol/sdk/client/streamableHttp.js")) as {
  StreamableHTTPClientTransport: new (url: URL, opts: { requestInit?: { headers?: Record<string, string> } }) => unknown;
};

const headers: Record<string, string> = {};
const token = process.env[authEnv];
if (token) headers["Authorization"] = `Bearer ${token}`;
else console.error(`[discover] note: env ${authEnv} unset; proceeding without Authorization header`);

const transport = new StreamableHTTPClientTransport(new URL(flags.url), { requestInit: { headers } });
const client = new Client({ name: "qa-whitebox-discover", version: "1.0.0" }, { capabilities: {} });

try { await client.connect(transport); }
catch (err) { console.error(`[discover] connect failed: ${err instanceof Error ? err.message : String(err)}`); process.exit(2); }

let listed: RemoteTool[];
try { const r = await client.listTools(); listed = r.tools; }
catch (err) {
  console.error(`[discover] listTools failed: ${err instanceof Error ? err.message : String(err)}`);
  await client.close().catch(() => undefined);
  process.exit(2);
}

const remoteByName = new Map(listed.map(t => [t.name, t]));
const missing = toolNames.filter(n => !remoteByName.has(n));
if (missing.length > 0) {
  console.error(`[discover] missing tools on server: ${missing.join(", ")}`);
  console.error(`[discover] available (${listed.length}): ${listed.map(t => t.name).join(", ")}`);
  await client.close().catch(() => undefined);
  process.exit(1);
}

const tools = toolNames.map(name => {
  const t = remoteByName.get(name)!;
  return {
    kind: "mcp-http" as const,
    name,
    description: t.description ?? "",
    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    serverUrl: flags.url,
    authTokenEnv: token ? authEnv : null,
  };
});

await client.close().catch(() => undefined);

const json = JSON.stringify({ tools, prefix: derivePrefix(toolNames) }, null, 2);
if (outPath) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, json, "utf-8");
  console.error(`[discover] wrote ${outPath}`);
} else {
  process.stdout.write(json + "\n");
}
