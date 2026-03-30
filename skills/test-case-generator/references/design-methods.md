# Test Case Design Methods (1-6)

This file contains the detailed instructions and examples for all 6 design methods referenced by the main SKILL.md.

> **Handling incomplete specs from alignment mode**: When input-extraction (see `references/input-extraction.md`) marks fields as `[DESIGN MISSING]` or `[REQUIREMENT MISSING]`, design methods should: (1) apply only to fully specified requirements; (2) for incomplete specs, generate a placeholder TC with `scenarioType: "blocked"` and a note explaining what information is missing; (3) never guess business rules from incomplete specs.

---

## Method 1: Equivalence Partitioning

Equivalence partitioning divides input parameters into equivalence classes, categorized as valid equivalence classes and invalid equivalence classes.

- **Valid equivalence classes**: Sets of reasonable, meaningful input data per the program specification. Valid equivalence classes verify whether the program implements the functions defined in the specification.
- **Invalid equivalence classes**: Sets of unreasonable, meaningless input data per the program specification. Invalid equivalence classes verify whether the program effectively rejects content outside the functions defined in the specification.
- Select a few representative values from each equivalence class as test data and design test cases. The representative data from each equivalence class is equivalent in testing effect to all other data in that class.
- **Important rule**: A single test case may cover multiple valid equivalence classes, but a single test case must cover only one invalid equivalence class.

**Using equivalence partitioning requires the following steps:**

### Step 1: Partition input parameters into equivalence classes

Follow these principles when partitioning:

- When the input condition specifies a set of values or a condition that must be met, establish one valid equivalence class and one invalid equivalence class.
- When the input condition is a boolean, establish one valid equivalence class and one invalid equivalence class. A boolean is a two-value enumeration type with only two states: true and false.
- When a set of values is specified for input data (assume n values), and the program processes each value differently, establish n valid equivalence classes and 1 invalid equivalence class. For example, if the input condition states the character must be one of Chinese, English, or Arabic — take one value from each of these 3 character types as 3 valid equivalence classes, and any character outside these 3 types as the invalid equivalence class.
- When the input data must follow specific rules, establish one valid equivalence class (follows the rules) and several invalid equivalence classes (violates the rules from different angles).
- When elements of an already-partitioned equivalence class are known to be processed differently by the program, further subdivide that equivalence class into smaller classes.

Format: [Input Condition] [Valid Equivalence Class] [ID] [Invalid Equivalence Class] [ID]

### Step 2: Convert equivalence classes into test cases

Build an equivalence class table using [Input Condition] [Valid Equivalence Class] [Invalid Equivalence Class], displayed in Markdown format, listing all partitioned equivalence classes. Assign a unique ID to each equivalence class.

- When designing a test case to cover valid equivalence classes, make the test case cover as many uncovered valid equivalence classes as possible. Repeat until all valid equivalence classes are covered. Cover all situations and output as many cases as possible.
- Design a new test case that covers only one uncovered invalid equivalence class. Repeat until all invalid equivalence classes are covered. Output test cases in Markdown table format.
- Output following these steps:
  - Step 1: \<step 1 reasoning\>
  - Step 2: \<step 2 reasoning\>
  - Test cases: \<response to customer\>

### Step 3: Output test cases as Markdown table

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

---

## Method 2: Boundary Value Analysis

Boundary value analysis is a supplement to equivalence partitioning, focusing on the boundary values of input and output equivalence classes.

It is based on the experience that a large number of errors tend to occur at the boundaries of input or output ranges, rather than in the middle of the range.

Boundary value analysis requires testers to select input data at equivalence class boundaries, as well as data just beyond the boundaries.

Boundary value analysis is applicable to scenarios with continuous input values, such as numeric ranges, date ranges, string length limits, etc.

**Using boundary value analysis requires the following steps:**

### Step 1: Identify boundary parameters

Identify all input parameters and output results in the system that have boundary characteristics.

### Step 2: Identify valid and invalid boundaries

For each input parameter and output result, identify valid and invalid boundaries:

- For range type [min, max] inputs:
  - Minimum value (min), just below minimum (min-1), just above minimum (min+1)
  - Maximum value (max), just below maximum (max-1), just above maximum (max+1)
- For set or list type inputs:
  - Empty set/list, set/list with only one element, set/list with maximum allowed elements, set/list exceeding maximum allowed count
- For string type inputs:
  - Empty string, minimum length string, maximum length string, string exceeding maximum length

### Step 3: Design test cases by combining boundary value conditions

Combine boundary value conditions to design test cases, ensuring coverage of critical boundary situations. Cover all situations and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Step 3: \<step 3 reasoning\>
- Test cases: \<response to customer\>

### Step 4: Output test cases as Markdown table

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

---

## Method 3: Cause-Effect Graph / Decision Table

The cause-effect graph method identifies causes (input conditions) and effects (output results or program state changes) from requirements.

By analyzing relationships between input conditions (combination relationships, constraint relationships, etc.) and the relationships between input conditions and output results, a cause-effect graph is drawn, then converted into a decision table to design test cases.

The cause-effect graph method is primarily applicable when input conditions have mutual constraints or when output results depend on combinations of input conditions.

