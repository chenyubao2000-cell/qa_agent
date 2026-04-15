# Input Extraction — Requirements Documents

This file covers input extraction from: Requirements + Design alignment mode, Word/plain-text, and Markdown documents.

---

## Requirements and Design Alignment (MD x Figma/Pencil)

When the user provides **both** a Markdown requirements document and Figma/Pencil design assets, **do not** generate test cases independently from each source. You must first execute the alignment process, merging information from both sides into a unified test specification, then generate test cases.

> MD provides "what to do, why, and business rules"; design assets provide "how to do it, what UI to use, and what interaction states exist." Neither is complete on its own — both are essential.

### Step 1 — Extract separately, build indexes

**Extract requirements index from MD**:

```
RequirementIndex = [
  {
    reqId:    "FR-2.1",
    section:  "User Login",
    keywords: ["login", "email", "password", "validation"],
    rules:    ["Email format validation", "Lock after 5 consecutive failures"],
    criteria: ["Given ... When ... Then ..."]
  },
  ...
]
```

**Extract design index from Figma/Pencil**:

```
DesignIndex = [
  {
    screenId:   "Frame:Login",
    screenName: "Login Page",
    keywords:   ["login", "email", "password", "Sign in"],
    elements: [
      { role: "textbox", name: "Email", required: true, placeholder: "you@example.com" },
      { role: "textbox", name: "Password", required: true, maxLength: 64 },
      { role: "button",  name: "Login", disabled: true }
    ],
    flows: [
      { trigger: "Click Login (form valid)", destination: "Frame:Dashboard" },
      { trigger: "Click Login (form invalid)", destination: "Frame:Login (error state)" }
    ],
    states: ["Default", "Loading", "Error", "Locked"]
  },
  ...
]
```

### Step 2 — Bidirectional matching

Execute matching between RequirementIndex and DesignIndex, using matching strategies in order of priority:

1. **Exact ID mapping**: The design asset Frame/Page name contains a requirement ID (e.g., the Frame is named "FR-2 Login") -> bind directly
2. **Section title <-> page name**: Perform similarity matching on `section` and `screenName` (case-insensitive, ignore spaces, support Chinese-English cross-reference)
3. **Keyword intersection**: If `keywords` intersection count >= 2 -> treat as candidate match, list for confirmation
4. **Flow linkage**: If a page in the design asset is the navigation target of another page -> that target page's requirements belong to the triggering page's story

Matching results fall into three categories:

| Type | Description | Handling |
|---|---|---|
| Full match | MD requirement + design page have a one-to-one correspondence | Merge into a unified story, generate test cases normally |
| Requirement missing design | MD has a requirement but design has no corresponding page/component | Mark `[DESIGN MISSING]`, generate skeleton test case, remind user to add design |
| Design missing requirement | Design has a page/interaction but MD has no corresponding requirement | Mark `[REQUIREMENT MISSING]`, infer requirement from design and tag `[inferred]`, remind user to confirm |

### Step 3 — Merge into unified test specification

For each fully matched pair, merge into a `UnifiedSpec`:

```
UnifiedSpec = {
  id:          "US-LOGIN-01",
  source: { reqId: "FR-2.1", screenId: "Frame:Login" },

  // From MD — business layer
  narrative: { actor: "Registered user", action: "Log in with email and password", benefit: "Access personal homepage" },
  businessRules: ["Email must conform to proper format", "Lock account after 5 consecutive failures"],

  // From design asset — implementation layer
  uiElements: [
    { role: "textbox", name: "Email", required: true, placeholder: "you@example.com" },
    { role: "textbox", name: "Password", required: true, maxLength: 64 },
    { role: "button",  name: "Login", disabledWhen: "Form is not fully filled" }
  ],
  flows: [
    { from: "Login Page", via: "Click Login (valid)", to: "Homepage" },
    { from: "Login Page", via: "Click Login (invalid)", to: "Login Page (error state)" }
  ],
  states: ["Default", "Loading", "Error", "Locked"],
  conflicts: []
}
```

### Step 4 — Generate test cases from UnifiedSpec

Based on the merged specification, each test case **simultaneously includes**:
- **Business validation points** (from MD business rules and criteria)
- **UI interaction steps** (from design asset uiElements and flows)
- **Visual state assertions** (from design asset states)

