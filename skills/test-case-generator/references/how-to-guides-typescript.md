# How-To Guides — TypeScript: Parsers & Formatters

This file contains TypeScript implementation guides for story parsing, equivalence class generation, Gherkin formatting, and Cucumber step definitions.

---

## Parsing User Stories and Extracting Testable Criteria

The first step in test generation is systematically parsing user stories to identify all testable aspects.

```typescript
// tests/generators/story-parser.ts

import { UserStory, AcceptanceCriterion } from '../fixtures/sample-stories';

export interface ParsedStory {
  storyId: string;
  actor: string;
  action: string;
  benefit: string;
  criteria: ParsedCriterion[];
  implicitRequirements: string[];
}

export interface ParsedCriterion {
  criterionId: string;
  preconditions: string[];
  trigger: string;
  expectedOutcome: string;
  businessRules: string[];
  inputParameters: InputParameter[];
}

export interface InputParameter {
  name: string;
  type: 'string' | 'number' | 'email' | 'date' | 'enum' | 'boolean';
  constraints: string[];
  extractedFrom: string;
}

/**
 * Parse a user story into structured, testable components.
 */
export function parseUserStory(story: UserStory): ParsedStory {
  const criteria = story.acceptanceCriteria.map((ac) => parseCriterion(ac));
  const implicitRequirements = deriveImplicitRequirements(story);

  return {
    storyId: story.id,
    actor: story.narrative.asA,
    action: story.narrative.iWant,
    benefit: story.narrative.soThat,
    criteria,
    implicitRequirements,
  };
}

function parseCriterion(ac: AcceptanceCriterion): ParsedCriterion {
  const inputParameters = extractInputParameters(ac);

  return {
    criterionId: ac.id,
    preconditions: [ac.given],
    trigger: ac.when,
    expectedOutcome: ac.then,
    businessRules: ac.rules || [],
    inputParameters,
  };
}

function extractInputParameters(ac: AcceptanceCriterion): InputParameter[] {
  const params: InputParameter[] = [];

  for (const rule of ac.rules || []) {
    const charLengthMatch = rule.match(/(\w+)\s+must\s+be\s+(\d+)-(\d+)\s+characters/i);
    if (charLengthMatch) {
      params.push({
        name: charLengthMatch[1].toLowerCase(),
        type: 'string',
        constraints: [`minLength:${charLengthMatch[2]}`, `maxLength:${charLengthMatch[3]}`],
        extractedFrom: rule,
      });
    }

    const emailMatch = rule.match(/(\w+)\s+must\s+be\s+a\s+valid\s+email/i);
    if (emailMatch) {
      params.push({
        name: emailMatch[1].toLowerCase(),
        type: 'email',
        constraints: ['validFormat'],
        extractedFrom: rule,
      });
    }

    const rangeMatch = rule.match(/(\w+)\s+must\s+be\s+between\s+(\d+)\s+and\s+(\d+)/i);
    if (rangeMatch) {
      params.push({
        name: rangeMatch[1].toLowerCase(),
        type: 'number',
        constraints: [`min:${rangeMatch[2]}`, `max:${rangeMatch[3]}`],
        extractedFrom: rule,
      });
    }

    const containsMatch = rule.match(/must\s+contain\s+at\s+least\s+one\s+([\w\s]+)/i);
    if (containsMatch) {
      params.push({
        name: containsMatch[1].trim().replace(/\s+/g, '_'),
        type: 'string',
        constraints: [`contains:${containsMatch[1].trim()}`],
        extractedFrom: rule,
      });
    }
  }

  return params;
}

function deriveImplicitRequirements(story: UserStory): string[] {
  const implicit: string[] = [];

  if (story.acceptanceCriteria.some((ac) => ac.when.includes('submit'))) {
    implicit.push('Form submission must include CSRF token validation');
  }

  implicit.push('All interactive elements must be keyboard accessible');
  implicit.push('Page must load within 3 seconds');
  implicit.push('Server errors must show user-friendly error message');

  if (story.tags?.includes('authentication')) {
    implicit.push('Authentication endpoints must have rate limiting');
    implicit.push('Failed attempts must not reveal whether the account exists');
  }

  return implicit;
}
```

