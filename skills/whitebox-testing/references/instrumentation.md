# Instrumentation Reference

插桩规则、用例生成、config schema、执行命令的完整参考。插桩适用于两类目标：vercel-ai tool、可本地起服务的 MCP server（远程部署的 MCP 只能黑盒，见 §2b）。Sub-agent 不插桩，设计上直接走 Mode A（见 §2c）。

---

## 一、4 探针模型（通用）

两类插桩目标都用 4 个逻辑探针，只是挂载位置不同：

| 探针 | 捕获内容 | Tool (`execute()`) | MCP（本地可起服务时插桩，`server.tool()` handler） |
|---|---|---|---|
| `input` | 进入被测单元的入参 | `execute()` 第一行 | handler 回调第一行 |
| `output` | 最终返回值 | IIFE 出口 | IIFE 出口 |
| `request` | 向 provider / LLM 发出的请求 | `fetch()` 之前 | `fetch()` 之前（仅当 handler 内部调用了上游 provider） |
| `response` | provider / LLM 的原始响应 | `res.json()` 之后 | `res.json()` 之后（同上，视情况 N/A） |

MCP server 是独立进程，探针日志走子进程 stdout 而不是同进程 logger monkey-patch，见 §2b。远程部署、无法本地起服务的 MCP 没有源码可插，只能黑盒（Vitest L1+L2，不产出探针证据）。

探针统一格式（vercel-ai tool 示例）：
```ts
if (process.env.<PREFIX>_TOOL_DEBUG === "1")
  logger.info("[<prefix>-debug] <stage>", { event: "<prefix>-debug.<stage>", ...data });
```

**共同约束**：
- 每个探针都是 env-var 门控——不开不执行，零运行时开销
- 不记录 `Authorization` header（防泄漏）
- 不创建新文件，不改变函数返回语义

---

## 二、按目标插桩

### 2a — Tool (vercel-ai `execute()`)

**需要的 discovery 信息**：`toolFile`、`executeStart/End`、`providerFile`、`providerFetchLine`、`providerResponseLine`

**探针 1 — tool.input**：`execute` 函数体第一行（跳过空行/注释）

```ts
execute: async (input: I): Promise<O> => {
  if (process.env.GH_TOOL_DEBUG === "1") logger.info("[gh-debug] tool.input", { event: "gh-debug.tool.input", tool: "github_search", input });
  // ... 原始代码
}
```

**探针 2 — tool.output**：用 IIFE 包裹函数体（处理多 return 路径）

```ts
execute: async (input: I): Promise<O> => {
  if (process.env.GH_TOOL_DEBUG === "1") logger.info("[gh-debug] tool.input", { ... });
  const result: O = await (async (): Promise<O> => {
    // ... 原始函数体（字节对字节不变）...
  })();
  if (process.env.GH_TOOL_DEBUG === "1") logger.info("[gh-debug] tool.output", { event: "gh-debug.tool.output", tool: "github_search", result });
  return result;
}
```

IIFE 的 `Promise<O>` 必须与函数声明返回类型一致；`await` + `()` 不能漏。

**探针 3 — provider.request**：`fetch()` 调用之前，URL/headers/body 已构建完成时

```ts
if (process.env.GH_TOOL_DEBUG === "1") logger.info("[gh-debug] provider.request", { event: "gh-debug.provider.request", method, path, url, query });
const res = await fetch(url, { method, headers, body });
```

**探针 4 — provider.response**：`res.json()` 之后，rate-limit header 读完之后

```ts
const data = await res.json();
const rateLimitRemaining = Number(res.headers.get("x-ratelimit-remaining") ?? 0);
if (process.env.GH_TOOL_DEBUG === "1") logger.info("[gh-debug] provider.response", { event: "gh-debug.provider.response", statusCode: res.status, rateLimitRemaining, data });
```

**Logger 导入规则（mira 特有）**：

| 文件位置 | 使用的 logger |
|---|---|
| `apps/mira-work/lib/ai/tools/*.ts` | `import { logger } from "@/lib/logger/server"` |
| `packages/sourcing/src/providers/**/*.ts` | `import { logger } from "@mira/observability/logger/server"` |
| 其他 packages | 先 grep `export.*logger`，找到后沿 package 路径引入 |
| 都找不到 | 退回 `console.log`（同样 env-var 门控），留 TODO 注释 |

