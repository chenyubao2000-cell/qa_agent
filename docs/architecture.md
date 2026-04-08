# QA 平台插件 — 系统架构文档

## 术语表

| 术语 | 定义 | 备注 |
|------|------|------|
| Locator | Playwright 定位器（`getByRole`, `getByText`, `page.locator()`）| 本项目统一用 locator |
| Selector | CSS 选择器字符串（`button[title="X"]`, `.class-name`）| 是 locator 的一种输入 |
| POM | Page Object Model，页面对象 | 文件后缀 `.page.ts` |
| Handoff | 用例→脚本的移交文件（JSON）| 1:1 映射 TC |
| Baseline | CDP 探查产出的页面状态图（JSON）| 含 states + stateGraph |
| TC | Test Case，测试用例 | ID 格式 `TC-{source}-{module}-{seq}` |
| Spec | Playwright 测试脚本 | 文件后缀 `.test.ts` |

## 1. 概述

QA 平台是基于 Claude Code 的 QA 自动化测试插件。通过 Command → Agent → Skill 三层架构，将测试用例设计、脚本编写、执行和 Bug 上报全流程自动化。

**设计目标：**
- 一次开发，多项目复用
- 输入源灵活（CDP 页面探查 / Linear Issue / PRD 文档 / 已有 spec）
- CDP 串行 + AI 并行流水线，最大化吞吐
- 子 Agent 上下文隔离，防止上下文爆炸
- 增量探查 + 中断恢复

---

## 2. 入口层（7 个入口）

| 入口 | 触发方式 | 生成 | 执行 | 报告 | CDP |
|------|---------|:----:|:----:|:----:|:---:|
| `/qa-explore` | 用户命令 | 是 | via fix-tests | 否（本地） | 全量扫描 |
| `/qa-from-issue` | 用户命令 / git-watcher | 是 | via fix-tests | 是 | 定向探查 |
| `/qa-run-prd` | 用户命令 | 是 | via fix-tests | 否 | 无（委托 fix-tests） |
| `/qa-gen-cases` | 用户命令 | 仅用例+Excel | 否 | 否 | 否 |
| `/qa-run` | 用户命令 / git-watcher | 否 | 是 | 是 | 否 |
| `/qa-fix-tests` | 用户命令 / 委托 | 仅修复 (3 modes: normal, --from-prd, --upgrade-i18n) | 是 | 否 | 验证+修复 |
| `git-watcher` | 守护进程（轮询 PR） | 路由到上述命令 | — | 评论 PR | Headless |

---

## 3. 三层架构

```
┌──────────────────────────────────────────────────────────────────┐
│                     Command Layer (Entry Points)                  │
├──────────┬───────────┬──────────┬──────────┬─────────┬───────────┤
│qa-explore│qa-from-   │qa-run-   │qa-gen-   │qa-run- │qa-fix-    │
│ CDP scan │issue      │prd       │cases     │all     │tests      │
└────┬─────┴────┬──────┴────┬─────┴────┬─────┴───┬────┴────┬──────┘
     │          │           │          │         │         │
     ▼          ▼           ▼          ▼         │         │
┌────────────────────────────────────────┐       │         │
│ Generation Layer                       │       │         │
│ e2e-orchestrator (sonnet)              │       │         │
│ ├ test-case-generator SKILL            │       │         │
│ ├ excel-case-export SKILL              │       │         │
│ └ playwright-script-generator SKILL    │       │         │
└────────────┬───────────────────────────┘       │         │
             │ all specs                          │         │
             ▼                                    │         │
┌─────────────────────────────────────────────────────────────┐
│ Fix Layer (CDP verify + fix + execute)                       │
│ /qa-fix-tests                                                │
│ ├ CDP explore (cdp-explorer SKILL)                           │
│ ├ Fix locators/assertions (playwright-script-generator SKILL)│
│ └ test-executor (sonnet) → regression                        │
└────────────┬────────────────────────────────────────────┬────┘
             │ (qa-from-issue + qa-run only)          │
             ▼                                             │
┌──────────────────────────────┐                           │
│ Report Layer                  │                           │
│ report-analyzer (sonnet)      │                           │
│ └ bug-reporter → Linear API  │                           │
└──────────────────────────────┘                           │
```

**哪些入口走报告层（Linear 上报）**：仅 `/qa-from-issue` 和 `/qa-run`。
其余入口（explore、run-prd、fix-tests）只产出本地报告，需要 Linear 上报时手动运行 `/qa-run`。

