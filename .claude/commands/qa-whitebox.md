---
description: "PRD 驱动白盒测试：脚本分类变更 → 读源码直接生成 Vitest → 覆盖率验证 → 报告"
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob
---

You are a white-box test orchestrator. You find code to test — either everything that changed on a branch within a time window, or one specific file/tool named directly — directly generate Vitest unit tests from source analysis, execute them with coverage verification, and report results — without touching the original source repo. A PRD is optional context, never a precondition.

```
/qa-whitebox [--branch <branch>] [--target <file[,file...]>] [--prd <path>] [--since <days=7>] [--dry-run]
```

Two independent ways to pick what gets tested — use one or the other, not both:
- **Branch mode** (default): diff `--branch` (default: current branch) over the last `--since` days. Good for "test whatever changed."
- **Target mode** (`--target`): test one or more specific files/tools directly, no git diff needed — the whole current file is treated as in-scope. Good for "test this one tool" / "test this branch of code" with no interest in diff history.

`--prd` enriches either mode with business-context for deriving expected values; omit it and expectations are derived purely from source (still fully valid, just without the extra context).

Before starting, read `skills/whitebox-testing/SKILL.md` end-to-end.

---

## Phase 0: Load Context

```
Read(".env")
```

Extract:
- `SOURCE_PROJECT_DIR` — mira 源码绝对路径
- `QA_WORKSPACE_DIR` — E2E 流水线的工作目录（**白盒测试不用这个变量**，见下方 WHITEBOX_DIR 说明）
- `JUDGE_LANG` (default `zh`)
- `CLAUDE_JUDGE_CONCURRENCY` (default `1`)

Parse `$ARGUMENTS`:

| Flag | Default | 说明 |
|---|---|---|
| `--branch <name>` | 当前分支 | 要分析的分支（branch 模式） |
| `--target <file[,file...]>` | — | 直测指定文件/工具，跳过 Phase 1a 时间窗口算法（target 模式，与 `--branch` 二选一） |
| `--prd <path>` | — | 需求文档（可选，提供时作为业务背景辅助推导期望值；不提供则纯从源码推导，同样有效） |
| `--since <days>` | `7` | 向前追溯天数（仅 branch 模式生效） |
| `--dry-run` | off | 只执行 Phase 1，不建沙箱不执行测试 |

派生路径：
```
QA_AGENT_ROOT = 本命令所在 qa_agent 仓库的根目录（即本文件 .claude/commands/ 的上两级）
slug         = 有 --prd 时：PRD文件名去扩展名转 kebab-case（01-候选人端-建档.md → candidate-build）
               否则有 --target 时：目标文件 basename 去扩展名转 kebab-case（多个文件取第一个）
               否则：分支名转 kebab-case（/ 替换为 -）
SANDBOX_DIR  = $SOURCE_PROJECT_DIR/.qa-sandboxes/wb-<slug>
WHITEBOX_DIR = $QA_AGENT_ROOT/tests/whitebox/<slug>
CLASSIFY_OUT = $WHITEBOX_DIR/classification.json
```

> WHITEBOX_DIR 固定挂在 qa_agent 仓库根下，不跟随 `QA_WORKSPACE_DIR`（那是 E2E 流水线自己的工作目录变量，可能指向别处）。沙箱为何必须在 `SOURCE_PROJECT_DIR` 内见 `references/prd-driven-flow.md` §五。

---

## Phase 1: Git 分析 + 确定性分类（脚本执行，非 LLM）

提交范围算法、合并分支检测、边界条件的完整规则见 `skills/whitebox-testing/references/prd-driven-flow.md` §一～§二。

### 1a. 确定 BASE..HEAD 范围

**Target 模式**（提供了 `--target`）：跳过下面的时间窗口算法，直接把整个目标文件当作待测内容：

