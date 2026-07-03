# MCP Testing Reference

MCP Mode B 的测试方法论。当 `classify-diff.ts` 识别出含 `server.tool()` 的变更文件时，走此路径。

判定始终是 Vitest L1+L2 断言（本文档主体）。区别在于**证据来源**：能在沙箱内本地起服务的 MCP，额外插桩 + spawn 子进程采集探针日志作诊断参考（§八）；纯远程部署、找不到本地入口的 MCP，维持纯黑盒（§一～§七不变）。

---

## 一、测试分层（L1 + L2）

### L1 — 协议层（Schema 合规）

不调用工具，只验证 server 自描述的结构是否符合预期。

| 用例类型 | 断言目标 |
|---|---|
| `tools/list` 存在性 | 工具名出现在列表中 |
| `inputSchema` 字段 | 必填参数存在，类型正确 |
| `annotations` | `readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint` 标记正确 |
| `description` | 非空，长度合理 |

L1 不消耗 quota，可反复执行，适合 CI 门控。

### L2 — 工具行为层

实际调用 `callTool()`，验证返回内容。

| 类别 | 用例 | 优先级 |
|---|---|---|
| Happy path | 正常参数 → 返回预期结构 | P0 |
| 必填缺失 | 省略 required 字段 → `isError=true` + 错误码 | P0 |
| 非法枚举 | 不合法的枚举值 → 被拒绝 | P0 |
| 鉴权失败 | `noAuth: true` → 被拒绝 | P0 |
| 不存在资源 | 无效 ID → NOT_FOUND 类错误，不应返回 500 | P1 |
| 边界值 | limit 最大值允许，limit+1 被拒 | P1 |
| 幂等性 | 同参数调 2 次，`stripVolatile` 后结果一致 | P0 |
| 分页 | limit=1 + cursor 翻页，第 2 页与第 1 页不重复 | P1 |
| 空结果 | 必定无匹配的关键词 → 空列表，不报错 | P1 |

---

## 二、共享库（`scripts/mcp-client.ts`）

所有生成的 MCP Vitest spec 都从此 import：

```ts
import {
  McpClient,
  parseToolResult,
  stripVolatile,
} from "<相对路径>/skills/whitebox-testing/scripts/mcp-client.js";
```

### McpClient

```ts
// 从 .env 读取 MCP_SERVER_URL + MCP_AUTH_TOKEN 建立连接
const client = await McpClient.fromEnv();

// 可选：noAuth（测鉴权失败）、customToken（测过期 token）
const unauthClient = await McpClient.fromEnv({ noAuth: true });

// listTools / callTool / close
const tools = await client.listTools();
const result = await client.callTool("search_enterprises", { keyword: "AI" });
await client.close();
```

### parseToolResult

统一处理两种 MCP 响应格式（single-payload 和 item-streaming）：

```ts
const { data, _meta, isError } = parseToolResult(result);
// data: 业务数据（item-streaming 时含 items[] + 分页字段）
// _meta: 波动元数据（trace_id、quota_remaining 等）
// isError: 工具层面的错误标记
```

### stripVolatile

幂等性断言前剥除非确定性字段：

```ts
const a = parseToolResult(await client.callTool(TOOL, args)).data;
const b = parseToolResult(await client.callTool(TOOL, args)).data;
expect(stripVolatile(a)).toEqual(stripVolatile(b));
```

---

## 三、测试文件结构

MCP Mode B 生成的文件放在 `$WHITEBOX_DIR/vitest/`，与 Mode A 的测试同目录：

```
$WHITEBOX_DIR/vitest/
├── <tool-name>.test.ts      ← 每个 MCP 工具一个测试文件
└── ...
```

每个 `.test.ts` 的标准结构：

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpClient, parseToolResult, stripVolatile } from "<path>/mcp-client.js";
import "dotenv/config";

const TOOL = "search_enterprises";
const OFFLINE = process.env.MCP_OFFLINE === "1";

