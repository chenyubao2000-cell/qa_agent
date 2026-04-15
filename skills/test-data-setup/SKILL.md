# Test Data Setup Skill

> **通用能力**: 为 E2E 测试项目生成前置数据管理基础设施（data.setup.ts + fixtures.ts 中的数据 fixture）。
> 项目专属知识（prompt、选择器、路由）由 `test-data.config.json` 声明，本 Skill 读取配置生成代码。
> 所有命令通过 `phase-0-workspace-init.md` Step 2f-0 间接调用本 Skill。

---

## 适用场景

当目标项目需要"昂贵的前置数据"（如 AI 任务创建、文件生成、分享链接等），且这些数据需要：
- 跨多个测试场景复用（查询、下载、查看、修改、删除）
- 并行创建以节省时间
- 缓存以避免重复创建

## 架构：配置驱动的三级回退

```
test-data.config.json  ←  项目声明式配置（唯一的项目专属输入）
        ↓ Skill 读取
data.setup.ts          ←  并行创建 + 写入 .test-data.json
fixtures.ts            ←  worker-scope fixture + 3 级回退
        ↓ 运行时
Env var → .test-data.json → UI 创建（fallback）
```

---

## 输入：test-data.config.json

每个项目在自己的根目录下维护一个 `test-data.config.json`，声明所有需要的前置数据：

```jsonc
{
  // ── 路由配置 ──
  "routes": {
    "taskCreation": "/task",        // 任务创建页面路径
    "signIn": "/sign-in"            // 登录页面路径
  },

  // ── 通用选择器 ──
  "selectors": {
    "textarea": "请输入|Ask anything",           // 输入框 accessible name
    "submitBtn": "Submit|提交",                   // 提交按钮 accessible name
    "completionIndicator": "任务已完成|Task completed"  // 任务完成标志文本
  },

  // ── Fixture 声明 ──
  "fixtures": {
    "code-gen": {
      "name": "taskWithCodeUrl",
      "env": "E2E_TASK_WITH_CODE_URL",
      "prompt": "用 Python 写一个快速排序算法",
      "waitPattern": "任务已完成|Task completed",
      "fallbackFill": "请直接编写代码",
      "timeout": 480000,
      "description": "Completed task with code generation output"
    },
    "file-gen": {
      "name": "taskWithFilesUrl",
      "env": "E2E_TASK_WITH_FILES_URL",
      "prompt": "帮我写一个简单的PPT，主题是自我介绍，3页就够，不需要问我问题直接创建",
      "waitPattern": "任务已完成|Task completed",
      "fallbackFill": "请直接创建文件",
      "timeout": 480000,
      "description": "Completed task with generated files (PPT, etc.)"
    },
    "people-data": {
      "name": "taskWithPeopleDataUrl",
      "env": "E2E_TASK_WITH_PEOPLE_DATA_URL",
      "prompt": "帮我搜索苏州的软件工程师候选人，不需要问我问题直接搜索",
      "waitPattern": "People Data|人才数据",
      "waitLocator": "[role='log'] div[role='button']",
      "fallbackFill": "软件工程师，3年以上经验",
      "timeout": 360000,
      "description": "Completed task with people/candidate search results"
    },
    "tool-chain": {
      "name": "taskWithToolChainUrl",
      "env": "E2E_TASK_WITH_TOOL_CHAIN_URL",
      "prompt": "请帮我完成一个关于\"2025年全球AI大模型市场\"的综合研究任务。不需要问我问题，直接开始执行，最终必须交付以下 6 种格式的文件（缺一不可）：1) 一个 .xlsx 表格文件；2) 一个 .pptx 演示文件；3) 一个 .pdf 报告文件；4) 一个 .docx 文档文件；5) 一个 .png 图片文件；6) 一个 .json 数据文件。请先搜索相关信息，再逐一生成以上所有文件。",
      "waitPattern": "任务已完成|Task completed",
      "fallbackFill": "请直接开始，使用默认设置",
      "timeout": 600000,
      "description": "Completed multi-tool-chain task (search + files + code)"
    },
    "share": {
      "name": "shareUrl",
      "env": "E2E_SHARE_URL",
      "type": "share",
      "prompt": "用 Python 写一个 hello world",
      "waitPattern": "任务已完成|Task completed",
      "fallbackFill": "请直接编写代码",
      "timeout": 600000,
      "description": "Share page URL with access token",
      "shareDialog": {
        "shareButtonSelector": "svg.lucide-share2, svg.lucide-share-2",
        "createLinkBtn": "创建分享链接|Create share link",
        "copyLinkBtn": "复制链接|Copy link",
        "urlPattern": "/share/"
      }
    }
  },

  // ── 澄清表单处理（可选，项目有 AI 交互式阻断时配置） ──
  "clarificationHandler": {
    "submitSelector": "[role='log'] button",
    "submitText": "提交|Submit",
    "inputSelector": "[role='log'] textarea",
    "radioGroupSelector": "[role='log'] [role='radiogroup']",
    "bypassMessage": "请直接开始创建，使用默认设置"
  },

  // ── 缓存配置 ──
  "cache": {
    "ttlMs": 86400000,
    "path": "playwright/.test-data.json"
  }
}
```