同一文件不同 logger 不统一，各自用自己的。

**Prefix 命名**：工具名下划线分段的最长公共前缀。`github_search + github_lookup` → `GH`（env var `GH_TOOL_DEBUG`，event prefix `gh-debug`）。逻辑在 `runner.ts` 内部的 `derivePrefix()` 函数中。

**插桩校验清单**（每次 Edit 后执行）：
1. 括号平衡
2. IIFE 内的原始代码字节对字节未变
3. logger import 存在
4. 无第 5 个探针

**目标是 `export const xTool = createTool(...)` 直接导出对象、不是工厂函数时**：`runner.ts` 的 `createVercelExecutor` 假设 `config.tools[key].factory` 指向一个**工厂函数**（`() => { execute }`），直接对一个已构造好的对象调用会因为 `typeof factory !== "function"` 报错 `does not export factory`。不要为了这一种情况改 runner.ts 的执行器逻辑——按插桩时已经在做的"给 description 常量加 `export`"同一思路，在同一次 Edit 里补一个一行的工厂包装导出：

```diff
 export const xTool = createTool({ ... });
+export function __qaWhiteboxToolFactory() { return xTool; }
```

config 里 `factory` 字段填 `"__qaWhiteboxToolFactory"`。这是插桩阶段允许的第二类"逻辑相邻但非业务逻辑"改动（第一类是 description 常量加 `export`），同样要求：只加这一行导出，不改 `xTool` 本身的定义或 `createTool(...)` 的调用方式。

**Bun monorepo 的 node_modules 解析规则（重要）**：

bun 从被 import 文件的所在目录向上遍历，逐级查找 `node_modules`。只要 `SANDBOX_DIR` 在 `SOURCE_PROJECT_DIR` 内部（即 `SOURCE_PROJECT_DIR/.qa-sandboxes/wb-<slug>/`），解析路径如下：

```
sandbox/apps/mira-work/lib/ai/tools/office-tools.ts
  → sandbox/apps/mira-work/node_modules/  ← 从模板复制来的独立副本（见 qa-whitebox.md Phase 2）✓
  → sandbox/apps/node_modules/             ← 不存在
  → sandbox/node_modules/                 ← 不存在
  → SOURCE_PROJECT_DIR/.qa-sandboxes/node_modules/ ← 不存在
  → SOURCE_PROJECT_DIR/node_modules/      ← ✓ 找到！含 .bun 缓存 + @opentelemetry/api（真实目录，自然嵌套向上找到，只读，不涉及连接/拷贝）
```

**结论**：sandbox 在 `SOURCE_PROJECT_DIR` 内 + Phase 2 对每个含 `node_modules` 的 `apps/*`/`packages/*` **从模板复制**（不只 mira-work + shared，见 qa-whitebox.md Phase 2）→ 所有依赖（含 `.bun` 缓存的 peer dep、`loggerModule` 落在其他包时需要的 pino 等）均可解析，runner.ts 可直接 import 沙箱内的工具文件，**无需临时入口文件**。**必须覆盖全部含 node_modules 的包**——遗漏的包若正好是 `loggerModule` 所在包，会 `Cannot find package`，且 runner.ts 只打警告不中止，容易被忽略。

**常见配置错误 — sandbox 放错位置**：被错误地放到 `QA_WORKSPACE_DIR`（qa_agent 目录）下，bun 走不到 mira 的 `node_modules`，`.bun` peer dep 断裂并 fatal error。修复：确认 `SANDBOX_DIR = SOURCE_PROJECT_DIR/.qa-sandboxes/wb-<slug>`。

**沙箱内仍然不建议运行 `bun install`**：会让探针环境的依赖版本跟模板脱节，且沙箱本来就要被整个删除，装了纯粹浪费时间。

**正确做法**：sandbox 只做文件插桩（Edit/Write），runner.ts 直接 import 沙箱文件，node_modules 通过 Phase 2 的模板拷贝准备好，**运行阶段零 install 操作**。

---

### 2b — MCP Server Tool

判定方式和执行是否插桩由**能否在沙箱内本地起服务**决定,不看 MCP server 部署在哪里:

| 场景 | 判定依据 | 执行方式 |
|---|---|---|
| **本地可起服务** | 能在同一个文件/同一 package 内找到 `Bun.serve(` / `.listen(` / `createServer(` 等启动调用,即整个 server 可以 `bun run <entryFile>` 独立跑起来 | **插桩**：4 探针 + 沙箱内 spawn 子进程 + `McpClient` 连本地端口 + Vitest L1+L2,探针证据作补充诊断 |
| **仅远程 / 无本地入口** | 找不到本地启动入口(纯部署态,或入口分散在难以确定性识别的位置) | **纯黑盒**：不插桩,`McpClient.fromEnv()` 直连 `MCP_SERVER_URL`,Vitest L1+L2(和之前一样) |

两种场景**判定与断言方式都不变**——始终是 Vitest L1+L2,`claude -p` 不参与 MCP 判定。插桩只是在能力允许时，多产出一份探针证据，供失败时诊断参考，不是新的裁决通道。方法论完整细节（含黑盒兜底、quota 处理、离线模式）见 `references/mcp-testing.md`。

**本地可起服务时的插桩规则**：

**探针 1 — tool.input**：`server.tool(name, description, schema, async (args) => {...})` handler 回调体第一行

```ts
server.tool("add", "...", { a: z.number(), b: z.number() }, async ({ a, b }) => {
  if (process.env.DEMO_MCP_DEBUG === "1") logger.info("[demo-debug] tool.input", { event: "demo-debug.tool.input", tool: "add", input: { a, b } });
  // ... 原始代码
});
```

**探针 2 — tool.output**：IIFE 包裹 handler 主体（多 return 路径场景）

```ts
async ({ a, b }) => {
  if (process.env.DEMO_MCP_DEBUG === "1") logger.info("[demo-debug] tool.input", { ... });
  const result = await (async () => {
    // ... 原始 handler 主体（字节对字节不变）...
  })();
  if (process.env.DEMO_MCP_DEBUG === "1") logger.info("[demo-debug] tool.output", { event: "demo-debug.tool.output", tool: "add", result });
  return result;
}
```

**探针 3/4 — provider.request/response**：仅当 handler 内部还会调用上游 provider（`fetch()`）时才插，规则和 Tool 的探针 3/4（§2a）完全一致。多数 MCP tool 是纯计算/纯数据库查询，没有上游 provider，探针 3/4 N/A。

**Logger 规则**：MCP server 没有 mira 的 `@/lib/logger/server` 时,直接 `console.log`（同样 env-var 门控）即可——探针日志走子进程 stdout，不需要 monkey-patch 一个共享 logger 单例。

**执行机制（spawn + 采集 stdout）**：

1. 在沙箱内对目标 `server.tool()` handler 完成插桩（同 §2a 的 Edit 校验流程：括号平衡、IIFE 内原始代码字节对字节不变、无第 5 个探针）
2. 用 `scripts/mcp-client.ts` 的 `InstrumentedMcpServer.spawn()` 启动沙箱内的 entry 文件（`bun run <entryFile>`），设 `PORT=<空闲端口>` + `<DEBUG_ENV_VAR>=1`
3. Vitest spec 里用 `McpClient.fromEnv({ serverUrl: instrumentedServer.url })` 连接这个本地实例，跑既有 L1+L2 case
4. 用例失败时，从 `instrumentedServer.drainLogs()` 取出该次调用期间捕获的探针行，附到失败输出里（诊断用，不影响 pass/fail）
5. `afterAll` 里 `instrumentedServer.close()` 杀掉子进程

**共享库**：`scripts/mcp-client.ts` 提供 `McpClient`、`parseToolResult`、`stripVolatile`、`InstrumentedMcpServer`。

---

### 2c — Sub-agent

Sub-agent **设计上就是 Mode A**，不走 runner.ts 直调、不插桩。原因不是"实测发现走不通再退回"，而是先天条件不满足：runner.ts 的探针+`claude -p`裁决模型假设被测单元能在沙箱内被隔离调用（同进程 import 或独立 HTTP 端点），但 sub-agent 的工厂函数（如 mira 的 `sub-agent-factory.ts`）依赖 DB/Redis/Langfuse/Sentry 等基础设施，且含 `server-only`（Next.js 专属包）——项目里没有这些基础设施的隔离测试环境（mock server、测试数据库等），做不到真正"直调"，所以从一开始就不设计 Mode B 路径。

