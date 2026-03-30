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

## Priority Definition & Ratio

P0 = core happy path / auth / payment / blocking (15-20%). P1 = error handling + secondary features (40-50%). P2 = edge cases + UX polish (30-40%).

For full priority levels table, decision tree, and post-generation ratio validation, read `references/priority-framework.md`.

---

## Supported Input Sources

Before generating test cases, identify which input type(s) the user has provided and apply the corresponding extraction process:

| Input Type | How to recognize | Extraction approach |
|---|---|---|
| User story text | "As a... I want... So that..." | Parse directly per Core Principles |
| Word / plain-text requirements | Numbered lists, "shall/must/should" statements, pasted prose | Convert to user stories first |
| Markdown requirements doc | `.md` file path or pasted Markdown with headings/tables/checklists | Parse Markdown structure to extract stories |
| Figma via MCP | User provides a Figma file URL or node ID, Figma MCP tools are available | Call Figma MCP tools to extract design data |
| Pencil via MCP | User provides a Pencil project file path, Pencil MCP tools are available | Call Pencil MCP tools to extract screens and components |
| MD + Figma/Pencil (alignment mode) | Both a `.md` requirements doc and a Figma URL / Pencil file are provided | **Align first, then generate** |
| **Chrome CDP live page** | User specifies a target page (no requirements doc), Chrome is running | **First explore the real DOM via CDP, then infer stories** |
| Mixed | Any other combination | Extract separately then merge and deduplicate |

For all input extraction methods (alignment mode, Word, Markdown, Figma, Pencil, CDP), read `references/input-extraction.md`.

---

## Core Principles

The complete workflow follows this sequence: **Scope check → Parse → Design → Merge & Deduplicate → Output**.

### Phase A: Collect Existing Coverage (before design)

> **Deduplication hierarchy**: The primary deduplication is performed by the **e2e-orchestrator** (.claude/agents/e2e-orchestrator.md Step 2) before this skill is invoked. This skill's Phase A serves as a **defensive fallback**.

0. **Scan existing artifacts to build a coverage index** -- Before starting design, collect what already exists:
   - Scan `test-cases/generated/*.md` for existing case IDs and verification targets
   - Scan `tests/e2e/testcases/**/*.test.ts` for existing test names, case IDs, and assertions
   - Build an index: `{ caseId, feature, verificationTarget, locators }` per existing case
   - **Do not skip any module at this stage** — the decision to skip or supplement is made in Phase C after design is complete

### Phase B: Parse & Design (apply methods)

1. **Parse before generating** -- Fully parse the user story format and extract every testable acceptance criterion.
2. **Apply equivalence partitioning systematically** -- Divide input domains into valid and invalid equivalence classes. A single test case may cover multiple valid classes, but must cover only one invalid class.
3. **Derive boundary values as a supplement** -- Test at the boundary, one below, and one above.
4. **Generate both positive and negative scenarios** -- Generate explicit negative test cases for every positive scenario.
5. **Consider implicit requirements** -- Security, performance, accessibility, and error handling are often implicit.
6. **Test data self-sufficiency (mandatory for every test case)** -- Each test case must be **completely self-contained**: it creates its own preconditions, executes, verifies, and cleans up. No test may depend on another test's output or execution order.

   **Rules for every test case**:
   - **Setup (preconditions)**: Explicitly state what data must be created BEFORE the test action
   - **Teardown (postconditions)**: State what cleanup is needed AFTER the test
   - **No shared mutable state**: Tests must NOT rely on a specific task/record existing from a previous test
   - **Idempotent**: Running the same test twice must produce the same result

   **Common dependency patterns and how to handle them**:

   | Test Scenario | Wrong (dependent) | Right (self-sufficient) |
   |--------------|-------------------|------------------------|
   | Delete a task | Precondition: "Task exists" (from Create test) | Precondition: "Through UI create task 'Test-Del-{timestamp}'". Teardown: none |
   | Edit a task | Precondition: "Task exists" (from Create test) | Precondition: "Through UI create task 'Test-Edit-{timestamp}'". Teardown: "Delete task" |
   | View task detail | Precondition: "Task exists" (from Create test) | Precondition: "Through UI create task 'Test-View-{timestamp}'". Teardown: "Delete task" |
   | Filter by status | Precondition: "Multiple tasks with different statuses" | Precondition: "Create 3 tasks with statuses: open, in-progress, done". Teardown: "Delete all 3" |

   > **UI setup strategy**: Setup and teardown are done through UI interactions (via POM methods), not API calls.

   **CRUD setup/teardown pattern**:

   | Operation type | Setup needed? | Setup content | Teardown |
   |---------|:---------------:|-----------|----------|
   | **Create** | Navigation only | Navigate to target page | Delete created data |
   | **Read** | YES | Create target data via UI | Delete created data |
   | **Update** | YES | Create target data via UI | Delete created data |
   | **Delete** | YES | Create target data via UI | None (test itself deletes) |
   | **Download** | YES | Create/upload target file via UI | Delete created data |
   | **List/Filter** | YES | Create multiple matching records | Delete all created data |
   | **Navigate** | Navigation only | Navigate to start page | None |
   | **Validate** | Navigation only | Navigate to target page | None |

   **Precondition writing rules**:
   - Must be **executable UI operation sequences**, not vague state descriptions
   - Each step must correspond to a POM method call

   **Handoff `setup[]` field rules**:
   - `setup[]` must contain the complete precondition chain, each entry = one UI operation
   - Entry format: `{ "type": "ui"|"navigate", "action": "create"|"navigate"|"wait", "pomMethod": "method", "data": {} }`
   - **Empty setup[] only allowed for Create/Navigate/Validate operations**; Read/Update/Delete/Download/List operations must have non-empty setup[]