### 配置字段说明

| 字段 | 必填 | 说明 |
|------|:----:|------|
| `routes.taskCreation` | YES | 任务创建页的 URL 路径 |
| `routes.signIn` | YES | 登录页的 URL 路径 |
| `selectors.textarea` | YES | 输入框的 accessible name（支持 `\|` 多语言） |
| `selectors.submitBtn` | YES | 提交按钮的 accessible name |
| `selectors.completionIndicator` | YES | 任务完成的文本标志 |
| `fixtures.*` | YES | 至少一个 fixture 声明 |
| `fixtures.*.name` | YES | fixture 变量名（camelCase），对应 fixtures.ts 中的 key |
| `fixtures.*.env` | YES | 环境变量名（SCREAMING_SNAKE_CASE） |
| `fixtures.*.prompt` | YES | 创建任务时输入的 prompt |
| `fixtures.*.waitPattern` | YES | 等待完成的正则文本 |
| `fixtures.*.waitLocator` | NO | 自定义等待元素的 CSS selector（默认用 `getByText(waitPattern)`） |
| `fixtures.*.fallbackFill` | NO | 澄清表单的默认填充文本 |
| `fixtures.*.timeout` | YES | fixture 超时时间（ms） |
| `fixtures.*.type` | NO | `"share"` 表示需要额外的分享对话框交互 |
| `fixtures.*.shareDialog` | NO | 分享对话框的选择器配置（仅 type=share 时需要） |
| `clarificationHandler` | NO | AI 交互式阻断的处理配置（无则跳过阻断处理） |
| `cache.ttlMs` | NO | 缓存有效期，默认 24h (86400000) |
| `cache.path` | NO | 缓存文件路径，默认 `playwright/.test-data.json` |

---

## 生成规则

### 1. data.setup.ts 生成

读取 `test-data.config.json`，按以下模板生成 `tests/e2e/data.setup.ts`：

**生成逻辑**：
1. 遍历 `fixtures` 中每个条目
2. `type !== "share"` 的 → 生成 `createTaskInContext(browser, key, prompt, waitPattern, fallbackFill)` 调用
3. `type === "share"` 的 → 生成 `createShareInContext(browser)` 调用，使用 `shareDialog` 配置
4. 所有创建任务放入 `Promise.allSettled` 并行执行
5. `needsCreation()` 检查 3 级回退：env var → .test-data.json → 需要创建

**关键模板代码**（从配置生成）：

