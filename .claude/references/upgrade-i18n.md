# --upgrade-i18n Flow

> **Used by**: `/qa-fix-tests` when `--upgrade-i18n` flag is present.
> Upgrades existing spec/POM files from hardcoded single-language text to i18n.t() multi-language patterns.

## Scenario

Initially explored and generated spec/POM in a single language (e.g., English), then later set `APP_LANGUAGES=en,zh` to support multi-language.
Existing POMs use hardcoded English (`getByRole('button', { name: 'Download file' })`), incompatible with Chinese environment.

## Precondition Check

- `APP_LANGUAGES` must be set in .env → if not: ERROR "APP_LANGUAGES not set, nothing to upgrade"
- `$QA_WORKSPACE_DIR/messages/` must contain .json files for all languages → if not: ERROR "i18n message files missing, run Phase 0 Step 2b-1 first"
- Spec files must exist (from arguments or Glob `tests/e2e/testcases/**/*.test.ts`) → if empty: ERROR "No spec files found to upgrade"
- For each spec, infer handoff path from spec header `// handoff: ...` → if handoff file missing: WARNING "Handoff not found for {specFile}, i18n key reverse-lookup will be limited to POM text scanning"

## Execution

1. **Skip Phase 1** (no test execution)
2. **Skip Phase 2** (no CDP fixes)
3. **Execute i18n upgrade flow**:

```
Determine spec file list:
- If specific files provided in `$ARGUMENTS` (after `--upgrade-i18n`): use those files only
  Example: `/qa-fix-tests --upgrade-i18n tests/e2e/testcases/generated/task-cdp.test.ts`
- If no files specified: Glob all `$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts` (upgrade entire project)

For each spec file:
  1. Read the spec's corresponding POM file (inferred from import)
  1.5. **Read source component (when sourceProjectDir available)**:
       Grep sourceProjectDir for the component rendering this spec's page.
       Extract all `t("key")` / `useTranslations("namespace")` calls → build element→i18nKey mapping.
       This is MORE accurate than reverse-lookup (Step 3) because it knows WHICH element uses WHICH key.
  2. Read i18n messages JSON from $QA_WORKSPACE_DIR/messages/{defaultLocale}.json
  3. Build flat value→key map: { "Download file": "canvas.downloadFile", ... }
     Merge with source-extracted element→key mapping from Step 1.5 (source wins on conflicts).
  4. Scan POM for all hardcoded text patterns:
     - getByRole('button', { name: 'Download file' })
     - getByText('Loading...')
     - getByLabel('Email')
     - locator('[title="Download file"]')
  5. For each hardcoded text found:
     a. Reverse-lookup in i18n flat map → find i18nKey
     b. If found → replace with i18n.t() pattern:
        BEFORE: getByRole('button', { name: 'Download file' })
        AFTER:  this.i18n
                  ? this.page.getByRole('button', { name: this.i18n.t('canvas.downloadFile') })
                  : this.page.getByRole('button', { name: /Download file/i })
     c. If NOT found → keep original (language-agnostic or regex already)

  **Locator conflict resolution**:
  - Language-agnostic locators (CSS class, `[title="..."]`, `[data-testid="..."]`) → **do not upgrade**, keep as-is
    These locators are language-independent; converting to i18n would reduce stability
  - getByRole with hardcoded English name → **upgrade** to i18n.t()
  - getByText with hardcoded text → **upgrade** to i18n.t()
  - Already has i18n.t() → **skip** (already upgraded)
  - Already has bilingual regex (/English|Chinese/i) → **upgrade** to i18n.t() (more precise)

  **Error handling**:
  - i18n message file does not exist → ERROR: "I18N_MESSAGES_DIR target {path}/{locale}.json not found, check .env configuration", abort upgrade
  - i18n JSON parse failure → ERROR: "Message file format error: {path}", abort upgrade
  - Reverse-lookup hit rate < 30% → WARNING: "Only {N}% of text locators matched an i18n key, consider checking if I18N_MESSAGES_DIR is correct", continue execution

  6. Update POM constructor: add `i18n?: I18n` parameter if not already present
  7. Update spec: add `i18n` destructuring from fixture, pass to POM constructor
  8. **Update handoff JSON** (MANDATORY, after all POM updates complete):
     Pre-check: For each spec, infer handoff path from header `// handoff: ...`.
     If handoff not found → WARNING: "Handoff missing for {spec}, skipping i18n key update"
     For each spec with valid handoff:
     a. Read handoff JSON. If parse fails → ERROR: "Handoff corrupted", skip this spec
     b. For each uiElement upgraded to i18n.t() → set uiElement.i18nKey
     c. For each assertion with i18n text match → set assertion.i18nKey
     d. Write via atomic pattern: backup → temp file → verify → rename (per `.claude/references/handoff-sync.md`)
     e. Log summary: "Updated {N} handoff files, {M} skipped"
```

4. **Update fixtures.ts**: If i18n fixture does not exist, generate per qa-explore Phase 0 Step 2e specification
5. **Update playwright.config.ts**: If multi-project is not configured, regenerate per qa-explore Phase 0 Step 2d specification
6. **Verify**: For each upgraded spec, run `--project=e2e-en` and `--project=e2e-zh` separately to verify

```
/qa-fix-tests --upgrade-i18n
  → Upgrade all spec/POM to i18n mode
/qa-fix-tests --upgrade-i18n tests/e2e/testcases/generated/canvas-preview-prd.test.ts
  → Upgrade only the specified file
```

> **Preserves existing fixes**: upgrade-i18n does not delete files, only replaces text patterns. Previously CDP-fixed locators (e.g., `button[title="Download file"]`) are unaffected (title attribute is language-agnostic). Only text-matching locators like getByText/getByRole name are upgraded.
