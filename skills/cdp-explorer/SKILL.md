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
      document.querySelector('[name="email"], [name="username"]'),
      document.querySelector('form[action*="login"], form[action*="signin"]'),
    ];
    const isLoginPage = indicators.filter(Boolean).length >= 2;
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

### Layer 1 — DOM Structure Scan (Language-agnostic, preferred)

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const root = document.querySelector('main') || document.body;

    function scanRegion(container, regionName) {
      // Interactive elements
      // Broad-coverage selector: covers all interactive element types
      const selectorMatched = new Set(container.querySelectorAll(
        'button, [role="button"], a[href], input, textarea, select, ' +
        '[role="tab"], [role="menuitem"], [role="option"], [role="switch"], ' +
        '[role="checkbox"], [role="radio"], [role="slider"], [role="spinbutton"], ' +
        '[role="treeitem"], [role="gridcell"], [role="link"], [role="searchbox"], ' +
        '[role="combobox"], [role="listbox"], ' +
        '[contenteditable="true"], [draggable="true"], ' +
        '[onclick], [onchange], [onkeydown], [onkeyup], [ondblclick], [oncontextmenu], ' +
        '[data-testid], [data-action], [data-toggle], [data-target], [data-bs-toggle], ' +
        '[tabindex]:not([tabindex="-1"]), ' +
        'summary, details, label[for]'
      ));

      // Framework event listener detection (React/Vue/Svelte bind events via addEventListener,
      // not via HTML attributes — these elements have no [onclick] but are still interactive)
      // Detect by cursor:pointer style, which frameworks/CSS commonly set on clickable elements
      const cursorPointerEls = Array.from(container.querySelectorAll('div, span, li, section, article, td, tr'))
        .filter(el => {
          if (selectorMatched.has(el)) return false;  // Already captured by selector
          const style = window.getComputedStyle(el);
          return style.cursor === 'pointer' && el.offsetParent !== null && el.offsetWidth > 0;
        });

      const interactives = Array.from(new Set([...selectorMatched, ...cursorPointerEls])).map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        testId: el.dataset?.testid,
        ariaLabel: el.getAttribute('aria-label'),
        ariaDescribedby: el.getAttribute('aria-describedby'),
        ariaControls: el.getAttribute('aria-controls'),
        placeholder: el.getAttribute('placeholder'),
        text: el.textContent?.trim().substring(0, 200),
        title: el.getAttribute('title'),
        href: el.getAttribute('href'),
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        required: el.required || el.getAttribute('aria-required') === 'true',
        readOnly: el.readOnly || el.getAttribute('aria-readonly') === 'true',
        maxLength: el.getAttribute('maxlength'),
        checked: el.checked ?? (el.getAttribute('aria-checked') === 'true'),
        selected: el.selected ?? (el.getAttribute('aria-selected') === 'true'),
        expanded: el.getAttribute('aria-expanded'),
        hasPopup: el.getAttribute('aria-haspopup'),
        draggable: el.getAttribute('draggable'),
        tabIndex: el.getAttribute('tabindex'),
        class: el.className?.toString().substring(0, 200),
        visible: el.offsetParent !== null || el.offsetWidth > 0,
        rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
        i18nKey: null,       // populated by Step 3.5 i18n reverse-lookup, e.g. "canvas.downloadFile"
        i18nAware: false,    // set to true after i18n key reverse-lookup is attempted
        region: regionName
      }));

      // Section headings
      const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,[role="heading"]')).map(h => ({
        level: h.tagName.match(/\d/)?.[0] || h.getAttribute('aria-level') || '?',
        text: h.textContent?.trim().substring(0, 80),
        region: regionName
      }));

      return { interactives, headings };
    }

    // Region-based scanning (broad coverage: standard semantic regions + common UI framework layouts)
    const nav = document.querySelector('nav, [role="navigation"]');
    const sidebar = document.querySelector('aside, [role="complementary"], [class*="sidebar"], [class*="side-panel"]');
    const main = document.querySelector('main, [role="main"]') || root;
    const footer = document.querySelector('footer, [role="contentinfo"]');
    const header = document.querySelector('header, [role="banner"]');
    const toolbar = document.querySelector('[role="toolbar"]');

    const regions = {};
    if (header) regions.header = scanRegion(header, 'header');
    if (nav) regions.nav = scanRegion(nav, 'nav');
    if (toolbar) regions.toolbar = scanRegion(toolbar, 'toolbar');
    if (sidebar) regions.sidebar = scanRegion(sidebar, 'sidebar');
    regions.main = scanRegion(main, 'main');
    if (footer) regions.footer = scanRegion(footer, 'footer');

    // Popups/Modals (global scope)
    const dialogs = Array.from(document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'
    )).map(el => ({
      title: el.getAttribute('aria-label') || el.querySelector('h2,h3')?.textContent?.trim(),
      visible: el.offsetParent !== null,
      testId: el.dataset?.testid,
      class: el.className?.toString().substring(0, 80)
    }));

    // Status elements
    const alerts = Array.from(document.querySelectorAll('[role="alert"],[role="status"]')).map(el => ({
      role: el.getAttribute('role'),
      text: el.textContent?.trim().substring(0, 80)
    }));

    return {
      url: location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      regions,
      dialogs,
      alerts,
      summary: {
        totalInteractives: Object.values(regions).reduce((n, r) => n + r.interactives.length, 0),
        totalHeadings: Object.values(regions).reduce((n, r) => n + r.headings.length, 0),
        dialogCount: dialogs.length,
        alertCount: alerts.length
      }
    };
  }
