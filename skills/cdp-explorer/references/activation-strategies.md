# Step 3 — Disabled/Hidden Element Activation Strategies

> This file contains the full disabled/hidden element detection and activation logic.
> Referenced from the main SKILL.md Phase 3 Step 3 section.

> **Core principle: a disabled or hidden element is not "unexplorable" — it is an element whose enabling condition has not yet been met.** Finding disabled/hidden elements means the exploration is incomplete until we attempt to activate them.

When the DOM scan (Phase 2 or any subsequent scan) finds elements with `disabled: true`, `visible: false`, `aria-expanded="false"`, or `aria-hidden="true"`, treat them as **unexplored potential states** and attempt to activate them:

## 3.1 — Detect all inactive elements

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

## 3.2 — Reverse-engineer enabling conditions and attempt activation

For each inactive element, apply these strategies in order:

### Strategy A — Form completion (for disabled submit buttons)

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

### Strategy B — Trigger controller (for hidden containers with aria-controls)

```
If hidden container has an id and there exists an element with aria-controls pointing to it:
  1. Click the controlling element
  2. Wait for the hidden container to become visible
  3. Scan all newly visible elements inside the container
  4. Backtrack: close/collapse the container
```

### Strategy C — Toggle sequence (for conditionally visible elements)

```
If hidden element has class patterns suggesting conditional display (e.g., "collapse", "expandable", "toggle-target"):
  1. Search for nearby toggle triggers (buttons/links within the same parent or with matching data-target)
  2. Click the trigger
  3. Check if hidden element becomes visible
  4. If visible → scan contents, record state transition
  5. Backtrack
```

### Strategy D — Scroll into viewport (for elements hidden by overflow)

```
If element has rect { x: 0, y: 0, w: 0, h: 0 } but is not display:none:
  1. Scroll the element into view: el.scrollIntoView({ behavior: 'instant', block: 'center' })
  2. Re-check visibility
  3. If now visible → scan and record
```

### Strategy E — State dependency (for elements that depend on other interactions)

```
If none of the above strategies work:
  1. Record the element in baseline as "unactivated" with all available context
  2. After completing the full exploration, revisit unactivated elements:
     - For each discovered state S1..Sn, check if the element becomes active in that state
     - If it does → record the state dependency chain (e.g., "button X enables after navigating to Tab 2")
```

## 3.3 — Output format for activation results

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