正确做法：mock 掉阻断层，专注测分支逻辑，走 **Mode A（Vitest 单元测试）**：

```ts
// vitest 测试文件示例
vi.mock('server-only', () => ({}))            // 绕过 Next.js 专属包
vi.mock('@/lib/db', () => ({ registry: vi.fn() }))  // mock 基础设施

import { buildSystemPrompt, pickTools } from '@/lib/ai/sub-agent-factory'

test('when agentType is research, includes search tools', () => {
  expect(pickTools('research')).toContain('web_search')
})
```

`z.object is not a function` 报错是 **vitest SSR 特有问题**（已验证），plain bun + 普通 vitest 均不受影响，不代表源码有 bug。

`classify-diff.ts` 已将 sub-agent 相关文件按 `server-logic`/`util` 归入 `modeA`（见脚本内注释），不存在独立的 "modeB.subAgent" 分类。

### 2c 已知坑（sub-agent 场景实测踩过）

每条第一行是结论/正确做法，后面是踩坑经过（可选阅读）。

**坑 1 — 同一个 `@mira/*` specifier 需要不同行为时，合并成一次 `vi.mock` 调用，不要分开写。**

`qa-whitebox.md` Phase 6 的 `vitest.whitebox.config.ts` 模板用 `{ find: /^@mira\/.*/, replacement: ".../mira-workspace-stub.ts" }` 兜底所有 `@mira/*` 导入。这条正则命中的是**物理文件**，不是逐个 specifier——`@mira/agent-os-core` 和 `@mira/agent-os-core/mcp/mcp-connector-loader` 会被解析成同一个 module id。这个坑不限于两个 specifier：实测一个文件同时 import 了 5 个不同的 `@mira/*` 子路径（`@mira/agent-os-core`、`.../mcp/mcp-connector-loader`、`@mira/db-schemas/agent-os`、`@mira/db-schemas/user-platform`、`@mira/user-platform/billing`），全部落到同一个 module id 上——任意一个 specifier 需要的导出符号，必须出现在**唯一那一次** `vi.mock` 调用返回的对象里，漏一个都会报 "No X export is defined"。如果两个不同的测试文件（或同一文件里两次）分别对其中任意两个 specifier 单独调用 `vi.mock(...)` 想各自配置不同的行为，后写的那次会静默覆盖前一次，两边都拿到同一份 mock，且不会报错——只会表现为某个断言莫名其妙拿到不该有的返回值。需要独立行为时，也可以按 SKILL.md「跨仓库测试注意事项」给该子路径单独加一条排在正则之前的 alias 条目。

**坑 2 — `@opentelemetry/api` 不能整体空 stub，若新增分支直接调用 otel API，给这个 specifier 单独 alias 一个只 mock `trace.getActiveSpan()`、其余真实透传的局部 stub。**

Phase 6 模板默认把 `@opentelemetry/api` alias 到空 stub（`test/stubs/empty-stub.ts`），这个假设只在"otel 只是被间接 import、没人真调它"时成立——多数 sub-agent 文件确实如此。但如果本次 diff 新增的分支直接调用 `context.with()` / `trace.setSpan()` / `trace.getActiveSpan()`，空 stub 会让这些调用直接抛错（空对象没有这些方法）。

**坑 3 — 裸 vitest 里不要指望 `context.with()` 能跨 `await` 存活，直接 `vi.mock`/`vi.spyOn` 掉 `trace.getActiveSpan` 本身。**

即使坑 2 里保留了真实的 `context.with()` 实现，裸 vitest 环境默认的 context manager 是同步栈式的（`@opentelemetry/api` 默认导出的 `ContextAPI`），没有 mira 生产环境 NodeSDK 挂的 `AsyncLocalStorageContextManager`。测试里如果依赖 `context.with(ctx, async () => { ... await xxx ... trace.getActiveSpan() ... })` 这种跨 `await` 后还能拿到同一个 span 的行为，在裸 vitest 里不会成立。

