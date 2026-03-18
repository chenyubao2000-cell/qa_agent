# QA Platform Plugin — 系统架构文档

## 1. 概述

QA Platform 是一个基于 Claude Code 的 QA 自动化测试插件。通过 Command + Agent + Skill 三层架构，将测试用例生成、脚本编写、执行和 Bug 上报全流程自动化。

**设计目标：**
- 一次开发，多项目复用
- 输入源灵活（CDP 页面探查 / Linear Issue / PRD 文档）
- 三层并行：生成层 | 执行层 | 报告层
- 支持增量检测和去重，避免重复生成

---

## 2. 三层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    命令层 (Commands)                          │
│         用户入口，负责输入准备 + 并行启动 Agent                 │
├──────────┬──────────┬──────────┬──────────┤
│qa-explore│qa-from-  │qa-run-   │qa-run-   │
│          │issue     │prd       │all       │
│ CDP 探查 │ Linear   │ PRD 文档 │ 直接执行 │
└────┬─────┴────┬─────┴────┬─────┴────┬────┘
     │          │          │          │
     ▼          ▼          ▼          │
┌──────────────────────────────┐      │   ┌───────────────────┐
│  生成层                       │      │   │ 自动分发           │
│  e2e-orchestrator (sonnet)   │      │   │ ├ PRD 变更→prd    │
│  ├ 去重检查                   │      │   │ ├ 有 issue→issue  │
│  ├ test-case-generator skill │      │   │ ├ 都有→合并模式    │
│  ├ excel-case-export skill   │      │   │ └ 其他→qa-run-all │
│  └ playwright-script-generator│      │   └───────────────────┘
└──────────────┬───────────────┘      │
               │ spec 文件             │
               ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│  执行层                                                      │
│  test-executor (haiku)                                       │
│  接收上游 spec → 执行测试 → 产出 JSON + HTML 报告              │
└──────────────────────────┬──────────────────────────────────┘
                           │ 报告文件
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  报告层                                                      │
│  report-analyzer (haiku) ← 并行监听报告目录                    │
│  └ bug-reporter (haiku)                                      │
│      └ linear-bug-report skill → Linear Issue                │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 命令层

| 命令 | 输入源 | 走 e2e-orchestrator | 说明 |
|------|--------|:-------------------:|------|
| `/qa-explore` | CDP 页面 | 是 (source: "cdp") | 探查浏览器页面，端到端生成 |
| `/qa-from-issue` | Linear Issue | 是 (source: "issue") | 从 Bug/需求 issue 出发 |
| `/qa-run-prd` | PRD 文档 | 是 (source: "prd") | 需求文档驱动 |
| `/qa-run-all` | 已有 spec | 否 | 只执行 + 报告，不生成 |

### 2.2 Agent 层

| Agent | 模型 | 层 | 职责 |
|-------|------|-----|------|
| e2e-orchestrator | sonnet | 生成层 | 去重 → 用例 → Excel → spec |
| test-executor | haiku | 执行层 | 接收 spec → 执行测试 → 产出报告 |
| report-analyzer | haiku | 报告层 | 并行监听报告 → 分析 → 触发上报 |
| bug-reporter | haiku | 报告层 | 格式化 Issue → 调用 Linear API |

**并行协同：** 三个 Agent 由命令层同时启动，各自独立运行：
- e2e-orchestrator 生成完 spec → test-executor 拾取执行
- test-executor 产出报告 → report-analyzer 拾取分析
- report-analyzer 不等所有测试完成，谁先产出报告就先处理

### 2.3 Skill 层

Skill 只在项目级维护（`skills/` 目录），Agent 通过 `Read` 工具读取 SKILL.md 后执行。

| Skill | 调用者 | 输入 | 输出 |
|-------|--------|------|------|
| test-case-generator | e2e-orchestrator | PRD / CDP baseline / Issue | 用例 .md + handoff.json |
| excel-case-export | e2e-orchestrator | 用例 .md | Excel .xlsx |
| playwright-script-generator | e2e-orchestrator | handoff.json | POM + spec .test.ts |
| linear-bug-report | bug-reporter | 失败用例列表 | Linear Issue（去重后） |

---

## 3. 流水线

### 3.1 标准流水线（qa-explore / qa-from-issue / qa-run-prd）