```typescript
// AUTO-GENERATED from test-data.config.json — do not edit manually
// Regenerate with: test-data-setup skill

import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const AUTH_FILE = 'playwright/.auth/user.json';
const SIGN_IN_PATH = '{config.routes.signIn}';
const TEST_DATA_PATH = path.join(__dirname, '..', '..', '{config.cache.path}');
const DATA_MAX_AGE_MS = {config.cache.ttlMs};

// ── Helpers (from config) ──

function readTestData(): Record<string, string> {
  try {
    if (!fs.existsSync(TEST_DATA_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(TEST_DATA_PATH, 'utf-8'));
    if (raw._createdAt && Date.now() - raw._createdAt > DATA_MAX_AGE_MS) {
      console.log('[data-setup] Cached data expired, will recreate');
      return {};
    }
    return raw;
  } catch { return {}; }
}

function writeTestData(data: Record<string, string>) { /* ... */ }
function needsCreation(key, envVar, cached): boolean { /* ... */ }

// reAuthenticate uses config.routes.signIn, config.selectors.*
async function reAuthenticate(page) { /* generated from config.selectors */ }

// createTask uses config.routes.taskCreation, config.selectors.*, config.clarificationHandler
async function createTask(page, prompt, waitPattern, fallbackFill) { /* generated from config */ }

setup('create test data', async ({ browser }) => {
  const cached = readTestData();
  const results = { ...cached };
  const tasks = [];

  // For each fixture in config.fixtures:
  // if (needsCreation(fixture.name, fixture.env, cached)) {
  //   tasks.push({ key: fixture.name, promise: createTaskInContext(...) })
  // }

  const settled = await Promise.allSettled(tasks.map(t => t.promise));
  // collect results...
  writeTestData(results);
});
```

### 2. fixtures.ts 数据 fixture 生成

在 fixtures.ts 中为每个 config fixture 生成对应的 worker-scope fixture：

**规则**：
- 每个 fixture 遵循 3 级回退模式（env → readTestData → UI 创建）
- `scope: 'worker'`，使用 `{ browser }` 而非 `{ page }`
- timeout 取自配置
- UI 创建逻辑作为 fallback，使用 config 中的 prompt/selectors
- `try/finally` 确保 context 关闭

**生成的 TypeScript 类型**：

```typescript
type TestDataFixtures = {
  // For each fixture in config:
  // {fixture.name}: string;
};
```

### 3. Fixture Registry 同步

生成后自动更新 `.claude/references/test-data-setup.md` 中的 Fixture Registry 表格，
确保 fixtureId、name、env var、description、timeout 与 config 一致。

---

## Fixture Registry 校验

### 校验时机

1. **生成时**（本 Skill）：config → 代码，自动对齐
2. **用例生成时**（test-case-generator）：handoff 中的 `setup[].fixtureId` 必须存在于 config.fixtures 的 key 列表
3. **脚本生成时**（playwright-script-generator）：将 fixtureId 映射到 fixture name，未知 ID 报错

### 校验规则

```
VALID_FIXTURE_IDS = Object.keys(config.fixtures)
// e.g., ["code-gen", "file-gen", "people-data", "tool-chain", "share"]

if (handoff.setup[].fixtureId NOT IN VALID_FIXTURE_IDS) {
  ERROR: "Unknown fixtureId: {id}. Valid IDs: {VALID_FIXTURE_IDS.join(', ')}"
}
```

详细校验规则见 `references/fixture-registry.md`。

---

## 新项目接入流程

1. 在项目根目录创建 `test-data.config.json`（参考上方 schema）
2. 至少声明 1 个 fixture
3. 运行任意 `/qa-*` 命令 → Phase 0 调用本 Skill → 自动生成 data.setup.ts + fixtures.ts 中的数据 fixture
4. 首次执行测试 → data-setup 并行创建所有前置数据 → 后续运行直接使用缓存

## CRUD 操作速查

| 操作 | 做什么 | 影响范围 |
|------|--------|----------|
| **新增 fixture** | 在 config 中添加条目 → 重新生成 | data.setup.ts + fixtures.ts + Fixture Registry |
| **修改 prompt/selector** | 修改 config → 重新生成 → 删除 .test-data.json | data.setup.ts + fixtures.ts |
| **删除 fixture** | 从 config 移除 → 重新生成 → grep 确认无引用 | data.setup.ts + fixtures.ts + Fixture Registry |
| **切换环境** | 改 PREVIEW_URL → 删 .test-data.json | 缓存重建 |

---

## 抽象模式（路径 B → A）

> 适用于探索期：用例已经生成并运行过，spec 中有 inline 数据创建（beforeAll / UI setup），
> 需要识别重复模式并抽象为共享 fixture。

### 触发条件

以下任一条件满足即可触发：

- **冷启动**：项目无 `test-data.config.json`，或 config 中 fixtures 为空
- **增量发现**：config 已有 fixture，但 spec 中存在**未被已有 fixture 覆盖**的 inline 数据创建
- **手动触发**：用户主动要求"扫描一下有没有可以抽象的数据"

