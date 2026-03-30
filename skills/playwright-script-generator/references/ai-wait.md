# AI & Long-running Async Wait Patterns

> **When to read this file**: Any test that involves AI-generated responses,
> streaming output, multi-turn conversation, or any async operation expected
> to take longer than 10 seconds.

---

## Decision tree — pick your strategy

```
After triggering the async operation →
  Has a visible loading / thinking element?  → Strategy A: Anchor wait   (most reliable)
  Has a "Stop generating" button?            → Strategy B: Button wait
  Streaming output, no completion signal?    → Strategy C: Stable text wait
  Plain async (non-AI, e.g. file export)?   → Strategy D: expect.poll
  Multi-turn conversation?                   → Strategy E: Message count wait
```

---

## Timeout setup

Add this at the **test level** — never globally — for slow AI tests:

```typescript
test('AI response test', async ({ page }) => {
  test.setTimeout(180_000); // overrides config only for this test
  // ...
});
```

For slow fixtures (e.g. AI session setup), give the fixture its own timeout:

```typescript
const test = base.extend({
  // Quick fixture: 60s is enough
  aiSession: [async ({}, use) => {
    // light setup...
    await use(session);
  }, { timeout: 60_000 }],

  // AI task creation fixture: needs 5-6 min (worker-scope, runs once per worker)
  taskWithFilesUrl: [async ({ browser }, use) => {
    // create task via UI, wait for AI to generate files...
    await use(taskUrl);
  }, { scope: 'worker', timeout: 360_000 }], // ← RECOMMENDED for AI-heavy setup
});
```

`playwright.config.ts` baseline (keep these conservative):
```typescript
export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
});
```

---

## Strategy A — Anchor wait (recommended default)

Wait for a loading element to appear, then disappear. Most reliable because it's
tied to the app's own completion signal.

```typescript
// 1. Confirm the request fired (loading appears quickly)
await page.getByTestId('ai-thinking').waitFor({ state: 'visible', timeout: 5_000 });

// 2. Wait for completion (loading disappears)
await page.getByTestId('ai-thinking').waitFor({ state: 'hidden', timeout: 120_000 });

// 3. Only NOW assert content
await expect(page.getByTestId('ai-response').last()).toContainText('expected keyword');
```

Common loading element selectors (try in order):
```typescript
page.getByTestId('ai-thinking')          // preferred — agree with dev on testid
page.getByRole('status')                  // semantic
page.locator('[aria-busy="true"]')        // aria attribute
page.locator('.message--loading')         // CSS fallback — fragile, avoid if possible
```

---

## Strategy B — Button state wait

Use when the app has a "Stop generating" button or disables the send button
while the AI is responding.

```typescript
await page.getByRole('button', { name: /发送|Send/i }).click();

// Option 1: wait for stop button to disappear
await page.getByRole('button', { name: /停止|Stop/i })
  .waitFor({ state: 'hidden', timeout: 120_000 });

// Option 2: wait for send button to re-enable
await expect(page.getByRole('button', { name: /发送|Send/i }))
  .toBeEnabled({ timeout: 120_000 });
```

---

## Strategy C — Stable text wait (streaming)

Use when there is no loading indicator and content streams in character-by-character.
Polls until the text length stops growing for two consecutive checks.

```typescript
// helpers/ai-wait.ts
export async function waitForStableText(
  locator: Locator,
  stableIntervalMs = 1500,
  timeout = 120_000,
): Promise<string> {
  let lastLength = -1;
  let stableCount = 0;

  await expect.poll(
    async () => {
      const text = (await locator.textContent()) ?? '';
      if (text.length > 0 && text.length === lastLength) {
        stableCount++;
      } else {
        stableCount = 0;
        lastLength = text.length;
      }
      return stableCount >= 2;
    },
    {
      intervals: Array(Math.ceil(timeout / stableIntervalMs)).fill(stableIntervalMs),
      timeout,
    },
  ).toBe(true);

  return (await locator.textContent()) ?? '';
}
```

Usage:
```typescript
const text = await waitForStableText(page.getByTestId('ai-response').last());
expect(text).toContain('expected content');
```

---

## Strategy D — Generic expect.poll (non-AI async)

