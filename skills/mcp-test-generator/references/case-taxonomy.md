# MCP 测试用例 12 维矩阵

每个 MCP 工具按下表逐维生成用例。维度命中条件 → 至少 1 条用例；典型工具最终 8-16 条。

## 矩阵

| # | 维度 | 优先级 | 命中条件 | 断言核心 |
|---|------|:------:|---------|---------|
| 1 | Schema 合规 | P0 | 任意 | tools/list 中工具存在；inputSchema 字段名/类型/必填与 PRD 一致 |
| 2 | Annotations | P0 | 任意 | readOnlyHint/destructiveHint/idempotentHint/openWorldHint 与 PRD 一致 |
| 3 | Happy path | P0 | 任意 | 用 PRD 场景的典型入参，断言"成功 + 结构合法"。多模式工具每种模式一条 |
| 4 | 必填缺失 | P0 | 有 required 字段 / 业务上必填 | 缺 required 字段 → 应返错（CTS_BAD_REQUEST 或类似） |
| 5 | 非法枚举 | P1 | 字段有 enum | 传 enum 外的值 → 应返 422/VALIDATION_FAILED |
| 6 | 边界值 | P1 | 字段是 integer 或 array | minimum / maximum / 0 / 空数组 / null |
| 7 | 401 无 token | P0 | 任意 | 不传 Authorization → 401（注：MCP SDK 可能抛连接错误而非 HTTP 401，参考 vitest-template.md） |
| 8 | 403 无权限 | **Skip** | 鉴权敏感工具（如 contact_info） | `it.skip()` + `// TODO(C): 待测试账号` |
| 9 | 不存在 ID | P1 | 有 id/key 类必填字段 | 传不存在的 id → 应返 404 或对应错误 |
| 10 | 幂等性 | P0 | annotations.idempotentHint = true | 同入参两次调用，结果**深度相等**（如带 trace_id 字段则忽略） |
| 11 | 分页 | P1 | 有 cursor / next_cursor | 首页 → next_cursor 翻页 → 不重复条目 |
| 12 | 工具特有 | P1 | 看 PRD 业务规则 | 例：cts_get_cts_schema 有 4 类匹配算法（exact/range-equivalent/path_subseq/fuzzy）→ 每种 1 条 |

## 软断言（特殊场景）

某些工具的输出**本身不可重现**（如 semantic search 排名、随机化采样）。这类用例只断言：

- 返回非空 / 结构合法（schema 校验通过）
- 关键字段存在（如 `items[].candidate_id`）
- 数量在合理范围（如 `total >= 1`）

**不**断言具体业务值（如"第一个候选必须是张三"）。

## 用例命名约定

```
[P0][L1] {工具名}: tools/list 中存在且 schema 与 PRD 一致
[P0][L2] {工具名}: 模式(a) 索引 — 不传参返回类型清单
[P1][L2] {工具名}: 边界 limit=0 → 应返错
[P0][L2] {工具名}: 鉴权 — 无 token → 应被拒绝
```

`[Px]` + `[Ly]` 前缀允许报告层正则分类统计。
