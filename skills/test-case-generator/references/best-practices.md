# Best Practices, Anti-Patterns & Debugging Tips

## Best Practices

1. **Start with acceptance criteria, not implementation** -- Generate test cases from the requirements as written, not from how you think the system works. This prevents tests that merely confirm existing behavior rather than validating intended behavior.

2. **Generate negative scenarios for every positive path** -- If the acceptance criterion says "user can log in with valid credentials," generate explicit scenarios for invalid credentials, expired accounts, locked accounts, and missing fields.

3. **Use Scenario Outlines for data-driven tests** -- When multiple equivalence classes test the same flow with different data, use Gherkin Scenario Outlines with Examples tables rather than duplicating scenarios.

4. **Tag scenarios for selective execution** -- Tag scenarios by priority (@P0, @P1), type (@positive, @negative, @boundary), and feature area (@auth, @cart). This enables targeted test runs in CI.

5. **Review generated scenarios with business stakeholders** -- Gherkin is readable by non-technical stakeholders. Use generated scenarios as a review artifact to validate that all acceptance criteria are covered.

6. **Regenerate when requirements change** -- When acceptance criteria are updated, re-run the generator to identify new test cases and flag obsolete ones. The traceability matrix makes change impact analysis straightforward.

7. **Supplement generated tests with exploratory scenarios** -- Generators cover systematic cases but miss creative edge cases. Augment generated suites with manually written scenarios discovered through exploratory testing.

8. **Keep feature files focused** -- One feature file per user story. Do not combine unrelated stories into a single feature file. This maintains the traceability link between stories and tests.

9. **Validate Gherkin syntax before committing** -- Use a Gherkin linter (cucumber-lint, gherkin-lint) to ensure generated feature files have valid syntax and consistent formatting.

10. **Generate cross-cutting concern tests separately** -- Security, performance, and accessibility tests that apply to all features should be in dedicated feature files, not scattered across individual story features.

11. **Mark timeout requirements for time-consuming operations** -- For test cases involving AI processing, long-running async tasks (such as waiting for task completion, file conversion, batch processing), mark `"timeout": 600000` (10 minutes) in the handoff. The generated spec must include `test.setTimeout(600_000)` at the corresponding test level, because the default config timeout is insufficient for these time-consuming operations.

## Anti-Patterns to Avoid

1. **Generating tests without reading the story** -- Blindly applying templates without understanding the business context produces irrelevant test cases. Always read and parse the full user story narrative before generating.

2. **Ignoring implicit requirements** -- User stories rarely capture security, performance, and accessibility requirements explicitly. If you only generate tests for stated criteria, you miss critical coverage areas.

3. **Over-generating trivial tests** -- Not every equivalence class needs its own scenario. A password field with 56 boundary values does not need 56 separate scenarios. Use Scenario Outlines and focus on the most informative values.

4. **Generating without prioritizing** -- A flat list of 200 test cases with no priority is unusable. Every generated test must have a risk-based priority that determines execution order.

5. **Treating generated tests as final** -- Generated scenarios are a starting point, not a finished product. They need human review, refinement, and augmentation with domain-specific edge cases that no generator can anticipate.

6. **Duplicating step definitions** -- Generated step definitions should be reusable. "Given I am on the registration page" should be one step definition used across all scenarios, not duplicated in every feature file.

7. **Ignoring the traceability matrix** -- If you generate tests but do not maintain the traceability link to requirements, you lose the ability to assess coverage gaps and change impact.

## Debugging Tips

- **Parser misses parameters**: If the story parser fails to extract input parameters, check the phrasing of business rules. The parser expects specific patterns like "must be X-Y characters" or "must be between X and Y." Adjust regex patterns for your team's writing style.

- **Too many equivalence classes generated**: If the generator produces an overwhelming number of classes, check whether it is generating redundant classes for overlapping constraints. Deduplicate classes with the same representative values.

- **Gherkin syntax errors in generated files**: Ensure that quotes, special characters, and line breaks in acceptance criteria are properly escaped before inserting into Gherkin templates. Use a Gherkin parser to validate output.

- **Cucumber cannot find step definitions**: Generated step definitions use exact string matching. If the Gherkin scenario uses "I submit a valid email and password" but the step definition expects "I submit valid email and password," the step will not match. Normalize articles and prepositions.

- **Traceability matrix shows low coverage**: If coverage appears low, check whether the generator is correctly identifying all acceptance criteria from the source stories. Stories with non-standard formatting (missing Given/When/Then structure) may be partially parsed.

- **Priority calculator assigns everything as P1**: If risk scores are uniformly high, recalibrate the weights and thresholds. Ensure that the business impact, failure likelihood, and complexity inputs vary across scenarios rather than defaulting to maximum values.

- **Generated feature files are too long**: If a single feature file exceeds 200 lines, the source user story may be too large. Consider splitting the story into smaller stories with focused acceptance criteria before generating tests.

- **Step definition collisions**: When multiple feature files generate similar step definitions, Cucumber may raise ambiguous step errors. Use parameterized steps with regular expressions to handle variations rather than creating nearly-identical literal steps.
