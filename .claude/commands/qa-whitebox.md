---
description: "PRD 驱动白盒测试：脚本分类变更 → 读源码直接生成 Vitest → 覆盖率验证 → 报告"
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob
---

You are a white-box test orchestrator. Given a PRD and branch, you find all newly changed code, directly generate Vitest unit tests from source branch analysis, execute them with coverage verification, and report results — without touching the original source repo.

```
/qa-whitebox [--branch <branch>] [--prd <path>] [--since <days=7>] [--dry-run]
```

Before starting, read `skills/whitebox-testing/SKILL.md` end-to-end.

---

## Phase 0: Load Context

```
Read(".env")
```

Extract:
- `SOURCE_PROJECT_DIR` — mira 源码绝对路径
- `QA_WORKSPACE_DIR` — qa_agent 工作目录（相对路径转绝对路径）
- `JUDGE_LANG` (default `zh`)
- `CLAUDE_JUDGE_CONCURRENCY` (default `1`)

Parse `$ARGUMENTS`:

| Flag | Default | 说明 |
|---|---|---|
| `--branch <name>` | 当前分支 | 要分析的分支 |
| `--prd <path>` | — | 需求文档（必须提供） |
| `--since <days>` | `7` | 向前追溯天数 |
| `--dry-run` | off | 只执行 Phase 1，不建沙箱不执行测试 |

派生路径：
```
prdSlug     = PRD文件名去扩展名转 kebab-case（01-候选人端-建档.md → candidate-build）
SANDBOX_DIR  = $SOURCE_PROJECT_DIR/.qa-sandboxes/wb-<prdSlug>
WHITEBOX_DIR = $QA_WORKSPACE_DIR/tests/whitebox/<prdSlug>
CLASSIFY_OUT = $WHITEBOX_DIR/classification.json
```

> **为什么 SANDBOX_DIR 在 SOURCE_PROJECT_DIR 内：**
> runner.ts 动态 import 沙箱内的 tool 文件时，Node/Bun 的 node_modules 向上查找从文件位置出发。
> 沙箱必须在 SOURCE_PROJECT_DIR 目录树内，才能命中 `SOURCE_PROJECT_DIR/node_modules`（如 pino、zod 等依赖）。
> 沙箱在测试结束后立即删除（Phase 7），无需配置 .gitignore。

---

## Phase 1: Git 分析 + 确定性分类（脚本执行，非 LLM）

提交范围算法、合并分支检测、边界条件的完整规则见 `skills/whitebox-testing/references/prd-driven-flow.md` §一～§二。

### 1a. 确定 BASE..HEAD 范围

```sh
OLDEST=$(git -C "$SOURCE_PROJECT_DIR" log --since="<N> days ago" --oneline HEAD | tail -1 | awk '{print $1}')
HEAD_HASH=$(git -C "$SOURCE_PROJECT_DIR" rev-parse HEAD)
```

N 天内无 commit → 提示用户扩大 `--since` 并退出。

BASE 计算（含边界保护）：

```sh
# 尝试取父节点；若 OLDEST 本身是首 commit（无父），用空树 hash 代替
if git -C "$SOURCE_PROJECT_DIR" rev-parse "${OLDEST}^" >/dev/null 2>&1; then
  BASE=$(git -C "$SOURCE_PROJECT_DIR" rev-parse "${OLDEST}^")
else
  BASE=$(git hash-object -t tree /dev/null)
fi
```

### 1b. 运行分类脚本

```sh
mkdir -p "$WHITEBOX_DIR"

bun "$QA_WORKSPACE_DIR/skills/whitebox-testing/scripts/classify-diff.ts" \
  --source "$SOURCE_PROJECT_DIR" \
  --base "$BASE" \
  --head "$HEAD_HASH" \
  --out "$CLASSIFY_OUT"
```

输出 `classification.json`，每个文件已包含变更函数名和新增分支：

```json
{
  "modeA": [{
    "file": "lib/reference/country-label.ts",
    "type": "reference-util",
    "addedLineCount": 12,
    "functions": [{
      "name": "getCountryLabel",
      "addedBranches": [
        "if (!code) return ''",
        "if (!entry) return code",
        "entry.name[locale] ?? entry.name.en"
      ]
    }]
  }],
  "modeB": {
    "tools": [{ "file": "lib/ai/tools/github-search.ts", "addedLineCount": 23, "functions": [...] }],
    "mcp": []
  },
  "skipped": [{ "file": "lib/some-type.ts", "reason": "仅改注释/import/空行/类型注解" }]
}
```

