# QA Platform Plugin — 系统架构文档

## 1. 概述

QA Platform 是一个基于 Claude Code 的 QA 自动化测试插件。通过 Slash Command + Agent + Skill 三层架构，将测试用例生成、脚本编写、执行和 Bug 上报全流程自动化。

**设计目标：**
- 一次开发，多项目复用
- 输入源灵活（CDP 页面探查 / Linear Issue / PRD 文档）
- 统一流水线，减少重复逻辑
- 支持增量检测，避免重复生成

---

## 2. 三层架构

```
┌─────────────────────────────────────────────────────────┐
│                   命令层 (Commands)                       │
│        用户入口，负责输入准备，不包含业务逻辑               │
├──────────┬──────────┬──────────┬──────────┬──────────────┤
│qa-explore│qa-from-  │qa-run-   │qa-run-   │  qa-watch    │
│          │issue     │prd       │all       │              │
│ CDP 探查 │ Linear   │ PRD 文档 │ 直接执行 │ CI 轮询 PR   │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴──────┬──────┘
     │          │          │          │            │
     ▼          ▼          ▼          │            ▼
┌────────────────────────────────┐    │   ┌────────────────┐
│    Agent 层 (Agents)           │    │   │  自动分发       │
│                                │    │   │  ├ PRD 变更     │
│  e2e-orchestrator (sonnet)     │    │   │  │ → prd 模式   │
│  ├ 步骤 1: 确定输入            │    │   │  ├ 有 issue     │
│  ├ 步骤 2: 去重检查            │    │   │  │ → issue 模式 │
│  ├ 步骤 3: test-case-generator │    │   │  └ 其他         │
│  ├ 步骤 4: excel-case-export   │    │   │    → qa-run-all │
│  ├ 步骤 5: playwright-e2e      │    │   └────────────────┘
│  └ 步骤 6: 执行测试            │    │
└──────────────┬─────────────────┘    │
               │ 返回 JSON 报告       │
               ▼                      ▼
┌─────────────────────────────────────────────────────────┐
│  report-analyzer (haiku) ← 命令层调用，支持多测试类型     │
│  └ bug-reporter (haiku)                                  │
│      └ linear-bug-report skill                           │
└─────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│                   Skill 层 (Skills)                      │
│             业务规范定义，Agent 读取后执行                  │
├──────────────┬───────────────┬──────────┬────────────────┤
│test-case-    │excel-case-    │playwright│linear-bug-     │
│generator     │export         │-e2e      │report          │
│用例生成      │Markdown→Excel │POM+spec  │Issue 格式+去重 │
└──────────────┴───────────────┴──────────┴────────────────┘
```

### 2.1 命令层

| 命令 | 输入源 | 走 e2e-orchestrator | 说明 |
|------|--------|--------------------:|------|
| `/qa-explore` | CDP 页面 | 是 (source: "cdp") | 探查浏览器页面，端到端生成 |
| `/qa-from-issue` | Linear Issue | 是 (source: "issue") | 从 Bug/需求 issue 出发 |
| `/qa-run-prd` | PRD 文档 | 是 (source: "prd") | 需求文档驱动 |
| `/qa-run-all` | 已有 spec | 否 | 只执行 + 报告，不生成 |
| `/qa-watch` | GitHub PR | 按 diff 分发 | CI 持续监控 |

### 2.2 Agent 层

| Agent | 模型 | 职责 |
|-------|------|------|
| e2e-orchestrator | sonnet | 生成 + 执行引擎：去重 → 用例 → Excel → spec → 执行 |
| report-analyzer | haiku | 解析测试报告，触发上报（跨测试类型） |
| bug-reporter | haiku | 格式化 Issue，调用 Linear API |

**调用链：** `report-analyzer → bug-reporter → linear-bug-report skill`

report-analyzer 留在命令层调用（不在 e2e-orchestrator 内），因为它需要汇总多种测试类型的报告（E2E + 将来的 Unit）。

### 2.3 Skill 层

| Skill | 输入 | 输出 |
|-------|------|------|
| test-case-generator | PRD / CDP baseline / Issue | 用例 .md + handoff.json |
| excel-case-export | 用例 .md | Excel .xlsx |
| playwright-e2e | handoff.json | Page Object + spec .test.ts |
| linear-bug-report | 失败用例列表 | Linear Issue（去重后） |

---

## 3. 统一流水线

```
输入准备（命令层各自完成）
     │
     ▼
e2e-orchestrator
     │
     ├─ 步骤 1: 确定输入 (cdp / issue / prd)
     ├─ 步骤 2: 去重检查（扫描已有 .md + .test.ts + POM）
     ├─ 步骤 3: test-case-generator skill → 用例 .md
     ├─ 步骤 4: excel-case-export skill → Excel .xlsx
     ├─ 步骤 5: playwright-e2e skill → POM + spec
     └─ 步骤 6: 执行测试 → JSON + HTML 报告
     │
     ▼ 返回命令层
report-analyzer (haiku)
     └─ bug-reporter (haiku)
         └─ linear-bug-report skill → Linear Issue

/qa-run-all 例外：跳过 e2e-orchestrator，直接执行已有 spec → report-analyzer
```

---

## 4. 去重机制（三层防御）

| 层 | 执行者 | 检查内容 |
|----|--------|---------|
| 主入口 | e2e-orchestrator 步骤 2 | 扫描已有 .md + .test.ts，决定跳过/补充/新建 |
| 兜底 1 | test-case-generator skill | 生成前再检查已有用例编号 |
| 兜底 2 | playwright-e2e skill | 生成 spec 前再检查已有 spec + POM |
| 上报去重 | linear-bug-report skill | 搜索 Linear 已有同名 Open Issue |

---

## 5. Hook 机制

| 触发时机 | Hook | 功能 |
|----------|------|------|
| SessionStart | validate-env.sh | 检查 .env 配置完整性 |
| SessionStart | git-sync.sh | 自动 clone/pull 目标项目代码 |
| PostToolUse:Write | post-write-lint.sh | 写入文件后自动 lint |
| Stop | post-notify.sh | 会话结束通知 |

### git-sync.sh 逻辑

```
目标目录不存在 → 自动 clone（从 TARGET_GITHUB_URL）
目标目录存在：
  ├─ 已最新 → 跳过
  ├─ 落后远程 → 自动 pull
  ├─ 有未推送提交 → 跳过，提醒手动处理
  └─ 网络不通 → 跳过
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

| 角色 | 模型 | 原因 |
|------|------|------|
| e2e-orchestrator | sonnet | 代码生成需要强能力，性价比最优 |
| report-analyzer | haiku | 模板填充 + API 调用，不需要强推理 |
| bug-reporter | haiku | 格式化 + API 调用 |

---

## 8. 扩展设计

### 单元测试（暂停，预留）

```
agents/unit-test-orchestrator.md    ← 暂停
skills/vitest-testing/SKILL.md      ← 暂停
.claude/commands/qa-run-unit.md     ← 暂停
```

启用后 report-analyzer 可同时汇总 E2E + Unit 报告，这也是它留在命令层（而非 e2e-orchestrator 内部）的原因。

### 新项目接入

```bash
bash scripts/install.sh    # 在目标项目根目录运行
```

自动完成：
1. 复制 `.env.example` → 目标项目 `.env`
2. 复制 `CLAUDE.md.template` → 目标项目 `CLAUDE.md`
3. 复制 `mcp.json.template` → 目标项目 `.claude/mcp.json`