```

### Step 3.5 — i18n key reverse-lookup (when `projectContext.i18nMessagesDir` is available)

After collecting all interactive elements and their displayed text:
1. Load `$i18nMessagesDir/{detectedLocale}.json`（i18nMessagesDir 由命令层传入，指向 QA_WORKSPACE_DIR/messages/）
2. Build flat value→key map: flatten nested JSON to dot-path keys
   ```javascript
   // { "canvas": { "downloadFile": "Download file" } }
   // → { "Download file": "canvas.downloadFile" }
   ```
3. For each element with non-empty `text`:
   a. Look up text in flat map → set element.i18nKey if found
   b. Try trimmed/lowercased match → set if found
   c. No match → element.i18nKey = null
4. Record in baseline: `"i18nReverseLookup": { "attempted": N, "matched": M }`

This enriches the baseline so that downstream test-case-generator and playwright-script-generator can reference i18n keys instead of hardcoded text.

### Layer 2 — Accessibility Tree (Hierarchy + Semantic State)

```
mcp__chrome-devtools__take_snapshot
```

Supplement from the snapshot:
- Element parent-child hierarchy (used to construct narrowed locators)
- Interaction states such as `expanded` / `checked` / `selected`
- Precise mapping of `role` and `name` (cross-validated with the DOM layer)

### Layer 3 — Screenshot (Visual Aid, Optional)

```
mcp__chrome-devtools__take_screenshot
```

Used for:
- Confirming visible area layout
- Assisting in understanding spatial relationships between elements
- **Not used as a basis for locator positioning**

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

#### A. Tab / Navigation Switching

```
Discover role="tab" element list
for each tab (currently unselected):
  1. click(tab)
  2. wait_for  corresponding tabpanel visible
  3. scanDOM() → record new elements within the tabpanel
  4. Add new elements to the exploration queue
```

```
mcp__chrome-devtools__click  selector="[role='tab']:nth-child(2)"
mcp__chrome-devtools__wait_for  selector="[role='tabpanel']"  state="visible"
mcp__chrome-devtools__evaluate_script  // Re-scan tabpanel content
```

#### B. Dropdown Menu / Combobox

```
Discover aria-haspopup / role="combobox" / role="listbox" triggers
  1. click(trigger)
  2. wait_for  listbox/menu appears
  3. scanDOM() → record all option/menuitem
  4. click(trigger) or press Escape → close
