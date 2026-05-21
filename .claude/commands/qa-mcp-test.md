---
description: "MCP 工具自动化测试流水线：解 PRD + 探活 server → 生成 vitest 测试 → 执行 → 报告"
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob
---

You are an MCP test pipeline orchestrator. Generate L1 protocol + L2 behavior tests for MCP servers, execute, and report.

```
/qa-mcp-test [--prd <path>] [--server <name|url>] [--scope L1|L2|all] [--exec|--no-exec] [--report-linear]
     |
Phase 0: Load .env (MCP_SERVER_URL / MCP_AUTH_TOKEN / MCP_PRD_PATH)
     |
Phase 1: Schema discovery
         ├─ 在线（默认）：tools/list + initialize + capabilities
         └─ --no-exec / 离线：仅解 PRD（标 "未实测"）
     |
Phase 2: Dispatch mcp-orchestrator (sonnet)
         ├─ 解 PRD → expected schema (per-tool) + 行为规则 + 场景
         ├─ Schema diff (PRD 期望 vs 实测)
         ├─ 调用 test-case-generator skill 生成用例（按 P0/P1）
         ├─ 调用 excel-case-export skill 出 Excel
         └─ 渲染 vitest spec 文件
     |
Phase 3: Execute（可选 --no-exec 时跳过）
         npx vitest run tests/mcp/{slug}/ --reporter=json
     |
Phase 4: Report（JSON + Markdown，含 Schema diff 表 + 通过率分级）
```

参考资料：
- 操作手册：[docs/mcp-testing-howto.md](../../docs/mcp-testing-howto.md)（FAQ + 常见踩坑：token 过期 / quota / 403 / 离线 / vitest pool）
- 流程图：[docs/qa-mcp-test-flow.html](../../docs/qa-mcp-test-flow.html)（浏览器打开看可视化）
- 架构 / 设计动机：[docs/mcp-test-design.md](../../docs/mcp-test-design.md)

## Phase 0: Load .env

```
Read(".env")
```

Required:
- `MCP_SERVER_URL` — 被测 MCP server URL
- `MCP_AUTH_TOKEN` — Bearer token（手动管理，过期收到 401）
- `MCP_PRD_PATH` — PRD 文档路径

Optional:
- `MCP_SERVER_NAME` — server 名（用于 slug，默认 `cts-mcp`）
- `MCP_TRANSPORT` — `http` | `stdio`（V1.0 仅 http）

### Parameter parsing

| Flag | Default | 说明 |
|------|---------|------|
| `--prd <path>` | `MCP_PRD_PATH` | PRD 文档路径 |
| `--server <name\|url>` | `MCP_SERVER_NAME` 或直接 URL | 被测 server |
| `--scope` | `all` | `L1` 仅协议、`L2` 仅行为、`all` 都跑 |
| `--exec` / `--no-exec` | `--exec` | 是否执行 |
| `--report-linear` | off | 失败用例追加 Linear（默认关，自审） |

## Phase 1: Schema Discovery

### Online (default)

```bash
node scripts/probe-mcp.mjs
```

Saves to `test-cases/mcp/{slug}/discovery.json`：
- `serverInfo` { name, version }
- `capabilities` { tools, listChanged, ... }
- `instructions` 文本
- `tools[]` 数组（每个含 inputSchema + annotations + description）

### Offline 模式（2 个入口）

**生成期** — `--no-exec` 或探活失败：
跳过 discovery，mcp-orchestrator 生成的 spec 用 `describe.skipIf(OFFLINE)` 包住，注释 `// TODO: requires live MCP server`。Schema diff 跳过（无实测数据）。

**执行期** — 设置 `MCP_OFFLINE=1` 环境变量：
已生成的 spec 在跑时通过 `_setup.ts` 的 offline 检测 + `describe.skipIf` 全部 skip，不会连 server。研发说 MCP 还没部署好时用这个验证 spec 不会因离线挂掉。

```powershell
# 执行期 offline
$env:MCP_OFFLINE=1; npx vitest run --config tests/mcp/vitest.config.ts; Remove-Item Env:MCP_OFFLINE
```

