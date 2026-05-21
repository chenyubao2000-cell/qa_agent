# PRD 抽取规则

将 MCP 需求文档解析成结构化的 expected schema，供 schema diff 和用例生成使用。

## 目标信息

```ts
type ExpectedTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    properties: Record<string, FieldSpec>;
    requiredFields: string[];
  };
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  scenarios: Scenario[];
  behaviorRules: string[];
};

type FieldSpec = {
  type: "string" | "integer" | "boolean" | "array" | "object";
  itemType?: string;          // for array
  enum?: string[];
  required?: boolean;
};

type Scenario = {
  name: string;
  steps: string[];            // 调用顺序
  inputs: Record<string, unknown>;
};
```

## 抽取启发式

PRD 一般组织为：

1. **Tool 一览表**（`§1.2`）→ 抽 `name` + `description` 简短版
2. **Tool 规格定义章节**（`§4.x`）→ 抽 `inputSchema` + `annotations`
3. **场景示例**（`§3`）→ 抽 `scenarios`
4. **Server Instructions**（`§2.5`）→ 抽 `behaviorRules`（嵌入的强制规则）

## 解析正则 / 锚点

- 工具章节标题：`#### #\\d+ {tool_name}` 或 `### \\d+\\.\\d+ {域名}`
- Input Schema 表：表头 `| 参数名 | 类型 | 必填 | ...`
- 必填判断：第三列 `是` → required；`否` → optional
- Annotations 行：`Annotations`：`readOnlyHint: true` 等
- 枚举值：`枚举值` 列含 `"X" / "Y"` 形式 → split

## 已知陷阱

1. **PRD 的 "Schema Description" 列是英文 description 字段**，不是字段类型描述。
2. **PRD 中 `string` 表示单字符串，server 中可能是 `string[]`** — 这是常见 PRD 漏写，要在 schema diff 中标 critical。
3. **PRD 标 "类型" 用中文（如"枚举"），实际 JSON Schema 应标 `string + enum: [...]`** — 解析时统一规范化。
4. **`annotations.idempotentHint` 默认 `false`，PRD 不写就是 false** — 但很多只读工具实际是 idempotent，要查 server 真值，PRD 没写不算 diff。
5. **Server Instructions 里的"强制规则"大多是 LLM 行为规则（L3）**，不要试图在 L1/L2 测试这些（如"先确认再调用"、"成功后停止"）。

## 失败兜底

如果 PRD 解析失败（结构变化），降级为：

- 仅用 server discovery 作为 single source of truth
- 不生成 schema diff（标 "PRD parse failed"）
- 用例数减半（仅 happy path + 401 + idempotent）
