# PRD 驱动流程参考

`/qa-whitebox` 命令的 Git 分析、文件分类、diff 解析、沙箱生命周期的完整规则。

---

## 一、提交范围确定算法

### 默认策略：时间窗口

```sh
# 1. 找到 N 天内最早的 commit
OLDEST=$(git -C <repo> log --since="<N> days ago" --oneline HEAD | tail -1 | awk '{print $1}')

# 2. BASE = 该 commit 的父节点（即变更起点的前一刻）
BASE=$(git -C <repo> rev-parse ${OLDEST}^)

# 3. HEAD = 当前最新
HEAD=$(git -C <repo> rev-parse HEAD)
```

### 合并分支检测

若 N 天内存在 merge commit，说明有 feature branch 被合入。取 merge commit 的第二个父节点（feature 分支起点）作为 BASE，更能准确捕获完整功能：

```sh
MERGE=$(git -C <repo> log --merges --since="<N> days ago" --oneline HEAD | head -1 | awk '{print $1}')
if [ -n "$MERGE" ]; then
  BASE=$(git -C <repo> rev-parse ${MERGE}^2^)
fi
```

### 边界条件

| 情况 | 处理方式 |
|---|---|
| N 天内无任何 commit | 提示用户扩大 `--since`，退出 |
| 只有 1 个 commit | BASE = 该 commit 的父节点 |
| BASE 解析失败（初始 commit）| 用 `git hash-object -t tree /dev/null` 作为空树 |

---

## 二、从 diff 提取被修改的函数

### Diff 命令（全范围）

```sh
# 获取所有变更文件（排除测试文件、生成文件、配置文件）
git -C <repo> diff ${BASE}..${HEAD} --name-only \
  | grep -E "\.(ts|tsx)$" \
  | grep -v -E "(\.test\.|\.spec\.|__tests__|\.d\.ts|node_modules|\.next|dist/|generated/)"
```

不再限制为 `lib/ai/` 或 `providers/`；UI、API route、工具函数均纳入分析。

### 解析规则

逐块解析 unified diff，每个 hunk（`@@ ... @@`）提取：

```
@@ -154,7 +154,23 @@ execute: async (input: GithubSearchInput): Promise<ToolResult> => {
```

1. `@@` 后面的上下文行 → 函数/方法名
2. `+` 开头的行 → 新增代码
3. `-` 开头的行 → 删除代码（需测试其替代逻辑）
4. ` ` 开头的行 → 上下文（不生成用例，用于理解结构）

### 过滤规则（以下变更不生成用例）

- 只改了注释（`//`、`/*`、`*`）
- 只改了 import 语句
- 只改了空行 / 格式
- 只改了类型注解（`: string`、`as Type`）

```
判定方式：去掉 `+`/`-` 前缀后的行，若 trim 后以 // / import / 空字符串 开头 → 跳过
```

### 输出格式（传给用例生成阶段）

```ts
interface ChangedFunction {
  file: string;             // 相对于 SOURCE_PROJECT_DIR 的路径
  category: FileCategory;   // 见§三分类
  functionName: string;     // 函数/方法名
  newLines: string[];       // 实际新增/修改的代码行
  addedBranches: string[];  // 识别出的 if/else/switch/return/throw 分支
  linesRange: [number, number];
}
```

---

## 三、文件分类规则

> **权威实现**：以下规则由 `skills/whitebox-testing/scripts/classify-diff.ts` 实现。脚本是唯一权威来源；此节仅作人类可读说明，两者不一致时以脚本为准。

每个含新增/修改行的文件按以下规则分类，分类决定测试方式。

### Mode B — 探针插桩 / 插桩+Vitest（Tool / MCP）

#### Tool (vercel-ai execute)

**条件**（同时满足）：
- 路径匹配 `apps/mira-work/lib/ai/tools/**/*.ts`（排除 `__tests__`）
- HEAD 版本文件内容包含 `execute:`（判断依据是**当前文件是不是一个 Tool**，不是 diff 的 `+` 行——改 execute() 内部逻辑时 `execute:` 声明行本身可能不带 `+`，只看 `+` 行会误分为 Mode A）

**测试方式**：runner.ts 直调 + `claude -p` judge（4 探针）

#### MCP Tool

**条件**：HEAD 版本文件内容（或本次新增行）包含 `server.tool(` 调用——即真正注册工具的 **MCP Server**。仅 `import` `@modelcontextprotocol/sdk` 做连接管理的 **MCP Client** 文件（如 mira 里的 `mcp-client-manager.ts`）不满足此条件，归 Mode A。