### 执行步骤

#### Step 1: 扫描已有 spec 中的 inline 数据创建

```
扫描范围: $QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts
识别模式:
  - test.beforeAll / beforeAll 中的 page.goto + fill + click 序列
  - test.beforeEach 中的数据创建
  - describe.serial 包裹的创建→验证链
排除（已覆盖）:
  - 已使用 fixture 解构的 spec（如 async ({ page, taskWithCodeUrl })）
  - fixture 参数名匹配 config 中已有的 fixture.name → 已被 Registry 覆盖，跳过
```

提取每个 inline 创建的关键特征：
```
{
  specFile: "task-sidebar.test.ts",
  prompt: "用 Python 写一个快速排序算法",
  route: "/task",
  waitPattern: /任务已完成|Task completed/,
  resultType: "code"  // 推断：代码、文件、人才数据、搜索等
}
```

**增量模式额外检查**：将提取结果与 config.fixtures 对比：
```
已有 fixture 的 prompt/resultType → 标记为"已覆盖"
未匹配任何已有 fixture → 标记为"新发现"，进入 Step 2
```

#### Step 2: 聚类分析

对 Step 1 中"新发现"的 inline 创建，按 `route + resultType` 聚类：

```
聚类结果示例（增量场景）:
  已有: code-gen, file-gen, people-data（config 中已有，跳过）
  新发现 cluster-1: 2 个 spec 都创建了"图表任务" → 建议抽为 chart-gen fixture
  新发现 cluster-2: 1 个 spec 创建了特殊数据 → 保持 inline（复用度低）
```

**规则**：
- 被 ≥2 个 spec 使用的同类数据 → 建议抽为 fixture
- 仅 1 个 spec 使用 → 保持 inline，不抽象
- 数据可服务于多种场景（查询、下载、查看、修改、删除）→ 优先抽象
- **与已有 fixture 功能重叠** → 建议复用已有 fixture 而非新增

#### Step 3: 输出建议报告

```markdown
## 前置数据抽象建议

### 建议抽为 Fixture（≥2 spec 复用）

| 建议 fixtureId | 当前 inline spec | prompt 摘要 | 可覆盖场景 |
|---|---|---|---|
| `code-gen` | task-sidebar.test.ts, ai-elements.test.ts, canvas-preview.test.ts | 代码生成类任务 | 代码预览、AI 对话、Canvas 查看 |
| `file-gen` | file-preview.test.ts, download.test.ts | 文件生成类任务 | 文件预览、下载、列表 |

### 保持 Inline（仅 1 spec 使用）

| spec | 原因 |
|---|---|
| special-flow.test.ts | 仅此用例需要特殊输入，无复用价值 |
```

#### Step 4: 用户确认后执行

用户确认建议后：

1. **生成/更新 `test-data.config.json`**：
   - **冷启动**：创建新 config，写入所有建议的 fixture
   - **增量**：读取已有 config，仅追加新 fixture 条目，不动已有条目
2. **重新生成 data.setup.ts + fixtures.ts**：调用本 Skill 的生成模式（从完整 config 生成）
3. **重构受影响的 spec**（仅修改包含 inline 创建的 spec，不动已使用 fixture 的 spec）：
   - 移除 `beforeAll` 中的数据创建逻辑
   - 移除 `describe.serial` 包裹（不再需要）
   - 将 test 函数参数添加 fixture 解构：`async ({ page }) =>` → `async ({ page, taskWithCodeUrl }) =>`
   - 导航改为使用 fixture URL：`await page.goto(taskWithCodeUrl)`
4. **验证**：`npx playwright test --list` 确认 spec 正常加载

### 安全规则

- **不自动执行**：扫描和聚类自动完成，但重构必须经用户确认
- **不删除 spec**：只修改 beforeAll → fixture 解构，测试逻辑不变
- **渐进式**：可以先抽象一部分，观察效果后再继续
- **可回退**：重构后如果测试失败，恢复 beforeAll 即可（git revert）

---

## Reference Files

- `references/fixture-registry.md` — Fixture Registry 校验规则、fixtureId ↔ fixture name 映射、handoff 集成规范
