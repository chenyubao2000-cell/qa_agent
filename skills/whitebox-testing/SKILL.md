---
name: White-Box Testing
description: 当需要对代码进行白盒测试时使用——包括控制流分析、覆盖准则判定、用例生成、执行与报告。用户说"做白盒测试""分析覆盖""找未覆盖分支"，或提供分支名/具体文件或工具/需求文档中任意一项要求测试时触发；需求文档是可选的业务背景补充，不是前置条件。
version: 1.2.0
allowed_tools: [Read, Write, Edit, Grep, Glob, Bash]
---

# White-Box Testing Skill

白盒测试 = 基于对**内部代码结构**的了解来设计测试用例，而不是只看输入输出。

核心问题：**哪些分支路径还没被覆盖到？**

---

## 一、理论基础（所有场景通用）

### 覆盖准则层次（由弱到强）

```
语句覆盖 → 分支覆盖 → 条件覆盖 → 条件/判定覆盖 → MC-DC
```

每一级都是上一级的超集。**至少达到分支覆盖**，安全关键路径达到 MC-DC。

| 覆盖准则 | 含义 | 最少用例数 |
|---|---|---|
| 语句覆盖 | 每行至少执行一次 | 1（happy path） |
| 分支覆盖 | 每个 if/else 两方向都走到 | V(G) 条 |
| 条件覆盖 | 复合条件中每个子条件 T/F 都出现 | 视条件数量 |
| MC-DC | 每个条件独立影响结果 | 条件数 + 1 |

### 圈复杂度 V(G)

V(G) = 覆盖一个函数所有独立路径所需的最少用例数。

| V(G) | 说明 | 策略 |
|---|---|---|
| ≤ 5 | 简单 | 基础用例即可 |
| 6–10 | 适度复杂 | 补充边界用例 |
| > 10 | 过于复杂 | 先重构，再测 |

快速检查：
```sh
npx eslint --rule '{"complexity": ["warn", 5]}' --no-eslintrc <file>
```

### 用例生成规则

**只为新增/修改的分支生成用例**，未变动的历史分支不重复测：

- 新增的 `if` 条件 → 该条件 true / false 各一条
- 新增的 `return` 路径 → 触达该 return 的 case
- 新增的 `throw` / 错误返回 → `expect: "tool_error"` case

### 生成后自检：变异检查（Mutation Check）

`it()` 存在 + import 了真实源文件，不等于断言真的在测目标行为（可能挂在错误的对象上，静态检查抓不到）。**每条 `it()`，生成后必须做一次变异自检**：

1. 找到该 `it()` 依赖的关键返回值/mock。
2. 不改动磁盘上的真实源文件——在测试内部用 `vi.spyOn` / 反转某个 mock 的返回值，模拟"目标行为反过来会怎样"。
3. 运行，确认**真的变红**；`vi.restoreAllMocks()` 还原后确认变绿。

没有变红的 `it()` 必须回到 Phase 4a 重做，不计入 Phase 4b 完整性统计。全场景通用，不止 sub-agent。

---

## 二、两种执行方式

区别不在于"是否白盒"，而在于**返回值够不够观测内部行为**：

### 方式 A：直接断言（普通函数）

返回值本身就能反映所有需要验证的行为。用 Vitest 直接调用并断言。

适用：工具函数、业务逻辑、纯计算类代码。

#### 文件结构与命名

```
src/utils/clamp.ts          ← 被测文件
src/utils/clamp.test.ts     ← 测试文件（同目录，.test.ts 后缀）
```

#### 基本语法

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clamp } from './clamp'

describe('clamp', () => {
  it('returns value unchanged when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('clamps to min when below range', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })

  it('clamps to max when above range', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
})
```

#### 常用断言

```typescript
// 值相等（原始类型用 toBe，对象用 toEqual）
expect(result).toBe(42)
expect(result).toEqual({ id: 1, name: 'test' })
expect(result).toMatchObject({ id: 1 })   // 只断言部分字段

// 真假
expect(flag).toBeTruthy()
expect(flag).toBeFalsy()
expect(value).toBeNull()

// 错误抛出
expect(() => fn(badInput)).toThrow('expected error message')
expect(() => fn(badInput)).toThrow(/pattern/)

// 数组/字符串包含
expect(list).toContain('item')
expect(str).toContain('substring')

// 快照（适合复杂返回值，首次运行自动填入）
expect(result).toMatchInlineSnapshot(`
  {
    "field": "value",
  }
`)
```

#### 异步函数

```typescript
it('resolves with data', async () => {
  await expect(fetchUser(1)).resolves.toEqual({ id: 1 })
})

it('rejects on not found', async () => {
  await expect(fetchUser(999)).rejects.toThrow('not found')
})
```

#### Mock 依赖

```typescript
import { vi } from 'vitest'

// Mock 整个模块
vi.mock('./http-client', () => ({
  get: vi.fn().mockResolvedValue({ data: 'mocked' }),
}))

// Spy on 已有方法（不替换，只监听）
const spy = vi.spyOn(logger, 'info')
fn()
expect(spy).toHaveBeenCalledWith('expected message', expect.any(Object))

// Mock 部分模块（保留其余 export）
vi.mock('./config', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, API_URL: 'http://test.local' }
})

