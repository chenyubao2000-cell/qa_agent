---
name: Test Case Generator from User Stories
description: Automatically generate comprehensive test cases from user stories and acceptance criteria using BDD patterns, equivalence partitioning, and risk-based prioritization
version: 1.0.0
author: Pramod
allowed_tools: [Read, Write, Bash, Grep, Glob]
license: MIT
testingTypes: [bdd, tdd]
frameworks: [cucumber]
languages: [typescript, javascript, python, java]
domains: [web, api]
agents: [claude-code, cursor, github-copilot, windsurf, codex, aider, continue, cline, zed, bolt, gemini-cli, amp]
---

# Test Case Generator from User Stories Skill

You are an expert QA engineer specializing in systematic test case generation from user stories and acceptance criteria. When the user asks you to generate test cases, create Gherkin scenarios, derive equivalence classes, or build traceability matrices from requirements, follow these detailed instructions to produce comprehensive, prioritized, and traceable test suites.

## Output Language

All test case output (case titles, preconditions, steps, expected results, test data) MUST be written in **Chinese (简体中文)**. Only keep technical identifiers in English: Case IDs (TC-xxx-001), priority labels (P0/P1/P2), and code-level references (CSS selectors, URLs, API paths).

## Priority Definition & Ratio (mandatory reference for all generated test cases)

