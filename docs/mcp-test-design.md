# MCP Tool 自动化测试 — Design Doc V1.0

**Status**: V1.0 已落地（M0~M2 完成）
**Owner**: PM 林 / Dev 陈 / QA 周
**Branch**: `feat/mcp-tool-test`
**Reference PRD**: [docs/CTS MCP V1.0 - PRD Final.md](./CTS%20MCP%20V1.0%20-%20PRD%20Final.md)
**Last update**: 2026-05-08

> 📖 **加新 MCP 测试？** → 看 [docs/mcp-testing-howto.md](./mcp-testing-howto.md)（操作手册，5 分钟上手）。本文档是架构 / 决策动机记录。

---

## 1. 目标 & 非目标

### 1.1 目标

为「研发产 MCP → 配到 web agent」流程提供**自动化测试基建**，输出一套可执行的测试文件集。第一个被测对象：**cts-mcp**。

V1.0 覆盖：

- **L1 协议层**：`tools/list`、`initialize`、`capabilities`、JSON-RPC 错误码、annotations 标记
- **L2 工具行为层**：每个工具的 happy path / 边界 / 必填缺失 / 非法枚举 / 鉴权失败 / 不存在的资源 / 幂等性 / 分页

### 1.2 非目标（V1.0 明确不做）

| 不做 | 原因 / 何时做 |
|------|---------------|
| L3 Agent 行为测试（"LLM 在自然语言下能不能正确调用工具"、PRD 里的"先确认再调用""成功后停止"等规则） | 需要 LLM-as-Judge + 真调 LLM，沿 `/qa-eval` 模式分阶段加 |
| 403 无权限用例 | 暂无"有 token 无权限"的测试账号，先 `it.skip()` 留 TODO |
| Token 自动刷新 / 长期 token 接入 | V1.0 静态 token，过期手动换 |
| 经 `mcp-remote` 的 stdio 链路测试 | 直连 HTTP 已覆盖核心行为，链路测试性价比低 |
| Linear bug 自动上报 | 用户要自审，保留 `--report-linear` 开关备用 |
| CI / 定时回归 | V1.0 命令触发即可，CI 集成下一版 |

---

## 2. 总体架构

```
/qa-mcp-test
   │
   ▼
Phase 0  Load .env + PRD path
   │
   ▼
Phase 1  Schema discovery
         ├─ 在线：tools/list 抓实测 schema
         └─ 离线：仅解 PRD（标记"未实测"）
   │
   ▼
Phase 2  Dispatch mcp-orchestrator (sonnet)
         ├─ 解 PRD 提取每个工具的：input/output schema、必填、枚举、行为规则、场景
         ├─ Schema diff（PRD 期望 vs 实测）
         ├─ 调 test-case-generator skill 生成用例（按 P0/P1）
         ├─ 调 excel-case-export skill 出 Excel
         └─ 渲染 vitest spec
   │
   ▼
Phase 3  Execute（可选 --no-exec）
         npx vitest run tests/mcp/{slug}/
   │
   ▼
Phase 4  Report
         JSON + Markdown（含 Schema diff 表 + 通过率分级）
```

**为什么独立于 `/qa-api-test`**：transport (JSON-RPC over stdio/HTTP) / mock 形态 / schema 来源（server 自描述）和 REST API 完全不同，强行复用会让两边都脏。**目录复用 vitest，命令独立。**

---

## 3. 文件 / 目录布局

### 3.1 新增（项目内）

```
qa-platform/
├── .claude/commands/qa-mcp-test.md           ← 新增 slash command
├── .claude/agents/mcp-orchestrator.md        ← 新增 sonnet agent
└── skills/mcp-test-generator/
    ├── SKILL.md
    └── references/
        ├── prd-extraction.md                  # 如何从 PRD 抽 schema/规则/场景
        ├── schema-diff-rules.md               # PRD vs 实测 diff 规则
        ├── case-taxonomy.md                   # 12 维测试矩阵
        └── vitest-template.md                 # spec 模板
```

