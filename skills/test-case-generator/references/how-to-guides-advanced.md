# How-To Guides — Advanced: Priority, Traceability, Python & Java

This file contains the risk-based priority calculator, traceability matrix builder, and Python/Java implementation guides.

---

## Building a Risk-Based Priority Calculator

Not all test cases are equally important. This calculator assigns priority based on business impact, failure probability, and complexity.

```typescript
// tests/generators/priority-calculator.ts

export interface RiskAssessment {
  scenarioId: string;
  businessImpact: 1 | 2 | 3 | 4 | 5;
  failureLikelihood: 1 | 2 | 3 | 4 | 5;
  complexity: 1 | 2 | 3 | 4 | 5;
  riskScore: number;
  priority: 'P0' | 'P1' | 'P2';
}

export function calculateRiskPriority(
  scenarioId: string,
  storyPriority: 'P0' | 'P1' | 'P2',
  scenarioType: 'positive' | 'negative' | 'boundary' | 'implicit',
  affectsPayment: boolean,
  affectsAuth: boolean,
  affectsData: boolean
): RiskAssessment {
  let businessImpact: 1 | 2 | 3 | 4 | 5 = 1;
  const priorityMap = { P0: 5, P1: 4, P2: 3 } as const;
  businessImpact = priorityMap[storyPriority] as 1 | 2 | 3 | 4 | 5;

  if (affectsPayment) businessImpact = 5;
  if (affectsAuth) businessImpact = Math.max(businessImpact, 4) as 1 | 2 | 3 | 4 | 5;

  let failureLikelihood: 1 | 2 | 3 | 4 | 5 = 2;
  switch (scenarioType) {
    case 'boundary': failureLikelihood = 4; break;
    case 'negative': failureLikelihood = 3; break;
    case 'implicit': failureLikelihood = 3; break;
    case 'positive': failureLikelihood = 2; break;
  }

  let complexity: 1 | 2 | 3 | 4 | 5 = 2;
  if (affectsPayment) complexity = 5;
  if (affectsData && affectsAuth) complexity = 4;

  const riskScore =
    businessImpact * 0.5 + failureLikelihood * 0.3 + complexity * 0.2;

  let priority: RiskAssessment['priority'];
  if (riskScore >= 4.0) priority = 'P0';
  else if (riskScore >= 2.5) priority = 'P1';
  else priority = 'P2';

  return {
    scenarioId, businessImpact, failureLikelihood, complexity,
    riskScore: Math.round(riskScore * 100) / 100, priority,
  };
}
```

---

## Building a Traceability Matrix

A traceability matrix links every test case to its source requirement, enabling coverage analysis and change impact assessment.

```typescript
// tests/generators/traceability-builder.ts

import { ParsedStory } from './story-parser';
import { EquivalenceClass } from './equivalence-generator';

export interface TraceabilityEntry {
  testCaseId: string;
  storyId: string;
  criterionId: string;
  scenarioType: 'positive' | 'negative' | 'boundary' | 'implicit';
  scenarioTitle: string;
  priority: string;
  equivalenceClass?: string;
  featureFile: string;
  status: 'generated' | 'implemented' | 'passing' | 'failing' | 'skipped';
}

export interface TraceabilityMatrix {
  generated: string;
  totalStories: number;
  totalCriteria: number;
  totalTestCases: number;
  coverageByStory: Record<string, { total: number; implemented: number; passing: number }>;
  entries: TraceabilityEntry[];
}

export function buildTraceabilityMatrix(
  stories: ParsedStory[],
  equivalenceClasses: Map<string, EquivalenceClass[]>
): TraceabilityMatrix {
  const entries: TraceabilityEntry[] = [];
  let testCaseCounter = 1;
  let totalCriteria = 0;

  for (const story of stories) {
    for (const criterion of story.criteria) {
      totalCriteria++;

      entries.push({
        testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
        storyId: story.storyId, criterionId: criterion.criterionId,
        scenarioType: 'positive',
        scenarioTitle: `${criterion.trigger} - happy path`,
        priority: 'P1',
        featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
        status: 'generated',
      });

      const classes = equivalenceClasses.get(criterion.criterionId) || [];
      for (const ec of classes) {
        entries.push({
          testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
          storyId: story.storyId, criterionId: criterion.criterionId,
          scenarioType: ec.type === 'invalid' ? 'negative' : 'boundary',
          scenarioTitle: `${ec.parameterName} - ${ec.className}`,
          priority: ec.type === 'boundary' ? 'P1' : 'P2',
          equivalenceClass: ec.className,
          featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
          status: 'generated',
        });
      }
    }

    for (const implicit of story.implicitRequirements) {
      entries.push({
        testCaseId: `TC-${String(testCaseCounter++).padStart(3, '0')}`,
        storyId: story.storyId, criterionId: 'implicit',
        scenarioType: 'implicit', scenarioTitle: implicit,
        priority: 'P2',
        featureFile: `${story.storyId.toLowerCase().replace(/[^a-z0-9]/g, '-')}.feature`,
        status: 'generated',
      });
    }
  }

  const coverageByStory: Record<string, { total: number; implemented: number; passing: number }> = {};
  for (const entry of entries) {
    if (!coverageByStory[entry.storyId]) {
      coverageByStory[entry.storyId] = { total: 0, implemented: 0, passing: 0 };
    }
    coverageByStory[entry.storyId].total++;
    if (entry.status === 'implemented' || entry.status === 'passing') coverageByStory[entry.storyId].implemented++;
    if (entry.status === 'passing') coverageByStory[entry.storyId].passing++;
  }

  return {
    generated: new Date().toISOString(),
    totalStories: stories.length, totalCriteria,
    totalTestCases: entries.length, coverageByStory, entries,
  };
}
```