**Generation rules:**
1. For each `flow`, generate a positive scenario, combining MD `criteria` to validate business results
2. For each `businessRule`, generate a negative scenario, combining the design's error state to confirm error UI behavior
3. For each `uiElement` constraint (required, maxLength, disabled condition), generate boundary/equivalence class tests
4. For each design `state`, generate a state rendering test

### Step 5 — Output alignment report

Before generating test cases, first output an alignment summary for user confirmation:

```
## Alignment Results Summary

Full matches: 3 pairs
  - FR-2 (User Login) <-> Frame:Login
  - FR-3 (Registration) <-> Frame:Register
  - FR-5 (Password Reset) <-> Frame:ResetPassword

Requirement missing design: 1 item
  - FR-4 (Single Sign-On SSO) -> No corresponding page found in design [DESIGN MISSING]

Design missing requirement: 1 page
  - Frame:OnboardingGuide -> No corresponding requirement in MD [REQUIREMENT MISSING]

Conflict: 1 item
  - FR-2.1 requires password minimum 8 characters, but Frame:Login password input has no minLength hint

Proceed with generating test cases after confirmation?
```

---

## Extracting Requirements from Word / Plain-Text Documents

When the user pastes text from a Word document or shares a `.docx`/`.txt` requirement document:

1. **Detect requirement statements** — Scan for sentences containing "shall", "must", "should", "will", "is required to". Each statement is a candidate acceptance criterion.
2. **Group by feature** — Use section headings, numbered prefixes (e.g. FR-1, UC-03), or topic clusters.
3. **Synthesize the user story narrative** — Infer actor, action, and benefit.
4. **Map statements to acceptance criteria** — Each "shall/must" statement becomes one `Given / When / Then` criterion.
5. **Preserve IDs** — Keep existing requirement IDs as `criterionId`.
6. **Flag ambiguities** — Vague requirements get `[AMBIGUOUS]` tag with placeholder thresholds.

---

## Extracting Requirements from Markdown Requirement Documents

When the user provides a `.md` file path or pastes Markdown content, read the file then parse its structure.

### Step 1 — Map Markdown structure to requirement types

| Markdown element | Requirement role | Action |
|---|---|---|
| `# Heading` / `## Heading` | Feature / module boundary | Start a new user story group |
| `### Heading` | Sub-feature or individual user story | Become the story title |
| `> blockquote` | Story narrative hint | Parse "As a / I want / So that" if present |
| `- [ ] checklist item` | Acceptance criterion (not yet done) | Convert to `Given/When/Then` |
| `- [x] checklist item` | Already-implemented criterion | Include with tag `@existing` |
| Numbered list `1.` | Ordered acceptance criteria | Convert each to one criterion |
| `**bold text**` in list | Business rule or constraint | Extract as rule within criterion |
| `| table |` | Scenario outline data | Convert to `Scenario Outline` with `Examples` table |
| `> NOTE:` / `> ⚠️` annotations | Clarification or constraint | Treat as implicit requirement |
| Code fences | API contract / data schema | Extract field names and types as input parameters |

### Step 2 — Reconstruct user story narratives

Markdown docs often omit the "As a / I want / So that" format. Reconstruct:
- **Actor**: infer from section heading
- **Action**: infer from heading verb or first list item
- **Benefit**: infer from "so that", "in order to" text; otherwise `[inferred]`

### Step 3 — Handle common Markdown requirement patterns

**Pattern A — Checklist-style AC:**
```markdown
## User Login
- [ ] User can log in with email and password
- [ ] Show error if credentials are invalid
- [ ] Lock account after 5 failed attempts
```
→ Each `- [ ]` becomes one criterion under story "User Login".

**Pattern B — Table-driven scenarios:**
→ Convert to `Scenario Outline` with table rows as `Examples`.

**Pattern C — Nested rules:**
→ Top-level item = trigger; nested bold items = business rules.

**Pattern D — Mixed narrative + criteria:**
→ Parse narrative directly; numbered list → acceptance criteria.

### Step 4 — Extract implicit tests from Markdown metadata

- `@wip`, `@draft`, `@tbd` tags → `[AMBIGUOUS]`, skeleton test with TODO
- `@P0`/`@P1`/`@critical` tags → set matching priority
- Links to other `.md` files → offer to read and merge
- Code fences with JSON/YAML schemas → extract as input parameters