// Mock 环境变量
vi.stubEnv('NODE_ENV', 'test')

// Mock 时间
vi.setSystemTime(new Date('2026-01-01'))
vi.useRealTimers()  // 测试后还原
```

#### 生命周期钩子

```typescript
describe('with db', () => {
  beforeEach(async () => {
    await db.seed()        // 每条 case 前初始化
  })

  afterEach(async () => {
    await db.clear()       // 每条 case 后清理
    vi.restoreAllMocks()   // 还原所有 spy/mock
  })

  beforeAll(async () => {
    await db.connect()     // 整个 suite 只跑一次
  })

  afterAll(async () => {
    await db.disconnect()
  })
})
```

#### 覆盖率测量

运行时加 `--coverage`，需要先安装 Istanbul（Bun 环境不支持 V8 provider）：

```sh
bun add -D @vitest/coverage-istanbul

# 执行并输出覆盖率报告
bun vitest run --coverage --coverage.provider=istanbul
```

`vitest.config.ts` 固化配置：

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts'],
    },
  },
})
```

报告关注 **Branches %**（分支覆盖率），目标 ≥ 80%。语句覆盖率高但分支覆盖率低，说明有隐藏的 else/error 路径未被测试。

#### 执行命令

```sh
bun vitest run <file>          # 单文件执行
bun vitest run <dir>           # 整个目录
bun vitest run --coverage      # 带覆盖率
bun vitest --watch             # watch 模式（开发时）
bun vitest run --reporter=verbose  # 显示每条 case 结果
```

#### 跨仓库测试注意事项

方式 A 的测试文件物理上位于 `tests/whitebox/<slug>/vitest/`（qa_agent 仓库内），但要 import 的源码在 `SOURCE_PROJECT_DIR`（另一个仓库）。这个"测试文件在目标仓库之外"的布局会带来两类容易踩的坑：

1. **裸模块路径解析失败**：测试文件 `import "@mira/xxx"` 这种裸路径时，Node/Bun 从测试文件所在目录向上找 `node_modules`，走不到目标仓库的 workspace 链接 → `Cannot find package '@mira/xxx'`。`vi.mock()` 解决不了这个问题——它只能替换*已经能被解析到*的 module id 的实现，模块本身解析不到时 `vi.mock` 不会生效。
2. **正确做法是用 `resolve.alias` 精确重定向，而不是笼统 `vi.mock`**：
   - 想要**可配置行为**的模块（测试要 `.mockResolvedValue()` 控制返回值）→ alias 到一个**独立的 stub 文件**，该文件只导出裸 `vi.fn()`，测试里再配置行为。
   - 想要**保留真实实现**的模块 → alias 直接指向它在目标仓库里的**源码绝对路径**，跳过 `node_modules` 查找，不经过 stub。
3. **不要用一个正则 alias 把所有同前缀的包都指向同一个 stub 文件**（比如 `{ find: /^@mira\/.*/, replacement: ".../mira-workspace-stub.ts" }`）。一旦某次测试需要"这个子路径用真实实现、那个子路径要 mock"混搭，两个不同的 specifier（如 `@mira/agent-os-core` 和 `@mira/agent-os-core/mcp/mcp-connector-loader`）会被同一条正则解析成同一个 module id，后写的 `vi.mock` 会静默覆盖前一个，两边的期望互相打架却不会报错，只会表现为断言莫名其妙拿到错误的 mock 返回值。正确做法：**每个需要不同处理的具体 specifier 单独写一条 alias 条目**（vitest/rollup 的 alias 数组按顺序匹配、命中即停，把更具体的条目排在正则条目之前），不要指望一条正则通吃。
4. 执行方式不变，仍是两步：`cd <SOURCE_PROJECT_DIR 对应子包目录> && bun vitest run --config <qa_agent 里生成的 config 路径>`。