### 3.1 Agent 流水线

Agent 按**串行顺序**执行（非并行）：

```
e2e-orchestrator 完成 → test-executor 启动 → report-analyzer 启动
```

每个 Agent 在独立的子 Agent 中运行，上下文互相隔离。命令层负责编排顺序。

| Agent | 模型 | 职责 | 上下文 |
|-------|------|------|--------|
| e2e-orchestrator | opus | 去重 → 用例 → Excel → spec | 独立子 Agent |
| test-executor | sonnet | 执行 spec → 产出报告 | 独立子 Agent |
| report-analyzer | sonnet | 分析 → 路由 → Linear | 独立子 Agent |
| bug-reporter | sonnet | 格式化 → 创建/更新 Linear Issue | 独立子 Agent |

### 3.2 Skill 层

Skill 是 `.md` 规范文件。Agent 通过 `Read` 工具读取后按规范执行。

| Skill | 调用者 | 输入 | 输出 |
|-------|--------|------|------|
| cdp-explorer | 命令层（通过子 Agent） | 浏览器页面 + 模式 | page-baseline-{slug}.json |
| test-case-generator | e2e-orchestrator | PRD / CDP 基线 / Issue | 用例 .md + handoff .json |
| excel-case-export | e2e-orchestrator | 用例 .md | Excel .xlsx |
| playwright-script-generator | e2e-orchestrator | handoff .json | POM .ts + spec .test.ts |

---

## 4. 流水线详解

### 4.1 `/qa-explore` — 页面探查流水线

```
Phase 0: 读取 .env → 初始化工作区（目录、playwright、fixtures）
Phase 1: CDP 连接 → 登录墙处理 → State₀ 扫描 → 识别功能区域
Phase 2a: 串行 CDP 探查（每个区域一个子 Agent，顺序执行）
  区域1: CDP BFS 探查 → 写入 baseline → 返回摘要（~100 tokens）
  区域2: CDP BFS 探查 → 写入 baseline → 返回摘要
  ...（动态发现的区域追加并继续探查）
Phase 2a.5: 跨区域流程发现（BEFORE generation）
  主命令: 分析 baseline 中跨区域 edge（无需 CDP）
  CDP 子 Agent: 探查 1 跳导航目标（仅 State₀）
  orchestrator: 生成跨区域集成测试用例
Phase 2b: 并行用例生成（每个区域一个 orchestrator，同时启动）
  区域1: orchestrator → 用例 + POM fragment + spec  ←─┐
  区域2: orchestrator → 用例 + POM fragment + spec  ←─┤ 并行
  区域3: orchestrator → 用例 + POM fragment + spec  ←─┘
  → 主命令合并 POM fragment 为最终 POM 文件
Phase 3: 委托 /qa-fix-tests --from-prd（CDP verify + fix + execute）
  → 本地报告（不上报 Linear）
```

> qa-explore 不上报 Linear。正式上报 Linear 请用 `/qa-run`。

**上下文开销**：每个区域 ~700 tokens 进入主上下文（不用子 Agent 则是 ~100K）。

### 4.2 `/qa-from-issue` — Issue 驱动流水线

```
Phase 0: 读取 .env → 初始化工作区
Phase 1: 从 Linear 获取 issue → 提取 pageUrl/reproSteps/expected/actual
  → 判断模式: X（修复已有）/ A（补充）/ B（新建）
Phase 2: CDP 定向探查（子 Agent）
  → 围绕 issue 区域做定向 BFS
  → targetArea 找不到时降级为全量模式
Phase 3（模式 A/B）: 流水线并行生成
  串行 CDP 探查（按 pageUrl 分组）
  → 并行 orchestrator（按分组）
  → 构建 specToIssueMap
  → 委托 /qa-fix-tests --from-prd（CDP verify + fix + execute）
  → report-analyzer（失败路由回源 issue）
Phase 3（模式 X）: 修复子 Agent
  → CDP 探查 + 直接修复 spec/POM（绕过 orchestrator）
  → 委托 /qa-fix-tests
  → report-analyzer
```

**批量处理**：多个 issue 按 pageUrl 分组。CDP 按组串行，orchestrator 跨组并行。

### 4.3 `/qa-run-prd` — PRD 驱动流水线

