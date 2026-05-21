# CTS MCP V1.0 - PRD Final

本文面向研发和测试团队，聚焦 CTS MCP V1.0 的实现要点与待确认事项（P0，全部只读，优先实现 CTS 人才库搜索能力的 MCP 接入）。

最后更新：2026-04-15。

::: \*\*MCP的范围：\*\*见<1.2 交付范围>

\*\*MCP规范的要素覆盖对比：\*\*见<1.3 MCP的基础规范要素>

\*\*MCP Server Instructions：\*\*见<2.5 Server Instructions机制>

\*\*MCP规格定义详情：\*\*见<四、Tool规格定义> :::

版本历史

| 版本 | 内容 | 日期 | 提交人 |
| --- | --- | --- | --- |
| V1.0 | 基于 cts-mcp-connector-prd.md (draft) 重构为研发实现规格；对齐 CRM MCP V1.0 文档结构；统一 `cts_` 命名前缀、游标分页、独立筛选参数、搜索前用户确认机制 | 2026-04-15 | yxh |

相关文档：

CTS MCP Connector PRD (Draft)：`03_output/prds/mcp_connection/cts-mcp-connector-prd.md`

CRM MCP V1.0 PRD Final：`CRM MCP V1.0 - PRD Final.md`（结构对齐基准）

MCP Connector PRD：`03_output/prds/mcp_connection/mcp_connection_prd.md`

---

## 一、范围与交付计划

### 1.1 三层能力定位

\*\*CTS MCP V1.0 中，\*\*目的是将 CTS 人才库的搜索和查看能力按照标准 MCP 协议包装，供 Mina.run AI Agent 调用，不含业务逻辑。CTS（Candidate Tracking System）是科锐内部的人才库系统，沉淀了 1265 万历史积累人才数据。

### 1.2 交付范围

| 版本 | 优先级 | Tool 数 | 主要内容 |
| --- | --- | --- | --- |
| V1.0 | P0 | 4 个 Tool | 全部只读；覆盖人才搜索（条件+语义）、人才详情、联系方式获取、系统枚举字典 |

V1.0 P0 Tool 一览（4 个，均为只读）：

| # | Tool 名 | 类型 | 说明 |
| --- | --- | --- | --- |
|  | 人才 |  |  |
| 1 | `cts_search_candidates` | 读 | 搜索内部人才库；支持结构化筛选（姓名/公司/职位/地点/学历/经验等）+ `semantic_query` 语义搜索（JD 找人） |
| 2 | `cts_get_candidate_detail` | 读 | 获取人才完整标准简历（教育/工作/项目经历等）；不含联系方式，需单独调用 `cts_get_candidate_contact_info` |
| 3 | `cts_get_candidate_contact_info` | 读 | 获取人才联系方式（手机/邮箱）；独立于详情接口；通过鉴权控制访问权限，有权限则明文返回 |
|  | 系统工具 |  |  |
| 4 | `cts_get_cts_schema` | 读 | 获取城市树、行业树、职位类别等枚举字典；搜索工具传字典类参数前调用以获取合法枚举值；后端 1 小时缓存 |

### 1.3 MCP 的基础规范要素

对照 MCP 协议规范，列出本文档涉及的全部规范要素及其取值，供研发快速定位。

1.3.1 MCP Tool 定义

| 字段 | 含义 | V1.0 用法 |
| --- | --- | --- |
| `name` | 唯一标识 | `cts_{action}_{entity}` 格式，如 `cts_search_candidates` |
| `title` | 人类可读展示名 | 如 `Talent Search`，供 Mira UI 显示 |
| `description` | 功能描述（英文） | LLM 选择工具的主要依据；本文附中文参考 |
| `inputSchema` | 输入参数 JSON Schema | 含类型、必填、枚举值说明 |
| `outputSchema` | 返回结构 JSON Schema | 帮助 LLM 理解和处理结构化返回 |
| `annotations.readOnlyHint` | 是否只读（默认 false） | true — V1.0 全部为只读查询 |
| `annotations.destructiveHint` | 是否破坏性（默认 true） | false — 无删除/修改操作 |
| `annotations.idempotentHint` | 是否幂等（默认 false） | true — 同参数多次调用结果一致，Mira 可安全重试 |
| `annotations.openWorldHint` | 是否与外部交互（默认 true） | true — 全部通过 CTS REST API 查询内部数据库 |

1.3.2 Server 级配置

| 配置项 | V1.0 取值 |
| --- | --- |
| `instructions` | 英文，约 520 tokens（见 §2.5），含工具分组、强制规则、典型工作流 |
| `capabilities.tools.listChanged` | `true`（见 §2.6） |

1.3.3 传输与框架

| 项目 | 取值 |
| --- | --- |
| MCP 框架 | FastMCP TypeScript |
| 运行时 | Node.js |
| 传输协议 | Streamable HTTP（生产）/ stdio（开发） |
| 通信格式 | JSON-RPC 2.0 |
| 数据格式 | 多条记录 → JSONL 流式；单条详情 → 标准 JSON |
| 分页方式 | 游标分页（`cursor` / `next_cursor`），页大小由 Server 决定 |

1.3.4 Hook 中间件

| Hook | 触发时机 | 作用 |
| --- | --- | --- |
| `AuthMiddleware` | `on_request` | SSO Token 校验 + userId/role 等 Session Context 注入；联系方式接口额外校验用户数据权限，无权限直接拦截返回 403 |
| `RoleBasedToolFilter` | `on_list_tools` | V1.0 预留空壳，后续版本按 role 过滤可用工具 |

1.3.5 暂不启用的 MCP 能力

1）协议核心原语（V1.0 仅启用 Tools）：

| 能力 | 规范定义 | 不启用原因 |
| --- | --- | --- |
| Resources | Server 向 Client 暴露静态数据 | `cts_get_cts_schema` 已作为 Tool 实现，支持按 `schema_type` 按需拉取，比 Resource 全量暴露更节省 Token |
| Prompts | 预定义消息模板 | V1.0 无预设场景模板需求 |
| Sampling | Server 反向请求 Host 的 LLM 生成内容 | 复杂度高，V1.0 场景不涉及 |
| Elicitation | Server 在交互中向用户征询额外信息 | V1.0 均为只读场景 |
| Roots | Client 告知 Server 可操作的文件系统边界 | 内部 API 场景不涉及文件系统 |

2）辅助能力（运行时增强，非核心原语）：

| 能力 | 规范定义 | 不启用原因 |
| --- | --- | --- |
| Progress | 长任务进度推送 | V1.0 全部为快速同步查询 |
| Cancellation | 取消进行中请求 | 快速查询无需取消 |
| Logging | 结构化日志推送 | `AuthMiddleware` 审计日志已满足，后续优化 |
| Completion | 参数自动补全 | `cts_get_cts_schema` 已解决枚举值发现 |
| Tasks | 异步长任务追踪（experimental） | 规范标注 experimental，V1.0 无异步场景 |

### 1.4 CTS MCP 与相关系统的关系

CTS MCP 和 PeopleData Tool 是两个独立的数据通道，服务于人才搜寻的不同数据范围：

| 维度 | CTS MCP（本 PRD） | PeopleData Tool（已有） | CRM MCP（已有） |
| --- | --- | --- | --- |
| 定位 | 向内查家底 — 查询公司内部已有人才 | 向外找新人 — 从外部数据源发现新人才 | BD 商机管理 — 企业/客户/职位/融资 |
| 数据来源 | 科锐 CTS 内部系统（1265 万历史积累人才） | 外部第三方 API（Apollo、Exa 等 15 个数据源） | CRM 内部系统 |
| 数据特色 | 活跃度追踪、求职状态、顾问分类、联系历史 | 全球公开人才画像、联系方式补全 | 线索企业/客户/在招职位/融资事件 |
| 用户范围 | 仅科锐企业鉴权用户 | Mira 所有用户 | 仅科锐企业鉴权用户 |
| 成本 | 免费（内部系统） | 按次计费 | 免费（内部系统） |
| 身份标识 | candidateNo（CTS 内部编号） | LinkedIn URL（跨数据源 OneID） | enterprise\_id / customer\_id |
| 数据格式 | CTS 原生字段（MCP 适配层转 snake\_case） | 统一 PeopleSchema | CRM 原生字段（MCP 适配层转 snake\_case） |

