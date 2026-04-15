# Input Extraction — Design Tools & CDP Live Pages

This file covers input extraction from: Figma MCP, Pencil MCP, and Chrome CDP live page mode.

---

## Extracting Requirements from Figma via MCP

When the user provides a Figma file URL or node ID and the Figma MCP server is available, use MCP tools to pull structured design data.

### Step 1 — Resolve the file and target nodes

Parse the user's input to extract `fileKey` and optional `nodeId`:
```
https://www.figma.com/file/{fileKey}/...?node-id={nodeId}
```

Then call:
```
mcp__figma__get_file({ fileKey })
mcp__figma__get_file_nodes({ fileKey, ids: [nodeId] })
mcp__figma__get_images({ fileKey, ids: [nodeId] })   // optional preview
```

### Step 2 — Walk the node tree and classify elements

| Figma node type | UI role | Test implications |
|---|---|---|
| `TEXT` with name containing "label", "hint", "placeholder" | Input label / placeholder | Test label presence, placeholder disappears on focus |
| `INSTANCE` of "Button", "CTA" | Button | Test enabled/disabled states, click triggers action |
| `INSTANCE` named "Input", "TextField", "TextArea" | Form input | Test valid/invalid/boundary values, required flag |
| `INSTANCE` named "Checkbox", "Radio", "Toggle" | Selection control | Test checked/unchecked states |
| `INSTANCE` named "Dropdown", "Select", "Combobox" | Dropdown | Test option selection, default value, empty state |
| `INSTANCE` named "Error", "Alert", "Toast", "Banner" | Feedback | Test trigger condition, message content, dismissal |
| `FRAME` or `COMPONENT` at top level | Screen / page | Represents one user-facing view |
| `VECTOR` / `BOOLEAN_OPERATION` with fill color red/amber/green | Status indicator | Test each status state |

Also extract:
- **`characters`** on TEXT nodes → labels, error text, placeholder text
- **`componentProperties`** → `disabled`, `error`, `required`, `variant` props
- **`interactions`** (prototype connections) → trigger → destination frame

### Step 3 — Derive user stories from frames and flows

For each top-level FRAME, create one user story. For each interactive element and its states, write acceptance criteria.

### Step 4 — Extract implicit test cases from design tokens

- `required = true` → submit with field empty test
- `disabled = true` → verify enabling condition
- `maxLength` or counter → boundary tests
- `ON_HOVER` trigger → tooltip / hover state tests
- Multiple variants → one test per variant
- Color styles "error", "warning", "success" → state rendering tests

---

## Extracting Requirements from Pencil via MCP

When the user provides a Pencil project file (`.ep` or `.epz`) and the Pencil MCP server is available.

### Step 1 — Open the project and list pages

```
mcp__pencil__open_project({ filePath })
mcp__pencil__list_pages()
```

### Step 2 — Extract shapes per page

```
mcp__pencil__get_page_shapes({ pageId })
```

| Pencil shape / stencil | UI role | Test implications |
|---|---|---|
| `Input Box`, `Single-line Input` | Text input | Test valid/invalid/boundary, required |
| `Multiline Input`, `Text Area` | Textarea | Test length constraints |
| `Button`, `PushButton` | Button | Test enabled/disabled, click action |
| `Checkbox` | Checkbox | Test checked/unchecked state |
| `Radio Button` | Radio | Test selection, mutual exclusivity |
| `Combobox`, `Drop-down List` | Dropdown | Test option selection, default |
| `Label` with `*` suffix | Required field marker | Test empty submission |
| `Note`, `Callout` | Design annotation | Read as acceptance criterion hint |
| `Link` | Navigation | Test navigation target |

Also extract:
- **Shape label / `textContent`** → button labels, field labels, error text
- **Shape notes / annotations** → treat each note as candidate acceptance criterion
- **Page names** → screen identifier for user story narrative
- **Page-to-page links** → trace as user flows

