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

## Boundary Rules

- **Fix subagent** returns `{ assertionsChanged: true/false, changedAssertions: [{ tcId, field, oldValue, newValue }] }`
- **Command layer** reads this and performs the file write
- Atomic write pattern (backup → temp → rename) prevents partial corruption
