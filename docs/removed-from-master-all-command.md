# 精简后流水线说明

本文档记录 `master` 分支相对 `master-all-command` 分支移除了哪些模块。

- **`master-all-command`**：精简前的完整快照分支，包含全部 14 个命令及其依赖。
- **`master`**（当前）：保留 8 个核心命令 + 必要依赖；其余暂不使用的流水线已删除。
- **删除提交**：`e59ee24` — chore: 精简流水线，移除 6 条暂不使用的命令链及其专属模块

如需恢复任一被删模块，直接从 `master-all-command` 取文件即可：

```sh
git checkout master-all-command -- <path>
```

---

## 已移除清单（21 个文件/目录）

### Commands（6 个）

| 路径 | 原用途 |
|---|---|
| `.claude/commands/qa-verify-fix.md` | 验证 Linear bug issue 是否已修复 |
| `.claude/commands/qa-unit-test.md` | 单元测试流水线（diff → 增量 Vitest/pytest）|
| `.claude/commands/qa-api-test.md` | API 测试流水线（Schema → API/集成测试 + MSW mock）|
| `.claude/commands/qa-perf-test.md` | 性能测试流水线（k6 + 基线对比）|
| `.claude/commands/qa-eval.md` | LLM Eval 评估流水线（Langfuse trace → LLM-as-Judge）|
| `.claude/commands/qa-sentinel.md` | 多平台质量守卫监控启动 |

### Agents（4 个）

| 路径 | 原唯一调用方 |
|---|---|
| `.claude/agents/unit-test-agent.md` | qa-unit-test |
| `.claude/agents/api-orchestrator.md` | qa-api-test |
| `.claude/agents/eval-agent.md` | qa-eval |
| `.claude/agents/sentinel-agent.md` | qa-sentinel |

### Skills（5 个目录）

| 路径 | 原唯一消费方 |
|---|---|
| `skills/unit-test-generator/` | unit-test-agent |
| `skills/api-test-generator/` | api-orchestrator |
| `skills/perf-test-generator/` | qa-perf-test |
| `skills/llm-eval-builder/` | eval-agent |
| `skills/mock-config-generator/` | （已孤儿，无任何 command/agent 引用）|

### Scripts（4 个）

| 路径 | 原用途 |
|---|---|
| `scripts/eval-cron.ts` | qa-eval 定时任务 |
| `scripts/sentinel-watcher.ts` | qa-sentinel 守护进程（轮询 Sentry/Langfuse/Railway/DB）|
| `scripts/ai-test-suggest.ts` | test-flow.yml CI 调用，PR 时生成 AI 测试建议 |
| `scripts/coverage-gap-detector.ts` | test-flow.yml CI 调用，分析 PR 覆盖率盲区 |

### Hooks（1 个）

| 路径 | 原用途 |
|---|---|
| `hooks/post-notify.sh` | sentinel-agent / sentinel-watcher 调用的 Slack/桌面通知 |

### Workflows（1 个）

| 路径 | 原用途 |
|---|---|
| `.github/workflows/test-flow.yml` | PR 时自动跑 turbo coverage gap + AI 测试建议 → 评论到 PR |

---

## 现存清单（精简后的 master）

### Commands（8 个）

| 命令 | 用途 |
|---|---|
| `/qa-explore` | 探查浏览器页面，自动生成 E2E baseline + 用例 + POM + spec |
| `/qa-from-issue` | 从 Linear issue 生成或更新 E2E 测试（支持批量）|
| `/qa-from-branch` | 从 GitHub 分支变更 vs main 驱动 QA 测试 |
| `/qa-run` | 执行已有 E2E 测试，汇总报告，上报 Linear |
| `/qa-run-prd` | PRD 驱动的 E2E 测试流水线 |
| `/qa-gen-cases` | 仅从 PRD 生成用例 + Excel，不生成脚本 |
| `/qa-fix-tests` | 通过 CDP 探查真实页面，修复失败的测试 |
| `/qa-tool-probe` | 工具白盒探针：4 桩注入 → tool.execute() 直调 → claude CLI 裁决 → MD 报告 |

### Agents（6 个）

| Agent | 用途 |
|---|---|
| `e2e-orchestrator` | E2E 用例 + Excel + spec 生成的协调层（opus）|
| `test-executor` | 测试执行层（haiku/sonnet）|
| `cdp-test-executor` | CDP 驱动的执行层 |
| `report-analyzer` | 失败报告分析 + 去重（sonnet）|
| `bug-reporter` | Linear Issue 创建/追加（sonnet）|
| `tool-probe-orchestrator` | 工具白盒探针编排（sonnet）|

### Skills（7 个）

`test-case-generator` · `cdp-explorer` · `excel-case-export` · `playwright-script-generator` · `test-data-setup` · `tool-probe` · `tool-probe-case-generator`

### Scripts（6 个）

`scripts/git-watcher.ts`（独立 PR 监听）+ `scripts/tool-probe/*`（5 个）

### Hooks（1 个）

`hooks/session-start.sh` — 全局 session 启动校验

### References（13 个 — 全保留）

`.claude/references/*.md` 全部为保留 commands/agents 直接或间接引用，未做删除。

---

## 已知遗留事项

以下文件中的内容仍提及已删除模块，但不影响功能，待后续清理：

- `CLAUDE.md` — 架构图与流水线段落仍含 unit/api/perf/eval/sentinel 描述、`/qa-i18n-audit`（本就不存在）、i18n 三个 agent（本就不存在）
- `常用command说明.md` / `常用command说明.html` — 同上
- `docs/final-best-plan.html` / `docs/architecture.md` — 早期设计文档，含已移除模块
- `README.md` — 待 grep 确认是否提及

需要时可通过 `git checkout master-all-command -- <path>` 单点恢复任一被删文件，无需切换分支。
