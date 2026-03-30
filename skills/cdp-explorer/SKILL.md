---
name: CDP Page Explorer
description: Exhaustively explore pages via Chrome DevTools Protocol, build a state-flow graph, and output a structured baseline. The single source of truth for all CDP exploration scenarios.
version: 1.0.0
allowed_tools: [mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__fill, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, Read, Write, Grep, Glob]
---

# CDP Page Explorer Skill

You are a CDP page exploration expert. You perform **exhaustive exploration** on real browser pages via Chrome DevTools Protocol, discovering all interactive elements and hidden states, and outputting a structured baseline.

> **This Skill is the single source of truth for all CDP exploration scenarios.** The command layer (qa-explore, qa-from-issue) and the Skill layer (playwright-script-generator, test-case-generator) no longer inline CDP exploration logic; they all reference this file.

---

## Phase 0: Source Code Pre-Read (Mandatory when sourceProjectDir is available)

> **Core principle**: CDP discovers what IS on the page; source code reveals what SHOULD be there and WHY.
> Combining both prevents fragile CSS-based locators, misclassified bugs, and missed conditional rendering.
> **Skipping source reading when sourceProjectDir is available is a rule violation.**

**Activation**: The caller passes `sourceProjectDir` (or `prSourceDir`) in the prompt. If neither is available, log `WARNING: sourceProjectDir not provided — CDP-only degraded mode` and skip to Phase 1.

### Step 0.1 — Identify Target Components

From the `pageUrl` or `targetArea` provided by the caller, locate the source component(s):

```
1. Grep sourceProjectDir for route definitions matching pageUrl:
   Grep("{pageUrl-path-segment}", "$sourceProjectDir", glob: "*.tsx,*.jsx,*.vue,*.ts")
2. If targetArea is provided, also grep for component names matching the area
3. Read the matched component file(s) (max 3 files: page component + up to 2 child components)
```

### Step 0.2 — Extract Stable Identifiers from Source

From each component file, extract:

| Category | What to look for | Use in CDP |
|----------|-----------------|------------|
| Test IDs | `data-testid="..."` | **Highest priority locator** — use getByTestId |
| ARIA attributes | `aria-label`, `role`, `title` | **Second priority** — use getByRole/getByLabel |
| Conditional rendering | `{condition && <El>}`, ternary renders | Know which elements need state triggers to appear |
| i18n keys | `t("key")`, `useTranslations` | Map display text to i18n keys for stable locators |
| Semantic CSS classes | CSS module names, BEM classes | Usable as locators (stable across builds) |
| Tailwind utility classes | `rounded-xl`, `p-3`, `border`, `flex` | **NEVER use as locators** — unstable, not semantic |

### Step 0.3 — Build sourceContext

Produce a structured summary for use in Phases 1-4:

```
sourceContext = {
  components: [{ name, filePath, role: "page"|"section"|"widget" }],
  testIds: ["download-btn", "file-card"],
  ariaAttributes: [{ element, label, role }],
  conditionalElements: [{ element, condition, description }],
  i18nKeys: [{ element, key, namespace }],
  utilityClasses: ["rounded-xl", "p-3"]  // flagged — never use as locators
}
```

### Phase 0 Integration with Subsequent Phases

| Phase | How sourceContext is used |
|-------|--------------------------|
| Phase 2 (Initial Scan) | Validate CDP-discovered elements against source; flag utility-class locators |
| Phase 3 (Interactive) | Use `conditionalElements` to anticipate hidden states; trigger conditions before declaring "missing" |
| Phase 4 (Verification) | Cross-validate: CDP locator uses Tailwind class → replace with testId/aria from source |

### Post-CDP Cross-Validation (after Phase 2/3)

| Situation | Action |
|-----------|--------|
| CDP found element, source does not render it | May come from shared layout — investigate parent components |
| Source renders element with data-testid, CDP did not find it | Conditionally hidden — record condition, do NOT declare missing |
| CDP locator uses Tailwind utility class | Replace with data-testid or aria-* from source |
| CDP and source agree on data-testid | Highest confidence — use this locator |
| Source shows `t("key")` for button text | Use `i18n.t('key')` in POM instead of hardcoded text |

