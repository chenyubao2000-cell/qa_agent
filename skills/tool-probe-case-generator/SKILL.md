---
name: Tool Probe Case Generator
description: 工具白盒探针用例生成器。读取 tool 的 inputSchema + description (+ 可选 PRD / extra-case)，输出直接符合 qa_agent/scripts/tool-probe/runner.ts zod schema 的 JSON cases 数组。借用 test-case-generator 的 6 法论与去重逻辑，但映射到 tool-probe 的 7 类必备分类，并在写出前用 zod 自校验。
version: 1.0.0
author: qa-platform
allowed_tools: [Read, Write, Grep, Glob, Bash]
license: MIT
testingTypes: [white-box, llm-judge]
frameworks: [vercel-ai-sdk, zod]
languages: [typescript]
domains: [tool-testing, case-ideation]
agents: [claude-code]
---

# Tool Probe Case Generator Skill

This skill is the **case ideation layer** for `/qa-tool-probe`. It produces a JSON array of test cases that the generic `qa_agent/scripts/tool-probe/runner.ts` consumes verbatim — **no intermediate Markdown, no Excel, no Playwright handoff**.

It is a sibling of `skills/test-case-generator/SKILL.md` (which targets E2E / UI flows). This skill borrows that skill's design methodology and dedup logic but produces a different output shape tailored to tool-execute() white-box probing.

## When to use

Invoke this skill in Phase 2 of `/qa-tool-probe` instead of the generic `test-case-generator` skill. Triggers:

- Caller is `/qa-tool-probe` (or any white-box tool probing flow)
- Tool exposes a Vercel AI SDK shape: `execute(input, opts) → output`
- Output target: `runner.ts` config `cases[]` field — NOT Playwright spec, NOT Excel

If the caller wants `.test.ts` / `.md` / `.xlsx`, use `test-case-generator` instead.

---

## Output Contract (MUST match runner.ts zod schema)

The runner's case schema is defined at `qa_agent/scripts/tool-probe/runner.ts:25-35`. **Every generated case MUST conform**, or runner.ts will reject the whole config at startup.

```ts
{
  name: string,                               // unique slug, e.g. "search-user-happy"
  tool: string,                               // tool key as registered in config.tools (e.g. "github_search")
  description: string,                        // one-line Chinese description of the case intent
  steps: [{ input: Record<string, unknown> }],// >= 1 step; usually 1; multi-step only for stateful tools
  expect: "ok" | "tool_error",                // gross outcome the runner expects
  expectErrorCode?: string | null,            // when expect="tool_error", the error.code judge should look for
  judgeFocus?: string,                        // one-line hint to claude -p judge — what to verify in evidence
  tokenOverride?: string | null,              // per-case auth override; null = unset that env var; string = set to value
  acceptPartialAsPass?: boolean               // if true, judge ⚠️ partial counts as pass
}
```

### Field rules

| Field | Rule |
|---|---|
| `name` | kebab-case, `<intent>-<variant>`, unique within batch. Examples: `search-user-happy`, `search-missing-q`, `lookup-org-redirect` |
| `tool` | MUST exactly match a key in `config.tools` (passed from discovery) |
| `description` | 中文一句话，说清"传什么 / 期望什么"。给 judge 当 anchor |
| `steps[].input` | 与 tool 的 inputSchema 字段名严格一致；类型刻意构造（含越界/缺字段也保持字面值，不要 fix） |
| `expect` | 只有两档：tool 正常返回 = `ok`；tool 主动 throw 或返回结构化 error = `tool_error` |
| `expectErrorCode` | 在 `expect="tool_error"` 时填 tool 源码里的 error code 字面量（如 `"not_found"` / `"auth_error"`） |
| `judgeFocus` | ≤ 80 字，告诉 judge 重点核对 evidence 中的什么。例如 `verify provider hit /search/users; items[].login present` |
| `tokenOverride` | 仅 auth 相关用例需要；不写 = 不动 env；显式 `null` = 删除 env；字符串 = 临时设值 |
| `acceptPartialAsPass` | 默认 `false`；只在 LLM-as-judge 边界模糊（如"items 数量未达上限但其他正确"）时设 true |

### Truncation hint (来自 runner.ts:80-88)

Runner 对每个字段做 8KB 截断。**会返回大列表的 case** 应在 input 里强制限流：

```json
{ "per_page": 3, "max_results": 5 }
```

否则 provider.response 会被截掉关键字段，judge 看不到全貌。

---

## 7 必备分类 × 6 设计方法的映射

