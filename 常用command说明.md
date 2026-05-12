# QA 测试生成命令使用说明

## 0. 前置：环境变量（`.env`）

跑下面任何一个命令前，先把 `.env` 配好。按"必需 / 按需 / 可选"分类：

### 必需（缺一不可）

| 变量 | 说明 | 示例 |
|---|---|---|
| `QA_WORKSPACE_DIR` | QA 工作空间根目录，所有生成的 spec/POM/报告都写到这里(默认就好) | `./tests/e2e/local` |
| `SOURCE_PROJECT_DIR` | **被测项目源码目录**，mira代码地址 | `D:\xxxx\xxxx\mira` |
| `PREVIEW_URL` | 被测环境地址，**baseURL 的唯一来源**（不要再单独配 `PLAYWRIGHT_BASE_URL`） | `https://mira-bff-preview.up.railway.app/或localhost` |

### 可选

| 变量 | 说明 |
|---|---|
| `PLAYWRIGHT_HEADLESS` | `true` / `false` |
| `SLACK_WEBHOOK_URL` | 失败告警推 Slack |

### 三个命令的最小必需变量

| 命令 | 必需 | 强烈建议 |
|---|---|---|
| `/qa-run-prd` | `QA_WORKSPACE_DIR` + `SOURCE_PROJECT_DIR` + `PREVIEW_URL` | + `E2E_TEST_EMAIL/PASSWORD`（如需登录） |
| `/qa-from-issue` | 上述三项 + `LINEAR_API_KEY` + `LINEAR_TEAM_ID` + `LINEAR_PROJECT_ID` | + 登录账号 |
| `/qa-from-branch` | 上述三项 + `GITHUB_TOKEN` + `TARGET_GITHUB_OWNER/REPO` | + Linear（要评论 issue 时） + 登录账号 |

> SessionStart hook (`hooks/session-start.sh`) 会自动校验上面这些变量，缺失时会提示。

---

## 1. `/qa-run-prd` — PRD 驱动

**用途**：从需求文档生成 E2E 测试并执行。
**用法**
```bash
/qa-run-prd                                 # 读默认 $SOURCE_PROJECT_DIR/docs/prd/
/qa-run-prd docs/prd/login-v2.md            # 指定 PRD
/qa-run-prd docs/prd/ --source ../my-app    # 指定源码目录
```
**执行步骤**
| Phase | 动作 |
|---|---|
| 0 | 加载 `.env`、初始化 workspace（i18n / auth 基础设施） |
| 1 | 读 PRD → 按 `##` 拆模块 → 用 PRD-hash 检测变更（`none`/`new`/`updated`/`removed`） |
| 2.1 | **并行**给每个变化模块跑 `e2e-orchestrator` → 用例 + Excel + POM + spec |
|     | 通过 `verification-gate V1-V5` 校验，失败则停 |
| 2.2 | 调 `/qa-fix-tests --skip-baseline` → CDP 探查真实页面 → 修 locator/断言 → 重跑通过 |
| -   | **不上报 Linear**（如需汇报，跑完后手动 `/qa-run`） |
**特点**：增量友好（hash 变了才重生成）；自身不碰 CDP，全部交给 fix-tests。
---
## 2. `/qa-from-issue` — Issue 驱动
**用途**：从 Linear issue 描述生成或更新 E2E，执行后回写结果到原 issue。
**用法**
```bash
/qa-from-issue STE-9                        # 单个
/qa-from-issue STE-9 STE-10 STE-11          # 批量
/qa-from-issue https://linear.app/.../STE-9 # URL
/qa-from-issue --all-open                   # 所有 Open/Backlog
/qa-from-issue --status backlog             # 按状态批量
/qa-from-issue "download format"            # 关键词搜索
/qa-from-issue STE-9 --source D:\my-project # 指定源码目录
```
**执行步骤**
| Phase | 动作 |
|---|---|
| 0   | 加载 `.env`、初始化 workspace |
| 1   | 取 issue 详情 → 提取 `pageUrl` / `expectedBehavior` / `actualBehavior` / `reproSteps` / `feature` |
|     | 查已有 spec（按 TC ID → 文件名 → pageUrl → 关键词），命中则走 `update`，否则 `create` |
| 2   | **串行** CDP 定向探查（按 pageUrl 分组，同页 issue 合并）→ 写 baseline |
| 3.1 | **并行** `e2e-orchestrator` → 用例 + POM + spec |
| 3.2 | `/qa-fix-tests --skip-baseline` → 修复 locator |
| 3.3 | `test-executor (changed+smoke)` → 跑变更 spec + 全局 @smoke 回归 |
| 3.4 | `report-analyzer` 分流失败 → `bug-reporter`（**仅 append 回写源 issue**，不创建新 issue） |
| -   | **上报 Linear** ✅ |