### Output Quality Check (after POM/spec generation, when sourceContext was built)

If Phase 0 produced a sourceContext, the command layer SHOULD validate generated output:

```
If sourceContext.testIds is non-empty:
  Grep generated POM for "getByTestId" usage
  If 0 matches → WARNING: "Source has data-testid but POM doesn't use getByTestId — source pre-read may not have been applied"

Grep generated POM for Tailwind utility classes used as locators:
  Pattern: locator('.*(?:rounded|flex|p-|m-|gap-|border|bg-|text-|w-|h-)
  If matches > 0 → WARNING: "POM uses Tailwind utility class as locator — unstable, consider data-testid/aria from source"
```

> This is a post-hoc validation, not a blocker. Warns about quality issues without stopping the pipeline.

---

## Core Philosophy: State-Flow Graph Exploration

### Theoretical Foundation

The exploration methodology of this Skill is based on the following established Web application testing theories:

**1. Crawljax Model-Driven Exploration (Mesbah & van Deursen, 2009)**
Modern Web applications are event-driven state machines. Every user interaction (click, hover, input, keyboard) can trigger JavaScript event handlers, causing DOM state transitions. Traditional crawlers only track URL changes and cannot cover hidden states in AJAX/SPA applications. The essence of exhaustive exploration is: **model the Web application as a finite state machine, systematically trigger all events, and discover all reachable states.**

**2. State Abstraction (State Equivalence)**
Do two DOMs after two interactions represent "the same state"? This is the key to avoiding state explosion. A **multi-layer equivalence function** is used:
- **Structural equivalence**: Ignore text content and dynamic attributes (id, timestamps), compare only the DOM tree skeleton (tags + roles + hierarchy)
- **Semantic equivalence**: Identical sets of interactive elements (deduplicated by role + name) = same state
- **Visual equivalence**: Pixel-level screenshot comparison (optional, as a supplementary check)

Evaluation order: use semantic equivalence first (fast), then structural equivalence (precise) when uncertain.

**3. Exploration Strategy: Hybrid Priority BFS**
Pure BFS treats all elements equally and is inefficient. A **priority-driven BFS** is used instead:
- **High priority**: aria-haspopup, aria-expanded="false", role="tab" (unselected), role="menuitem" — these elements are most likely to reveal new states
- **Medium priority**: button, a[href] (same-origin), input — common interactive elements
- **Low priority**: Purely presentational interactions (tooltip, hover highlight)

**4. Region-Based Exploration**
Large pages (e.g., Dashboards) divide the UI into independent regions (nav, sidebar, main, footer), each building its own sub-state-flow graph, then merging. This avoids cross-region state combination explosion.

**5. Full Event Coverage Principle**
Not limited to click and hover. Complete event coverage includes:
- **Mouse events**: click, dblclick, contextmenu, hover (mouseenter/mouseleave), drag
- **Keyboard events**: Enter, Escape, Tab, arrow keys, shortcuts (app-level shortcuts like Ctrl+S)
- **Input events**: input, change, blur, focus
- **Touch/gestures**: swipe (in mobile mode)
- **Window events**: resize, scroll

### State-Flow Graph

Static scanning can only discover elements in the page's initial state. In real pages, many elements are hidden behind interactions:

- Click a button → Modal pops up
- Hover over a menu → Dropdown expands
- Switch a Tab → New panel renders
- Scroll to bottom → More content loads
- Fill a form → Submit button becomes enabled
- Double-click a cell → Enter edit mode
- Drag an element → Reorder a list
- Keyboard shortcut → Trigger an action panel
- Right-click → Context menu actions
- Resize window → Responsive layout changes

**Exhaustive exploration** = building a State-Flow Graph:

```
State₀ (Initial page)
  │── click "Create" ──→ State₁ (Form Modal pops up)
  │                      │── fill form → State₁ₐ (Submit button enabled)
  │                      │── click close → State₀ (Back to initial)
  │── click Tab₂ ────→ State₂ (Tab₂ panel)
  │                      │── click button in Tab₂ → State₂ₐ (Sub-state)
  │── hover avatar ────→ State₃ (User menu expanded)
  │                      │── click menu item → State₃ₐ (Settings page/sub-panel)
  │── scroll ────────→ State₄ (More content loaded)
  │── contextmenu row ─→ State₅ (Context menu)
  │── dblclick cell ──→ State₆ (Inline editing)
  │── keyboard Ctrl+K → State₇ (Command palette)
  ...
```

---

## Three Exploration Modes

| Mode | Triggered by | Goal | Depth |
|------|-------------|------|-------|
| **full** | `/qa-explore` | Exhaustively discover all interactive elements and states | Recursively explore all interactions, no depth limit |
| **targeted** | `/qa-from-issue` | Start from issue-related areas, recursively explore all associated states | Start from target area, recursively explore all reachable states |
| **verify** | `playwright-script-generator` | Verify whether existing locators are usable | No interaction, query only |

The caller specifies via the `mode` parameter:
```
mode: "full"      → Exhaustive exploration
mode: "targeted"  → Targeted exploration (requires targetSelectors / targetArea)
mode: "verify"    → Locator verification (requires locators[])
```

---

## Phase 1: Page Connection

### Step 1 — List and Select a Page

```
mcp__chrome-devtools__list_pages
```

Matching strategy (by priority):
1. `pageUrl` passed by the caller → URL contains match
2. Among pages already open in the browser, match `baseURL`
3. No match → `navigate_page` to navigate to the target URL

```
mcp__chrome-devtools__select_page  pageId=<matched>
```

### Step 2 — Confirm Page Readiness

```
mcp__chrome-devtools__evaluate_script
  function: () => document.readyState
```

If not `complete`, wait:
```
mcp__chrome-devtools__wait_for  selector="body"  timeout=5000
```

### Step 3 — Login Wall Detection and Handling

After the page is ready, detect whether a login page is encountered:

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const indicators = [
      document.querySelector('input[type="password"]'),
      document.querySelector('[name="email"], [name="username"], input[type="email"]'),
      document.querySelector('form[action*="login"], form[action*="signin"]'),
      document.querySelector('[href*="forgot"], [href*="reset-password"]'),
    ];
    // >= 2 indicators = login page. But also check URL as fallback
    // (multi-step login may only show email field initially, no password in DOM)
    const urlHint = /sign-?in|log-?in|auth/i.test(location.pathname);
    const isLoginPage = indicators.filter(Boolean).length >= 2 || (urlHint && indicators.filter(Boolean).length >= 1);
    return {
      isLoginPage,
      url: location.href,
      title: document.title,
      hasPasswordField: !!indicators[0],
      hasUsernameField: !!indicators[1],
      hasLoginForm: !!indicators[2]
    };
  }