---

## Generating Equivalence Classes

Equivalence partitioning divides input domains into classes where all values in a class are expected to produce the same behavior.

```typescript
// tests/generators/equivalence-generator.ts

import { InputParameter, ParsedCriterion } from './story-parser';

export interface EquivalenceClass {
  parameterId: string;
  parameterName: string;
  className: string;
  type: 'valid' | 'invalid' | 'boundary';
  representative: string | number;
  description: string;
}

export function generateEquivalenceClasses(
  criterion: ParsedCriterion
): EquivalenceClass[] {
  const classes: EquivalenceClass[] = [];
  for (const param of criterion.inputParameters) {
    classes.push(...generateClassesForParameter(param));
  }
  return classes;
}

function generateClassesForParameter(param: InputParameter): EquivalenceClass[] {
  const classes: EquivalenceClass[] = [];
  const baseName = param.name;

  switch (param.type) {
    case 'email':
      classes.push(
        { parameterId: baseName, parameterName: baseName, className: 'Valid email', type: 'valid', representative: 'user@example.com', description: 'Standard email format' },
        { parameterId: baseName, parameterName: baseName, className: 'Email with subdomain', type: 'valid', representative: 'user@mail.example.com', description: 'Email with subdomain' },
        { parameterId: baseName, parameterName: baseName, className: 'Email with plus alias', type: 'valid', representative: 'user+tag@example.com', description: 'Email with plus addressing' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing @ symbol', type: 'invalid', representative: 'userexample.com', description: 'Email without @ symbol' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing domain', type: 'invalid', representative: 'user@', description: 'Email without domain' },
        { parameterId: baseName, parameterName: baseName, className: 'Missing local part', type: 'invalid', representative: '@example.com', description: 'Email without local part' },
        { parameterId: baseName, parameterName: baseName, className: 'Double dots', type: 'invalid', representative: 'user@example..com', description: 'Domain with consecutive dots' },
        { parameterId: baseName, parameterName: baseName, className: 'Empty string', type: 'invalid', representative: '', description: 'Empty email field' },
      );
      break;

    case 'string': {
      const minLength = extractConstraintValue(param.constraints, 'minLength');
      const maxLength = extractConstraintValue(param.constraints, 'maxLength');

      if (minLength !== null && maxLength !== null) {
        classes.push(
          { parameterId: baseName, parameterName: baseName, className: 'At minimum length', type: 'boundary', representative: 'a'.repeat(minLength), description: `Exactly ${minLength} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Below minimum', type: 'invalid', representative: 'a'.repeat(Math.max(0, minLength - 1)), description: `${minLength - 1} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'At maximum length', type: 'boundary', representative: 'a'.repeat(maxLength), description: `Exactly ${maxLength} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Above maximum', type: 'invalid', representative: 'a'.repeat(maxLength + 1), description: `${maxLength + 1} characters` },
          { parameterId: baseName, parameterName: baseName, className: 'Mid-range valid', type: 'valid', representative: 'a'.repeat(Math.floor((minLength + maxLength) / 2)), description: 'Middle of valid range' },
          { parameterId: baseName, parameterName: baseName, className: 'Empty string', type: 'invalid', representative: '', description: 'Empty field' },
        );
      }
      break;
    }

    case 'number': {
      const min = extractConstraintValue(param.constraints, 'min');
      const max = extractConstraintValue(param.constraints, 'max');

      if (min !== null && max !== null) {
        classes.push(
          { parameterId: baseName, parameterName: baseName, className: 'Minimum value', type: 'boundary', representative: min, description: `Exactly ${min}` },
          { parameterId: baseName, parameterName: baseName, className: 'Below minimum', type: 'invalid', representative: min - 1, description: `${min - 1} (below minimum)` },
          { parameterId: baseName, parameterName: baseName, className: 'Maximum value', type: 'boundary', representative: max, description: `Exactly ${max}` },
          { parameterId: baseName, parameterName: baseName, className: 'Above maximum', type: 'invalid', representative: max + 1, description: `${max + 1} (above maximum)` },
          { parameterId: baseName, parameterName: baseName, className: 'Mid-range valid', type: 'valid', representative: Math.floor((min + max) / 2), description: 'Middle of valid range' },
          { parameterId: baseName, parameterName: baseName, className: 'Zero', type: min > 0 ? 'invalid' : 'valid', representative: 0, description: 'Zero value' },
          { parameterId: baseName, parameterName: baseName, className: 'Negative', type: 'invalid', representative: -1, description: 'Negative value' },
        );
      }
      break;
    }
  }

  return classes;
}