### Phase C: Merge & Deduplicate (after design)

6. **Merge all method outputs, deduplicate, and determine action**:
   - **Internal dedup**: same input + same operation + same expected result = duplicate, keep one
   - **Resolve conflicts**: different methods producing contradictory results → investigate
   - **Compare against existing cases**: same scenario with same assertions → remove; weaker assertions → supplement; no existing case → new
   - If every new case is a duplicate, output "All test cases already exist, skipping generation" and stop

### Phase D: Output

7. **Use Gherkin for traceability** -- BDD scenarios in Given/When/Then provide a natural link between requirements and test cases.
8. **Prioritize by risk, not by order** -- Assign priority based on business impact, failure likelihood, and technical complexity.
9. **Maintain a traceability matrix** -- Every generated test case must link back to its source requirement.

## Test Case Design Methodology (Mandatory)

> **Mandatory rule**: Before generating test cases for any feature, you must check each of the following 6 methods for applicability. Mark inapplicable methods as `N/A`; applicable methods must produce corresponding test cases. It is forbidden to write only the "happy path" and stop.

### Enforcement: Method Coverage Sections (mandatory in output .md)

The final test case .md file **must** contain explicit section headers for all 6 methods:

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

> **Field requirements**: 优先级、测试类型、前置条件、操作步骤、预期结果为**必填**字段。测试数据为可选。
>
> **测试类型** is the **design method** that produced this TC. Values: 等价类划分 | 边界值分析 | 因果图 | 状态迁移 | 场景法 | 错误猜测
>
> Merged 去重时，如果一个 TC 由多个方法同时产出，取**最先产出它的方法**。

**Validation rules** (checked by orchestrator after generation):
1. All 6 `## Method N:` sections must be present in the output .md
2. Each section must contain either test cases OR `N/A` with a reason (empty sections are rejected)
3. `## Merged Test Case List` must be present as the final consolidated output
4. If a method is marked `N/A`, the reason must explain why
5. At least 3 of the 6 methods must produce actual test cases (not all N/A)

For detailed instructions, step-by-step process, and full examples of all 6 design methods, read `references/design-methods.md`.

### Final Markdown Output Format (Mandatory)

> After applying all 6 methods, merging, and deduplicating, the final test case .md file **must** use the structured field format above. This is the contract between test-case-generator and `excel-case-export/scripts/generate-excel.js`.

**File path**: `test-cases/generated/{feature}.md`

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

### Boundary Scenarios & Assertion Standards

