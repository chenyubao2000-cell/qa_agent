#!/usr/bin/env bun
/**
 * mcp-client.ts — whitebox-testing 共享 MCP 客户端库
 *
 * 供 MCP Mode B 生成的 Vitest spec 直接 import。
 * 设计与 mcp-tool-test 分支的 tests/mcp/_lib/mcp-client.ts 对齐。
 *
 * 用法（在生成的 spec 文件顶部）：
 *   import { McpClient, parseToolResult, stripVolatile } from
 *     "../../../../../../skills/whitebox-testing/scripts/mcp-client.js";
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  CallToolResult,
  ListToolsResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

export interface McpClientOptions {
  /** 跳过 Authorization header，用于 401 / 未鉴权测试 */
  noAuth?: boolean;
  /** 覆盖 token（如过期 token 测试），noAuth=true 时忽略 */
  customToken?: string;
  /** 覆盖 server URL，默认读 process.env.MCP_SERVER_URL */
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
      { name: "qa-whitebox-mcp-tester", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    return new McpClient(client);
  }

  async listTools(): Promise<Tool[]> {
    const r: ListToolsResult = await this.client.listTools();
    return r.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<CallToolResult> {
    return this.client.callTool({
      name,
      arguments: args,
    }) as Promise<CallToolResult>;
  }

  getServerVersion() { return this.client.getServerVersion(); }
  getCapabilities() { return this.client.getServerCapabilities(); }
  getInstructions() { return this.client.getInstructions(); }

  async close(): Promise<void> { await this.client.close(); }
}

/**
 * 标准化 MCP tool 返回值。
 *
 * CTS/其他 MCP 工具的响应有两种形态：
 *  - Single-payload:  `{"type":"data","data":{...}}` + `{"type":"meta",...}`
 *  - Item-streaming:  `{"type":"item","data":{...}}` × N + `{"type":"meta",...}`
 *
 * 两种都归一化成 `{ data, _meta, isError }`。
 * Item-streaming 时，确定性 meta 字段（total / next_cursor 等）提升到 data，
 * 波动字段（trace_id / tool_call_id / quota_remaining）留在 _meta。
 */
const VOLATILE_META_FIELDS = new Set([
  "type",
  "trace_id",
  "tool_call_id",
  "quota_remaining",
]);

export function parseToolResult(r: CallToolResult): {
  data: unknown;
  _meta?: Record<string, unknown>;
  isError?: boolean;
} {
  if (r.structuredContent && Object.keys(r.structuredContent).length > 0) {
    return { data: r.structuredContent, isError: r.isError };
  }

  let data: unknown = null;
  let items: unknown[] | null = null;
  let meta: Record<string, unknown> | undefined;

  for (const item of r.content ?? []) {
    if (item.type !== "text") continue;
    const text = (item as { text: string }).text;
    const lines = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

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
 * 剥除非确定性字段后再做深度断言（幂等性测试专用）。
 * trace_id / tool_call_id / quota_remaining 每次调用都不同，不应影响比对结果。
 */
const STRIP_KEYS = new Set([
  "trace_id",
  "tool_call_id",
  "quota_remaining",
  "_meta",
]);

export function stripVolatile<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripVolatile(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (STRIP_KEYS.has(k)) continue;
      out[k] = stripVolatile(v);
    }
    return out as T;
  }
  return value;
}