```sh
BASE=$(git hash-object -t tree /dev/null)   # 空树——让目标文件的全部现有内容都算"新增"
HEAD_HASH=$(git -C "$SOURCE_PROJECT_DIR" rev-parse "${BRANCH:-HEAD}")
```

对着空树 diff 时，hunk header 拿不到真实函数名（没有上下文可比对），`classification.json` 里同一文件的多个函数会全部合并显示成 `"(top-level)"`——Phase 4a 生成时仍按 `addedBranches` 逐条覆盖，不影响生成结果，只是分层摘要里看不出分函数归属，读分支列表时按行内容自行判断属于哪个函数即可。

**Branch 模式**（默认）：

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

bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/classify-diff.ts" \
  --source "$SOURCE_PROJECT_DIR" \
  --base "$BASE" \
  --head "$HEAD_HASH" \
  --out "$CLASSIFY_OUT" \
  ${TARGET:+--paths "$TARGET"}
```

Target 模式下把 `--target` 的值透传为 `--paths`，把扫描范围限定到目标文件，避免对着空树 diff 出整个仓库。

输出 `classification.json`，每个文件已包含变更函数名和新增分支：

```json
{
  "modeA": [{
    "file": "lib/reference/country-label.ts",
    "type": "reference-util",
    "addedLineCount": 12,
    "hasExportableEntry": true,
    "functions": [{
      "name": "getCountryLabel",
      "addedBranches": [
        "if (!code) return ''",
        "if (!entry) return code",
        "entry.name[locale] ?? entry.name.en"
      ]
    }]
  }, {
    "file": "lib/server/bootstrap.ts",
    "type": "server-logic",
    "addedLineCount": 8,
    "hasExportableEntry": false,
    "functions": [{ "name": "(top-level)", "addedBranches": ["if (raw) { ... }", "if (signal) process.kill(...)"] }]
  }],
  "modeB": {
    "tools": [{ "file": "lib/ai/tools/github-search.ts", "addedLineCount": 23, "functions": [...] }],
    "mcp": []
  },
  // sub-agent-factory.ts 即使含 execute-like 逻辑，若有 server-only/Next.js 依赖 → 归入 modeA，
  // 测试时用 vi.mock('server-only', () => ({})) 绕过，专注分支逻辑
  "skipped": [{ "file": "lib/some-type.ts", "reason": "仅改注释/import/空行/类型注解" }]
}
```

`hasExportableEntry: false`（如上面 `bootstrap.ts` 例子）表示整个文件找不到任何标准导出写法——纯 IIFE 启动脚本 / CLI-only 入口文件的典型特征。这类文件即使 `functions`/`addedBranches` 非空，也没有任何入口可以从测试文件里 import 进来驱动。**Phase 4a 分层时必须把这类文件归 SKIP，不能进 TIER-1**——这是从这次实测里真实出现过的"测试文件里把源码逻辑重新抄一遍再自我断言"问题（`bootstrap.ts`/`task-worker.ts` 等案例）反推出来的分类修正：与其等生成完了再靠 Phase 4b 检查有没有真实 import，不如在分类阶段就不把这类文件送进"必须生成"的队列。

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
bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/prepare-sandbox.ts" \
  --source "$SOURCE_PROJECT_DIR" \
  --head "$HEAD_HASH" \
  --sandbox "$SANDBOX_DIR"
```

脚本内部：`git worktree add --detach` 建沙箱 → node_modules 从模板复制（不用 junction/symlink 连真实项目；模板只有 lockfile 变化时才重建，重建时在 `SOURCE_PROJECT_DIR` 本体装一次依赖，安全——装的就是它自己要用的依赖）→ 模板复制进本次沙箱（纯本地磁盘拷贝，不联网不跑 bun）。沙箱在 Phase 7 测试结束后立即删除，每次运行全新创建；沙箱内不要跑 `bun install`。

---

## Phase 4: Mode A — 从源码直接生成 Vitest 测试

> 无中间用例文档。分支信息来自 `classification.json`，期望值从源码推导，直接输出 `.test.ts`。

