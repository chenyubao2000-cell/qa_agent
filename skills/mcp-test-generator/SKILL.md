---
name: mcp-test-generator
description: 给定 MCP server 的 PRD + 在线 discovery，生成 L1 协议 + L2 行为 vitest 测试套件
---

# MCP Test Generator Skill

将 MCP 工具的需求文档（PRD）和服务端 `tools/list` 实测结果融合，生成可执行的 vitest 测试套件。

## 设计原则

1. **双输入对齐**：PRD（业务期望）+ server 实测（技术真相）。两者不一致 → schema diff 报告。
2. **范围分层**：L1（协议层）+ L2（工具行为层）。L3（Agent 行为）不在本 skill 范围。
3. **复用平台能力**：用例生成走 `test-case-generator`，Excel 走 `excel-case-export`。
4. **可独立执行**：产物 spec 拿出去单独跑也能工作（依赖 `_lib/` 内的 client 封装 + `.env`）。

## 输入

```ts
{
  prdPath: string,             // PRD 路径
  serverSlug: string,          // 测试套件 slug，如 "cts-mcp"
  discovery: {                 // online 时必填
    serverInfo: { name, version },
    capabilities: object,
    instructions: string,
    tools: ToolDefinition[],
  } | null,                    // null = offline 模式
  scope: "L1" | "L2" | "all",
  offline: boolean,
}
```

## 输出

| 文件 | 说明 |
|------|------|
| `test-cases/mcp/{slug}/cases.md` | 用例文档（人读，按 P0/P1） |
| `test-cases/mcp/{slug}/cases.xlsx` | Excel 用例 |
| `test-cases/mcp/{slug}/handoff.json` | generator → spec 中间产物 |
| `tests/mcp/{slug}/{tool}.test.ts` | per-tool vitest spec |
| `tests/mcp/{slug}/reports/schema-diff.report.md` | PRD vs 实测 diff 表 |

## References

- [prd-extraction.md](references/prd-extraction.md) — 从 PRD 抽 schema/规则/场景的规则
- [schema-diff-rules.md](references/schema-diff-rules.md) — diff 严重度分级
- [case-taxonomy.md](references/case-taxonomy.md) — 12 维测试矩阵详解
- [vitest-template.md](references/vitest-template.md) — spec 模板