### 1c. 展示摘要

```
发现以下变更文件（共 N 个）：
  [Mode A – reference-util]  lib/reference/country-label.ts  (+12行, 1个函数, 3个分支)
  [Mode A – component]       features/profile/ProfileForm.tsx (+45行, 2个函数, 5个分支)
  [Mode B – Tool]            lib/ai/tools/github-search.ts    (+23行, 1个函数, 4个分支)
  [跳过]                     lib/some-type.ts (仅改类型注解)

分析范围: 2026-06-22 → 2026-06-29 (7天, 12 commits)
执行路径: Mode A + Mode B
```

modeA 和 modeB 全部为空 → 输出"无有效变更"并退出。`--dry-run` 时到此结束。

---

## Phase 2: 沙箱创建

**仅当 `modeB.tools + modeB.mcp` 全为空时，跳过此 Phase。**

Mode A 无需 worktree，测试直接写入 `$WHITEBOX_DIR/vitest/`。

```sh
git -C "$SOURCE_PROJECT_DIR" worktree add --detach "$SANDBOX_DIR" "$HEAD_HASH"
```

沙箱将在 Phase 7 测试结束后立即删除，每次运行全新创建。

---

## Phase 4: Mode A — 从源码直接生成 Vitest 测试

> 无中间用例文档。分支信息来自 `classification.json`，期望值从源码推导，直接输出 `.test.ts`。

参考覆盖准则：`skills/whitebox-testing/SKILL.md` §一。

**同时读取 PRD 文档（`--prd` 路径）作为业务背景，辅助推导期望行为。**

### 4a. 逐文件生成

对 `classification.json` 中每个 modeA 文件：

**Step 1 — 读分支信息（来自 classification.json，无需重读 diff）**

从 `functions[].addedBranches` 直接获取本次新增的分支语句，这就是需要覆盖的目标。

**Step 2 — 读源文件，推导期望值**

```
Read("$SOURCE_PROJECT_DIR/<file>")
```

结合分支语句和源文件，推导每个分支的合法输入和期望输出：
- `if (!code) return ''` → 输入 null/undefined/""，期望返回 `""`
- `if (!entry) return code` → 输入一个不在数据集中的 key，期望返回原 key
- `entry.name[locale] ?? entry.name.en` → 输入已知 key + 有该 locale 的 entry，期望返回 locale 值；输入无该 locale 的 entry，期望返回 en 值
- 数值边界（`> 100`）→ 测 100（不触发）和 101（触发）

期望值从真实数据推导，不猜测、不硬编码字面量（防数据升级后假红）。

**Step 3 — 按文件 subtype 选择写法**

| subtype | 写法 |
|---|---|
| `reference-util` / `util` | 直接 import，从真实数据集取 entry 推导期望 |
| `server-logic` | vi.mock 外部依赖（db、network），直接 import 被测函数 |
| `api-route` | vi.mock session/db，import route handler 直调 |
| `component` | `@testing-library/react`：renderHook 测 hook，render + getBy* 测条件渲染 |

**Step 4 — 写测试文件**

输出：`$WHITEBOX_DIR/vitest/<module-name>.test.ts`

import 优先使用 tsconfig paths alias（`@/lib/...`）；若不确定 alias 可用，改用从 `$WHITEBOX_DIR` 到 `$SOURCE_PROJECT_DIR` 的相对路径。

示例（reference-util）：
```typescript
import { describe, expect, it } from "vitest";
import { COUNTRIES } from "@/lib/reference/countries";
import { getCountryLabel } from "@/lib/reference/country-label";

describe("getCountryLabel", () => {
  const zhEntry = COUNTRIES.find((c) => c.name.zh !== undefined)!;
  const enOnly  = COUNTRIES.find((c) => !c.name.zh);

  it("returns '' for null",      () => expect(getCountryLabel(null,      "en")).toBe(""));
  it("returns '' for undefined", () => expect(getCountryLabel(undefined, "en")).toBe(""));
  it("returns '' for ''",        () => expect(getCountryLabel("",        "en")).toBe(""));
  it("returns code for unknown", () => expect(getCountryLabel("XX",      "en")).toBe("XX"));
  it("returns zh name",          () => expect(getCountryLabel(zhEntry.code, "zh")).toBe(zhEntry.name.zh ?? zhEntry.name.en));
  it("falls back to en",         () => { if (enOnly) expect(getCountryLabel(enOnly.code, "zh")).toBe(enOnly.name.en); });
});
```