设计决策：CTS MCP 作为独立连接器接入，不融合进 PeopleData 多数据源编排体系。

根本原因是数据鉴权层级不同：CTS 数据为科锐企业自有数据，属于企业级资产，仅限通过科锐企业鉴权（Authing SSO）的用户访问；PeopleData 接入的是全球开放数据源（Apollo、Exa 等），面向 Mira 全体用户开放。两类数据从鉴权分层上就属于不同的权限域，无法在同一个编排体系中统一管理访问控制。

### 1.5 部署架构

```plaintext
┌──────────────────────────────────────────────────────┐
│               MCP Host（AI 应用本体）                   │
│  Mira Agent 平台                                       │
│                                                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│  │Client 1 │  │Client 2 │  │Client 3 │                │
│  └────┬────┘  └────┬────┘  └────┬────┘                │
└───────┼────────────┼────────────┼─────────────────────┘
        │            │            │
        ▼            ▼            ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │CRM MCP   │  │CTS MCP   │  │其他 MCP   │   ← 适配器层
  │Server    │  │Server    │  │Server    │
  └────┬─────┘  └────┬─────┘  └──────────┘
       │              │
       ▼              ▼
  ┌──────────┐  ┌──────────┐
  │ciwork CRM│  │ciwork CTS│   ← 现有系统（不动）
  │REST API  │  │REST API  │
  └──────────┘  └──────────┘
```

V1.0 新建的内容只有 CTS MCP Server 这一层（适配器层）。现有 CTS REST API 和数据库不动，MCP Server 通过服务账号调用现有接口，无需改造后端。

---

## 二、MCP Server 基础框架

### 2.1 技术栈

MCP 框架：FastMCP TypeScript

选型原因：与 CRM MCP Server 统一技术栈，共享中间件能力（AuthMiddleware 等）。

运行时：Node.js

语言：TypeScript（公司新项目标准技术栈）

Transport：Streamable HTTP（内网部署，与 CTS 后端同一集群）；开发环境使用 stdio

### 2.2 架构说明

```plaintext
Mira Agent  →  CTS MCP Server（新建适配层）  →  ciwork CTS REST API  →  CTS DB
```

CTS MCP Server 是本次唯一新建的层。负责：认证（SSO Token 解析 + userId 透传）、参数映射、返回值适配（CTS camelCase → MCP snake\_case）、联系方式鉴权访问控制。其余系统不改动。

认证采用双层设计（与 CRM MCP 一致）：Mira 传入 SSO Token → MCP Server 验证身份，同时将 userId 注入下游 CTS API 请求，实现顾问级数据权限隔离。

### 2.3 数据格式

| 格式 | 用途 | 适用场景 |
| --- | --- | --- |
| JSON-RPC 2.0 | MCP 通信基础，所有 Tool 调用通信格式 | 全部 Tool 调用 |
| JSONL 流式 | 多条记录返回时，每行一个 JSON 对象，配合 SSE 传输 | `cts_search_candidates` 返回多条人才记录 |
| 标准 JSON | 单条详情返回 | `cts_get_candidate_detail`、`cts_get_candidate_contact_info` 等单条 Tool |

### 2.4 Hook 中间件

| Hook 名 | 触发时机 | 作用 |
| --- | --- | --- |
| `AuthMiddleware` | `on_request`（每次请求进入时） | SSO Token 校验 + Session Context 注入（userId/username/role/teamId/branchId）；Token 无效返回 HTTP 401；联系方式接口额外校验用户数据权限，无权限直接拦截返回 HTTP 403 |
| `RoleBasedToolFilter` | `on_list_tools`（Mira 获取可用 Tool 列表时） | V1.0 预留空壳，不实际过滤；后续版本按 role 过滤可调用 Tool 范围（\*由研发最终确认） |

联系方式访问控制说明：`cts_get_candidate_contact_info` 不做数据脱敏，通过鉴权判定用户是否有权限访问——有权限则明文返回完整手机号和邮箱，无权限则 AuthMiddleware 直接拦截返回 403，不存在"加密展示"的中间态。

### 2.5 Server Instructions 机制

`**instructions`\*\* 是 MCP 协议规范中正式定义的字段，位于 `initialize` 握手响应的顶层，用于告诉 LLM "这个 Server 整体是干什么的、什么时候该用"：

```json
{
  "serverInfo": { "name": "ciwork-cts", "version": "1.0.0" },
  "instructions": "..."
}
```

三层声明机制（与 CRM MCP 一致，三者互补，不可相互替代）：

| 层级 | 写在哪里 | 解决什么问题 | 谁维护 |
| --- | --- | --- | --- |
| Server Instructions | `initialize` 响应（FastMCP 初始化代码） | 这个 Server 整体是什么、和其他 Server 边界在哪 | MCP Server 开发者 |
| Tool Description | `tools/list`（每个 Tool 定义） | 这个工具做什么、什么时候调、返回什么 | MCP Server 开发者 |
| Host System Prompt | Mira 平台配置 | 多 Server 编排优先级、业务调用逻辑 | Mira 平台侧 |

CTS MCP Server `instructions` 正式文本（FastMCP 初始化时配置，英文，约 520 tokens）：

```plaintext
This is the CTS MCP Server for a recruitment industry internal talent pool system (CTS — Candidate Tracking System). It provides read-only access to the company's internal talent database (12.6M+ accumulated talent records), including talent search, resume viewing, and contact information retrieval. All tools are read-only — no write operations. For external people data (LinkedIn, Apollo, Exa, etc.), use the PeopleData Tool — this server only covers internal talent. For CRM data (enterprises, customers, positions, financing), use the CRM MCP Server. Candidate-as-business-entity operations (推进流程, 职位匹配) and contact record management are planned for a future release.

Available tools fall into two groups. (1) Talent: cts_search_candidates searches the internal talent pool by structured filters (name, company, job title, location, education, experience, etc.) or by semantic_query for JD-based vector similarity matching (CRE model) — supports both modes in one tool, combinable; cts_get_candidate_detail fetches the full standard resume by candidate_id (complete education history, work history with descriptions, project experience, skills, certifications) — includes has_phone/has_email flags but does NOT include actual contact info; cts_get_candidate_contact_info fetches phone and email by candidate_id as a separate call — before calling, check has_phone/has_email from search or detail results and skip if both are false; access is controlled by authentication (no masking — returns plain text if authorized, 403 if not). (2) Schema dictionary: cts_get_cts_schema returns city trees, industry trees, job category trees, education levels, school types, experience ranges, and other enums. All 4 tools are read-only.

Critical usage rules. First, ALWAYS call cts_get_cts_schema before passing dictionary parameters (location, industry, job_category, education, school_type, work_experience) to cts_search_candidates — never guess or hardcode enum values; the schema is cached for one hour. Second, cts_search_candidates and cts_get_candidate_detail return has_phone/has_email boolean flags indicating contact availability but do NOT return actual phone numbers or emails; cts_get_candidate_contact_info returns actual phone/email in plain text (access controlled by authentication — no masking) — check has_phone/has_email before calling and skip if both are false; if the user lacks permission, the server returns 403. Third, all queries are automatically scoped to the current consultant's permissions; do not pass userId. Fourth, default page size is 20; maximum is 100. Fifth, if cts_search_candidates returns 422 (invalid enum value), auto-call cts_get_cts_schema to fetch valid values and retry. Sixth, before calling cts_search_candidates, ALWAYS present your interpreted search conditions to the user first and wait for explicit confirmation — list each filter with its resolved Chinese label (e.g., "地点：上海, 学历：本科及以上, 行业：人工智能"), then ask the user to confirm or adjust; only call the tool after the user approves; if the user says "直接搜" or similar, you may skip confirmation for that query. Seventh, cts_search_candidates requires at least one search or filter parameter — do not call with an empty parameter set; if the user's request is too vague to derive any filter, ask the user to clarify before calling. Eighth, when semantic_query is provided, results are ranked by semantic relevance (CRE model); structured filters can be combined with semantic_query as post-filters.

Common workflows: For internal talent search, start with cts_get_cts_schema to resolve location/education/industry codes, then cts_search_candidates with structured filters, then cts_get_candidate_detail for full resume review, then check has_phone/has_email — if either is true and the consultant wants to reach out, call cts_get_candidate_contact_info. For JD-based talent matching, pass the JD text via semantic_query to cts_search_candidates, optionally combine with location/experience filters, then drill into detail and contact. For quick talent lookup by name or phone, pass name or phone directly to cts_search_candidates — no schema call needed for free-text fields. For any search, always present your interpreted conditions to the user before calling the tool — only execute after user confirmation.
```