**测试方式**：
- 本地可起服务（同文件/同包内能找到 `Bun.serve(` / `.listen(` 等启动入口）→ 插桩 handler + spawn 子进程 + Vitest L1+L2，探针作补充诊断
- 仅远程部署 / 无本地入口 → `McpClient` 直连 `callTool()`，纯黑盒 Vitest L1+L2，不插桩

两种情况判定方式相同（Vitest 断言），`claude -p` 不参与，见 `references/mcp-testing.md`。

#### Provider Only（不单独测试）

**条件**：路径匹配 `packages/sourcing/src/providers/**` 且无 `execute:` 变更

**处理**：随关联 Tool 通过 `provider.request` / `provider.response` 探针间接覆盖，不建独立测试目标。

---

### Mode A — Vitest 直接断言（普通代码）

不满足 Mode B 条件的所有 `.ts` / `.tsx` 文件均走 Mode A。按子类型决定测试写法：

| 子类型 | 路径模式 | 测试写法 |
|---|---|---|
| **API 路由** | `app/api/**/route.ts` | Vitest + mock session/db（参考已有 `__tests__/route.test.ts` 模式） |
| **服务端业务逻辑** | `lib/server/**/*.ts` | Vitest 直接 import，mock 外部依赖 |
| **参考数据工具** | `lib/reference/*.ts` | Vitest 直接 import，从真实数据集派生期望值 |
| **前端工具函数** | `features/**/*.ts`、`app/**/*.ts`（非 JSX）| Vitest 直接 import |
| **React 组件** | `features/**/*.tsx`、`app/**/*.tsx` | Vitest + `@testing-library/react`（优先测纯逻辑，如 hooks/条件渲染） |
| **Sub-agent** | `apps/mira-work/lib/ai/sub-agent-factory.ts` 等 | Vitest + `vi.mock`（`server-only`、DB/Redis/Langfuse 等基础设施），测分支逻辑 |

Sub-agent 走 Mode A 是设计决定，不是"探针插桩失败后的退路"：项目没有 DB/Redis/Langfuse 等基础设施的隔离测试环境，Mode B 直调本来就无从做起，所以从分类阶段起就归 Mode A。详见 `references/instrumentation.md` §2c。

**`hasExportableEntry` 字段**：`classify-diff.ts` 除了给每个 Mode A 文件分子类型，还会检测整个文件是否含有任意标准导出写法（`export function/const/class`、`module.exports`、`exports.x` 等）。`false` 表示这是一个纯 IIFE 启动脚本 / CLI-only 入口文件（如 `bootstrap.ts`）——文件里检测出了 `addedBranches`，但没有任何入口能被测试文件 import 进来驱动。这类文件在 `qa-whitebox.md` Phase 4a 的分层规则里**优先于 TIER 判断**直接归 SKIP，不再进入"必须生成"的队列。

**React 组件测试原则**：
- Server Component → 通常测其调用的纯函数，不测 render
- Client Component with hooks → `renderHook` 测 hook 逻辑
- 条件渲染 → `render` + `screen.getBy*` 断言元素存在/缺失
- 事件处理 → `userEvent.click/type` + mock 回调断言

**Mode A 测试文件输出位置**：`<qa_agent 仓库根>/tests/whitebox/<slug>/`
- 固定挂在 qa_agent 仓库根下，**不跟随 `QA_WORKSPACE_DIR`**（`QA_WORKSPACE_DIR` 是 E2E 流水线的工作目录变量，和白盒测试的输出位置无关，两者混用会导致同一个 slug 在两处产生不一致的结果）
- 不写入原始 `SOURCE_PROJECT_DIR`
- 不写入沙箱（沙箱仅用于 Mode B 插桩）
- 开发者可自行决定是否将有价值的测试 cherry-pick 进仓库

---

## 四、用例生成聚焦规则（Mode A + B 通用）

**只为新增/修改的分支生成用例**，未变动的逻辑不重复测。

从 `ChangedFunction.addedBranches` 中提取：
- 新增的 `if` 条件 → true / false 各一条
- 新增的 `return` 路径 → 触达该 return 的 case
- 新增的 `throw` / `return makeError` → `expect: "tool_error"` case

**示例**：
```ts
+ if (input.per_page > 100) input.per_page = 100;
```
→ `per_page=80`（不触发）+ `per_page=150`（触发，验证钳制后值为 100）

### 未导出目标的判定规则（方式 A 专用边界情况）