> Reference: [ISTQB Glossary](https://glossary.istqb.org/) — Priority is the level of business importance assigned to a test item. [Fibery P0-P4 Guide](https://fibery.com/blog/product-management/p0-p1-p2-p3-p4/) — Industry-standard priority classification. Recommended ratio based on [Software Testing Genius](https://www.softwaretestinggenius.com/how-to-decide-the-priority-of-execution-of-test-cases/) and [ISTQB CTFL Syllabus v4.0](https://istqb.org/).

### Priority Levels

| Level | Definition | Criteria | Examples |
|-------|-----------|----------|----------|
| **P0** | Core happy path; failure = system unusable | ① Happy path of the primary workflow (shortest path for user to complete core task) ② Functions involving data security / payment / authentication ③ Blocking functions (if this breaks, all downstream is broken) | Login, registration, core business submission, payment, permission checks |
| **P1** | Important features + critical error paths | ① Error handling on the primary workflow (validation messages, boundary values, permission blocks) ② Happy path of secondary features ③ Data integrity checks | Form validation, error messages, list pagination, search/filter, file upload failure prompt |
| **P2** | Edge cases + UX polish | ① Non-core UI interactions (animations, layout, responsive) ② Extreme boundaries (very long text, concurrent operations) ③ Compatibility / accessibility | Mobile viewport, keyboard shortcuts, extreme data volume, language switching |

### Recommended Ratio

```
P0 : P1 : P2 = 15~20% : 40~50% : 30~40%
```

| Ratio | Rationale |
|-------|-----------|
| P0 ≈ 15-20% | Keep it small and precise — only "cannot ship if this fails" scenarios. Too many P0s = priority loses meaning |
| P1 ≈ 40-50% | The workhorse — covers most features and critical error paths. Core of regression testing |
| P2 ≈ 30-40% | Supplementary coverage — run when time permits. Skipping P2 should not block a release decision |

### Priority Assignment Decision Tree

When assigning priority to each TC in the Merged Test Case List, follow this decision tree:

```
Does this TC test the primary workflow's happy path?
  ├─ YES → Involves auth / payment / data security?
  │          ├─ YES → P0
  │          └─ NO  → If this feature breaks, can the user still use the system?
  │                    ├─ NO (blocking) → P0
  │                    └─ YES (degraded but usable) → P1
  └─ NO  → Does this TC test error handling / boundary / exception?
            ├─ YES → Could this exception cause data loss or security issues?
            │          ├─ YES → P0
            │          └─ NO  → P1
            └─ NO  → P2 (UI interaction, responsive, compatibility, extreme scenarios)
```

### Post-Generation Ratio Validation

After generating the Merged Test Case List, validate the priority distribution:
- P0 > 30%? → Too many — review which can be downgraded to P1 ("can still ship if this fails" → downgrade)
- P0 < 10%? → Too few — check if core happy paths are missing
- P1 < 30%? → Insufficient error path coverage
- All P1? → Priority has lost meaning — must differentiate

---

## Supported Input Sources

Before generating test cases, identify which input type(s) the user has provided and apply the corresponding extraction process:

| Input Type | How to recognize | Extraction approach |
|---|---|---|
| User story text | "As a... I want... So that..." | Parse directly per Core Principles |
| Word / plain-text requirements | Numbered lists, "shall/must/should" statements, pasted prose | Convert to user stories first (see below) |
| Markdown requirements doc | `.md` file path or pasted Markdown with headings/tables/checklists | Parse Markdown structure to extract stories (see below) |
| Figma via MCP | User provides a Figma file URL or node ID, Figma MCP tools are available | Call Figma MCP tools to extract design data (see below) |
| Pencil via MCP | User provides a Pencil project file path, Pencil MCP tools are available | Call Pencil MCP tools to extract screens and components (see below) |
| MD + Figma/Pencil (alignment mode) | Both a `.md` requirements doc and a Figma URL / Pencil file are provided | **Align first, then generate** — see the "Requirements and Design Alignment" section |
| **Chrome CDP live page** | User specifies a target page (no requirements doc), Chrome is running | **First explore the real DOM via CDP, then infer stories** — see the "Generating Test Cases from Chrome CDP Live Pages" section |
| Mixed | Any other combination | Extract separately then merge and deduplicate |

---

## Requirements and Design Alignment (MD x Figma/Pencil)

When the user provides **both** a Markdown requirements document and Figma/Pencil design assets, **do not** generate test cases independently from each source. You must first execute the alignment process, merging information from both sides into a unified test specification, then generate test cases.

> MD provides "what to do, why, and business rules"; design assets provide "how to do it, what UI to use, and what interaction states exist." Neither is complete on its own — both are essential.

### Step 1 — Extract separately, build indexes

**Extract requirements index from MD** (process according to each section's rules):

```
RequirementIndex = [
  {
    reqId:    "FR-2.1",
    section:  "User Login",          // from ## heading
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
| ✅ Full match | MD requirement + design page have a one-to-one correspondence | Merge into a unified story, generate test cases normally |
| ⚠️ Requirement missing design | MD has a requirement but design has no corresponding page/component | Mark `[DESIGN MISSING]`, generate skeleton test case, remind user to add design |
| ⚠️ Design missing requirement | Design has a page/interaction but MD has no corresponding requirement | Mark `[REQUIREMENT MISSING]`, infer requirement from design and tag `[inferred]`, remind user to confirm |

### Step 3 — Merge into unified test specification

For each fully matched pair, merge the MD requirement and design data into a `UnifiedSpec`:

```
UnifiedSpec = {
  id:          "US-LOGIN-01",
  source: {
    reqId:       "FR-2.1",               // from MD
    screenId:    "Frame:Login",          // from design asset
  },

  // From MD — business layer
  narrative: {
    actor:   "Registered user",
    action:  "Log in with email and password",
    benefit: "Access personal homepage"
  },
  businessRules: [
    "Email must conform to proper format",
    "Lock account after 5 consecutive failures"
  ],

  // From design asset — implementation layer
  uiElements: [
    { role: "textbox", name: "Email",    required: true, placeholder: "you@example.com" },
    { role: "textbox", name: "Password", required: true, maxLength: 64 },
    { role: "button",  name: "Login",    disabledWhen: "Form is not fully filled" }
  ],
  flows: [
    { from: "Login Page", via: "Click Login (valid)", to: "Homepage" },
    { from: "Login Page", via: "Click Login (invalid)", to: "Login Page (error state)" }
  ],
  states: ["Default", "Loading", "Error", "Locked"],

  // Conflict detection added during alignment phase
  conflicts: [
    // MD requires "password minimum 8 characters" but design input field has no minLength attribute -> remind design to add constraint display
  ]
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
3. For each `uiElement` constraint (required, maxLength, disabled condition), generate boundary/equivalence class tests, using MD rules to explain "why"
4. For each design `state`, generate a state rendering test to confirm that the business logic from the MD requirement is correct in that state

**Example:**

```
MD requirements:
  FR-2.1 Login form must validate email format before submission
  FR-2.2 Lock account for 30 minutes after 5 consecutive failures

Design asset:
  Frame:Login
    textbox "Email" (required, placeholder)
    textbox "Password" (required)
    button "Login" (disabled when form is empty)
    state "Error": displays red warning text
    state "Locked": button grayed out, displays countdown

Merged generated test cases (business + UI):

  TC-001 [Positive] Successful login with valid email and password
    Given user is on the login page (Frame:Login default state)
    When  fill in "Email" input with "user@example.com"
    And   fill in "Password" input with a valid password
    And   click the "Login" button
    Then  redirect to homepage (FR-2.1 passed)

  TC-002 [Negative x Design State] Error state displayed when email format is invalid
    Given user is on the login page
    When  fill in "Email" input with "notanemail"
    And   click the "Login" button
    Then  page enters "Error state" (FR-2.1)
    And   red format warning text appears below the email input (design error state)

  TC-003 [Negative x Boundary] Locked state triggered after 5th consecutive failure
    Given user has failed login 4 consecutive times
    When  entering an incorrect password for the 5th time and submitting
    Then  page enters "Locked state" (FR-2.2)
    And   login button is grayed out and unclickable (design locked state)
    And   a 30-minute countdown is displayed (FR-2.2 business rule)
```

### Step 5 — Output alignment report

Before generating test cases, first output an alignment summary for user confirmation:

```
## Alignment Results Summary

✅ Full matches: 3 pairs
  - FR-2 (User Login) <-> Frame:Login
  - FR-3 (Registration) <-> Frame:Register
  - FR-5 (Password Reset) <-> Frame:ResetPassword

⚠️ Requirement missing design: 1 item
  - FR-4 (Single Sign-On SSO) -> No corresponding page found in design, will generate skeleton test case [DESIGN MISSING]

⚠️ Design missing requirement: 1 page
  - Frame:OnboardingGuide -> No corresponding requirement in MD, inferred from design [REQUIREMENT MISSING], please confirm

⚠️ Conflict: 1 item
  - FR-2.1 requires password minimum 8 characters, but Frame:Login password input has no minLength hint, recommend design add this

Proceed with generating test cases after confirmation?
```

---

## Extracting Requirements from Word / Plain-Text Documents

When the user pastes text from a Word document or shares a `.docx`/`.txt` requirement document, follow these steps **before** generating test cases:

1. **Detect requirement statements** -- Scan for sentences containing "shall", "must", "should", "will", "is required to". Each statement is a candidate acceptance criterion.
2. **Group by feature** -- Use section headings, numbered prefixes (e.g. FR-1, UC-03), or topic clusters to group related requirements into a single user story.
3. **Synthesize the user story narrative** -- Infer the actor (who benefits), the action (what the system does), and the benefit (why). If the document doesn't state them explicitly, make a reasonable assumption and note it.
4. **Map statements to acceptance criteria** -- Each "shall/must" statement becomes one `Given / When / Then` criterion. Optional "should" statements become lower-priority criteria.
5. **Preserve IDs** -- If the document already has requirement IDs (e.g. FR-1.3), keep them as the `criterionId` in the traceability matrix.
6. **Flag ambiguities** -- If a requirement is vague ("the system should respond quickly"), flag it with `[AMBIGUOUS]` and generate a test case with a placeholder threshold (e.g. < 3s) while asking the user to confirm.

**Example conversion:**

```
Word text:
  FR-2.1 The login form shall validate email format before submission.
  FR-2.2 The system shall lock the account after 5 consecutive failed login attempts.

Converted user story:
  As a registered user
  I want my login credentials validated before submission
  So that I receive immediate feedback on input errors

  AC-FR-2.1: Given I am on the login page, When I enter an invalid email format, Then I see a format validation error
  AC-FR-2.2: Given I have failed login 4 times, When I fail once more, Then my account is locked and I see a lockout message
```

---

## Extracting Requirements from Markdown Requirement Documents

When the user provides a `.md` file path or pastes Markdown content, read the file (if a path) then parse its structure **before** generating test cases.

If a file path is given, read it first:
```
Read({ file_path: "/path/to/requirements.md" })
```

### Step 1 — Map Markdown structure to requirement types

| Markdown element | Requirement role | Action |
|---|---|---|
| `# Heading` / `## Heading` | Feature / module boundary | Start a new user story group |
| `### Heading` | Sub-feature or individual user story | Become the story title |
| `> blockquote` | Story narrative hint | Parse "As a / I want / So that" if present |
| `- [ ] checklist item` | Acceptance criterion (not yet done) | Convert to `Given/When/Then` |
| `- [x] checklist item` | Already-implemented criterion | Include with tag `@existing` |
| Numbered list `1.` under a heading | Ordered acceptance criteria | Convert each to one criterion |
| `**bold text**` in a list item | Business rule or constraint | Extract as a rule within the criterion |
| `| table |` | Scenario outline data / enumerated values | Convert to `Scenario Outline` with `Examples` table |
| `> NOTE:` / `> ⚠️` / `> 💡` annotations | Clarification or constraint | Treat as implicit requirement or ambiguity flag |
| Code fences ` ```  ``` ` | API contract / data schema / example payload | Extract field names and types as input parameters for equivalence partitioning |

### Step 2 — Reconstruct user story narratives

Markdown docs often omit the "As a / I want / So that" format. Reconstruct it:
- **Actor**: infer from the section heading (e.g. "## Admin Panel" → actor = admin user)
- **Action**: infer from the heading verb or the first list item
- **Benefit**: infer from any "so that", "in order to", or "goal:" text; otherwise leave as `[inferred]` and note it

### Step 3 — Handle common Markdown requirement patterns

**Pattern A — Checklist-style AC:**
```markdown
## User Login
- [ ] User can log in with email and password
- [ ] Show error if credentials are invalid
- [ ] Lock account after 5 failed attempts
```
→ Each `- [ ]` becomes one `Given/When/Then` criterion under story "User Login".

**Pattern B — Table-driven scenarios:**
```markdown
| Input         | Expected Result      |
|---------------|----------------------|
| valid email   | proceeds to password |
| missing @     | shows format error   |
| empty field   | shows required error |
```
→ Convert to a `Scenario Outline` with the table rows as `Examples`.

**Pattern C — Nested rules:**
```markdown
### Password Reset
- User requests a reset link
  - **Email must be registered**
  - **Link expires in 30 minutes**
  - **Link is single-use**
```
→ Top-level item = trigger (`When`); nested bold items = business rules appended as `And` steps.

**Pattern D — Mixed narrative + criteria:**
```markdown
## Checkout Flow
As a shopper I want to complete a purchase so that I receive my items.

### Acceptance Criteria
1. Cart must not be empty before proceeding
2. Payment details must be validated before order creation
3. Confirmation email sent within 60 seconds of order
```
→ Parse the narrative directly; numbered list → three acceptance criteria.

### Step 4 — Extract implicit tests from Markdown metadata

- Headings tagged `@wip`, `@draft`, `@tbd` → flag as `[AMBIGUOUS]`, generate skeleton test with TODO
- Items tagged `@P0`/`@P1`/`@critical` → set matching priority in traceability matrix
- Links to other `.md` files (`[see auth spec](auth.md)`) → offer to read linked file and merge requirements
- Code fences with JSON/YAML schemas → extract field names, types, and `required` arrays as input parameters for equivalence class generation

### Example

```markdown
## Password Reset

As a registered user I want to reset my forgotten password so that I can regain account access.

### Acceptance Criteria
- [ ] Reset link is sent to registered email within 2 minutes
- [ ] **Link expires after 30 minutes**
- [ ] Link can only be used once
- [ ] Unregistered email shows generic message (no account reveal)

> ⚠️ Rate-limit: max 3 reset requests per hour per email
```

Generated criteria:
  AC-1: Given I request a reset, When I check my inbox, Then I receive a link within 2 minutes
  AC-2: Given a link older than 30 minutes, When I click it, Then I see an "expired" error
  AC-3: Given I have used a reset link, When I click it again, Then I see a "used" error
  AC-4: Given the email is not registered, When I request a reset, Then I see a generic success message
  AC-5 [implicit from annotation]: Given I request reset 3 times in an hour, When I try a 4th, Then I am rate-limited

---

## Extracting Requirements from Figma via MCP

When the user provides a Figma file URL or node ID and the Figma MCP server is available, use MCP tools to pull structured design data — do **not** ask for a screenshot.

### Step 1 — Resolve the file and target nodes

Parse the user's input to extract `fileKey` and optional `nodeId` from the Figma URL:
```
https://www.figma.com/file/{fileKey}/...?node-id={nodeId}
```

Then call:
```
mcp__figma__get_file({ fileKey })                        // full document tree
mcp__figma__get_file_nodes({ fileKey, ids: [nodeId] })   // specific frame/component
mcp__figma__get_images({ fileKey, ids: [nodeId] })       // rendered preview (optional, for context)
```

### Step 2 — Walk the node tree and classify elements

Traverse the returned JSON node tree. For each node, map its `type` to a UI role:

| Figma node type | UI role | Test implications |
|---|---|---|
| `TEXT` with name containing "label", "hint", "placeholder" | Input label / placeholder | Test label presence, placeholder disappears on focus |
| `INSTANCE` of a component named "Button", "CTA" | Button | Test enabled/disabled states, click triggers action |
| `INSTANCE` named "Input", "TextField", "TextArea" | Form input | Test valid/invalid/boundary values, required flag |
| `INSTANCE` named "Checkbox", "Radio", "Toggle" | Selection control | Test checked/unchecked states |
| `INSTANCE` named "Dropdown", "Select", "Combobox" | Dropdown | Test option selection, default value, empty state |
| `INSTANCE` named "Error", "Alert", "Toast", "Banner" | Feedback | Test trigger condition, message content, dismissal |
| `FRAME` or `COMPONENT` at top level | Screen / page | Represents one user-facing view to derive a story from |
| `VECTOR` / `BOOLEAN_OPERATION` with fill color red/amber/green | Status indicator | Test each status state is reached under correct condition |

Also extract:
- **`characters`** on TEXT nodes → button labels, field labels, error message text, placeholder text
- **`componentProperties`** → look for `disabled`, `error`, `required`, `variant` props to enumerate states
- **`interactions`** (prototype connections) → map trigger → destination frame as user flow steps

### Step 3 — Derive user stories from frames and flows

For each top-level FRAME (screen), create one user story:
```
As a [actor inferred from frame name or annotation]
I want to [action implied by the dominant interactive component cluster]
So that [benefit implied by the screen's purpose]
```

For each interactive element and its states, write acceptance criteria:
```
Given [frame name / precondition from prototype flow]
When [user action on the element — derived from interaction trigger]
Then [expected outcome — derived from destination frame or component variant]
```

### Step 4 — Extract implicit test cases from design tokens and properties

- `componentProperties.required = true` → generate a test: submit with this field empty, expect error
- `componentProperties.disabled = true` → generate a test: verify the enabling condition from the flow
- `componentProperties.maxLength` or `characters` showing a counter → generate boundary tests
- Prototype connections with trigger `ON_HOVER` → generate tooltip / hover state tests
- Multiple variants of the same component (e.g. Button/Primary, Button/Disabled, Button/Loading) → generate one test per variant
- Color styles named "error", "warning", "success" applied to a node → generate a test that each state renders

### Example

```
Figma node data (simplified):
  FRAME "Registration"
    INSTANCE "TextField" { label: "Email", required: true, placeholder: "you@example.com" }
    INSTANCE "TextField" { label: "Password", required: true, maxLength: 64 }
    INSTANCE "PasswordStrengthMeter" { variants: ["weak","fair","strong"] }
    INSTANCE "Button/Primary" { label: "Register", disabled: true }
  Prototype: "Registration" → ON_CLICK "Register" → "Dashboard" (condition: form valid)

Generated stories and criteria:
  US-D1: User registration
  AC-D1-1: Given the form is empty, Then the Register button is disabled
  AC-D1-2: Given all required fields are valid, Then Register becomes enabled
  AC-D1-3: Given Email field is empty, When I submit, Then I see a required-field error on Email
  AC-D1-4: Given Password length = 65, When I submit, Then I see a max-length validation error
  AC-D1-5: Given a weak password is entered, Then the strength meter shows "weak"
  AC-D1-6: Given a strong password is entered, Then the strength meter shows "strong"
  AC-D1-7: Given the form is valid, When I click Register, Then I am redirected to Dashboard
```

---

## Extracting Requirements from Pencil via MCP

When the user provides a Pencil project file (`.ep` or `.epz`) and the Pencil MCP server is available, use MCP tools to pull screen and component data.

### Step 1 — Open the project and list pages

```
mcp__pencil__open_project({ filePath })   // open the .ep/.epz file
mcp__pencil__list_pages()                 // get all pages (screens)
```

### Step 2 — Extract shapes per page

For each page, call:
```
mcp__pencil__get_page_shapes({ pageId })
```

Map Pencil shape types to UI roles:

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
| `Link` | Navigation | Test navigation target, active/visited states |

Also extract:
- **Shape label / `textContent`** → button labels, field labels, error text
- **Shape notes / annotations** → designers often write business rules here; treat each note as a candidate acceptance criterion
- **Page names** → use as the frame/screen identifier for the user story narrative
- **Page-to-page links** (navigation arrows) → trace as user flows between screens

### Step 3 — Derive stories and criteria (same as Figma Step 3)

Apply the same derivation rules as the Figma MCP section above, substituting Pencil shape data for Figma node data.

### Step 4 — Extract implicit tests from Pencil annotations

- Shape notes containing "must", "should", "shall" → treat as direct acceptance criteria
- Shapes with a red border or fill → error/validation state; generate a test to trigger it
- Greyed-out / low-opacity shapes → disabled state; generate a test for the enabling condition
- Repeated similar shapes across pages → same component in different states; enumerate each as a test case

---

## Generating Test Cases from Chrome CDP Live Pages (No Requirements Document Mode)

> **Applicable scenario**: The user has not provided any requirements document (no `.md`, no Figma, no Pencil), but Chrome is running and has the target page open. In this case, explore the real DOM via CDP, infer testable user stories, then follow the standard test case generation process.

> ⚠️ **Scenario isolation principle**: This mode and the requirements-document-driven mode are **completely independent** and must never be mixed. The requirements document mode outputs are centered on business rules; the CDP mode outputs are centered on real UI interactions. Artifacts produced by both modes (feature files, handoff) are clearly labeled to distinguish their source.

### Trigger Condition Determination

| User input | Mode |
|---|---|
| Provided `.md` / Figma / Pencil | **Requirements document driven**, do not enter this section |
| Says "generate test cases for this page" or "see what can be tested on this page", no requirements document | **CDP live page mode** ← this section |
| Both provided | Follow requirements document first; CDP is only used to validate locators, not to infer stories |

---

### Step 1 — Read the CDP baseline JSON

> **This Skill does not directly connect to Chrome, nor does it call any chrome-devtools MCP tools.**
> The exhaustive CDP exploration is performed in advance by the command layer via the cdp-explorer SKILL, producing a baseline JSON file.
> This step only reads and parses that baseline.

```
Read the baseline JSON file passed in by the caller (pre-generated by the command layer via the cdp-explorer SKILL)
```

The baseline JSON contains:
- **Multi-state data**: Initial page + hidden states discovered through interactions (modals, dropdowns, tab panels, etc.)
- **State flow graph**: Records which interactions caused state transitions
- **Form constraints**: required, maxlength, pattern, etc.
- **Dangerous action markers**: Delete, submit, and other irreversible operations

---

### Step 2 — Deduplication check (must be performed before generation)

Before inferring user stories, check existing artifacts:

```
Glob("$QA_WORKSPACE_DIR/test-cases/generated/*.md")       → existing test case files
Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/**/*.test.ts") → existing spec files
```

For each existing file, extract test case IDs and verification targets. If subsequently inferred stories duplicate the verification targets of existing test cases, skip them — do not generate duplicate test cases.

---

### Step 3 — Infer user stories from the state flow graph

Traverse **each state and its interactive elements** in the baseline, generating corresponding user stories:

```
Inference rules (based on state flow graph):

  State_0 (initial page):
    heading "User Login"
    textbox "Email" (required)
    textbox "Password" (required)
    button "Login"
    link "Forgot Password"
  →
  US-CDP-01: User Login
    AC-1: Valid email + password → login successful
    AC-2: Email is empty → cannot submit (required)
    AC-3: Password is empty → cannot submit (required)
    AC-4: Click "Forgot Password" → navigate to password reset page

  State_1 (reached from State_0 via click "New"):
    dialog "New Task"
    textbox "Title" (required, maxlength=100)
    textarea "Description"
    button "Create" (disabled)
  →
  US-CDP-02: Create New Task
    AC-1: Fill in title → Create button becomes enabled
    AC-2: Title exceeds 100 characters → boundary test
    AC-3: Click Create → Modal closes, task appears in list
    AC-4: Press Escape → Modal closes, nothing created
```

**Inference priority (inferred from baseline element attributes):**

| Element characteristic | Inferred test scenario |
|---|---|
| `disabled: true` | Verify enabling condition: what action makes it available |
| `required: true` | Empty submission test: expect error message to appear |
| `maxLength` present | Boundary value test: maxLength and maxLength+1 |
| State flow graph has dialog state | Dialog open/close test: trigger → display → close |
| State flow graph has tab switching | Tab switching test: each tab's content renders correctly |
| `role=alert` / alerts[] | Error state test: trigger condition → message visible |
| dangerousActions[] | Dangerous action test: confirmation dialog, accidental action protection |
| forms[].submitButton.disabled | Form validation test: when can it be submitted |
| externalLinks[] | External link reachability test |

---

### Step 4 — Generate test cases (same artifacts as requirements document mode)

Starting from the inferred user stories, follow the complete test case generation process:

1. **Gherkin feature files** — Save to `tests/generated/features/<page-slug>-cdp.feature`
   - File must include a comment at the top: `# Source: Chrome CDP — <page URL> — <snapshot date>`
   - Tags must include `@cdp-inferred` to distinguish the source

2. **test_cases_data.json** — Append a new key, named `<page name> (CDP Inferred)`

3. **Excel** — Regenerate, adding the corresponding sheet with an orange tab color (to distinguish from the blue tabs used by requirements-document-driven sheets)

4. **playwright-handoff-{slug}.json** — **MANDATORY in ALL modes (PRD, CDP, issue)**. Add new entries. Each TC in the Merged Test Case List = exactly one handoff entry (1:1, no merging). Each entry **must** include all fields required by playwright-script-generator (`title`, `assertions`, `preconditions`), in addition to CDP-specific fields. The `uiElements` directly use real selectors extracted from the baseline:
   ```json
   {
     "id": "TC-CDP-001",
     "storyId": "cdp-<page-slug>",
     "source": "cdp",
     "title": "User can log in with valid credentials",
     "priority": "P0-critical",
     "preconditions": ["User is on the login page"],
     "pageUrl": "https://...",
     "snapshotDate": "2026-03-18",
     "fromState": "S0",
     "uiElements": [
       { "role": "textbox", "name": "Email", "action": "fill", "value": "user@example.com",
         "locatorHint": "getByRole('textbox', { name: 'Email' })" }
     ],
     "assertions": [
       { "type": "url", "expected": "/dashboard" },
       { "type": "visible", "selector": "heading", "name": "Welcome" }
     ],
     "tags": ["cdp-inferred", "authentication"],
     "timeout": null
   }
   ```
   > **Important**: CDP mode handoff entries must have the same required fields as requirements mode (`title`, `priority`, `preconditions`, `assertions`). The `title` is inferred from the user story derived in Step 3. The `assertions` are inferred from the acceptance criteria. Without these fields, playwright-script-generator cannot generate valid `test()` and `expect()` blocks.

5. **traceability-matrix.json** — criterionId format is `CDP-<pageSlug>-<sequence>`, requirementSection is filled with `<page URL>`

---

### Step 5 — Handoff to playwright-script-generator

Identical to the requirements document mode — invoke the `playwright-script-generator` skill, but with an additional advantage:

- CDP mode handoff's `locatorHint` field already contains precise selectors extracted from the real DOM
- playwright-script-generator should **prioritize using `locatorHint`** and should not need to re-infer locators

---

### Comparison of Artifacts Between the Two Modes

| Artifact | Requirements Document Mode | CDP Live Page Mode |
|---|---|---|
| feature file name | `canvas-download.feature` | `canvas-download-cdp.feature` |
| tag | `@canvas-download` `@positive` | `@cdp-inferred` `@canvas-download` |
| criterionId | `FR-3.1` (from requirements) | `CDP-canvas-download-01` |
| Excel sheet tab color | Default (blue header) | Orange tab with `[CDP]` prefix |
| traceability source | Requirements document section | Page URL + snapshot time |
| locator precision | Inferred (may need adjustment) | From real DOM (high confidence) |
| business rule coverage | Complete (from requirements) | Only UI-visible rules |

---

## Core Principles

The complete workflow follows this sequence: **Scope check → Parse → Design → Merge & Deduplicate → Output**.

### Phase A: Collect Existing Coverage (before design)

> **Deduplication hierarchy**: The primary deduplication is performed by the **e2e-orchestrator** (agents/e2e-orchestrator.md Step 2) before this skill is invoked. The orchestrator scans existing artifacts, determines what is new/partial/covered, and only passes genuinely needed work to this skill. This skill's Phase A serves as a **defensive fallback** — if the orchestrator didn't pre-filter (e.g., when called standalone), this phase catches duplicates.

0. **Scan existing artifacts to build a coverage index** -- Before starting design, collect what already exists. This index is used later in Phase C for deduplication, **not** for skipping design:
   - Scan `test-cases/generated/*.md` for existing case IDs and verification targets
   - Scan `tests/e2e/testcases/**/*.test.ts` for existing test names, case IDs, and assertions
   - Build an index: `{ caseId, feature, verificationTarget, locators }` per existing case
   - **Do not skip any module at this stage** — even if a module has existing cases, it may have gaps that the design methods will uncover. The decision to skip or supplement is made in Phase C after design is complete

### Phase B: Parse & Design (apply methods)

1. **Parse before generating** -- Before writing any test case, fully parse the user story format ("As a... I want... So that...") and extract every testable acceptance criterion. Missing this step leads to incomplete coverage.
2. **Apply equivalence partitioning systematically** -- Divide input domains into valid equivalence classes and invalid equivalence classes for every parameter mentioned in the story. A single test case may cover multiple valid classes, but must cover only one invalid class.
3. **Derive boundary values as a supplement to equivalence partitioning** -- Boundary value analysis is independent from equivalence partitioning (Method 2). Requirements that mention ranges, limits, or thresholds imply boundary values. Test at the boundary, one below, and one above.
4. **Generate both positive and negative scenarios** -- Every acceptance criterion implies what should happen and what should not happen. Generate explicit negative test cases for every positive scenario.
5. **Consider implicit requirements** -- User stories rarely capture all requirements explicitly. Security, performance, accessibility, and error handling are often implicit. Generate test cases for these cross-cutting concerns.
6. **Test data self-sufficiency (mandatory for every test case)** -- Each test case must be **completely self-contained**: it creates its own preconditions, executes, verifies, and cleans up. No test may depend on another test's output or execution order.

   **Why**: Tests must be able to run independently and in parallel (`fullyParallel: true`). If test "Delete Task" depends on test "Create Task" having run first, parallel execution breaks, and a single test failure cascades to unrelated tests.

   **Rules for every test case**:
   - **Setup (preconditions)**: Explicitly state what data must be created BEFORE the test action. E.g., "Delete Task" test must include precondition: "Create a task named 'Test-{timestamp}' via API or UI"
   - **Teardown (postconditions)**: State what cleanup is needed AFTER the test to avoid polluting subsequent tests. E.g., "Create Task" test must include postcondition: "Delete the created task to restore initial state"
   - **No shared mutable state**: Tests must NOT rely on a specific task/record existing from a previous test. Each test creates its own test data
   - **Idempotent**: Running the same test twice in a row must produce the same result

   **Common dependency patterns and how to handle them**:

   | Test Scenario | Wrong (dependent) | Right (self-sufficient) |
   |--------------|-------------------|------------------------|
   | Delete a task | Precondition: "Task exists" (from Create test) | Precondition: "Through UI create task 'Test-Del-{timestamp}'". Teardown: none (task deleted by test itself) |
   | Edit a task | Precondition: "Task exists" (from Create test) | Precondition: "Through UI create task 'Test-Edit-{timestamp}'". Teardown: "Through UI delete task 'Test-Edit-{timestamp}'" |
   | View task detail | Precondition: "Task exists" (from Create test) | Precondition: "Through UI create task 'Test-View-{timestamp}'". Teardown: "Through UI delete task 'Test-View-{timestamp}'" |
   | Filter by status | Precondition: "Multiple tasks with different statuses" | Precondition: "Through UI create 3 tasks with statuses: open, in-progress, done". Teardown: "Through UI delete all 3 tasks" |

   > **UI setup strategy**: This is a UI automation platform — setup and teardown are done through UI interactions (via POM methods), not API calls. The setup steps should reuse existing POM methods (e.g., `tasksPage.createTask()`) to keep setup code stable and maintainable. Setup operations use the same POM as the test itself.

   **通用 CRUD 及衍生操作的 setup/teardown 模式**:

   每个测试操作都属于以下某种类型。根据类型判断是否需要 setup 和 teardown：

   | 操作类型 | 是否需要 setup？ | setup 内容 | teardown |
   |---------|:---------------:|-----------|----------|
   | **Create** (创建/新增/注册/上传) | 仅导航 | 导航到目标页面 | 删除创建的数据 |
   | **Read** (查看/详情/预览/搜索) | ✅ 必须 | 先通过 UI 创建目标数据 | 删除创建的数据 |
   | **Update** (编辑/修改/重命名/状态变更) | ✅ 必须 | 先通过 UI 创建目标数据 | 删除创建的数据 |
   | **Delete** (删除/移除/取消) | ✅ 必须 | 先通过 UI 创建目标数据 | 无需（测试本身就是删除） |
   | **Download** (下载/导出/保存) | ✅ 必须 | 先通过 UI 创建/上传目标文件 | 删除创建的数据 |
   | **List/Filter** (列表/筛选/排序/分页) | ✅ 必须 | 先创建多条满足筛选条件的数据 | 删除所有创建的数据 |
   | **Navigate** (导航/跳转/返回) | 仅导航 | 导航到起点页面 | 无需 |
   | **Validate** (校验/验证/禁用状态) | 仅导航 | 导航到目标页面 | 无需 |

   **判断规则**：如果测试动作的目标对象（文件/记录/项目/订单/...）不是由测试本身创建的，就必须在 setup 中先创建它。

   **Precondition writing rules**:
   - 前置条件必须是**可执行的 UI 操作序列**，不能是笼统的状态描述
   - ❌ 错误：`"数据已存在"` `"文件已打开"` `"用户在详情页"` — 不可执行，无法翻译为代码
   - ✅ 正确：`"1. 导航到列表页 2. 点击新建按钮 3. 填写表单 4. 提交 5. 确认创建成功"` — 每步可翻译为 POM 方法
   - 每一步必须对应一个 POM 方法调用，playwright-script-generator 会把它翻译为代码

   **Handoff `setup[]` field rules**:
   - `setup[]` 必须包含完整的前置操作链，每个条目对应一个 UI 操作
   - 每个条目格式：`{ "type": "ui"|"navigate", "action": "create"|"navigate"|"wait", "pomMethod": "方法名", "data": {} }`
   - 如果测试操作依赖某个状态，setup 必须包含到达该状态的**全部步骤**
   - `teardown[]` 必须包含清理操作（除非测试本身就是删除操作）
   - setup/teardown 的 `pomMethod` 必须在 POM 中有对应方法
   - **空 setup[] 只允许用于 Create/Navigate/Validate 类操作**；Read/Update/Delete/Download/List 类操作的 setup[] 不能为空

### Phase C: Merge & Deduplicate (after design)

6. **Merge all method outputs, deduplicate, and determine action** -- After all 6 design methods have produced their case sets, merge them and compare against the Phase A coverage index:
   - **Internal dedup**: same input + same operation + same expected result across methods = duplicate, keep one
   - **Resolve conflicts**: different methods producing contradictory expected results → investigate and keep the correct one
   - **Consolidate**: multiple valid equivalence classes covered by separate cases → merge into fewer cases where possible
   - **Compare against existing cases**: for each new case, compare its **verification target** against the Phase A index:
     - Existing case covers the same scenario with same assertions → mark as duplicate, remove
     - Existing case covers the same scenario but with weaker/incomplete assertions → mark as **supplement** — generate the new case to strengthen coverage
     - No existing case covers this scenario → mark as **new** — generate normally
   - If after all comparisons every new case is a duplicate, output "All test cases already exist, skipping generation" and stop

### Phase D: Output

7. **Use Gherkin for traceability** -- BDD scenarios in Given/When/Then format provide a natural link between requirements and test cases. Every scenario should trace back to a specific acceptance criterion.
8. **Prioritize by risk, not by order** -- Not all test cases have equal value. Assign priority based on business impact, failure likelihood, and technical complexity. High-risk scenarios run first.
9. **Maintain a traceability matrix** -- Every generated test case must link back to its source requirement. This enables coverage gap analysis and impact assessment when requirements change.

## Test Case Design Methodology (Mandatory — must be applied before generating any set of test cases)

> **Mandatory rule**: Before generating test cases for any feature, you must check each of the following 6 methods for applicability. Mark inapplicable methods as `N/A`; applicable methods must produce corresponding test cases. It is forbidden to write only the "happy path" and stop.

### Enforcement: Method Coverage Sections (mandatory in output .md)

The final test case .md file **must** contain explicit section headers for all 6 methods. This is the enforcement mechanism — the orchestrator validates that all sections are present before accepting the output.

```markdown
## Method 1: Equivalence Partitioning
[cases or N/A with reason]

## Method 2: Boundary Value Analysis
[cases or N/A with reason]

## Method 3: Cause-Effect Graph / Decision Table
[cases or N/A with reason]

## Method 4: State Transition Testing
[cases or N/A with reason]

## Method 5: Scenario Method
[cases or N/A with reason]

## Method 6: Error Guessing
[cases or N/A with reason]

## Merged Test Case List
[final deduplicated cases from all applicable methods]
```

**Merged TC output format** (each TC must follow this structure for Excel export compatibility):

```markdown
**TC-{SOURCE}-{FEATURE}-{NNN}**: {用例标题}
- **优先级:** P0 | P1 | P2
- **测试类型:** {产出该用例的设计方法}
- **前置条件:** {前置条件描述，无则写"无"}
- **操作步骤:** {编号步骤，用空格分隔}
- **预期结果:** {预期行为描述}
- **测试数据:** {dataType 标记或具体值，无则省略此行}
```

> **Field requirements**: 优先级、测试类型、前置条件、操作步骤、预期结果为**必填**字段。测试数据为可选（无数据输入的 TC 可省略）。
>
> **测试类型**是指产出该用例的**设计方法**（对应 6 个 Method 章节），不是场景分类。取值必须为以下之一：
>
> | 测试类型值 | 对应章节 | 典型场景 |
> |-----------|---------|---------|
> | 等价类划分 | Method 1: Equivalence Partitioning | 有效/无效输入分类（合法邮箱 vs 非法格式） |
> | 边界值分析 | Method 2: Boundary Value Analysis | 长度上限、数值边界（密码最短/最长） |
> | 因果图 | Method 3: Cause-Effect Graph | 多条件组合（邮箱空 + 密码空 = 按钮禁用） |
> | 状态迁移 | Method 4: State Transition Testing | 状态流转（邮箱步骤 → 密码步骤 → 登录成功） |
> | 场景法 | Method 5: Scenario Method | 完整业务流程（happy path 从头到尾） |
> | 错误猜测 | Method 6: Error Guessing | 经验驱动（XSS、SQL 注入、特殊字符） |
>
> Merged 去重时，如果一个 TC 由多个方法同时产出，取**最先产出它的方法**。

**Validation rules** (checked by orchestrator after generation):
1. All 6 `## Method N:` sections must be present in the output .md
2. Each section must contain either test cases OR `N/A` with a reason (empty sections are rejected)
3. `## Merged Test Case List` must be present as the final consolidated output
4. If a method is marked `N/A`, the reason must explain why (e.g., "N/A — no numeric ranges in this feature, boundary analysis not applicable")
5. At least 3 of the 6 methods must produce actual test cases (not all N/A)

### Method 1: Equivalence Partitioning

Equivalence partitioning divides input parameters into equivalence classes, categorized as valid equivalence classes and invalid equivalence classes.

- **Valid equivalence classes**: Sets of reasonable, meaningful input data per the program specification. Valid equivalence classes verify whether the program implements the functions defined in the specification.
- **Invalid equivalence classes**: Sets of unreasonable, meaningless input data per the program specification. Invalid equivalence classes verify whether the program effectively rejects content outside the functions defined in the specification.
- Select a few representative values from each equivalence class as test data and design test cases. The representative data from each equivalence class is equivalent in testing effect to all other data in that class.
- **Important rule**: A single test case may cover multiple valid equivalence classes, but a single test case must cover only one invalid equivalence class.

**Using equivalence partitioning requires the following steps:**

#### Step 1: Partition input parameters into equivalence classes

Follow these principles when partitioning:

- When the input condition specifies a set of values or a condition that must be met, establish one valid equivalence class and one invalid equivalence class.
- When the input condition is a boolean, establish one valid equivalence class and one invalid equivalence class. A boolean is a two-value enumeration type with only two states: true and false.
- When a set of values is specified for input data (assume n values), and the program processes each value differently, establish n valid equivalence classes and 1 invalid equivalence class. For example, if the input condition states the character must be one of Chinese, English, or Arabic — take one value from each of these 3 character types as 3 valid equivalence classes, and any character outside these 3 types as the invalid equivalence class.
- When the input data must follow specific rules, establish one valid equivalence class (follows the rules) and several invalid equivalence classes (violates the rules from different angles).
- When elements of an already-partitioned equivalence class are known to be processed differently by the program, further subdivide that equivalence class into smaller classes.

Format: [Input Condition] [Valid Equivalence Class] [ID] [Invalid Equivalence Class] [ID]

#### Step 2: Convert equivalence classes into test cases

Build an equivalence class table using [Input Condition] [Valid Equivalence Class] [Invalid Equivalence Class], displayed in Markdown format, listing all partitioned equivalence classes. Assign a unique ID to each equivalence class.

- When designing a test case to cover valid equivalence classes, make the test case cover as many uncovered valid equivalence classes as possible. Repeat until all valid equivalence classes are covered. Cover all situations and output as many cases as possible.
- Design a new test case that covers only one uncovered invalid equivalence class. Repeat until all invalid equivalence classes are covered. Output test cases in Markdown table format.
- Output following these steps:
  - Step 1: \<step 1 reasoning\>
  - Step 2: \<step 2 reasoning\>
  - Test cases: \<response to customer\>

#### Step 3: Output test cases as Markdown table

Format: [Case ID] [Valid/Invalid Equivalence Class] [Case Level] [Case Name] [Input Conditions] [Operations] [Expected Result] [Related Step 1 Condition Combination IDs]

Think step by step.

**Example: Username field (2-20 characters, letters/digits/underscores only)**

Step 1: Partition equivalence classes

| Input Condition | Valid Equivalence Class | ID | Invalid Equivalence Class | ID |
|----------------|------------------------|-----|--------------------------|-----|
| Length range [2, 20] | 2-20 chars (e.g., "test_user") | V1 | 0 chars (empty) | I1 |
| | | | 1 char (e.g., "a") | I2 |
| | | | 21+ chars (e.g., "a"x21) | I3 |
| Character type: letters/digits/underscores | Letters only (e.g., "abcdef") | V2 | Contains spaces (e.g., "user name") | I4 |
| | Digits only (e.g., "12345") | V3 | Contains HTML special chars (e.g., "\<script\>") | I5 |
| | Mixed letters+digits+underscore (e.g., "test_01") | V4 | Contains Chinese chars (e.g., "用户名") | I6 |

Step 2: Design test cases — cover multiple valid classes per case; one invalid class per case

| Case ID | Valid/Invalid | Case Level | Case Name | Input Conditions | Operations | Expected Result | Condition IDs |
|---------|-------------|------------|-----------|-----------------|------------|-----------------|---------------|
| TC-EP-001 | Valid | P1 | Valid username with mixed chars | Username = "test_01" (8 chars, letters+digits+underscore) | Enter username, submit | Registration succeeds | V1, V4 |
| TC-EP-002 | Valid | P2 | Valid username letters only | Username = "abcdef" (6 chars, letters only) | Enter username, submit | Registration succeeds | V1, V2 |
| TC-EP-003 | Valid | P2 | Valid username digits only | Username = "12345" (5 chars, digits only) | Enter username, submit | Registration succeeds | V1, V3 |
| TC-EP-004 | Invalid | P1 | Empty username | Username = "" (0 chars) | Enter username, submit | Error: "Username is required" | I1 |
| TC-EP-005 | Invalid | P1 | Username too short | Username = "a" (1 char) | Enter username, submit | Error: "Username must be at least 2 characters" | I2 |
| TC-EP-006 | Invalid | P1 | Username too long | Username = "a"x21 (21 chars) | Enter username, submit | Error: "Username must not exceed 20 characters" | I3 |
| TC-EP-007 | Invalid | P2 | Username with spaces | Username = "user name" | Enter username, submit | Error: "Username contains invalid characters" | I4 |
| TC-EP-008 | Invalid | P2 | Username with HTML special chars | Username = "\<script\>" | Enter username, submit | Error: "Username contains invalid characters" | I5 |
| TC-EP-009 | Invalid | P2 | Username with Chinese chars | Username = "用户名" | Enter username, submit | Error: "Username contains invalid characters" | I6 |

**Applicable scenarios**: All scenarios with input (forms, search, API parameters).

### Method 2: Boundary Value Analysis

Boundary value analysis is a supplement to equivalence partitioning, focusing on the boundary values of input and output equivalence classes.

It is based on the experience that a large number of errors tend to occur at the boundaries of input or output ranges, rather than in the middle of the range.

Boundary value analysis requires testers to select input data at equivalence class boundaries, as well as data just beyond the boundaries.

Boundary value analysis is applicable to scenarios with continuous input values, such as numeric ranges, date ranges, string length limits, etc.

**Using boundary value analysis requires the following steps:**

#### Step 1: Identify boundary parameters

Identify all input parameters and output results in the system that have boundary characteristics.

#### Step 2: Identify valid and invalid boundaries

For each input parameter and output result, identify valid and invalid boundaries:

- For range type [min, max] inputs:
  - Minimum value (min), just below minimum (min-1), just above minimum (min+1)
  - Maximum value (max), just below maximum (max-1), just above maximum (max+1)
- For set or list type inputs:
  - Empty set/list, set/list with only one element, set/list with maximum allowed elements, set/list exceeding maximum allowed count
- For string type inputs:
  - Empty string, minimum length string, maximum length string, string exceeding maximum length

#### Step 3: Design test cases by combining boundary value conditions

Combine boundary value conditions to design test cases, ensuring coverage of critical boundary situations. Cover all situations and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Step 3: \<step 3 reasoning\>
- Test cases: \<response to customer\>

#### Step 4: Output test cases as Markdown table

Format: [Case ID] [Case Level] [Case Name] [Input Conditions] [Operations] [Expected Result]

Think step by step.

**Example: Password field (8-64 characters)**

Step 1: Identify boundary parameters — Password length has range constraint [8, 64].

Step 2: Identify valid and invalid boundaries:
- Lower bound: 7 (invalid, min-1), 8 (valid, min), 9 (valid, min+1)
- Upper bound: 63 (valid, max-1), 64 (valid, max), 65 (invalid, max+1)
- Special boundary: 0 (empty), 1 (minimum non-empty)

Step 3: Design test cases combining boundary conditions:

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
|---------|------------|-----------|-----------------|------------|-----------------|
| TC-BV-001 | P0 | Password empty | Password = "" (0 chars) | Enter password, submit | Error: "Password is required" |
| TC-BV-002 | P2 | Password 1 char | Password = "a" (1 char) | Enter password, submit | Error: "Password must be at least 8 characters" |
| TC-BV-003 | P0 | Password below minimum | Password = "Abcdef7" (7 chars) | Enter password, submit | Error: "Password must be at least 8 characters" |
| TC-BV-004 | P0 | Password at minimum | Password = "Abcdefg8" (8 chars) | Enter password, submit | Registration succeeds |
| TC-BV-005 | P2 | Password above minimum | Password = "Abcdefgh9" (9 chars) | Enter password, submit | Registration succeeds |
| TC-BV-006 | P2 | Password below maximum | Password = "a"x63 (63 chars) | Enter password, submit | Registration succeeds |
| TC-BV-007 | P0 | Password at maximum | Password = "a"x64 (64 chars) | Enter password, submit | Registration succeeds |
| TC-BV-008 | P0 | Password above maximum | Password = "a"x65 (65 chars) | Enter password, submit | Error: "Password must not exceed 64 characters" |

**Applicable scenarios**: Scenarios with numeric ranges, length limits, quantity limits, or time ranges.

### Method 3: Cause-Effect Graph / Decision Table

The cause-effect graph method identifies causes (input conditions) and effects (output results or program state changes) from requirements.

By analyzing relationships between input conditions (combination relationships, constraint relationships, etc.) and the relationships between input conditions and output results, a cause-effect graph is drawn, then converted into a decision table to design test cases.

The cause-effect graph method is primarily applicable when input conditions have mutual constraints or when output results depend on combinations of input conditions.

When using the cause-effect graph method, focus on analyzing all mutual constraint and combination relationships between input conditions. The dependency of output results on input conditions determines which input condition combinations produce which output results.

**4 relationships between causes and effects** (input conditions and output results): Identity, NOT, OR, AND.

**5 relationships between causes** (input conditions): Exclusive, Inclusive, Unique, Requires, Masks.

**Using the cause-effect graph method requires the following steps:**

#### Step 1: Analyze components and draw the cause-effect graph

Analyze the various components and modules in the system designed based on business logic. These components and modules are the factors in the cause-effect graph. Use the cause-effect graph to describe the causal relationships between factors in the system — primarily the relationships between components and modules. Draw the cause-effect graph.

#### Step 2: Build the decision table

Based on the causal relationships identified from the cause-effect graph, build and output the decision table.

#### Step 3: Convert the decision table into test cases

Convert each factor in the decision table into what it represents in the original business under test, then output test cases with one row per test case. Test cases should cover all inputs, conditions, and scenarios to ensure comprehensive system testing. Confirm that test case coverage logic is complete and non-redundant. Cover all situations and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Step 3: \<step 3 reasoning\>
- Test cases: \<response to customer\>

#### Step 4: Output test cases as Markdown table

Format: [Case ID] [Case Level] [Case Name] [Input Conditions] [Operations] [Expected Result]

Think step by step.

**Example: Product purchase page — login status x membership x stock**

Step 1: Analyze factors and draw cause-effect graph
- Causes (input conditions): C1 = User logged in, C2 = VIP membership, C3 = Product in stock
- Effects (output results): E1 = Redirect to login, E2 = Purchase at original price, E3 = Purchase at discounted price, E4 = Show out-of-stock notice, E5 = Show restock notification option
- Relationships: C1→NOT→E1 (identity-NOT); C1 AND C3 AND NOT C2→E2 (AND); C1 AND C3 AND C2→E3 (AND); C1 AND NOT C3→E4 (AND); C1 AND C2 AND NOT C3→E5 (AND)
- Constraint: C2 requires C1 (Requires relationship — must be logged in to have membership)

Step 2: Build decision table

| Rule | C1 (Logged in) | C2 (VIP) | C3 (In stock) | E1 (Redirect login) | E2 (Original price) | E3 (Discounted price) | E4 (Out-of-stock notice) | E5 (Restock notification) |
|------|---------------|----------|---------------|---------------------|---------------------|----------------------|--------------------------|--------------------------|
| R1 | N | - | - | Y | N | N | N | N |
| R2 | Y | N | Y | N | Y | N | N | N |
| R3 | Y | Y | Y | N | N | Y | N | N |
| R4 | Y | N | N | N | N | N | Y | N |
| R5 | Y | Y | N | N | N | N | Y | Y |

Step 3: Convert decision table into test cases

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
|---------|------------|-----------|-----------------|------------|-----------------|
| TC-CE-001 | P0 | Not logged in, attempt purchase | User not logged in | Click "Buy" button | Redirect to login page |
| TC-CE-002 | P0 | Regular user purchases in-stock product | Logged in, Regular membership, product in stock | Click "Buy" button | Purchase succeeds at original price |
| TC-CE-003 | P0 | VIP user purchases in-stock product | Logged in, VIP membership, product in stock | Click "Buy" button | Purchase succeeds at discounted price |
| TC-CE-004 | P1 | Regular user views out-of-stock product | Logged in, Regular membership, product out of stock | Click "Buy" button | Show out-of-stock notice |
| TC-CE-005 | P1 | VIP user views out-of-stock product | Logged in, VIP membership, product out of stock | Click "Buy" button | Show out-of-stock notice + restock notification option |

**Applicable scenarios**: Multi-condition combinations (permissions x status x role), complex business rules, toggle combinations.

### Method 4: State Transition Testing

The state transition method designs test cases based on system states and their transition relationships.

The state transition method treats the system as composed of a finite number of states, with the system transitioning between these states according to specific conditions.

The state transition method is particularly suitable for systems with clearly defined states, such as workflow systems, state machine systems, etc.

**Using the state transition method requires the following steps:**

#### Step 1: Identify all states

Determine all states of the system, including initial states, intermediate states, and terminal states.

#### Step 2: Identify transition events

Identify all events or conditions that cause state transitions.

#### Step 3: Build the state transition diagram or table

Establish a state transition diagram or state transition table, clearly defining the transition relationships between states.

#### Step 4: Design test cases covering the following paths

- All states are covered at least once.
- All transitions are covered at least once.
- Typical state sequences (common business flows) are covered.
- Illegal state transitions (verifying system constraints and safeguards).

Cover all situations and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Step 3: \<step 3 reasoning\>
- Step 4: \<step 4 reasoning\>
- Test cases: \<response to customer\>

#### Step 5: Output test cases as Markdown table

Format: [Case ID] [Case Level] [Case Name] [Input Conditions] [Operations] [Expected Result]

Think step by step.

**Example: Task state machine**

Step 1: Identify all states
- Initial state: Created
- Intermediate states: In Progress, Aborted
- Terminal state: Completed

Step 2: Identify transition events
- "Start" action: Created → In Progress
- "Complete" action: In Progress → Completed
- "Abort" action: In Progress → Aborted
- "Restart" action: Aborted → In Progress

```
State transition diagram:
  [Created] → [In Progress] → [Completed]
                ↓                 ↑
           [Aborted] ←───────────┘
```

Step 3: Build state transition table

| Current State | Event | Next State | Valid? |
|--------------|-------|------------|--------|
| Created | Start | In Progress | Yes |
| Created | Complete | - | No |
| Created | Abort | - | No |
| In Progress | Complete | Completed | Yes |
| In Progress | Abort | Aborted | Yes |
| In Progress | Start | - | No |
| Completed | Start | - | No |
| Completed | Abort | - | No |
| Aborted | Restart | In Progress | Yes |
| Aborted | Complete | - | No |

Step 4: Design test cases

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
|---------|------------|-----------|-----------------|------------|-----------------|
| TC-ST-001 | P0 | Normal flow: Created to In Progress | Task in Created state | Click "Start" | Task transitions to In Progress |
| TC-ST-002 | P0 | Normal flow: In Progress to Completed | Task in In Progress state | Click "Complete" | Task transitions to Completed |
| TC-ST-003 | P0 | Normal flow: In Progress to Aborted | Task in In Progress state | Click "Abort" | Task transitions to Aborted |
| TC-ST-004 | P1 | Recovery: Aborted to In Progress | Task in Aborted state | Click "Restart" | Task transitions to In Progress |
| TC-ST-005 | P1 | Full lifecycle: Created→In Progress→Completed | Task in Created state | Start → Complete | Task reaches Completed state |
| TC-ST-006 | P1 | Abort-recovery lifecycle | Task in Created state | Start → Abort → Restart → Complete | Task reaches Completed state |
| TC-ST-007 | P1 | Invalid: Complete from Created | Task in Created state | Attempt to complete directly | Operation rejected, state remains Created |
| TC-ST-008 | P1 | Invalid: Abort from Created | Task in Created state | Attempt to abort directly | Operation rejected, state remains Created |
| TC-ST-009 | P2 | Invalid: Start from Completed | Task in Completed state | Attempt to start | Operation rejected, state remains Completed |
| TC-ST-010 | P2 | Invalid: Abort from Completed | Task in Completed state | Attempt to abort | Operation rejected, state remains Completed |
| TC-ST-011 | P2 | Invalid: Complete from Aborted | Task in Aborted state | Attempt to complete directly | Operation rejected, state remains Aborted |

**Applicable scenarios**: Stateful objects (tasks, orders, tickets), workflow engines, UI component states (loading/done/error).

### Method 5: Scenario Method (Process Flow Analysis)

The scenario method simulates different scenarios from requirements to cover all functional points and business flows, thereby designing test cases.

The scenario method primarily involves identifying basic flows and alternative flows. The basic flow is the correct business process, simulating the user's correct business operations. The alternative flow is the incorrect business process, simulating the user's incorrect business operations.

A basic flow has only one starting point and one ending point. The basic flow is the main process; alternative flows are sub-processes. An alternative flow can originate from the basic flow or from other alternative flows. The endpoint of an alternative flow can be a process exit or a return to another flow's entry point. When alternative flows converge, which merges into which depends on traffic volume — i.e., the likelihood of the flow occurring.

When designing different scenarios, follow the principle that every alternative flow is covered, with exactly one loop coverage.

**Using the scenario method requires the following steps:**

#### Step 1: Identify all basic flows and alternative flows

#### Step 2: Combine flows into test scenarios

#### Step 3: Convert scenarios into test cases

Output test cases with one row per test case. Confirm that test case coverage logic is complete and non-redundant. Cover all situations and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Step 3: \<step 3 reasoning\>
- Test cases: \<response to customer\>

#### Step 4: Output test cases as Markdown table

Format: [Case ID] [Case Level] [Case Name] [Input Conditions] [Operations] [Expected Result]

Think step by step.

**Example: Share task flow**

Step 1: Identify flows
- Basic flow: Click share button → dialog opens → Click "Create share link" → generate link → display link + copy button → Click copy → clipboard has link → toast shows "Copied"
- Alternative flow 1 (from basic flow step 2): Network failure → show error message → return to dialog
- Alternative flow 2 (from basic flow step 2): Share link already exists → show "Remove share" option
- Alternative flow 3 (from any step): Click close/ESC → dialog closes, no side effects

Step 2: Combine into test scenarios
- Scenario 1: Basic flow (complete normal sharing)
- Scenario 2: Basic flow step 1-2 + Alternative flow 1 (network failure)
- Scenario 3: Basic flow step 1 + Alternative flow 2 (link already exists)
- Scenario 4: Basic flow step 1 + Alternative flow 3 (cancel at dialog)
- Scenario 5: Basic flow step 1-2 + Alternative flow 3 (cancel after link created)

Step 3: Design test cases

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
|---------|------------|-----------|-----------------|------------|-----------------|
| TC-SF-001 | P0 | Normal share flow | Task exists, no existing share link | Click share → Create share link → Copy link | Link copied to clipboard, toast shows "Copied" |
| TC-SF-002 | P1 | Network failure during link creation | Task exists, network disconnected | Click share → Create share link | Error message displayed, dialog remains open |
| TC-SF-003 | P1 | Share link already exists | Task exists, share link already created | Click share | Dialog shows existing link + "Remove share" option |
| TC-SF-004 | P2 | Cancel sharing at dialog | Task exists | Click share → Click close/ESC | Dialog closes, no side effects |
| TC-SF-005 | P2 | Cancel after link creation | Task exists, link just created | Click share → Create link → Click close | Dialog closes, share link remains valid |

**Applicable scenarios**: Multi-step operation flows, wizard-style interactions, complete CRUD lifecycle.

### Method 6: Error Guessing

Error guessing is a test case design method based on experience and intuition, where the tester leverages their understanding of the program under test and past testing experience to "guess" where errors are most likely to occur, and then designs targeted test cases.

Error guessing is a supplement to methods 1-5. After applying the previous 5 methods, error guessing is used to identify edge cases and defect-prone areas that systematic methods may have missed.

Error guessing relies on the tester's accumulated experience with common bug patterns, including but not limited to: concurrency issues, special character handling, empty/null states, boundary overflow, repeated operations, network exceptions, permission edge cases, and data consistency.

**Using error guessing requires the following steps:**

#### Step 1: Identify error-prone areas

Based on experience and common bug patterns, list the areas in the system under test that are most likely to contain defects. Common error-prone categories include:

- **Concurrency/race conditions**: Multiple users or tabs operating on the same resource simultaneously
- **Special input handling**: Special characters, HTML entities, SQL injection strings, emoji, unicode
- **Empty/null/zero states**: Empty lists, null values, zero quantities, first-time use scenarios
- **Overflow and extremes**: Excessively long text, very large numbers, maximum capacity
- **Repeated/rapid operations**: Double-click submit, rapid repeated requests, back-button resubmission
- **Network and environment exceptions**: Network disconnection, timeout, slow network, reconnection recovery
- **Permission and access edge cases**: Expired sessions, concurrent permission changes, unauthorized access attempts
- **Data consistency**: Cross-module data synchronization, cache-database consistency, concurrent modification conflicts

#### Step 2: Design targeted test cases for each error-prone area

For each identified error-prone area, design specific test cases with clear input conditions, operations, and expected results. Focus on scenarios that are likely to expose real defects. Cover all identified error-prone areas and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Test cases: \<response to customer\>

#### Step 3: Output test cases as Markdown table

Format: [Case ID] [Case Level] [Case Name] [Input Conditions] [Operations] [Expected Result]

Think step by step.

**Example: Task management system**

Step 1: Identify error-prone areas
- Concurrency: Multiple tabs editing the same task simultaneously
- Special input: Task name with HTML special characters
- Empty state: No tasks in the system, first-time user experience
- Overflow: Extremely long task name exceeding UI design assumptions
- Repeated operation: Rapid double-click on the submit button
- Network exception: Network interruption during task editing, then reconnection
- Permission edge case: Task permission revoked while user is editing
- Data consistency: Task renamed in one tab, stale name shown in another tab

Step 2: Design test cases targeting each error-prone area

| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
|---------|------------|-----------|-----------------|------------|-----------------|
| TC-EG-001 | P1 | Concurrent rename in two tabs | Same task open in two browser tabs | Rename to "Name-A" in tab A, then rename to "Name-B" in tab B | Last write wins; both tabs eventually show "Name-B"; no data corruption |
| TC-EG-002 | P1 | Special characters in task name | Task creation form open | Enter task name `<script>alert(1)</script>&"'` and submit | Task created successfully; name displayed with HTML escaped, no XSS |
| TC-EG-003 | P2 | Empty state — no tasks | New account, zero tasks | Navigate to task list page | Show empty state UI with illustration and "Create your first task" prompt |
| TC-EG-004 | P2 | Long text overflow in task name | Task creation form open | Enter task name with 500+ characters and submit | Name truncated or wrapped properly; no layout break; full name visible on detail page |
| TC-EG-005 | P1 | Rapid double-click submit | Task creation form filled with valid data | Double-click submit button within 100ms | Only one task created; no duplicate; button disabled after first click |
| TC-EG-006 | P1 | Network interruption during edit | Task editing in progress, unsaved changes exist | Disconnect network → continue editing → reconnect | Unsaved changes preserved; data syncs correctly after reconnection; no data loss |
| TC-EG-007 | P1 | Permission revoked during editing | User has edit permission, task edit form open | Admin revokes user's edit permission while user is editing → user clicks save | Save rejected with permission error message; no partial data written |
| TC-EG-008 | P2 | Stale data in another tab | Same task open in two tabs | Rename task in tab A → switch to tab B without refresh | Tab B shows stale name; upon next interaction or refresh, tab B updates to latest name |

**Applicable scenarios**: Supplement for all scenarios, especially edge cases not covered by the previous 5 methods.

### Final Markdown Output Format (Mandatory)

> After applying all 6 methods, merging, and deduplicating (per Phase C of Core Principles), the final test case .md file **must** use the following format. This is the contract between test-case-generator and `excel-case-export/scripts/generate-excel.js`.

**File path**: `test-cases/generated/{feature}.md`

**Format**: Each test case uses the structured field format (`**TC-ID**: title` + field list). The method-specific tables from the design process are intermediate reasoning artifacts — the final .md must use this format:

```markdown
# {Feature Name}

## Merged Test Case List

**TC-{SOURCE}-{FEATURE}-{NNN}**: {用例标题}
- **优先级:** P0
- **测试类型:** {设计方法：等价类划分 | 边界值分析 | 因果图 | 状态迁移 | 场景法 | 错误猜测}
- **前置条件:** {前置条件描述，无则写"无"}
- **操作步骤:** {编号步骤}
- **预期结果:** {预期行为描述}
- **测试数据:** {dataType 标记或具体值，无则省略}

**TC-{SOURCE}-{FEATURE}-{NNN}**: {用例标题}
- **优先级:** P1
- **测试类型:** ...
- **前置条件:** ...
- **Operations**: ...
- **Expected Result**: {Error message or rejection behavior}
- **Test Data**: {Invalid input values}

## Boundary Scenarios

**TC-{MOD}-004**: {Case title}
- **Priority**: P1
- **Preconditions**: ...
- **Operations**: ...
- **Expected Result**: ...
- **Test Data**: {Boundary values}
```

**Field mapping to Excel** (consumed by `generate-excel.js`):

| Markdown Field | Excel Column | Parsed By |
|---------------|-------------|-----------|
| `**TC-{MOD}-{SEQ}**:` pattern | A (Case ID) | Regex: `\*\*([A-Z]+-\w+-\d+)\*\*:` |
| `- **Priority**:` | D (Priority) | Key match: "优先级" or "Priority" |
| `- **Preconditions**:` | E (Preconditions) | Key match: "前置条件" or "Preconditions" |
| `- **Operations**:` | F (Steps) | Key match: "操作" or "Operations" |
| `- **Expected Result**:` | G (Expected Result) | Key match: "预期结果" or "Expected Result" |
| `- **Test Data**:` | H (Test Data) | Key match: "测试数据" or "Test Data" |
| `## section heading` | I (Test Type) | "Positive"/"Negative"/"Boundary" inferred from section |

> **Note**: The Markdown table outputs from the 6 design methods (shown in their examples) are also parseable by `generate-excel.js` as a fallback. But the structured field format above is the **primary** output format.

### Assertion Quality Standards (Mandatory)

> **Core principle: Every assertion must validate business semantics. Empty assertions are forbidden.**

| Assertion type | ❌ Empty assertion | ✅ Meaningful assertion |
|----------------|-------------------|------------------------|
| Existence | `expect(label).toBeVisible()` | `expect(label).toHaveText('Credits Consumed')` + `expect(value).toMatch(/^\d+$/)` |
| Numeric | `expect(text).toBeTruthy()` | `expect(Number(text)).toBeGreaterThanOrEqual(0)` |
| Time | `expect(time).toBeVisible()` | `expect(Date.parse(time)).not.toBeNaN()` |
| Consistency | `expect(title).toBeVisible()` | `expect(detailTitle).toBe(headerTitle)` — cross-reference validation with context |
| List | `expect(list).toBeVisible()` | `expect(items.length).toBeGreaterThan(0)` + verify each item's structure is complete |

**Assertion pattern for structured content (popover, card, table row):**

```typescript
// ❌ Wrong: only verifying label exists
await expect(page.getByText('Credits')).toBeVisible()

// ✅ Correct: verify label + value pair + value semantics
const credits = await page.getByText('Credits Consumed').locator('..').locator('span').last().textContent()
expect(Number(credits)).toBeGreaterThanOrEqual(0)

const title = await page.getByText('Task Title').locator('..').locator('span').last().textContent()
expect(title).toBe(expectedTaskName) // consistent with context
```

## Project Structure

```
tests/
  generated/
    features/
      user-authentication.feature
      shopping-cart.feature
      payment-processing.feature
    step-definitions/
      user-authentication.steps.ts
      shopping-cart.steps.ts
      payment-processing.steps.ts
    equivalence-classes/
      authentication-classes.ts
      cart-classes.ts
      payment-classes.ts
    traceability/
      traceability-matrix.json
      coverage-report.ts
  generators/
    story-parser.ts
    scenario-generator.ts
    equivalence-generator.ts
    boundary-generator.ts
    negative-scenario-generator.ts
    priority-calculator.ts
    traceability-builder.ts
    gherkin-formatter.ts
  fixtures/
    sample-stories.ts
    domain-rules.ts
  utils/
    nlp-helpers.ts
    gherkin-validator.ts
cucumber.config.ts
```

## Configuration

```typescript
// cucumber.config.ts
export default {
  default: {
    paths: ['tests/generated/features/**/*.feature'],
    require: ['tests/generated/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: [
      'progress-bar',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json',
    ],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    publishQuiet: true,
  },
};
```

```typescript
// tests/fixtures/sample-stories.ts

export interface UserStory {
  id: string;
  title: string;
  narrative: {
    asA: string;
    iWant: string;
    soThat: string;
  };
  acceptanceCriteria: AcceptanceCriterion[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags?: string[];
}

export interface AcceptanceCriterion {
  id: string;
  given: string;
  when: string;
  then: string;
  rules?: string[];
}

export const sampleStories: UserStory[] = [
  {
    id: 'US-101',
    title: 'User Registration',
    narrative: {
      asA: 'new visitor',
      iWant: 'to create an account with my email and password',
      soThat: 'I can access personalized features',
    },
    acceptanceCriteria: [
      {
        id: 'AC-101-1',
        given: 'I am on the registration page',
        when: 'I submit a valid email and password',
        then: 'my account is created and I am logged in',
        rules: [
          'Email must be a valid email format',
          'Password must be 8-64 characters',
          'Password must contain at least one uppercase letter, one lowercase letter, and one number',
          'Email must not already be registered',
        ],
      },
      {
        id: 'AC-101-2',
        given: 'I am on the registration page',
        when: 'I submit an email that is already registered',
        then: 'I see an error message without revealing whether the email exists',
      },
      {
        id: 'AC-101-3',
        given: 'I am on the registration page',
        when: 'I submit a password that does not meet requirements',
        then: 'I see specific validation messages for each unmet requirement',
      },
    ],
    priority: 'critical',
    tags: ['authentication', 'registration'],
  },
  {
    id: 'US-102',
    title: 'Add Item to Shopping Cart',
    narrative: {
      asA: 'logged-in customer',
      iWant: 'to add products to my shopping cart',
      soThat: 'I can purchase them later',
    },
    acceptanceCriteria: [
      {
        id: 'AC-102-1',
        given: 'I am viewing a product detail page',
        when: 'I click "Add to Cart" with a valid quantity',
        then: 'the item is added to my cart and the cart count updates',
        rules: [
          'Quantity must be between 1 and 99',
          'Item must be in stock',
          'Cart total must not exceed 50 items',
        ],
      },
      {
        id: 'AC-102-2',
        given: 'I am viewing a product that is out of stock',
        when: 'I attempt to add it to my cart',
        then: 'the Add to Cart button is disabled and I see an "Out of Stock" message',
      },
    ],
    priority: 'high',
    tags: ['shopping', 'cart'],
  },
];
```

## How-To Guides

### Parsing User Stories and Extracting Testable Criteria

The first step in test generation is systematically parsing user stories to identify all testable aspects.

```typescript
// tests/generators/story-parser.ts

import { UserStory, AcceptanceCriterion } from '../fixtures/sample-stories';

export interface ParsedStory {
  storyId: string;
  actor: string;
  action: string;
  benefit: string;
  criteria: ParsedCriterion[];
  implicitRequirements: string[];
}

export interface ParsedCriterion {
  criterionId: string;
  preconditions: string[];
  trigger: string;
  expectedOutcome: string;
  businessRules: string[];
  inputParameters: InputParameter[];
}

export interface InputParameter {
  name: string;
  type: 'string' | 'number' | 'email' | 'date' | 'enum' | 'boolean';
  constraints: string[];
  extractedFrom: string;
}

/**
 * Parse a user story into structured, testable components.
 */
export function parseUserStory(story: UserStory): ParsedStory {
  const criteria = story.acceptanceCriteria.map((ac) => parseCriterion(ac));

  // Extract implicit requirements that are not stated but should be tested
  const implicitRequirements = deriveImplicitRequirements(story);

  return {
    storyId: story.id,
    actor: story.narrative.asA,
    action: story.narrative.iWant,
    benefit: story.narrative.soThat,
    criteria,
    implicitRequirements,
  };
}

function parseCriterion(ac: AcceptanceCriterion): ParsedCriterion {
  const inputParameters = extractInputParameters(ac);

  return {
    criterionId: ac.id,
    preconditions: [ac.given],
    trigger: ac.when,
    expectedOutcome: ac.then,
    businessRules: ac.rules || [],
    inputParameters,
  };
}

function extractInputParameters(ac: AcceptanceCriterion): InputParameter[] {
  const params: InputParameter[] = [];

  // Parse rules to extract input constraints
  for (const rule of ac.rules || []) {
    // Pattern: "X must be Y-Z characters"
    const charLengthMatch = rule.match(/(\w+)\s+must\s+be\s+(\d+)-(\d+)\s+characters/i);
    if (charLengthMatch) {
      params.push({
        name: charLengthMatch[1].toLowerCase(),
        type: 'string',
        constraints: [`minLength:${charLengthMatch[2]}`, `maxLength:${charLengthMatch[3]}`],
        extractedFrom: rule,
      });
    }

    // Pattern: "X must be a valid email"
    const emailMatch = rule.match(/(\w+)\s+must\s+be\s+a\s+valid\s+email/i);
    if (emailMatch) {
      params.push({
        name: emailMatch[1].toLowerCase(),
        type: 'email',
        constraints: ['validFormat'],
        extractedFrom: rule,
      });
    }

    // Pattern: "X must be between Y and Z"
    const rangeMatch = rule.match(/(\w+)\s+must\s+be\s+between\s+(\d+)\s+and\s+(\d+)/i);
    if (rangeMatch) {
      params.push({
        name: rangeMatch[1].toLowerCase(),
        type: 'number',
        constraints: [`min:${rangeMatch[2]}`, `max:${rangeMatch[3]}`],
        extractedFrom: rule,
      });
    }

    // Pattern: "must contain at least one X"
    const containsMatch = rule.match(/must\s+contain\s+at\s+least\s+one\s+([\w\s]+)/i);
    if (containsMatch) {
      params.push({
        name: containsMatch[1].trim().replace(/\s+/g, '_'),
        type: 'string',
        constraints: [`contains:${containsMatch[1].trim()}`],
        extractedFrom: rule,
      });
    }
  }

  return params;
}

function deriveImplicitRequirements(story: UserStory): string[] {
  const implicit: string[] = [];

  // Security: all forms need CSRF protection
  if (story.acceptanceCriteria.some((ac) => ac.when.includes('submit'))) {
    implicit.push('Form submission must include CSRF token validation');
  }

  // Accessibility: all interactive elements need keyboard support
  implicit.push('All interactive elements must be keyboard accessible');

  // Performance: page load within budget
  implicit.push('Page must load within 3 seconds');

  // Error handling: generic error fallback
  implicit.push('Server errors must show user-friendly error message');

  // Authentication stories need rate limiting
  if (story.tags?.includes('authentication')) {
    implicit.push('Authentication endpoints must have rate limiting');
    implicit.push('Failed attempts must not reveal whether the account exists');
  }

  return implicit;
}
```

### Generating Equivalence Classes

Equivalence partitioning divides input domains into classes where all values in a class are expected to produce the same behavior. This reduces the number of test cases while maintaining coverage.

```typescript
// tests/generators/equivalence-generator.ts

import { InputParameter, ParsedCriterion } from './story-parser';

// NOTE: 'boundary' type is retained here for code compatibility with Method 2 (Boundary Value Analysis).
// Per the methodology, equivalence partitioning (Method 1) produces only 'valid'/'invalid' classes,
// while boundary values (Method 2) are an independent, supplementary method.
// In this implementation they share the same interface for simplicity.
export interface EquivalenceClass {
  parameterId: string;
  parameterName: string;
  className: string;
  type: 'valid' | 'invalid' | 'boundary';
  representative: string | number;
  description: string;
}

/**
 * Generate equivalence classes for all input parameters of a parsed criterion.
 */
export function generateEquivalenceClasses(
  criterion: ParsedCriterion
): EquivalenceClass[] {
  const classes: EquivalenceClass[] = [];

  for (const param of criterion.inputParameters) {
    classes.push(...generateClassesForParameter(param));
  }

  return classes;
}

function generateClassesForParameter(param: InputParameter): EquivalenceClass[] {
  const classes: EquivalenceClass[] = [];
  const baseName = param.name;

  switch (param.type) {
    case 'email':
      classes.push(
        { parameterId: baseName, parameterName: baseName, className: 'Valid email', type: 'valid', representative: 'user@example.com', description: 'Standard email format' },
        { parameterId: baseName, parameterName: baseName, className: 'Email with subdomain', type: 'valid', representative: 'user@mail.example.com', description: 'Email with subdomain' },
        { parameterId: baseName, parameterName: baseName, className: 'Email with plus alias', type: 'valid', representative: 'user+tag@example.com', description: 'Email with plus addressing' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing @ symbol', type: 'invalid', representative: 'userexample.com', description: 'Email without @ symbol' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing domain', type: 'invalid', representative: 'user@', description: 'Email without domain' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing local part', type: 'invalid', representative: '@example.com', description: 'Email without local part' },
        { parameterId: baseName, parameterName: baseName, className: 'Double dots', type: 'invalid', representative: 'user@example..com', description: 'Domain with consecutive dots' },
        { parameterId: baseName, parameterName: baseName, className: 'Empty string', type: 'invalid', representative: '', description: 'Empty email field' },
      );
      break;

    case 'string': {
      const minLength = extractConstraintValue(param.constraints, 'minLength');
      const maxLength = extractConstraintValue(param.constraints, 'maxLength');

      if (minLength !== null && maxLength !== null) {
        classes.push(
          { parameterId: baseName, parameterName: baseName, className: 'At minimum length', type: 'boundary', representative: 'a'.repeat(minLength), description: `Exactly ${minLength} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Below minimum', type: 'invalid', representative: 'a'.repeat(Math.max(0, minLength - 1)), description: `${minLength - 1} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'At maximum length', type: 'boundary', representative: 'a'.repeat(maxLength), description: `Exactly ${maxLength} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Above maximum', type: 'invalid', representative: 'a'.repeat(maxLength + 1), description: `${maxLength + 1} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Mid-range valid', type: 'valid', representative: 'a'.repeat(Math.floor((minLength + maxLength) / 2)), description: 'Middle of valid range' },
          { parameterId: baseName, parameterName: baseName, className: 'Empty string', type: 'invalid', representative: '', description: 'Empty field' },
        );
      }
      break;
    }

    case 'number': {
      const min = extractConstraintValue(param.constraints, 'min');
      const max = extractConstraintValue(param.constraints, 'max');

      if (min !== null && max !== null) {
        classes.push(
          { parameterId: baseName, parameterName: baseName, className: 'Minimum value', type: 'boundary', representative: min, description: `Exactly ${min}` },
          { parameterId: baseName, parameterName: baseName, className: 'Below minimum', type: 'invalid', representative: min - 1, description: `${min - 1} (below minimum)` },
          { parameterId: baseName, parameterName: baseName, className: 'Maximum value', type: 'boundary', representative: max, description: `Exactly ${max}` },
          { parameterId: baseName, parameterName: baseName, className: 'Above maximum', type: 'invalid', representative: max + 1, description: `${max + 1} (above maximum)` },
          { parameterId: baseName, parameterName: baseName, className: 'Mid-range valid', type: 'valid', representative: Math.floor((min + max) / 2), description: 'Middle of valid range' },
          { parameterId: baseName, parameterName: baseName, className: 'Zero', type: min > 0 ? 'invalid' : 'valid', representative: 0, description: 'Zero value' },
          { parameterId: baseName, parameterName: baseName, className: 'Negative', type: 'invalid', representative: -1, description: 'Negative value' },
        );
      }
      break;
    }
  }

  return classes;
}

function extractConstraintValue(constraints: string[], prefix: string): number | null {
  const constraint = constraints.find((c) => c.startsWith(`${prefix}:`));
  if (!constraint) return null;
  return parseInt(constraint.split(':')[1], 10);
}
```

### Generating Gherkin Scenarios from Parsed Stories

Transform parsed user stories and equivalence classes into Gherkin feature files with complete Given/When/Then scenarios.

```typescript
// tests/generators/gherkin-formatter.ts

import { ParsedStory, ParsedCriterion } from './story-parser';
import { EquivalenceClass, generateEquivalenceClasses } from './equivalence-generator';

/**
 * Generate a complete Gherkin feature file from a parsed user story.
 */
export function generateFeatureFile(story: ParsedStory): string {
  const lines: string[] = [];

  // Feature header
  lines.push(`@${story.storyId.replace(/[^a-zA-Z0-9]/g, '-')}`);
  lines.push(`Feature: ${story.action}`);
  lines.push(`  As a ${story.actor}`);
  lines.push(`  I want ${story.action}`);
  lines.push(`  So that ${story.benefit}`);
  lines.push('');

  // Background (common preconditions)
  const commonPreconditions = extractCommonPreconditions(story.criteria);
  if (commonPreconditions.length > 0) {
    lines.push('  Background:');
    for (const precondition of commonPreconditions) {
      lines.push(`    Given ${precondition}`);
    }
    lines.push('');
  }

  // Generate scenarios for each criterion
  for (const criterion of story.criteria) {
    // Positive scenario
    lines.push(...generatePositiveScenario(criterion));
    lines.push('');

    // Negative scenarios from equivalence classes (Method 1: Equivalence Partitioning)
    // Note: per methodology, each negative test case covers exactly one invalid equivalence class
    const eqClasses = generateEquivalenceClasses(criterion);
    const invalidClasses = eqClasses.filter((ec) => ec.type === 'invalid');

    for (const invalidClass of invalidClasses) {
      lines.push(...generateNegativeScenario(criterion, invalidClass));
      lines.push('');
    }

    // Boundary scenarios (Method 2: Boundary Value Analysis — independent from equivalence partitioning)
    // Boundary values are generated alongside equivalence classes for code simplicity,
    // but methodologically they are a separate, supplementary technique
    const boundaryClasses = eqClasses.filter((ec) => ec.type === 'boundary');
    if (boundaryClasses.length > 0) {
      lines.push(...generateBoundaryScenarioOutline(criterion, boundaryClasses));
      lines.push('');
    }
  }

  // Implicit requirement scenarios
  for (const implicit of story.implicitRequirements) {
    lines.push(`  @implicit @non-functional`);
    lines.push(`  Scenario: ${implicit}`);
    lines.push(`    Given the application is running`);
    lines.push(`    Then ${implicit.toLowerCase()}`);
    lines.push('');
  }

  return lines.join('\n');
}

function generatePositiveScenario(criterion: ParsedCriterion): string[] {
  const lines: string[] = [];

  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @positive`);
  lines.push(`  Scenario: ${criterion.trigger} - happy path`);

  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }

  lines.push(`    When ${criterion.trigger}`);
  lines.push(`    Then ${criterion.expectedOutcome}`);

  for (const rule of criterion.businessRules) {
    lines.push(`    And ${rule}`);
  }

  return lines;
}