```

```
mcp__chrome-devtools__click  selector="[role='combobox']"
mcp__chrome-devtools__wait_for  selector="[role='listbox']"  state="visible"
mcp__chrome-devtools__evaluate_script
  function: () => Array.from(document.querySelectorAll('[role="option"]')).map(el => ({
    text: el.textContent?.trim(), value: el.getAttribute('data-value'),
    selected: el.getAttribute('aria-selected') === 'true'
  }))
mcp__chrome-devtools__press_key  key="Escape"
```

#### C. Modal / Dialog

```
Discover buttons that trigger Modals (aria-haspopup="dialog" / text contains "Create", "Edit", etc.)
  1. click(trigger)
  2. wait_for  [role="dialog"] appears
  3. scanDOM() → record all form elements and buttons within the dialog
  4. Close dialog (click close button / press Escape)
  5. Verify dialog has disappeared
```

```
mcp__chrome-devtools__click  selector="button:has-text('Create')"
mcp__chrome-devtools__wait_for  selector="[role='dialog']"  state="visible"
mcp__chrome-devtools__evaluate_script  // Scan dialog content
mcp__chrome-devtools__press_key  key="Escape"
mcp__chrome-devtools__wait_for  selector="[role='dialog']"  state="hidden"
```

#### D. Hover Menu / Tooltip

```
Discover elements that may trigger hover effects (avatar, navigation items, elements with title)
  1. hover(element)
  2. Brief wait (DOM change detection)
  3. scanDOM() → detect whether new elements have appeared
  4. Move hover away → restore
```

```
mcp__chrome-devtools__hover  selector=".avatar"
mcp__chrome-devtools__evaluate_script
  function: () => {
    const menus = document.querySelectorAll('[role="menu"]:not([hidden])');
    return Array.from(menus).map(m => ({
      items: Array.from(m.querySelectorAll('[role="menuitem"]')).map(i => i.textContent?.trim())
    }));
  }
```

#### E. Accordion / Collapsible Panel

```
Discover elements with aria-expanded="false"
  1. click(element)
  2. wait_for  aria-expanded="true"
  3. scanDOM() → record newly revealed content
  4. click(element) → collapse (backtrack)
```

#### F. Scroll Loading (Infinite Scroll / Pagination)

```
Detect whether the page has pagination controls or infinite scroll:
  1. Find pagination buttons ("Next", ">", links within role="navigation")
  2. If pagination exists → browse the first 3 pages, record content structure and pagination state changes per page
  3. Scroll to bottom → detect whether new content loads (IntersectionObserver / scroll event)
  4. If infinite scroll → scroll 3 consecutive times, record newly loaded content structure each time
  5. Record the loading pattern (pagination/infinite scroll/virtual scroll/static)
  6. Detect virtual scroll (only renders rows in the visible area) → record elements in viewport and total data volume
```

#### G. Context Menu

```
For elements likely to have context menus (table rows, file cards, list items, canvas elements):
  1. evaluate_script to trigger contextmenu event
  2. Detect whether [role="menu"] appears
  3. Scan all menu items, including sub-menus (hover menuitem to detect sub-menu expansion)
  4. press Escape to close
```

#### H. Drag & Drop Interaction

```
Discover [draggable="true"] or sortable containers (with data-sortable, class containing sortable/draggable):
  1. Record all draggable elements and their containers
  2. Record drop zones ([data-droppable], areas that accept drops)
  3. Do not perform actual drags (to avoid changing data order), but record the complete drag interaction structure
```

#### I. Keyboard Shortcut Exploration

```
Detect app-level keyboard shortcuts:
  1. evaluate_script to check for global keydown/keyup event listeners
  2. Find shortcut hints on the page (Ctrl+X annotations in tooltips, shortcut help panels)
  3. Try common shortcuts: Ctrl+K (command palette), ? (help), / (search), Escape
  4. Record the state change triggered by each shortcut
