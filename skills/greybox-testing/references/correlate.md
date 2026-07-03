# Correlation Reference — 探针日志 ↔ CDP 步骤对齐

灰盒的核心工程问题：一次真实用户流程会触发多次服务端内部调用，探针日志是一条**混合的时间序列**，如何精确判断"第 N 个 CDP 动作 → 服务端这一条探针"？本文给出三种对齐策略（按可靠性排序）、日志采集方法、断言范式。

---

## 一、对齐三策略（首选 nonce）

### 策略 A — nonce 关联（首选，最可靠）

**思路**：在 CDP 动作里注入一个**全局唯一、会流入被测单元 input 的值**，探针 `input` 里 grep 这个值即命中，天然一一对应，不受并发/时序影响。

**怎么注入 nonce**（按流程性质选）：
- 表单/搜索：往文本框填 `qa-nonce-<step>-<rand>`（如搜索关键词、备注字段）。
- 无自由输入字段：用 CDP 加一个自定义请求头或 query 参数——`navigate_page("<url>?qa_marker=<nonce>")`，前提是被测单元的 `input` 会带上 query/header（探针 input 里能看到）。
- 都不行 → 降级到策略 B。

**探针侧配合**（插桩时，data 里带上能反映 input 的字段即可，4 探针本来就记 `input`，无需额外改动）：
```ts
if (process.env.XX_TOOL_DEBUG === "1")
  logger.info("[xx-debug] tool.input", { event: "xx-debug.tool.input", tool: "search", input });
```

**对齐**：CDP 第 N 步用了 `qa-nonce-3-a1b2` → `grep 'qa-nonce-3-a1b2' server.log` → 命中的探针簇（input/output/request/response）就是这一步触发的。

### 策略 B — 时间窗口关联（次选）

nonce 注入不进去时用。CDP runner 记录每个动作的**墙上时钟**；探针日志行带 ISO 时间戳；把动作时间之后、下一个动作之前窗口内的探针行归给该动作。

**要求**：
- 探针日志行必须有时间戳（logger 默认带；`console.log` 兜底时手动 `new Date().toISOString()` —— 但脚本环境 `Date.now()` 不可用的限制**只针对 workflow 脚本**，插到 mira 源码里的探针用真实 logger 时间戳，不受影响）。
- 流程**串行执行**：每个 CDP 动作后 `wait_for` 到页面稳定再做下一步，避免两个动作的探针在时间上交叠。
- 单动作触发多次内部调用时，窗口内可能有多条探针簇——结合 input 内容人工判断哪簇是目标。

### 策略 C — marker 关联（兜底）

前两者都不适用（如动作不产生任何可识别 input，且时序密集）时。**在服务端加一条只为对齐的"哨兵"探针**：在被测流程的入口中间件/路由起点插一条 `logger.info("[xx-debug] marker", { marker: req.headers['x-qa-marker'] })`，CDP 每步带上 `x-qa-marker: <nonce>` 头。marker 行把日志切成段，段内的其他探针归属该步。

> marker 是额外插桩，同样要 env 门控、结束还原，计入 Phase 2 的备份文件清单。

---

## 二、服务端日志采集

### 启动时重定向 stdout

```sh
# 端口用 --port，DEBUG env 名与探针 prefix 对应（如 SEARCH_TOOL_DEBUG）
<DEBUG_ENV>=1 PORT=<port> bun dev > "$GREYBOX_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$GREYBOX_DIR/server.pid"
```

### 等 ready（别用固定 sleep，轮询端口）

```sh
for i in $(seq 1 60); do
  curl -sf "http://localhost:<port>" >/dev/null 2>&1 && break
  grep -q "Ready in\|started server\|Local:" "$GREYBOX_DIR/server.log" && break
  sleep 1
done
```

### 采集某一步的探针簇

```sh
# nonce 关联
grep "qa-nonce-3-a1b2" "$GREYBOX_DIR/server.log"

# 只看某 prefix 的探针行（排除普通业务日志）
grep "\[xx-debug\]" "$GREYBOX_DIR/server.log"

# 时间窗口：动作发生在 T1，下一动作 T2
awk -v a="$T1" -v b="$T2" '$0 >= a && $0 <= b' "$GREYBOX_DIR/server.log" | grep "\[xx-debug\]"
```

> **快照分界**：每步 CDP 动作**前**，先记一条日志分界——`echo "=== STEP <n>: <desc> @ $(date -u +%FT%TZ) ===" >> "$GREYBOX_DIR/steps.log"`，采集时用它切段，比纯时间戳更直观。

---

## 三、断言范式（拿到探针簇之后怎么判对错）

每个探针簇是一个 JSON：`{ event, input, output?, request?, response? }`。按目标断言：

| 想验证的内部行为 | 断言什么 |
|---|---|
| **走对了分支** | `input` 满足触发条件 + `output` 是该分支特有结果；或加一条分支专属探针打 `{ branch: "transitional-labor" }` |
| **发给 provider 的请求体正确** | `request.body` / `request.query` 含预期参数（如 `region: "CN"`、`page: 1`） |
| **provider 响应被正确处理** | `response.statusCode` + `response.data` 与 `output` 的映射关系符合预期 |
| **命中/未命中缓存** | 探针里打 `{ cacheHit: boolean }`，或第二次同 nonce 调用无 `provider.request` |
| **内部状态机转移** | 连续探针的 `output.state` 序列 == 预期路径 |

**判定方式**：
- **能纯断言**（值可精确比对）→ 直接在 runner 里 `expect`/比对，不用 LLM。
- **模糊判断**（"这个路由分支对这个 case 合不合理"需要业务理解）→ `--judge` 开启，把 `{ CDP步骤, flow描述, 探针簇 }` 喂给 `claude -p` 裁决，`JUDGE_LANG` 控制输出语言，并发保持 1（同 whitebox runner 约束）。

---

## 四、常见坑

| 现象 | 根因 | 处理 |
|---|---|---|
| server.log 里一条 `[xx-debug]` 都没有 | DEBUG env 没传进 dev server / 探针插错文件（不是运行中加载的那份） | 确认 `<DEBUG_ENV>=1` 在启动命令里；确认插的是 `SOURCE_PROJECT_DIR` 本体而非沙箱 |
| 探针有 input 无 request/response | 该单元本次没走到出站 fetch（可能命中缓存或早返回），或 hasProvider=false | 对照分支预期判断是否正常，不一定是 bug |
| nonce 在探针里找不到 | 值被前端改写（trim/大小写/编码）或没流到被测单元 | 换一个原样透传的字段；或降级时间窗口关联 |
| 两步的探针混在一起 | 动作间没等页面稳定，时序交叠 | CDP 每步后 `wait_for` 稳定；优先 nonce 关联 |
| 停服务后端口还占用 | 后台进程没杀干净 | Phase 6 用 `server.pid` `kill`，再 `lsof -ti:<port> | xargs kill` 兜底 |