### 3.2 产物（被测项目内 / 当前项目内）

```
tests/mcp/                           # MCP 测试根
├── _lib/                            # 跨 MCP 共享的工具库（M2 重构）
│   ├── mcp-client.ts                # MCP client 封装（直连 HTTP）
│   └── schema-diff.ts               # 实测 vs PRD diff
├── _setup.ts                        # vitest 全局 setup（加载 .env）
├── vitest.config.ts                 # 按 MCP_SERVER_NAME 派生 outputFile
└── cts-mcp/                         # 每个 MCP 一个目录
    ├── _lib/
    │   └── fixtures.ts              # MCP 专属夹具（candidate_id 缓存等）
    ├── protocol.test.ts             # L1: initialize/capabilities/tools-list
    ├── cts-search-candidates.test.ts
    ├── cts-get-candidate-detail.test.ts
    ├── cts-get-candidate-contact-info.test.ts
    ├── cts-get-cts-schema.test.ts
    └── reports/
        ├── results.json             # vitest JSON 报告
        ├── schema-diff.report.md    # PRD vs server diff
        └── cts-mcp-summary.md       # 汇总

test-cases/mcp/cts-mcp/
├── cases.md                         # 用例文档（人读）
├── excel/cases.xlsx                 # Excel 用例
├── handoff.json                     # generator → script 中间产物
├── discovery.json                   # server 探活快照
└── discovery-{tool}-noargs.json     # （可选）单工具 happy-path 调用样例
```

### 3.3 复用

- `skills/test-case-generator`（6 种设计方法、优先级框架）
- `skills/excel-case-export`
- `skills/mock-config-generator`（V1.0 暂不需要 mock，框架预留）
- `.claude/agents/test-executor.md`（vitest 执行）
- `.claude/agents/report-analyzer.md`（报告解析）
- `.claude/agents/bug-reporter.md`（保留 `--report-linear` 开关）

---

## 4. 命令规格

### 4.1 `/qa-mcp-test`

```
/qa-mcp-test [--prd <path>] [--server <name|url>] [--scope L1|L2|all]
             [--exec | --no-exec] [--report-linear]
```

| 参数 | 默认 | 说明 |
|------|------|------|
| `--prd <path>` | `MCP_PRD_PATH` from `.env` | PRD 文档路径 |
| `--server <name\|url>` | `MCP_SERVER_NAME` / `MCP_SERVER_URL` from `.env` | MCP server 名（查 .mcp.json）或直连 URL |
| `--scope` | `all` | `L1` 仅协议、`L2` 仅行为、`all` 都跑 |
| `--exec` / `--no-exec` | `--exec` | 是否在生成后立刻执行；离线生成场景用 `--no-exec` |
| `--report-linear` | off | 开启则失败用例追加 Linear（默认关，用户自审） |

### 4.2 `.env` 增量

```bash
# MCP under test
MCP_SERVER_NAME=cts-mcp
MCP_SERVER_URL=https://mcp-cts-test.ciwork.cn/mcp
MCP_AUTH_TOKEN=eyJ0eXAi...     # Bearer token；过期手动换
MCP_TRANSPORT=http              # http | stdio (V1.0 仅 http)
MCP_PRD_PATH=docs/CTS MCP V1.0 - PRD Final.md
```

### 4.3 离线模式（`--no-exec`）

研发说 MCP 还没部署好时：

```
/qa-mcp-test --prd docs/xxx.md --no-exec
```

- 仅解 PRD 生成用例 + Excel + spec 骨架
- spec 里所有 it 自动加 `it.skip()`，注释 `// TODO: requires live MCP server`
- Schema diff 跳过（无实测）

---

## 5. MCP Client 封装（关键基建）

`tests/mcp/_lib/mcp-client.ts`（跨 MCP 共享）：

