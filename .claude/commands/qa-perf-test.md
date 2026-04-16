---
description: "性能测试流水线：分析API endpoint → 生成k6性能测试 → 执行 → 基线对比 → 报告"
allowed-tools: Agent, Bash, Read, Write, Grep, Glob
---

You are a performance test orchestrator. Analyze API endpoints, generate k6 performance test scripts, execute them, compare with baselines, and produce reports.

```
/qa-perf-test [--target <api-endpoint>] [--concurrent <N>] [--duration <time>]
     |
Phase 0: Load project context (.env -> PREVIEW_URL, target config)
     |
Step 1: Endpoint analysis (identify API type: REST/SSE/WebSocket)
     |
Step 2: Generate k6 scripts (call perf-test-generator skill)
     |
Step 3: Execute performance tests (k6 run)
     |
Step 4: Baseline comparison (vs tests/perf/baseline.json)
     |
Step 5: Report (summary + degradation alerts)
```

## Phase 0: Load Project Context

```
Read(".env")
```

Extract:
- `PREVIEW_URL` — 测试目标 base URL
- `QA_WORKSPACE_DIR` — 工作目录，脚本和报告存放位置

**Parse parameters from $ARGUMENTS**（支持中英文）:

| Flag | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `--target` | API endpoint 路径 | 必须指定或通过自然语言描述 | `/api/chat/stream` |
| `--concurrent` | 最大并发用户数 | `50` | `20` |
| `--duration` | 持续负载时间 | `2m` | `5m` |

**自然语言解析**:

| 输入 | 解析结果 |
|------|----------|
| `测试聊天接口` / `test chat api` | target = `/api/chat`（需进一步分析） |
| `50并发` / `50 concurrent` | concurrent = 50 |
| `持续5分钟` / `5 minutes` | duration = `5m` |
| `测试 /api/chat/stream 20并发 3分钟` | target = `/api/chat/stream`, concurrent = 20, duration = `3m` |

## Step 1: Endpoint 分析

分析 target endpoint 的 API 类型：

```
1. 如果 target 以 ws:// 或 wss:// 开头 → type = "websocket"
2. 否则，检查 endpoint 特征：
   - 路径包含 "stream" / "sse" / "events" → type = "sse"（待确认）
   - 路径包含 "ws" / "socket" → type = "websocket"（待确认）
   - 其他 → type = "rest"

3. 如有源码可读，扫描源码确认：
   Grep(sourceDir, "endpoint path") → 查看 handler 实现
   - 返回 ReadableStream / text/event-stream → type = "sse"
   - 使用 WebSocket → type = "websocket"
   - 标准 JSON 响应 → type = "rest"

4. 读取请求/响应类型（从源码或 API 文档）：
   - request body schema
   - response schema
   - authentication method (bearer token / cookie / API key)
```

输出：
```json
{
  "endpoint": "/api/chat/stream",
  "method": "POST",
  "type": "sse",
  "requestSchema": { "message": "string", "stream": "boolean" },
  "auth": "bearer"
}
```

## Step 2: 生成 k6 脚本

根据 Step 1 的分析结果，按 `skills/perf-test-generator/SKILL.md` 中的模板生成 k6 脚本。

**选择模板**：
- `type === "rest"` → 模板 1: HTTP API 性能测试
- `type === "sse"` → 模板 2: SSE/Streaming 响应测试
- `type === "websocket"` → 模板 3: WebSocket 长连接测试
- 多个 endpoint → 模板 4: 混合场景

**写入路径**：
```
$QA_WORKSPACE_DIR/tests/perf/{feature}.k6.js
```

其中 `{feature}` 从 endpoint 路径推导：
- `/api/chat/stream` → `chat-stream`
- `/api/tasks` → `tasks`
- `wss://app.example.com/ws` → `ws-connection`

**配置 SLA threshold**：
```javascript
thresholds: {
  http_req_duration: [`p(95)<2000`],
  http_req_failed: [`rate<0.01`],
  // SSE 场景额外指标
  ttft: [`p(95)<2000`],
  stream_throughput: [`avg>20`],
}
```

## Step 3: 执行性能测试

**前置检查**：
```bash
which k6 || echo "k6 未安装，请运行: brew install k6"
```

**执行**：
```bash
k6 run \
  --out json=$QA_WORKSPACE_DIR/tests/perf/results/{feature}-$(date +%Y%m%d%H%M%S).json \
  -e BASE_URL=$PREVIEW_URL \
  -e ENDPOINT={target} \
  -e CONCURRENT={concurrent} \
  -e DURATION={duration} \
  $QA_WORKSPACE_DIR/tests/perf/{feature}.k6.js
```

**捕获输出**：解析 k6 stdout 中的 summary 指标：
- `http_req_duration` → P50, P90, P95, P99
- `http_req_failed` → 错误率
- `iterations` → 总请求数
- 自定义指标（ttft, stream_throughput 等）

## Step 4: 基线对比

**基线文件**：`$QA_WORKSPACE_DIR/tests/perf/baseline.json`

**首次运行**（无基线文件）：
1. 将当前结果写入 baseline.json 作为初始基线
2. 输出提示："已建立性能基线，后续运行将与此对比"

**后续运行**（有基线文件）：
```
对每个指标:
  degradation = (current - baseline) / baseline * 100

  退化 > 10%  → ⚠️ 告警
  退化 > 20%  → 🔴 严重告警
  改善 > 10%  → ✅ 改善，建议更新基线
  其他        → 稳定
```

**更新基线**：
- 全部指标稳定或改善 → 提示用户是否更新基线
- 任一指标退化 → 不自动更新，提示关注

## Step 5: 报告

**CLI 输出格式**：

```markdown
## 性能测试报告

**Target**: POST /api/chat/stream
**Type**: SSE (Streaming)
**Concurrent**: 50 users
**Duration**: 2m

### 指标摘要

| 指标 | 当前值 | 基线值 | 变化 | 状态 |
|------|--------|--------|------|------|
| P95 延迟 | 1,850ms | 1,600ms | +15.6% | ⚠️ 退化 |
| TTFT P95 | 1,200ms | 1,100ms | +9.1% | ✅ 稳定 |
| 吞吐量 | 32 tok/s | 35 tok/s | -8.6% | ✅ 稳定 |
| 错误率 | 0.5% | 0.3% | +66.7% | ⚠️ 退化 |
| 总请求数 | 2,847 | — | — | — |

### 告警
- ⚠️ P95 延迟退化 15.6%（1,600ms → 1,850ms），超过 10% 阈值
- ⚠️ 错误率上升（0.3% → 0.5%），但仍在 1% SLA 内

### 详细结果
完整 JSON 报告: tests/perf/results/chat-stream-20260416120000.json
```

**PR Comment**（如在 CI 中，通过 `gh pr comment` 发布）：

```bash
# 仅在 CI 环境且存在 PR 时执行
if [ -n "$CI" ] && [ -n "$PR_NUMBER" ]; then
  gh pr comment $PR_NUMBER --body "$(cat perf-summary.md)"
fi
```

---

## 目录结构

运行后产生的文件结构：

```
tests/perf/
├── {feature}.k6.js                              # k6 测试脚本
├── baseline.json                                 # 性能基线
└── results/
    └── {feature}-{timestamp}.json                # k6 JSON 输出
```