方式 A 的前提是"**返回值本身就能反映所有需要验证的行为**"（见 SKILL.md §二）。这个前提在以下情况不成立：新增分支所在的函数**未被导出**（内部闭包 / 模块私有函数），且它不属于 Tool/MCP（不适用方式 B 的探针机制）。

> **注**：整个文件零导出的情况（`hasExportableEntry === false`，见 §三）已经在 `classify-diff.ts` 分类阶段被识别、在 Phase 4a 归 SKIP，不会走到这里。本节要处理的是更隐蔽的一种：**文件本身有导出**（比如 API route 导出了 `GET`），但新增分支埋在文件内部一个**未导出**的辅助函数里——这种情况分类脚本判断不出来，只能在生成阶段按下面的规则处理。

按以下优先级处理：

1. **优先**：该未导出函数是否被某个**已导出的入口函数**（同文件的 route handler / 导出的 service 函数 / 导出的 worker processor 等）直接或间接调用？
   - 是 → 驱动这个已导出入口，**断言它对外部依赖的调用参数**（mock 捕获的 side-effect），而不是直接断言未导出函数的返回值。
   - 例：`heap/route.ts` 里的 `bucketByClass` 是模块私有函数，但被导出的 `GET` handler 调用 → import 真实 `GET`，mock `node:v8`/`node:fs` 等依赖，断言 `GET` 的响应体里 bucket 统计结果符合 addedBranch 描述的规则，而不是把 `bucketByClass` 的算法在测试文件里重新抄一遍去断言。
2. **兜底**：文件确实有导出入口，但驱动它才能到达目标分支的代价不合理（比如 `task-worker.ts` 里 `taskWorkerProcessor` 虽然导出了，但要跑到目标分支需要真的起 Redis/DB/BullMQ；或者入口依赖 Node 原生 API 且无法安全在单测里触发真实副作用，如 `heap/route.ts` 的堆快照采集）？
   - → **不生成用例**，在报告里记一行文件名 + 原因，不计入 Phase 4b 的强制生成基数。

**明确禁止的第三种做法**：在测试文件内部把该未导出函数的逻辑**重新实现一份**（哪怕逻辑抄得一字不差）再对这份复刻版断言。这种写法看起来"覆盖"了 addedBranch，实际上不管真实源码怎么改都不会失败——不是测试，是摆设。判断标准很简单：测试文件里必须能找到对**真实源文件路径**的 `import` / `await import()`；找不到就是违反本条规则，需要按上面两条路径重做（驱动已导出入口 / 直接不生成并记录原因）。

---

## 五、沙箱生命周期（Worktree 临时策略）

### 命名约定（临时，每次运行后删除）

```
$SOURCE_PROJECT_DIR/
└── .qa-sandboxes/
    └── wb-<slug>/               ← git worktree，测试结束后立即删除
        ├── apps/mira-work/...       ← 仅 Mode B 插桩在此操作
        └── packages/...
```

> **为什么沙箱放在 SOURCE_PROJECT_DIR 内：**
> runner.ts 动态 import 沙箱内 tool 文件时，Node/Bun 向上查找 node_modules 从文件位置出发，
> 必须能找到 `SOURCE_PROJECT_DIR/node_modules`（如 pino、zod）。
> 沙箱在测试结束后立即删除，无需配置 .gitignore。

`slug` 派生优先级：有 `--prd` 时用 PRD 文件名去扩展名转 kebab-case（`01-候选人端-建档.md` → `candidate-build`）；否则有 `--target` 时用目标文件 basename；否则用分支名（`/` 替换为 `-`）。完整规则见 `qa-whitebox.md` Phase 0。

### 沙箱创建（每次运行全新创建）

```sh
SANDBOX_DIR="$SOURCE_PROJECT_DIR/.qa-sandboxes/wb-<slug>"
git -C "$SOURCE_PROJECT_DIR" worktree add --detach "$SANDBOX_DIR" "$HEAD_HASH"
```

### 沙箱清理（测试结束后必须执行）

```sh
bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/cleanup-sandbox.ts" \
  --source "$SOURCE_PROJECT_DIR" --sandbox "$SANDBOX_DIR"
```

无论测试成功或失败，Phase 7 都必须执行清理，防止 worktree 残留。

`cleanup-sandbox.ts` 内置 `core.longpaths` + robocopy 长路径兜底 + verify，直接调用，不要手写
`git worktree remove --force` 了事。完整说明见 `qa-whitebox.md` Phase 7a。