`/qa-tool-probe` 命令文件 Phase 2 列了 **7 类必备 case**。每类至少生成 1 条。下表把这 7 类映射回 `test-case-generator` 的 6 法论 (`skills/test-case-generator/SKILL.md` Phase B + `references/design-methods.md`)：

| Tool-probe 类别 | 借用的设计方法 | 怎么应用 | 典型 case 名 |
|---|---|---|---|
| ① happy path | 场景法 + 等价类（每个 input mode 取一个代表） | 每个主要 `target` / `mode` 枚举值取 1 条最小可行 input | `search-user-happy`, `search-repo-happy` |
| ② input-schema 校验 | 等价类（无效类）+ 错误猜测 | 故意删除 required 字段 / 故意传错类型 | `search-missing-q`, `search-per-page-string` |
| ③ 本地早拒（local validation）| 因果图 / 决策表 | 列举 tool 源码里 `if (...) throw` 的判定条件，每个分支造 1 条 | `search-invalid-sort`, `search-bad-qualifier` |
| ④ 数值钳制 / 归一化 | 边界值分析 | 对每个 numeric input：取 0 / 1 / 上限 / 上限+1 / 负数 / 浮点 | `search-per-page-zero`, `search-page-15` |
| ⑤ provider 错误映射 | 错误猜测 + 因果图 | 构造能触发 provider 404/401/403/429/5xx 的 input，断言 mapping 后的 error code | `lookup-not-found`, `lookup-auth-missing` |
| ⑥ 边界 / edge | 边界值分析 + 场景法 | 空结果集 / 最大长度 query / 极少结果 | `search-empty-result`, `search-max-query` |
| ⑦ 自动行为 (auto-behavior) | 错误猜测 + 因果图（**不是**状态迁移）| 列文档/源码里写明的自动行为（如 `type:user → type:org redirect`、入参注入），各造 1 条 | `lookup-user-redirect-org`, `search-org-injection` |

> **方法 4（状态迁移）几乎总是 N/A**：tool 是无状态可调用单元，一次 `execute()` 不产生跨调用状态。仅当 tool 内部维护了缓存 / session / rate-limit 计数器并在不同 input 下走不同分支时，才用状态迁移设计；否则直接标 N/A 写理由 `tool is stateless across calls`。

**N/A 规则**（参考 test-case-generator Phase B 第 6 节）：
- 若 tool 没有 numeric input → ④ 标 N/A，写理由 `tool has no numeric fields`
- 若 tool 无 provider 调用（pure-local）→ ⑤ 标 N/A，写理由 `hasProvider=false`
- 若 tool 文档/源码无自动行为 → ⑦ 标 N/A，写理由 `no auto-behavior documented`

至少 **5/7 类** 必须产出真实 case（不能多于 2 类标 N/A），否则覆盖度不足。

### `apiDocs` 在 7 类中的具体作用（传了 --api-doc 时）

| 类别 | 没 apiDocs 时 | 有 apiDocs 时的增益 |
|---|---|---|
| ① happy path | 用 inputSchema 字段名 + description 举例 | 用官方文档里的真实示例参数（更可能命中真实分支）|
| ② input-schema 校验 | 删 required / 错 type | 同左，**额外**对官方文档列出但 inputSchema 漏掉的字段做缺失测试（暴露 schema 缺漏）|
| ③ 本地早拒 | 读 tool 源码白名单 | **diff** tool 白名单 vs 官方枚举：tool 多/少认的值各出 1 条 |
| ④ 数值钳制 | 取 inputSchema `.max()` 边界 | 取 **官方上限**（如 GitHub per_page 真实上限 100）做"上限+1"，验证 tool 是否真的钳制 |
| ⑤ provider 错误映射 | 凭经验猜 401/404/429 | 直接用官方文档的 status code 表 → tool error code 映射，**枚举完整**|
| ⑥ 边界 | inputSchema 推 | 官方文档若写明特殊边界（如"空 q 返回 422"），按官方造 |
| ⑦ auto-behavior | tool description 里写明的才能造 | **关键增益**：官方文档常含 tool desc 没提的自动行为（user→org redirect、查询字符串注入、type coercion）→ 一条都不能漏 |

冲突处理：若 `descriptionSource` 与 `apiDocs` 矛盾（例：desc 说支持 `sort: popularity`，官方文档没列），把这条冲突明确写成一条 ③ 类 case，让 runner+judge 实测哪个是真。**不要静默以一方为准**。

---

## 去重逻辑（借用 test-case-generator Phase C，比对单位调整）

`test-case-generator` Phase C 的比对单位是 "UI 操作链 + 断言"。本 skill 改成：

