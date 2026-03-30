# Input Extraction Methods

This file consolidates all input extraction methods: alignment mode, Word/plain-text, Markdown, Figma MCP, Pencil MCP, and Chrome CDP.

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

**Baseline → handoff field mapping** (critical for downstream playwright-script-generator):

| Baseline element field | Handoff `uiElements[]` field | Rule |
|----------------------|---------------------------|------|
| `text` (or `ariaLabel` if text empty) | `name` | Visible text becomes the locator name |
| `role` | `role` | Direct mapping |
| `locatorHint` | `locatorHint` | Direct copy — precise Playwright locator from CDP |
| `i18nKey` | `i18nKey` | Direct copy — null if i18n lookup not available |

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
     "priority": "P0",
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
