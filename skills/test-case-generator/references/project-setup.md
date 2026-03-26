# Project Structure & Configuration

## Project Structure

```
tests/
  generated/
    features/
      user-authentication.feature
      shopping-cart.feature
      payment-processing.feature
    step-definitions/
      user-authentication.steps.ts
      shopping-cart.steps.ts
      payment-processing.steps.ts
    equivalence-classes/
      authentication-classes.ts
      cart-classes.ts
      payment-classes.ts
    traceability/
      traceability-matrix.json
      coverage-report.ts
  generators/
    story-parser.ts
    scenario-generator.ts
    equivalence-generator.ts
    boundary-generator.ts
    negative-scenario-generator.ts
    priority-calculator.ts
    traceability-builder.ts
    gherkin-formatter.ts
  fixtures/
    sample-stories.ts
    domain-rules.ts
  utils/
    nlp-helpers.ts
    gherkin-validator.ts
cucumber.config.ts
```

## Configuration

```typescript
// cucumber.config.ts
export default {
  default: {
    paths: ['tests/generated/features/**/*.feature'],
    require: ['tests/generated/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: [
      'progress-bar',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json',
    ],
    formatOptions: {
      snippetInterface: 'async-await',
    },
    publishQuiet: true,
  },
};
```

```typescript
// tests/fixtures/sample-stories.ts

export interface UserStory {
  id: string;
  title: string;
  narrative: {
    asA: string;
    iWant: string;
    soThat: string;
  };
  acceptanceCriteria: AcceptanceCriterion[];
  priority: 'P0' | 'P1' | 'P2';
  tags?: string[];
}

export interface AcceptanceCriterion {
  id: string;
  given: string;
  when: string;
  then: string;
  rules?: string[];
}

export const sampleStories: UserStory[] = [
  {
    id: 'US-101',
    title: 'User Registration',
    narrative: {
      asA: 'new visitor',
      iWant: 'to create an account with my email and password',
      soThat: 'I can access personalized features',
    },
    acceptanceCriteria: [
      {
        id: 'AC-101-1',
        given: 'I am on the registration page',
        when: 'I submit a valid email and password',
        then: 'my account is created and I am logged in',
        rules: [
          'Email must be a valid email format',
          'Password must be 8-64 characters',
          'Password must contain at least one uppercase letter, one lowercase letter, and one number',
          'Email must not already be registered',
        ],
      },
      {
        id: 'AC-101-2',
        given: 'I am on the registration page',
        when: 'I submit an email that is already registered',
        then: 'I see an error message without revealing whether the email exists',
      },
      {
        id: 'AC-101-3',
        given: 'I am on the registration page',
        when: 'I submit a password that does not meet requirements',
        then: 'I see specific validation messages for each unmet requirement',
      },
    ],
    priority: 'P0',
    tags: ['authentication', 'registration'],
  },
  {
    id: 'US-102',
    title: 'Add Item to Shopping Cart',
    narrative: {
      asA: 'logged-in customer',
      iWant: 'to add products to my shopping cart',
      soThat: 'I can purchase them later',
    },
    acceptanceCriteria: [
      {
        id: 'AC-102-1',
        given: 'I am viewing a product detail page',
        when: 'I click "Add to Cart" with a valid quantity',
        then: 'the item is added to my cart and the cart count updates',
        rules: [
          'Quantity must be between 1 and 99',
          'Item must be in stock',
          'Cart total must not exceed 50 items',
        ],
      },
      {
        id: 'AC-102-2',
        given: 'I am viewing a product that is out of stock',
        when: 'I attempt to add it to my cart',
        then: 'the Add to Cart button is disabled and I see an "Out of Stock" message',
      },
    ],
    priority: 'P1',
    tags: ['shopping', 'cart'],
  },
];
```
