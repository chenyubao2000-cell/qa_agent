# qa-explore Phase 2a — CDP Subagent Prompt Template & Recovery

> Extracted from qa-explore.md for file size management.

---

## Phase 2a: Serial CDP Exploration — Subagent Prompt

```
exploredAreas = []
baseline = Phase 1 output initial baseline (containing State_0 + areas list)

for area in areas:
  // Launch cdp-explorer subagent (serial — one browser, one page at a time)
  Launch subagent with CDP tools:

  prompt:
  ```
  You are a CDP page explorer. First read skills/cdp-explorer/SKILL.md.

  Task: Explore one functional area on the current page.

  Input:
  - mode: "full"
  - baselineFile: {absolute path to page-baseline-{slug}.json}
  - area: { id: "{area.id}", name: "{area.name}", type: "{area.type}", elements: [...] }
  - pageUrl: {exploration URL}
  - nextStateId: {next available state number}
  - appLanguages: {APP_LANGUAGES or null}
  - i18nMessagesDir: {QA_WORKSPACE_DIR + "/messages" if APP_LANGUAGES is set, else null}
    When set, perform i18n reverse-lookup per cdp-explorer SKILL.md Step 3.5
  - sourceProjectDir: {resolved source code directory}
    MUST execute cdp-explorer Phase 0 (source pre-read) before any DOM scanning.
  - previousSourceContext: {sharedSourceContext from previous area subagents, if any}
    When present, reuse existing sourceContext for shared components — only read NEW components.

  Steps:
  1. Read the baseline file to understand existing states (avoid re-exploring)
  2. Connect to the page (list_pages → select_page, or navigate if needed)
  2.5. **Source Code Pre-Read**: Execute cdp-explorer SKILL.md Phase 0 using sourceProjectDir.
       Grep for components matching area.name and area.elements.
       Build sourceContext (testIds, ariaAttributes, conditionalElements, i18nKeys, utilityClasses).
       Use sourceContext in Step 3 BFS to prefer stable locators and understand conditional elements.
  3. Execute Phase 3 BFS using area.elements as initial seeds
     - Allow BFS to discover and interact with NEW elements after interaction
     - Mark all new states/edges with sourceArea = "{area.id}"
  4. Dynamic Area Discovery: check for newly revealed functional areas
     - New Modal/Dialog → discoveredArea { type: "modal" }
     - New Tab Panel → discoveredArea { type: "tab-panel" }
     - Expanded menu → discoveredArea { type: "menu" }
     - Lazy-loaded content → discoveredArea { type: "lazy-content" }
  5. Write ALL findings to the baseline file (states, edges, forms, areas, coverageReport)

  Return summary:
  {
    "areaId": "{area.id}",
    "newStates": ["S3", "S4"],
    "newEdges": 5,
    "discoveredAreas": [{ "id": "modal-create", "type": "modal", "name": "Create Modal" }],
    "coverageReport": { "interactedElements": 15, "statesDiscovered": 3, "terminationReason": "queue_empty" },
    "sourceContext": { testIds, ariaAttributes, conditionalElements, i18nKeys, utilityClasses }
  }
  ```

  // Process dynamic area discovery
  If subagent returned discoveredAreas → append to areas list (subsequent iterations will explore them)

  // ── sourceContext sharing (sequential area exploration) ──
  if subagent returned sourceContext:
    sharedSourceContext = { ...sharedSourceContext, ...subagent.sourceContext }

  exploredAreas.push({ area, summary: subagent result })

  // Report exploration progress
  ```
  Explored 1/M [Form] Join Waitlist Form — 3 states, 5 edges, 15 elements interacted
  ```

  If maxAreas reached → break
  // maxAreas limits the **total processed count** (initial + dynamically discovered combined)
```

---

## Interruption Recovery + Page Change Detection

If the user runs `/qa-explore` again on a previously explored page:

1. Read the existing `page-baseline-{slug}.json`
2. **Page change detection** — before resuming, verify the page hasn't changed:
   - CDP connect → take State₀ snapshot (quick)
   - Compare current State₀ fingerprint with `baseline.states.S0.fingerprint`
   - **Fingerprint matches** → page unchanged → resume mode:
     - Check `areas[*].status`: skip `completed`, continue `pending`
     - **Completion validation**: if `completed` area has 0 states/edges → reclassify as `pending`
   - **Fingerprint differs** → page changed → re-explore mode:
     - Log: "Page has changed since last exploration (UI update detected)"
     - For each `completed` area: re-run CDP exploration to detect changes
     - Compare new vs existing baseline states:
       - Elements added/removed → `needs_update`
       - Elements unchanged → keep existing status
     - `needs_update` areas: re-generate test cases + update specs + update handoff
     - Unchanged areas: skip
     - `pending` areas: discard old data, re-identify from current State₀
       - If still exists → explore normally
       - If removed → remove from areas list, log removal
     - Update baseline fingerprint to current State₀

> **Why not just re-explore everything?** If only one area changed, the fingerprint comparison + per-area re-check finds exactly what changed, minimizing unnecessary regeneration.