function generateNegativeScenario(
  criterion: ParsedCriterion,
  invalidClass: EquivalenceClass
): string[] {
  const lines: string[] = [];

  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @negative`);
  lines.push(
    `  Scenario: Reject ${invalidClass.parameterName} - ${invalidClass.className}`
  );

  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }

  lines.push(
    `    When I provide ${invalidClass.parameterName} as "${invalidClass.representative}"`
  );
  lines.push(
    `    Then I should see a validation error for ${invalidClass.parameterName}`
  );
  lines.push(`    And the ${invalidClass.parameterName} error explains "${invalidClass.description}"`);

  return lines;
}

function generateBoundaryScenarioOutline(
  criterion: ParsedCriterion,
  boundaryClasses: EquivalenceClass[]
): string[] {
  const lines: string[] = [];

  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @boundary`);
  lines.push(`  Scenario Outline: Boundary values for ${criterion.trigger}`);

  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }

  lines.push(`    When I provide <parameter> as "<value>"`);
  lines.push(`    Then the result should be "<expected>"`);
  lines.push('');
  lines.push('    Examples:');
  lines.push('      | parameter | value | expected |');

  for (const boundary of boundaryClasses) {
    lines.push(
      `      | ${boundary.parameterName} | ${boundary.representative} | accepted |`
    );
  }

  return lines;
}