**坑 4 — 大编排函数（如依赖 `ToolLoopAgent` 的巨型导出函数）先枚举全部 import 逐个定 mock 策略，再对编排依赖手搓一个可控 fake class（覆盖正常结束/抛异常/中途 abort 三种收尾路径），不要试图 mock 出它的完整真实行为。**

真实场景里，新增分支往往埋在像 `sub-agent-factory.ts` 里唯一一个巨型导出函数内部，依赖十几个外部模块（DB、Redis、Langfuse、Agent SDK 的 `ToolLoopAgent` 等）。漏枚举一个 import 就会在运行时才暴露 `Cannot find module` 或 `xxx is not a function`。fake class 构造时注入 `streamBehavior`，测试里通过切换它驱动被测函数走到目标分支。

**坑 5（本次实测新发现）— `vi.mock("ai", ...)` 这类裸 npm 包在跨仓库布局下可能静默不生效，用 `run-mode-a.ts` 的自动 alias 机制（或 `--extra-alias-file`）把该 specifier 显式重定向，而不是只写 `vi.mock`。**

测试文件在 qa_agent 仓库、被测源码 import 自 mira 仓库这个具体组合下，`vi.mock("ai", ...)` 实测出现过完全不拦截的情况——`new ToolLoopAgent(...)` 时构造的是 node_modules 里真实安装的 `ai` 包的类，不是 mock 提供的 fake class，且不报错，只在真实类的运行时校验（如 `model.specificationVersion`）失败时才会暴露成一个看似无关的异常。`run-mode-a.ts` 已经把"扫描裸第三方 import 并 alias 到其在 miraWork 里的真实解析路径"做成自动机制（同一个 specifier 经 alias 重写后，`vi.mock` 才能可靠拦截到同一个 module id）；需要可控 mock 行为的包用 `--extra-alias-file` 传 `{ specifier: 绝对 stub 路径 }` 覆盖自动探测。已验证：修复前 mock 实例数为 0（真实类被构造），修复后为 1。

---

## 三、用例生成（Cases）

### 输出 schema（必须符合 `runner.ts` 顶部 Schema 定义）

```ts
{
  name: string,                  // kebab-case，如 "search-user-happy"
  tool: string,                  // 必须是 config.tools 的 key
  description: string,           // 中文一句话
  steps: [{ input: Record<string, unknown> }],
  expect: "ok" | "tool_error",
  expectErrorCode?: string | null,
  judgeFocus?: string,           // ≤80 字，告诉 judge 核对什么
  tokenOverride?: string | null, // null=删除 env var; string=临时替换
  acceptPartialAsPass?: boolean
}
```

### 7 类必备（≥ 5/7 产出真实 case）

| # | 类别 | 触发条件 | 典型 case 名 |
|---|---|---|---|
| ① | happy path（每个 input mode）| 任意 | `search-user-happy` |
| ② | input-schema 校验（缺 required / 错类型）| 有 required 字段 | `search-missing-q` |
| ③ | 本地早拒（local validation）| tool 源码有 if-throw | `search-invalid-sort` |
| ④ | 数值钳制 / 归一化 | 有 numeric 字段 | `search-per-page-zero` |
| ⑤ | provider 错误映射 | `hasProvider=true` | `lookup-not-found` |
| ⑥ | 边界 / edge | 任意 | `search-empty-result` |
| ⑦ | auto-behavior（文档明确的自动行为）| 有文档记载 | `lookup-user-redirect-org` |

N/A 规则：无 numeric → ④ N/A；`hasProvider=false` → ⑤ N/A；无 auto-behavior 文档 → ⑦ N/A。

**大列表限流**：会返回 list 的 case，input 里加 `per_page: 3` 或 `limit: 3`，防 8KB 截断。

### 去重

比对单位：`{ tool, inputSnapshot, expect, expectErrorCode }`（inputSnapshot = key 排序后的 JSON.stringify）。`--extra-case` 用户传入的 case 强制保留，不参与去重。

---

## 四、Config Schema

runner.ts 启动时用 zod 校验整个 config，不符合直接退出。

