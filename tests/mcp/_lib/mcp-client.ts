// MCP client harness for the qa-platform.
// Wraps @modelcontextprotocol/sdk with .env-driven config + parsing helpers.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  CallToolResult,
  ListToolsResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

export interface McpClientOptions {
  /** Skip Authorization header — used for 401 / unauthenticated tests. */
  noAuth?: boolean;
  /** Override token (e.g. expired token tests). Ignored if noAuth=true. */
  customToken?: string;
  /** Override server URL. Default = process.env.MCP_SERVER_URL. */
  serverUrl?: string;
}

export class McpClient {
  private constructor(private readonly client: Client) {}

  static async fromEnv(opts: McpClientOptions = {}): Promise<McpClient> {
    const url = opts.serverUrl ?? process.env.MCP_SERVER_URL;
    if (!url) throw new Error("MCP_SERVER_URL not set");

    const token = opts.noAuth
      ? undefined
      : (opts.customToken ?? process.env.MCP_AUTH_TOKEN);

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    });

    const client = new Client(
      { name: "qa-platform-mcp-tester", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    return new McpClient(client);
  }

  async listTools(): Promise<Tool[]> {
    const r: ListToolsResult = await this.client.listTools();
    return r.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    return this.client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
  }

  getServerVersion() { return this.client.getServerVersion(); }
  getCapabilities() { return this.client.getServerCapabilities(); }
  getInstructions() { return this.client.getInstructions(); }

  async close(): Promise<void> { await this.client.close(); }
}

/**
 * MCP tool results have a layered shape. CTS tools use two flavors:
 *   - Single-payload:  `{"type":"data","data":{...}}` + `{"type":"meta",...}`
 *     (cts_get_cts_schema, cts_get_candidate_detail, cts_get_candidate_contact_info)
 *   - Item-streaming:  `{"type":"item","data":{...}}` × N + `{"type":"meta", total, next_cursor, ...}`
 *     (cts_search_candidates)
 *
 * `parseToolResult` normalizes both into `{ data, _meta, isError }`. For item-streaming,
 * deterministic meta fields (total / next_cursor / ...) are lifted into `data` so tests can
 * uniformly read `data.items` / `data.total` / `data.next_cursor`. Volatile meta fields
 * (trace_id, tool_call_id, quota_remaining) stay in `_meta`.
 *
 * `isError` is preserved on the wrapper, but parsing still proceeds even when set —
 * error payload (`{errorCode, message, hint, traceId}`) is available in `data` for assertions.
 */
const VOLATILE_META_FIELDS = new Set(["type", "trace_id", "tool_call_id", "quota_remaining"]);

export function parseToolResult(r: CallToolResult): { data: unknown; _meta?: Record<string, unknown>; isError?: boolean } {
  if (r.structuredContent && Object.keys(r.structuredContent).length > 0) {
    return { data: r.structuredContent, isError: r.isError };
  }

  let data: unknown = null;
  let items: unknown[] | null = null;
  let meta: Record<string, unknown> | undefined;

  for (const item of r.content ?? []) {
    if (item.type !== "text") continue;
    const text = (item as { text: string }).text;
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    for (const line of lines) {
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { continue; }
      if (!parsed || typeof parsed !== "object") continue;

      const obj = parsed as Record<string, unknown>;
      if (obj.type === "data") data = obj.data;
      else if (obj.type === "item") (items ??= []).push(obj.data);
      else if (obj.type === "meta") meta = obj;
      else if (data === null) data = parsed;
    }
  }

  // Item-streaming → synthesize unified data shape, lifting deterministic meta fields.
  if (items !== null) {
    const promoted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta ?? {})) {
      if (!VOLATILE_META_FIELDS.has(k)) promoted[k] = v;
    }
    data = { items, ...promoted };
  }

  return { data, _meta: meta, isError: r.isError };
}

/**
 * Strip non-deterministic fields before deep-equal idempotency assertions.
 * Includes trace_id / tool_call_id / quota_remaining that fluctuate between calls.
 */
const STRIP_KEYS = new Set(["trace_id", "tool_call_id", "quota_remaining", "_meta"]);

export function stripVolatile<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripVolatile(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (STRIP_KEYS.has(k)) continue;
      out[k] = stripVolatile(v);
    }
    return out as T;
  }
  return value;
}
