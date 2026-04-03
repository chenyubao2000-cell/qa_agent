# QA 自动化测试平台

基于 Claude Code 的 QA 自动化测试平台。通用 QA 能力集中管理，多项目复用。

## 功能

- **页面探查** — 通过 Chrome CDP 自动探查页面，生成测试基线 + 用例 + 脚本
- **Issue 驱动** — 从 Linear Issue 自动生成针对性 E2E 测试（支持单个和批量）
- **PRD 驱动** — 从需求文档批量生成完整测试套件
- **仅生成用例** — 只生成测试用例文档 + Excel，不生成脚本
- **一键执行** — 运行已有测试，自动汇总报告，上报 Linear
- **测试修复** — 通过 CDP 探查真实页面，自动修复失败的测试
- **CI 监控** — 轮询 GitHub PR，自动触发增量测试

## 快速开始

### 1. 配置

编辑 `.env`：

```bash
QA_WORKSPACE_DIR=D:/code/your-project
SOURCE_PROJECT_DIR=D:/code/your-source
PLAYWRIGHT_BASE_URL=https://preview.your-domain.com
TARGET_GITHUB_URL=https://github.com/your-org/your-repo
TARGET_BRANCH=main
GITHUB_TOKEN=ghp_xxx
LINEAR_API_KEY=lin_api_xxx
LINEAR_PROJECT_ID=xxx
LINEAR_TEAM_ID=xxx
E2E_TEST_EMAIL=test@example.com
E2E_TEST_PASSWORD=xxx

# Multi-language testing (optional)
# APP_LANGUAGES=en,zh
# I18N_MESSAGES_DIR=/path/to/source/i18n/messages
```

### 2. 命令

| 命令 | 用途 | 生成 | 执行 | 报告 |
|------|------|:----:|:----:|:----:|
| `/qa-explore [url]` | 探查页面，生成 E2E 测试 | 是 | via fix-tests | 否 |
| `/qa-from-issue STE-9` | 从 Linear Issue 生成测试 | 是 | via fix-tests | 是 |
| `/qa-run-prd [路径]` | 从 PRD 文档生成测试 | 是 | via fix-tests | 否 |
| `/qa-gen-cases [路径]` | 仅生成用例 + Excel | 仅用例 | 否 | 否 |
| `/qa-run` | 执行已有测试 | 否 | 是 | 是 |
| `/qa-fix-tests` | 修复失败的测试 (--from-prd, --upgrade-i18n) | 仅修复 | 是 | 否 |

### 3. CI 监控

```bash
npx tsx scripts/git-watcher.ts
```

轮询 GitHub PR → 检测代码推送 → 触发 `/qa-from-issue` 或 `/qa-run` → 在 PR 上评论测试结果。

## 架构

```
入口层
  ├── /qa-explore        CDP 页面 → 串行探查 → 跨区域流程发现 → 并行生成 → /qa-fix-tests
  ├── /qa-from-issue     Linear Issue → CDP 定向探查 → 并行生成 → /qa-fix-tests → 报告
  ├── /qa-run-prd        PRD 文档 → 并行生成 → /qa-fix-tests
  ├── /qa-gen-cases      PRD 文档 → 生成用例 + Excel（不生成脚本，不执行）
  ├── /qa-run        执行已有 spec → 报告（不生成）
  ├── /qa-fix-tests      CDP 探查 → 修复 locator/断言 → 执行验证（3 modes: normal, --from-prd, --upgrade-i18n）
  └── git-watcher        轮询 PR → 路由到 /qa-from-issue 或 /qa-run

生成层 → 修复层 → 报告层
  e2e-orchestrator (sonnet) → /qa-fix-tests (CDP verify + fix + execute) → report-analyzer (haiku)
       ↓ 读取                      ↓ CDP + test-executor (haiku)            ↓ 分析 + bug-reporter
  Skill 层                    cdp-explorer + playwright-script-gen       Linear API
  ├── cdp-explorer
  ├── test-case-generator
  ├── excel-case-export
  └── playwright-script-generator

i18n: APP_LANGUAGES → per-language Playwright projects → fixtures i18n → one spec tests all languages
```

