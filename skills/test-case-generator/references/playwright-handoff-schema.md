# Handoff to Playwright E2E — Full Schema & Examples

After all test cases are generated, **ALWAYS** produce a `playwright-handoff-{slug}.json` file. This is **MANDATORY in ALL modes** (PRD, CDP, issue). Without handoff, playwright-script-generator will refuse to generate specs.

## Handoff Output Schema (Mandatory)

Each handoff entry MUST contain ALL of the following fields:

```json
{
  "id": "TC-PRD-CVPV-001",          // REQUIRED: matches TC ID in .md
  "storyId": "US-CVPV-PDF",          // REQUIRED: user story group
  "criterionId": "AC-001",           // REQUIRED: acceptance criterion
  "source": "prd",                    // REQUIRED: "prd" | "cdp" | "issue"
  "title": "PDF 文件正常预览展示",      // REQUIRED: same as .md title
  "priority": "P0",                   // REQUIRED: "P0" | "P1" | "P2"
  "scenarioType": "positive",         // REQUIRED: "positive" | "negative" | "boundary" | "error"
  "preconditions": ["Canvas 已加载 PDF 文件"],  // REQUIRED: array of strings
  "setup": [                          // REQUIRED: array (can be empty)
    { "type": "ui", "action": "Navigate to task page", "scope": "test" }
  ],
  "teardown": [],                     // REQUIRED: array (can be empty)
  "uiElements": [                     // REQUIRED: array
    {
      "role": "button",              // element role
      "name": "Download file",       // visible text/label
      "action": "click",             // "click" | "fill" | "select" | "hover" | "check" | "upload"
      "value": null,                 // value for fill/select actions
      "locatorHint": null,           // CSS selector hint from CDP baseline
      "dataType": null,              // "file.pdf" | "text.email" | etc.
      "dataVariant": null,           // "valid" | "invalid" | "boundary"
      "i18nKey": "canvas.downloadFile"  // i18n message key (null if not found)
    }
  ],
  "assertions": [                     // REQUIRED: at least 1 assertion
    {
      "type": "visible",             // "visible" | "hidden" | "text" | "url" | "count" | "enabled" | "disabled" | "attribute"
      "selector": "heading",         // role or CSS selector
      "name": "Welcome",             // element name/text
      "expected": null,              // expected value (for text/url/count/attribute types)
      "i18nKey": null                // i18n key for expected text
    }
  ],
  "tags": ["@P0", "@smoke", "@regression", "@full"],  // REQUIRED: priority + suite tags
  "timeout": null                     // null (default 60s) or 600000 (AI tasks)
}
```

**Validation**: After producing the handoff JSON, self-check:
- Entry count === "## Merged Test Case List" TC count
- Every entry has non-null: id, storyId, title, priority, assertions (length >= 1)
- Every assertion has non-null: type

## Step 1 — Write playwright-handoff-{slug}.json

Save to `test-cases/generated/playwright-handoff-{slug}.json`. **Each TC in the Merged Test Case List = exactly one handoff entry** (strict 1:1, NO merging). Each entry maps one test case to the data Playwright needs:

```json
[
  {
    "id": "TC-001",
    "storyId": "US-101",
    "criterionId": "AC-101-1",
    "title": "Delete task removes it from task list",
    "priority": "P0",
    "scenarioType": "positive",
    "setup": [
      { "type": "navigate", "url": "/tasks" },
      { "type": "ui", "action": "create", "resource": "task", "pomMethod": "createTask", "data": { "name": "Test-Del-{timestamp}" } }
    ],
    "preconditions": ["A task named 'Test-Del-{timestamp}' exists in the task list"],
    "action": "User clicks delete button on the task and confirms",
    "expectedOutcome": "Task is removed from the list",
    "uiElements": [
      { "role": "button",  "name": "Delete",  "action": "click", "value": null },
      { "role": "button",  "name": "Confirm", "action": "click", "value": null }
    ],
    "assertions": [
      { "type": "hidden", "selector": "text", "name": "Test-Del-{timestamp}" }
    ],
    "teardown": [],
    "tags": ["task-management", "crud"],
    "timeout": null
  }
]
```

**Field rules:**
- `setup[]` — Steps to create test data BEFORE the test action via UI. Each entry:
  - `type`: `"ui"` (UI interaction via POM method) | `"navigate"` (go to page)
  - `action`: `"create"` | `"update"` | `"navigate"`
  - `resource`: what to create (e.g., `"task"`, `"user"`, `"project"`)
  - `pomMethod`: POM method name to call (e.g., `"createTask"`)
  - `data`: creation data (passed to POM method)
  - `scope`: (optional) `"test"` (default) or `"worker"`.
    Set to `"worker"` when ALL of the following are true:
    1. The setup involves AI processing keywords (same keywords as timeout auto-detection above)
    2. The estimated setup time > 30 seconds
    3. The setup data is read-only for subsequent tests (not mutated by individual test cases)

    When `scope: "worker"`, playwright-script-generator generates a **worker-scope fixture** in `fixtures.ts` instead of inline `beforeAll`. This creates the data once per Playwright worker and shares it across all tests in that worker, avoiding redundant expensive setup.

    Example:
    ```json
    {
      "setup": [
        { "type": "ui", "action": "Create a recruiting task and wait for completion", "scope": "worker" }
      ]
    }
    ```