### 比对单位：`{ tool, inputSnapshot, expect, expectErrorCode }`

- `inputSnapshot` = 把 `steps[].input` 做规范化 JSON.stringify（key 排序、空白归一）
- 若四元组完全相同 → 重复，保留 `judgeFocus` 更具体的那条
- 若 `inputSnapshot` 不同但 `expect + expectErrorCode + judgeFocus` 都一样 → **不算重复**（同一种错误的多个触发路径都该测）

### 与外部已有 cases 的比对

去重**只在本次生成批内**做。理由：每次 `/qa-tool-probe` 是独立 run，无累计 cases 仓库；evidence/report 才是产物，不是 case 库。

若用户显式传 `--extra-case "..."`，**强制保留**该 case，不参与去重（用户意图优先）。

### 冲突解决

- 同一 input 出现两条但 `expect` 矛盾（一条 `ok` 一条 `tool_error`）→ 这是 ideation 错误，停止生成并报错给用户
- 多条 case 名字相同 → 自动加后缀 `-2`, `-3`

---

## 执行流程

### Step 1: 收集输入

调用方（`/qa-tool-probe` 命令层）传入：

```ts
{
  tool: {
    name: string,                  // e.g. "github_search"
    descriptionSource: string,     // raw text of the tool's exported description constant
    inputSchemaSource: string,     // raw zod / TS source of inputSchema
    hasProvider: boolean,          // from Phase 1 discovery
  },
  prd?: string,                    // optional PRD body
  apiDocs?: string[],              // optional upstream-API docs fetched via --api-doc (one entry per URL)
  extraCases?: string[],           // --extra-case flags
}
```

### 关于 `apiDocs`（来自 `/qa-tool-probe --api-doc <url>`）

这是工具所封装的**上游官方 API 文档**（如 GitHub REST docs、Stripe API ref），命令层用 WebFetch 抓回来并提示模型只保留结构化片段（HTTP 方法/路径、参数枚举、错误码映射、速率/分页限制、auto-behavior）。它和 `descriptionSource` 不一样：

| 来源 | 是什么 | 可信度 |
|---|---|---|
| `descriptionSource` | tool 作者写给 LLM 看的 hint，可能漏字段、口径与上游不一致 | 中（开发者主观）|
| `inputSchemaSource` | tool 实际接受的入参，**这是真**实生效的边界 | 高（运行时校验）|
| `apiDocs` | 上游 API 真实契约（响应字段、错误码、限流、自动改写） | 高（官方文档）|

**用法准则**：
- **冲突即用例**：`descriptionSource` 与 `apiDocs` 在枚举值、错误码、限制上不一致 → 这是潜在 bug 来源，**必须**为冲突点生成 case，由 runner+judge 决定哪一方为真。例：tool desc 说 `per_page` 上限 50，官方说 100 → 出一条 `per_page=80` 的 case 验证 tool 是真钳到 50 还是放过。
- **填补盲区**：`descriptionSource` 没提的官方 auto-behavior（如 `/users/:login` 当 login 是 org 时 302→`/orgs/:login`）→ 必出 ⑦ 类 case。
- **错误码白名单**：⑤ 类（provider 错误映射）的 `expectErrorCode` 应优先取自 `apiDocs` 列出的官方状态码 → tool 错误码映射，而不是凭感觉猜。
- **数值边界**：④ 类（钳制/归一化）的"上限+1"取自 `apiDocs` 写明的上限，不是 inputSchema 的 `.max()`（后者只反映 tool 自己的认知）。
- **不要 dump 进 case**：`apiDocs` 是 ideation 上下文，不是 case 字段内容；`judgeFocus` 可以引用官方约束（如 "official spec: max per_page=100"）但要简短。
- **缺失退化**：没传 `--api-doc` 时 `apiDocs` 为空 → 按原有 inputSchema+description 推理，**不要**编造官方限制。

### Step 2: 解析 inputSchema 字段

`inputSchemaSource` 可能是两种格式之一，**按 toolKind 自动识别**：

**A. Vercel-AI 模式（kind=vercel-ai）→ raw zod TS 源码**

从 zod 源码静态抽取（不执行 zod，只做正则/AST 解析）：
- 字段名 + 类型 + required/optional（`z.string()` / `z.string().optional()`）
- enum 值列表（`z.enum(["a", "b"])` → `["a", "b"]`）
- numeric 约束（`z.number().min(1).max(100)` → bounds 用于边界值生成）
- 默认值（`z.default(...)`）

如果 inputSchema 引用了外部 const，沿 import 链 `Read` 一次即可，更深层就放弃，标注 `partial-schema`。