### 4b. 完整性检查

每个 modeA 文件必须有对应 `.test.ts` 且包含至少 1 个 `it()`。
若某文件生成失败或 0 个 it() → 重新生成，最多重试 1 次。

---

## Phase 5: Mode B — 插桩 + runner.ts config

**仅当 modeB 非空时执行。**

参考 `skills/whitebox-testing/references/instrumentation.md` §二（按目标插桩）和 §三（7 类必备 case）。

### 5a. case 设计（直接基于源码，无中间文档）

对每个 modeB 文件：
1. 读 `classification.json` 中该文件的 `functions[].addedBranches`，了解新增逻辑
2. 读 `$SOURCE_PROJECT_DIR/<file>` 理解 tool 的 input schema 和 execute 完整逻辑
3. 按 `instrumentation.md §三` 的 7 类模板设计 case（只覆盖新增/修改的路径）

### 5b. 完整性检查

每个 modeB 文件至少生成 1 个 case，否则日志标注并重试。

### 5c. 调用 tool-probe-orchestrator

调用 `tool-probe-orchestrator` agent（见 `.claude/agents/tool-probe-orchestrator.md`），传入以下字段：

```json
{
  "sourceProjectDir": "<SANDBOX_DIR>",
  "discovery": {
    "tools": [
      {
        "toolFile": "<SANDBOX_DIR>/<modeB.tools[].file 的绝对路径>",
        "factoryName": "<从源文件 grep export function 得到的工厂函数名>",
        "descriptionConst": "<从源文件 grep 得到的 description 常量名>",
        "executeStart": 0,
        "executeEnd": 0
      }
    ],
    "sharedProviders": [],
    "prefix": "<工具名公共前缀，如 OFFICE>"
  },
  "cases": [ /* 5a 设计的 case 数组 */ ],
  "confirmProbes": false,
  "runId": "<prdSlug>",
  "authEnvVar": null
}
```

注意：`executeStart/End` 传 0 即可，orchestrator Phase 1 会自动 Grep 重算。Prefix 取 modeB.tools 文件名的公共单词大写，如 `office-tools.ts` → `OFFICE`。

### 5d. MCP Mode B — discover + Vitest L1+L2 生成（仅当 modeB.mcp 非空）

详细方法论见 `skills/whitebox-testing/references/mcp-testing.md`。

**Step 1 — discover.ts 获取工具 schema**

从 `.env` 或 `--prd` 文档中确认 MCP server URL 和工具列表，执行：

```sh
bun "$QA_WORKSPACE_DIR/skills/whitebox-testing/scripts/discover.ts" \
  --url "$MCP_SERVER_URL" \
  --tools "<comma-separated tool names from modeB.mcp files>" \
  --auth-env "MCP_AUTH_TOKEN" \
  --out "$WHITEBOX_DIR/mcp-discovery.json"
```

若 server 不可达（本地未启动 / 未部署），跳过 discover，直接按源码中 `server.tool()` 声明推断 schema，生成 `MCP_OFFLINE=1` 下全部 skip 的 spec 骨架。

**Step 2 — 生成 Vitest spec（L1 + L2）**

读取 `mcp-discovery.json` 的 `inputSchema` + 源文件中的工具注册逻辑，按 `mcp-testing.md` §三模板为每个工具生成：

```
$WHITEBOX_DIR/vitest/<tool-name>.test.ts
```

每个文件必须包含：
- `[L1]` schema 合规：工具存在性、inputSchema 必要字段、annotations
- `[P0][L2]` happy path（正常参数）
- `[P0][L2]` 鉴权失败（`noAuth: true`）
- `[P0][L2]` 必填参数缺失 → `isError=true`
- `[P0][L2]` 幂等性（`stripVolatile` + `toEqual`）
- `[P1][L2]` 边界值、分页、空结果（视工具 schema 决定是否适用）

import 路径指向共享库：
```ts
import { McpClient, parseToolResult, stripVolatile } from
  "<相对路径>/skills/whitebox-testing/scripts/mcp-client.js";
import "dotenv/config";
```

**Step 3 — 执行**

MCP spec 与 Mode A spec 在同一目录（`$WHITEBOX_DIR/vitest/`），由 Phase 6 的 `bun vitest run` 统一执行。无需单独命令。若 server 不可达，在 `.env` 中设 `MCP_OFFLINE=1` 使所有 `describe.skipIf(OFFLINE)` 块自动 skip。

---

## Phase 6: 执行 + 覆盖率验证