function extractConstraintValue(constraints: string[], prefix: string): number | null {
  const constraint = constraints.find((c) => c.startsWith(`${prefix}:`));
  if (!constraint) return null;
  return parseInt(constraint.split(':')[1], 10);
}
```

---

## Generating Gherkin Scenarios from Parsed Stories

Transform parsed user stories and equivalence classes into Gherkin feature files.

```typescript
// tests/generators/gherkin-formatter.ts

import { ParsedStory, ParsedCriterion } from './story-parser';
import { EquivalenceClass, generateEquivalenceClasses } from './equivalence-generator';

export function generateFeatureFile(story: ParsedStory): string {
  const lines: string[] = [];

  lines.push(`@${story.storyId.replace(/[^a-zA-Z0-9]/g, '-')}`);
  lines.push(`Feature: ${story.action}`);
  lines.push(`  As a ${story.actor}`);
  lines.push(`  I want ${story.action}`);
  lines.push(`  So that ${story.benefit}`);
  lines.push('');

  const commonPreconditions = extractCommonPreconditions(story.criteria);
  if (commonPreconditions.length > 0) {
    lines.push('  Background:');
    for (const precondition of commonPreconditions) {
      lines.push(`    Given ${precondition}`);
    }
    lines.push('');
  }

  for (const criterion of story.criteria) {
    lines.push(...generatePositiveScenario(criterion));
    lines.push('');

    const eqClasses = generateEquivalenceClasses(criterion);
    const invalidClasses = eqClasses.filter((ec) => ec.type === 'invalid');

    for (const invalidClass of invalidClasses) {
      lines.push(...generateNegativeScenario(criterion, invalidClass));
      lines.push('');
    }

    const boundaryClasses = eqClasses.filter((ec) => ec.type === 'boundary');
    if (boundaryClasses.length > 0) {
      lines.push(...generateBoundaryScenarioOutline(criterion, boundaryClasses));
      lines.push('');
    }
  }

  for (const implicit of story.implicitRequirements) {
    lines.push(`  @implicit @non-functional`);
    lines.push(`  Scenario: ${implicit}`);
    lines.push(`    Given the application is running`);
    lines.push(`    Then ${implicit.toLowerCase()}`);
    lines.push('');
  }

  return lines.join('\n');
}

function generatePositiveScenario(criterion: ParsedCriterion): string[] {
  const lines: string[] = [];
  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @positive`);
  lines.push(`  Scenario: ${criterion.trigger} - happy path`);
  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }
  lines.push(`    When ${criterion.trigger}`);
  lines.push(`    Then ${criterion.expectedOutcome}`);
  for (const rule of criterion.businessRules) {
    lines.push(`    And ${rule}`);
  }
  return lines;
}

function generateNegativeScenario(criterion: ParsedCriterion, invalidClass: EquivalenceClass): string[] {
  const lines: string[] = [];
  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @negative`);
  lines.push(`  Scenario: Reject ${invalidClass.parameterName} - ${invalidClass.className}`);
  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }
  lines.push(`    When I provide ${invalidClass.parameterName} as "${invalidClass.representative}"`);
  lines.push(`    Then I should see a validation error for ${invalidClass.parameterName}`);
  lines.push(`    And the ${invalidClass.parameterName} error explains "${invalidClass.description}"`);
  return lines;
}

