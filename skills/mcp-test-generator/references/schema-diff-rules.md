# Schema Diff 规则

## 目的

把 PRD 期望的 schema 和 server `tools/list` 实测结果做 diff，按严重度分级，输出报告。这是 MCP 测试相对普通 API 测试的最大增量价值——研发偷偷改了字段会被立刻揪出来。

## 严重度分级

| 严重度 | 含义 | 应对 |
|--------|------|------|
| **Critical** | 影响 LLM 调用正确性 / 测试断言失效 | 报告中标红；测试套件可继续跑 |
| **Warn** | 不影响功能但需要更新 PRD 或 server | 报告中标黄 |
| **Info** | 文案级差异 | 仅记录 |

## 分级规则

### Critical

- 工具名缺失（PRD 有，server 没有）
- 必填字段不一致（PRD 必填，server 不必填，反之亦然）
- 字段类型不一致（如 PRD `string`，server `string[]`）
- Annotations 不一致（任一 hint 不同 — 影响 LLM 行为）

### Warn

- 枚举值缺失或多余（PRD 有 server 没有，反之亦然）
- Server 多出 PRD 没有的工具或字段
- Title / description 文本差异
- Capabilities 声明差异（如 `tools.listChanged` PRD 说 true server 没声明）
- `instructions` 文本长度差距 > 30%

### Info

- 字段 description 措辞差异（核心含义相同）
- Default 值差异
- 顺序差异

## 报告格式

`tests/mcp/{slug}/reports/schema-diff.report.md`：

```markdown
# Schema Diff Report — {slug}

**Probed**: 2026-05-08T10:56:40Z
**PRD**: docs/CTS MCP V1.0 - PRD Final.md
**Server**: https://mcp-cts-test.ciwork.cn/mcp ({serverInfo.name} v{version})

## 概览

| 严重度 | 数量 |
|-------|:---:|
| 🔴 Critical | 2 |
| 🟡 Warn | 3 |
| 🔵 Info | 5 |

## 🔴 Critical

### 1. cts_search_candidates.location 类型不一致
- **PRD**: `string`
- **Server**: `string[]`
- **影响**: LLM 按 PRD 传单字符串会被 server 拒绝
- **建议**: 修 PRD

### 2. cts_get_cts_schema.schema_type → schema_types 字段名 + 类型变更
- **PRD**: `schema_type: string` (单数)
- **Server**: `schema_types: string[]` (复数 + 数组)
- **影响**: 生成的 LLM prompt 用错字段名
- **建议**: PRD 同步 server 改名

## 🟡 Warn

### 1. capabilities.tools.listChanged 未声明
- **PRD §1.3.2**: `true`
- **Server**: 未声明
- **影响**: 后续新增工具时 client 不能感知
- **建议**: server 端补声明

[...]

## 🔵 Info

[...]
```

## 实现位置

`tests/mcp/_lib/schema-diff.ts` 提供函数（跨 MCP 共享）：

```ts
function buildSchemaDiff(expected: ExpectedTool[], discovery: Discovery): DiffReport;
function renderDiffMarkdown(report: DiffReport, ctx: { prdPath, serverUrl, serverInfo }): string;
```
