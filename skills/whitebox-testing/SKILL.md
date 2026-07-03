---
name: White-Box Testing
description: 当需要对代码进行白盒测试时使用——包括控制流分析、覆盖准则判定、用例生成、执行与报告。根据被测单元能否从返回值直接观测内部行为，选择无探针（普通函数）或有探针（Tool/MCP/Sub-agent）两种执行方式。用户说"做白盒测试""分析覆盖""找未覆盖分支"，或提供需求文档/分支名要求测试最新提交代码时触发。
version: 1.1.0
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

```
V(G) = E − N + 2P
```

E = 控制流图边数，N = 节点数，P = 连通分量（通常为 1）。

**V(G) = 覆盖所有独立路径的最少用例数。**

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

### 方式 B：探针 + Evidence（Tool / Sub-agent）或 L1+L2 Vitest（MCP）

这三类目标的关键行为**不在返回值里**：

| 目标 | 测试方式 | 裁决方式 |
|---|---|---|
| **Tool** (vercel-ai `execute()`) | 注入 4 探针 → `runner.ts run` | `claude -p` judge |
| **MCP server tool** | `McpClient.fromEnv()` 直连 → Vitest L1+L2 | 断言（不用 `claude -p`） |
| **Sub-agent** | 源码直接 import + `vi.mock` 基础设施 | Vitest 断言 |

Tool 先注入探针再执行，evidence 中才有内部数据可判断。MCP 走 L1（schema 合规）+ L2（行为验证）两层 Vitest，需用户提供 `MCP_SERVER_URL` + `MCP_AUTH_TOKEN`。Sub-agent 因依赖 DB/Redis 等基础设施无法直调，改走 Mode A vi.mock 方式。

探针规则、config schema、执行命令详见：

→ **[references/instrumentation.md](references/instrumentation.md)**

---

## 三、入口

```
/qa-whitebox [--branch <branch>] [--prd <path>] [--since <days=7>] [--dry-run]
```

给定 PRD + 分支：
1. `classify-diff.ts` 脚本确定性分类变更文件（Mode A / Mode B）
2. Mode B 时创建 git worktree 沙箱（全新创建，测完立即删除）
3. 直接从源码 + classification.json 中的 `addedBranches` 生成 `.test.ts`（Mode A / MCP L1+L2）或插桩 config（Mode B Tool）
4. 执行 + 覆盖率验证（Branches ≥ 80%）
5. 删除沙箱，输出报告

完整流程见 → **[references/prd-driven-flow.md](references/prd-driven-flow.md)**

---

## 四、脚本

```sh
# diff 分类（方式 A 和 B 都用，在 LLM 介入前执行）
classify-diff.ts --source <dir> --base <sha> --head <sha> [--out <file.json>]

# 方式 B 主流程：validate → run → judge
runner.ts --config <file> --report <file>

# MCP 工具发现（独立前置步骤，仅 mcp-http 需要）
discover.ts --url <url> --tools <n1,n2> [--auth-env ENV] [--out <f>]
```

方式 A（普通代码）使用 `vitest`，不经过 `runner.ts`。
