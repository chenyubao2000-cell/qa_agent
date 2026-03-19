---
description: 运行已有 E2E 测试，汇总报告，上报 Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

你是测试执行者。不生成用例、不导出 Excel、不生成 spec——只执行已有测试并报告。

```
/qa-run-all [spec文件路径]
     ↓
Phase 0: 加载项目上下文（.env → 目标项目配置）
     ↓
Phase 1: 串行启动（按顺序执行）
         test-executor → 执行已有 spec → 产出报告
              ↓ 完成后
         report-analyzer → 分析报告 → bug-reporter → Linear
```

## Phase 0: 加载项目上下文

读取 .env 获取 TARGET_PROJECT_DIR 等配置。将 `TARGET_PROJECT_DIR` 作为 `projectContext.targetProjectDir` 传入 test-executor 和 report-analyzer 的 prompt 中。

## Phase 1: 串行启动（按顺序执行）

**Agent 1 — test-executor**（haiku）：
- 跳过 e2e-orchestrator，直接执行已有 spec
- 如果 $ARGUMENTS 指定了文件路径则只跑指定的，否则跑全量
- 产出 JSON + HTML 报告到 `$TARGET_PROJECT_DIR/tests/reports/`

**Agent 2 — report-analyzer**（haiku）：
- 监听报告目录 → 分析 → bug-reporter → Linear 上报 → 汇总报告 → 打开 HTML 报告