设计说明：

| 段落 | 覆盖内容 | 设计意图 |
| --- | --- | --- |
| 第一段：身份与边界 | Server 定位（只读内部人才库）、数据规模（1265 万）、CTS/PeopleData/CRM 边界划分、后续版本说明 | 防止 LLM 把外部人才搜索错调 CTS 工具，明确内部 vs 外部数据源边界 |
| 第二段：工具分组 | 4 个工具按 2 个功能域（Talent / Schema dictionary），标注 semanticquery 能力、hasphone/hasemail 标识、联系方式独立获取、鉴权控制 | LLM 理解工具间依赖关系，知道搜索/详情返回联系方式可用性标识但不含实际联系方式 |
| 第三段：关键规则 | 8 条强制排序规则 | schema 前置调用、hasphone/hasemail 前置检查、权限隔离、分页上限、422 重试、搜索前确认、至少一个参数、语义排序说明 |
| 第四段：典型工作流 | 4 条调用链 + 确认流程 | 让 LLM 理解工具间先后顺序和组合方式，区分条件搜索/语义搜索/快速查找场景 |

### 2.6 Server 辅助能力声明

MCP Server 在初始化握手时声明自身支持的能力（capabilities），Mira 据此决定启用哪些协议特性。

V1.0 声明的能力：

| 能力 | 声明值 | 说明 |
| --- | --- | --- |
| `tools.listChanged` | `true` | 工具列表变更时推送 `notifications/tools/list_changed`，Mira 收到后重新调用 `tools/list` 刷新。V1.0 工具列表虽静态，但声明此能力使后续版本新增工具时 Mira 可自动感知，无需重新连接 |

V1.0 不启用的能力（含理由）：

| 能力 | 不启用原因 |
| --- | --- |
| `resources` | `cts_get_cts_schema` 已覆盖枚举字典场景，按 `schema_type` 按需拉取比 Resource 全量暴露更节省 Token |
| `prompts` | V1.0 不提供预设场景模板，后续版本可将"内部找人""JD 匹配"等场景做成 Prompt |
| `logging` | V1.0 依赖 `AuthMiddleware` 审计日志即可，结构化 logging 作为后续优化项 |
| `completions` | `cts_get_cts_schema` 已解决枚举值发现，completion 为重复功能 |

研发注意：FastMCP TypeScript 中通过初始化配置声明 capabilities，确认 `listChanged` 的具体配置方式。

---

## 三、场景示例

### 场景 A：条件搜索内部人才

触发：顾问说"帮我看看我们库里有没有上海做自动驾驶的人，本科以上"

```plaintext
1. cts_get_cts_schema(schema_type="city_tree") → 解析"上海"枚举值
   cts_get_cts_schema(schema_type="education_tree") → 解析"本科及以上"枚举值
2. [向用户确认] → "地点：上海, 学历：本科及以上, 关键词：自动驾驶，确认搜索？"
3. cts_search_candidates(keyword="自动驾驶", location=["上海"], education="本科") → 返回人才摘要列表
4. cts_get_candidate_detail(candidate_id=...) → 查看感兴趣人才的完整简历
5. cts_get_candidate_contact_info(candidate_id=...) → 获取联系方式准备触达
```

输出：人才列表（含姓名、年龄、当前公司/职位、学历、工作年限、求职状态、活跃时间），顾问选择后可查看完整简历和联系方式。

### 场景 B：JD 语义找人

触发：顾问粘贴 JD 说"按这个 JD 帮我在人才库里找匹配的"

```plaintext
1. [向用户确认] → "语义搜索模式，JD 关键词：[自动驾驶算法工程师/3年以上/...]，确认搜索？"
2. cts_search_candidates(semantic_query="[JD 全文]", location=["上海"]) → 返回语义匹配的人才列表（按相关度排序）
3. cts_get_candidate_detail(candidate_id=...) → 查看匹配人才的完整简历
```

输出：按语义相关度排序的人才列表，Agent 可说明匹配理由（基于 CRE 模型）。

### 场景 C：按姓名/手机快速查找

触发：顾问说"帮我查一下张嘉伟的情况"

```plaintext
1. cts_search_candidates(name="张嘉伟") → 返回同名人才列表
2. 顾问从列表中选择目标人才
3. cts_get_candidate_detail(candidate_id=...) → 完整简历
4. cts_get_candidate_contact_info(candidate_id=...) → 联系方式
```

输出：同名人才列表供顾问选择，选中后展示完整简历和联系方式。

注意：按姓名/手机等自由文本字段搜索时，无需先调 `cts_get_cts_schema`（仅枚举类字段需要）。

---

## 四、Tool 规格定义

本章定义 V1.0（P0）全部工具的完整规格，供研发实现参考。

#### Schema Description 字段规范

每个 tool 的 Input Schema 和 Output Schema 表中增加 `Schema Description` 列（英文），该列内容即为研发实现时 `inputSchema.properties.{param}.description` 或 `outputSchema.properties.{field}.description` 的原文，研发不得简化或改写。

Input Schema：LLM 直接读取此字段决定参数填写方式，信息丢失将导致参数填写错误——全量覆盖。

Output Schema：LLM 读取此字段理解返回数据含义，影响结果呈现准确度——选择性覆盖，仅对业务特有或易误解的字段标注（如 `candidate_id`、`job_status`、`active_time` 等），自解释字段（如 `name`、`age`）标记 `—`表示无需额外描述。

---

### 4.1 人才域（Talent）

#### #1 cts\_search\_candidates

V1.0（P0）| 人才域 | 读

Title: `Talent Search`

Description: 

```plaintext
`**[CTS Talent Search Tool · Use this tool whenever users ask about "CTS data", "CTS internal data", or "if there are any in the internal talent pool"]**
Search for talents in the CTS internal talent pool by keyword/structured filtering (name/company/position/location/education/experience/industry/position category/college type/career status, etc.) or semantic similarity. Supports free combination of three search modes: keyword/semantic_query/hybrid.

PRECONDITIONS (check ONCE before the first search in a conversation; do NOT re-check on subsequent searches):
  1. At least one search or filter parameter is present (keyword / name / phone / company_name / job_title / semantic_query / location / education / ...). Calling with no parameters fails with CTS_BAD_REQUEST.
  2. Dictionary values are available. Dictionary parameters (location, industry, job_category, education, school_type, work_experience) need enum values from cts_get_cts_schema, fetched ONCE per conversation. BEFORE calling cts_get_cts_schema, scan the conversation history — if a prior cts_get_cts_schema result contains the needed types, REUSE those values directly and skip calling cts_get_cts_schema entirely. Only call cts_get_cts_schema when the needed values are genuinely missing from history; pass every missing type in a single schema_types=[...] call.
  3. Search conditions have been presented to the user and the user has approved. Do NOT execute without approval.