## Phase 2: Dispatch mcp-orchestrator

```
You are mcp-orchestrator. First read .claude/agents/mcp-orchestrator.md to understand your full responsibilities.

Input:
- prdPath: "$prdPath"
- serverSlug: "$slug"
- discovery: {discovery.json content if online, null if offline}
- scope: "$scope"
- offline: $offline (boolean)

Execute per .claude/agents/mcp-orchestrator.md:
1. 解 PRD → 抽每个工具的 expected schema + 行为规则 + 场景
2. Schema diff（如在线）→ 写 schema-diff.report.md
3. 生成测试用例 markdown（按 12 维测试矩阵 + P0/P1 优先级）
4. 调用 excel-case-export 出 Excel
5. 渲染 vitest spec（per-tool）
6. 返回 artifact 路径
```

## Phase 3: Execute Tests

```bash
npx vitest run --config tests/mcp/vitest.config.ts
```

> Reporter / outputFile / pool 都在 `tests/mcp/vitest.config.ts` 配好了（default + json 双 reporter；slug-aware outputFile 路径；`pool: "threads"` + `singleThread: true` —— 不要加 `--pool=forks` 否则 worker 会崩）。

### Scope 过滤（可选）

按 `[L1]` / `[L2]` 用例标签过滤：

```bash
# 仅协议层
npx vitest run --config tests/mcp/vitest.config.ts -t "\[L1\]"
# 仅工具行为层
npx vitest run --config tests/mcp/vitest.config.ts -t "\[L2\]"
```

执行规则：
- 失败不停，跑完所有用例
- `it.skip()` / `describe.skipIf` 标记的用例不执行但计数
- vitest exit code 非 0 不阻塞 Phase 4 报告生成
- quota 用尽时 `ctx.skip()` 自动触发，不算失败

## Phase 4: Report

### 4.1 Parse results

```
Read("tests/mcp/{slug}/reports/results.json")
```

Extract:
- 总用例数 / passed / failed / skipped
- 按 P0/P1 分级统计
- 失败 detail：用例名、错误、定位

### 4.2 Generate `tests/mcp/{slug}/reports/{slug}-summary.md`

```
## MCP 测试报告 — {slug}

### 概览
- 总用例数: {total}
- P0 通过率: {p0_pass}/{p0_total} ({p0_pct}%)
- P1 通过率: {p1_pass}/{p1_total} ({p1_pct}%)
- Skipped: {skipped}（含待补充测试账号的 403 用例）

### Schema Diff（PRD 期望 vs Server 实测）
{schema-diff.report.md 摘要}

### 失败分析
{每个失败用例：用例名 / 错误 / 可能原因}

### 质量门禁
- 协议合规 (L1): {pass/fail}
- Schema 一致性: {critical_count} critical / {warn_count} warn
- Annotations: {pass/fail}
- 正常路径 (L2): {p0_pct}% (≥ 95% 要求)
- 边界 + 负面 (L2): {p1_pct}% (≥ 80% 要求)
```

### 4.3 Return

```json
{
  "slug": "cts-mcp",
  "summary": {
    "total": 16, "passed": 14, "failed": 1, "skipped": 1,
    "p0_pass": 11, "p0_total": 12,
    "p1_pass": 3, "p1_total": 3
  },
  "qualityGate": {
    "protocolCompliance": "pass",
    "schemaConsistency": { "critical": 0, "warn": 3 },
    "annotations": "pass",
    "happyPath": "pass (100%)",
    "boundary": "pass (100%)"
  },
  "artifacts": {
    "spec": "tests/mcp/cts-mcp/cts-get-cts-schema.test.ts",
    "cases": "test-cases/mcp/cts-mcp/cases.md",
    "excel": "test-cases/mcp/cts-mcp/cases.xlsx",
    "schemaDiff": "tests/mcp/cts-mcp/reports/schema-diff.report.md",
    "summary": "tests/mcp/cts-mcp/reports/cts-mcp-summary.md"
  },
  "failures": [...]
}
```