**核心设计原则：**
- **CDP 操作串行**（一个浏览器）— 探查、locator 验证
- **AI 生成并行**（不需要浏览器）— 多区域/多模块的 orchestrator 同时运行
- **子 Agent 上下文隔离** — 每次 CDP 探查在独立子 Agent 中执行；原始 DOM 数据（~50-100K tokens）留在子 Agent 内，仅 ~100 tokens 摘要返回主上下文
- **Fragment 合并** — 并行生成时各 orchestrator 写 POM 片段文件，全部完成后合并（避免写冲突）
- **失败分类** — qa-fix-tests 区分"测试问题"和"应用 Bug"；Bug 不修测试而是上报 Linear
- **断言质量验证** — 生成 spec 后自动检测弱断言（纯 `toBeVisible()`），强制补充业务语义校验
- **6 种设计方法强制执行** — 用例生成后验证 6 种方法的覆盖率，不足 3 种则阻塞流水线
- **增量更新** — PRD 通过 content hash 检测变更；CDP 探查通过页面指纹检测 UI 变化；只更新变化部分
- **Multi-language** — one spec tests all languages via i18n fixture; APP_LANGUAGES controls project matrix
- **Unified fix delegation** — all CDP verification centralized in /qa-fix-tests; no entry point does its own locator verify or test-executor call
- **Timeout enforcement** — auto-detected from handoff keywords; validated post-generation

详细架构见 [docs/architecture.md](docs/architecture.md)。

## 项目结构

```
qa-platform/
├── .claude/commands/     6 个 Slash Command
│   ├── qa-explore          页面探查 → E2E 测试
│   ├── qa-from-issue       Issue 驱动测试
│   ├── qa-run-prd          PRD 驱动流水线
│   ├── qa-gen-cases        仅生成用例
│   ├── qa-run          执行 + 报告
│   └── qa-fix-tests        修复失败测试
├── agents/               4 个 Agent
│   ├── e2e-orchestrator    生成引擎 (sonnet)
│   ├── test-executor       测试执行器 (haiku)
│   ├── report-analyzer     报告分析 (haiku)
│   └── bug-reporter        Bug 上报 (haiku)
├── skills/               4 个 Skill
│   ├── cdp-explorer              CDP 页面探查
│   ├── test-case-generator       用例设计（6 种方法）
│   ├── excel-case-export         Excel 导出
│   └── playwright-script-generator  Playwright 脚本生成
├── scripts/
│   └── git-watcher.ts      PR 监控守护进程
├── hooks/                会话钩子
└── docs/                 架构文档
```

## 产出物

测试执行后在目标项目中生成：

```
$QA_WORKSPACE_DIR/
├── test-cases/
│   ├── generated/*.md                          用例文档
│   ├── generated/page-baseline-*.json          CDP 探查基线
│   ├── generated/playwright-handoff-*.json     Playwright 移交文件
│   └── excel/*.xlsx                            Excel 表格
├── tests/e2e/
│   ├── pages/*.ts                              Page Object
│   └── testcases/generated/*.test.ts           Playwright spec
├── tests/reports/
│   ├── playwright-results.json                 JSON 报告
│   └── combined/summary.md                     汇总报告
├── messages/                                   i18n message files (copied from source)
└── playwright-report/index.html                HTML 报告
```

## 前置条件

- [Claude Code](https://claude.ai/code) CLI
- Node.js 18+
- Chrome 浏览器（CDP 探查需要）
- [chrome-devtools MCP server](https://github.com/anthropics/chrome-devtools-mcp)
- GitHub Token + Linear API Key

## 依赖

- `@playwright/test` — E2E 测试执行
- `exceljs` — Excel 用例导出
- `chrome-devtools MCP` — 页面探查与 locator 校验

## License

MIT