function extractCommonPreconditions(criteria: ParsedCriterion[]): string[] {
  if (criteria.length < 2) return [];

  const allPreconditions = criteria.map((c) => c.preconditions);
  return allPreconditions[0].filter((p) =>
    allPreconditions.every((pList) => pList.includes(p))
  );
}
```

### Generating Cucumber Step Definitions

Create step definition templates that connect Gherkin scenarios to executable test code.

```typescript
// tests/generators/scenario-generator.ts

import { ParsedStory } from './story-parser';

/**
 * Generate Cucumber step definitions for a parsed user story.
 */
export function generateStepDefinitions(story: ParsedStory): string {
  const lines: string[] = [];

  lines.push(`import { Given, When, Then } from '@cucumber/cucumber';`);
  lines.push(`import { expect } from '@playwright/test';`);
  lines.push(`import { page } from '../support/world';`);
  lines.push('');

  const steps = new Set<string>();

  for (const criterion of story.criteria) {
    // Given steps
    for (const precondition of criterion.preconditions) {
      const stepKey = `Given:${precondition}`;
      if (!steps.has(stepKey)) {
        steps.add(stepKey);
        lines.push(`Given('${escapeGherkin(precondition)}', async function () {`);
        lines.push(`  // Navigate to the appropriate page`);
        lines.push(`  await page.goto('/');`);
        lines.push(`  // TODO: Implement precondition setup`);
        lines.push(`});`);
        lines.push('');
      }
    }

    // When steps
    const whenKey = `When:${criterion.trigger}`;
    if (!steps.has(whenKey)) {
      steps.add(whenKey);
      lines.push(`When('${escapeGherkin(criterion.trigger)}', async function () {`);
      lines.push(`  // TODO: Implement action`);
      lines.push(`});`);
      lines.push('');
    }

    // Then steps
    const thenKey = `Then:${criterion.expectedOutcome}`;
    if (!steps.has(thenKey)) {
      steps.add(thenKey);
      lines.push(`Then('${escapeGherkin(criterion.expectedOutcome)}', async function () {`);
      lines.push(`  // TODO: Implement assertion`);
      lines.push(`});`);
      lines.push('');
    }
  }

  // Parameterized steps for equivalence classes
  lines.push(`When('I provide {word} as {string}', async function (parameter: string, value: string) {`);
  lines.push(`  const input = page.getByTestId(\`input-\${parameter}\`);`);
  lines.push(`  await input.clear();`);
  lines.push(`  await input.fill(value);`);
  lines.push(`});`);
  lines.push('');

  lines.push(`Then('I should see a validation error for {word}', async function (parameter: string) {`);
  lines.push(`  const error = page.getByTestId(\`error-\${parameter}\`);`);
  lines.push(`  await expect(error).toBeVisible();`);
  lines.push(`});`);
  lines.push('');

  lines.push(`Then('the {word} error explains {string}', async function (parameter: string, message: string) {`);
  lines.push(`  const error = page.getByTestId(\`error-\${parameter}\`);`);
  lines.push(`  const text = await error.textContent();`);
  lines.push(`  expect(text).toBeTruthy();`);
  lines.push(`});`);

  return lines.join('\n');
}

