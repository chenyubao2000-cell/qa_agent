---
description: "单元测试流水线：分析代码变更 -> 生成增量单元测试 -> 执行 -> 报告"
allowed-tools: Agent, Bash, Read, Write, Edit, Grep, Glob
---

You are a unit test pipeline orchestrator. Do not generate E2E tests — only unit tests.

```
/qa-unit-test [--target <file-or-dir>] [--style <vitest|pytest>]
     |
Phase 0: Load project context (.env -> project config)
     |
Step 1: 变更分析 (identify functions needing tests)
     |
Step 2: 调度 unit-test-agent (generate tests)
     |
Step 3: 执行测试 (run generated tests)
     |
Step 4: 报告 (summary + coverage + failure analysis)
```

## Phase 0: Load Project Context

```
Read(".env")
```

Extract:
- `QA_WORKSPACE_DIR` — 项目工作目录
- `SOURCE_PROJECT_DIR` — 源码目录（可选，默认同 QA_WORKSPACE_DIR）

Detect test framework:
```
If --style provided:
  testStyle = $ARGUMENTS.style
Else:
  Grep("vitest", "$projectDir/package.json") → testStyle = "vitest"
  Grep("jest", "$projectDir/package.json")   → testStyle = "jest"
  Glob("$projectDir/**/pyproject.toml") + Grep("pytest") → testStyle = "pytest"
  Fallback → testStyle = "vitest"
```

Check test spec file:
```
If file exists "$projectDir/unit-testing.md":
  testSpecFile = "$projectDir/unit-testing.md"
Else:
  testSpecFile = null
```

**Parse parameters from $ARGUMENTS** (supports Chinese/English natural language):

| Input | Parsed as |
|-------|-----------|
| `--target src/utils/` | target = "src/utils/" |
| `--target src/utils/calc.ts` | target = "src/utils/calc.ts" |
| `--style vitest` | testStyle = "vitest" |
| `--style pytest` | testStyle = "pytest" |
| `测试 src/utils` | target = "src/utils" |
| `给 calculate.ts 写单测` | target = "calculate.ts" (fuzzy match via Glob) |
| `分析当前分支变更` | target = null (use git diff) |

## Step 1: 变更分析

### 1.1 确定分析范围

```
If --target is a file:
  files = [target]
If --target is a directory:
  Glob("$target/**/*.{ts,tsx,js,jsx,py}") → files (exclude test files, node_modules, dist)
If --target is not specified:
  # 分析当前分支 vs main 的 diff
  Bash("git diff main...HEAD --name-only --diff-filter=ACMR")
  → files (only added/changed/modified/renamed, exclude test files)
  If no diff (clean branch):
    → inform user "No changes detected vs main. Use --target to specify files."
    → exit
```

### 1.2 提取函数清单

For each file in `files`:

```
Read(file)
提取所有函数/方法：
  TypeScript/JavaScript:
    - export function xxx
    - export const xxx = () =>
    - export default function
    - class methods (public)
    - module.exports = { xxx }
  Python:
    - def xxx (module-level)
    - class methods (public, not _private)
    - async def xxx

For each function, record:
  - filePath: string
  - functionName: string
  - startLine: number
  - endLine: number
  - signature: string (params + return type)
  - isExported: boolean (only test exported functions by default)
  - complexity: "simple" (<20 lines, no deps) | "complex"
```

### 1.3 去重：排除已有测试覆盖

```
Scan existing test files:
  Glob("$projectDir/**/*.test.{ts,tsx,js,jsx}") + Glob("$projectDir/**/test_*.py")
  → existingTests[]

For each function in functionList:
  Grep("{functionName}", existingTests)
  If found in describe/test/it block → mark as "covered", remove from functionList
  If found but test is outdated (source function signature changed) → keep in functionList, mark "needs update"
```

### 1.4 输出

```json
{
  "functionList": [
    {
      "filePath": "src/utils/calculate.ts",
      "functionName": "calculateTotal",
      "startLine": 15,
      "endLine": 32,
      "signature": "(items: Item[], taxRate: number) => number",
      "isExported": true,
      "complexity": "complex"
    }
  ],
  "skipped": [
    { "functionName": "formatDate", "reason": "already covered in __tests__/formatDate.test.ts" }
  ],
  "existingTests": ["src/utils/__tests__/formatDate.test.ts"],
  "totalFunctions": 8,
  "needsTests": 5,
  "alreadyCovered": 3
}
```

If `functionList` is empty:
  → inform user "All functions in the changed files already have test coverage."
  → exit

## Step 2: 调度 unit-test-agent

Launch unit-test-agent (opus):

```
You are unit-test-agent. First read .claude/agents/unit-test-agent.md to understand your full responsibilities.
Then read skills/unit-test-generator/SKILL.md for the generation rules.

Input:
- functionList: {Step 1 output.functionList}
- testStyle: "{detected or specified test framework}"
- projectDir: "$projectDir"
- testSpecFile: "{testSpecFile path or null}"
- existingTests: {Step 1 output.existingTests}

Generate unit tests per your workflow. Return generated file paths and coverage summary.
```

Wait for agent to complete. Collect:
- `generatedFiles[]` — paths of generated test files
- `coverageSummary` — functions analyzed/skipped/generated counts
- `skipped[]` — functions skipped with reasons

## Step 3: 执行测试

Run the generated tests:

### Vitest
```bash
cd $projectDir && npx vitest run --reporter=json --outputFile=tests/reports/unit-test-results.json {generatedFiles}
```

### Jest
```bash
cd $projectDir && npx jest --json --outputFile=tests/reports/unit-test-results.json {generatedFiles}
```

### pytest
```bash
cd $projectDir && python -m pytest --json-report --json-report-file=tests/reports/unit-test-results.json {generatedFiles}
```

### 结果处理

```
If all tests pass:
  → proceed to Step 4 with success summary

If tests fail:
  Parse failure output:
  - 测试写错（assertion error on generated test logic）→ 修复测试代码
  - 代码 Bug（function behavior doesn't match expected）→ 标记为 potential bug

  For test errors (not code bugs):
    Read the failing test + source function
    Fix the test assertion or mock setup
    Re-run only the fixed tests (不要全量重跑)
    Max retry: 2 attempts per failing test

  For potential code bugs:
    Do NOT modify source code
    Record in report: "Potential bug: {functionName} returns X but expected Y"
```

## Step 4: 报告

Generate summary report:

```markdown
## Unit Test Report

### Summary
- Functions analyzed: {total}
- Already covered (skipped): {skipped}
- Tests generated: {generated}
- Total test cases: {cases}

### Results
- Passed: {pass} / {total}
- Failed: {fail} / {total}

### Generated Files
| File | Functions Covered | Test Cases | Status |
|------|-------------------|------------|--------|
| src/utils/__tests__/calculate.test.ts | calculateTotal, calculateDiscount | 7 | PASS |

### Skipped (already covered)
| Function | Existing Test |
|----------|---------------|
| formatDate | __tests__/formatDate.test.ts |

### Potential Bugs Detected
| Function | Expected | Actual | File:Line |
|----------|----------|--------|-----------|
| calculateTotal | 110 (with 10% tax) | 100 (tax not applied) | calculate.ts:28 |

### New Coverage
- Lines: +{N} lines covered
- Branches: +{N} branches covered
```

Output the summary directly to the user.