```ts
{
  runId: string,                    // ISO timestamp，":","." 替换为 "-"
  sourceProjectDir: string,         // 沙箱绝对路径（pipeline 自动从此处加载 .env）
  loggerModule: string | null,      // logger .ts 绝对路径（vercel-ai 必填，其余填 null）
  tools: Record<string, ToolEntry>, // key = case 中引用的工具名
  authEnvVar: string | null,        // 鉴权 env var 名（vercel-ai tokenOverride 用）
  debugEnvVar: string,              // 探针开关 env var，如 "GH_TOOL_DEBUG"
  eventPrefix: string,              // 探针日志前缀，如 "gh-debug"
  cases: TestCase[],
  evidenceOutPath: string,          // evidence JSONL 绝对路径（自动生成）
}

// ToolEntry 判别联合（kind 必填）：
| { kind: "vercel-ai", module: string, factory: string, descriptionExport: string, hasProvider?: boolean }
// 注意：MCP 目标不在此 config 内——MCP 走 discover.ts / InstrumentedMcpServer → Vitest，不走 runner.ts。
// Sub-agent 不在此 config 内——设计上就是 Mode A，见 §2c。
```

**`hasProvider`**（默认 `true`）：这个工具的 `execute()` 是否会真的向外部 provider 发一次 `fetch()`。对于内部纯计算/委托给其他内部逻辑、从不出站请求的工具，显式设为 `false`——judge 提示词会换成 `EVIDENCE_MODEL_WHITEBOX_NO_PROVIDER`，明确告诉 judge "这个工具按设计没有 provider.request/response，缺失不算问题"。判断依据同 §三 case 分类表 `⑤ provider 错误映射` 的 `hasProvider=false → N/A`。

---

## 五、执行命令

所有入口统一为：`$QA_AGENT_ROOT/skills/whitebox-testing/scripts/runner.ts`（脚本物理位置固定在 qa_agent 仓库内，不跟随 `QA_WORKSPACE_DIR`；报告输出路径仍用 `QA_WORKSPACE_DIR`，供 E2E 的 combined summary 汇总）

### 主流程（vercel-ai kind）

> **MCP 不走此路径**。MCP 目标通过 discover.ts / `InstrumentedMcpServer` + Vitest L1+L2 测试（qa-whitebox Phase 5d），不经过 runner.ts。Sub-agent 也不走此路径——设计上是 Mode A（vi.mock + Vitest），见 §2c。

```sh
RUNNER=$QA_AGENT_ROOT/skills/whitebox-testing/scripts/runner.ts
REPORTS=$QA_WORKSPACE_DIR/tests/reports/tool-probe

bun $RUNNER \
  --config $REPORTS/config-<runId>.json \
  --report $REPORTS/report-<runId>.md
```

脚本内部自动完成：
1. **validate** — schema + 语义检查，失败直接 exit 1
2. **run** — 执行所有 case → 写 `evidence-<runId>.jsonl`（vercel-ai 自动加载 `sourceProjectDir/.env` 并开启 debug var）
3. **judge** — `claude -p` 裁决 → 写 `report-<runId>.md`

并发由 `CLAUDE_JUDGE_CONCURRENCY`（默认 1）控制。在 Claude Code session 内必须保持 1，并行 `claude -p` 会被 kill（exit 9）。

### MCP 工具发现（独立前置步骤，仅 whitebox MCP 流程）

```sh
DISCOVER=$QA_AGENT_ROOT/skills/whitebox-testing/scripts/discover.ts

bun $DISCOVER \
  --url <MCP server URL> \
  --tools <comma-separated names> \
  --auth-env <env var holding Bearer token> \
  --out $REPORTS/discovery-<runId>.json
```

---

## 六、Evidence Row 格式

```ts
{
  name: string,
  tool: string,
  toolDescription: string,
  description: string,
  expect: "ok" | "tool_error",
  expectErrorCode?: string | null,
  judgeFocus?: string,
  acceptPartialAsPass?: boolean,
  evidence: {
    steps: Array<{
      input: Record<string, unknown>,
      output: unknown,           // null if threw
      logs: Array<{ event: string, data: Record<string, unknown> }>,
      threw?: string,
    }>
  }
}
```

任何 object > 8192 chars 被截断为 `<前8KB>"[truncated:N]"`，input 不截。