---

## Python Implementation: Generating Test Cases from User Stories

For teams using Python with pytest-bdd.

```python
# tests/generators/story_parser.py

from dataclasses import dataclass, field
import re


@dataclass
class InputParameter:
    name: str
    param_type: str
    constraints: list[str] = field(default_factory=list)
    extracted_from: str = ""


@dataclass
class ParsedCriterion:
    criterion_id: str
    preconditions: list[str]
    trigger: str
    expected_outcome: str
    business_rules: list[str]
    input_parameters: list[InputParameter]


@dataclass
class ParsedStory:
    story_id: str
    actor: str
    action: str
    benefit: str
    criteria: list[ParsedCriterion]
    implicit_requirements: list[str]


def parse_user_story(story: dict) -> ParsedStory:
    criteria = []
    for ac in story.get("acceptance_criteria", []):
        params = extract_input_parameters(ac.get("rules", []))
        criteria.append(
            ParsedCriterion(
                criterion_id=ac["id"], preconditions=[ac["given"]],
                trigger=ac["when"], expected_outcome=ac["then"],
                business_rules=ac.get("rules", []), input_parameters=params,
            )
        )
    implicit = derive_implicit_requirements(story)
    return ParsedStory(
        story_id=story["id"], actor=story["narrative"]["as_a"],
        action=story["narrative"]["i_want"], benefit=story["narrative"]["so_that"],
        criteria=criteria, implicit_requirements=implicit,
    )


def extract_input_parameters(rules: list[str]) -> list[InputParameter]:
    params = []
    for rule in rules:
        char_match = re.search(r"(\w+)\s+must\s+be\s+(\d+)-(\d+)\s+characters", rule, re.IGNORECASE)
        if char_match:
            params.append(InputParameter(
                name=char_match.group(1).lower(), param_type="string",
                constraints=[f"min_length:{char_match.group(2)}", f"max_length:{char_match.group(3)}"],
                extracted_from=rule,
            ))
        range_match = re.search(r"(\w+)\s+must\s+be\s+between\s+(\d+)\s+and\s+(\d+)", rule, re.IGNORECASE)
        if range_match:
            params.append(InputParameter(
                name=range_match.group(1).lower(), param_type="number",
                constraints=[f"min:{range_match.group(2)}", f"max:{range_match.group(3)}"],
                extracted_from=rule,
            ))
    return params


def derive_implicit_requirements(story: dict) -> list[str]:
    implicit = [
        "All interactive elements must be keyboard accessible",
        "Page must load within 3 seconds",
        "Server errors must show user-friendly error message",
    ]
    tags = story.get("tags", [])
    if "authentication" in tags:
        implicit.append("Authentication endpoints must have rate limiting")
    return implicit
```

```python
# tests/generators/gherkin_generator.py

from story_parser import ParsedStory, ParsedCriterion


def generate_feature_file(story: ParsedStory) -> str:
    lines = []
    tag = story.story_id.replace(" ", "-")
    lines.append(f"@{tag}")
    lines.append(f"Feature: {story.action}")
    lines.append(f"  As a {story.actor}")
    lines.append(f"  I want {story.action}")
    lines.append(f"  So that {story.benefit}")
    lines.append("")

    for criterion in story.criteria:
        lines.append(f"  @{criterion.criterion_id} @positive")
        lines.append(f"  Scenario: {criterion.trigger} - happy path")
        for pre in criterion.preconditions:
            lines.append(f"    Given {pre}")
        lines.append(f"    When {criterion.trigger}")
        lines.append(f"    Then {criterion.expected_outcome}")
        for rule in criterion.business_rules:
            lines.append(f"    And {rule}")
        lines.append("")

    return "\n".join(lines)
```

---

## Java Implementation: Generating Test Cases

For Java teams using Cucumber-JVM.

```java
// src/test/java/generators/StoryParser.java

package generators;

import java.util.*;
import java.util.regex.*;

public class StoryParser {

    public record InputParameter(
        String name, String type, List<String> constraints, String extractedFrom
    ) {}

    public record ParsedCriterion(
        String criterionId, List<String> preconditions, String trigger,
        String expectedOutcome, List<String> businessRules, List<InputParameter> inputParameters
    ) {}

    public record ParsedStory(
        String storyId, String actor, String action, String benefit,
        List<ParsedCriterion> criteria, List<String> implicitRequirements
    ) {}

    public static List<InputParameter> extractInputParameters(List<String> rules) {
        List<InputParameter> params = new ArrayList<>();

        for (String rule : rules) {
            Matcher charMatch = Pattern.compile(
                "(\\w+)\\s+must\\s+be\\s+(\\d+)-(\\d+)\\s+characters", Pattern.CASE_INSENSITIVE
            ).matcher(rule);
            if (charMatch.find()) {
                params.add(new InputParameter(
                    charMatch.group(1).toLowerCase(), "string",
                    List.of("minLength:" + charMatch.group(2), "maxLength:" + charMatch.group(3)), rule
                ));
            }

            Matcher rangeMatch = Pattern.compile(
                "(\\w+)\\s+must\\s+be\\s+between\\s+(\\d+)\\s+and\\s+(\\d+)", Pattern.CASE_INSENSITIVE
            ).matcher(rule);
            if (rangeMatch.find()) {
                params.add(new InputParameter(
                    rangeMatch.group(1).toLowerCase(), "number",
                    List.of("min:" + rangeMatch.group(2), "max:" + rangeMatch.group(3)), rule
                ));
            }
        }

        return params;
    }
}
```