`instrumentation.md` §2c 的 sub-agent alias 冲突案例、`qa-whitebox.md` Phase 6 的 `vitest.whitebox.config.ts` 生成模板，都是这条规则的具体应用场景，遇到问题时按这里的原则处理。

### 方式 B：探针 + Evidence（Tool）或 L1+L2 Vitest（MCP）

Tool 和 MCP 的关键行为**不在返回值里**：

| 目标 | 测试方式 | 裁决方式 |
|---|---|---|
| **Tool** (vercel-ai `execute()`) | 注入 4 探针 → `runner.ts run` | `claude -p` judge |
| **MCP server tool（本地可起服务）** | 插桩 handler + `InstrumentedMcpServer` spawn 子进程 → Vitest L1+L2，探针证据作补充诊断 | 断言（不用 `claude -p`） |
| **MCP server tool（仅远程 / 无本地入口）** | `McpClient.fromEnv()` 直连 → Vitest L1+L2，纯黑盒 | 断言（不用 `claude -p`） |

Tool 先注入探针再执行，evidence 中才有内部数据可判断。MCP 始终走 L1（schema 合规）+ L2（行为验证）两层 Vitest 断言判定，`claude -p` 不参与；本地可起服务时额外插桩 + spawn 子进程，采集探针作失败诊断参考（不影响 pass/fail）。

**Sub-agent 不在方式 B 里**——设计上就是方式 A：项目没有 DB/Redis/Langfuse 等基础设施的隔离测试环境，无法真正"直调"，所以从一开始就用 `vi.mock` 覆盖依赖，测分支逻辑，详见 `references/instrumentation.md` §2c。

探针规则、config schema、执行命令详见：

→ **[references/instrumentation.md](references/instrumentation.md)**

---

## 三、入口

```
/qa-whitebox [--branch <branch>] [--target <file[,file...]>] [--prd <path>] [--since <days=7>] [--dry-run]
```

`--branch`（默认当前分支，diff 一个时间窗口）和 `--target`（直测指定文件/工具，跳过 diff）二选一决定测什么；`--prd` 永远是可选的业务背景补充。

1. `classify-diff.ts` 脚本确定性分类变更文件（Mode A / Mode B）
2. Mode B 时创建 git worktree 沙箱（全新创建，测完立即删除）
3. 直接从源码 + classification.json 中的 `addedBranches` 生成 `.test.ts`（Mode A / MCP L1+L2）或插桩 config（Mode B Tool）
4. 执行 + 校验 addedBranches 是否每条都有对应 it()（整文件 Branches % 只作参考，不做 pass/fail 门槛）
5. 删除沙箱，输出报告

完整流程见 → **[references/prd-driven-flow.md](references/prd-driven-flow.md)**

---

## 四、脚本

```sh
# diff 分类（方式 A 和 B 都用，在 LLM 介入前执行）
# --paths 可选，限定扫描范围；配合 --base <空树 hash> 可实现"单文件/单工具直测"，见 prd-driven-flow.md §一
classify-diff.ts --source <dir> --base <sha> --head <sha> [--out <file.json>] [--paths <a.ts,b.ts>]

# Mode B 沙箱创建：git worktree + node_modules 模板复制
prepare-sandbox.ts --source <mira-root> --head <sha> --sandbox <sandbox-abs-path>

# 方式 A 执行：生成 whitebox 专用 vitest config + 解析 vitest 二进制 + 执行 + 覆盖率 + 已知错误分类
# 裸第三方 import（bullmq、ai 等）会自动扫描 --source-files 并 alias 到其在 miraWork 里的真实路径，
# 不需要每出现一个新包就手改脚本；需要可控 mock 行为时用 --extra-alias-file 传 { specifier: stub绝对路径 }
run-mode-a.ts --source-dir <dir> --whitebox-dir <dir> --source-files <a.ts,b.ts> [--app-dir apps/mira-work] [--extra-alias-file <json>]

# 方式 B 主流程：validate → run → judge
runner.ts --config <file> --report <file>

# MCP 工具发现（独立前置步骤，仅 mcp-http 需要）
discover.ts --url <url> --tools <n1,n2> [--auth-env ENV] [--out <f>]

# Mode B 沙箱清理（Windows 长路径兜底 + verify，见 references/prd-driven-flow.md §五）
cleanup-sandbox.ts --source <mira-root> --sandbox <sandbox-abs-path>
```