### Mode A — Vitest（带覆盖率）

```sh
cd "$SOURCE_PROJECT_DIR"

# 找 vitest.config（优先 apps/mira-work/，再向上找）
VITEST_CONFIG=$(find apps/mira-work -name "vitest.config.ts" ! -path "*/node_modules/*" 2>/dev/null | head -1)
VITEST_CONFIG=${VITEST_CONFIG:-$(find . -name "vitest.config.ts" ! -path "*/node_modules/*" 2>/dev/null | head -1)}

# 用 bun 从 classification.json 构造 --coverage.include 参数（不依赖 jq）
INCLUDE_FLAGS=$(bun -e "
const j = JSON.parse(require('fs').readFileSync('$CLASSIFY_OUT', 'utf8'));
process.stdout.write(j.modeA.map(a => '--coverage.include=' + a.file).join(' '));
")

bun vitest run "$WHITEBOX_DIR/vitest/" \
  --config "$VITEST_CONFIG" \
  --coverage \
  --coverage.provider=istanbul \
  --coverage.reporter=json-summary \
  --reporter=json \
  --outputFile="$WHITEBOX_DIR/vitest-report.json" \
  $INCLUDE_FLAGS \
  2>&1 | tee "$WHITEBOX_DIR/vitest-run.log"
```

**覆盖率门控**：读 `$SOURCE_PROJECT_DIR/coverage/coverage-summary.json`：
- `branches.pct < 80` → Phase 7 报告置顶标注 WARNING，列出未覆盖分支
- 不阻断流程

**执行失败自动处理**：
- `Cannot find module` → 将 `@/` alias 改为相对路径，重跑一次
- 其他错误 → 记录，进 Phase 7 分类

### Mode B — runner.ts

```sh
bun "$QA_WORKSPACE_DIR/skills/whitebox-testing/scripts/runner.ts" \
  --config "$QA_WORKSPACE_DIR/tests/reports/tool-probe/config-<prdSlug>.json" \
  --report  "$QA_WORKSPACE_DIR/tests/reports/tool-probe/report-<prdSlug>.md"
```

---

## Phase 7: 清理 + 报告

> **必须执行**：无论 Phase 4-6 是否失败，都要先删沙箱，再输出报告。

### 7a. 删除沙箱（Mode B 时）

```sh
git -C "$SOURCE_PROJECT_DIR" worktree remove --force "$SANDBOX_DIR"
```

若 `SANDBOX_DIR` 不存在（纯 Mode A），跳过此步。

### 7b. 失败分类与处置

读取 `vitest-report.json`（Mode A）和 `report-<prdSlug>.md`（Mode B）：

| 失败类型 | 判断依据 | 处置 |
|---|---|---|
| **路径/import 错误** | `Cannot find module` | Phase 6 已自动修复；若仍失败，提示检查 tsconfig |
| **断言失败（代码有 bug）** | 测试逻辑正确，返回值与期望不符 | 标记 BUG，询问是否提 Linear issue |
| **断言失败（测试写错）** | 期望值与代码实际行为不符 | 标记 REVIEW，提示人工修正 it() 断言 |
| **类型/编译错误** | TypeScript 报错 | 提示检查 tsconfig 或 mock 类型声明 |

**提 Linear issue**（BUG 类，用户确认后）：
```json
{
  "pipeline": "unit",
  "name": "<it() 描述>",
  "error": "<vitest 错误信息>",
  "file": "<.test.ts 路径>",
  "screenshotPath": null,
  "pageUrl": null,
  "handoffFile": null,
  "priority": "P1",
  "feature": "<prdSlug>"
}
```

### 7c. 输出报告摘要

```
白盒测试报告 — <prdSlug>
================================
分析范围：<BASE:.7>..<HEAD:.7>（N 个变更文件，M 个函数，K 个分支）

[覆盖率]  Branches: 72% ⚠ 目标 ≥ 80%
  未覆盖: getCountryLabel L7 (locale fallback when en missing)

[Mode A — Vitest] 通过 X / 共 Y
  ✓ country-label.test.ts  — 5/5
  ✗ ProfileForm.test.tsx   — 2/4
    [BUG]    it("hasResume=true 时上传组件应渲染") — data-testid 缺失
    [REVIEW] it("表单初始值应为空") — 期望值写错

[Mode B — Tool]  通过 X / 共 Y（若有）
[Mode B — MCP]   通过 X / 共 Y（若有；OFFLINE 时显示"N skipped"）

报告: $WHITEBOX_DIR/vitest-report.json
```