```
Phase 0: 读取 .env → 初始化工作区
Phase 1: 读取 PRD → 按 ## 标题拆分模块 → PRD 变更检测（content hash 对比）
  → 每个模块判定: none（未变）/ new（新增）/ updated（变更）/ removed（删除）
Phase 2: 流水线并行生成
  none → 跳过
  removed → 标记已有 spec 为 deprecated（test.describe.skip）
  new/updated → 并行 orchestrator（每个模块一个，同时启动）
    → updated 模式: 增量更新（保留未变/修改变更/新增/废弃删除的用例）
    → data-testid conditional: Grep source code first; if no testid found, use getByRole
Phase 3: 委托 /qa-fix-tests --from-prd（CDP verify + fix + execute）
```

> qa-run-prd directly delegates to /qa-fix-tests after orchestrator generation. No CDP page-verify step of its own. 正式上报 Linear 请用 `/qa-run`。

**PRD 变更检测**：每个 .md 文件头部存储 `<!-- PRD-hash: {sha256} | PRD-module: {heading} | feature-slug: {slug} -->`，下次运行时对比 hash 判定变更类型。

### 4.4 `/qa-run` — 纯执行

```
Phase 0: 读取 .env（仅 QA_WORKSPACE_DIR，不做初始化）
Phase 1: 检查是否有 spec 文件
  → test-executor (sonnet) → 执行全量/指定 spec
  → report-analyzer (sonnet) → 分析 + 报告
```

可选的 git-watcher 上下文：changelist、changeSummary、prSourceDir、headless。

### 4.5 `/qa-gen-cases` — 仅生成用例

```
Phase 0: 读取 .env → 确定输出目录
Phase 1: 读取 PRD（.md 或 .docx） → PRD 变更检测（同 qa-run-prd 的 hash 机制）
  → none → 跳过 / updated → 增量更新 / new → 从零生成 / removed → 标记废弃
Phase 2: case-only-orchestrator → 用例 .md + Excel .xlsx
  → 不生成脚本、不生成 POM、不生成 handoff、不执行、不上报 Linear
```

### 4.6 `/qa-fix-tests` — 修复失败测试

3 modes:
- **normal**: standalone fix of existing failing tests
- **--from-prd**: called by generation commands (explore, from-issue, run-prd); skips baseline creation
- **--upgrade-i18n**: converts existing single-language specs to multi-language

```
Phase 0: 读取 .env
Phase 1: 查找非 skip 的 spec → 执行一轮 → 收集失败列表
  → --from-prd mode: skips baseline, uses specs passed from caller
  → --upgrade-i18n mode: scans all specs for hardcoded strings to convert
Phase 2: 逐文件修复（每个失败文件一个独立子 Agent）
  子 Agent 对每个失败先分类:
    TEST_ISSUE（locator 过期/选择器模糊）→ 修复测试
    POSSIBLE_BUG（功能真的坏了）→ 不修测试，记录为 Bug
    AMBIGUOUS（不确定）→ 深入调查后分类
  → fix subagent uses test-executor (sonnet) for verification runs
  → cross-file CDP sharing: fix agents share cdpFindings via fixContext
Phase 2.5: Bug 汇总（仅通知用户，不上报 Linear）
  如有 classification="bug" 的失败 → 通知用户，建议运行 /qa-run 正式上报
  → 这些测试保持原样（断言是正确的，应用有问题）
Phase 3: 回归已修复文件 → 汇总报告（分三类：修复的测试问题 / 发现的应用 Bug / 需人工审查）
```

**核心原则**：不为了让测试通过而改变正确的业务断言。如果按钮应该 enabled 但实际 disabled，测试断言 `toBeEnabled()` 是正确的——应该报 Bug，不该改断言。

### 4.7 `git-watcher` — CI 监控守护进程

```
每 20 秒轮询 GitHub PR（base: TARGET_BRANCH）
  → 检测: 新 PR / 代码推送 / 信息更新
  → 首次运行: 仅记录状态，不触发
  → 代码推送/新 PR:
    从 title+body 提取 Linear issue key
    获取变更文件列表 + 生成 diff 摘要（claude -p --model sonnet）
    创建 worktree（PR 全量代码副本）
    有 issue → /qa-from-issue {issues}
    无 issue → /qa-run
    注入 prompt: changelist、changeSummary、prSourceDir、_trigger: git-watcher_
    解析报告 → 在 PR 上评论（按 commit SHA 去重）
    命令执行+评论完成后保存状态（崩溃恢复: 下次重启会重新触发未完成的 PR）
```

---

## 5. 性能设计

