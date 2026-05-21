# cts-mcp 测试用例文档（V1.0 / M2 完成版）

**Generated**: 2026-05-08（M1 → M2）
**PRD**: docs/CTS MCP V1.0 - PRD Final.md
**Server**: https://mcp-cts-test.ciwork.cn/mcp（mcp-cts-server v1.0.0）
**Scope**: L1 协议 + L2 行为（L3 不在 V1.0）
**覆盖**: 4 / 4 工具，51 条用例（P0×34 + P1×15 + Skip-by-design×2；外加 9 条受 search quota 条件跳过）

参考：[case-taxonomy.md](../../../skills/mcp-test-generator/references/case-taxonomy.md)（12 维矩阵）

---

## cts_get_cts_schema（17 条：P0×11 + P1×5 + Skip×1）

字典工具 — 把用户的自然语言（"本科"、"北京"）解析为 CTS 内部 ID。3 种调用模式：index / full / resolve。

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
| --- | --- | --- | --- | --- | --- |
| TC-CTS-SCHEMA-001 | P0 | [L1] tools/list 中存在 cts_get_cts_schema | 已有效 token | listTools | tools 数组含此工具 |
| TC-CTS-SCHEMA-002 | P0 | [L1] annotations 与 PRD §1.3.1 一致 | 已有效 token | listTools | readOnly/destructive/idempotent/openWorld 4 hint 匹配 |
| TC-CTS-SCHEMA-003 | P0 | [L1] inputSchema 含 schema_types + queries | 已有效 token | listTools | properties 同时含两字段 |
| TC-CTS-SCHEMA-004 | P0 | [L1] schema_types items.enum 含全部 6 个字典类型 | 已有效 token | listTools | enum 完整 |
| TC-CTS-SCHEMA-005 | P0 | [L2] 索引模式：不传参 → 6 个字典 | 已有效 token | callTool({}) | data.types 6 项 |
| TC-CTS-SCHEMA-006 | P0 | [L2] 全量模式：edu 字典 → items 含 "本科 / 大专" 等 | 已有效 token | schema_types=["education_tree"] | 含学历词 |
| TC-CTS-SCHEMA-007 | P0 | [L2] 全量模式 3 小字典：edu+school+exp 同时返回 | 已有效 token | schema_types=[3 small] | 各类典型词都在 |
| TC-CTS-SCHEMA-008 | P0 | [L2] resolve "本科" → exact 命中 confidence=high score=1 | 已有效 token | queries=[{edu,本科}] | match_type=exact，confidence=high |
| TC-CTS-SCHEMA-009 | P0 | [L2] 多 query 学历+城市 | 已有效 token | queries 2 个 | 同时含本科 + 北京 |
| TC-CTS-SCHEMA-010 | P0 | [L2] 大字典 city_tree 全量 → 应被拒绝 | 已有效 token | schema_types=[city_tree] | rejects（PRD: full-dump refused） |
| TC-CTS-SCHEMA-011 | P1 | [L2] range-equivalent："本科以上" 命中 本科+本科及以上 | 已有效 token | queries=[edu,"本科以上"] | 含两者 + 不含跨 core 兄弟 |
| TC-CTS-SCHEMA-012 | P1 | [L2] path_subseq："深圳宝安" 命中宝安区 | 已有效 token | queries=[city,"深圳宝安"] | 含宝安 |
| TC-CTS-SCHEMA-013 | P1 | [L2] 不存在的城市"火星市" → 不返高置信 | 已有效 token | queries=[city,"火星市"] | 不含 confidence=high |
| TC-CTS-SCHEMA-014 | P1 | [L2] 非法 schema_type → schema 校验错 | 已有效 token | queries=[bad type] | rejects |
| TC-CTS-SCHEMA-015 | P0 | [L2] 鉴权：无 token → 应被拒绝 | noAuth client | callTool | 抛错或 isError |
| TC-CTS-SCHEMA-016 | P0 | [L2] 幂等：同 query 2 次结果一致 | 已有效 token | 相同 args ×2 | stripVolatile 后 deepEqual |
| TC-CTS-SCHEMA-017 | Skip | [L2] 鉴权：有 token 但无权限 → 403 | 待测试账号 | — | TODO(C) |

