#!/usr/bin/env bun
/**
 * demo-mcp-server.ts — 本地演示 MCP server，用于验证 whitebox MCP 测试流程。
 * 运行: bun scripts/demo-mcp-server.ts
 * 默认端口: 3100
 *
 * 采用 stateless 模式：每个 HTTP 请求创建独立的 McpServer + transport 实例。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 3100);
const DEBUG = process.env.DEMO_MCP_DEBUG === "1";

/** 探针门控日志：不开 DEMO_MCP_DEBUG 时零开销。参考 instrumentation.md §2b 的插桩规则。 */
function probe(stage: string, data: Record<string, unknown>): void {
  if (DEBUG) console.log(JSON.stringify({ event: `demo-debug.${stage}`, ...data }));
}

/** 每次调用返回一个全新的 McpServer 实例（stateless 模式必须）。 */
function buildServer(): McpServer {
  const server = new McpServer(
    { name: "demo-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // 工具 1: add — 两数相加
  server.tool(
    "add",
    "Add two numbers and return the result.",
    {
      a: z.number().describe("First operand"),
      b: z.number().describe("Second operand"),
    },
    async ({ a, b }) => {
      probe("tool.input", { tool: "add", input: { a, b } });
      const result = await (async () => ({
        content: [{ type: "text" as const, text: JSON.stringify({ result: a + b }) }],
      }))();
      probe("tool.output", { tool: "add", result });
      return result;
    },
  );

  // 工具 2: greet — 含可选参数 + enum
  server.tool(
    "greet",
    "Greet someone by name in the chosen language.",
    {
      name: z.string().min(1).describe("Person's name (required)"),
      lang: z.enum(["en", "zh"]).optional().describe("Language: 'en' (default) or 'zh'"),
    },
    async ({ name, lang = "en" }) => {
      probe("tool.input", { tool: "greet", input: { name, lang } });
      const result = await (async () => {
        const message = lang === "zh" ? `你好，${name}！` : `Hello, ${name}!`;
        return { content: [{ type: "text" as const, text: JSON.stringify({ message }) }] };
      })();
      probe("tool.output", { tool: "greet", result });
      return result;
    },
  );

  return server;
}

// ── HTTP 服务（Web Standard，兼容 Bun.serve）────────────────────────────

Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    // 每个请求独立实例，避免 "Already connected" 错误
    const server = buildServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    await server.connect(transport);
    return transport.handleRequest(req);
  },
});

console.log(`[demo-mcp] running → http://localhost:${PORT}/mcp`);