RUNTIME ERRORS (handle only when the current call returns an error):
  - VALIDATION_FAILED naming a specific dictionary field → the value for THAT field is stale; re-fetch only that one dictionary, correct the value, retry this search ONCE, then stop.
  - Any other error (CTS_BAD_REQUEST, AUTH_*, CTS_UPSTREAM, ...) → surface the error to the user; do NOT re-fetch schemas and do NOT retry.

AFTER A SUCCESSFUL SEARCH (termination rule — critical):
  - Present the results to the user in natural language (counts, sample candidates, has_phone/has_email notes).
  - STOP. Your next turn MUST be a user-facing response, NOT another tool call.
  - Do NOT spontaneously re-run cts_get_cts_schema or cts_search_candidates. The task is complete until the user issues a NEW request in their next message.
  - Only chain additional tool calls if the user explicitly asks (e.g., "给我看第一个人的详情" → cts_get_candidate_detail; "看他的电话" → first check has_phone, then cts_get_candidate_contact_info if true).

SEARCH MODES (the three text-matching approaches can be used alone OR combined freely — structured filters like location/education/industry can be stacked on top of any mode):
  (A) Keyword mode — pass `keyword` alone (with or without structured filters). Fuzzy matches across skills / company / title text fields. No semantic ranking. Best for short concrete terms like "Python"、"自动驾驶"、"后端开发".
  (B) Semantic mode — pass `semantic_query` alone (with or without structured filters). CRE vector similarity, results ranked by relevance. Best for pasted JDs or natural-language requirement descriptions ("找做 LLM Agent 方向的候选人, 熟悉 RAG 和工具编排").
  (C) Hybrid mode — pass BOTH `keyword` AND `semantic_query` together. Semantic does broad ranking + keyword filters/boosts the candidate pool. Use when the user gives a free-form requirement AND a hard must-have term ("语义: LLM Agent 方向, 必含 keyword: 字节"). When `semantic_query` is present, results are always ranked by semantic relevance regardless of mode.

MODE SELECTION RULES:
  - Short phrase / single concept (< 10 chars) → prefer `keyword`
  - Long JD / multi-sentence requirement → use `semantic_query`
  - Entity-specific value (specific company / school / job title / name / phone) → use the dedicated parameter (`company_name` / `school_name` / `job_title` / `name` / `phone`) — DO NOT stuff these into `keyword`
  - Semantic requirement + hard must-have token → hybrid (`semantic_query` + `keyword`)
  - Semantic requirement + specific entity filter → `semantic_query` + dedicated parameter (e.g., `semantic_query` + `company_name`)
  - NEVER put the same content in both `keyword` and `semantic_query` — redundant.

Returns a paginated summary list (latest education + recent 2 work experiences + has_phone/has_email flags indicating contact availability). For the full resume call cts_get_candidate_detail; check has_phone/has_email before calling cts_get_candidate_contact_info and skip if both are false.`

```

中文参考：\*\*【CTS人才搜索工具 · 用户问"CTS数据"、"CTS内部数据"、"内部人才库里有没有"时必用本工具】\*\*

\> 在 CTS 内部人才库中按关键词 / 结构化筛选（姓名 / 公司 / 职位 / 地点 / 学历 / 经验 / 行业 / 岗位类别 / 院校类型 / 求职状态等）或语义相似度搜索人才。支持 keyword / semantic\_query / hybrid 三种搜索模式自由组合。

\>

\> \*\*前置条件\*\*（只在本会话\*\*首次搜索前\*\*检查一次，后续搜索不再重检）：

\>   1. 至少传入一个搜索/筛选参数（keyword / name / phone / company\_name / job\_title / semantic\_query / location / education / …），无参数会失败返 \`CTS\_BAD\_REQUEST\`。

\>   2. 字典类参数（location, industry, job\_category, education, school\_type, work\_experience）的 value 已就绪。\*\*先在历史消息中查找此前 \`cts\_get\_cts\_schema\` 的结果\*\*——只要找到包含所需类型的，\*\*直接复用 value，跳过调用 \`cts\_get\_cts\_schema\`\*\*。仅当历史确无此字典值时，才调 \`cts\_get\_cts\_schema\`，并用 \`schema\_types=\[...\]\` 一次取齐所有缺失字典。

\>   3. 已向用户展示理解到的筛选条件并获得确认。未确认不要执行。

\>   4.如果是长文本jd描述，或者无法进行关键字抽取的，推荐使用纯语义搜索。

\>

\> \*\*运行时错误处理\*\*（仅在本次调用返回错误时才触发）：

\>   - \`VALIDATION\_FAILED\` 指向某个字典字段 → 该字段 value 失效；只重取该字段对应字典、修正后\*\*最多重试一次\*\*，然后停止。

\>   - 其他错误（\`CTS\_BAD\_REQUEST\` / \`AUTH\_\*\` / \`CTS\_UPSTREAM\` 等）→ \*\*不要\*\*重取字典、\*\*不要\*\*重试，直接把错误告知用户。

\>

\> \*\*三种搜索模式\*\*（三种文本匹配方式可\*\*单独使用\*\*或\*\*任意组合\*\*；结构化筛选 location/education/industry 等可叠加在任一模式上）：

\>   - \*\*(A) 关键字模式\*\*：只传 \`keyword\`（可叠加结构化筛选）。跨技能/公司/岗位字段模糊匹配，不做语义排序。适合短的具体词 "Python"、"自动驾驶"、"后端开发"。

\>   - \*\*(B) 语义模式\*\*：只传 \`semantic\_query\`（可叠加结构化筛选）。CRE 向量相似度，按相关度排序。适合 JD 全文或自然语言描述需求（"找做 LLM Agent 方向、熟悉 RAG 和工具编排的候选人"）。

\>   - \*\*(C) 混合模式\*\*：\*\*同时传 \`keyword\` 和 \`semantic\_query\`\*\*。语义做广泛召回 + 排序，keyword 做硬性过滤/加权。适合"需求描述 + 必含某词"的场景（"语义：LLM Agent 方向；必含 keyword：字节"）。只要 \`semantic\_query\` 存在，结果一律按语义相关度排序。

\>

\> \*\*模式选择规则\*\*：

\>   - 短语/单一概念（< 10 字）→ 优先用 \`keyword\`

\>   - JD 全文 / 多句描述 → 用 \`semantic\_query\`

\>   - 具体实体值（特定公司/学校/职位/姓名/手机号）→ 用对应专用参数（\`company\_name\` / \`school\_name\` / \`job\_title\` / \`name\` / \`phone\`），\*\*不要塞进 \`keyword\`\*\*

\>   - 语义需求 + 硬必含词 → 混合（\`semantic\_query\` + \`keyword\`）

\>   - 语义需求 + 具体实体过滤 → \`semantic\_query\` + 专用参数（如 \`semantic\_query\` + \`company\_name\`）

\>   - \*\*同一内容不要同时传入 \`keyword\` 和 \`semantic\_query\`\*\*，冗余。

\>

\> \*\*搜索成功后\*\*（关键终止规则）：

\>   - 用自然语言向用户展示结果（数量、样例人选、has\_phone / has\_email 情况）。

\>   - \*\*停止\*\*。下一回合必须是\*\*面向用户的自然语言回复\*\*，\*\*不是\*\*另一个 tool call。

\>   - \*\*不要\*\*自发地再次调用 \`cts\_get\_cts\_schema\` 或 \`cts\_search\_candidates\`。搜索任务已完成——直到用户在下一条消息里提出\*\*新的\*\*请求，才再行动。

\>   - 只有用户显式要求时才链式调用其他工具（如"给我看第一个人的详情" → \`cts\_get\_candidate\_detail\`；"看他的电话" → 先查 \`has\_phone\`，为 true 再调 \`cts\_get\_candidate\_contact\_info\`）。

\>

\> 返回分页摘要列表（最近教育经历 + 最近 2 段工作经历 + has\_phone / has\_email 联系方式可用性标识）。完整简历请调用 \`cts\_get\_candidate\_detail\`；调用 \`cts\_get\_candidate\_contact\_info\` 前先检查 has\_phone/has\_email，均为 false 时跳过。

Input Schema：

| 参数名 | 类型 | 必填 | 说明 | Schema Description |
| --- | --- | --- | --- | --- |
| `keyword` | string | 否 | 关键词模糊搜索（技能、公司名、职位名等综合搜索）；已知特定字段的搜索请用专属参数（name / companyname / jobtitle） | `Fuzzy keyword search across skills, company names, job titles, and other text fields. For specific field search, use dedicated parameters (name, company_name, job_title) instead.` |
| `semantic_query` | string | 否 | 语义搜索文本（JD 全文或招聘需求描述），走 CRE 模型向量相似度匹配；与结构化筛选参数可组合使用，传入时自动启用语义排序 | `Semantic search text (JD excerpt or recruitment requirement description). Triggers CRE model vector similarity matching. Can be combined with structured filters as post-filters. When provided, results are ranked by semantic relevance.` |
| `limit` | integer | 否 | 返回条数上限，默认 20，最大 100 | `Maximum number of results to return. Default: 20, max: 100.` |
| `cursor` | string | 否 | 分页游标，由上次请求返回的 `next_cursor` 传入 | `Pagination cursor from the previous response's next_cursor. Omit for the first page.` |