```

```
mcp__chrome-devtools__press_key  key="/"
mcp__chrome-devtools__evaluate_script
  function: () => {
    const searchBox = document.querySelector('[role="searchbox"]:focus, input[type="search"]:focus, [role="combobox"]:focus');
    return searchBox ? { triggered: true, element: searchBox.tagName, role: searchBox.getAttribute('role') } : { triggered: false };
  }
```

#### J. Double-Click Interaction

```
For elements that may support double-click (table cells, list items, text areas):
  1. evaluate_script to check whether the element has a dblclick event listener
  2. Execute dblclick on safe elements
  3. Detect whether edit mode is entered (input/contenteditable appears)
  4. press Escape to exit edit mode
```

#### K. Tree View

```
Discover role="tree" or role="treeitem":
  1. Expand all collapsed treeitems (aria-expanded="false")
  2. Record the complete tree structure hierarchy
  3. Recursively expand child nodes until all levels are visible
  4. Collapse each one to restore the original state
```

#### L. Shadow DOM and Web Components

```
Detect Shadow DOM:
  1. evaluate_script to traverse all elements, check el.shadowRoot
  2. For elements with shadowRoot, enter the shadow DOM to scan interactive elements
  3. Record the mapping between shadow host and internal elements
```

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const shadowHosts = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        const interactives = el.shadowRoot.querySelectorAll('button, input, a, [role]');
        shadowHosts.push({
          host: { tag: el.tagName, class: el.className?.toString().substring(0, 100) },
          shadowElements: Array.from(interactives).map(s => ({
            tag: s.tagName, role: s.getAttribute('role'), text: s.textContent?.trim().substring(0, 100)
          }))
        });
      }
    });
    return shadowHosts;
  }
```

#### M. iframe Exploration

```
Detect iframes on the page:
  1. List all iframes and their src
  2. For same-origin iframes, enter their document to perform DOM scanning
  3. For cross-origin iframes, only record src and dimension information
  4. Mark elements discovered within iframes with their iframe origin
```

#### N. Toast / Notification / Snackbar

```
These elements are transient and need to be detected immediately after interaction:
  1. After each interaction, check whether new [role="alert"], [role="status"], .toast, .notification, .snackbar have appeared
  2. Record the toast's text content, type (success/error/warning), and auto-dismiss duration
  3. This information is critical for assertion generation
```

### Step 3 — Disabled/Hidden Element Activation (Condition Reverse-Engineering)

> **Core principle: a disabled or hidden element is not "unexplorable" — it is an element whose enabling condition has not yet been met.** Finding disabled/hidden elements means the exploration is incomplete until we attempt to activate them.

When the DOM scan (Phase 2 or any subsequent scan) finds elements with `disabled: true`, `visible: false`, `aria-expanded="false"`, or `aria-hidden="true"`, treat them as **unexplored potential states** and attempt to activate them:

#### 3.1 — Detect all inactive elements

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const inactive = [];

    // Disabled elements (buttons, inputs, etc.)
    document.querySelectorAll('[disabled], [aria-disabled="true"]').forEach(el => {
      inactive.push({
        type: 'disabled',
        tag: el.tagName,
        role: el.getAttribute('role'),
        text: el.textContent?.trim().substring(0, 100),
        ariaLabel: el.getAttribute('aria-label'),
        class: el.className?.toString().substring(0, 100),
        // Look for clues about enabling conditions
        formParent: !!el.closest('form'),
        siblingInputs: el.closest('form')
          ? Array.from(el.closest('form').querySelectorAll('input,textarea,select')).map(i => ({
              name: i.name, type: i.type, required: i.required, value: i.value
            }))
          : [],
        ariaDescribedby: el.getAttribute('aria-describedby'),
        title: el.getAttribute('title')
      });
    });

    // Hidden elements that might become visible after interaction
    document.querySelectorAll('[aria-hidden="true"], [hidden], .hidden, .d-none, [style*="display: none"], [style*="visibility: hidden"]').forEach(el => {
      if (el.querySelector('button, input, a, [role]')) {
        inactive.push({
          type: 'hidden-container',
          tag: el.tagName,
          role: el.getAttribute('role'),
          id: el.id,
          class: el.className?.toString().substring(0, 100),
          childInteractives: el.querySelectorAll('button, input, a, [role]').length,
          ariaControls: (() => {
            // Find what controls this element
            const id = el.id;
            if (!id) return null;
            const controller = document.querySelector(`[aria-controls="${id}"]`);
            return controller ? { tag: controller.tagName, text: controller.textContent?.trim().substring(0, 50) } : null;
          })()
        });
      }
    });

    return inactive;
  }
