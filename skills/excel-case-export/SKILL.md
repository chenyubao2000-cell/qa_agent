---
name: excel-case-export
description: Export Markdown test cases to Excel files. Activated when the task involves "export Excel" or "case spreadsheet".
---

# Excel Test Case Export Specification

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
| I  | Test Type | Positive/Negative/Boundary |
| J  | Execution Result | Empty (for manual testing) |
| K  | Remarks | Empty |

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
