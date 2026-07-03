---
description: "灰盒测试：插桩运行中源码 → 本地起服务 → CDP 驱动真实流程 → 服务端探针与 CDP 步骤对齐 → 断言内部行为"
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob
---

You are a grey-box test orchestrator. 你把白盒探针和 CDP 黑盒驱动结合起来：在**运行中的服务端源码**上插探针，本地起服务，用 CDP 走一遍真实用户流程，然后把服务端探针捕获的内部行为和 CDP 每一步对齐，断言"这个真实流程内部做的对不对"。

```
/qa-greybox --target <file|tool|route> --flow "<用户流程描述>" [--launch "<启动命令>"] [--port <n>] [--correlation nonce|time|marker] [--judge] [--dry-run]
```

开始前，**完整读** `skills/greybox-testing/SKILL.md` 和 `skills/greybox-testing/references/correlate.md`；插桩语法读 `skills/whitebox-testing/references/instrumentation.md` §一、§二。

灰盒的三条硬约束（SKILL.md §二）务必牢记：**① 必须本地起服务（远程 preview 插不了桩）；② 插真实源码本体、靠备份还原而非丢弃沙箱；③ 探针输出在服务端 stdout。**

---

## Phase 0: 载入上下文

```
Read(".env")
```

提取：
- `SOURCE_PROJECT_DIR` — 源码绝对路径（**灰盒在这里插桩、起服务**）
- `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` — 登录凭据（注意 .env 同 key 多行，取真正生效那行）
- `JUDGE_LANG`（默认 `zh`）、`CLAUDE_JUDGE_CONCURRENCY`（默认 `1`）
- `PREVIEW_URL` **仅作参考——灰盒忽略远程地址，用本地 localhost**

解析 `$ARGUMENTS`：

| Flag | 默认 | 说明 |
|---|---|---|
| `--target <file\|tool\|route>` | 必填 | 要观测的服务端单元（决定插桩位置） |
| `--flow "<描述>"` | 必填 | 要走的真实用户流程（自然语言） |
| `--launch "<cmd>"` | `bun dev` | 本地起服务命令（mira 默认 `bun dev`） |
| `--port <n>` | 自动探测/`3000` | 本地服务端口 |
| `--correlation` | `nonce` | 对齐策略：`nonce`\|`time`\|`marker`（见 correlate.md §一） |
| `--judge` | off | 模糊内部判断追加 `claude -p` 裁决 |
| `--dry-run` | off | 只做 Phase 1（定位插桩点 + 展示计划），不插桩不起服务 |

派生：
```
QA_AGENT_ROOT = 本文件 .claude/commands/ 的上两级
SCRATCH       = 会话 scratchpad 目录（源文件备份放这里）
slug          = target basename 去扩展名转 kebab-case
GREYBOX_DIR   = $QA_AGENT_ROOT/tests/greybox/<slug>
SERVER_LOG    = $GREYBOX_DIR/server.log
STEPS_LOG     = $GREYBOX_DIR/steps.log
```
`mkdir -p "$GREYBOX_DIR"`

---

## Phase 1: 定位插桩点

1. 解析 `--target`：文件路径 → 直接读；Tool 名 / route → `Grep` 定位源文件。
2. `Read` 源文件，确定探针挂载位置（`instrumentation.md` §二）：
   - Tool（vercel-ai `execute()`）→ execute 首行 / IIFE 出口 / fetch 前后
   - MCP handler → handler 回调首行 / IIFE 出口 / fetch 前后
   - API route / server-logic 函数 → 入口首行 / 各 return 前 / 外部调用前后
3. 决定 `eventPrefix` + `DEBUG_ENV`（如 target 关键词 `search` → prefix `search-debug`，env `SEARCH_TOOL_DEBUG`）。
4. 若需**分支专属探针**（correlate.md §三，用于断言"走了哪条分支"）或 **marker 探针**（correlation=marker），一并规划位置。

展示插桩计划（`--dry-run` 到此结束）：
```
灰盒插桩计划 — <slug>
目标文件: <绝对路径>
探针: input@L?, output@IIFE, request@L?, response@L?  [+ branch-marker@L?]
DEBUG_ENV: SEARCH_TOOL_DEBUG   eventPrefix: search-debug
启动: <launch> (port <port>)   对齐策略: <correlation>
流程: <flow>
```

---

## Phase 2: 备份 + 插桩（改的是 SOURCE_PROJECT_DIR 本体）

> **不要用 git checkout 还原**——用户可能有未提交改动。改哪个文件就先原样备份哪个。

