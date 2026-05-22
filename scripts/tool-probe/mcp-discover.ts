/* eslint-disable no-console */
/**
 * MCP discovery CLI — connects to an MCP StreamableHTTP server, lists tools,
 * filters to the requested set, and emits a discovery JSON whose shape matches
 * the "MCP-HTTP shape" documented in .claude/commands/qa-tool-probe.md.
 *
 * Output (stdout by default, or to --out <path>):
 *   {
 *     "tools": [
 *       {
 *         "kind": "mcp-http",
 *         "name": "...",
 *         "description": "...",
 *         "inputSchema": {...},
 *         "serverUrl": "<url>",
 *         "authTokenEnv": "<env name>"
 *       }
 *     ],
 *     "prefix": "<longest common underscore-segment prefix>"
 *   }
 *
 * Exit codes:
 *   0 — all requested tools resolved
 *   1 — one or more requested tools missing on the server (full available list printed to stderr)
 *   2 — argv / connection / I/O error
 *
 * Usage:
 *   bun scripts/tool-probe/mcp-discover.ts \
 *     --url https://cts-mcp.example.com/mcp \
 *     --tools cts_search_candidates,cts_get_cts_schema \
 *     [--auth-env CTS_MCP_TOKEN] \
 *     [--out /abs/path/discovery.json]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { derivePrefix } from "./prefix";

interface Args {
  url: string;
  tools: string[];
  authEnv: string;
  out: string | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] ?? "";
  }
  if (!out.url) {
    console.error("missing --url <mcp-server-url>");
    process.exit(2);
  }
  if (!out.tools) {
    console.error("missing --tools <name1,name2,...>");
    process.exit(2);
  }
  const tools = out.tools
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tools.length === 0) {
    console.error("--tools must list at least one tool name");
    process.exit(2);
  }
  return {
    url: out.url,
    tools,
    authEnv: out["auth-env"] ?? "MCP_AUTH_TOKEN",
    out: out.out || null,
  };
}

interface RemoteTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Dynamic import keeps the SDK off the load path when this script isn't used.
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
  const { StreamableHTTPClientTransport } = (await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  )) as {
    StreamableHTTPClientTransport: new (
      url: URL,
      opts: { requestInit?: { headers?: Record<string, string> } },
    ) => unknown;
  };

  const headers: Record<string, string> = {};
  const token = process.env[args.authEnv];
  if (token) headers["Authorization"] = `Bearer ${token}`;
  else {
    console.error(
      `[mcp-discover] note: env ${args.authEnv} unset; proceeding without Authorization header`,
    );
  }

  const transport = new StreamableHTTPClientTransport(new URL(args.url), {
    requestInit: { headers },
  });
  const client = new Client(
    { name: "qa-tool-probe-discover", version: "0.1.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
  } catch (err) {
    console.error(
      `[mcp-discover] connect failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(2);
  }

  let listed: RemoteTool[];
  try {
    const r = await client.listTools();
    listed = r.tools;
  } catch (err) {
    console.error(
      `[mcp-discover] listTools failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    await client.close().catch(() => undefined);
    process.exit(2);
  }

  const remoteByName = new Map(listed.map((t) => [t.name, t]));
  const missing = args.tools.filter((n) => !remoteByName.has(n));
  if (missing.length > 0) {
    console.error(`[mcp-discover] missing tools on server: ${missing.join(", ")}`);
    console.error(`[mcp-discover] available tools (${listed.length}):`);
    for (const t of listed) console.error(`  - ${t.name}`);
    await client.close().catch(() => undefined);
    process.exit(1);
  }

  const tools = args.tools.map((name) => {
    const t = remoteByName.get(name)!;
    return {
      kind: "mcp-http" as const,
      name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
      serverUrl: args.url,
      authTokenEnv: token ? args.authEnv : null,
    };
  });

  const discovery = {
    tools,
    prefix: derivePrefix(args.tools),
  };

  await client.close().catch(() => undefined);

  const json = JSON.stringify(discovery, null, 2);
  if (args.out) {
    mkdirSync(path.dirname(args.out), { recursive: true });
    writeFileSync(args.out, json, "utf-8");
    console.error(`[mcp-discover] wrote ${args.out}`);
  } else {
    process.stdout.write(json + "\n");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`[mcp-discover] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