筛选参数（功能域：搜索内部人才库 · 典型场景：库里有没有做XX的人？按姓名 / 公司 / 地点 / 学历 / 经验等多维筛选，或通过 JD 语义匹配）：

| 参数名 | 类型 | 必填 | 说明 | 枚举值 | Schema Description |
| --- | --- | --- | --- | --- | --- |
| `name` | string | 否 | 人才姓名搜索（模糊匹配） | — | `Talent name search (fuzzy match).` |
| `phone` | string | 否 | 手机号搜索（精确匹配） | — | `Phone number search (exact match).` |
| `company_name` | string | 否 | 公司名称搜索（模糊匹配，多个取 OR；匹配当前和历史工作经历中的公司） | — | `Company name search (fuzzy match, multiple, OR). Matches against current and past work experience companies. Pass multiple names to search across several companies at once.` |
| `school_name` | string | 否 | 学校名称搜索（模糊匹配） | — | `School name search (fuzzy match).` |
| `job_title` | string | 否 | 职位名称关键词（模糊匹配，多个取 OR；匹配工作经历中的职位名称） | — | `Job title keywords (fuzzy match, multiple, OR). Matches against job titles in work experience. Pass multiple titles to search across several roles at once.` |
| `work_content` | string | 否 | 工作内容/技能关键词搜索 | — | `Work content or skill keywords search. Matches against work descriptions and skill tags.` |
| `location` | string | 否 | 居住地/期望工作地点筛选（枚举值通过 `cts_get_cts_schema(schema_type="city_tree")` 获取）（多选，取 OR） | — | `Location filter — current residence or preferred work location (multiple, OR). Valid values from cts_get_cts_schema(schema_type="city_tree"). Do NOT guess — always resolve from schema first.` |
| `education` | string | 否 | 学历要求筛选（枚举值通过 `cts_get_cts_schema(schema_type="education_tree")`获取） | — | `Education level filter. Valid values from cts_get_cts_schema(schema_type="education_tree"). Do NOT guess — always resolve from schema first.` |
| `school_type` | string | 否 | 院校类型筛选（枚举值通过 `cts_get_cts_schema(schema_type="school_type_tree")`获取）（多选，取 OR） | — | `School type filter (multiple, OR). Valid values from cts_get_cts_schema(schema_type="school_type_tree"). Do NOT guess — always resolve from schema first.` |
| `work_experience` | string | 否 | 工作年限筛选（枚举值通过 `cts_get_cts_schema(schema_type="experience_tree")`获取）（多选，取 OR） | — | `Work experience years filter (multiple, OR). Valid values from cts_get_cts_schema(schema_type="experience_tree"). Do NOT guess — always resolve from schema first.` |
| `industry` | string | 否 | 行业筛选（枚举值通过 `cts_get_cts_schema(schema_type="industry_tree")` 获取）（多选，取 OR） | — | `Industry filter (multiple, OR). Valid values from cts_get_cts_schema(schema_type="industry_tree"). Do NOT guess — always resolve from schema first.` |
| `job_category` | string | 否 | 求职意向职位类别筛选（枚举值通过 `cts_get_cts_schema(schema_type="job_category_tree")`获取）（多选，取 OR） | — | `Preferred job category filter (multiple, OR). Valid values from cts_get_cts_schema(schema_type="job_category_tree"). Do NOT guess — always resolve from schema first.` |
| `gender` | string | 否 | 性别筛选 | `"男"` / `"女"` | `Gender filter. Allowed: "男", "女".` |
| `age_min` | integer | 否 | 最小年龄（含） | — | `Minimum age filter (inclusive).` |
| `age_max` | integer | 否 | 最大年龄（含） | — | `Maximum age filter (inclusive).` |
| `job_status` | string | 否 | 求职状态筛选（多选，取 OR）（⚠️ 研发确认：枚举值以 CTS 后端为准） | `"在职看机会"` / `"离职"` / `"在职不看"` / ... | `Job-seeking status filter (multiple, OR). Allowed values to be confirmed by CTS backend. Common values: "在职看机会", "离职", "在职不看".` |
| `active_within` | string | 否 | 活跃时间筛选 | `"近7天"` / `"近30天"` / `"近90天"` | `Activity time filter — talents active within the specified period. Allowed: "近7天", "近30天", "近90天".` |
| `sort_by` | string | 否 | 排序方式，默认综合排序；`semantic_query`传入时默认按语义相关度排序 | `"default"`（综合排序）/ `"active_first"`（活跃时间由新到旧）/ `"update_first"`（更新时间由新到旧） | `Sort order. When semantic_query is provided, defaults to semantic relevance ranking. Otherwise: "default" (general relevance), "active_first" (most recently active), "update_first" (most recently updated). Default: "default".` |

Output Schema（公共，搜索类工具适用）：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `items` | array | 记录列表（JSONL 格式流式返回） |
| `total` | integer | 符合条件的总记录数 |
| `next_cursor` | string | 下一页游标，无更多数据时为 null |

Output Schema 条目字段（搜索内部人才 返回摘要 · 含求职状态 / 活跃时间 / 最近教育和工作经历）：

基本信息：

| 字段名 | 类型 | 说明 | Schema Description |
| --- | --- | --- | --- |
| `candidate_id` | string | 人才唯一编码（CTS 系统标识，查询详情和联系方式时需要） | `Unique talent identifier in CTS system. Required for cts_get_candidate_detail and cts_get_candidate_contact_info calls.` |
| `name` | string | 姓名 | — |
| `gender` | string | 性别 | — |
| `age` | integer | 年龄 | — |
| `current_residence` | string | 当前居住地 | — |
| `first_education` | string | 第一学历 | `First/initial degree obtained (e.g., 本科, 大专). Indicates the talent's educational starting point, distinct from highest education.` |
| `work_years` | string | 工作年限 | — |
| `active_time` | string | 活跃时间（yyyy-MM-dd） | `Last activity date in CTS system. More recent = higher likelihood of being reachable and data being current.` |
| `job_status` | string | 求职状态 | `Current job-seeking status (e.g., "在职看机会", "离职", "在职不看"). Indicates receptiveness to outreach — prioritize "在职看机会" and "离职" for active candidates.` |
| `native_place` | string | 户籍 | — |
| `detail_url` | string | CTS 人才详情页跳转链接 | `Direct link to this talent's detail page in CTS system. Use for deep-linking when the consultant wants to view the full profile in CTS.` |