describe.skipIf(OFFLINE)(`${TOOL}`, () => {
  let client: McpClient;

  beforeAll(async () => {
    client = await McpClient.fromEnv();
  });
  afterAll(async () => { await client.close(); });

  // ── L1: Schema 合规 ──
  it("[L1] tools/list 中存在 search_enterprises", async () => {
    const tools = await client.listTools();
    expect(tools.find(t => t.name === TOOL)).toBeDefined();
  });

  it("[L1] inputSchema 含必要参数", async () => {
    const tools = await client.listTools();
    const t = tools.find(x => x.name === TOOL)!;
    const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["keyword"]));
  });

  // ── L2: Happy path ──
  it("[P0][L2] 正常搜索返回非空列表", async () => {
    const r = await client.callTool(TOOL, { keyword: "AI", limit: 3 });
    const { data, isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const d = data as { items: unknown[] };
    expect(d.items.length).toBeGreaterThan(0);
  });

  // ── L2: 鉴权 ──
  it("[P0][L2] 无 token → 被拒绝", async () => {
    let c: McpClient | null = null;
    let failed = false;
    try {
      c = await McpClient.fromEnv({ noAuth: true });
      const r = await c.callTool(TOOL, { keyword: "AI" });
      if (r.isError) failed = true;
    } catch { failed = true; }
    finally { await c?.close(); }
    expect(failed).toBe(true);
  });

  // ── L2: 幂等性 ──
  it("[P0][L2] 同参数两次结果一致", async () => {
    const args = { keyword: "AI", limit: 3 };
    const a = parseToolResult(await client.callTool(TOOL, args)).data;
    const b = parseToolResult(await client.callTool(TOOL, args)).data;
    expect(stripVolatile(a)).toEqual(stripVolatile(b));
  });
});
```

---

## 四、Quota / Rate-limit 处理

部分 MCP server 有每日调用配额（如 CTS MCP search=10 calls/day）。在 `beforeAll` 里探测：

```ts
beforeAll(async () => {
  client = await McpClient.fromEnv();
  try {
    const probe = await client.callTool(TOOL, { keyword: "test", limit: 1 });
    const { isError, data } = parseToolResult(probe);
    if (isError) {
      const e = data as { errorCode?: string };
      if (e.errorCode?.includes("QUOTA") || e.errorCode?.includes("RATE_LIMIT")) {
        quotaExhausted = true;
      }
    }
  } catch { /* probe 失败忽略 */ }
});

// 在消耗 quota 的用例里：
it("xxx", async (ctx) => {
  if (quotaExhausted) return ctx.skip();
  // ...
});
```

---

## 五、离线模式

当 MCP server 尚未部署时，设置 `MCP_OFFLINE=1`：

```sh
# Windows PowerShell
$env:MCP_OFFLINE=1; bun vitest run "$WHITEBOX_DIR/vitest/"

# Git Bash
MCP_OFFLINE=1 bun vitest run "$WHITEBOX_DIR/vitest/"
```

所有 `describe.skipIf(OFFLINE)` 块自动 skip，产出 0 failed / N skipped，不阻断流程。

---

## 六、discover.ts 与 Vitest 的协作

`discover.ts` 负责从运行中的 MCP server 抓取工具 schema，输出供**测试生成**使用：

```sh
bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/discover.ts" \
  --url "$MCP_SERVER_URL" \
  --tools "search_enterprises,get_enterprise" \
  --auth-env "MCP_AUTH_TOKEN" \
  --out "$WHITEBOX_DIR/mcp-discovery.json"
```

生成阶段（Phase 5d）读取 `mcp-discovery.json` 中每个工具的 `inputSchema`，结合 `--prd` 文档（如有），按 §一 L1+L2 模板生成 Vitest spec。

**不使用 `runner.ts` 执行 MCP 测试**。`runner.ts` 的 `kind: mcp-http` 适合对单个调用做 LLM 裁决抽样，而 L1+L2 Vitest 覆盖更全面、可重复、可 CI 化。

---

## 七、MCP Server URL 来源

| 场景 | 设置方式 |
|---|---|
| 本地开发（无插桩，直连已跑起来的实例） | `.env` → `MCP_SERVER_URL=http://localhost:PORT/mcp` |
| 测试环境 | `.env` → `MCP_SERVER_URL=https://your-mcp.example.com/mcp` |
| 无 server（离线生成）| 不设 URL，直接按源码 `server.tool()` 声明推断 schema（`--prd` 如有可作补充背景），设 `MCP_OFFLINE=1` 执行 |
| 本地可起服务 + 插桩（§八） | 不用 `MCP_SERVER_URL`，`McpClient.fromEnv({ serverUrl: instrumentedServer.url })` 直接覆盖 |