- `teardown[]` — Steps to clean up AFTER the test via UI. Same structure as `setup[]` but with `action: "delete"`
  - Empty `[]` when the test itself performs cleanup (e.g., delete test cleans up by nature)
- `preconditions[]` — Human-readable description of what setup creates (for documentation)
- `uiElements[].role` — use ARIA roles: `textbox`, `button`, `link`, `checkbox`, `combobox`, `heading`
- `uiElements[].action` — one of: `fill`, `click`, `select`, `check`, `uncheck`, `hover`, `press`
- `uiElements[].dataType` — (optional, for `fill` action only) declares the semantic data type this field expects. When present, playwright-script-generator uses it to resolve a concrete inline value instead of using the `value` field. Format: `"{category}.{type}"`. When `dataType` is set, `value` should be `null` (script-generator resolves it).
- `uiElements[].dataVariant` — (required when `dataType` is set) specifies the data variant: `"valid"`, `"invalid"`, `"boundary"`, or type-specific variants like `"strong"`, `"weak"`, `"long:500"`, `"xss"`, `"png"`, `"pdf"`, `"oversized"`, etc.
- `uiElements[].i18nKey` — (optional) The i18n message key corresponding to this element's user-visible text.
  Populated when `projectContext.i18nMessagesDir` is available:
  1. Read messages JSON from `$i18nMessagesDir/{defaultLocale}.json`（i18nMessagesDir 由命令层传入，指向 QA_WORKSPACE_DIR/messages/）
  2. For each uiElement with a text-based `name` (button label, heading text, placeholder):
     a. Search the messages JSON for a value matching the name text
     b. If found → set `i18nKey` to the dot-path key (e.g., "canvas.downloadFile")
     c. If not found → leave `i18nKey` as null (downstream uses regex fallback)
  3. When `i18nMessagesDir` is NOT available → all i18nKey values are null

  Example:
  ```json
  { "role": "button", "name": "Download file", "i18nKey": "canvas.downloadFile", "action": "click" }
  ```
- `assertions[].type` — one of: `url`, `visible`, `hidden`, `text`, `value`, `count`, `enabled`, `disabled`
- `assertions[].i18nKey` — (optional) For text assertions (type: "text", "heading", "label"), the i18n key of the expected text.
  When present, playwright-script-generator uses `i18n.t(key)` instead of hardcoded text.

  Example:
  ```json
  { "type": "text", "expected": "Download successful", "i18nKey": "toast.downloadSuccess" }
  ```
- `timeout` — default `null` (uses config default). **Auto-detection rule**: When generating each handoff entry, scan its `setup[]`, `preconditions[]`, and `action` text for AI/async keywords. If any match is found, automatically set `timeout: 600000`:

  | Keyword pattern (case-insensitive, in setup[].action or preconditions[]) | Reason |
  |--------------------------------------------------------------------------|--------|
  | send message, submit prompt, enter prompt, 发消息, 提交 | Triggers AI task execution |
  | wait for completion, task completed, 等待完成, 任务完成 | Long async wait |
  | create task, new task, 创建任务, 新建任务 | AI task creation |
  | file generation, generate file, 生成文件, 文件转换 | File processing |
  | Agent execution, agent task, Agent 执行 | Agent runtime |

  If NO keyword matches → `timeout: null` (config default 60s).
  If ANY keyword matches → `timeout: 600000` (10 minutes).
  This eliminates the manual burden on the generator — timeout is automatically inferred from context.
- `{timestamp}` — playwright-script-generator replaces with `Date.now()` in generated code
- For equivalence-class / boundary scenarios, include one entry per class with `value` set to the representative value
- For negative scenarios, set `assertions` to the expected error state (e.g. `{ "type": "visible", "selector": "alert" }`)

**dataType inference rules** — when generating handoff entries with `action: "fill"`, infer `dataType` from the field's semantic meaning:

| Field semantic (from label/name/placeholder) | dataType | dataVariant (positive) | dataVariant (negative) |
|----------------------------------------------|----------|----------------------|----------------------|
| Phone / mobile / 手机号 / 电话 | `contact.mobile` | `valid` | `invalid` |
| Email / 邮箱 / 电子邮件 | `contact.email` | `valid` | `invalid` |
| Name / 姓名 / 用户名 | `identity.name` | `valid` | `long:200` |
| ID card / 身份证 / 证件号 | `identity.idCard` | `valid` | `invalid` |
| Password / 密码 | `account.password` | `strong` | `weak` |
| Verification code / 验证码 | `account.captcha` | `valid` | `invalid` |
| Amount / price / 金额 / 价格 | `finance.amount` | `valid` | `boundary:0` |
| Bank card / 银行卡 | `finance.bankCard` | `valid` | `invalid` |
| Address / 地址 | `contact.address` | `valid` | `long:500` |
| Date / time / 日期 / 时间 | `datetime.date` | `past` or `future` | `invalid` |
| File upload / 上传 (input[type=file]) | `file.image` or `file.document` | `png` / `pdf` / `csv` | `oversized` / `empty` |
| Free text / description / 描述 / 备注 | `text.random` | `valid` | `xss` / `sqlInject` / `long:5000` / `emoji` |

> **When to set dataType**: For every `fill` action in positive AND negative test cases. Positive cases use valid variants, negative/boundary cases use invalid/edge variants. This ensures playwright-script-generator can resolve appropriate concrete values for each scenario type.
>
> **When NOT to set dataType**: For `click`, `select`, `check`, `hover`, `press` actions — these don't input text data. Also skip for fields where the exact value is dictated by business logic (e.g., a specific product SKU that must match a database record).

**Example with dataType:**
```json
{
  "uiElements": [
    { "role": "textbox", "name": "手机号", "action": "fill", "dataType": "contact.mobile", "dataVariant": "valid", "value": null },
    { "role": "textbox", "name": "密码", "action": "fill", "dataType": "account.password", "dataVariant": "strong", "value": null },
    { "role": "button", "name": "注册", "action": "click", "value": null }
  ]
}
```

**i18n key reverse-lookup** (when `projectContext.appLanguages` is set):

**Prerequisite check**: Before performing reverse-lookup:
- If `projectContext.i18nMessagesDir` is set AND `$i18nMessagesDir/{defaultLocale}.json` exists → proceed
- If `projectContext.appLanguages` is set but `i18nMessagesDir` is null or file missing → **WARNING**: "appLanguages={appLanguages} but i18n messages unavailable at {i18nMessagesDir}. All i18nKey fields will be null — downstream will use regex fallback instead of i18n.t(). Fix: check I18N_MESSAGES_DIR in .env and re-run command Phase 0". Skip reverse-lookup, leave all i18nKey as null.

After populating each handoff entry's uiElements and assertions, perform reverse-lookup:
1. Load `$i18nMessagesDir/{defaultLocale}.json`（i18nMessagesDir 由命令层传入，指向 QA_WORKSPACE_DIR/messages/；用 appLanguages 首语言作为 defaultLocale）
2. Build a flat map: { "Download file": "canvas.downloadFile", "Maximize": "canvas.maximize", ... }
3. For each uiElement.name and assertion.expected:
   a. Exact match in flat map → set i18nKey
   b. Case-insensitive match → set i18nKey
   c. No match → leave i18nKey null
4. This is a best-effort lookup. Missing keys are acceptable — downstream handles null gracefully via regex fallback.

## Step 2 — Invoke playwright-script-generator

After writing `playwright-handoff.json`, tell the user:

> Test cases written to `test-cases/generated/playwright-handoff-{feature}.json`.
> Now running `/playwright-script-generator` to implement these as Playwright `.spec.ts` files.

Then immediately apply the `playwright-script-generator` skill, passing the handoff file as the input source.

---

## Excel Export

> **Single source of truth**: Excel export is handled by `skills/excel-case-export/SKILL.md` using `generate-excel.js` (Node.js/exceljs).
> See that Skill for table structure, styling, column mapping, and invocation commands.
> Do not use any other Excel export method.

---

## Update Strategy for Requirement Changes

When the user provides an **updated requirements document**, do not rewrite all files from scratch. Execute the following process to precisely update only the affected artifacts.

### Complete Artifact Chain

Each requirements document change ultimately affects 7 types of files, all of which must be updated in coordination:

```
Requirements document (.md / Figma / Pencil)
  ├── [1] tests/generated/features/*.feature          — Gherkin test cases
  ├── [2] tests/generated/test_cases_data.json        — Excel data source (regenerated each time)
  ├── [3] tests/generated/test-cases.xlsx             — Manual test Excel (produced by script execution)
  ├── [4] tests/generated/traceability/traceability-matrix.json
  ├── [5] test-cases/generated/playwright-handoff-{feature}.json     — Automation handoff file
  ├── [6] tests/e2e/**/*.spec.ts                      — Playwright automated test cases
  └── [7] tests/pages/*.page.ts                       — Page Objects (when UI changes)

tools/ (one-time initialization, permanently reused, not rewritten with requirement changes)
  └── tests/utils/export_excel.py                    — Excel generation tool script
```

