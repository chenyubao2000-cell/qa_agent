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
  4. i18n lint (SKIP when APP_LANGUAGES is unset) — see `.claude/references/i18n-locator-rules.md`:
     a. FAIL if spec contains `storageState:\s*['\"]playwright/\.auth/user\.json['\"]` (hardcoded single-locale path)
     b. FAIL if spec contains a naked locator with translatable text NOT wrapped in i18nRegex/i18n.t:
        Grep -nE 'getByRole\([^)]*name:\s*["\x27][^"/\x27]*[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af][^"/\x27]*["\x27]' — matches a literal Chinese/Japanese/Korean string
        Whitelist: lines mentioning `i18n`, `i18nRegex`, `case0[0-9]_`, or fixed English sr-only labels (Submit/Close/Upload files)
     c. WARN (not FAIL) if spec contains `/…|…|…/` regex concatenating locale-specific strings without matching count of locales in APP_LANGUAGES
  5. If ANY hard check fails → ERROR → STOP

── V4: POM file verification (SKIP for qa-gen-cases) ──
For each path in return.page_objects:
  1. Glob(path) → file must exist
  2. Read(path) → must contain "export class" pattern
  3. i18n lint (SKIP when APP_LANGUAGES is unset):
     a. FAIL on hardcoded translatable literals per V3 step 4b (same grep, same whitelist)
     b. FAIL on hardcoded quantifier/unit pairs — Grep -nE '["\x27/][^"\x27/]*\d+\s*(人|人数|candidat|candidate|personne|명|人目)[^"\x27/]*["\x27/]'
        (Use `\|\s*\d+\b` or localeFromProjectName-aware i18nRegex instead. See rule D2.)
     c. FAIL on i18n-keyed locators targeting third-party sr-only labels — for example `i18n.t("canvas.close")` matched against Radix Dialog's built-in close button whose label is the English literal "Close". Rule D4.
  4. If ANY hard check fails → ERROR → STOP

── V5: cross-artifact consistency ──
  1. Each spec imports from a POM that exists in return.page_objects
  2. Each spec header references a handoff that exists in return.handoff
  3. If ANY fails → WARNING (log but continue)

Only after ALL checks pass → proceed to Excel export / test execution.
```

> **Why STOP?** Missing specs → misleading "0 tests". Missing .md → empty Excel. Missing POMs → wasted CDP time. Stop early = clear error.
