---
name: Grey-Box Testing
description: 灰盒测试——CDP 从外部驱动真实用户流程，同时用白盒探针在服务端捕获返回值/DOM 里看不到的内部行为，两侧对齐后断言。当用户说"灰盒测试""插桩 + CDP""真实流程里验证内部逻辑""bug 只在 UI 复现但根因在服务端""结合探针和浏览器测"时触发。需要能在本地起服务（探针跑在服务端进程），远程 preview 无法插桩。
version: 1.0.0
allowed_tools: [Read, Write, Edit, Grep, Glob, Bash]
---

# Grey-Box Testing Skill

灰盒测试 = **黑盒驱动 + 白盒观测**。

- **黑盒侧（CDP）**：真实浏览器走完整用户流程（登录态、多步交互、SSR 时序），这是黑盒单调 `execute()` 复现不出来的。
- **白盒侧（探针）**：在服务端源码里插 env 门控的探针，捕获**返回值和 DOM 里都看不到的内部行为**——走了哪条分支、发给 provider 的请求体、命中了哪个缓存、内部状态机转移。

核心问题：**这个真实用户流程，在服务端内部到底发生了什么？做的对不对？**

---

## 一、什么时候用（和 whitebox / 纯 CDP 的分工）

| 你的需求 | 用哪个 |
|---|---|
| 只想覆盖某函数/Tool 新增的分支，隔离直调即可 | **whitebox**（`/qa-whitebox`），直调 `execute()` |
| 只想验证页面表现（按钮在不在、文案对不对、能不能跳转） | **纯 CDP**（`/qa-explore` 等），黑盒 |
| **bug 只在真实 UI 流程里复现，但断言目标是内部逻辑（分支/请求体/内部状态）** | **灰盒**（本 skill，`/qa-greybox`） |

典型灰盒场景：
- 前端某操作触发了一个服务端 API/Tool，页面只显示"成功"，但你要验证它**内部走的是哪条路由分支**（如 sourcing pipeline 的"过渡用工/CTS 误路由"）。
- 多步表单提交后，要确认**发给上游 provider 的 body 是否带了正确参数**——DOM 里根本看不到。
- 登录态 + 权限相关的分支，只有真实会话才能触发，隔离直调 mock 不出来。

> 你在 mira sourcing pipeline 那次 38 用例，本质就是灰盒：`SOURCING_FLOW_DIAG` 插桩 + CDP autoConnect。本 skill 把那套手法固化成可复用流程。

---

## 二、核心机制与三条硬约束

灰盒和 whitebox 最大的不同：**探针必须插到「运行中的 app 实际加载的那份源码」上，并且这个 app 必须在本地起服务。**

### 约束 1 — 必须本地起服务，不能测远程 preview

探针是 `logger.info("[xx-debug] ...")`，跑在 **Next.js 服务端进程**里。远程部署的 `PREVIEW_URL` 你插不了桩、也拿不到它的服务端 stdout。所以灰盒**必须**：

```
从 SOURCE_PROJECT_DIR 本地 `bun dev`（带 DEBUG env）起服务 → CDP 指向 localhost
```

如果 `.env` 的 `PREVIEW_URL` 是远程地址，灰盒会忽略它，改用本地 `http://localhost:<port>`。

### 约束 2 — 插到真实源码，不用 whitebox 的丢弃沙箱

whitebox Mode B 用 `git worktree` 建用完即删的沙箱，因为它 in-process 直调。灰盒不行——**运行中的 dev server 加载的是 `SOURCE_PROJECT_DIR` 本体**，探针必须插在本体上才能生效。

因此**清理靠文件级备份/还原，不靠丢弃沙箱**：
1. 插桩前，把每个要改的源文件**原样备份到 scratchpad**（不是 `git checkout`——用户可能有未提交改动，checkout 会误删）。
2. 插桩 → 起服务 → 跑流程 → 采集。
3. 结束后**从备份逐字还原**每个文件。即使流程中途失败也必须还原（见 Phase 6）。