```ts
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp";

interface McpClientOptions {
  noAuth?: boolean;          // 测无 token 401 用
  customToken?: string;      // 测自定义 token（如过期 token）用
  serverUrl?: string;
}

export class McpClient {
  private client: Client;

  static async fromEnv(opts: McpClientOptions = {}): Promise<McpClient> {
    const url = opts.serverUrl ?? process.env.MCP_SERVER_URL!;
    const token = opts.noAuth
      ? undefined
      : (opts.customToken ?? process.env.MCP_AUTH_TOKEN);

    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    });

    const client = new Client({ name: "qa-platform-mcp-tester", version: "1.0.0" });
    await client.connect(transport);
    return new McpClient(client);
  }

  async listTools() { return (await this.client.listTools()).tools; }

  async callTool(name: string, args: Record<string, unknown>) {
    return this.client.callTool({ name, arguments: args });
  }

  async getServerInfo() { return this.client.getServerVersion(); }
  async getCapabilities() { return this.client.getServerCapabilities(); }

  async close() { await this.client.close(); }
}
```

**设计点：**

- 通过 `fromEnv()` 单一入口，所有测试 import 同一个 client，配置改 `.env` 即可全局生效
- `{ noAuth: true }` 一行切到无鉴权用例，避免每个 401 测试都手写
- 显式 `close()`，避免连接泄漏

---

## 6. Schema 一致性 / Diff

### 6.1 PRD 期望 schema 抽取

mcp-orchestrator 从 PRD 解析出每个工具的「期望 schema」：

```ts
type ExpectedToolSpec = {
  name: string;
  title: string;
  inputSchema: {
    requiredFields: string[];        // 必填
    properties: Record<string, {
      type: string;
      enum?: string[];
      description?: string;
    }>;
  };
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
};
```

### 6.2 Diff 规则

| 差异类型 | 严重度 | 处理 |
|---------|--------|------|
| PRD 有的工具 server 没有 | **Critical** | 测试套件中测此工具的全部 it → fail |
| Server 有 PRD 没声明的工具 | **Warn** | 报告中标注，不 fail |
| 必填字段不一致 | **Critical** | fail |
| 字段类型不一致 | **Critical** | fail |
| 枚举值缺失 / 多余 | **Warn** | report 列出 |
| description 不一致 | **Info** | 仅记录 |
| Annotations 不一致 | **Critical** | fail（影响 LLM 行为，研发犯了大错） |

输出 `schema-diff.report.md` 给你二次确认。

---

## 7. 测试用例分类（每个工具复用）

| 维度 | 优先级 | 说明 |
|------|:------:|------|
| 1. Schema 合规（PRD vs 实测） | P0 | tools/list 返回的 schema 与 PRD 一致 |
| 2. Annotations 标记 | P0 | readOnlyHint/destructiveHint/idempotentHint/openWorldHint |
| 3. Happy path | P0 | 每种调用模式至少 1 条 |
| 4. 必填缺失 | P0 | 缺必填字段 → 应返回 CTS_BAD_REQUEST 或对应错误 |
| 5. 非法枚举值 | P1 | 应返回 422 / VALIDATION_FAILED |
| 6. 边界值 | P1 | limit=0/1/100/101 / 空数组 / null |
| 7. 鉴权失败 401 | P0 | 无 token → 应被拦 |
| 8. 鉴权失败 403 | **Skip** | 待测试账号 |
| 9. 不存在的资源 | P1 | 不存在的 candidate_id |
| 10. 幂等性 | P0 | 同参 2 次结果一致（仅对 idempotentHint=true） |
| 11. 分页 | P1 | cursor / next_cursor 行为 |
| 12. 工具特有 | P1 | 如 cts_get_cts_schema 的匹配算法 4 类 |

**cts-mcp V1.0 预估用例数（按 PRD 4 个 P0 工具）：**

| 工具 | P0 | P1 | Skip | 小计 |
|------|----|----|------|------|
| protocol.test.ts | 3 | 1 | 0 | 4 |
| cts_search_candidates | 6 | 8 | 1 | 15 |
| cts_get_candidate_detail | 4 | 3 | 1 | 8 |
| cts_get_candidate_contact_info | 4 | 2 | 2 | 8 |
| cts_get_cts_schema | 5 | 8 | 1 | 14 |
| **合计** | **22** | **22** | **5** | **49** |