---

## 八、本地插桩（`InstrumentedMcpServer`）

**判定**：MCP server 源码是否能在同一文件/同一包内找到本地启动入口（`Bun.serve(` / `.listen(` / `createServer(`）。能 → 走本节；只能远程访问 / 找不到入口 → 维持 §一～§七 的纯黑盒不变。

**和 Tool 插桩（instrumentation.md §2a）的关键差异**：Tool 是 runner.ts 同进程 import 后直接调 `execute()`，插桩靠 monkey-patch 同进程 logger 拿证据；MCP server 是独立进程，只能靠 spawn 子进程 + 采集其 stdout 拿证据，判定方式也不同——**始终是 Vitest 断言，不接 `claude -p`**。插桩只是多一份诊断材料，不改变通过/失败的判定依据。

### 插桩规则

对 `server.tool(name, description, schema, async (args) => {...})` 的 handler 回调体插 2 个探针（`tool.input`/`tool.output`，同 instrumentation.md §2a 的探针 1/2 写法），仅当 handler 内部还调用上游 provider 时才追加探针 3/4。探针用 `console.log(JSON.stringify({ event: "<prefix>-debug.<stage>", ... }))`，env-var 门控（如 `DEMO_MCP_DEBUG`），不需要 mira 的共享 logger 单例——反正是走子进程 stdout，不是同进程 monkey-patch。

参考实现：`scripts/demo-mcp-server.ts` 里 `add`/`greet` 两个工具的 `probe()` 调用。

### 测试文件结构（在 §三模板基础上，`beforeAll`/`afterAll` 换成 spawn 实例）

```ts
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { InstrumentedMcpServer, McpClient, parseToolResult } from "<path>/mcp-client.js";

const ENTRY_FILE = path.resolve(import.meta.dirname, "<相对路径>/<已插桩的 server 入口文件>");

describe("add", () => {
  let server: InstrumentedMcpServer;
  let client: McpClient;

  beforeAll(async () => {
    server = await InstrumentedMcpServer.spawn({
      entryFile: ENTRY_FILE,
      cwd: path.dirname(ENTRY_FILE),
      debugEnvVar: "DEMO_MCP_DEBUG",   // 对应插桩里判断的 env var
    });
    client = await McpClient.fromEnv({ serverUrl: server.url });
  });

  afterAll(async () => {
    await client.close();
    await server.close();             // 杀掉子进程，别留孤儿 bun 进程
  });

  // 失败时把探针证据打到输出里，仅作诊断参考——不影响这条 it() 本身的 pass/fail
  afterEach((ctx) => {
    const lines = server.drainProbeLogs("demo-debug.");
    if (ctx.task.result?.state === "fail" && lines.length)
      console.log(`\n[probe evidence — ${ctx.task.name}]\n${lines.join("\n")}`);
  });

  // ...L1 + L2 用例，和 §三模板完全一样，只是 client 连的是 server.url 而不是 MCP_SERVER_URL
});
```

`InstrumentedMcpServer.spawn()` 用 `bun run <entryFile>` 启动子进程，随机挑一个空闲端口（或 `port` 显式指定），把 `debugEnvVar=1` 注入子进程环境；`drainLogs()`/`drainProbeLogs(prefix)` 取出并清空缓冲的 stdout/stderr 行；`waitUntilReady()` 只探测端口是否已在监听，不做完整 MCP 握手校验（握手交给 `McpClient`）。

### 沙箱与清理

插桩发生在 Mode B 沙箱（同 Tool 插桩，见 qa-whitebox.md Phase 2）内的 server 源文件拷贝上，测试结束后：
1. `afterAll` 里 `server.close()` 杀掉本次 spawn 的子进程
2. Phase 7 `git worktree remove --force` 删沙箱（连同插桩过的源文件一起删）

不会污染 `SOURCE_PROJECT_DIR` 里的真实源码——插桩永远只发生在沙箱拷贝上。