### Step 3 — Derive stories and criteria (same as Figma Step 3)

### Step 4 — Extract implicit tests from Pencil annotations

- Shape notes containing "must", "should", "shall" → direct acceptance criteria
- Shapes with red border/fill → error/validation state tests
- Greyed-out / low-opacity shapes → disabled state tests
- Repeated similar shapes across pages → enumerate each state as test case

---

## Generating Test Cases from Chrome CDP Live Pages (No Requirements Document Mode)

> **Applicable scenario**: No requirements document provided, Chrome is running with the target page open. Explore the real DOM via CDP, infer testable user stories, then follow standard test case generation.

### Trigger Condition Determination

| User input | Mode |
|---|---|
| Provided `.md` / Figma / Pencil | **Requirements document driven**, do not enter this section |
| "generate test cases for this page", no requirements doc | **CDP live page mode** |
| Both provided | Requirements first; CDP only validates locators |

### Step 1 — Read the CDP baseline JSON

> **This Skill does not directly connect to Chrome, nor does it call any chrome-devtools MCP tools.**
> The baseline JSON is pre-generated by the command layer via the cdp-explorer SKILL.

The baseline contains:
- Multi-state data: Initial page + hidden states
- State flow graph: Interaction → state transition records
- Form constraints: required, maxlength, pattern, etc.
- Dangerous action markers

**Baseline → handoff field mapping**:

| Baseline element field | Handoff `uiElements[]` field | Rule |
|---|---|---|
| `text` (or `ariaLabel` if text empty) | `name` | Visible text becomes the locator name |
| `role` | `role` | Direct mapping |
| `locatorHint` | `locatorHint` | Direct copy |
| `i18nKey` | `i18nKey` | Direct copy |

### Step 2 — Deduplication check (before generation)

Scan existing artifacts to avoid duplicates:

```
Glob("$QA_WORKSPACE_DIR/test-cases/generated/*.md")
Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts")
```

### Step 3 — Infer user stories from the state flow graph

Traverse each state and its interactive elements, generating user stories:

**Inference priority (from baseline element attributes):**

| Element characteristic | Inferred test scenario |
|---|---|
| `disabled: true` | Verify enabling condition |
| `required: true` | Empty submission test |
| `maxLength` present | Boundary value test: maxLength and maxLength+1 |
| State flow graph has dialog state | Dialog open/close test |
| State flow graph has tab switching | Tab switching content test |
| `role=alert` / alerts[] | Error state trigger test |
| dangerousActions[] | Confirmation dialog test |
| forms[].submitButton.disabled | Form validation test |
| externalLinks[] | External link reachability test |

### Step 4 — Generate test cases (same artifacts as requirements mode)

1. **test_cases_data.json** — Key named `<page name> (CDP Inferred)`
2. **Excel** — Orange tab color (distinguishes from blue requirements-driven tabs)
3. **playwright-handoff-{slug}.json** — MANDATORY. Each TC = one handoff entry (1:1). `uiElements` use real selectors from baseline.
4. **traceability-matrix.json** — criterionId format `CDP-<pageSlug>-<sequence>`

### Step 5 — Handoff to playwright-script-generator

CDP mode handoff's `locatorHint` field already contains precise selectors — playwright-script-generator should prioritize using them.

### Comparison of Artifacts Between the Two Modes

| Artifact | Requirements Document Mode | CDP Live Page Mode |
|---|---|---|
| tag | `@canvas-download` `@positive` | `@cdp-inferred` `@canvas-download` |
| criterionId | `FR-3.1` (from requirements) | `CDP-canvas-download-01` |
| Excel tab color | Default (blue) | Orange with `[CDP]` prefix |
| traceability source | Requirements document section | Page URL + snapshot time |
| locator precision | Inferred (may need adjustment) | From real DOM (high confidence) |
| business rule coverage | Complete (from requirements) | Only UI-visible rules |