```markdown
## Boundary Scenarios

**TC-{MOD}-004**: {Case title}
- **Priority**: P1
- **Preconditions**: ...
- **Operations**: ...
- **Expected Result**: ...
- **Test Data**: {Boundary values}
```

### Assertion Quality Standards (Mandatory)

> **Core principle: Every assertion must validate business semantics. Empty assertions are forbidden.**

| Assertion type | Bad (empty) | Good (meaningful) |
|----------------|-------------------|------------------------|
| Existence | `expect(label).toBeVisible()` | `expect(label).toHaveText('Credits Consumed')` + `expect(value).toMatch(/^\d+$/)` |
| Numeric | `expect(text).toBeTruthy()` | `expect(Number(text)).toBeGreaterThanOrEqual(0)` |
| Time | `expect(time).toBeVisible()` | `expect(Date.parse(time)).not.toBeNaN()` |
| Consistency | `expect(title).toBeVisible()` | `expect(detailTitle).toBe(headerTitle)` |
| List | `expect(list).toBeVisible()` | `expect(items.length).toBeGreaterThan(0)` + verify structure |

**Assertion pattern for structured content (popover, card, table row):**

```typescript
// Bad: only verifying label exists
await expect(page.getByText('Credits')).toBeVisible()

// Good: verify label + value pair + value semantics
const credits = await page.getByText('Credits Consumed').locator('..').locator('span').last().textContent()
expect(Number(credits)).toBeGreaterThanOrEqual(0)

const title = await page.getByText('Task Title').locator('..').locator('span').last().textContent()
expect(title).toBe(expectedTaskName) // consistent with context
```

## Handoff to Playwright E2E

After all test cases are generated, **ALWAYS** produce a `playwright-handoff-{slug}.json` file. This is **MANDATORY in ALL modes** (PRD, CDP, issue). Without handoff, playwright-script-generator will refuse to generate specs.

**Key rules**:
- Each TC in the Merged Test Case List = exactly one handoff entry (strict 1:1, NO merging)
- Every entry must have: `id`, `storyId`, `title`, `priority` (`P0|P1|P2`), `preconditions`, `assertions` (length >= 1)
- Save to `test-cases/generated/playwright-handoff-{slug}.json`

**Post-write validation (MANDATORY)**: After writing the handoff JSON, verify before invoking playwright-script-generator:
1. Parse JSON → must be a valid array with length > 0
2. Entry count === TC count in "## Merged Test Case List"
3. Every entry has non-null: `id`, `storyId`, `title`, `priority`, `assertions` (length >= 1)
4. If validation fails → log error with specific missing fields and entry IDs, fix before proceeding
5. After validation passes → invoke the `playwright-script-generator` skill

For the full handoff JSON schema, all field rules (setup/teardown, uiElements, assertions, dataType inference, i18n reverse-lookup, timeout auto-detection), and the update strategy for requirement changes, read `references/playwright-handoff-schema.md`.

---

## Reference Files Index

- `references/priority-framework.md` — Priority levels table, recommended ratios, decision tree, post-generation validation rules. Read when assigning priority to test cases.
- `references/input-extraction.md` — ALL input extraction methods: alignment mode (MD x Figma/Pencil), Word/plain-text, Markdown, Figma MCP, Pencil MCP, Chrome CDP live page mode. Read when processing any input source.
- `references/design-methods.md` — Full instructions and examples for all 6 design methods (Equivalence Partitioning, Boundary Value Analysis, Cause-Effect Graph, State Transition, Scenario Method, Error Guessing). Read when applying design methods.
- `references/project-setup.md` — Cucumber/Gherkin project layout and configuration (supplementary, NOT part of the Playwright E2E main flow). Read only when generating Cucumber features.
- `references/how-to-guides.md` — TypeScript, Python, and Java implementation guides (story parser, equivalence generator, Gherkin formatter, step definitions, priority calculator, traceability builder). Read when implementing generators.
- `references/best-practices.md` — Best practices, anti-patterns to avoid, and debugging tips. Read when reviewing or troubleshooting generated test cases.
- `references/playwright-handoff-schema.md` — Full handoff JSON schema, field rules (setup/teardown, assertions, dataType, i18n, timeout), Excel export reference, and update strategy for requirement changes. Read when producing handoff files or handling requirement updates.