---

## 8. 用例样例（生成产物预览）

完整样例见 `cts-get-cts-schema.test.ts`：

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpClient } from "./_lib/mcp-client";

describe("cts_get_cts_schema [L1+L2]", () => {
  let client: McpClient;
  beforeAll(async () => { client = await McpClient.fromEnv(); });
  afterAll(async () => { await client.close(); });

  // L1: Schema 合规
  it("[P0][L1] tool 在 tools/list 中且 annotations 与 PRD 一致", async () => {
    const tools = await client.listTools();
    const t = tools.find(x => x.name === "cts_get_cts_schema");
    expect(t).toBeDefined();
    expect(t!.annotations).toMatchObject({
      readOnlyHint: true, destructiveHint: false,
      idempotentHint: true, openWorldHint: true,
    });
  });

  // L2: 调用模式 (a) Index
  it("[P0][L2] 不传参 → 返回类型清单", async () => {
    const r = await client.callTool("cts_get_cts_schema", {});
    expect(r.types).toBeInstanceOf(Array);
    expect(r.types.map((x:any)=>x.schema_type)).toEqual(
      expect.arrayContaining(["city_tree","education_tree","experience_tree"])
    );
  });

  // L2: PRD §4.2 匹配算法 - range-equivalent
  it("[P1][L2] '本科以上' 应同时命中 '本科' 和 '本科及以上'", async () => {
    const r = await client.callTool("cts_get_cts_schema", {
      queries: [{ schema_type: "education_tree", label: "本科以上" }]
    });
    const labels = r.candidates.map((x:any)=>x.label);
    expect(labels).toEqual(expect.arrayContaining(["本科", "本科及以上"]));
    expect(labels).not.toEqual(expect.arrayContaining(["大专及以上","硕士及以上"]));
  });

  // L2: 大字典禁全量返回
  it("[P0][L2] schema_types=['city_tree'] → 应被拒绝", async () => {
    await expect(
      client.callTool("cts_get_cts_schema", { schema_types: ["city_tree"] })
    ).rejects.toThrow(/large dictionary|MUST pass queries/i);
  });

  // L2: 鉴权 401
  it("[P0][L2] 无 token → 401", async () => {
    const c = await McpClient.fromEnv({ noAuth: true });
    await expect(c.callTool("cts_get_cts_schema", {})).rejects.toMatchObject({ code: 401 });
    await c.close();
  });

  // L2: 403 待补 - 暂 skip
  it.skip("[P0][L2] 有 token 但无字典访问权限 → 403", async () => {
    // TODO(C): 待运维提供"有 token 无权限"的测试账号
  });
});
```

---

## 9. 质量门禁

| 维度 | 标准 | 说明 |
|------|------|------|
| 协议合规（L1） | P0 100% pass | tools/list / initialize / capabilities |
| Schema 一致性 | P0 100% pass | server 实测 vs PRD diff（critical 项） |
| Annotations 标记 | P0 100% pass | 4 个 hint 必须一致 |
| 正常路径（L2） | P0 ≥ 95% pass | 每个工具至少 1 条 happy path |
| 边界 + 负面（L2） | P1 ≥ 80% pass | 缺参 / 非法值 / 401 / 不存在 ID 等 |
| 幂等性 | 100% pass | 标 idempotentHint=true 的工具 |
| 语义工具特殊处理 | 软断言 pass | semantic_query 仅断"返回非空 + 结构合法" |

**报告必含两段：**

1. **通过率分级表**（P0/P1/Skip 各占比）
2. **Schema diff 表**（PRD 期望 vs server 实测，按 critical/warn/info 分级）

---

## 10. 已知限制 / 风险

| # | 项 | 影响 | 缓解 |
|---|----|------|------|
| 1 | Token 一周过期 | CI 不可持续 | V1.0 不上 CI；过期 401 时报错文案明确指引"换 token" |
| 2 | 403 用例 skip | 鉴权覆盖度 -10% | 测试账号到位后取消 skip |
| 3 | semantic_query 不可断言具体人 | 仅软断言 | 用相对断言（结果数 ≥ 1，结构合法） |
| 4 | 测试服数据可能与 PRD 假设不一致 | 个别 happy path 可能 flaky | 用 fixtures.ts 缓存"已知存在"的 candidate_id |
| 5 | mcp-remote 链路未覆盖 | 不能测 stdio bridge 行为 | 后续按需加 `MCP_TRANSPORT=stdio` 通道 |
| 6 | PRD 里嵌入的 LLM 行为规则未测 | L3 未覆盖 | V1.0 范围外；下一阶段 `/qa-eval` 模式接入 |

---

## 11. 实施里程碑

合并版（2 个 review checkpoint）：

| M | 内容 | 验收 |
|---|------|------|
| **M0** ✅ | 本 design doc 用户 review 通过 | 完成 2026-05-08 |
| **M1** ✅ | 三件套骨架 + `cts_get_cts_schema` 端到端跑通 + Schema diff 报告骨架 | 完成 2026-05-08，P0 11/11 全绿 |
| **M2** ✅ | 扩到剩余 3 工具 + 离线模式（`MCP_OFFLINE=1`） + auto schema-diff + 共享 _lib 重构 | 完成 2026-05-08，51 用例 / 40 实跑 / 0 失败 |
| **V1.1** ⏳ | L3 LLM-行为测试 + CI 接入 | 单独 design doc，本 doc 范围外 |

为什么不一次性把 4 工具都做完：先用一个工具**验证 pipeline 是否对路**（PRD 解析、schema diff、case taxonomy、报告形态），有偏差早发现；pipeline 稳了再扩量风险低。

---

## 12. 决策记录（已锁）

用户 2026-05-08 确认按默认假设走：

| # | 项 | 决策 |
|---|----|------|
| Q1 | 测试套件 slug | `cts-mcp` |
| Q2 | 用例文档语言 | 中文为主，spec 注释中文 |
| Q3 | 离线模式 spec 形态 | `it.skip()` + 注释 `// TODO: requires live MCP server` |
| Q4 | Schema diff critical 项是否 abort 执行 | **不 abort**，跑完再看，diff 报告独立呈现 |
| Q5 | vitest 配置位置 | `tests/mcp/vitest.config.ts`（局部，避免污染项目根） |

