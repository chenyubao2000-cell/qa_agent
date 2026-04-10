# Handoff Sync Procedure (Shared Reference)

> **Responsibility**: The **command layer** is the sole owner of handoff file writes.
> Subagents MUST NOT write to handoff directly — they return `assertionsChanged` flag.
> Used by: `/qa-fix-tests` Phase 2.5 and `/qa-from-issue` Mode X post-fix.

## When to Sync

After a fix subagent returns with `assertionsChanged: true`, indicating that test assertions were legitimately updated (e.g., copy change on the page).

## Procedure (Atomic Write Pattern)

```
for each result where result.assertionsChanged === true:
  1. Infer handoff path from spec header:
     Read spec file → extract `// handoff: ...` line → handoffPath
     Fallback: infer from spec filename → test-cases/generated/playwright-handoff-{slug}.json
  2. Read handoff JSON from handoffPath
     If file not found → WARNING: "Handoff not found for {specFile}, skipping sync"
     If JSON parse fails → ERROR: "Handoff corrupted: {handoffPath}", skip this file
  3. Create backup: copy handoffPath → handoffPath.bak
  4. Apply all changes in memory (do NOT write yet):
     For each entry in result.changedAssertions:
       - Find matching TC in handoff array by tcId
       - Update the assertion field: oldValue → newValue
  5. Validate result: all entries have required fields (id, assertions)
  6. Write to temp file: handoffPath.tmp
  7. Verify temp file parses correctly (read back + JSON.parse)
  8. Rename temp → original (atomic on most filesystems)
  9. Delete backup: remove handoffPath.bak
  10. If ANY step 4-8 fails → restore from backup, log ERROR
  11. Log: "Updated handoff {handoffPath}: {N} assertions synced"
```

## Step B: .md Lightweight Writeback (after handoff sync)

> **Scope**: Only assertion text changes are synced back to .md. Locator-only fixes do NOT trigger .md writeback.
> **Rationale**: .md is the design-time source of truth — it describes expected behavior, not implementation details (selectors).
> When expected behavior changes (e.g., button text "Submit" → "Save"), .md must reflect this.
> When only a locator changes (CSS selector fix), .md is not affected.

```
for each result where result.assertionsChanged === true:
  1. Filter: assertionChanges = result.changedAssertions.filter(c => c.field === "assertion")
     If assertionChanges is empty → skip (locator-only fix)
  2. Infer .md path from handoff path:
     "playwright-handoff-{slug}.json" → Glob("test-cases/generated/{slug}*.md")
  3. If .md file not found → WARNING, skip (handoff remains authoritative)
  4. Read .md file
  5. For each assertionChange:
     - Find row in "## Merged Test Case List" table matching tcId
     - Update "Expected Result" column: oldValue → newValue
     - Do NOT touch other columns (steps, preconditions, priority, method)
  6. Write updated .md
  7. Log: "Updated .md {path}: {N} assertion descriptions synced"
```

## Boundary Rules

- **Fix subagent** returns `{ assertionsChanged: true/false, changedAssertions: [{ tcId, field, oldValue, newValue }] }`
  - `field` values: `"assertion"` (expected behavior change) | `"selector"` (locator fix)
- **Command layer** reads this and performs:
  - Handoff write (Step A) — always when assertionsChanged
  - .md writeback (Step B) — only when field === "assertion"
- Atomic write pattern (backup → temp → rename) prevents partial corruption
