import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InstrumentedMcpServer, McpClient, parseToolResult, stripVolatile } from "../../../../skills/whitebox-testing/scripts/mcp-client.js";

const TOOL = "greet";
const OFFLINE = process.env.MCP_OFFLINE === "1";
const ENTRY_FILE = path.resolve(import.meta.dirname, "../../../../scripts/demo-mcp-server.ts");

describe.skipIf(OFFLINE)(TOOL, () => {
  let server: InstrumentedMcpServer;
  let client: McpClient;

  beforeAll(async () => {
    server = await InstrumentedMcpServer.spawn({
      entryFile: ENTRY_FILE,
      cwd: path.dirname(ENTRY_FILE),
      debugEnvVar: "DEMO_MCP_DEBUG",
    });
    client = await McpClient.fromEnv({ serverUrl: server.url });
  });
  afterAll(async () => {
    await client.close();
    await server.close();
  });
  afterEach((ctx) => {
    const probeLines = server.drainProbeLogs("demo-debug.");
    if (ctx.task.result?.state === "fail" && probeLines.length)
      console.log(`\n[probe evidence — ${ctx.task.name}]\n${probeLines.join("\n")}`);
  });

  // ── L1: Schema 合规 ──────────────────────────────────────────────────────
  it("[L1] tools/list 中存在 greet", async () => {
    const tools = await client.listTools();
    expect(tools.find(t => t.name === TOOL)).toBeDefined();
  });

  it("[L1] name 是 required，lang 是 optional enum", async () => {
    const tools = await client.listTools();
    const t = tools.find(x => x.name === TOOL)!;
    const schema = t.inputSchema as {
      properties?: Record<string, { enum?: string[] }>;
      required?: string[];
    };
    expect(schema.required).toContain("name");
    expect(schema.required ?? []).not.toContain("lang");
    expect(schema.properties?.lang?.enum).toEqual(expect.arrayContaining(["en", "zh"]));
  });

  // ── L2: 行为层 ───────────────────────────────────────────────────────────
  it("[P0][L2] 默认英文 greeting", async () => {
    const r = await client.callTool(TOOL, { name: "Alice" });
    const { isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const data = JSON.parse((r.content[0] as { text: string }).text);
    expect(data.message).toBe("Hello, Alice!");
  });

  it("[P0][L2] 中文 greeting", async () => {
    const r = await client.callTool(TOOL, { name: "小明", lang: "zh" });
    const data = JSON.parse((r.content[0] as { text: string }).text);
    expect(data.message).toBe("你好，小明！");
  });

  it("[P0][L2] 幂等性：同参数两次结果一致", async () => {
    const args = { name: "Bob", lang: "en" as const };
    const a = parseToolResult(await client.callTool(TOOL, args)).data;
    const b = parseToolResult(await client.callTool(TOOL, args)).data;
    expect(stripVolatile(a)).toEqual(stripVolatile(b));
  });

  it("[P0][L2] 缺少必填 name → isError", async () => {
    const r = await client.callTool(TOOL, {} as Record<string, unknown>);
    expect(r.isError).toBe(true);
  });

  it("[P1][L2] 非法 lang 枚举值 → isError", async () => {
    const r = await client.callTool(TOOL, { name: "Alice", lang: "fr" } as Record<string, unknown>);
    expect(r.isError).toBe(true);
  });
});