```

If a login page is detected:
1. Obtain `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD` from the project's `.env` (or from `projectContext.testCredentials`)
2. Fill in the login form and submit:
   ```
   mcp__chrome-devtools__fill  selector="input[type='email'], input[name='email'], input[name='username']"  value=E2E_TEST_EMAIL
   mcp__chrome-devtools__fill  selector="input[type='password']"  value=E2E_TEST_PASSWORD
   mcp__chrome-devtools__click  selector="button[type='submit'], button:has-text('Sign in'), button:has-text('登录')"
   ```
3. Wait for navigation to complete, verify that the login page has been left
4. If still on the login page → error "Auto-login failed, please log in manually in the browser and retry"
5. After successful login, navigate to the original target URL and continue with Phase 2 exploration

---

## Phase 2: Initial State Scan (State₀)

> **Three-layer scan order: DOM → Accessibility tree → Screenshot. No steps may be skipped.**

Phase 2 performs a comprehensive three-layer scan to build the initial state (State₀):
- **Layer 1 — DOM Structure Scan**: Region-based scan of all interactive elements, headings, dialogs, and alerts using a broad-coverage selector. Includes framework event listener detection via cursor:pointer heuristic, and i18n key reverse-lookup when `projectContext.i18nMessagesDir` is available.
- **Layer 2 — Accessibility Tree**: Supplements hierarchy, semantic states (expanded/checked/selected), and precise role+name mapping.
- **Layer 3 — Screenshot**: Visual aid for layout confirmation. Not used for locator positioning.

For the complete DOM scan JavaScript, i18n reverse-lookup logic, and Layer 2/3 details, read `references/dom-scan.md`.

---

## Phase 3: Interactive Exploration (Exhaustive Discovery)

> **Only executed in `full` and `targeted` modes. Skipped in `verify` mode.**

### Core Algorithm: Priority-Driven BFS + State Equivalence

```
knownStates = { State₀ }
priorityQueue = PriorityQueue(all interactive elements in State₀, sorted by priority)
stateFlowGraph = { nodes: [State₀], edges: [] }
coverageTracker = { interactedElements: 0, totalInteractiveElements: N }
startTime = now()

// Termination conditions — exploration stops when ANY of these is met:
MAX_INTERACTIONS = 100   // Max number of element interactions
MAX_STATES = 30          // Max number of unique states discovered
MAX_DURATION_MS = 600000 // Max exploration time: 10 minutes

while (priorityQueue is not empty
       && coverageTracker.interactedElements < MAX_INTERACTIONS
       && knownStates.size < MAX_STATES
       && (now() - startTime) < MAX_DURATION_MS) {

  element = priorityQueue.pop()  // Take highest priority

  // 1. Only exclude truly destructive actions
  if (element is destructive action) → record to baseline.destructiveActions, continue to next

  // 2. Execute interaction (choose interaction type based on element type)
  interact(element)  // click / hover / fill / dblclick / contextmenu / keyboard

  // 3. Wait for DOM to stabilize
  waitForStable()

  // 4. Re-scan DOM
  newState = scanDOM()

  // 5. State equivalence check
  equivalentState = findEquivalent(newState, knownStates)
  if (!equivalentState) {
    knownStates.add(newState)
    stateFlowGraph.addEdge(currentState, element, newState)
    priorityQueue.push(...new elements in newState)  // Newly discovered elements also enter the queue
  } else {
    stateFlowGraph.addEdge(currentState, element, equivalentState)  // Record edge, skip redundant exploration
  }

  // 6. Update coverage
  coverageTracker.interactedElements++

  // 7. Backtrack to pre-interaction state (with verification — see Step 7)
  backtrack()
}