```

#### 3.2 — Reverse-engineer enabling conditions and attempt activation

For each inactive element, apply these strategies in order:

**Strategy A — Form completion (for disabled submit buttons):**
```
If disabled element is inside a <form> and sibling required inputs are empty:
  1. Fill each required input with valid test data (based on type/pattern/placeholder):
     - type="email" → "test@example.com"
     - type="text" with placeholder → use placeholder hint
     - type="number" with min/max → use midpoint value
     - type="password" → "TestPass123!"
     - textarea → "Test content"
     - select → select first non-empty option
  2. After filling, check if the disabled element becomes enabled
  3. If enabled → record the enabling condition, scan new state
  4. Backtrack: clear all filled inputs
```

**Strategy B — Trigger controller (for hidden containers with aria-controls):**
```
If hidden container has an id and there exists an element with aria-controls pointing to it:
  1. Click the controlling element
  2. Wait for the hidden container to become visible
  3. Scan all newly visible elements inside the container
  4. Backtrack: close/collapse the container
```

**Strategy C — Toggle sequence (for conditionally visible elements):**
```
If hidden element has class patterns suggesting conditional display (e.g., "collapse", "expandable", "toggle-target"):
  1. Search for nearby toggle triggers (buttons/links within the same parent or with matching data-target)
  2. Click the trigger
  3. Check if hidden element becomes visible
  4. If visible → scan contents, record state transition
  5. Backtrack
```

**Strategy D — Scroll into viewport (for elements hidden by overflow):**
```
If element has rect { x: 0, y: 0, w: 0, h: 0 } but is not display:none:
  1. Scroll the element into view: el.scrollIntoView({ behavior: 'instant', block: 'center' })
  2. Re-check visibility
  3. If now visible → scan and record
```

**Strategy E — State dependency (for elements that depend on other interactions):**
```
If none of the above strategies work:
  1. Record the element in baseline as "unactivated" with all available context
  2. After completing the full exploration, revisit unactivated elements:
     - For each discovered state S1..Sn, check if the element becomes active in that state
     - If it does → record the state dependency chain (e.g., "button X enables after navigating to Tab 2")
```

#### 3.3 — Output format for activation results

Record all activation attempts in the baseline:

```json
"activationAttempts": [
  {
    "element": "button:Submit",
    "initialState": "disabled",
    "strategy": "form-completion",
    "result": "activated",
    "enablingCondition": "Fill required fields: name, email",
    "newStateId": "S3"
  },
  {
    "element": "div#advanced-options",
    "initialState": "hidden",
    "strategy": "trigger-controller",
    "result": "activated",
    "trigger": "button:Show Advanced",
    "newElements": 5
  },
  {
    "element": "button:Export",
    "initialState": "disabled",
    "strategy": "all-failed",
    "result": "unactivated",
    "context": "May depend on data selection in table"
  }
]
```

> **An exploration with many "unactivated" elements is an incomplete exploration.** The explorer should iterate: after discovering new states in the main BFS loop, revisit unactivated elements to check if they are now active in the new state context.

### Step 4 — Form Exploration (Discover Input Constraints)

For each form area, extract input constraints for subsequent test case generation:

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const forms = document.querySelectorAll('form, [role="form"]');
    return Array.from(forms).map(form => ({
      action: form.getAttribute('action'),
      method: form.getAttribute('method'),
      fields: Array.from(form.querySelectorAll('input,textarea,select')).map(f => ({
        name: f.getAttribute('name'),
        type: f.getAttribute('type') || f.tagName.toLowerCase(),
        required: f.required,
        minLength: f.getAttribute('minlength'),
        maxLength: f.getAttribute('maxlength'),
        min: f.getAttribute('min'),
        max: f.getAttribute('max'),
        pattern: f.getAttribute('pattern'),
        options: f.tagName === 'SELECT'
          ? Array.from(f.options).map(o => ({ value: o.value, text: o.text }))
          : undefined
      })),
      submitButton: (() => {
        const btn = form.querySelector('[type="submit"], button:not([type="button"])');
        return btn ? { text: btn.textContent?.trim(), disabled: btn.disabled } : null;
      })()
    }));
  }
```