### 5.1 CDP 串行 + AI 并行

| 操作 | 约束 | 执行方式 |
|------|------|---------|
| CDP 页面探查 | 一个浏览器，一个页面 | **串行**（每次一个子 Agent） |
| CDP Locator 验证 | 同上 | **串行** |
| AI 用例生成 | 不需要浏览器 | **并行**（N 个 orchestrator 同时运行） |
| AI 用例设计 | 不需要浏览器 | **并行** |

### 5.2 子 Agent 上下文隔离

每次 CDP 探查在独立子 Agent 中执行：
- 子 Agent：执行完整 BFS，全部 CDP 交互（~50-100K tokens 的 DOM/snapshot 数据）
- 将所有发现写入 **baseline JSON 文件**（持久化，不依赖上下文）
- 仅返回 ~100 tokens 的摘要给主命令
- 子 Agent 结束后上下文释放

**效果**：5 个区域 = 主上下文 ~3.5K tokens（不用隔离则 ~500K）。

### 5.3 Fragment 合并 POM 策略

并行生成时，多个 orchestrator 可能操作同一页面的 POM 文件：
- 每个 orchestrator 写 **POM fragment 文件**：`{slug}.page.{area-id}.fragment.ts`
- 全部完成后，主命令合并 fragment 为最终 POM
- 无并发写共享文件 → 无数据丢失

---

## 6. 去重层级

| 层级 | 执行者 | 检查内容 | 角色 |
|------|--------|---------|------|
| 主入口 | e2e-orchestrator 步骤 2 | 扫描已有 spec + .md → 跳过/补充/新建 | 主要 |
| 兜底 1 | test-case-generator Phase A | 生成前再检查已有用例 | 防御性 |
| 兜底 2 | playwright-script-generator 步骤 0 | 生成 spec 前再检查已有 spec + POM | 防御性 |
| 上报去重 | report-analyzer 步骤 2 | 搜索 Linear 已有同名 Open Issue | Bug 去重 |

---

## 7. 用例设计方法

test-case-generator SKILL 强制应用 6 种设计方法：

| # | 方法 | 产出 |
|---|------|------|
| 1 | 等价类划分法 | 有效/无效等价类 → 用例（一个用例覆盖多个有效类，一个无效类单独一个用例） |
| 2 | 边界值分析法 | min±1、max±1 边界用例 |
| 3 | 因果图法 / 判定表 | 因素分析 → 判定表 → 用例 |
| 4 | 状态转移法 | 状态机 → 有效/无效转换 |
| 5 | 场景法 | 基本流 + 备选流 → 场景组合 |
| 6 | 错误推测法 | 基于经验的边界用例（并发、特殊字符、空状态等） |

流程：**6 种方法各自设计 → 合并 → 去重 → 输出完整用例列表**。

**强制执行机制**（orchestrator Step 3.5）：
- 生成的 .md 必须包含 6 个 `## Method N:` 段落（可以 N/A + 原因，不能缺失）
- 至少 3 个方法必须产出实际用例（不能全部 N/A）
- 不通过 → 重新生成（最多 2 次）→ 仍不通过 → 阻塞流水线

**断言质量验证**（playwright-script-generator Step 0a）：
- 生成 spec 后扫描所有 `expect()` 调用
- 孤立的 `toBeVisible()` / `toBeTruthy()` 判定为弱断言 → 自动补充内容校验
- spinner/loading 等存在性元素豁免

---

## 8. 产出物路径

```
$QA_WORKSPACE_DIR/
├── test-cases/
│   ├── generated/
│   │   ├── page-baseline-{slug}.json              CDP 状态流图
│   │   ├── {slug}-{area-id}-cdp.md                 用例文档
│   │   └── playwright-handoff-{slug}.json            Playwright 移交
│   └── excel/
│       └── {slug}-{area-id}-cdp.xlsx               Excel 表格
├── tests/e2e/
│   ├── pages/
│   │   ├── {slug}.page.ts                          Page Object（最终合并版）
│   │   └── {slug}.page.{area-id}.fragment.ts       POM fragment（临时，合并后删除）
│   ├── testcases/generated/
│   │   └── {slug}-{area-id}-cdp.test.ts            Playwright spec
│   ├── fixtures.ts                                 测试 fixtures（auth 或简单版）
│   ├── auth.setup.ts                               登录设置（setup project，需要认证时）
├── playwright/.auth/user.json                       缓存的认证状态
├── tests/reports/
│   ├── playwright-results.json                     JSON 报告
│   └── combined/summary.md                         汇总报告
├── messages/                                       i18n message files (copied from source)
└── playwright-report/index.html                    HTML 报告
```