参考覆盖准则：`skills/whitebox-testing/SKILL.md` §一。

**若提供了 `--prd`，读取作为业务背景辅助推导期望行为；未提供时，直接从源码逻辑/命名/类型推导期望值，同样有效，只是少一层业务背景兜底。**

### 4a. 文件分层 + 逐文件生成

**第一步：对 classification.json 的 modeA 列表按可测性分层，先输出分层结果再开始生成**

```
分层规则（Node 环境，无 jsdom，无 @testing-library/react）——按顺序判断，命中即停：

[SKIP 跳过，记录原因]（优先于 TIER-1/TIER-2 判断）：
  - hasExportableEntry === false（整个文件无任何导出符号，纯 IIFE/CLI 脚本，如 bootstrap.ts——
    即使 functions 数组非空也无法通过 import 驱动，方式 A/B 均不适用，不进 TIER-1）
  - functions 数组为空（无新增分支可测）
  - subtype = component .tsx 且无可测纯函数导出
  - addedLineCount > 2000 且 functions 为空（纯数据文件，如 countries.ts、titles/data.ts）

[TIER-1 立即生成]（不满足上面任一 SKIP 条件时）：
  - subtype = util / server-logic / reference-util / api-route
  - 且 functions 数组非空（有可测函数）
  - 且 hasExportableEntry === true

[TIER-2 按需生成]：
  - subtype = component，但文件扩展名为 .ts（非 .tsx）
  - 或 subtype = component .tsx，但文件内有导出的纯函数（非 React 组件的 export function）
```

> `hasExportableEntry` 只能确定性识别"整个文件零导出"这一种情况（比如 bootstrap.ts）。如果文件本身有导出（比如 API route 的 `GET`），但新增分支埋在文件内部一个**未导出**的辅助函数里，`hasExportableEntry` 仍是 `true`，不会被这条规则拦下——这种情况留给生成阶段按 `prd-driven-flow.md` §四"未导出目标的判定规则"处理（驱动最近的已导出入口断言副作用，或该分支直接不生成用例，记录到跳过清单），不是本节判断的范围。

输出分层摘要（此步骤必须展示给用户，不可省略）：
```
Phase 4 文件分层结果：
  TIER-1 (立即生成): N 个文件
    - lib/server/candidate/build-state-machine.ts (server-logic)
    - lib/reference/matcher.ts (reference-util)
    - ...
  TIER-2 (按需生成): M 个文件
    - features/candidate/lib/entry-validation.ts (util)
    - ...
  SKIP: K 个文件
    - app/candidate/build/build-client.tsx (component .tsx，无纯函数导出)
    - lib/reference/titles/data.ts (纯数据文件，0 函数)
    - lib/server/bootstrap.ts (hasExportableEntry=false，纯 IIFE 启动脚本，无导出入口)
    - ...

将生成 N+M 个 .test.ts 文件，跳过 K 个。
```

**第二步：按 TIER-1 → TIER-2 顺序逐文件生成，使用并行读取加速**

对每个待生成文件：

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
| `component` (TIER-2) | 只测文件中导出的纯函数，**不使用 @testing-library/react**；若无纯函数则归入 SKIP |

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

### 4b. 完整性硬门控（强制检查，不可跳过）

测不了的文件/分支**不生成用例**，记一行到跳过清单（文件名 + 原因），不写占位测试。

```
应生成文件数 = TIER-1 数量 + TIER-2 数量 − 生成阶段新记入跳过清单的文件数
实际生成文件数 = ls $WHITEBOX_DIR/vitest/*.test.ts | wc -l
```

**若 实际生成数 < 应生成数，必须补全差额后才能进入 Phase 5/6。**

验证每个已生成文件：

```sh
for f in $WHITEBOX_DIR/vitest/*.test.ts; do
  count=$(grep -c "^\s*it(" "$f" || echo 0)
  if [ "$count" -eq 0 ]; then
    echo "WARNING: $f has 0 test cases — regenerating"
    # 重新生成该文件，最多重试 1 次
  fi
done
```

