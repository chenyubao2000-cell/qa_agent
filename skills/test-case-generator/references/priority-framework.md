# Priority Definition & Ratio (mandatory reference for all generated test cases)

> Reference: [ISTQB Glossary](https://glossary.istqb.org/) — Priority is the level of business importance assigned to a test item. [Fibery P0-P4 Guide](https://fibery.com/blog/product-management/p0-p1-p2-p3-p4/) — Industry-standard priority classification. Recommended ratio based on [Software Testing Genius](https://www.softwaretestinggenius.com/how-to-decide-the-priority-of-execution-of-test-cases/) and [ISTQB CTFL Syllabus v4.0](https://istqb.org/).

### Priority Levels

| Level | Definition | Criteria | Examples |
|-------|-----------|----------|----------|
| **P0** | Core happy path; failure = system unusable | ① Happy path of the primary workflow (shortest path for user to complete core task) ② Functions involving data security / payment / authentication ③ Blocking functions (if this breaks, all downstream is broken) | Login, registration, core business submission, payment, permission checks |
| **P1** | Important features + critical error paths | ① Error handling on the primary workflow (validation messages, boundary values, permission blocks) ② Happy path of secondary features ③ Data integrity checks | Form validation, error messages, list pagination, search/filter, file upload failure prompt |
| **P2** | Edge cases + UX polish | ① Non-core UI interactions (animations, layout, responsive) ② Extreme boundaries (very long text, concurrent operations) ③ Compatibility / accessibility | Mobile viewport, keyboard shortcuts, extreme data volume, language switching |

### Recommended Ratio

```
P0 : P1 : P2 = 15~20% : 40~50% : 30~40%
```

| Ratio | Rationale |
|-------|-----------|
| P0 ≈ 15-20% | Keep it small and precise — only "cannot ship if this fails" scenarios. Too many P0s = priority loses meaning |
| P1 ≈ 40-50% | The workhorse — covers most features and critical error paths. Core of regression testing |
| P2 ≈ 30-40% | Supplementary coverage — run when time permits. Skipping P2 should not block a release decision |

### Priority Assignment Decision Tree

When assigning priority to each TC in the Merged Test Case List, follow this decision tree:

```
Does this TC test the primary workflow's happy path?
  ├─ YES → Involves auth / payment / data security?
  │          ├─ YES → P0
  │          └─ NO  → If this feature breaks, can the user still use the system?
  │                    ├─ NO (blocking) → P0
  │                    └─ YES (degraded but usable) → P1
  └─ NO  → Does this TC test error handling / boundary / exception?
            ├─ YES → Could this exception cause data loss or security issues?
            │          ├─ YES → P0
            │          └─ NO  → P1
            └─ NO  → P2 (UI interaction, responsive, compatibility, extreme scenarios)
```

### Post-Generation Ratio Validation

After generating the Merged Test Case List, validate the priority distribution:
- P0 > 30%? → Too many — review which can be downgraded to P1 ("can still ship if this fails" → downgrade)
- P0 < 10%? → Too few — check if core happy paths are missing
- P1 < 30%? → Insufficient error path coverage
- All P1? → Priority has lost meaning — must differentiate
