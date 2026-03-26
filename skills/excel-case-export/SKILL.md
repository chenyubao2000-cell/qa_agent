---
name: excel-case-export
description: Export Markdown test cases to Excel files. Activated when the task involves "export Excel" or "case spreadsheet".
allowed_tools: [Read, Write, Bash, Glob]
---

# Excel Test Case Export Specification

## Critical Workflow: Design → Merge → Complete List

> **This is the mandatory workflow. Every test case generation must follow this sequence.**

```
Step 1: Apply each design method independently
        Method 1 (Equivalence Partitioning) → case set A
        Method 2 (Boundary Value Analysis) → case set B
        Method 3 (Cause-Effect Graph / Decision Table) → case set C
        Method 4 (State Transition Testing) → case set D
        Method 5 (Scenario Method) → case set E
        Method 6 (Error Guessing) → case set F
             ↓
Step 2: Merge all case sets → deduplicate → resolve conflicts
        - Remove duplicates: same input + same operation + same expected result = duplicate
        - Resolve conflicts: different methods producing contradictory expected results → investigate and keep the correct one
        - Consolidate: multiple valid equivalence classes covered by separate cases → merge into fewer cases where possible
             ↓
Step 3: Generate the complete, unified test case list
        - Assign final sequential Case IDs (TC-{mod}-001, 002, ...)
        - Assign final priority (P0/P1/P2) based on risk assessment
        - Output as the definitive Markdown file → feed into Excel export
```

**Why this matters**: Each design method has blind spots. Equivalence partitioning may miss state transitions; scenario method may miss boundary values; error guessing may overlap with other methods. Only by applying all applicable methods first, then merging and deduplicating, can you produce a complete and non-redundant test case list.

## Input

Markdown test case files located in test-cases/generated/{feature}.md.

## Output

test-cases/excel/{feature}.xlsx

## Excel Table Structure

| Column | Field | Description |
|--------|-------|-------------|
| A  | Case ID | TC-{mod}-{seq} |
| B  | Feature Module | Associated feature |
| C  | Case Title | Descriptive title |
| D  | Priority | P0/P1/P2 |
| E  | Preconditions | Given |
| F  | Steps | When |
| G  | Expected Result | Then |
| H  | Test Data | Specific values |
| I  | Test Type | Positive/Negative/Boundary, or Valid/Invalid equivalence class |
| J  | Execution Result | Empty (for manual testing) |
| K  | Remarks | Condition combination IDs from equivalence partitioning (if applicable) |

### Column Mapping from Test Case Design Methods

The test-case-generator SKILL outputs test cases in Markdown tables with method-specific columns. The generate-excel.js script automatically maps them to the Excel structure above:

| Method Output Column | Excel Column | Notes |
|---------------------|-------------|-------|
| Case ID / 用例编号 | A (Case ID) | |
| Valid/Invalid Equivalence Class / 有效还是无效等价类 | I (Test Type) | Method 1 only |
| Case Level / 用例等级 | D (Priority) | P0/P1/P2 |
| Case Name / 用例名 | C (Case Title) | |
| Input Conditions / 输入条件 | E (Preconditions) | |
| Operations / 操作 | F (Steps) | |
| Expected Result / 预期结果 | G (Expected Result) | |
| Related Condition Combination IDs / 条件组合编号 | K (Remarks) | Method 1 only |

## Styling Requirements

- Header row: bold, light blue background, centered
- Priority cell coloring: P0 red, P1 orange, P2 yellow
- Column width auto-fit to content
- Freeze first row
- Auto-filter

## Implementation

Uses skills/excel-case-export/scripts/generate-excel.js (based on exceljs library):

```bash
# Single file → single Sheet
node skills/excel-case-export/scripts/generate-excel.js \
  --input test-cases/generated/{feature}.md \
  --output test-cases/excel/{feature}.xlsx

# Multiple files → one Sheet per file (comma-separated)
node skills/excel-case-export/scripts/generate-excel.js \
  --input test-cases/generated/a.md,test-cases/generated/b.md \
  --output test-cases/excel/all-cases.xlsx

# Entire directory → one Sheet per .md file
node skills/excel-case-export/scripts/generate-excel.js \
  --input-dir test-cases/generated \
  --output test-cases/excel/all-cases.xlsx
```

## Test Case Design: Scenario Method

The scenario method simulates different scenarios from requirements to cover all functional points and business flows, thereby designing test cases.

The scenario method primarily involves identifying basic flows and alternative flows. The basic flow is the correct business process, simulating the user's correct business operations. The alternative flow is the incorrect business process, simulating the user's incorrect business operations.

A basic flow has only one starting point and one ending point. The basic flow is the main process; alternative flows are sub-processes. An alternative flow can originate from the basic flow or from other alternative flows. The endpoint of an alternative flow can be a process exit or a return to another flow's entry point. When alternative flows converge, which merges into which depends on traffic volume — i.e., the likelihood of the flow occurring. Lower-traffic alternative flows merge into higher-traffic alternative flows. If two equally significant basic flows appear in a flow diagram, they should generally be treated as separate business processes.

When using the scenario method, different scenarios must be tested to ensure comprehensive system testing.

When designing different scenarios, follow the principle that every alternative flow is covered, with exactly one loop coverage.

**Using the scenario method requires the following steps:**

### Step 1: Identify all flows

Find all basic flows and all alternative flows corresponding to the requirements under test.

### Step 2: Combine flows into scenarios

Combine basic flows and alternative flows to form different test scenarios.

### Step 3: Convert scenarios into test cases

Output test cases with one row per test case. Test cases should cover all inputs, conditions, and scenarios to ensure comprehensive system testing. Confirm that test case coverage logic is complete and non-redundant. Cover all situations and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Step 3: \<step 3 reasoning\>
- Test cases: \<response to customer\>

### Step 4: Output test cases as Markdown table

Format: [Case ID] [Case Level] [Case Name] [Input Conditions] [Operations] [Expected Result]

Think step by step.
