# Phase 5 — Output Baseline JSON Schema + Naming Rules

> This file contains the full baseline JSON schema example and page-slug naming rules.
> Referenced from the main SKILL.md Phase 5 section.

## Baseline File Format

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
      "sourceArea": null,
      "trigger": null,
      "regions": {
        "nav": { "interactives": ["< see interactives[] schema below >"], "headings": [...] },
        "main": { "interactives": [...], "headings": [...] },
        "sidebar": { "interactives": [...], "headings": [...] }
      },
      "dialogs": [],
      "alerts": []
    },
    "S1": {
      "name": "Create Task Modal",
      "sourceArea": "task-create",
      "trigger": { "action": "click", "element": "button:Create Task", "fromState": "S0" },
      "regions": {
        "dialog": { "interactives": [...], "headings": [...] }
      }
    }
  },

  "stateGraph": {
    "edges": [
      { "from": "S0", "action": "click", "element": "button:Create Task", "to": "S1", "sourceArea": "task-create" },
      { "from": "S1", "action": "press:Escape", "element": null, "to": "S0", "sourceArea": "task-create" },
      { "from": "S0", "action": "click", "element": "tab:Completed", "to": "S2", "sourceArea": null }
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

## Key Field Definitions

### `interactives[]` element schema

Each interactive element in `states[].regions[].interactives[]` has the fields defined in `references/dom-scan.md` (tag, role, text, testId, ariaLabel, etc.) plus:

| Field | Type | Description |
|-------|------|-------------|
| `locatorHint` | `string \| null` | Best Playwright locator for this element, computed from Locator Priority rules. Examples: `"getByRole('button', { name: 'Submit' })"`, `"getByTestId('download-btn')"`. Populated during Phase 2 scan. |

**`locatorHint` generation algorithm** (applied per element during DOM scan):
1. `locatorProfile.hasTestIds` && element has `testId` → `getByTestId('{testId}')`
2. element has `ariaLabel` → `getByRole('{role}', { name: '{ariaLabel}' })`
3. element has `role` + `text` → `getByRole('{role}', { name: '{text}' })`
4. element has `placeholder` → `getByPlaceholder('{placeholder}')`
5. element has unique `text` → `getByText('{text}')`
6. fallback → CSS selector from `tag` + `class`

### `sourceArea` field

| Location | Type | Description |
|----------|------|-------------|
| `states[].sourceArea` | `string \| null` | Area ID that triggered discovery of this state. `null` for initial state (S0) and states discovered in `full` mode without area scoping. Set to `areaScope.id` in `targeted` mode. |
| `stateGraph.edges[].sourceArea` | `string \| null` | Area ID context when this edge was discovered. Used by e2e-orchestrator to filter edges by area. |

**Rules**:
- `mode: "full"` without area scoping → all `sourceArea` = `null`
- `mode: "full"` with area scoping (qa-explore per-area) → `sourceArea` = area ID passed by caller
- `mode: "targeted"` → `sourceArea` = `targetArea` identifier
- Merge strategy (qa-from-issue): filter by `sourceArea` to update only the targeted area's states/edges

### `text` → downstream `name` mapping

The baseline stores element visible text as `text` (raw DOM textContent). Downstream consumers map this field as follows:
- **test-case-generator** → handoff `uiElements[].name` = baseline element's `text` (or `ariaLabel` if `text` is empty)
- **playwright-script-generator** → uses `name` from handoff for `getByRole(role, { name })`

---

## page-slug Naming Rules

Extracted from URL:
- `/task/abc123` → `task-abc123`
- `/settings/profile` → `settings-profile`
- `/` → `home`
