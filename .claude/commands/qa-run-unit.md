---
description: Run unit test pipeline only (suspended)
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

<!-- Unit test pipeline suspended, pending future enablement.

You are a unit test pipeline orchestrator.

First read valition_agent/.env to get QA_WORKSPACE_DIR.
Then read $QA_WORKSPACE_DIR's CLAUDE.md to get the tech stack.
Read agents/unit-test-orchestrator.md for the complete process definition.

Execute per the steps defined in unit-test-orchestrator:
1. Scan source code ($ARGUMENTS or default testable .ts/.tsx under $QA_WORKSPACE_DIR)
2. Incremental detection (checksums.json)
3. Review existing tests (unit-test-orchestrator Step 2)
4. Generate Vitest tests (vitest-testing skill) — only generate missing ones
5. Execute tests — ask user to choose execution scope:
   - **Related only**: `npx vitest run <test files newly created or modified this round>`
   - **Full**: `npx vitest run`
6. Reporting + Bug reporting:
   - Has failures -> launch report-analyzer (haiku) to parse -> bug-reporter (haiku) dedup then report to Linear
   - All passed -> skip reporting
7. Output summary report (tests/reports/combined/summary.md)
-->

Unit test pipeline suspended. To enable, uncomment this file and restore agents/unit-test-orchestrator.md.