---

## cts_search_candidates（16 条：P0×8 + P1×6 + 受 quota 影响 9 条会 skip）

人才搜索 — 三种模式：keyword / semantic_query / hybrid。受**日 quota** 限制（calls=10/items=500/day），quota 用尽后 9 条用例自动 skip 直至次日。

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
| --- | --- | --- | --- | --- | --- |
| TC-CTS-SEARCH-001 | P0 | [L1] tools/list 中存在 | 已有效 token | listTools | 工具存在 |
| TC-CTS-SEARCH-002 | P0 | [L1] annotations 一致 | 已有效 token | listTools | 4 hint 匹配 |
| TC-CTS-SEARCH-003 | P0 | [L1] inputSchema 含核心参数 | 已有效 token | listTools | keyword/semantic_query/location/limit/cursor 都在 |
| TC-CTS-SEARCH-004 | P0 | [L2] keyword 模式 happy path | 已有效 token + quota 未尽 | keyword=工程师, limit=3 | items 非空，每条含 candidate_id/has_phone/has_email |
| TC-CTS-SEARCH-005 | P0 | [L2] semantic 模式 happy path | 同上 | semantic_query=JD 描述, limit=3 | items 非空（软断言） |
| TC-CTS-SEARCH-006 | P0 | [L2] hybrid 模式 happy path | 同上 | keyword + semantic_query | items 非空 |
| TC-CTS-SEARCH-007 | P0 | [L2] 空参数 → CTS_BAD_REQUEST | 已有效 token | callTool({}) | errorCode=CTS_BAD_REQUEST，含"at least one filter" |
| TC-CTS-SEARCH-008 | P1 | [L2] limit=200 (max) → 返回 ≤ 200 条 | quota 未尽 | limit=200 | items.length ≤ 200 |
| TC-CTS-SEARCH-009 | P1 | [L2] limit=201 (超 max) → 应被拒绝 | 已有效 token | limit=201 | rejects |
| TC-CTS-SEARCH-010 | P1 | [L2] gender='X' 非法 → 应被拒绝 | 已有效 token | gender=X | rejects |
| TC-CTS-SEARCH-011 | P1 | [L2] 不存在的 keyword → items 为空 | quota 未尽 | keyword=zzzzx | items.length=0, total=0 |
| TC-CTS-SEARCH-012 | P0 | [L2] 鉴权：无 token → 应被拒绝 | noAuth | callTool | 抛错或 isError |
| TC-CTS-SEARCH-013 | P0 | [L2] 幂等：同 keyword 2 次结果一致 | quota 未尽 | 相同 args ×2 | stripVolatile 后 deepEqual |
| TC-CTS-SEARCH-014 | P1 | [L2] meta total/next_cursor — total ≥ items.length | quota 未尽 | limit=2 | total ≥ items.length，含 next_cursor |
| TC-CTS-SEARCH-015 | P1 | [L2] 分页：next_cursor 翻页不重复 | quota 未尽 | limit=1 → cursor → limit=1 | 第二页 candidate_id ≠ 第一页 |
| TC-CTS-SEARCH-016 | P1 | [L2] item 含 PRD §4.1 必有字段 | quota 未尽 | limit=1 | candidate_id/name/has_phone/has_email 都在 |

---

## cts_get_candidate_detail（9 条：P0×7 + P1×2）

