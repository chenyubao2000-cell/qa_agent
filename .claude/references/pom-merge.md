# POM Fragment Merge (Parallel-Safe)

When multiple orchestrators target the same page, each writes a POM **fragment** file instead of the shared POM directly, preventing parallel write conflicts.

- Fragment naming: `tests/e2e/pages/{slug}.page.{area-or-module}.fragment.ts`
- Each fragment contains only the private properties + public getters/methods for that area/module.
- If only ONE orchestrator targets a page, it writes directly to `{slug}.page.ts` (no fragment needed).

**Merge steps** (run AFTER all orchestrators complete — no concurrent writes):

1. Group fragments by slug: `Glob("tests/e2e/pages/{slug}.page.*.fragment.ts")`
2. Read all fragments + existing POM (if any)
3. Backup existing POM before merge (if exists): copy → `tests/e2e/pages/{slug}.page.ts.bak`
4. Merge: combine imports, deduplicate locators by name, union all methods
5. Write merged POM to `tests/e2e/pages/{slug}.page.ts`
6. Delete fragment files
7. Update spec imports if needed (fragments used temporary names)
