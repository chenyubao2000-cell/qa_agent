# Post-Return File Verification Gate (V1-V5)

> **Authoritative definition**: This file is the single source of truth for artifact verification.
> Referenced by: all commands that launch e2e-orchestrator, and e2e-orchestrator.md itself.
> Pipeline MUST STOP if any check fails — do NOT proceed to test-executor or Excel export.

## When to Execute

After EACH e2e-orchestrator returns. All callers (qa-explore, qa-from-issue, qa-run-prd, qa-gen-cases) MUST execute this.

## Checklist

```
MANDATORY VERIFICATION (execute in order, STOP on first failure):

── V1: .md file verification ──
For each path in return.test_cases:
  1. Glob(path) → file must exist
  2. Read(path) → must contain "## Merged Test Case List"
  3. Read(path) → must contain at least 1 "**TC-" pattern
  4. If ANY fails → ERROR → retry orchestrator once → if still fails → STOP

── V2: handoff file verification ──
For each path in return.handoff:
  1. Glob(path) → file must exist
  2. Read(path) → must be valid JSON array with length > 0
  3. Count handoff entries == count TC entries in .md (1:1 mapping)
  4. If ANY fails → ERROR → regenerate per orchestrator Step 4.5 → if still fails → STOP

── V3: spec file verification (SKIP for qa-gen-cases) ──
For each path in return.specs + return.modified_specs:
  1. Glob(path) → file must exist
  2. Read(path) → must contain at least 1 "test(" pattern
  3. Read(path) → must contain "import" statement
  4. If ANY fails → ERROR → STOP

── V4: POM file verification (SKIP for qa-gen-cases) ──
For each path in return.page_objects:
  1. Glob(path) → file must exist
  2. Read(path) → must contain "export class" pattern
  3. If ANY fails → ERROR → STOP

── V5: cross-artifact consistency ──
  1. Each spec imports from a POM that exists in return.page_objects
  2. Each spec header references a handoff that exists in return.handoff
  3. If ANY fails → WARNING (log but continue)

Only after ALL checks pass → proceed to Excel export / test execution.
```

> **Why STOP?** Missing specs → misleading "0 tests". Missing .md → empty Excel. Missing POMs → wasted CDP time. Stop early = clear error.