// After loop: output coverage report
coverageReport = {
  terminationReason: priorityQueue.isEmpty ? "queue_empty" :
                     interactedElements >= MAX_INTERACTIONS ? "max_interactions" :
                     knownStates.size >= MAX_STATES ? "max_states" : "max_duration",
  interactedElements: coverageTracker.interactedElements,
  totalElementsSeen: coverageTracker.totalInteractiveElements,
  statesDiscovered: knownStates.size,
  edgesRecorded: stateFlowGraph.edges.length,
  remainingInQueue: priorityQueue.size,
  durationMs: now() - startTime
}
// Include coverageReport in the baseline output so the caller knows if exploration was exhaustive or truncated
```

> **When exploration is truncated** (terminated by limits, not by empty queue): the coverage report shows `remainingInQueue > 0`, indicating unexplored elements. The caller (qa-explore command) should report this to the user: "Exploration reached limit (N interactions / M states / T minutes). X elements remain unexplored. Run again to continue."

### Step 1 — Identify Interactive Elements and Assign Priorities

From Phase 2's DOM scan results, classify by **exploration priority** and **action type**:

**Priority Levels (determine exploration order):**

| Priority | Element Characteristics | Reason |
|----------|----------------------|--------|
| P0 Highest | `aria-haspopup`, `aria-expanded="false"`, `role="tab"` (unselected) | Most likely to reveal hidden states |
| P1 High | `role="menuitem"`, `role="treeitem"`, navigation links (same-origin) | May lead to new pages/regions |
| P2 Medium | `button`, `a[href]` (same-origin), `input`, `select` | Common interactions |
| P3 Low | tooltip triggers, purely visual hover effects | Small state changes but still need recording |

**Action Type Classification (determine how to interact):**

| Type | Criteria | Handling |
|------|----------|----------|
| Explore | Tab switching, accordion expansion, hover menu, detail view, tree node expansion | Interact directly, record new state |
| Explore+Backtrack | Form filling (not submitted), checkbox toggle, search box input, sort switching | Interact → record → backtrack |
| Explore+Backtrack | Same-origin navigation links, route-change buttons | Interact → record target page state → go back (browser back) |
| Explore+Backtrack | Submit form (POST), create/edit operations | Fill form to explore field constraints, but **do not click submit**, record form structure |
| Record Only | Delete, logout, close account, irreversible operations | **Do not execute**, record to destructiveActions |
| Record Only | External links (cross-origin) | **Do not execute**, record href to externalLinks |

### Step 2 — Explore by UI Pattern

Execute pattern-specific exploration for each UI element type (tabs, dropdowns, modals, hover menus, accordions, scroll loading, context menus, drag-and-drop, keyboard shortcuts, double-click, tree views, shadow DOM, iframes, toasts). For detailed procedures and code examples for all patterns A-N, read `references/ui-patterns.md`.

### Step 3 — Disabled/Hidden Element Activation

When the DOM scan finds disabled or hidden elements, treat them as unexplored potential states and attempt activation using strategies: form completion, trigger controller, toggle sequence, scroll into viewport, and state dependency analysis. For the full detection script, all 5 strategies with code, and output format, read `references/activation-strategies.md`.

### Steps 4-5 — Form Exploration + State Stability Detection

Step 4 extracts input constraints (name, type, required, min/max, pattern, options) from all forms for test case generation. Step 5 uses a MutationObserver with 800ms quiet period + 5s max wait + double requestAnimationFrame to confirm DOM stability after each interaction. For the complete scripts, read `references/form-exploration.md`.

### Step 6 — State Equivalence Check

After each interaction, the newly scanned DOM state must be checked for equivalence with known states.

> **Key principle**: The fingerprint must capture **interaction-relevant state differences**, not just element identity. Two states with the same buttons but different `disabled`/`expanded`/`checked` states are NOT equivalent — they represent different user-facing behaviors.

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    // Extract page state fingerprint: element identity + interaction states + dialog state + URL
    const interactives = Array.from(document.querySelectorAll(
      'button, [role="button"], a[href], input, textarea, select, [role="tab"], [role="menuitem"], [role="dialog"]'
    )).map(el => {
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const name = el.getAttribute('aria-label') || el.getAttribute('name') || el.textContent?.trim().substring(0, 50);
      // Include interaction-relevant states in the fingerprint
      const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
      const expanded = el.getAttribute('aria-expanded');
      const checked = el.checked ?? el.getAttribute('aria-checked');
      const selected = el.selected ?? el.getAttribute('aria-selected');
      const hasValue = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? (el.value.length > 0) : null;
      return `${role}:${name}:d=${disabled}:e=${expanded}:c=${checked}:s=${selected}:v=${hasValue}`;
    }).sort().join('|');

    const dialogs = document.querySelectorAll('[role="dialog"]:not([hidden]), [aria-modal="true"]');
    const visibleDialogs = Array.from(dialogs).filter(d => d.offsetParent !== null);
    const dialogTitles = visibleDialogs.map(d =>
      d.getAttribute('aria-label') || d.querySelector('h2,h3')?.textContent?.trim() || 'untitled'
    ).sort().join(',');

    return {
      fingerprint: interactives,
      url: location.href,
      openDialogs: visibleDialogs.length,
      dialogTitles,
      hash: btoa(interactives).substring(0, 48)  // Longer hash for more precise comparison
    };
  }
```