---

## 附录 A：PRD 关键信息抽取

cts-mcp 暴露 4 个 P0 只读工具：

| Tool | 模式 | 关键参数 | 关键输出 |
|------|------|---------|---------|
| `cts_search_candidates` | keyword / semantic / hybrid | keyword/name/phone/semantic_query/location/education/... | items[] (含 has_phone/has_email) + total + next_cursor |
| `cts_get_candidate_detail` | 详情 | candidate_id | 完整简历 + has_phone/has_email |
| `cts_get_candidate_contact_info` | 联系方式 | candidate_id | phone/email（403 if 无权限） |
| `cts_get_cts_schema` | index/full/resolve 三模式 | schema_types[] / queries[{schema_type,label}] | types[] 或 items[] 或 candidates[] |

Server 级关键信息：

- **Transport**: Streamable HTTP（生产）
- **Auth**: SSO Bearer Token
- **Capabilities**: `tools.listChanged: true`
- **Instructions**: ~520 tokens 英文（含 8 条强制规则）
- **Pagination**: cursor / next_cursor

---

## 附录 B：术语

| 术语 | 含义 |
|------|------|
| L1 | 协议层测试（tools/list、JSON-RPC、annotations） |
| L2 | 工具行为层测试（input/output、错误码、边界、幂等） |
| L3 | Agent 行为层测试（LLM 真调，未在 V1.0 范围） |
| Schema diff | PRD 期望 schema 与 server 实测 schema 的差异报告 |
| 软断言 | 仅断言形状 / 非空 / 结构合法，不断言具体业务值（用于 semantic search 类） |