求职意向：

| 字段名 | 类型 | 说明 | Schema Description |
| --- | --- | --- | --- |
| `current_salary` | string | 当前薪资 | — |
| `expected_salary` | string | 期望薪资 | — |
| `preferred_locations` | string | 期望工作地点 | — |
| `preferred_industries` | string | 求职意向行业 | — |
| `preferred_job_categories` | string | 求职意向岗位类别 | — |

联系方式可用性：

| 字段名 | 类型 | 说明 | Schema Description |
| --- | --- | --- | --- |
| `has_phone` | boolean | 是否有手机号（true 时可调 `cts_get_candidate_contact_info` 获取） | `Whether this talent has a phone number on file. When true, call cts_get_candidate_contact_info to retrieve it. When false, skip the contact info call for phone.` |
| `has_email` | boolean | 是否有邮箱（true 时可调 `cts_get_candidate_contact_info` 获取） | `Whether this talent has an email address on file. When true, call cts_get_candidate_contact_info to retrieve it. When false, skip the contact info call for email.` |

最近教育经历 `latest_education`（object，仅最后一段；完整教育经历请调用 `cts_get_candidate_detail`）：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `school` | string | 学校 |
| `education` | string | 学历 |
| `speciality` | string | 专业 |
| `start_time` | string | 开始时间 |
| `end_time` | string | 结束时间 |

最近工作经历 `recent_work_experiences`（object，最近 2 段，不含工作内容描述；完整工作经历请调用 `cts_get_candidate_detail`）：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `company` | string | 公司名称 |
| `title` | string | 职位 |
| `start_time` | string | 开始时间 |
| `end_time` | string | 结束时间 |
| `duration` | string | 任职时长 |

Annotations：`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`

---

#### #2 cts\_get\_candidate\_detail

V1.0（P0）| 人才域 | 读

Title: `Talent Resume Detail`

Description: `Fetch the full standard resume of a CTS talent by candidate_id — profile, job intent, complete education history, complete work history with descriptions, project experience, language skills, certifications, skill tags, training, awards, and self-evaluation. Also includes has_phone/has_email flags indicating contact availability. Does NOT include actual contact information (phone numbers or emails) — check has_phone/has_email first, then call cts_get_candidate_contact_info separately if needed. Use after cts_search_candidates to review a specific talent's full background. Compared to search results (which show only latest education + recent 2 work experiences without descriptions), this returns all history entries with full work content descriptions.`

中文参考：通过 candidateno 获取人才的完整标准简历，包括基本信息、求职意向、全部教育经历、全部工作经历（含工作内容描述）、项目经历、语言能力、资质证书、专业技能、培训经历、获奖情况、自我评价。同时返回 hasphone / hasemail 标识联系方式可用性。不含实际联系方式（手机号或邮箱）——先检查 hasphone / hasemail，需要时再调用 `cts_get_candidate_contact_info` 单独获取。通常在 `cts_search_candidates` 之后调用以深入了解某个人才。与搜索摘要的区别：搜索只返回最近一段教育经历和最近两段工作经历（且不含工作内容），详情返回全部历史并含完整工作内容描述。

Input Schema：

| 参数名 | 类型 | 必填 | 说明 | Schema Description |
| --- | --- | --- | --- | --- |
| `candidate_id` | string | 是 | 人才唯一编号 | `Talent unique identifier in CTS. Obtained from cts_search_candidates results.` |

Output Schema（功能域：查看人才完整简历 · 典型场景：顾问评估人才是否匹配寻访需求）：

默认返回：基本信息（同搜索列表全部字段）+ 完整教育/工作/项目经历 + 技能/证书/自评。

基本信息（同搜索列表全部字段，含基本信息 / 求职意向 / 联系方式可用性 / detailurl，此处不再重复。以下仅列出详情新增字段。）

教育经历 `education_history`（object，全部教育经历；搜索列表仅返回最后一段）：

| 字段名 | 类型 | 说明 | Schema Description |
| --- | --- | --- | --- |
| `school` | string | 学校 | — |
| `education` | string | 学历 | — |
| `speciality` | string | 专业 | — |
| `start_time` | string | 开始时间 | — |
| `end_time` | string | 结束时间 | — |

工作经历 `work_history`（object，全部工作经历，含工作内容描述；搜索列表仅返回最近 2 段且不含描述）：

| 字段名 | 类型 | 说明 | Schema Description |
| --- | --- | --- | --- |
| `company` | string | 公司名称 | — |
| `title` | string | 职位 | — |
| `department` | string | 部门 | — |
| `summary` | string | 工作内容描述 | `Job responsibilities and achievements description. This field is only available in detail, not in search results.` |
| `work_industry` | string | 工作行业 | — |
| `work_category` | string | 工作类别 | — |
| `underling_number` | string | 下属人数 | — |
| `salary` | string | 薪资 | — |
| `start_time` | string | 开始时间 | — |
| `end_time` | string | 结束时间 | — |

项目经历 `project_history`（object）：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `project_name` | string | 项目名称 |
| `company` | string | 所在公司 |
| `title` | string | 担任职位 |
| `responsibilities` | string | 项目职责 |
| `start_time` | string | 开始时间 |
| `end_time` | string | 结束时间 |

技能与资质：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `skill_tags` | string | 专业技能标签 |
| `language_skills` | object | 语言能力 |
| `certificates` | object | 资质证书 |

其他信息：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `training_history` | object | 培训经历 |
| `awards` | object | 获奖情况 |
| `self_evaluation` | string | 自我评价 |

Annotations：`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`

---

#### #3 cts\_get\_candidate\_contact\_info

V1.0（P1）| 人才域 | 读

Title: `Talent Contact Info`

Description: `Fetch contact information (phone, email) for a CTS talent by candidate_id. This is a separate call from cts_get_candidate_detail — the detail API returns has_phone/has_email flags but not actual contact info. IMPORTANT: Before calling, check has_phone/has_email from cts_search_candidates or cts_get_candidate_detail results — skip this call if both are false (no contact info on file). Use when a consultant confirms interest in a talent and needs to prepare for outreach. Access is controlled by authentication — authorized users receive plain-text contact info; unauthorized requests are rejected with 403. Typically called after cts_get_candidate_detail when the consultant decides to reach out.`

中文参考：通过 candidateno 获取人才联系方式（手机号、邮箱）。该接口独立于 `cts_get_candidate_detail`（详情接口返回 hasphone / hasemail 标识但不返回实际联系方式）。调用前先检查搜索或详情结果中的 hasphone / hasemail，均为 false 时跳过本调用（无联系方式记录）。 当顾问确认某个人才值得联系、需要准备后续触达时使用。访问通过鉴权控制——有权限则明文返回完整联系方式，无权限直接返回 403 拒绝。通常在 `cts_get_candidate_detail` 之后、顾问决定联系时调用。

Input Schema：

| 参数名 | 类型 | 必填 | 说明 | Schema Description |
| --- | --- | --- | --- | --- |
| `candidate_id` | string | 是 | 人才唯一编号 | `Talent unique identifier in CTS. Obtained from cts_search_candidates results.` |

Output Schema（功能域：获取人才联系方式 · 典型场景：顾问确认人才值得联系后获取触达方式）：

| 字段名 | 类型 | 说明 | Schema Description |
| --- | --- | --- | --- |
| `phone` | string | null | 手机号码（明文，鉴权通过后返回） |
| `email` | string | null | 邮箱（明文，鉴权通过后返回） |

