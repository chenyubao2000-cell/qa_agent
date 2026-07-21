# PRD Change Detection — Shared Reference

> Used by `/qa-run-prd` and `/qa-gen-cases` (and any future PRD-driven command) to detect which
> PRD modules changed since the last generation, so unchanged modules are skipped instead of
> regenerated from scratch. Commands MUST reference this file, NOT duplicate the algorithm inline.

## Why

PRD-driven generation must be incremental: if PRD v2 only updates the "User Login" module, only
that module's tests should regenerate — a full re-run would blow away manually-adjusted specs in
unrelated modules and waste time regenerating things that didn't change.

## Algorithm

```
1. Read existing test case .md files: Glob("<test-cases-dir>/generated/*-prd.md")
   (exact glob root is command-specific — e.g. $QA_WORKSPACE_DIR vs $OUTPUT_DIR)

2. For each existing .md, extract the PRD content hash stored in its header comment:
   <!-- PRD-hash: {sha256 of the PRD module text at generation time} -->

3. Split the current PRD by `##` level headings into modules; compute each module's
   content hash (sha256)

4. Compare current modules against existing .md files:

   | Current PRD module | Existing .md | Hash | prdChangeMode |
   |---|---|:---:|---|
   | exists | exists | match | `"none"` — unchanged, skip generation |
   | exists | exists | mismatch | `"updated"` — incremental update |
   | exists | none | — | `"new"` — generate from scratch |
   | none | exists | — | `"removed"` — module deleted from PRD, mark existing tests/cases deprecated |

5. Pass `prdChangeMode` per module to the orchestrator/subagent
```

## Hash storage (writer side)

When test-case-generator produces a `.md` file from a PRD module, it MUST include a header
comment so future runs can detect changes without re-reading/re-diffing the full PRD:

```
<!-- PRD-hash: {sha256(module text)} -->
```

## Scope

This file only defines the **detection algorithm** and the four `prdChangeMode` values. What a
caller *does* with each value (skip vs. full regen vs. case-only regen vs. mark-deprecated) is
command-specific — see the calling command's own action table for that.