人才详情 — 必须用 candidate_id（fixtures.ts 提供 fallback id 避免对 search quota 的依赖）。

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
| --- | --- | --- | --- | --- | --- |
| TC-CTS-DETAIL-001 | P0 | [L1] tools/list 中存在 | 已有效 token | listTools | 工具存在 |
| TC-CTS-DETAIL-002 | P0 | [L1] annotations 一致 | 已有效 token | listTools | 4 hint 匹配 |
| TC-CTS-DETAIL-003 | P0 | [L1] inputSchema candidate_id required | 已有效 token | listTools | required 含 candidate_id |
| TC-CTS-DETAIL-004 | P0 | [L2] happy path：已知 id 取详情 | 已有效 token + 有效 id | candidate_id=fixture | 返回完整 candidate_id+name+has_phone/email |
| TC-CTS-DETAIL-005 | P1 | [L2] 详情含 education_history/work_history | 同上 | callTool | 至少其一为数组 |
| TC-CTS-DETAIL-006 | P0 | [L2] 缺 candidate_id → schema 校验错 | 已有效 token | callTool({}) | rejects |
| TC-CTS-DETAIL-007 | P1 | [L2] 不存在 candidate_id → isError | 已有效 token | candidate_id=nonexistent | r.isError=true |
| TC-CTS-DETAIL-008 | P0 | [L2] 鉴权：无 token → 应被拒绝 | noAuth | callTool | 抛错或 isError |
| TC-CTS-DETAIL-009 | P0 | [L2] 幂等：同 id 2 次一致 | 已有效 token | 相同 args ×2 | stripVolatile 后 deepEqual |

---

## cts_get_candidate_contact_info（9 条：P0×7 + Skip×1）

联系方式 — 鉴权敏感最强，403 用例待运维提供测试账号后启用。

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
| --- | --- | --- | --- | --- | --- |
| TC-CTS-CONTACT-001 | P0 | [L1] tools/list 中存在 | 已有效 token | listTools | 工具存在 |
| TC-CTS-CONTACT-002 | P0 | [L1] annotations 一致 | 已有效 token | listTools | 4 hint 匹配 |
| TC-CTS-CONTACT-003 | P0 | [L1] inputSchema candidate_id required | 已有效 token | listTools | required 含 candidate_id |
| TC-CTS-CONTACT-004 | P0 | [L2] happy path：已知 id → 返回 phone/email | 已有效 token + 有权限 | candidate_id=fixture | data 含 phone 或 email 字段 |
| TC-CTS-CONTACT-005 | P0 | [L2] 缺 candidate_id → schema 校验错 | 已有效 token | callTool({}) | rejects |
| TC-CTS-CONTACT-006 | P0 | [L2] 不存在 candidate_id → isError | 已有效 token | candidate_id=nonexistent | r.isError=true |
| TC-CTS-CONTACT-007 | P0 | [L2] 鉴权：无 token → 应被拒绝 | noAuth | callTool | 抛错或 isError |
| TC-CTS-CONTACT-008 | P0 | [L2] 幂等：同 id 2 次一致 | 已有效 token | 相同 args ×2 | stripVolatile 后 deepEqual |
| TC-CTS-CONTACT-009 | Skip | [L2] 鉴权：有 token 无 contact 权限 → 403 | 待测试账号 | — | TODO(C) |

---

## 设计方法对照（全 50 条用例）

- 等价类划分 — 大量 happy path 案例 + 拒绝路径案例（CTS_BAD_REQUEST 等）
- 边界值 — limit=200/201, cursor 翻页, 空 keyword, 字典 range-equivalent
- 因果图 / 决策表 — match_type ↔ confidence 关系（schema 工具）
- 状态转换 — N/A（V1.0 工具无状态）
- 场景法 — 多 query 组合，多字典组合，search→detail→contact 链路（fixtures 串）
- 错误猜测 — 大字典禁全量，路径合成词，不存在值，无 token，过期 token

---

## 已知运行约束

| 约束 | 影响 |
|------|------|
| **Search 日 quota** = 10 calls / 500 items | quota 用尽后 9 条 search 用例自动 skip，次日 00:00 (北京) 重置 |
| **403 用例待测试账号** | 3 条 skip（schema/contact/各 1 条；search 不需要 contact 权限故无） |
| **Token 一周过期** | 过期后所有 L2 用例返 401，需在 .env 替换 |
