# Phase 3 — Core Exploration Algorithm

> Extracted from cdp-explorer/SKILL.md Phase 3 for file size management.

## Core Algorithm: Priority-Driven BFS + State Equivalence

```
knownStates = { State₀ }
priorityQueue = PriorityQueue(all interactive elements in State₀, sorted by priority)
stateFlowGraph = { nodes: [State₀], edges: [] }
coverageTracker = { interactedElements: 0, totalInteractiveElements: N }
startTime = now()

MAX_INTERACTIONS = 100
MAX_STATES = 30
MAX_DURATION_MS = 600000  // 10 minutes

while (priorityQueue is not empty
       && coverageTracker.interactedElements < MAX_INTERACTIONS
       && knownStates.size < MAX_STATES
       && (now() - startTime) < MAX_DURATION_MS) {

  element = priorityQueue.pop()

  if (element is destructive action) → record to baseline.destructiveActions, continue

  interact(element)  // click / hover / fill / dblclick / contextmenu / keyboard
  waitForStable()
  newState = scanDOM()

  equivalentState = findEquivalent(newState, knownStates)
  if (!equivalentState) {
    knownStates.add(newState)
    stateFlowGraph.addEdge(currentState, element, newState)
    priorityQueue.push(...new elements in newState)
  } else {
    stateFlowGraph.addEdge(currentState, element, equivalentState)
  }

  coverageTracker.interactedElements++
  backtrack()
}

coverageReport = {
  terminationReason: ...,
  interactedElements: ...,
  totalElementsSeen: ...,
  statesDiscovered: knownStates.size,
  edgesRecorded: stateFlowGraph.edges.length,
  remainingInQueue: priorityQueue.size,
  durationMs: now() - startTime
}
```

---

## Step 6 — State Equivalence Check

After each interaction, check for equivalence with known states.

> **Key principle**: The fingerprint must capture **interaction-relevant state differences**. Two states with the same buttons but different `disabled`/`expanded`/`checked` states are NOT equivalent.

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const interactives = Array.from(document.querySelectorAll(
      'button, [role="button"], a[href], input, textarea, select, [role="tab"], [role="menuitem"], [role="dialog"]'
    )).map(el => {
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const name = el.getAttribute('aria-label') || el.getAttribute('name') || el.textContent?.trim().substring(0, 50);
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
      hash: btoa(interactives).substring(0, 48)
    };
  }
```

Equivalence rules:
1. Different URL → different states
2. Same URL + different dialog count/titles → different states
3. Same URL + same dialogs + exact fingerprint hash match → equivalent (skip)
4. Fingerprint hash differs → different states

---

## Step 7 — Backtrack Strategy

After interaction, backtrack to the pre-interaction state. **Before interacting**, save `preInteractionFingerprint`.

| Interaction Type | Backtrack Method |
|---|---|
| Tab switch | Click back to original tab |
| Modal opened | press Escape or click close button |
| Dropdown expanded | press Escape |
| Hover menu | hover over blank area |
| Accordion expanded | click again to collapse |
| Checkbox toggle | click again to restore |
| Form filled | Clear input field (fill "") |

**Backtrack verification** (mandatory):
1. Wait for stability
2. Compute current fingerprint
3. Compare with `preInteractionFingerprint`:
   - **Match** → succeeded, continue
   - **Mismatch** → fallback chain:

**Fallback chain**:
1. Try Escape → re-check
2. Try browser back → re-check
3. Force navigate to original URL → re-check
4. All fail → log warning, record in `backtrackFailures[]`, continue from current state
