# Step 2 — Explore by UI Pattern (Complete Reference)

> This file contains the detailed exploration procedures for all UI patterns A-M.
> Referenced from the main SKILL.md Phase 3 Step 2 section.

## A. Tab / Navigation Switching

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

## B. Dropdown Menu / Combobox

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

## C. Modal / Dialog

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

## D. Hover Menu / Tooltip

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

## E. Accordion / Collapsible Panel

```
Discover elements with aria-expanded="false"
  1. click(element)
  2. wait_for  aria-expanded="true"
  3. scanDOM() → record newly revealed content
  4. click(element) → collapse (backtrack)
```

## F. Scroll Loading (Infinite Scroll / Pagination)

```
Detect whether the page has pagination controls or infinite scroll:
  1. Find pagination buttons ("Next", ">", links within role="navigation")
  2. If pagination exists → browse the first 3 pages, record content structure and pagination state changes per page
  3. Scroll to bottom → detect whether new content loads (IntersectionObserver / scroll event)
  4. If infinite scroll → scroll 3 consecutive times, record newly loaded content structure each time
  5. Record the loading pattern (pagination/infinite scroll/virtual scroll/static)
  6. Detect virtual scroll (only renders rows in the visible area) → record elements in viewport and total data volume
```

## G. Context Menu

```
For elements likely to have context menus (table rows, file cards, list items, canvas elements):
  1. evaluate_script to trigger contextmenu event
  2. Detect whether [role="menu"] appears
  3. Scan all menu items, including sub-menus (hover menuitem to detect sub-menu expansion)
  4. press Escape to close
```

## H. Drag & Drop Interaction

```
Discover [draggable="true"] or sortable containers (with data-sortable, class containing sortable/draggable):
  1. Record all draggable elements and their containers
  2. Record drop zones ([data-droppable], areas that accept drops)
  3. Do not perform actual drags (to avoid changing data order), but record the complete drag interaction structure
```

## I. Keyboard Shortcut Exploration

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

## J. Double-Click Interaction

```
For elements that may support double-click (table cells, list items, text areas):
  1. evaluate_script to check whether the element has a dblclick event listener
  2. Execute dblclick on safe elements
  3. Detect whether edit mode is entered (input/contenteditable appears)
  4. press Escape to exit edit mode
```

## K. Tree View

```
Discover role="tree" or role="treeitem":
  1. Expand all collapsed treeitems (aria-expanded="false")
  2. Record the complete tree structure hierarchy
  3. Recursively expand child nodes until all levels are visible
  4. Collapse each one to restore the original state
```

## L. Shadow DOM and Web Components

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

## M. iframe Exploration

```
Detect iframes on the page:
  1. List all iframes and their src
  2. For same-origin iframes, enter their document to perform DOM scanning
  3. For cross-origin iframes, only record src and dimension information
  4. Mark elements discovered within iframes with their iframe origin
```

## N. Toast / Notification / Snackbar

```
These elements are transient and need to be detected immediately after interaction:
  1. After each interaction, check whether new [role="alert"], [role="status"], .toast, .notification, .snackbar have appeared
  2. Record the toast's text content, type (success/error/warning), and auto-dismiss duration
  3. This information is critical for assertion generation
```
