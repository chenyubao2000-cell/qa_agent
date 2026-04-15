# Fixture Registry — 校验规则与映射规范

> **权威来源**: 本文件定义 Fixture Registry 的校验规则。
> Registry 数据来自项目的 `test-data.config.json`，不再硬编码在文档中。
> 被以下组件引用：test-case-generator、playwright-script-generator、e2e-orchestrator。

---

## 1. Registry 数据来源

Fixture Registry 的唯一数据来源是项目的 `test-data.config.json` 中的 `fixtures` 字段。

```
test-data.config.json → fixtures → { fixtureId: { name, env, timeout, description, ... } }
```

每个 key 就是一个 `fixtureId`，value 中的 `name` 是对应的 TypeScript fixture 变量名。

### 映射示例

| fixtureId (config key) | fixture name (TypeScript) | Env var | Timeout |
|---|---|---|---|
| `code-gen` | `taskWithCodeUrl` | `E2E_TASK_WITH_CODE_URL` | 480_000 |
| `file-gen` | `taskWithFilesUrl` | `E2E_TASK_WITH_FILES_URL` | 480_000 |
| `people-data` | `taskWithPeopleDataUrl` | `E2E_TASK_WITH_PEOPLE_DATA_URL` | 360_000 |
| `tool-chain` | `taskWithToolChainUrl` | `E2E_TASK_WITH_TOOL_CHAIN_URL` | 600_000 |
| `share` | `shareUrl` | `E2E_SHARE_URL` | 600_000 |

> 上表仅为 mira_online 项目的示例。其他项目有不同的 fixture 集合。

---

## 2. 校验规则

### 2.1 生成时校验（test-data-setup Skill）

在生成 data.setup.ts 和 fixtures.ts 时：

```
✅ 每个 fixture 必须有 name、env、prompt、waitPattern、timeout
✅ name 必须是合法的 JavaScript 标识符（camelCase）
✅ env 必须是 SCREAMING_SNAKE_CASE 格式
✅ timeout 必须 > 0
✅ type === "share" 时必须有 shareDialog 配置
```

### 2.2 用例生成时校验（test-case-generator → handoff）

当 test-case-generator 在 handoff JSON 中设置 `setup[].type = "fixture"` 时：

```
✅ fixtureId 必须存在于 test-data.config.json 的 fixtures keys 中
❌ 未知 fixtureId → 报错，阻止生成
```

handoff 格式：
```json
{
  "setup": [{
    "type": "fixture",
    "fixtureId": "tool-chain"
  }]
}
```

### 2.3 脚本生成时校验（playwright-script-generator）

将 `fixtureId` 映射为 fixture 变量名，用于 test 函数的参数解构：

```
fixtureId "tool-chain" → fixture name "taskWithToolChainUrl"
→ test('...', async ({ page, taskWithToolChainUrl }) => { ... })
```

```
✅ fixtureId 存在于 config → 映射成功，生成 spec
❌ fixtureId 不存在 → ERROR at generation time，不生成 broken spec
```

---

## 3. 新增 Fixture 检查清单

当需要新增一种前置数据类型时：

1. **检查现有 Registry** — 是否有已存在的 fixtureId 能覆盖需求？
2. **如果没有**，在 `test-data.config.json` 中添加新条目
3. 重新运行 Phase 0 → Skill 自动重新生成 data.setup.ts + fixtures.ts
4. e2e-orchestrator、test-case-generator、playwright-script-generator 自动获得新 fixtureId
5. 验证：`npx playwright test --list` 应显示 data-setup test

---

## 4. fixtureId 命名规范

| 规则 | 示例 |
|------|------|
| 使用 kebab-case | `code-gen`, `people-data` |
| 描述数据类型而非操作 | `file-gen` (not `create-file`) |
| 避免项目名前缀 | `tool-chain` (not `mira-tool-chain`) |
| 保持简短但有意义 | `share` (not `share-url-with-token`) |

---

## 5. 数据最大化复用原则

设计 fixture 时要考虑**最大化复用**——一份前置数据应尽量服务于多个测试场景：

| 一份数据 | 可覆盖的测试场景 |
|----------|------------------|
| `tool-chain` (含多种文件) | 文件预览、文件下载、文件列表、Canvas 查看 |
| `people-data` (含候选人结果) | 人才数据卡片、数据下载、列表展示 |
| `code-gen` (含代码输出) | 代码预览、AI 对话渲染、任务详情 |
| `share` (含分享链接) | 分享页查看、权限验证、链接失效 |

**反模式**：为每个测试单独创建一份数据 → 浪费时间，增加服务器负载。

**正确做法**：查询、下载、查看、修改、删除等操作尽量共享同一份前置数据。