**B. MCP-HTTP 模式（kind=mcp-http）→ JSON Schema 对象**

直接读 `tools/list` 返回的 JSON Schema：
- 字段名 + 类型来自 `properties[fieldName].type`
- required 来自 `required: [...]` 数组
- enum 来自 `properties[fieldName].enum`
- numeric 约束来自 `minimum` / `maximum` / `exclusiveMinimum` 等
- 默认值来自 `default`

JSON Schema 是 self-contained 的，**不需要 import 链追踪**，直接用。

**两种模式产出同样的中间抽象**（字段表 + 约束 + 默认），后续生成 cases 的逻辑完全一致。

### Step 3: 按 7 类生成 cases

对每个类别走一遍方法映射表，每类产出 1-3 条 case，存入内存数组。

**命名规范**：`<tool-short>-<category-tag>-<variant>`，category-tag 取值：
`happy` / `schema` / `early` / `clamp` / `provider` / `edge` / `auto`

### Step 4: 合并 extra-case

每个 `--extra-case "<desc>"` 调用方传过来都是一句自然语言。把它转成一条 case：
- `name` = `extra-<n>`（n 从 1 递增）
- `description` = 原文
- `tool` = 命令行第一个 tool（若用户没在 desc 里指明）
- `steps[].input` = Claude 自行从 desc 推断（如 "传一个超长 query 看会不会被截" → `{ q: "a".repeat(1024) }`）
- `expect` / `expectErrorCode` = 从语义推断

如果推断不出 input，**输出 case 时 input 设空对象 `{}`，并在 judgeFocus 注明 `requires manual input fill`**——不要瞎猜。

### Step 5: 去重（按上一节规则）

### Step 6: 校验门（强制，由命令层执行）

本 skill 是 ideation 层，**只产 cases 数组**，**不在 skill 内做 zod parse**。真正的校验由命令层在 Phase 3 中执行——通过运行 `scripts/tool-probe/validate-cases.ts` 这个独立 CLI 完成。

校验门覆盖的检查（远超单纯 zod schema parse）：

| # | 检查项 | 来源 |
|---|---|---|
| 1 | zod schema parse（cases + 整个 config）| `case-schema.ts` 的 `casesArraySchema` |
| 2 | case `name` 在批内唯一 | validator 内置 Map 检查 |
| 3 | case `name` 是 kebab-case（warning，不阻塞）| 正则 `/^[a-z0-9]+(-[a-z0-9]+)*$/` |
| 4 | 每个 `case.tool` 必须是 `config.tools` 的 key（cross-reference）| validator 内 Set 检查 |
| 5 | 若任何 case 设置 `tokenOverride`，`config.authEnvVar` 必须非空 | 避免 runner 静默忽略 |
| 6 | 全空 input（`steps[].input == {}`）的 case 必须显式声明意图（`expect="tool_error"` 或 judgeFocus 含 `requires manual input fill`）| 防 extra-case 推不出 input 的静默降级 |
| 7 | `expectErrorCode` 仅在 `expect="tool_error"` 时有意义（warning）| 配对一致性 |

#### 调用方式（命令层 / orchestrator agent 在 Phase 3b 调用）

```
bun <qa_agent>/scripts/tool-probe/validate-cases.ts --config <abs path to config.json>
```

退出码：
- `0` — 全部通过（可能有 warning，但不阻塞）
- `1` — 有 error，整批拒绝，**不允许 patch 源码**
- `2` — I/O / argv 错误

stdout 是结构化 JSON `{ ok, errorCount, warningCount, issues[] }`。

#### 为什么不在 skill 里做

skill 是 markdown，没有运行时；如果把 zod parse 写在 skill 里，等于把"承诺"再次寄托在编排 Claude 的自觉性上，与 test-case-generator 旧问题同源。**强校验只能是独立 CLI**，命令层 Phase 3b 强制调用、退出码门控，才是可执行的保护。

#### 失败处理原则

- validator 退出非 0 → 命令层不 patch、不跑 runner、不跑 judge，直接退出
- 把 validator 输出的 `issues[]` 完整呈现给用户（按 level 排序，errors 先于 warnings）
- 不要尝试自动修复任何 case，让用户决定如何调整 ideation

### Step 7: 输出

返回 `cases` 数组给调用方（命令层），由命令层嵌入 `config-<runId>.json` 的 `cases` 字段。

**不写盘**——本 skill 不产出独立文件，所有 case JSON 留在内存里，由命令层一次性写入 config。这点与 `test-case-generator` 不同（那个 skill 必写 `.md` + handoff JSON）。

