---
description: "API测试流水线：分析API Schema → 生成API/集成测试 → 执行 → 报告"
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob
---

You are an API test pipeline orchestrator. Analyze API schemas, generate tests, execute them, and report results.

```
/qa-api-test [--target <api-dir-or-file>] [--mock-level L1|L2|L3|all]
     |
Phase 0: Load project context (.env → source project config)
     |
Step 1: Schema analysis (scan API routes + Drizzle Schema + types)
     |
Step 2: Dispatch api-orchestrator (generate tests + mocks)
     |
Step 3: Execute tests (npx vitest run tests/api/)
     |
Step 4: Report (results + coverage + failure analysis)
```

## Phase 0: Load Project Context

```
Read(".env")
```

Extract:
- `QA_WORKSPACE_DIR` — target project directory (write tests here)
- `SOURCE_PROJECT_DIR` — source project directory (read API code from here)

Source code directory priority: `--source` in `$ARGUMENTS` > `SOURCE_PROJECT_DIR` in `.env` > `QA_WORKSPACE_DIR`

### Parameter Parsing

**Parse parameters from $ARGUMENTS** (supports both flags and natural language):

| Flag | Default | Description |
|------|---------|-------------|
| `--target <path>` | (scan entire source project) | Specific API directory or file to focus on |
| `--mock-level <level>` | `all` | Mock layers to generate: `L1` (MSW network), `L2` (LLM), `L3` (data), `all` |
| `--source <dir>` | `SOURCE_PROJECT_DIR` | Override source code directory |

**Natural language parsing (Chinese/English)**:

| Input | Parsed as |
|-------|-----------|
| `只测 tasks API` / `only tasks` | target = path containing "tasks" in API routes |
| `不要 mock` / `no mock` | mockLevel = none (skip mock generation) |
| `只要网络层 mock` / `network mock only` | mockLevel = L1 |
| `包含 LLM mock` | mockLevel = L1+L2 |
| `全量 mock` / `all mocks` | mockLevel = all |

## Step 1: Schema Analysis

Scan the source project to detect API surface:

```
sourceDir = resolved source directory
targetPath = $ARGUMENTS --target or null

# 1. Detect API style
Glob("$sourceDir/app/api/**/route.{ts,js}")          → Next.js App Router
Glob("$sourceDir/pages/api/**/*.{ts,js}")             → Next.js Pages Router
Grep("createTRPCRouter", "$sourceDir", glob: "*.ts")  → tRPC
Glob("$sourceDir/**/{openapi,swagger}.{json,yaml}")   → OpenAPI spec
Grep("app\\.(get|post|put)", "$sourceDir", glob: "*.ts") → Express/Hono

# 2. Detect data models
Grep("pgTable|mysqlTable|sqliteTable", "$sourceDir", glob: "*.ts") → Drizzle
Grep("^model ", "$sourceDir", glob: "*.prisma")                    → Prisma

# 3. Detect request library
Read("$sourceDir/package.json") → check for axios, ky, got, node-fetch

# 4. Detect AI SDK usage (for L2 mock)
Grep("generateText|streamText|import.*from ['\"]ai['\"]", "$sourceDir", glob: "*.ts")
```

Build `schemaAnalysis` object with:
- `apiStyle`: detected API framework
- `endpoints[]`: list of endpoints with method, path, handler file
- `entities[]`: data model definitions
- `existingRequestLib`: project's HTTP client
- `hasAiSdk`: whether AI SDK is used (determines L2 mock need)

If `targetPath` is provided:
- Filter scan to only that directory/file
- Still detect data models project-wide (endpoints may reference any entity)

## Step 2: Dispatch api-orchestrator

Launch api-orchestrator agent:

```
You are api-orchestrator. First read .claude/agents/api-orchestrator.md to understand your full responsibilities.

Input:
- sourceProjectDir: "$sourceDir"
- targetProjectDir: "$QA_WORKSPACE_DIR"
- mockLevel: "{parsed mockLevel, default all}"
- targetPath: "{parsed --target or null}"
- schemaAnalysis: {schemaAnalysis from Step 1}
- techStack: {tech stack from source CLAUDE.md if available}

Execute per .claude/agents/api-orchestrator.md:
1. Use schemaAnalysis as input (skip re-detection)
2. Generate tests per Phase 2
3. Generate mocks per Phase 2.3 (respecting mockLevel)
4. Return artifact paths
```

## Step 3: Execute Tests

After api-orchestrator returns, execute the generated tests:

```bash
cd $QA_WORKSPACE_DIR

# Run all API tests
npx vitest run tests/api/ --reporter=json --outputFile=tests/reports/api-results.json

# If specific target was given, run only matching test files
npx vitest run tests/api/{feature}.api.test.ts --reporter=json --outputFile=tests/reports/api-results.json
```

**Execution rules**:
- Use `vitest run` (not `vitest` which enters watch mode)
- Always produce JSON report for analysis
- If tests fail, do NOT stop — collect all results for reporting

## Step 4: Report

After test execution completes:

### 4.1 Parse Results

```
Read("$QA_WORKSPACE_DIR/tests/reports/api-results.json")
```

Extract:
- Total tests, passed, failed, skipped
- Per-endpoint coverage (which endpoints have tests, which don't)
- Failed test details: test name, error message, stack trace

### 4.2 Generate Summary

Output a structured summary:

```
## API 测试报告

### 概览
- 总用例数: {total}
- 通过: {passed} ✓
- 失败: {failed} ✗
- 跳过: {skipped}

### API 覆盖率
- 已覆盖 endpoint: {covered}/{total} ({percentage}%)
- 未覆盖: {list of uncovered endpoints}

### 失败分析
{For each failed test:}
- **{test name}**: {error summary}
  - 文件: {test file path}
  - 错误: {error message}
  - 可能原因: {AI-analyzed root cause}

### Mock 层级
- L1 (网络层): {count} handlers
- L2 (LLM层): {count} handlers
- L3 (数据层): {count} fixtures
```

### 4.3 Return

```json
{
  "summary": {
    "total": 42,
    "passed": 38,
    "failed": 3,
    "skipped": 1,
    "coveragePercent": 85
  },
  "testFiles": ["tests/api/tasks.api.test.ts"],
  "mockFiles": ["tests/mocks/handlers/tasks.ts"],
  "reportFile": "tests/reports/api-results.json",
  "failures": [
    {
      "test": "POST /api/tasks should validate input",
      "file": "tests/api/tasks.api.test.ts",
      "error": "Expected 400, received 500",
      "analysis": "Server returns 500 instead of 400 for invalid input — missing validation middleware"
    }
  ]
}
```