function escapeGherkin(text: string): string {
  return text.replace(/'/g, "\\'");
}
```

### Building a Risk-Based Priority Calculator

Not all test cases are equally important. This calculator assigns priority based on business impact, failure probability, and complexity.

```typescript
// tests/generators/priority-calculator.ts

export interface RiskAssessment {
  scenarioId: string;
  businessImpact: 1 | 2 | 3 | 4 | 5;  // 5 = critical
  failureLikelihood: 1 | 2 | 3 | 4 | 5; // 5 = very likely
  complexity: 1 | 2 | 3 | 4 | 5;        // 5 = very complex
  riskScore: number;
  priority: 'P0-critical' | 'P1-high' | 'P2-medium' | 'P3-low';
}

export function calculateRiskPriority(
  scenarioId: string,
  storyPriority: 'critical' | 'high' | 'medium' | 'low',
  scenarioType: 'positive' | 'negative' | 'boundary' | 'implicit',
  affectsPayment: boolean,
  affectsAuth: boolean,
  affectsData: boolean
): RiskAssessment {
  // Business impact based on story priority and scenario characteristics
  let businessImpact: 1 | 2 | 3 | 4 | 5 = 1;
  const priorityMap = { critical: 5, high: 4, medium: 3, low: 2 } as const;
  businessImpact = priorityMap[storyPriority] as 1 | 2 | 3 | 4 | 5;

  if (affectsPayment) businessImpact = 5;
  if (affectsAuth) businessImpact = Math.max(businessImpact, 4) as 1 | 2 | 3 | 4 | 5;

  // Failure likelihood based on scenario type
  let failureLikelihood: 1 | 2 | 3 | 4 | 5 = 2;
  switch (scenarioType) {
    case 'boundary':
      failureLikelihood = 4; // Boundary cases are error-prone
      break;
    case 'negative':
      failureLikelihood = 3; // Negative paths are often under-tested
      break;
    case 'implicit':
      failureLikelihood = 3; // Implicit requirements are often missed
      break;
    case 'positive':
      failureLikelihood = 2; // Happy paths are usually tested
      break;
  }

  // Complexity
  let complexity: 1 | 2 | 3 | 4 | 5 = 2;
  if (affectsPayment) complexity = 5;
  if (affectsData && affectsAuth) complexity = 4;

  // Risk score: weighted combination
  const riskScore =
    businessImpact * 0.5 + failureLikelihood * 0.3 + complexity * 0.2;

  // Priority classification
  let priority: RiskAssessment['priority'];
  if (riskScore >= 4.0) priority = 'P0-critical';
  else if (riskScore >= 3.0) priority = 'P1-high';
  else if (riskScore >= 2.0) priority = 'P2-medium';
  else priority = 'P3-low';

  return {
    scenarioId,
    businessImpact,
    failureLikelihood,
    complexity,
    riskScore: Math.round(riskScore * 100) / 100,
    priority,
  };
}
```

### Building a Traceability Matrix

A traceability matrix links every test case to its source requirement, enabling coverage analysis and change impact assessment.

```typescript
// tests/generators/traceability-builder.ts

import { ParsedStory } from './story-parser';
import { EquivalenceClass } from './equivalence-generator';

export interface TraceabilityEntry {
  testCaseId: string;
  storyId: string;
  criterionId: string;
  scenarioType: 'positive' | 'negative' | 'boundary' | 'implicit';
  scenarioTitle: string;
  priority: string;
  equivalenceClass?: string;
  featureFile: string;
  status: 'generated' | 'implemented' | 'passing' | 'failing' | 'skipped';
}

export interface TraceabilityMatrix {
  generated: string;
  totalStories: number;
  totalCriteria: number;
  totalTestCases: number;
  coverageByStory: Record<string, { total: number; implemented: number; passing: number }>;
  entries: TraceabilityEntry[];
}

export function buildTraceabilityMatrix(
  stories: ParsedStory[],
  equivalenceClasses: Map<string, EquivalenceClass[]>
): TraceabilityMatrix {
  const entries: TraceabilityEntry[] = [];
  let testCaseCounter = 1;
  let totalCriteria = 0;

  for (const story of stories) {
    for (const criterion of story.criteria) {
      totalCriteria++;

      // Positive scenario
      entries.push({
        testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
        storyId: story.storyId,
        criterionId: criterion.criterionId,
        scenarioType: 'positive',
        scenarioTitle: `${criterion.trigger} - happy path`,
        priority: 'P1-high',
        featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
        status: 'generated',
      });

      // Equivalence class scenarios
      const classes = equivalenceClasses.get(criterion.criterionId) || [];
      for (const ec of classes) {
        entries.push({
          testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
          storyId: story.storyId,
          criterionId: criterion.criterionId,
          scenarioType: ec.type === 'invalid' ? 'negative' : 'boundary',
          scenarioTitle: `${ec.parameterName} - ${ec.className}`,
          priority: ec.type === 'boundary' ? 'P1-high' : 'P2-medium',
          equivalenceClass: ec.className,
          featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
          status: 'generated',
        });
      }
    }

    // Implicit requirements
    for (const implicit of story.implicitRequirements) {
      entries.push({
        testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
        storyId: story.storyId,
        criterionId: 'implicit',
        scenarioType: 'implicit',
        scenarioTitle: implicit,
        priority: 'P2-medium',
        featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
        status: 'generated',
      });
    }
  }

  // Build coverage summary
  const coverageByStory: Record<string, { total: number; implemented: number; passing: number }> = {};
  for (const entry of entries) {
    if (!coverageByStory[entry.storyId]) {
      coverageByStory[entry.storyId] = { total: 0, implemented: 0, passing: 0 };
    }
    coverageByStory[entry.storyId].total++;
    if (entry.status === 'implemented' || entry.status === 'passing') {
      coverageByStory[entry.storyId].implemented++;
    }
    if (entry.status === 'passing') {
      coverageByStory[entry.storyId].passing++;
    }
  }

  return {
    generated: new Date().toISOString(),
    totalStories: stories.length,
    totalCriteria,
    totalTestCases: entries.length,
    coverageByStory,
    entries,
  };
}
```

### Python Implementation: Generating Test Cases from User Stories

For teams using Python with pytest-bdd, here is the equivalent test generation approach.

```python
# tests/generators/story_parser.py

from dataclasses import dataclass, field
import re


@dataclass
class InputParameter:
    name: str
    param_type: str  # 'string', 'number', 'email', 'date'
    constraints: list[str] = field(default_factory=list)
    extracted_from: str = ""


@dataclass
class ParsedCriterion:
    criterion_id: str
    preconditions: list[str]
    trigger: str
    expected_outcome: str
    business_rules: list[str]
    input_parameters: list[InputParameter]


@dataclass
class ParsedStory:
    story_id: str
    actor: str
    action: str
    benefit: str
    criteria: list[ParsedCriterion]
    implicit_requirements: list[str]


def parse_user_story(story: dict) -> ParsedStory:
    """Parse a user story dictionary into structured components."""
    criteria = []
    for ac in story.get("acceptance_criteria", []):
        params = extract_input_parameters(ac.get("rules", []))
        criteria.append(
            ParsedCriterion(
                criterion_id=ac["id"],
                preconditions=[ac["given"]],
                trigger=ac["when"],
                expected_outcome=ac["then"],
                business_rules=ac.get("rules", []),
                input_parameters=params,
            )
        )

    implicit = derive_implicit_requirements(story)

    return ParsedStory(
        story_id=story["id"],
        actor=story["narrative"]["as_a"],
        action=story["narrative"]["i_want"],
        benefit=story["narrative"]["so_that"],
        criteria=criteria,
        implicit_requirements=implicit,
    )


def extract_input_parameters(rules: list[str]) -> list[InputParameter]:
    """Extract input parameters and their constraints from business rules."""
    params = []

    for rule in rules:
        # Pattern: "X must be Y-Z characters"
        char_match = re.search(
            r"(\w+)\s+must\s+be\s+(\d+)-(\d+)\s+characters", rule, re.IGNORECASE
        )
        if char_match:
            params.append(
                InputParameter(
                    name=char_match.group(1).lower(),
                    param_type="string",
                    constraints=[
                        f"min_length:{char_match.group(2)}",
                        f"max_length:{char_match.group(3)}",
                    ],
                    extracted_from=rule,
                )
            )

        # Pattern: "X must be between Y and Z"
        range_match = re.search(
            r"(\w+)\s+must\s+be\s+between\s+(\d+)\s+and\s+(\d+)", rule, re.IGNORECASE
        )
        if range_match:
            params.append(
                InputParameter(
                    name=range_match.group(1).lower(),
                    param_type="number",
                    constraints=[
                        f"min:{range_match.group(2)}",
                        f"max:{range_match.group(3)}",
                    ],
                    extracted_from=rule,
                )
            )

    return params


def derive_implicit_requirements(story: dict) -> list[str]:
    """Derive implicit requirements from story context."""
    implicit = [
        "All interactive elements must be keyboard accessible",
        "Page must load within 3 seconds",
        "Server errors must show user-friendly error message",
    ]

    tags = story.get("tags", [])
    if "authentication" in tags:
        implicit.append("Authentication endpoints must have rate limiting")

    return implicit
```

```python
# tests/generators/gherkin_generator.py

from story_parser import ParsedStory, ParsedCriterion


def generate_feature_file(story: ParsedStory) -> str:
    """Generate a complete Gherkin feature file from a parsed story."""
    lines = []

    tag = story.story_id.replace(" ", "-")
    lines.append(f"@{tag}")
    lines.append(f"Feature: {story.action}")
    lines.append(f"  As a {story.actor}")
    lines.append(f"  I want {story.action}")
    lines.append(f"  So that {story.benefit}")
    lines.append("")

    for criterion in story.criteria:
        # Positive scenario
        lines.append(f"  @{criterion.criterion_id} @positive")
        lines.append(f"  Scenario: {criterion.trigger} - happy path")
        for pre in criterion.preconditions:
            lines.append(f"    Given {pre}")
        lines.append(f"    When {criterion.trigger}")
        lines.append(f"    Then {criterion.expected_outcome}")
        for rule in criterion.business_rules:
            lines.append(f"    And {rule}")
        lines.append("")

    return "\n".join(lines)
```

### Java Implementation: Generating Test Cases

For Java teams using Cucumber-JVM, the approach translates to the following structure.

```java
// src/test/java/generators/StoryParser.java

package generators;

import java.util.*;
import java.util.regex.*;

public class StoryParser {

    public record InputParameter(
        String name,
        String type,
        List<String> constraints,
        String extractedFrom
    ) {}

    public record ParsedCriterion(
        String criterionId,
        List<String> preconditions,
        String trigger,
        String expectedOutcome,
        List<String> businessRules,
        List<InputParameter> inputParameters
    ) {}

    public record ParsedStory(
        String storyId,
        String actor,
        String action,
        String benefit,
        List<ParsedCriterion> criteria,
        List<String> implicitRequirements
    ) {}

    public static List<InputParameter> extractInputParameters(List<String> rules) {
        List<InputParameter> params = new ArrayList<>();

        for (String rule : rules) {
            // Pattern: "X must be Y-Z characters"
            Matcher charMatch = Pattern.compile(
                "(\\w+)\\s+must\\s+be\\s+(\\d+)-(\\d+)\\s+characters",
                Pattern.CASE_INSENSITIVE
            ).matcher(rule);

            if (charMatch.find()) {
                params.add(new InputParameter(
                    charMatch.group(1).toLowerCase(),
                    "string",
                    List.of(
                        "minLength:" + charMatch.group(2),
                        "maxLength:" + charMatch.group(3)
                    ),
                    rule
                ));
            }

            // Pattern: "X must be between Y and Z"
            Matcher rangeMatch = Pattern.compile(
                "(\\w+)\\s+must\\s+be\\s+between\\s+(\\d+)\\s+and\\s+(\\d+)",
                Pattern.CASE_INSENSITIVE
            ).matcher(rule);

            if (rangeMatch.find()) {
                params.add(new InputParameter(
                    rangeMatch.group(1).toLowerCase(),
                    "number",
                    List.of(
                        "min:" + rangeMatch.group(2),
                        "max:" + rangeMatch.group(3)
                    ),
                    rule
                ));
            }
        }

        return params;
    }
}
```

## Best Practices

1. **Start with acceptance criteria, not implementation** -- Generate test cases from the requirements as written, not from how you think the system works. This prevents tests that merely confirm existing behavior rather than validating intended behavior.

2. **Generate negative scenarios for every positive path** -- If the acceptance criterion says "user can log in with valid credentials," generate explicit scenarios for invalid credentials, expired accounts, locked accounts, and missing fields.

3. **Use Scenario Outlines for data-driven tests** -- When multiple equivalence classes test the same flow with different data, use Gherkin Scenario Outlines with Examples tables rather than duplicating scenarios.

4. **Tag scenarios for selective execution** -- Tag scenarios by priority (@P0, @P1), type (@positive, @negative, @boundary), and feature area (@auth, @cart). This enables targeted test runs in CI.

5. **Review generated scenarios with business stakeholders** -- Gherkin is readable by non-technical stakeholders. Use generated scenarios as a review artifact to validate that all acceptance criteria are covered.

6. **Regenerate when requirements change** -- When acceptance criteria are updated, re-run the generator to identify new test cases and flag obsolete ones. The traceability matrix makes change impact analysis straightforward.

7. **Supplement generated tests with exploratory scenarios** -- Generators cover systematic cases but miss creative edge cases. Augment generated suites with manually written scenarios discovered through exploratory testing.

8. **Keep feature files focused** -- One feature file per user story. Do not combine unrelated stories into a single feature file. This maintains the traceability link between stories and tests.

9. **Validate Gherkin syntax before committing** -- Use a Gherkin linter (cucumber-lint, gherkin-lint) to ensure generated feature files have valid syntax and consistent formatting.

10. **Generate cross-cutting concern tests separately** -- Security, performance, and accessibility tests that apply to all features should be in dedicated feature files, not scattered across individual story features.

11. **Mark timeout requirements for time-consuming operations** -- For test cases involving AI processing, long-running async tasks (such as waiting for task completion, file conversion, batch processing), mark `"timeout": 600000` (10 minutes) in the handoff. The generated spec must include `test.setTimeout(600_000)` at the corresponding test level, because the default config timeout is insufficient for these time-consuming operations.

## Anti-Patterns to Avoid

1. **Generating tests without reading the story** -- Blindly applying templates without understanding the business context produces irrelevant test cases. Always read and parse the full user story narrative before generating.

2. **Ignoring implicit requirements** -- User stories rarely capture security, performance, and accessibility requirements explicitly. If you only generate tests for stated criteria, you miss critical coverage areas.

3. **Over-generating trivial tests** -- Not every equivalence class needs its own scenario. A password field with 56 boundary values does not need 56 separate scenarios. Use Scenario Outlines and focus on the most informative values.

4. **Generating without prioritizing** -- A flat list of 200 test cases with no priority is unusable. Every generated test must have a risk-based priority that determines execution order.

5. **Treating generated tests as final** -- Generated scenarios are a starting point, not a finished product. They need human review, refinement, and augmentation with domain-specific edge cases that no generator can anticipate.

6. **Duplicating step definitions** -- Generated step definitions should be reusable. "Given I am on the registration page" should be one step definition used across all scenarios, not duplicated in every feature file.

7. **Ignoring the traceability matrix** -- If you generate tests but do not maintain the traceability link to requirements, you lose the ability to assess coverage gaps and change impact.

## Debugging Tips

- **Parser misses parameters**: If the story parser fails to extract input parameters, check the phrasing of business rules. The parser expects specific patterns like "must be X-Y characters" or "must be between X and Y." Adjust regex patterns for your team's writing style.

- **Too many equivalence classes generated**: If the generator produces an overwhelming number of classes, check whether it is generating redundant classes for overlapping constraints. Deduplicate classes with the same representative values.

- **Gherkin syntax errors in generated files**: Ensure that quotes, special characters, and line breaks in acceptance criteria are properly escaped before inserting into Gherkin templates. Use a Gherkin parser to validate output.

- **Cucumber cannot find step definitions**: Generated step definitions use exact string matching. If the Gherkin scenario uses "I submit a valid email and password" but the step definition expects "I submit valid email and password," the step will not match. Normalize articles and prepositions.

- **Traceability matrix shows low coverage**: If coverage appears low, check whether the generator is correctly identifying all acceptance criteria from the source stories. Stories with non-standard formatting (missing Given/When/Then structure) may be partially parsed.

- **Priority calculator assigns everything as P1**: If risk scores are uniformly high, recalibrate the weights and thresholds. Ensure that the business impact, failure likelihood, and complexity inputs vary across scenarios rather than defaulting to maximum values.

- **Generated feature files are too long**: If a single feature file exceeds 200 lines, the source user story may be too large. Consider splitting the story into smaller stories with focused acceptance criteria before generating tests.

- **Step definition collisions**: When multiple feature files generate similar step definitions, Cucumber may raise ambiguous step errors. Use parameterized steps with regular expressions to handle variations rather than creating nearly-identical literal steps.

---

## Handoff to Playwright E2E

After all test cases are generated, **ALWAYS** produce a `playwright-handoff-{slug}.json` file. This is **MANDATORY in ALL modes** (PRD, CDP, issue). Without handoff, playwright-script-generator will refuse to generate specs.

### Step 1 — Write playwright-handoff-{slug}.json

Save to `test-cases/generated/playwright-handoff-{slug}.json`. **Each TC in the Merged Test Case List = exactly one handoff entry** (strict 1:1, NO merging). Each entry maps one test case to the data Playwright needs:

```json
[
  {
    "id": "TC-001",
    "storyId": "US-101",
    "criterionId": "AC-101-1",
    "title": "Delete task removes it from task list",
    "priority": "P0-critical",
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
  1. Read messages JSON from `$sourceProjectDir/$i18nMessagesDir/{defaultLocale}.json`
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

**i18n key reverse-lookup** (when `projectContext.i18nMessagesDir` is set):
After populating each handoff entry's uiElements and assertions, perform reverse-lookup:
1. Load `$sourceProjectDir/$i18nMessagesDir/{defaultLocale}.json` (use first language in appLanguages as default)
2. Build a flat map: { "Download file": "canvas.downloadFile", "Maximize": "canvas.maximize", ... }
3. For each uiElement.name and assertion.expected:
   a. Exact match in flat map → set i18nKey
   b. Case-insensitive match → set i18nKey
   c. No match → leave i18nKey null
4. This is a best-effort lookup. Missing keys are acceptable — downstream handles null gracefully via regex fallback.

### Step 2 — Invoke playwright-script-generator

After writing `playwright-handoff.json`, tell the user:

> ✅ Test cases written to `test-cases/generated/playwright-handoff-{feature}.json`.
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
| ✅ No change | Section content is identical to previous version | Skip, do not update any files |
| ✏️ Content modified | Section exists but descriptions/rules/flows have changed | Regenerate all artifacts for that module |
| ➕ New module | No corresponding section in traceability | Create all artifacts for that module |
| ❌ Deleted module | Previous version had this section, new version does not | Delete or mark as deprecated (see below) |

> If it is impossible to automatically determine whether a section has changed (e.g., Figma has no version history), **ask the user** which modules have changed, then execute the corresponding actions.

### Step 2 — Execute updates by change type

#### ✏️ Module content modified

Update all 7 artifact types for that module in sequence:

1. **feature file** — Delete the old `.feature` file, regenerate
2. **test_cases_data.json** — Replace the corresponding key (sheet) for that module
3. **Excel** — Only update the data JSON, execute `python tests/utils/export_excel.py` to regenerate `test-cases.xlsx`
4. **traceability-matrix.json** — Update entries for that module, preserve unchanged modules
5. **playwright-handoff.json** — Update handoff entries related to that module
6. **spec files** — Invoke the `playwright-script-generator` skill, passing the updated handoff, to rewrite the corresponding spec files
7. **Page Object** — If UI elements (locators, component names, interaction methods) have changed, synchronize updates to the corresponding `.page.ts`

#### ➕ New module

1. Create `tests/generated/features/<new-module>.feature`
2. Add a new sheet key in `test_cases_data.json`
3. Regenerate Excel (with a new Sheet added)
4. Append new module entries to the traceability-matrix
5. Append new module handoff entries to playwright-handoff.json
6. Invoke the `playwright-script-generator` skill to create corresponding spec files
7. If there are new pages/components, create or update Page Objects

#### ❌ Deleted module

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

✏️ Modified (2 modules):
  - Canvas Download: Format conversion rules added txt→xlsx support
    → Updated: canvas-download.feature / Excel Canvas Download Sheet / spec / handoff
  - View All Files: Added search functionality
    → Updated: view-all-files.feature / Excel View All Files Sheet / spec / handoff

➕ New (1 module):
  - File Share: Brand new functional module
    → Created: file-share.feature / Excel new Sheet / spec / Page Object

❌ Deleted (0 modules)

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