```
命令层并行启动 3 个 Agent：
  │
  ├─ e2e-orchestrator (sonnet) ── 生成层
  │   ├─ 步骤 1: 确定输入 (cdp / issue / prd)
  │   ├─ 步骤 2: 去重检查
  │   ├─ 步骤 3: test-case-generator skill → 用例 .md
  │   ├─ 步骤 4: excel-case-export skill → Excel
  │   └─ 步骤 5: playwright-script-generator skill → POM + spec
  │
  ├─ test-executor (haiku) ── 执行层
  │   └─ 接收 spec → 执行测试 → 产出 JSON + HTML 报告
  │
  └─ report-analyzer (haiku) ── 报告层
      └─ 监听报告 → 分析 → bug-reporter → Linear 上报 → 汇总报告
```

### 3.2 纯执行流水线（qa-run-all）

```
命令层并行启动 2 个 Agent：
  │
  ├─ test-executor (haiku) ── 直接执行已有 spec（跳过生成层）
  │
  └─ report-analyzer (haiku) ── 监听报告
```

---

## 4. 去重机制（三层防御）

| 层 | 执行者 | 检查内容 |
|----|--------|---------|
| 主入口 | e2e-orchestrator 步骤 2 | 扫描已有 .md + .test.ts，决定跳过/补充/新建 |
| 兜底 1 | test-case-generator skill | 生成前再检查已有用例编号 |
| 兜底 2 | playwright-script-generator skill | 生成 spec 前再检查已有 spec + POM |
| 上报去重 | linear-bug-report skill | 搜索 Linear 已有同名 Open Issue |

---

## 5. Hook 机制

| 触发时机 | Hook | 功能 |
|----------|------|------|
| SessionStart | session-start.sh | 校验 .env → 同步代码 → 检测变更 → 分析 PR/Issue → 输出路由 JSON |
| Stop | post-notify.sh | 会话结束 Slack 通知 |

### session-start.sh 逻辑

```
1. 校验 .env 必要配置
2. git fetch + pull 目标项目
3. 对比上次记录的 HEAD，检测新提交
4. 有新提交时：
   ├─ 提取 changelist（变更文件列表）
   ├─ 从 git log 提取 PR 编号
   ├─ 通过 gh CLI 获取 PR 详情
   └─ 从 PR 标题/描述提取 Linear issue ID
5. 输出 JSON（hasNewCommits, changedFiles, linearIssues, route）
   ├─ route: "qa-from-issue" — 有关联 issue，带 changelist 上下文
   └─ route: "qa-run-all" — 无 issue，执行已有测试
```

---

## 6. 产出物路径

```
$TARGET_PROJECT_DIR/
├── test-cases/
│   ├── generated/*.md                    ← 用例文档
│   ├── generated/playwright-handoff-*.json ← Playwright 移交
│   ├── generated/page-baseline-*.json    ← CDP 页面基线
│   └── excel/*.xlsx                      ← Excel 表格
├── tests/
│   ├── e2e/
│   │   ├── pages/*.ts                    ← Page Object
│   │   └── testcases/generated/*.test.ts ← Playwright spec
│   └── reports/
│       ├── playwright-results.json       ← JSON 报告
│       └── combined/summary.md           ← 汇总报告
└── playwright-report/index.html          ← HTML 报告
```

---

## 7. 模型分级

| Agent | 模型 | 原因 |
|-------|------|------|
| e2e-orchestrator | sonnet | 代码生成需要强能力，性价比最优 |
| test-executor | haiku | 确定性操作（执行 bash 命令） |
| report-analyzer | haiku | 模板填充 + API 调用 |
| bug-reporter | haiku | 格式化 + API 调用 |

---

## 8. 扩展设计

### 单元测试（暂停，预留）

```
agents/unit-test-orchestrator.md    ← 暂停
skills/vitest-testing/SKILL.md      ← 暂停
.claude/commands/qa-run-unit.md     ← 暂停
```

### 新项目接入

```bash
bash scripts/install.sh    # 在目标项目根目录运行
```

自动完成：
1. 复制 `.env.example` → 目标项目 `.env`
2. 复制 `CLAUDE.md.template` → 目标项目 `CLAUDE.md`
3. 复制 `mcp.json.template` → 目标项目 `.claude/mcp.json`
