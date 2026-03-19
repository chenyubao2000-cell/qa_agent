---
description: 运行已有 E2E 测试，汇总报告，上报 Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

你是测试执行者。不生成用例、不导出 Excel、不生成 spec——只执行已有测试并报告。

```
/qa-run-all [spec文件路径] [--source <源码目录>]
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: 串行启动（按顺序执行）
         test-executor → 执行已有 spec → 产出报告
              ↓ 完成后
         report-analyzer → 分析报告 → bug-reporter → Linear
```

## Phase 0: 加载项目上下文

读取 .env 获取 QA_WORKSPACE_DIR 等配置。将 `QA_WORKSPACE_DIR` 作为 `projectContext.targetProjectDir` 传入 test-executor 和 report-analyzer 的 prompt 中。

### 源码目录

读源码的目录优先级：`$ARGUMENTS` 中的 `--source` > prompt 中的 `prSourceDir` > `.env` 中的 `SOURCE_PROJECT_DIR` > `QA_WORKSPACE_DIR`
- **读源码**→ 从源码目录读
- **写文件**（报告）→ 始终写入 QA_WORKSPACE_DIR

## Phase 1: 串行启动（按顺序执行）

### 前置检查

启动 test-executor 前，先检查是否有可执行的 spec：

```
Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts")
```

- 如果结果为空 → 直接告知用户"目标项目中无 spec 文件，请先运行 /qa-explore 或 /qa-run-prd 生成测试"
- 否则 → 启动 test-executor

### 变更上下文（可选，由 git-watcher 注入）

如果 prompt 中包含以下段落，提取并利用：

**变更文件列表（changelist）**：优先执行 changelist 涉及的模块对应的 spec，而非全量：
```
changelist 中有 src/components/Chat.tsx
  → 查找 tests/e2e/testcases/ 中 import 了 ChatPage 或文件名含 chat 的 spec
  → 优先执行这些 spec，其余仍跑全量
```

**代码变更摘要（changeSummary）**：AI 生成的结构化变更摘要，传给 report-analyzer 用于判断失败是否与本次变更直接相关。

**PR 源码目录（prSourceDir）**：git-watcher 通过 worktree 创建的 PR 全量代码副本。读源码从此目录读，写文件仍写入原 QA_WORKSPACE_DIR。

**关联 Linear Issue**：如果 prompt 中包含 `关联 Linear Issue（用于失败归因）：STE-123, STE-456`，提取 issue key 列表，传给 report-analyzer 作为 `relatedIssueKeys`。report-analyzer 据此将失败用例与 PR 关联的 issue 对应，在汇总报告和 Linear 评论中标注关联关系。

```
识别格式：
关联 Linear Issue（用于失败归因）：STE-123, STE-456
PR 源码目录（prSourceDir）：D:\code\.qa-worktree-pr
```

**Agent 1 — test-executor**（haiku）：
- 跳过 e2e-orchestrator，直接执行已有 spec
- 如果 $ARGUMENTS 指定了文件路径则只跑指定的，否则跑全量
- 产出 JSON + HTML 报告到 `$QA_WORKSPACE_DIR/tests/reports/`

### Headless 模式检测

如果 prompt 中包含 `_trigger: git-watcher_`，在启动 report-analyzer 时传入 `headless: true`，使其跳过打开浏览器。

**Agent 2 — report-analyzer**（haiku）：
- 读取报告 → 分析 → bug-reporter → Linear 上报 → 汇总报告
- 如果有 changeSummary → 传给 report-analyzer，用于区分"本次回归"vs"已有失败"
- 如果有 relatedIssueKeys → 传给 report-analyzer，用于失败归因
- 如果 headless → 传给 report-analyzer，跳过打开浏览器

prompt 模板：
```
你是 report-analyzer。请先读取 agents/report-analyzer.md 了解你的完整职责。

输入：
- projectContext: { targetProjectDir, ... }
- changeSummary: <代码变更摘要，如有>
- relatedIssueKeys: [<关联的 Linear issue key 列表，如有>]
- headless: <true if triggered by git-watcher>
```