对每个要插桩的源文件：
```sh
# 备份（保留相对路径结构，防重名）
REL="<file 相对 SOURCE_PROJECT_DIR 的路径>"
mkdir -p "$SCRATCH/greybox-backup/$(dirname "$REL")"
cp "$SOURCE_PROJECT_DIR/$REL" "$SCRATCH/greybox-backup/$REL"
```
把所有备份文件清单写入 `$GREYBOX_DIR/backup-manifest.txt`（Phase 6 据此还原，防遗漏）。

然后 `Edit` 插探针（语法 + 校验清单见 `instrumentation.md` §二：括号平衡 / IIFE 内字节对字节不变 / logger import 存在 / 无第 5 探针）。探针一律 env 门控（`process.env.<DEBUG_ENV> === "1"`），`input` 字段务必原样记录（nonce 关联要靠它）。

---

## Phase 3: 本地起服务（带 DEBUG env，stdout 落盘）

```sh
cd "$SOURCE_PROJECT_DIR"
<DEBUG_ENV>=1 PORT=<port> <launch> > "$SERVER_LOG" 2>&1 &
echo $! > "$GREYBOX_DIR/server.pid"
```
> 用 `run_in_background` 起这条长驻命令。**别用固定 sleep**，轮询就绪（correlate.md §二）：
```sh
for i in $(seq 1 90); do
  curl -sf "http://localhost:<port>" >/dev/null 2>&1 && { echo READY; break; }
  grep -qi "ready in\|started server\|Local:.*localhost" "$SERVER_LOG" && { echo READY; break; }
  sleep 1
done
```
90s 内未就绪 → 读 `SERVER_LOG` 尾部诊断（依赖缺失/端口占用/编译错），**直接跳到 Phase 6 还原**后报错退出。

---

## Phase 4: 委派 greybox-runner 驱动流程

调用 `greybox-runner` agent（`.claude/agents/greybox-runner.md`），传入：

```json
{
  "baseURL": "http://localhost:<port>",
  "flow": "<--flow 值>",
  "serverLog": "<SERVER_LOG 绝对路径>",
  "stepsLog": "<STEPS_LOG 绝对路径>",
  "eventPrefix": "<eventPrefix>",
  "correlation": "<correlation>",
  "nonceField": "<注入 nonce 的字段/参数，nonce 策略时>",
  "authSetup": true,
  "testCredentials": { "email": "<E2E_TEST_EMAIL>", "password": "<E2E_TEST_PASSWORD>" },
  "expectations": [
    { "step": "<关键步描述>", "target": "output.route", "expected": "apollo-cn", "note": "region=CN 应走中国区路由" }
  ],
  "judge": <--judge>
}
```

`expectations` 由你从 `--flow` + 源码分支逻辑推导（correlate.md §三的断言范式）。agent 返回 `greybox-results.json` 路径 + 通过/失败计数。

---

## Phase 5: 汇总（agent 已做对齐断言，这里读结果）

读 `greybox-results.json`。若有 `evidenceMissing > 0`（某关键步没抓到探针）——按 correlate.md §四判断是桩没生效还是没走到分支，如实记入报告，不当通过。

---

## Phase 6: 停服务 + 还原源码（**必做，任何失败路径都要执行**）

```sh
# 停服务
kill "$(cat "$GREYBOX_DIR/server.pid")" 2>/dev/null
lsof -ti:<port> | xargs kill 2>/dev/null   # 兜底

# 逐文件从备份还原（按 manifest，防遗漏）
while read REL; do
  cp "$SCRATCH/greybox-backup/$REL" "$SOURCE_PROJECT_DIR/$REL"
done < "$GREYBOX_DIR/backup-manifest.txt"

# 校验已还原干净（应无 [<eventPrefix>] 残留）
git -C "$SOURCE_PROJECT_DIR" status --short
grep -rl "$DEBUG_ENV" "$SOURCE_PROJECT_DIR/<改过的目录>" 2>/dev/null && echo "⚠️ 仍有探针残留，手动检查"
```

---

## Phase 7: 报告

```
灰盒测试报告 — <slug>
================================
目标: <target>    流程: <flow>
本地服务: http://localhost:<port>    对齐: <correlation>

[CDP 步骤]  执行 5 / 5
[内部行为断言]  通过 3 / 4
  ✓ STEP3 region=CN → output.route = apollo-cn
  ✓ STEP3 request.query.page = 1
  ✗ STEP4 期望命中缓存(无 provider.request)，实际又发了一次 fetch  → 疑似缓存未生效
      证据: <探针簇摘要>    截图: test-results/greybox-step4.png
  ⚠ STEP5 未抓到探针簇（排查: 是否走到该分支）

源码还原: ✅ 干净（git status 无残留）
报告文件: <GREYBOX_DIR>/greybox-results.json
```

失败项若判定为代码 bug，询问是否按 `bug-reporter` 提 Linear issue（`pipeline: "greybox"`，附截图 + 探针簇证据）。
