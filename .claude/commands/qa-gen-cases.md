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

Also extract (if present):
- `APP_LANGUAGES` — comma-separated language codes for multi-language testing
- `I18N_MESSAGES_DIR` — i18n message file source path (Phase 0 copies to QA_WORKSPACE_DIR/messages/)

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

> **Note**: qa-gen-cases intentionally does NOT execute `.claude/references/phase-0-workspace-init.md` (no test infrastructure needed for case-only generation). It only creates the output directory.
> Full workspace init (playwright.config.ts, fixtures.ts, auth.setup.ts, i18n messages) is handled by `/qa-run-prd` or `/qa-explore` when scripts are generated.
> If you need i18n-aware case generation, the orchestrator reads `i18nMessagesDir` from projectContext for key annotation only — no local message copies required.

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
- `"new"` or `"updated"` → launch e2e-orchestrator (case-only mode)

Launch **e2e-orchestrator** (sonnet) with `skipScriptGeneration: true`.
The orchestrator executes Steps 1–4.5 (case generation + handoff), skips Steps 4.6–5 (source pre-read + script generation).

**Agent prompt**:
```
You are e2e-orchestrator. First read .claude/agents/e2e-orchestrator.md.

Execute Steps 1–3 (determine input, dedup, generate cases) and Step 4.5 (validate handoff).
SKIP Steps 4.6 and 5 (source pre-read and script generation) — this run is case-only.

Also read these SKILL files for specifications:
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
    appLanguages: {APP_LANGUAGES or null}
    i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}

Tasks:
1. Ensure output directories exist: mkdir -p $targetProjectDir/test-cases/generated $targetProjectDir/test-cases/excel
2. If prdChangeMode is "new":
   - Generate cases from scratch per test-case-generator SKILL
   - Output: $targetProjectDir/test-cases/generated/{slug}-prd.md
   - Include header: <!-- PRD-hash: {sha256(module text)} -->
3. If prdChangeMode is "updated":
   - Read existing $targetProjectDir/test-cases/generated/{slug}-prd.md
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

### Post-Generation Verification (MANDATORY — V1-V2 gate)

After the subagent returns, execute `.claude/references/verification-gate-v1-v5.md` Steps V1 (.md) and V2 (handoff) only. Skip V3-V5 (no specs/POMs in case-only mode). Pipeline STOPS if any check fails — do NOT proceed to Excel export.

```
1. For each test_cases path in the return value:
   - Check file exists: Read(path) or Glob
   - If file NOT found → ERROR: "Subagent reported success but file not written: {path}"
   - Retry: re-launch subagent with explicit instruction to use Write tool

2. For each .md file, validate:
   - Contains "## Merged Test Case List" section (method enforcement check)
   - Contains at least 1 "**TC-" pattern (has actual cases)
   - If validation fails → report to user, do not silently succeed

3. For each handoff path in the return value:
   - Check file exists: Glob(path)
   - If file NOT found → ERROR: "Subagent reported success but handoff not written: {path}"
   - Retry: re-launch subagent with explicit instruction to use Write tool
   - If file exists: validate it is a valid JSON array with at least 1 entry
   - Count handoff entries == count TC entries in .md (1:1 mapping per verification-gate-v1-v5.md V2)
```

> **Why this is needed**: Subagents run in isolated contexts. If a subagent's Write call fails silently (permission, path issue), the subagent may report success while no file was written. This verification catches that.

### Excel Export (command layer, after all subagents complete + verification pass)

```bash
node skills/excel-case-export/scripts/generate-excel.js \
  --input-dir $OUTPUT_DIR/test-cases/generated \
  --output $OUTPUT_DIR/test-cases/excel/{prd-name}-all-cases.xlsx
```

**Verify Excel output** (same gate as other commands):
```
if NOT Glob("$OUTPUT_DIR/test-cases/excel/{prd-name}-all-cases.xlsx"):
  WARN: "Excel export failed — retrying..."
  Re-run generate-excel.js
  if still NOT found → ERROR: "Excel export failed after retry — file not written"
```

## Artifacts

| File | Description |
|------|-------------|
| `test-cases/generated/{slug}-prd.md` | Markdown test case document (`{slug}` = feature name in kebab-case) |
| `test-cases/generated/playwright-handoff-{slug}.json` | Playwright handoff (1:1 TC mapping, for future spec generation) |
| `test-cases/excel/{slug}-prd.xlsx` | Excel test case spreadsheet |

Only these three file types are produced, no scripts or test files.
