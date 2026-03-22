---
description: Generate test cases + Excel from requirement documents, no script generation
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

You are a test case generator. Generate test cases and Excel from requirement documents (PRD, supports `.md` and `.docx`), **no Playwright script generation, no test execution, no Linear reporting**.

```
/qa-gen-cases [prd-path] [--output <output-dir>]
     |
Phase 0: Load project context (.env -> output directory)
     |
Phase 1: Read requirement document (.md / .docx)
     |
Phase 2: Generate cases + Export Excel
```

## User Intent Parsing

Parse from `$ARGUMENTS`:
- Contains file path (`.md` or `.docx`) -> use as PRD path
- `--output <dir>` -> override default output directory
- No arguments -> look for `.md` and `.docx` files under `$SOURCE_PROJECT_DIR/docs/prd/`

## Phase 0: Load Context

Read `.env` to get `QA_WORKSPACE_DIR` (default artifact output directory) and `SOURCE_PROJECT_DIR` (PRD/source code directory).

```
Read(".env")
```

Determine output directory (priority):
1. `--output` parameter in `$ARGUMENTS`
2. `QA_WORKSPACE_DIR` in `.env`
3. Current working directory

Ensure output directory exists (create if not):
```bash
mkdir -p $OUTPUT_DIR/test-cases/generated $OUTPUT_DIR/test-cases/excel
```

## Phase 1: Read Requirement Document

Read PRD file (`$ARGUMENTS` or default `$SOURCE_PROJECT_DIR/docs/prd/`).

### Supported Document Formats

| Format | Processing Method |
|--------|------------------|
| `.md` | Read directly with `Read()` |
| `.docx` | First convert to text with `python3`, then parse (see below) |

#### .docx Conversion

```bash
python3 -c "
import sys
try:
    from docx import Document
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'python-docx', '-q'])
    from docx import Document

doc = Document(sys.argv[1])
for para in doc.paragraphs:
    print(para.text)
for table in doc.tables:
    for row in table.rows:
        print(' | '.join(cell.text for cell in row.cells))
" "$PRD_FILE" > "$OUTPUT_DIR/test-cases/generated/_prd-converted.md"
```

The converted `.md` file serves as input for subsequent steps.

### PRD Module Splitting Strategy

When PRD contains multiple feature modules, split by `##` level headings into independent modules, each generating cases independently.

### PRD Change Detection (same mechanism as /qa-run-prd)

Before generating, detect which PRD modules have changed since last generation:

```
1. Read existing .md files: Glob("$OUTPUT_DIR/test-cases/generated/*-prd.md")
2. For each existing .md, extract PRD-hash from header: <!-- PRD-hash: {hash} -->
3. For each current PRD module, compute content hash (sha256)
4. Compare:
   - Hash matches → prdChangeMode: "none" (skip, existing cases up-to-date)
   - Hash differs → prdChangeMode: "updated" (incremental update)
   - No existing .md → prdChangeMode: "new" (generate from scratch)
   - Existing .md but module removed from PRD → prdChangeMode: "removed" (mark deprecated)
```

## Phase 2: Generate Cases + Export Excel

For each module based on its `prdChangeMode`:
- `"none"` → skip (existing .md and Excel are up-to-date)
- `"removed"` → add deprecation header to existing .md: `<!-- DEPRECATED: module removed from PRD -->`
- `"new"` or `"updated"` → launch case-only-orchestrator

Launch **case-only-orchestrator** (sonnet), only execute case generation and Excel export, skip script generation.

**Agent prompt**:
```
You are a test case generation expert. First read the following two SKILL files for specifications:
1. skills/test-case-generator/SKILL.md — case generation specification
2. skills/excel-case-export/SKILL.md — Excel export specification

Input:
- source: "prd"
- prdFiles: [PRD file path list, .md or already-converted .md]
- prdModuleScope: "{module heading}"
- prdChangeMode: "new" | "updated"
- projectContext:
    targetProjectDir: {OUTPUT_DIR}
    sourceProjectDir: {SOURCE_PROJECT_DIR}

Tasks:
1. Ensure output directories exist: mkdir -p $targetProjectDir/test-cases/generated $targetProjectDir/test-cases/excel
2. If prdChangeMode is "new":
   - Generate cases from scratch per test-case-generator SKILL
   - Output: $targetProjectDir/test-cases/generated/{feature}-prd.md
   - Include header: <!-- PRD-hash: {sha256(module text)} -->
3. If prdChangeMode is "updated":
   - Read existing $targetProjectDir/test-cases/generated/{feature}-prd.md
   - Diff PRD requirements against existing cases:
     - Requirement unchanged → keep existing case
     - Requirement modified → update case with new expected behavior
     - New requirement → add new case
     - Requirement removed → mark case as DEPRECATED
   - Update PRD-hash in header

Important constraints:
- Only generate case documents (.md) and handoff JSON
- Do not generate Playwright scripts (.test.ts)
- Do not generate Page Objects (.page.ts)
- Do not modify any files under the target project's tests/ directory
- Do not execute tests, analyze reports, or report to Linear

> **Why generate handoff?** The handoff JSON is a mandatory output of test-case-generator SKILL (1:1 mapping with Merged TC List). Generating it here prepares for future `/qa-run-prd` runs — the orchestrator can skip case generation and directly consume the existing handoff for spec generation.

Return artifact paths:
{
  "source": "prd",
  "prdChangeMode": "new|updated",
  "test_cases": ["test-cases/generated/xxx-prd.md"],
  "handoff": ["test-cases/generated/playwright-handoff-xxx.json"],
  "excel": ["test-cases/excel/xxx-prd.xlsx"]
}
```

### Post-Generation Verification (mandatory)

After the subagent returns, the main command MUST verify that files were actually written to disk:

```
1. For each test_cases path in the return value:
   - Check file exists: Read(path) or Glob
   - If file NOT found → ERROR: "Subagent reported success but file not written: {path}"
   - Retry: re-launch subagent with explicit instruction to use Write tool

2. For each .md file, validate:
   - Contains "## Merged Test Case List" section (method enforcement check)
   - Contains at least 1 "**TC-" pattern (has actual cases)
   - If validation fails → report to user, do not silently succeed
```

> **Why this is needed**: Subagents run in isolated contexts. If a subagent's Write call fails silently (permission, path issue), the subagent may report success while no file was written. This verification catches that.

### Excel Export (command layer, after all subagents complete + verification pass)

```bash
node skills/excel-case-export/scripts/generate-excel.js \
  --input-dir $OUTPUT_DIR/test-cases/generated \
  --output $OUTPUT_DIR/test-cases/excel/{prd-name}-all-cases.xlsx
```

**Verify Excel output**:
```
if NOT Glob("$OUTPUT_DIR/test-cases/excel/{prd-name}-all-cases.xlsx"):
  ERROR: "Excel export failed — file not written"
  Retry: re-run generate-excel.js
```

## Artifacts

| File | Description |
|------|-------------|
| `test-cases/generated/{feature}-prd.md` | Markdown test case document |
| `test-cases/generated/playwright-handoff-{slug}.json` | Playwright handoff (1:1 TC mapping, for future spec generation) |
| `test-cases/excel/{feature}-prd.xlsx` | Excel test case spreadsheet |

Only these three file types are produced, no scripts or test files.
