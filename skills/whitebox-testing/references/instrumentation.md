# Instrumentation Reference

插桩规则、用例生成、config schema、执行命令的完整参考。适用于三种目标：vercel-ai tool、MCP tool、sub-agent。

---

## 一、4 探针模型（通用）

所有目标都用 4 个逻辑探针，只是挂载位置不同：

| 探针 | 捕获内容 | Tool | MCP | Sub-agent |
|---|---|---|---|---|
| `input` | 进入被测单元的入参 | `execute()` 第一行 | `callTool()` 参数 | `runRealTeammateOneshot()` 入参 |
| `output` | 最终返回值 | IIFE 出口 | 返回值 | 函数出口 |
| `request` | 向 provider / LLM 发出的请求 | `fetch()` 之前 | N/A（黑盒） | `onStepFinish` 里的 `toolCalls[]` |
| `response` | provider / LLM 的原始响应 | `res.json()` 之后 | N/A | `onStepFinish` 里的 `toolResults[]` |

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

**Bun monorepo 的 node_modules 限制（重要）**：

bun 使用 hoisted 格式（`node_modules/.bun/<pkg>@version/`），不从 git worktree 子目录向上遍历。即使 `SANDBOX_DIR` 在 `SOURCE_PROJECT_DIR` 内，从沙箱路径 `import` 的文件也无法解析 pino、zod 等依赖。

**绕法**：不在沙箱内直接执行，改为在 `SOURCE_PROJECT_DIR` 根目录创建临时探针入口文件，从那里 `import` 沙箱内已插桩的 tool 文件，完成调用后删除入口文件。

```ts
// <SOURCE_PROJECT_DIR>/office-tools-probe-entry.ts （临时文件，测完删除）
import { officeTool } from "./.qa-sandboxes/wb-<slug>/apps/mira-work/lib/ai/tools/office-tools";
// runner 调用此文件，而非直接 import 沙箱路径
```

runner.ts 的 `sourceProjectDir` 仍指向沙箱（供 `.env` 加载），但 `factoryFile` 指向主库根目录的临时入口文件。测试结束后（无论成功失败）删除临时入口文件。

---

### 2b — MCP Server Tool

MCP 模式**不插桩源码**，也**不使用 runner.ts**。

生成标准 Vitest spec（L1 协议层 + L2 行为层），通过 `McpClient.fromEnv()` 直连 MCP server 执行测试。方法论详见 `references/mcp-testing.md`。

**前置步骤 — discover.ts 抓取工具 schema**：

```sh
bun $QA_WORKSPACE_DIR/skills/whitebox-testing/scripts/discover.ts \
  --url <MCP server URL> \
  --tools <comma-separated tool names> \
  --auth-env <env var holding Bearer token> \
  --out $WHITEBOX_DIR/mcp-discovery.json
```

输出的 `mcp-discovery.json` 包含每个工具的 `inputSchema`，供 Phase 5d 生成 Vitest spec 时使用。

**生成的测试文件**：`$WHITEBOX_DIR/vitest/<tool-name>.test.ts`，与 Mode A 同目录，统一由 vitest run 执行。

**测试分层**（`mcp-testing.md` §一）：
- L1 schema 合规：不消耗 quota，可反复运行
- L2 行为测试：happy path / 鉴权 / 边界 / 幂等性 / 分页

**共享库**：`scripts/mcp-client.ts` 提供 `McpClient`、`parseToolResult`、`stripVolatile`。

---

### 2c — Sub-agent (`runRealTeammateOneshot`)

Sub-agent 测试**不插桩源码**，而是由 runner.ts 调用 `runRealTeammateOneshot()` 时注入 `onStepFinish` 回调，捕获 LLM 的每一步工具调用和返回值。

**前提条件（重要）**：runner.ts 的 sub-agent executor 假设工厂函数接受 `(task: string, opts: Record)` 的简化接口。若项目的工厂函数签名是 `(job: TeammateOneshotJobData, deps: SubAgentFactoryDeps)`（mira 的实际情况），且 deps 依赖 DB/Redis/Langfuse/Sentry 等基础设施，则**无法在沙箱内直接调用**。

| 场景 | 适用 | 处理方式 |
|---|---|---|
| 工厂函数接受 `(task, opts)` 或有简化入口 | ✅ | 正常用 runner.ts sub-agent executor |
| 工厂函数依赖完整基础设施（如 mira）| ❌ | 在集成测试环境运行；runner.ts config 仅作用例设计文档 |

**config 中 sub-agent entry 格式**：
```json
{ "kind": "sub-agent", "factoryFile": "<abs path to sub-agent-factory.ts>", "agentType": "research" }
```

可选字段：`modelId`（覆盖模型）、`allowedTools`（限制工具列表）。

**捕获机制**（runner.ts 内部）：

| 捕获点 | 捕获内容 |
|---|---|
| `runTeammateOneshot()` 入参 | case input（task 字符串） |
| `onStepFinish` 回调 | `toolCalls[]`（工具名 + 入参）、`toolResults[]` |
| `runTeammateOneshot()` 返回值 | 最终 output |

**Sub-agent 用断言裁决，不走 `claude -p`**（避免双重 LLM 成本）。在 case 中声明断言：

```json
{
  "name": "research-happy",
  "tool": "research-agent",
  "description": "agent 成功使用搜索工具并返回摘要",
  "steps": [{ "input": { "task": "总结量子计算的最新进展" } }],
  "expect": "ok",
  "expectToolSequence": ["web_search"],
  "expectOutputShape": { "type": "completed", "result": "__string__" }
}
```

`expectOutputShape` 支持的类型占位符：`"__string__"`、`"__number__"`、`"__boolean__"`、`"__truthy__"`、`"__array__"`、`"__object__"`；其他值做 JSON 精确匹配。

**每个 sub-agent case 消耗真实 token**，建议每个 agent 测 3–5 条核心 case。

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
| { kind: "vercel-ai", module: string, factory: string, descriptionExport: string }
| { kind: "mcp-http",  serverUrl: string, toolName?: string, authTokenEnv?: string | null }
| { kind: "sub-agent", factoryFile: string, agentType: string, modelId?: string, allowedTools?: string[] }
```

---

## 五、执行命令

所有入口统一为：`$QA_WORKSPACE_DIR/skills/whitebox-testing/scripts/runner.ts`

### 主流程（一键执行，所有 kind 通用）

```sh
RUNNER=$QA_WORKSPACE_DIR/skills/whitebox-testing/scripts/runner.ts
REPORTS=$QA_WORKSPACE_DIR/tests/reports/tool-probe

bun $RUNNER \
  --config $REPORTS/config-<runId>.json \
  --report $REPORTS/report-<runId>.md
```

脚本内部自动完成：
1. **validate** — schema + 语义检查，失败直接 exit 1
2. **run** — 执行所有 case → 写 `evidence-<runId>.jsonl`（vercel-ai 自动加载 `sourceProjectDir/.env` 并开启 debug var）
3. **judge** — LLM 裁决（sub-agent 走断言，其余走 `claude -p`）→ 写 `report-<runId>.md`

并发由 `CLAUDE_JUDGE_CONCURRENCY`（默认 1）控制。在 Claude Code session 内必须保持 1，并行 `claude -p` 会被 kill（exit 9）。

### MCP 工具发现（仅 mcp-http，独立前置步骤）

```sh
DISCOVER=$QA_WORKSPACE_DIR/skills/whitebox-testing/scripts/discover.ts

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