⚠️ 研发确认：CTS 联系方式接口实际返回字段可能还包含微信、座机等，以实际接口为准。如有更多字段需在此补充。

Annotations：`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`

---

### 4.2 系统工具（System）

---

#### #4 cts\_get\_cts\_schema

V1.0（P0）| 系统工具 | 读

Title: `Data Dictionary`

Description: 

```plaintext
`Resolve CTS taxonomy values (city / industry / job_category / education / school_type / experience) into internal IDs for cts_search_candidates. Large dictionaries (city_tree / industry_tree / job_category_tree) contain thousands of entries — full-dump is refused; you MUST pass `queries` (binding each label to ONE specific dictionary) to resolve specific values. Small dictionaries (education_tree / school_type_tree / experience_tree, <15 items each) can be fetched in full via `schema_types`.

THREE CALLING MODES:
  (a) Index mode — omit both params → returns the list of available dictionary types. Use this only if you are unsure which types exist.
  (b) Full mode — schema_types=[small_dict] (only) → returns the full enum. ONLY for education_tree / school_type_tree / experience_tree.
  (c) Resolve mode — queries=[{schema_type, label}, ...] → each entry binds the label to EXACTLY ONE dictionary. The label is searched ONLY in that dictionary — no cross-schema matching (e.g. "本科" will NOT leak into city_tree). Returns top 5 candidates per label. REQUIRED for large dictionaries.

Example for "学历本科、城市北京":
  queries=[
    {schema_type: "education_tree", label: "本科"},
    {schema_type: "city_tree",      label: "北京"}
  ]
Each label goes ONLY to its paired schema_type. Do NOT put "本科" and city_tree in the same slot — bind every label to the correct dictionary up front.

MATCHING (automatic, server-side, LLM does not need to specify):
  - exact + range-equivalent + substring (combined, always returned together when any hits): label equals query verbatim is `exact` (high, 1.0); labels that equal query after stripping range suffixes (以上/及以上/以下/及以下) are `substring` (high, 0.95) — this captures aggregate siblings (e.g. query="本科以上" hits 本科 AND 本科及以上, both with "本科" as core); other labels containing query as substring are `substring` (high, 0.9). Cross-core entries like 大专及以上 / 硕士及以上 are NOT matched against query="本科以上" because the range-suffix stripping only groups same-core siblings.
  - path_subsequence: query characters appear in order within the full path (ancestor labels + self), LCS coverage ≥ 0.8 → high; 0.5-0.8 → medium. Handles compound inputs like "深圳宝安" matching 宝安区 (path "广东省/深圳市/宝安区").
  - fuzzy (2-gram Jaccard ≥ 0.4): typo tolerance. ≥ 0.7 → medium; else → low. Handles "苏州工业院" → 苏州工业园区.
  - NOTE: queries shorter than 3 characters (e.g. "北京"、"本科") only run exact+substring; fuzzy/path_subseq are skipped for them to avoid spurious 1-char matches.

