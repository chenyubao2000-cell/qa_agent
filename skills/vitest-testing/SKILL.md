---
name: vitest-testing
description: Generate Vitest unit tests based on source code. Activated when a task involves "unit testing", "Vitest", or "function testing".
---

# Vitest Unit Test Generation Guidelines

## Input

- Source code files (.ts / .tsx)
- Project CLAUDE.md (tech stack, testing conventions)
- Business rule documentation (to help understand function intent)

## Test File Structure

```typescript
// tests/unit/generated/{mirror-path}/{module}.test.ts
import { describe, it, expect, vi } from 'vitest'
import { functionName } from '@/path/to/module'

describe('{ModuleName}', () => {
  describe('{FunctionName}', () => {
    it('returns expected result for normal input', () => {
      expect(functionName(validInput)).toBe(expectedOutput)
    })

    it('throws on empty input', () => {
      expect(() => functionName(null)).toThrow()
    })

    it('handles boundary values correctly', () => {
      expect(functionName(boundaryValue)).toBe(expectedBoundary)
    })
  })
})
```

## Coverage Strategy

For each exported function/method:
1. **Happy path**: at least 1 typical input
2. **Boundary values**: null, zero, max value, empty array, empty object
3. **Error path**: invalid types, missing required fields
4. **Branch coverage**: at least 1 test case per if/switch branch

## Mock Guidelines

- External dependencies (API calls, database) → `vi.mock()`
- Internal pure functions → do not mock, test directly
- Time-related → `vi.useFakeTimers()`
- Environment variables → `vi.stubEnv()`

```typescript
// Mock example
vi.mock('@/services/api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test' })
}))
```

## React Component Testing (if applicable)

Use @testing-library/react:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

it('clicking the submit button triggers callback', async () => {
  const onSubmit = vi.fn()
  render(<Form onSubmit={onSubmit} />)
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(onSubmit).toHaveBeenCalledOnce()
})
```

## Key Principles

- Write test descriptions in plain language, stating "what action produces what result"
- Each it block tests only one behavior
- Do not test implementation details (private methods, internal state)
- Do not mock the function under test itself
- Inline test data; do not use external fixture files (unless the data volume is very large)