### Step 1 — Change identification

After receiving the updated requirements document, perform a **section-level diff** against the previous version:

1. Read the new requirements document (MD parsing / Figma MCP / Pencil MCP)
2. Compare against the existing `traceability-matrix.json`, using the `requirementSection` field as the key
3. For each functional module, determine the change type:

| Change type | Determination criteria | Handling |
|---|---|---|
| No change | Section content is identical to previous version | Skip, do not update any files |
| Content modified | Section exists but descriptions/rules/flows have changed | Regenerate all artifacts for that module |
| New module | No corresponding section in traceability | Create all artifacts for that module |
| Deleted module | Previous version had this section, new version does not | Delete or mark as deprecated (see below) |

> If it is impossible to automatically determine whether a section has changed (e.g., Figma has no version history), **ask the user** which modules have changed, then execute the corresponding actions.

### Step 2 — Execute updates by change type

#### Module content modified

Update all 7 artifact types for that module in sequence:

1. **feature file** — Delete the old `.feature` file, regenerate
2. **test_cases_data.json** — Replace the corresponding key (sheet) for that module
3. **Excel** — Only update the data JSON, execute `python tests/utils/export_excel.py` to regenerate `test-cases.xlsx`
4. **traceability-matrix.json** — Update entries for that module, preserve unchanged modules
5. **playwright-handoff.json** — Update handoff entries related to that module
6. **spec files** — Invoke the `playwright-script-generator` skill, passing the updated handoff, to rewrite the corresponding spec files
7. **Page Object** — If UI elements (locators, component names, interaction methods) have changed, synchronize updates to the corresponding `.page.ts`

#### New module

1. Create `tests/generated/features/<new-module>.feature`
2. Add a new sheet key in `test_cases_data.json`
3. Regenerate Excel (with a new Sheet added)
4. Append new module entries to the traceability-matrix
5. Append new module handoff entries to playwright-handoff.json
6. Invoke the `playwright-script-generator` skill to create corresponding spec files
7. If there are new pages/components, create or update Page Objects

#### Deleted module

**Do not directly delete files**. Instead:
1. Add a comment at the top of the corresponding `.feature` file: `# DEPRECATED: This module has been removed from requirements, version X.X`
2. Change the `status` of all entries for that module in the traceability-matrix to `"deprecated"`
3. Change the Excel Sheet tab color to gray, add `[Deprecated]` prefix to the header
4. Remove that module's entries from playwright-handoff.json
5. Add `test.skip` or `// DEPRECATED` comment at the top of the corresponding spec files
6. **Inform the user** which test cases have been deprecated, letting them decide whether to permanently delete

### Step 3 — Output change summary

After completing updates, report the full picture of changes to the user:

```
## Requirement Change Update Summary

Document version: V 1.0 → V 1.1
Update date: 2026-03-14

### Changed Modules

Modified (2 modules):
  - Canvas Download: Format conversion rules added txt→xlsx support
    → Updated: canvas-download.feature / Excel Canvas Download Sheet / spec / handoff
  - View All Files: Added search functionality
    → Updated: view-all-files.feature / Excel View All Files Sheet / spec / handoff

New (1 module):
  - File Share: Brand new functional module
    → Created: file-share.feature / Excel new Sheet / spec / Page Object

Deleted (0 modules)

### File Change List

| File | Operation |
|---|---|
| tests/generated/features/canvas-download.feature | Regenerated |
| tests/generated/features/view-all-files.feature | Regenerated |
| tests/generated/features/file-share.feature | Created |
| tests/generated/test-cases.xlsx | Regenerated (3 Sheets updated) |
| test-cases/generated/playwright-handoff-{feature}.json | Updated |
| tests/e2e/canvas/download.spec.ts | Regenerated |
| tests/e2e/canvas/view-all-files.spec.ts | Regenerated |
| tests/e2e/canvas/file-share.spec.ts | Created |
| tests/pages/file-share.page.ts | Created |
| tests/generated/traceability/traceability-matrix.json | Updated |

Test case changes: +8 new / ~12 modified / 0 deprecated
```

### Shortcut Command Conventions

Users can trigger update mode with the following inputs (execute directly without explanation):

| User input | Action |
|---|---|
| `Update requirements: <file path>` | Execute incremental update process |
| `Regenerate all test cases` | Delete all artifacts, generate everything from scratch |
| `Only update <module name>` | Only update the 7 artifact types for the specified module |
| `Delete test cases for <module name>` | Mark all artifacts for that module as deprecated |