When using the cause-effect graph method, focus on analyzing all mutual constraint and combination relationships between input conditions. The dependency of output results on input conditions determines which input condition combinations produce which output results.

**4 relationships between causes and effects** (input conditions and output results): Identity, NOT, OR, AND.

**5 relationships between causes** (input conditions): Exclusive, Inclusive, Unique, Requires, Masks.

**Using the cause-effect graph method requires the following steps:**

### Step 1: Analyze components and draw the cause-effect graph

Analyze the various components and modules in the system designed based on business logic. These components and modules are the factors in the cause-effect graph. Use the cause-effect graph to describe the causal relationships between factors in the system — primarily the relationships between components and modules. Draw the cause-effect graph.

### Step 2: Build the decision table

Based on the causal relationships identified from the cause-effect graph, build and output the decision table.

### Step 3: Convert the decision table into test cases

Convert each factor in the decision table into what it represents in the original business under test, then output test cases with one row per test case. Test cases should cover all inputs, conditions, and scenarios to ensure comprehensive system testing. Confirm that test case coverage logic is complete and non-redundant. Cover all situations and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Step 3: \<step 3 reasoning\>
- Test cases: \<response to customer\>

### Step 4: Output test cases as Markdown table

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

---

## Method 4: State Transition Testing

The state transition method designs test cases based on system states and their transition relationships.

The state transition method treats the system as composed of a finite number of states, with the system transitioning between these states according to specific conditions.

The state transition method is particularly suitable for systems with clearly defined states, such as workflow systems, state machine systems, etc.

**Using the state transition method requires the following steps:**

### Step 1: Identify all states

Determine all states of the system, including initial states, intermediate states, and terminal states.

### Step 2: Identify transition events

Identify all events or conditions that cause state transitions.

### Step 3: Build the state transition diagram or table

Establish a state transition diagram or state transition table, clearly defining the transition relationships between states.

### Step 4: Design test cases covering the following paths

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

### Step 5: Output test cases as Markdown table

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

---

## Method 5: Scenario Method (Process Flow Analysis)

The scenario method simulates different scenarios from requirements to cover all functional points and business flows, thereby designing test cases.

The scenario method primarily involves identifying basic flows and alternative flows. The basic flow is the correct business process, simulating the user's correct business operations. The alternative flow is the incorrect business process, simulating the user's incorrect business operations.

A basic flow has only one starting point and one ending point. The basic flow is the main process; alternative flows are sub-processes. An alternative flow can originate from the basic flow or from other alternative flows. The endpoint of an alternative flow can be a process exit or a return to another flow's entry point. When alternative flows converge, which merges into which depends on traffic volume — i.e., the likelihood of the flow occurring.

When designing different scenarios, follow the principle that every alternative flow is covered, with exactly one loop coverage.

**Using the scenario method requires the following steps:**

### Step 1: Identify all basic flows and alternative flows

### Step 2: Combine flows into test scenarios

### Step 3: Convert scenarios into test cases

Output test cases with one row per test case. Confirm that test case coverage logic is complete and non-redundant. Cover all situations and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Step 3: \<step 3 reasoning\>
- Test cases: \<response to customer\>

### Step 4: Output test cases as Markdown table

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

---

## Method 6: Error Guessing

Error guessing is a test case design method based on experience and intuition, where the tester leverages their understanding of the program under test and past testing experience to "guess" where errors are most likely to occur, and then designs targeted test cases.

Error guessing is a supplement to methods 1-5. After applying the previous 5 methods, error guessing is used to identify edge cases and defect-prone areas that systematic methods may have missed.

Error guessing relies on the tester's accumulated experience with common bug patterns, including but not limited to: concurrency issues, special character handling, empty/null states, boundary overflow, repeated operations, network exceptions, permission edge cases, and data consistency.

**Using error guessing requires the following steps:**

### Step 1: Identify error-prone areas

Based on experience and common bug patterns, list the areas in the system under test that are most likely to contain defects. Common error-prone categories include:

- **Concurrency/race conditions**: Multiple users or tabs operating on the same resource simultaneously
- **Special input handling**: Special characters, HTML entities, SQL injection strings, emoji, unicode
- **Empty/null/zero states**: Empty lists, null values, zero quantities, first-time use scenarios
- **Overflow and extremes**: Excessively long text, very large numbers, maximum capacity
- **Repeated/rapid operations**: Double-click submit, rapid repeated requests, back-button resubmission
- **Network and environment exceptions**: Network disconnection, timeout, slow network, reconnection recovery
- **Permission and access edge cases**: Expired sessions, concurrent permission changes, unauthorized access attempts
- **Data consistency**: Cross-module data synchronization, cache-database consistency, concurrent modification conflicts

### Step 2: Design targeted test cases for each error-prone area

For each identified error-prone area, design specific test cases with clear input conditions, operations, and expected results. Focus on scenarios that are likely to expose real defects. Cover all identified error-prone areas and output as many cases as possible.

Output following these steps:
- Step 1: \<step 1 reasoning\>
- Step 2: \<step 2 reasoning\>
- Test cases: \<response to customer\>

### Step 3: Output test cases as Markdown table

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