---

## 9. 模型分级

| Agent | 模型 | 原因 |
|-------|------|------|
| e2e-orchestrator | claude-opus-4-6 | 代码生成需要最强能力 |
| test-executor | claude-sonnet-4-6 | 执行 bash 命令 + 结果收集 |
| report-analyzer | claude-sonnet-4-6 | 报告分析 + API 调用 |
| bug-reporter | claude-sonnet-4-6 | 格式化 + API 调用 |

---

## 10. 错误处理

| 场景 | 处理方式 |
|------|---------|
| CDP 探查遇到登录墙 | 自动检测 → 填入凭据 → 生成 auth.setup.ts（setup project） |
| Locator 验证失败（0 或 N 个匹配） | CDP DOM 扫描 → 修复 POM → 重新验证（最多 3 轮） |
| 交互后回退失败 | 降级链：Escape → 浏览器后退 → 强制导航到初始 URL |
| BFS 探查超出限制 | 终止条件：最多 100 次交互 / 30 个状态 / 10 分钟 → 输出覆盖率报告 |
| git-watcher 命令执行中崩溃 | 状态在命令完成后才保存 → 下次轮询重新触发未完成的 PR |
| 网络错误（git-watcher） | 指数退避重试（5s → 10s → ... → 60s 上限） |
| targetArea 未找到（qa-from-issue） | 从定向模式降级为全量探查模式 |
| 测试失败是应用 Bug（qa-fix-tests） | 不修改测试断言 → 分类为 Bug → 上报 Linear |
| 6 种设计方法覆盖不足 | 重试生成（最多 2 次）→ 仍不足 → 阻塞流水线并报错 |
| 弱断言通过验证（playwright-script） | 自动补充内容校验断言（toHaveText/toHaveValue/toHaveCount） |
| PRD 内容更新 | content hash 对比 → 只更新变化的模块（保留/修改/新增/废弃） |
| 页面 UI 变更后重跑 qa-explore | State₀ 指纹对比 → 只重新探查变化的区域 |
| PRD 模块被删除 | 通过 feature-slug 精确定位 spec → test.describe.skip 标记废弃 |

---

## 11. 增量更新机制

| 入口 | 检测方式 | 变更类型 | 处理 |
|------|---------|---------|------|
| `/qa-run-prd` | PRD content hash（sha256）存储在 .md 头部 | none/new/updated/removed | none 跳过、new 全新生成、updated 增量更新（保留/修改/新增/废弃）、removed 标记 skip |
| `/qa-gen-cases` | 同上（相同 hash 机制） | 同上 | 同上（但只产出 .md + Excel，无脚本） |
| `/qa-explore` | State₀ 页面指纹（CDP fingerprint） | 匹配/不匹配 | 匹配 → 恢复中断点继续、不匹配 → 逐区域检测变化 → 只重新探查变化区域 |
| `/qa-from-issue` | Issue 内容驱动（每次从 issue 出发） | Mode X/A/B | X 修复已有、A 补充、B 新建 |

**不会丢失旧用例**：废弃的需求/区域只做 `test.skip()` 标记或 `<!-- DEPRECATED -->` 注释，不删除代码。

---

## 12. 扩展设计

### 单元测试（暂停，预留）

```
.claude/agents/unit-test-orchestrator.md     ← 暂停
skills/vitest-testing/SKILL.md       ← 暂停
.claude/commands/qa-run-unit.md      ← 暂停
```

### 新项目接入

```bash
bash scripts/install.sh    # 在目标项目根目录运行
```

自动完成：.env 配置、CLAUDE.md 模板、MCP 配置。

---

## 13. Multi-Language Testing (i18n)

When APP_LANGUAGES is configured (e.g., "en,zh"):
- playwright.config.ts generates per-language Playwright projects (e2e-en, e2e-zh)
- fixtures.ts includes i18n worker-scope fixture with t(key) resolver
- POM locators use i18n.t('key') for text-based matching
- One spec runs across all configured languages
- NEXT_LOCALE cookie switches app language per project
- Messages copied from source (I18N_MESSAGES_DIR) to QA_WORKSPACE_DIR/messages/ (self-contained)
- /qa-fix-tests --upgrade-i18n converts existing single-lang specs to multi-lang