### 约束 3 — 探针输出在服务端 stdout，CDP 抓不到

CDP 的 `list_console_messages` / `get_console_message` 只看**浏览器 console**。服务端探针日志走 dev server 的 stdout。所以：

```
启动时把服务端 stdout 重定向到日志文件：
  <DEBUG_ENV>=1 bun dev > $GREYBOX_DIR/server.log 2>&1 &
采集时 tail/grep 这个文件里的 [<prefix>-debug] 行
```

---

## 三、探针规则：直接复用 whitebox

4 探针模型（input / output / request / response）、挂载位置、logger 导入规则、插桩校验清单（括号平衡 / IIFE 内字节对字节不变 / 无第 5 探针）**完全复用**：

→ **[whitebox-testing/references/instrumentation.md](../whitebox-testing/references/instrumentation.md)** §一、§二

灰盒对探针只有一处额外要求：**每条探针的 data 里带上一个可关联字段**（见下节 correlate.md 的 nonce 方案），方便和 CDP 步骤对齐。

---

## 四、探针日志 ↔ CDP 步骤对齐

灰盒独有的难点：一次真实流程可能触发多次内部调用，如何把"我点了这个按钮"和"服务端这条探针"对上？

→ **[references/correlate.md](references/correlate.md)**（对齐三策略 + 日志采集 + 断言范式）

一句话预览：**首选 nonce 关联**——在 CDP 里输入一个唯一值（如搜索框填 `qa-nonce-<n>`），到探针 `input` 里 grep 这个值，命中即对齐；次选时间窗口关联；兜底 marker 关联。

---

## 五、入口与流程

```
/qa-greybox --target <file|tool> --flow "<用户流程描述>" [--launch "<启动命令>"] [--port <n>] [--judge]
```

- `--target`：要观测的服务端单元（文件路径 / Tool 名 / API route），决定插桩位置。
- `--flow`：要走的用户流程，自然语言描述（如 "登录 → 进候选人库 → 搜索'过渡用工' → 点第一个结果"）。greybox-runner agent 据此用 CDP 驱动。
- `--launch`：本地起服务命令，默认 `bun dev`（mira）。
- `--port`：本地服务端口，默认从启动日志自动探测 / `3000`。
- `--judge`：内部行为对错判断不确定时，追加一次 `claude -p` 裁决（默认关，能纯断言就纯断言）。

流程七阶段（完整见 command `/qa-greybox`）：

```
Phase 0  载入 .env（SOURCE_PROJECT_DIR、凭据、JUDGE_LANG）+ 解析目标/流程
Phase 1  定位插桩点（读源码，确定 target 的 execute/handler/分支位置）
Phase 2  备份源文件 → 按 instrumentation.md 插 4 探针（带 nonce 字段）
Phase 3  <DEBUG_ENV>=1 本地起服务，stdout → server.log，等 ready
Phase 4  委派 greybox-runner agent：CDP 驱动 --flow（每步埋 nonce/marker）
Phase 5  采集 server.log 探针行 → 按 correlate.md 与 CDP 步骤对齐 → 断言内部行为
Phase 6  停服务 + 从备份还原所有源文件（必做，失败也要还原）
Phase 7  输出报告（CDP 步骤 × 内部证据对照表）
```

---

## 六、和 whitebox 的复用关系（不要重复造轮子）

| 能力 | 来源 |
|---|---|
| 4 探针模型 / 插桩语法 / 校验清单 | 复用 `whitebox-testing/references/instrumentation.md` |
| CDP 驱动 / 自适应找元素 / i18n 解析 | 见 `greybox-runner` agent 自身的「CDP 通用范式」一节 |
| **本 skill 新增的唯一内容** | 「插运行中源码 + 本地起服务 + 服务端日志与 CDP 对齐」这套编排（correlate.md） |

不改 whitebox 的任何脚本；灰盒是它和 CDP 之间那座**手工搭的桥**的固化版。