Equivalence rules:
1. Different URL → definitely different states
2. Same URL + different dialog count or different dialog titles → different states
3. Same URL + same dialogs + **exact** fingerprint hash match → equivalent state (skip redundant exploration)
4. Fingerprint hash differs → definitely different states (due to disabled/expanded/checked/value inclusion, the fingerprint now captures state changes that the old role:name-only fingerprint would miss)

### Step 7 — Backtrack Strategy

After interaction, must backtrack to the pre-interaction state. **Before interacting**, save the current state fingerprint (from Step 6) as `preInteractionFingerprint`.

| Interaction Type | Backtrack Method |
|-----------------|------------------|
| Tab switch | Click back to original tab |
| Modal opened | press Escape or click close button |
| Dropdown expanded | press Escape |
| Hover menu | hover over blank area |
| Accordion expanded | click again to collapse |
| Checkbox toggle | click again to restore |
| Form filled | Clear input field (fill "") |

**Backtrack verification** (mandatory after every backtrack):
1. Wait for stability (Step 5)
2. Compute current state fingerprint (Step 6)
3. Compare with `preInteractionFingerprint`:
   - **Match** → backtrack succeeded, continue to next element in the queue
   - **Mismatch** → backtrack failed, apply fallback:

**Fallback chain** (try in order until fingerprint matches):
1. **Try Escape** → press Escape, wait, re-check fingerprint
2. **Try browser back** → `mcp__chrome-devtools__navigate_page type="back"`, wait, re-check
3. **Force navigate** → `mcp__chrome-devtools__navigate_page url=<original exploration URL>`, wait, re-check
4. **If all fail** → log warning "Backtrack failed after fallback chain, current state may be inconsistent", record in baseline as `backtrackFailures[]`, continue exploration from the current state (treat it as a new starting point)

> **Why this matters**: Without backtrack verification, a failed backtrack silently corrupts the exploration. All subsequent interactions happen in the wrong state, producing incorrect state-flow edges and missing elements that would have been reachable from the correct state.

---

## Phase 4: Locator Verification + Phase 5: Output Baseline

**Phase 4** (verify mode only): Verifies whether existing locators uniquely match on the real page, supporting both CSS selectors and Playwright role-based locators. Output: `UNIQUE` / `MULTIPLE(n)` / `ZERO`. For the complete verification scripts, read `references/locator-verification.md`.

**Phase 5**: Outputs the structured baseline JSON to `$QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{page-slug}.json`. For the full JSON schema example and page-slug naming rules, read `references/baseline-schema.md`.

---

## Targeted Mode Supplementary Rules

When `mode: "targeted"`:

1. **Focused starting point**: The caller passes in `targetArea` (CSS selector or text description), which serves as the exploration starting point
2. **Recursive exploration**: Starting from the target area, recursively explore all reachable states (click → discover new state → scan new elements → continue exploring), with no artificial depth limit
3. **Context preserved**: Phase 2 performs a normal full-page scan (to understand page structure and navigation relationships), Phase 3 starts recursive exploration from targetArea
4. **Association discovery**: If interactions in the target area cause changes in other regions (e.g., sidebar updates after clicking a button), also track and record these associated states

```
// Call example (passed in by qa-from-issue)
mode: "targeted"
targetArea: "button:Download"  // or CSS selector ".download-section"
reproSteps: ["Click download button", "Select format", "Confirm download"]
```

During execution:
1. Phase 2 performs a normal full-page scan → understand complete page structure
2. Phase 3 starts from targetArea, recursively explore all reachable states
3. If `reproSteps` exists → first follow the steps sequentially, recording state changes at each step, then continue exploring new elements discovered during the steps
4. Pay attention to cascading effects of target area interactions on other regions (e.g., list refresh after form submission)
5. **Area tagging**: All states and edges discovered during targeted exploration are tagged with `sourceArea` = area identifier (derived from `targetArea`). This enables downstream e2e-orchestrator to filter baseline by area. See `references/baseline-schema.md` for `sourceArea` field rules.

