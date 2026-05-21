# Vitest Spec 模板（per-tool）

## 标准结构

```ts
// tests/mcp/{slug}/{tool-name-kebab}.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpClient, parseToolResult } from "../_lib/mcp-client.js";

const TOOL = "{tool_name}";

describe(`${TOOL} [L1+L2]`, () => {
  let client: McpClient;
  beforeAll(async () => { client = await McpClient.fromEnv(); });
  afterAll(async () => { await client.close(); });

  // ─── L1: Schema 合规 ───
  it("[P0][L1] tool 在 tools/list 中存在", async () => {
    const tools = await client.listTools();
    const t = tools.find((x) => x.name === TOOL);
    expect(t).toBeDefined();
  });

  it("[P0][L1] annotations 与 PRD 一致", async () => {
    const tools = await client.listTools();
    const t = tools.find((x) => x.name === TOOL)!;
    expect(t.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  // ─── L2: Happy path ───
  it("[P0][L2] {场景描述}", async () => {
    const r = await client.callTool(TOOL, { /* args */ });
    const data = parseToolResult(r);
    expect(data).toMatchObject({ /* 期望结构 */ });
  });

  // ─── L2: 鉴权 401 ───
  it("[P0][L2] 无 token → 应被拒绝", async () => {
    const c = await McpClient.fromEnv({ noAuth: true });
    await expect(c.callTool(TOOL, { /* args */ })).rejects.toBeDefined();
    await c.close();
  });

  // ─── L2: 幂等性（仅 idempotentHint=true）───
  it("[P0][L2] 幂等 — 同参 2 次结果一致", async () => {
    const args = { /* args */ };
    const a = parseToolResult(await client.callTool(TOOL, args));
    const b = parseToolResult(await client.callTool(TOOL, args));
    // 比较时排除 trace_id 等运行时变量
    expect(stripVolatile(a)).toEqual(stripVolatile(b));
  });

  // ─── 工具特有 ───
  // 按 PRD 业务规则展开

  // ─── L2: 403 无权限（待补） ───
  it.skip("[P0][L2] 有 token 但无权限 → 403", async () => {
    // TODO(C): 待运维提供"有 token 无权限"的测试账号
  });
});

function stripVolatile<T>(obj: T): T {
  // 递归剥除 trace_id / tool_call_id / 时间戳等
  if (Array.isArray(obj)) return obj.map(stripVolatile) as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "trace_id" || k === "tool_call_id") continue;
      out[k] = stripVolatile(v as never);
    }
    return out as T;
  }
  return obj;
}
```

## 重要约定

1. **`parseToolResult(r)`**：MCP server 返回 `{ content: [{ type: "text", text: "..." }], structuredContent: {...} }`。
   实测 CTS 类 server 在 `content[0].text` 内放 JSONL（多行 JSON）：第一行 `{"type":"data","data":{...}}`，第二行 `{"type":"meta","trace_id":"..."}`。
   `parseToolResult` 在 `tests/mcp/_lib/mcp-client.ts` 实现，按行 parse 后返回 `{data, _meta}`。

2. **错误断言**：MCP SDK 在 server 返回 `isError: true` 或 transport 401 时**不一定**抛 HTTP 错误码——
   有时是 JSON-RPC error code，有时是 connect 异常。用 `rejects.toBeDefined()` 做最宽断言；
   要更精确请用 `rejects.toThrow(/keyword/)` 匹配错误文本。

3. **会话隔离**：401 / 自定义 token 测试**新建独立 `McpClient`**，不复用主 client，免污染主连接。

4. **TODO 注释**：所有 `it.skip()` 必须含 `// TODO({原因/单号}):` 形式，便于后续追踪。

5. **超时**：vitest 默认 5s，MCP 调用一般 200-2000ms 足够；慢请求显式 `it("...", { timeout: 15000 }, async ...)`。