QUERY CONSTRUCTION (critical — read before writing queries):
  - Pass the user's natural-language words AS-IS; do NOT simplify or summarize. If the user says "本科以上", pass label="本科以上" (not "本科") — dropping "以上" changes the semantic from a RANGE to a SINGLE level and may miss the intended aggregate value (e.g. 本科及以上).
  - Similarly: "5年以上" → "5年以上" (not "5年"); "硕士及以上" → "硕士及以上"; "高级" → "高级" (don't drop modifiers).
  - When the user gives multiple values (e.g. "本科、硕士"), issue ONE queries entry per value: queries=[{education_tree, "本科"}, {education_tree, "硕士"}].

USING RESULTS:
  - Pass item.value to cts_search_candidates (NEVER pass item.label).
  - Show item.label or item.ancestor_path to the user, NEVER item.value (UUIDs/codes are internal).
  - When exact and substring hits both appear, prefer the one that matches user intent: the user literally saying a term → exact; user hinting at a range/aggregate → corresponding substring match (e.g. user says "本科以上" → pick 本科及以上, not 本科).
  - If multiple high-confidence candidates come back (ambiguous — e.g. "朝阳区" in both Beijing and Changchun), ask the user to disambiguate BEFORE searching.
  - If only medium/low candidates come back, confirm with the user before searching.
  - If candidates array is empty, tell the user the value was not found and ask them to rephrase.

CACHE RULES:
  - Dictionary data is cached server-side for 1 hour; no cost to call multiple times.
  - BUT: if you already resolved a query (e.g. "深圳" → 深圳市 UUID) earlier in this conversation, REUSE that value directly; do NOT call this tool again for the same query.`
```

中文参考：把用户说的城市/行业/职位/学历/院校类型/工作年限等自然语言名字，解析成 CTS 内部 ID，供 \`cts\_search\_candidates\` 使用。

\>

\> \*\*大字典\*\*（\`city\_tree\` / \`industry\_tree\` / \`job\_category\_tree\`，各含上千条）\*\*拒绝全量返回\*\*——必须通过 \`queries\` 参数、\*\*为每个 label 明确指定它属于哪个字典\*\*。\*\*小字典\*\*（\`education\_tree\` / \`school\_type\_tree\` / \`experience\_tree\`，各 <15 条）可用 \`schema\_types\` 拿全量。

\>

\> \*\*三种调用模式\*\*：

\>   - \*\*(a) 索引模式\*\*：两个参数都不传 → 返回全量可用字典类型清单。仅在不确定类型名时使用，返回参数较大，谨慎使用。

\>   - \*\*(b) 全量模式\*\*：只传 \`schema\_types=\[小字典\]\` → 返回完整枚举。\*\*仅限\*\* education\_tree / school\_type\_tree / experience\_tree。

\>   - \*\*(c) 解析模式\*\*（最常用）：传 \`queries=\[{schema\_type, label}, ...\]\`，每个 entry 把 label \*\*明确绑定到一个字典\*\*。label 只会在绑定的字典里查找，\*\*不会跨字典误伤\*\*（"本科" 不会跑到 city\_tree 里去）。返回 top 5 候选/label。大字典\*\*必须\*\*用此模式。

\>

\> \*\*"学历本科、城市北京" 的正确调法\*\*：

\>

\> \`\`\`json

\> queries: \[

\>   {"schema\_type": "education\_tree", "label": "本科"},

\>   {"schema\_type": "city\_tree",      "label": "北京"}

\> \]

\> \`\`\`

\>

\> 每个 label 绑定到它所属的字典——不要写成"schema\_types=\[education\_tree, city\_tree\], query\_labels=\[本科, 北京\]"这种平行列表（会让"本科"也去 city\_tree 查）。

\>

\> \*\*query 构造规则\*\*（写 query 前必读）：

\>   - \*\*原样传入用户的自然语言\*\*，不要简化或摘要。用户说"本科以上"就传 \`label="本科以上"\`（不传"本科"）——丢掉"以上"会把\*\*范围语义\*\*降级成\*\*单值\*\*，漏掉 education\_tree 里的聚合值"本科及以上"。

\>   - 同理："5 年以上" → \`"5年以上"\`（不传"5年"）；"硕士及以上" → \`"硕士及以上"\`；"高级" → \`"高级"\`（不要丢修饰词）。

\>   - 用户给\*\*多个值\*\*（如"本科、硕士"），每个值一条 queries entry：\`queries=\[{education\_tree,"本科"}, {education\_tree,"硕士"}\]\`。

\>

\> \*\*匹配算法\*\*（server 端自动，LLM 无需指定）：

\>   - \`exact\` + range-equivalent + \`substring\`（\*\*一起返回，都算 high confidence\*\*）：label 与 query 完全相等 → \`exact\`（1.0）；去掉 \`以上/及以上/以下/及以下\` 等范围后缀后相等（如 "本科" 和 "本科及以上" 的 core 都是 "本科"）→ \`substring\`（0.95），捕获聚合兄弟项；其余 label 含 query 原文 → \`substring\`（0.9）。\*\*关键\*\*：因为 range 后缀剥除只聚同 core 的兄弟，query="本科以上" \*\*不会\*\*误中 "大专及以上""硕士及以上"（它们的 core 是 "大专""硕士"，和 "本科" 不等）。

\>   - \`path\_subsequence\`：query 的字符按顺序在完整路径（祖先 label + 自身 label）中出现，LCS 覆盖率 ≥ 0.8 为 high，0.5-0.8 为 medium。处理"深圳宝安"这种合成词（匹配到 "广东省/深圳市/宝安区"）。

\>   - \`fuzzy\`（2-gram Jaccard ≥ 0.4）：错字容错。≥ 0.7 为 medium，否则 low。处理"苏州工业\*\*院\*\*"→"苏州工业园区"。

\>   - 注意：\*\*小于 3 字的 query\*\*（如"北京"、"本科"）只走 exact+substring，不走 fuzzy/path\_subseq，避免单字误伤（如"本科"误命中"科尔沁"）。

\>

\> \*\*如何使用结果\*\*：

\>   - 把 \`item.value\` 传给 \`cts\_search\_candidates\`（\*\*绝不传 \`item.label\`\*\*）。

\>   - 向用户展示时用 \`item.label\` 或 \`item.ancestor\_path\`，\*\*绝不展示 \`item.value\`\*\*（UUID/code 是内部标识）。

\>   - \*\*当 exact 和 substring 候选同时出现\*\*：按用户意图挑——用户说具体值 → 挑 exact；用户说范围/"以上" → 挑对应的 substring（例如用户"本科以上" → 选 \`本科及以上\` 而不是 \`本科\`）。

\>   - 返回多个 high confidence 候选（如"朝阳区"同时存在于北京和长春）→ \*\*向用户澄清后再搜索\*\*。

\>   - 只返回 medium/low confidence 候选 → 向用户确认后再搜索。

\>   - 返回空 candidates → 告知用户未找到该值、请重新表述。

\>

\> \*\*缓存规则\*\*：

\>   - 字典数据服务端缓存 1 小时，重复调用本工具无额外成本。

\>   - 但：如果本会话内此前已经解析过某个 query（如 "深圳" → 深圳市 UUID），\*\*直接复用该值\*\*，不要再次调本工具解析同一个 query。

Input Schema：

| 参数名 | 类型 | 必填 | 说明 | Schema Description |
| --- | --- | --- | --- | --- |
| `schema_type` | string | 否 | 字典类型名称，不传则返回所有可用类型的索引清单 | `Dictionary type name. Omit to get the full index of available dictionary types; pass a specific type (e.g., "city_tree", "industry_tree") to get that dictionary's values. Common types: city_tree, industry_tree, job_category_tree, education_tree, school_type_tree, experience_tree.` |
| param\_text |  |  |  |  |

schematype 完整清单（功能域：CTS 枚举字典 · 典型场景：`cts_search_candidates` 传入字典类参数前调用；⚠️ 研发确认：key 名称以实际后端配置为准，下表为产品侧整理的 V1.0 需求清单）：

| schematype | 用途 | 引用位置 |
| --- | --- | --- |
| `city_tree` | 地点（省-市-区层级） | ctssearchcandidates 地点筛选 |
| `industry_tree` | 行业（多级分类） | ctssearchcandidates 行业筛选 |
| `job_category_tree` | 职位类别（多级分类） | ctssearchcandidates 职位类别筛选 |
| `education_tree` | 学历要求枚举 | ctssearchcandidates 学历筛选 |
| `school_type_tree` | 院校类型枚举（如 985 / 211 / 双一流 / 海外 QS Top 100） | ctssearchcandidates 院校类型筛选 |
| `experience_tree` | 经验年限枚举 | ctssearchcandidates 经验筛选 |

Output Schema（不传 schematype 时）：

| 字段名 | 类型 | 说明 |
| --- | --- | --- |
| `types` | array | 可用字典类型列表 |
| `types[].schema_type` | string | 字典类型标识（传入 schematype 参数获取该字典） |
| `types[].label` | string | 字典名称（中文显示名） |
| `types[].description` | string | 用途说明 |

Output Schema（传入 schematype 时，以树形字典为例）：

| 字段名 | 类型 | 说明 | Schema Description |
| --- | --- | --- | --- |
| `schema_type` | string | 当前字典类型标识 | — |
| `items` | array | 字典条目列表（树形结构扁平化或嵌套，取决于后端实现） | — |
| `items[].value` | string | 枚举值（传入搜索参数时使用此值） | `The enum value to pass into search tool parameters (e.g., location, industry fields).` |
| `items[].label` | string | 显示名称（中文） | `Human-readable display name in Chinese. Show this to the user, but pass value to search tools.` |
| `items[].parent_value` | string | 父级枚举值（树形结构时有值，顶层为 null） | `Parent node's value for tree hierarchy. Null for top-level items.` |
| `items[].level` | integer | 层级深度（1 = 顶层） | `Depth in the tree hierarchy. 1 = top level.` |

缓存：后端 1 小时缓存，重复调用无额外成本。

Annotations：`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`

---

### 4.3 数据权限矩阵

| 数据域 | 权限隔离 | 说明 |
| --- | --- | --- |
| 人才搜索（searchcandidates） | ⚠️ 研发确认 | 待确认：CTS 搜索接口是否按顾问权限隔离（如分支/团队可见范围），还是全员可搜全库 |
| 人才详情（getcandidatedetail） | ⚠️ 研发确认 | 待确认：同上 |
| 人才联系方式（getcandidatecontactinfo） | ⚠️ 研发确认 | 待确认：是否有权限分级（如实习生不可查联系方式） |

---

## 五、研发确认清单

CTS API 端点映射：每个 P0 Tool 对应哪个 CTS REST API 端点。端点未对齐则 MCP Server 无法实现。

筛选参数拆分可行性：本文档将 `cts_search_candidates` 的筛选条件拆为独立参数（对齐 CRM V1.0 做法），需确认 CTS 搜索接口是否支持每个维度独立传参。若 CTS 后端仅接受自然语言 query，则需 MCP Server 适配层做参数转换。

游标分页支持：本文档统一使用游标分页（cursor / nextcursor），需确认 CTS 搜索接口是否原生支持游标分页。若 CTS 后端仅支持页码分页（pageindex / pagesize），则需 MCP Server 适配层做分页模式转换。

ctsgetctsschema 完整枚举清单：schematype 枚举清单需对照 CTS 前端所有下拉框补全；目前产品侧已整理 6 个，实际可能更多。

~~semanticquery 后端实现：语义搜索走什么索引（CRE 模型），返回是否带匹配度得分。若带得分，需在 outputSchema 中增加~~ `~~relevance_score~~` ~~字段。~~

ctsgetcandidatecontactinfo 接口实际返回字段：除手机和邮箱外是否还有微信、座机等。

jobstatus 求职状态枚举值：CTS 系统中求职状态的完整枚举值列表（如"在职看机会"/"离职"/"在职不看"等）。若枚举值较多，应纳入 `cts_get_cts_schema` 管理。

数据权限隔离：CTS 搜索/详情/联系方式接口是否按顾问权限隔离（分支/团队级别），还是全员可见全库。

listChanged 能力声明：确认 FastMCP TypeScript 中 `tools.listChanged` 的配置方式，确保后续版本新增工具时能正确推送 `notifications/tools/list_changed`。

Mira 是否读取 MCP Server 的 instructions 字段：确认 Mira 平台侧是否解析并传递 Server Instructions 给 LLM。

Tool 命名前缀确认：本文档使用 `cts`\_ 前缀（如 `cts_search_candidates`），需确认 Mira 平台多 Server 下的命名规范无冲突。