---

### Language Difference Handling (i18n-Aware Exploration)

CDP connects to the browser which may display in any language. For the full i18n detection, reverse-lookup, and locator generation rules, read `references/locator-verification.md`.

---

## Exploration Termination Conditions

Exploration terminates when **any** of the following conditions are met:

| Condition | Description |
|-----------|-------------|
| **Coverage saturation** | 10 consecutive interactions discovered no new states or elements, AND all disabled/hidden elements have been retried for activation across all discovered states |
| **Queue empty** | Priority queue is empty, all interactive elements have been processed, and unactivated element retry pass is complete |
| **Time limit** | Single-page exploration exceeds 2 hours (full mode) or 1 hour (targeted mode) |

**Note: No hard MAX_STATES limit is set.** The number of states is determined by page complexity and is not artificially truncated. Natural convergence is achieved through state equivalence checks, avoiding redundant exploration.

**Incomplete exploration check:** Before declaring termination, verify:
1. No "unactivated" elements remain that haven't been retried in every discovered state
2. If unactivated elements exist, perform one final sweep: for each unactivated element, visit each discovered state and check if the element is now active
3. Only after this final sweep can coverage saturation be declared

When exploration ends, record the termination reason in the baseline's `explorationStats`:
```json
"explorationStats": {
  "terminationReason": "coverage_saturated | queue_empty | timeout",
  "statesDiscovered": 12,
  "interactionsPerformed": 87,
  "elementsFound": 234,
  "activatedElements": 8,
  "unactivatedElements": 2,
  "coverageRate": 0.95,
  "duration": "23m"
}
```

---

## Locator Priority (Unified Standard)

> Locator information is recorded as `locatorHint` per element during Phase 2 scan, and output in the baseline for downstream test-case-generator and playwright-script-generator. See `references/baseline-schema.md` for the generation algorithm.

**Language-agnostic priority (after CDP exploration / multilingual scenarios):**

1. `data-testid` — Most stable
2. CSS class combination — Language-agnostic
3. `aria-label` — Usable when hardcoded in English
4. `role` + `name` — Be aware of headless language differences
5. Plain text — Most susceptible to language impact

> **Conditional data-testid**: `data-testid` is listed first ONLY if the CDP scan actually discovered elements with this attribute. If no elements in the scan have `testId` populated, the effective priority becomes:
> `CSS class` > `aria-label` > `role+name` > plain text
> The `locatorProfile` field in the baseline output (see Phase 5) records whether data-testid was found.

**Semantic priority (single language, confirmed no differences):**

1. `getByRole('button', { name: 'Submit' })` — Best semantics
2. `getByLabel('Email')` — Form input
3. `getByPlaceholder('Search...')` — When no label exists
4. `getByText('Welcome')` — Non-interactive elements
5. `getByTestId('checkout-total')` — When semantics are not feasible
6. `page.locator('.legacy-widget')` — Last resort

**On conflict**: If the page has multilingual/i18n support, or CDP and headless text are inconsistent → always prioritize language-agnostic locators.

---

## Reference Files

| File | Content |
|------|---------|
| `references/dom-scan.md` | Phase 2 full DOM scan JavaScript, i18n reverse-lookup, Layer 2/3 details |
| `references/ui-patterns.md` | Step 2 all UI patterns A-N with code examples |
| `references/activation-strategies.md` | Step 3 disabled/hidden element detection and activation strategies A-E |
| `references/form-exploration.md` | Step 4 form constraint extraction + Step 5 state stability detection |
| `references/baseline-schema.md` | Phase 5 output baseline JSON schema + page-slug naming rules |
| `references/locator-verification.md` | Phase 4 verify mode scripts + i18n language handling rules |