function generateBoundaryScenarioOutline(criterion: ParsedCriterion, boundaryClasses: EquivalenceClass[]): string[] {
  const lines: string[] = [];
  lines.push(`  @${criterion.criterionId.replace(/[^a-zA-Z0-9]/g, '-')} @boundary`);
  lines.push(`  Scenario Outline: Boundary values for ${criterion.trigger}`);
  for (const precondition of criterion.preconditions) {
    lines.push(`    Given ${precondition}`);
  }
  lines.push(`    When I provide <parameter> as "<value>"`);
  lines.push(`    Then the result should be "<expected>"`);
  lines.push('');
  lines.push('    Examples:');
  lines.push('      | parameter | value | expected |');
  for (const boundary of boundaryClasses) {
    lines.push(`      | ${boundary.parameterName} | ${boundary.representative} | accepted |`);
  }
  return lines;
}

function extractCommonPreconditions(criteria: ParsedCriterion[]): string[] {
  if (criteria.length < 2) return [];
  const allPreconditions = criteria.map((c) => c.preconditions);
  return allPreconditions[0].filter((p) =>
    allPreconditions.every((pList) => pList.includes(p))
  );
}
```

---

## Generating Cucumber Step Definitions

Create step definition templates that connect Gherkin scenarios to executable test code.

```typescript
// tests/generators/scenario-generator.ts

import { ParsedStory } from './story-parser';

export function generateStepDefinitions(story: ParsedStory): string {
  const lines: string[] = [];

  lines.push(`import { Given, When, Then } from '@cucumber/cucumber';`);
  lines.push(`import { expect } from '@playwright/test';`);
  lines.push(`import { page } from '../support/world';`);
  lines.push('');

  const steps = new Set<string>();

  for (const criterion of story.criteria) {
    for (const precondition of criterion.preconditions) {
      const stepKey = `Given:${precondition}`;
      if (!steps.has(stepKey)) {
        steps.add(stepKey);
        lines.push(`Given('${escapeGherkin(precondition)}', async function () {`);
        lines.push(`  await page.goto('/');`);
        lines.push(`  // TODO: Implement precondition setup`);
        lines.push(`});`);
        lines.push('');
      }
    }

    const whenKey = `When:${criterion.trigger}`;
    if (!steps.has(whenKey)) {
      steps.add(whenKey);
      lines.push(`When('${escapeGherkin(criterion.trigger)}', async function () {`);
      lines.push(`  // TODO: Implement action`);
      lines.push(`});`);
      lines.push('');
    }

    const thenKey = `Then:${criterion.expectedOutcome}`;
    if (!steps.has(thenKey)) {
      steps.add(thenKey);
      lines.push(`Then('${escapeGherkin(criterion.expectedOutcome)}', async function () {`);
      lines.push(`  // TODO: Implement assertion`);
      lines.push(`});`);
      lines.push('');
    }
  }

  lines.push(`When('I provide {word} as {string}', async function (parameter: string, value: string) {`);
  lines.push(`  const input = page.getByTestId(\`input-\${parameter}\`);`);
  lines.push(`  await input.clear();`);
  lines.push(`  await input.fill(value);`);
  lines.push(`});`);
  lines.push('');

  lines.push(`Then('I should see a validation error for {word}', async function (parameter: string) {`);
  lines.push(`  const error = page.getByTestId(\`error-\${parameter}\`);`);
  lines.push(`  await expect(error).toBeVisible();`);
  lines.push(`});`);
  lines.push('');

  lines.push(`Then('the {word} error explains {string}', async function (parameter: string, message: string) {`);
  lines.push(`  const error = page.getByTestId(\`error-\${parameter}\`);`);
  lines.push(`  const text = await error.textContent();`);
  lines.push(`  expect(text).toBeTruthy();`);
  lines.push(`});`);

  return lines.join('\n');
}

function escapeGherkin(text: string): string {
  return text.replace(/'/g, "\\'");
}
```