---

## 输出示例（github_search，单 tool，省略号代表多条）

```json
[
  {
    "name": "search-user-happy",
    "tool": "github_search",
    "description": "搜索 location=berlin 的 rust 开发者，验证 happy path",
    "steps": [{ "input": { "target": "user", "q": "language:rust location:berlin", "per_page": 3 } }],
    "expect": "ok",
    "judgeFocus": "verify provider hit /search/users with q intact; items[].login + items[].url present"
  },
  {
    "name": "search-missing-q",
    "tool": "github_search",
    "description": "缺失 required 字段 q，应在 tool 层早拒",
    "steps": [{ "input": { "target": "user", "per_page": 3 } }],
    "expect": "tool_error",
    "expectErrorCode": "invalid_input",
    "judgeFocus": "no provider.request fired; tool returns schema validation error"
  },
  {
    "name": "search-per-page-zero",
    "tool": "github_search",
    "description": "per_page=0 应钳制为 1（或文档约定的最小值）",
    "steps": [{ "input": { "target": "repo", "q": "stars:>100", "per_page": 0 } }],
    "expect": "ok",
    "judgeFocus": "provider.request.query.per_page should be normalized to >= 1, not 0"
  },
  {
    "name": "lookup-auth-missing",
    "tool": "github_lookup",
    "description": "删除 GITHUB_TOKEN 后调用，验证 provider 401 → tool error 映射",
    "steps": [{ "input": { "type": "user", "login": "torvalds" } }],
    "expect": "tool_error",
    "expectErrorCode": "auth_error",
    "tokenOverride": null,
    "judgeFocus": "provider.response.statusCode=401; tool.output.error.code='auth_error'"
  },
  {
    "name": "search-invalid-sort",
    "tool": "github_search",
    "description": "传入 tool 源码白名单外的 sort 值，应在 tool 层早拒，不发 provider 请求",
    "steps": [{ "input": { "target": "repo", "q": "stars:>100", "sort": "popularity" } }],
    "expect": "tool_error",
    "expectErrorCode": "invalid_sort",
    "judgeFocus": "no provider.request fired; error references allowed sort values"
  },
  {
    "name": "search-empty-result",
    "tool": "github_search",
    "description": "构造极不可能命中的 query，验证空结果集时 tool 不报错且返回 items=[]",
    "steps": [{ "input": { "target": "repo", "q": "zzzqxqzzz-no-such-repo-7f3a", "per_page": 3 } }],
    "expect": "ok",
    "judgeFocus": "tool.output.items is empty array; total_count=0; not thrown"
  },
  {
    "name": "lookup-user-redirect-org",
    "tool": "github_lookup",
    "description": "type=user 但 login 指向一个 org（如 'github'），验证 tool 自动改走 org 分支",
    "steps": [{ "input": { "type": "user", "login": "github" } }],
    "expect": "ok",
    "judgeFocus": "tool.input.type=user 但 provider 实际命中 /orgs/github；tool.output.kind='org' (auto-redirect 文档行为)"
  }
]
```

---

## 与 test-case-generator skill 的对照表

| 维度 | test-case-generator | tool-probe-case-generator (this) |
|---|---|---|
| 输入 | user story / PRD / Figma / CDP | tool 源码的 `inputSchema` + `description` + 可选 PRD |
| 设计方法 | 6 法（全部强制覆盖检查）| 借用 6 法 → 映射到 7 类（5/7 强制）|
| 去重单位 | UI 操作链 + 断言 | tool + input snapshot + expect |
| 输出物 | `*.md` + `playwright-handoff-*.json` | 内存 JSON 数组，由调用方写入 config |
| 下游消费者 | playwright-script-generator / excel-case-export | qa_agent/scripts/tool-probe/runner.ts |
| schema 校验 | 字段名 key match（弱）| zod parse（强，与 runner.ts 同源）|

---

## 约束

- **不写盘**：所有 case JSON 留在内存返回。写盘是命令层的事。
- **不调用 sub-agent**：本 skill 是 ideation skill，直接由编排 Claude 执行；不要再派发更下层 agent。
- **不修改源码**：本 skill 只产 case，不插桩；插桩是 `tool-probe-orchestrator` agent 的事。
- **不生成 Markdown / Excel**：tool-probe 流水线不需要这两个产物。
- **PRD 是可选输入**：没有 PRD 也必须能跑（靠 inputSchema + description 推断 7 类）。
- **失败要响**：zod 校验失败、字段抽取失败、extra-case 推断失败——都立即报错给调用方，不要静默降级。