### Step 5 — State Stability Detection

After each interaction, confirm the DOM has stabilized before scanning. Must wait for both DOM mutations AND rendering to complete.

> **Why 800ms + 5s**: SPA frameworks (React/Vue) often batch state updates with debounce (300-500ms). CSS transitions commonly take 300ms. The old 500ms/2s thresholds could trigger mid-animation or mid-render. 800ms quiet period + 5s max wait provides better coverage.

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    return new Promise(resolve => {
      let timer;
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          // After DOM settles, wait one more animation frame to ensure rendering is complete
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              observer.disconnect();
              resolve(true);
            });
          });
        }, 800);  // 800ms quiet period (up from 500ms)
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      // Max wait 5s (up from 2s) — covers slow API responses and long animations
      timer = setTimeout(() => { observer.disconnect(); resolve(true); }, 5000);
    });
  }
```

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

## Phase 4: Locator Verification (verify mode only)

> **Called by playwright-script-generator after generating/modifying a POM.**

Verify whether existing locators uniquely match on the real page:

```
mcp__chrome-devtools__evaluate_script
  function: (selector, isRole) => {
    let count;
    if (isRole) {
      // Role-based selectors cannot directly use querySelectorAll, use approximation
      count = document.querySelectorAll(selector).length;
    } else {
      count = document.querySelectorAll(selector).length;
    }
    return count === 1 ? 'UNIQUE' : count === 0 ? 'ZERO' : `MULTIPLE(${count})`;
  }
  args: ["<CSS selector>", false]
```

For Playwright role-based locators, verify with equivalent CSS + aria attributes:

```
mcp__chrome-devtools__evaluate_script
  function: (role, name) => {
    const pattern = name ? new RegExp(name, 'i') : null;
    const els = document.querySelectorAll(`[role="${role}"], ${role}`);
    const matched = Array.from(els).filter(el =>
      !pattern || pattern.test(el.textContent?.trim()) ||
      pattern.test(el.getAttribute('aria-label') || '')
    );
    return matched.length === 1 ? 'UNIQUE' : matched.length === 0 ? 'ZERO' : `MULTIPLE(${matched.length})`;
  }
  args: ["button", "Submit"]