Standard pattern for any long-running async operation (file exports, background jobs, etc.).

```typescript
// Poll a UI element
await expect.poll(
  async () => page.getByTestId('job-status').textContent(),
  { intervals: [500, 1_000, 2_000, 5_000], timeout: 30_000 },
).toMatch(/complete|done/i);

// Poll an API endpoint
await expect.poll(
  async () => {
    const res = await page.request.get('/api/export/status');
    return (await res.json()).status;
  },
  { intervals: [1_000, 2_000, 5_000, 10_000], timeout: 60_000 },
).toBe('ready');
```

---

## Strategy E — Multi-turn conversation wait

Wait for the Nth AI message to appear and fully complete.

```typescript
// helpers/ai-wait.ts
export async function waitForNthAIMessage(
  page: Page,
  opts: {
    messagesLocator: Locator;
    expectedCount: number;
    msgLoadingTestId?: string; // testid of per-message loading indicator
    timeout?: number;
  },
): Promise<Locator> {
  const { messagesLocator, expectedCount, msgLoadingTestId, timeout = 120_000 } = opts;

  await expect.poll(
    async () => messagesLocator.count(),
    { timeout },
  ).toBeGreaterThanOrEqual(expectedCount);

  const latest = messagesLocator.last();

  if (msgLoadingTestId) {
    await latest.getByTestId(msgLoadingTestId).waitFor({ state: 'hidden', timeout });
  }

  return latest;
}
```

Usage (three-turn conversation):
```typescript
test('context preserved across turns', async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto('/chat');
  const msgs = page.getByTestId('message-ai');

  await sendMessage(page, '我叫小明');
  const r1 = await waitForNthAIMessage(page, { messagesLocator: msgs, expectedCount: 1 });
  await expect(r1).toContainText(/你好|小明/i);

  await sendMessage(page, '我叫什么名字？');
  const r2 = await waitForNthAIMessage(page, { messagesLocator: msgs, expectedCount: 2 });
  await expect(r2).toContainText('小明');
});
```

---

## Assertion rules for AI content

```typescript
// ❌ Fragile — exact text changes with every model update
await expect(response).toHaveText('你好，我是 AI 助手，很高兴见到你！');

// ❌ Timing — may fire mid-stream before content is complete
await expect(response).toBeVisible();

// ✅ Wait for completion signal FIRST, then assert key semantics
await page.getByTestId('ai-thinking').waitFor({ state: 'hidden', timeout: 120_000 });
await expect(response).toContainText(/你好|Hello/i);

// ✅ Assert structure / length rather than exact wording
const text = await response.textContent();
expect(text?.length).toBeGreaterThan(20);
```

---

## Complete example — single-turn with streaming

```typescript
// tests/e2e/testcases/ai-chat.test.ts
import { test, expect } from '../../fixtures';
import { waitForStableText } from '../../helpers/ai-wait';

test.describe('AI chat — single turn', () => {
  test.setTimeout(180_000);

  test('TC-AI-001: response appears and contains relevant content', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('textbox').fill('用一句话介绍 Playwright');
    await page.getByRole('button', { name: /发送|Send/i }).click();

    // Strategy A (preferred): wait for loading indicator
    const thinking = page.getByTestId('ai-thinking');
    await thinking.waitFor({ state: 'visible', timeout: 5_000 });
    await thinking.waitFor({ state: 'hidden', timeout: 120_000 });

    const response = page.getByTestId('ai-response').last();
    await expect(response).toContainText(/Playwright|测试|自动化/i);
    await expect(page.getByRole('button', { name: /发送|Send/i })).toBeEnabled();
  });
});
```

---

## Anti-patterns (specific to AI waits)

| Pattern | Why wrong | Fix |
|---------|-----------|-----|
| `await page.waitForTimeout(10000)` | Wastes time when AI is fast, still fails when slow | Strategy A, B, or C |
| `expect(response).toHaveText(exactString)` mid-stream | Races with streaming content | Wait for completion signal first |
| Global `timeout: 600_000` in config | All tests become slow | `test.setTimeout()` per slow test only |
| `expect(response).toBeVisible()` as the only check | Passes even if response is an error message | Add `.toContainText()` after completion |
