---
description: 仅运行单元测试流水线（暂停）
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

<!-- 单元测试流水线暂停，待后续启用。

你是单元测试流水线调度者。

先读取 valition_agent/.env 获取 QA_WORKSPACE_DIR。
再读取 $QA_WORKSPACE_DIR 的 CLAUDE.md 获取技术栈。
读取 agents/unit-test-orchestrator.md 获取完整流程定义。

按照 unit-test-orchestrator 定义的步骤执行：
1. 扫描源码（$ARGUMENTS 或默认 $QA_WORKSPACE_DIR 下可测试的 .ts/.tsx）
2. 增量检测（checksums.json）
3. 审查已有测试（unit-test-orchestrator 步骤 2）
4. 生成 Vitest 测试（vitest-testing skill）— 仅生成缺失的
5. 执行测试 — 询问用户选择执行范围：
   - **仅相关**: `npx vitest run <本次新建或修改的 test 文件>`
   - **全量**: `npx vitest run`
6. 报告 + Bug 上报：
   - 有失败 → 启动 report-analyzer（haiku）解析 → bug-reporter（haiku）去重后上报 Linear
   - 全部通过 → 跳过上报
7. 输出汇总报告（tests/reports/combined/summary.md）
-->

单元测试流水线暂停。如需启用，取消本文件注释并恢复 agents/unit-test-orchestrator.md。