```

Output: `UNIQUE` (usable) / `MULTIPLE(n)` (needs narrowing) / `ZERO` (no match).

---

## Phase 5: Output Baseline

### Baseline File Format

Save to `$QA_WORKSPACE_DIR/test-cases/generated/page-baseline-{page-slug}.json`:

```json
{
  "meta": {
    "url": "https://app.example.com/tasks",
    "title": "Task Management",
    "timestamp": "2026-03-18T10:30:00Z",
    "mode": "full",
    "explorationStats": {
      "statesDiscovered": 5,
      "interactionsPerformed": 23,
      "elementsFound": 87,
      "duration": "45s"
    }
  },

  "states": {
    "S0": {
      "name": "Initial page",
      "trigger": null,
      "regions": {
        "nav": { "interactives": [...], "headings": [...] },
        "main": { "interactives": [...], "headings": [...] },
        "sidebar": { "interactives": [...], "headings": [...] }
      },
      "dialogs": [],
      "alerts": []
    },
    "S1": {
      "name": "Create Task Modal",
      "trigger": { "action": "click", "element": "button:Create Task", "fromState": "S0" },
      "regions": {
        "dialog": { "interactives": [...], "headings": [...] }
      }
    }
  },

  "stateGraph": {
    "edges": [
      { "from": "S0", "action": "click", "element": "button:Create Task", "to": "S1" },
      { "from": "S1", "action": "press:Escape", "element": null, "to": "S0" },
      { "from": "S0", "action": "click", "element": "tab:Completed", "to": "S2" }
    ]
  },

  "activationAttempts": [
    {
      "element": "button:Submit",
      "initialState": "disabled",
      "strategy": "form-completion",
      "result": "activated",
      "enablingCondition": "Fill required fields: name, email",
      "newStateId": "S3"
    },
    {
      "element": "button:Export",
      "initialState": "disabled",
      "strategy": "all-failed",
      "result": "unactivated",
      "context": "May depend on data selection in table"
    }
  ],

  "destructiveActions": [
    { "element": "button:Delete", "reason": "text matches 'Delete'", "context": "table row action" }
  ],

  "externalLinks": [
    { "text": "Help Documentation", "href": "https://docs.example.com" }
  ],

  "forms": [
    {
      "location": "S1 (Create Task Modal)",
      "fields": [
        { "name": "title", "type": "text", "required": true, "maxLength": "100" },
        { "name": "description", "type": "textarea", "required": false }
      ],
      "submitButton": { "text": "Create", "disabled": true }
    }
  ],

  "shadowDom": [
    { "host": { "tag": "MY-COMPONENT", "class": "widget" }, "shadowElements": [...] }
  ],

  "iframes": [
    { "src": "https://...", "sameOrigin": false, "dimensions": { "w": 600, "h": 400 } }
  ],

  "keyboardShortcuts": [
    { "key": "Ctrl+K", "action": "opens command palette", "stateTransition": "S0 → S8" }
  ],

  "dragTargets": [
    { "draggable": "task-card", "dropZones": ["column-todo", "column-done"] }
  ],

  "locatorProfile": {
    "hasTestIds": true,
    "testIdCount": 42,
    "hasAriaLabels": true,
    "dominantStrategy": "testid"
  },

  "summary": {
    "totalStates": 12,
    "totalInteractives": 234,
    "totalForms": 4,
    "totalDestructiveActions": 3,
    "coveredPatterns": ["tabs", "modal", "dropdown", "form", "tree", "contextmenu", "dblclick", "keyboard-shortcut", "drag", "infinite-scroll"],
    "scrollMode": "pagination",
    "hasShadowDom": true,
    "hasIframes": false,
    "coverageRate": 0.95
  }
}
```

### page-slug Naming Rules

Extracted from URL:
- `/task/abc123` → `task-abc123`
- `/settings/profile` → `settings-profile`
- `/` → `home`

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

---

### Language Difference Handling (i18n-Aware Exploration)

CDP connects to the browser which may display in any language. When `projectContext.appLanguages` is set:

1. **Detect current page language**: `evaluate(() => document.documentElement.lang || document.cookie.match(/NEXT_LOCALE=(\w+)/)?.[1] || 'unknown')`
2. **Record both text and i18n key**: For each interactive element, if `projectContext.i18nMessagesDir` is available:
   a. Read the default locale messages JSON from `projectContext.i18nMessagesDir`（本地 QA_WORKSPACE_DIR/messages/）
   b. Reverse-lookup the element's displayed text to find the i18n key
   c. Store both in the baseline:
   ```json
   { "text": "Download file", "i18nKey": "canvas.downloadFile", "localeDetected": "en" }
   ```
3. If i18n messages are NOT available: record only the displayed text + detected locale, annotate `i18nAware: false`
4. When generating locators, prioritize **language-agnostic attributes**: CSS class > `aria-label` > `data-testid` (if present)
5. If text matching is necessary → store the i18n key for downstream POM generation to resolve at runtime via `i18n.t('key')`

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

> Locator information is recorded during exploration for use by the downstream playwright-script-generator.

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
