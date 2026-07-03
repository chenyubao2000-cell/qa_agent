import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InstrumentedMcpServer, McpClient, parseToolResult } from "../../../../skills/whitebox-testing/scripts/mcp-client.js";

const TOOL = "add";
const OFFLINE = process.env.MCP_OFFLINE === "1";
const ENTRY_FILE = path.resolve(import.meta.dirname, "../../../../scripts/demo-mcp-server.ts");

describe.skipIf(OFFLINE)(TOOL, () => {
  let server: InstrumentedMcpServer;
  let client: McpClient;

  beforeAll(async () => {
    // 本地可起服务的 MCP → 插桩 + spawn 子进程（instrumentation.md §2b）
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
  it("[L1] tools/list 中存在 add", async () => {
    const tools = await client.listTools();
    expect(tools.find(t => t.name === TOOL)).toBeDefined();
  });

  it("[L1] inputSchema 包含 a 和 b (required)", async () => {
    const tools = await client.listTools();
    const t = tools.find(x => x.name === TOOL)!;
    const schema = t.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining(["a", "b"]));
    expect(schema.required).toEqual(expect.arrayContaining(["a", "b"]));
  });

  // ── L2: 行为层 ───────────────────────────────────────────────────────────
  it("[P0][L2] 正常相加 1+2=3", async () => {
    const r = await client.callTool(TOOL, { a: 1, b: 2 });
    const { isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const data = JSON.parse((r.content[0] as { text: string }).text);
    expect(data.result).toBe(3);
  });

  it("[P0][L2] 负数相加 -5+3=-2", async () => {
    const r = await client.callTool(TOOL, { a: -5, b: 3 });
    const data = JSON.parse((r.content[0] as { text: string }).text);
    expect(data.result).toBe(-2);
  });

  it("[P0][L2] 幂等性：同参数两次结果一致", async () => {
    const args = { a: 7, b: 8 };
    const r1 = JSON.parse((await client.callTool(TOOL, args)).content[0].text as string);
    const r2 = JSON.parse((await client.callTool(TOOL, args)).content[0].text as string);
    expect(r1.result).toBe(r2.result);
  });

  it("[P1][L2] 缺少必填参数 b → isError", async () => {
    const r = await client.callTool(TOOL, { a: 1 } as Record<string, unknown>);
    expect(r.isError).toBe(true);
  });
});