**特点**：会主动写回 Linear 。

---
## 3. `/qa-from-branch` — 代码变更驱动
**用途**：从 GitHub 分支 vs main 的 diff 出发，匹配已有 spec 或为缺失模块补 spec，执行并可选汇报。
**用法**
```bash
/qa-from-branch                                 # 交互式选分支（GraphQL 拉最近 5 个）
/qa-from-branch feature/chat-redesign           # 显式分支
/qa-from-branch feature/xyz STE-42 STE-43       # 分支 + 关联 issues
/qa-from-branch STE-42                          # 仅 issue（无分支模式）
/qa-from-branch feature/xyz --local             # 本地 git 代替远程 API
/qa-from-branch feature/xyz --source ../app     # 指定源码目录
```
**执行步骤**
| Phase | 动作 |
|---|---|
| 0   | 加载 `.env`、解析参数（branch / issueInputs / sourceOverride / forceLocal） |
| 1   | 选分支（GraphQL 列表 / 显式 / 无分支）→ 选 diff 策略（完整分支 / 最新 commit / 本地未提交）→ 拉 changelist + rawDiff → 生成 changeSummary → 读改动源码 |
| 1.5 | （可选）拉 Linear issue 上下文，合并 pageUrl + 模块关键词 |
| 2.1 | 扫已有 spec/POM，建立 slug → spec 索引 |
| 2.2 | **两遍匹配**：Pass 1 关键词出候选；Pass 2 拿 POM/handoff 的 selector 在 rawDiff 里搜，分类 `affected` / `maybe-affected` / `unmatched` |
| 2.3 | maybe-affected 询问用户跑不跑 |
| 2.4 | **断言影响分析**：检查已有 spec 的断言文案是否被 diff 删掉 → 标 `needs_assertion_review` |
|     | 决策：`selective` / `selective+generate` / `generate` / `skip` |
| 3   | （只对 unmatched 模块）推断 pageUrl → CDP 探查 → `e2e-orchestrator` 生成（带跨源 dedup）→ V1-V5 校验 → `/qa-fix-tests` 修复 |
| 4   | `cdp-test-executor` 执行 matched + new spec → `cdp-results.json` |
| 5   | `report-analyzer` 三分类失败：🔴 `regression_likely` / 🟡 `assertion_outdated` / ⚪ `pre_existing` |
|     | 有传 issue 时询问用户是否评论到 Linear（**只评论，不改状态**） |
**特点**：唯一能"代码 → 测试"反向匹配；区分真回归 vs 断言过时；Linear 汇报可选。
---
## 三者快速对比
| 维度 | `/qa-run-prd` | `/qa-from-issue` | `/qa-from-branch` |
|---|---|---|---|
| 输入 | PRD 文档 | Linear issue | 分支 diff (+ 可选 issue) |
| 增量识别 | PRD-hash | 已有 spec 匹配 | rawDiff selector 命中 |
| CDP 探查 | 不做（甩给 fix-tests） | 做（按 pageUrl 分组串行） | 仅对新模块做 |
| 执行器 | Playwright (经 fix-tests) | Playwright + smoke 回归 | **CDP executor**（cdp-results.json） |
| Linear | ❌ | ✅ append 写回源 issue | 可选评论（用户确认） |
| 主用场景 | 新需求落地 | bug 复盘 / 单点验证 | PR/分支预检、回归 |
