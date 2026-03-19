# QA Platform Plugin

基于 Claude Code 的 QA 自动化测试插件。一次开发，多项目复用。

## 功能

- **页面探查** — 通过 Chrome CDP 自动探查页面，生成测试基线 + 用例 + 脚本
- **Issue 驱动** — 从 Linear Issue 自动生成针对性 E2E 测试
- **PRD 驱动** — 从需求文档批量生成完整测试套件
- **一键执行** — 运行已有测试，自动汇总报告
- **CI 监控** — 轮询 GitHub PR，自动触发增量测试
- **Bug 上报** — 失败用例自动去重后上报 Linear

## 快速开始

### 1. 安装

```bash
# 在目标项目根目录运行
bash /path/to/qa-platform-plugin/scripts/install.sh
```

### 2. 配置

编辑 `.env`：

```bash
QA_WORKSPACE_DIR=D:/code/your-project
TARGET_GITHUB_URL=https://github.com/your-org/your-repo
TARGET_BRANCH=main
PREVIEW_URL=https://preview.your-domain.com
GITHUB_TOKEN=ghp_xxx
LINEAR_API_KEY=lin_api_xxx
LINEAR_PROJECT_ID=xxx
LINEAR_TEAM_ID=xxx
```

### 3. 使用

| 命令 | 用途 |
|------|------|
| `/qa-explore` | 探查浏览器当前页面，生成测试 |
| `/qa-from-issue STE-9` | 从 Linear Issue 生成测试 |
| `/qa-run-prd` | PRD 驱动测试流水线 |
| `/qa-run-all` | 执行已有测试 + 报告 |

## 架构

```
命令层（输入准备 + 并行启动 Agent）
  │
  ├─ e2e-orchestrator (sonnet)  ── 生成层
  │   去重 → 用例 → Excel → spec
  │
  ├─ test-executor (haiku)      ── 执行层
  │   接收 spec → 执行测试 → 产出报告
  │
  └─ report-analyzer (haiku)    ── 报告层
      监听报告 → 分析 → bug-reporter → Linear
```

三个 Agent 并行运行，各自独立：生成完 → 执行 → 报告，流水线自动衔接。

详细架构见 [docs/architecture.md](docs/architecture.md)。

## 项目结构

```
qa-platform-plugin/
├── .claude/commands/     5 个 Slash Command
├── agents/               4 个 Agent + 1 暂停
│   ├── e2e-orchestrator    生成引擎 (sonnet)
│   ├── test-executor       测试执行器 (haiku)
│   ├── report-analyzer     报告分析 (haiku)
│   └── bug-reporter        Bug 上报 (haiku)
├── skills/               4 个 Skill
│   ├── test-case-generator       用例生成
│   ├── excel-case-export         Excel 导出
│   ├── playwright-script-generator  脚本生成
│   └── linear-bug-report         Linear 上报
├── hooks/                3 个 Hook
│   ├── session-start.sh    校验 + 同步 + 变更检测 + 路由
│   └── post-notify.sh     通知
├── scripts/              安装脚本
├── mcp-templates/        MCP 配置模板
├── project-template/     新项目接入模板
└── docs/                 架构文档
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

## 产出物

测试执行后在目标项目中生成：

```
test-cases/generated/*.md           用例文档
test-cases/excel/*.xlsx             Excel 表格
tests/e2e/pages/*.ts                Page Object
tests/e2e/testcases/generated/*.test.ts  Playwright spec
tests/reports/combined/summary.md   汇总报告
playwright-report/index.html        HTML 报告
```

## License

MIT