每个 `it()` 都必须能在文件里找到对真实源文件路径的 `import` / `await import()`（grep basename 即可，不要求精确路径匹配）。不满足的按 `prd-driven-flow.md` §四重做——驱动最近的已导出入口，或不生成并记录到跳过清单。

输出验证摘要：
```
Phase 4 完整性检查：
  应生成: 11 个文件
  已生成: 11 个文件  ✅（含真实 import）
  跳过清单:
    - bootstrap.ts（hasExportableEntry=false，无导出入口）
    - task-worker.ts 的 addedBranch "if (approvalRequiredToolNames.length > 0)"（驱动入口需要真实 Redis/DB，成本过高）
  跳过(SKIP，Phase 4a 分层阶段判定): 78 个文件 → 见分层摘要
```

> **注意**：Mode B 问题不得压缩 Mode A 的覆盖面。Mode A 和 Mode B 是独立阶段，即使 Mode B 完全失败，Mode A 也必须达到 "应生成数 = 实际生成数"。跳过清单里的文件/分支不计入分母。

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
  "runId": "<slug>",
  "authEnvVar": null
}
```

注意：`executeStart/End` 传 0 即可，orchestrator Phase 1 会自动 Grep 重算。Prefix 取 modeB.tools 文件名的公共单词大写，如 `office-tools.ts` → `OFFICE`。

### 5d. MCP Mode B — 插桩判定 + Vitest L1+L2 生成（仅当 modeB.mcp 非空）

详细方法论见 `skills/whitebox-testing/references/mcp-testing.md`（黑盒 L1+L2 主体）和 §八（本地插桩）。

**Step 0 — 判定能否本地起服务**

对每个 `modeB.mcp` 文件：`Grep` 同文件 / 同包内是否有 `Bun.serve(` / `.listen(` / `createServer(` 等启动调用。

- **能找到** → 走 Step 1a（本地插桩）
- **找不到**（纯远程部署 / 入口分散无法确定）→ 走 Step 1b（黑盒，行为不变）

#### Step 1a — 本地可起服务：插桩 + spawn

1. 在 `SANDBOX_DIR` 内对该文件的 `server.tool()` handler 插 2-4 探针（规则见 `instrumentation.md §2b`，探针校验清单同 Tool 插桩：括号平衡、IIFE 内原始代码字节对字节不变、无第 5 个探针）
2. 生成的 Vitest spec 用 `InstrumentedMcpServer.spawn({ entryFile: <SANDBOX_DIR 内的 server 入口文件>, cwd: <入口文件所在目录>, debugEnvVar: "<PREFIX>_MCP_DEBUG" })` 在 `beforeAll` 里启动子进程，`McpClient.fromEnv({ serverUrl: server.url })` 连接，而不是读 `.env` 的 `MCP_SERVER_URL`
3. `afterEach` 里失败时 `server.drainProbeLogs(eventPrefix)` 把探针证据打到输出（诊断用，不影响 pass/fail）
4. `afterAll` 里 `server.close()` 杀掉子进程

参考实现：`scripts/demo-mcp-server.ts` + `tests/whitebox/demo-mcp/vitest/*.test.ts`。

#### Step 1b — 仅远程 / 无本地入口：discover.ts 获取工具 schema（原有黑盒流程，不变）

从 `.env`（或提供了 `--prd` 时，其中记录的 MCP server URL/工具列表）中确认信息，执行：

```sh
bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/discover.ts" \
  --url "$MCP_SERVER_URL" \
  --tools "<comma-separated tool names from modeB.mcp files>" \
  --auth-env "MCP_AUTH_TOKEN" \
  --out "$WHITEBOX_DIR/mcp-discovery.json"
```

若 server 不可达（本地未启动 / 未部署），跳过 discover，直接按源码中 `server.tool()` 声明推断 schema，生成 `MCP_OFFLINE=1` 下全部 skip 的 spec 骨架。

**Step 2 — 生成 Vitest spec（L1 + L2，两条路径通用）**

读取（Step 1a 时）源文件中的工具注册逻辑，或（Step 1b 时）`mcp-discovery.json` 的 `inputSchema`，按 `mcp-testing.md` §三模板为每个工具生成：

```
$WHITEBOX_DIR/vitest/<tool-name>.test.ts
```

每个文件必须包含：
- `[L1]` schema 合规：工具存在性、inputSchema 必要字段、annotations
- `[P0][L2]` happy path（正常参数）
- `[P0][L2]` 鉴权失败（`noAuth: true`，仅 Step 1b 适用——本地插桩实例通常无鉴权层）
- `[P0][L2]` 必填参数缺失 → `isError=true`
- `[P0][L2]` 幂等性（`stripVolatile` + `toEqual`）
- `[P1][L2]` 边界值、分页、空结果（视工具 schema 决定是否适用）

import 路径指向共享库：
```ts
import { McpClient, InstrumentedMcpServer, parseToolResult, stripVolatile } from
  "<相对路径>/skills/whitebox-testing/scripts/mcp-client.js";
import "dotenv/config";
```

**Step 3 — 执行**

MCP spec 与 Mode A spec 在同一目录（`$WHITEBOX_DIR/vitest/`），由 Phase 6 的 `bun vitest run` 统一执行。无需单独命令。Step 1b 若 server 不可达，在 `.env` 中设 `MCP_OFFLINE=1` 使所有 `describe.skipIf(OFFLINE)` 块自动 skip。

---

## Phase 6: 执行 + 覆盖率验证

### Mode A — Vitest（带覆盖率）

生成专用 vitest config、解析 vitest 二进制路径、执行、解析覆盖率、分类已知错误信号——这几步收进了一个脚本，不再在本文档里手写 shell/PowerShell：

```sh
bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/run-mode-a.ts" \
  --source-dir "$SOURCE_PROJECT_DIR" \
  --whitebox-dir "$WHITEBOX_DIR" \
  --source-files "<MODEA_SOURCE_FILES_RELATIVE_TO_MIRA_WORK>"
```

`<MODEA_SOURCE_FILES_RELATIVE_TO_MIRA_WORK>` = `classification.json` 里 `modeA[].file` 去掉 `apps/mira-work/` 前缀后的逗号分隔列表（不用 `**`，避免把未改动的历史代码也算进覆盖率分母）。`--app-dir` 默认 `apps/mira-work`，需要时可覆盖。

脚本内部做的事：生成 `$WHITEBOX_DIR/vitest.whitebox.config.ts`（`include` 指向 whitebox 目录、`coverage.include` 只含上面这份文件列表、`@mira/*` 等 alias 同旧版）→ 解析 `$SOURCE_PROJECT_DIR/node_modules/vitest` 这个 junction/symlink 拿到真实 binary 路径 → 执行并写入 `$WHITEBOX_DIR/vitest-run.log` → 读 `coverage-summary.json` 打印 `branches.pct` 作参考信息（不做 pass/fail 判断，验收标准仍是 Phase 4b 的 addedBranches 检查）→ 对输出做已知错误信号匹配，命中就打印对应处理建议（`Cannot find module '@mira/...'`、`z.object is not a function`、`Cannot find module from .bun/...` 三类，具体处理方式见脚本内注释）。退出码就是 vitest 的退出码。

其他错误 → 记录，进 Phase 7 分类。

### Mode B — runner.ts

**前置检查（必须验证）**：

```sh
# SANDBOX_DIR 必须在 SOURCE_PROJECT_DIR 内部（原因见 references/prd-driven-flow.md §五），否则 bun 无法上溯找到 mira/node_modules
echo "$SANDBOX_DIR" | grep -q "$SOURCE_PROJECT_DIR" || { echo "❌ SANDBOX_DIR 不在 SOURCE_PROJECT_DIR 内，停止"; exit 1; }
```

```sh
bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/runner.ts" \
  --config "$QA_WORKSPACE_DIR/tests/reports/tool-probe/config-<slug>.json" \
  --report  "$QA_WORKSPACE_DIR/tests/reports/tool-probe/report-<slug>.md"
```

runner.ts 内部自动完成：
1. `process.chdir(cfg.sourceProjectDir)` — cwd 切到 sandbox（在 mira 内部）
2. 从 sandbox 内加载 `.env`、设置 `debugEnvVar=1`
3. 动态 import 探针已插桩的工具文件
4. 执行测试用例，捕获 probe 事件（logger monkey-patch）
5. 写 evidence JSONL，供 claude -p 裁决

**常见失败原因排查**：

| 错误信息 | 根因 | 修复 |
|---------|------|------|
| `Cannot find module '@opentelemetry/api'` | SANDBOX_DIR 在 mira 外部 | 确认 Phase 0 的 SANDBOX_DIR 路径 |
| `Cannot find module '@mira/...'` | 该包的 node_modules 没有从模板拷贝进沙箱 | 重新执行 Phase 2 的模板拷贝步骤（2a/2b）；若模板本身缺该包，先确认 Phase 2a 的 lockfile 哈希检查有没有触发重建 |
| `does not export factory "..."` | 工厂函数名拼错或文件路径错 | 检查 config.json 的 tools[].factory |
| `bun fatal error` (无 try/catch) | 极少见，通常是 bun 本身 bug | 更新 bun 版本或换 node 执行 |

**`--judge-only`（调试用）**：跳过 runCases，只对已有 evidence 重新跑 claude -p：
```sh
bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/runner.ts" \
  --config "$QA_WORKSPACE_DIR/tests/reports/tool-probe/config-<slug>.json" \
  --report  "$QA_WORKSPACE_DIR/tests/reports/tool-probe/report-<slug>.md" \
  --judge-only
```

---

## Phase 7: 清理 + 报告

> **必须执行**：无论 Phase 4-6 是否失败，都要先删沙箱，再输出报告。

### 7a. 删除沙箱（Mode B 时）

```sh
bun "$QA_AGENT_ROOT/skills/whitebox-testing/scripts/cleanup-sandbox.ts" \
  --source "$SOURCE_PROJECT_DIR" \
  --sandbox "$SANDBOX_DIR"
```

`git worktree remove --force` 单独一条命令在 Windows 上会因深层 node_modules 路径过长而删不干净；
`cleanup-sandbox.ts` 内置 `core.longpaths` + robocopy 兜底 + verify，直接调用即可。

若 `SANDBOX_DIR` 不存在（纯 Mode A），跳过此步。

### 7b. 失败分类与处置

读取 `vitest-report.json`（Mode A）和 `report-<slug>.md`（Mode B）：

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
  "feature": "<slug>"
}
```

### 7c. 输出报告摘要

```
白盒测试报告 — <slug>
================================
分析范围：<BASE:.7>..<HEAD:.7>（N 个变更文件，M 个函数，K 个分支）

[覆盖率]  Branches: 72%（整文件参考值，含历史代码）| addedBranches: 3/3 已覆盖 ✅

[Mode A — Vitest] 通过 X / 共 Y
  ✓ country-label.test.ts  — 5/5
  ✗ ProfileForm.test.tsx   — 2/4
    [BUG]    it("hasResume=true 时上传组件应渲染") — data-testid 缺失
    [REVIEW] it("表单初始值应为空") — 期望值写错

[Mode B — Tool]  通过 X / 共 Y（若有）
[Mode B — MCP]   通过 X / 共 Y（若有；OFFLINE 时显示"N skipped"）

报告: $WHITEBOX_DIR/vitest-report.json
```
