// source: cdp
// area: scenario-suggestions
// handoff: test-cases/generated/playwright-handoff-task-scenario-suggestions.json
// baseline: test-cases/generated/page-baseline-task.json
// generated: 2026-04-20T00:00:00Z
//
// GAP COVERAGE for area `scenario-suggestions` on /task page.
// The submit→navigate path is owned by task-scenario-send-verify-fix.test.ts (TC-VF-TSS-001/002).
// These tests intentionally never call Submit to avoid creating backend tasks.

import { test, expect } from '../../fixtures';
import { TaskPage } from '../../pages/task.page';

test.describe('[CDP] Task page scenario suggestion cards — gap coverage', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // TC-TSS-SG-001  P0  遍历 4 张卡片：每次点击 textarea 被填充 + Submit 启用
  // ───────────────────────────────────────────────────────────────────────────
  test('TC-TSS-SG-001 遍历 4 张场景卡片：每次点击都能填充 textarea 并启用 Submit', {
    tag: ['@P0', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(20_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    const cards = taskPage.getScenarioSuggestions();
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    await expect(cards).toHaveCount(4);

    const chatInput = taskPage.getChatInput();
    const submitBtn = taskPage.getSubmitButton();

    // Establish baseline (empty textarea, disabled submit)
    await expect(chatInput).toHaveValue('', { timeout: 10_000 });

    let previousValue = '';
    for (let i = 0; i < 4; i++) {
      await taskPage.clickScenarioCard(i);

      // React updates the controlled textarea value asynchronously; poll it.
      await expect.poll(
        async () => (await chatInput.inputValue()).length,
        { timeout: 5_000 },
      ).toBeGreaterThan(0);

      const newValue = await chatInput.inputValue();
      expect(newValue).not.toBe('');
      expect(newValue).not.toBe(previousValue);
      await expect(submitBtn).toBeEnabled();

      previousValue = newValue;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-TSS-SG-002  P0  textarea 仅包含 description（不含 title）— i18n-safe substring
  // ───────────────────────────────────────────────────────────────────────────
  test('TC-TSS-SG-002 点击卡片后 textarea 仅包含 description，不包含 title', {
    tag: ['@P0', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(20_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    const cards = taskPage.getScenarioSuggestions();
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    await expect(cards).toHaveCount(4);

    const chatInput = taskPage.getChatInput();

    for (let i = 0; i < 4; i++) {
      // Card text = title + description concatenated (no newline in textContent)
      const cardFullRaw = await taskPage.getScenarioCardText(i);
      const cardFull = cardFullRaw.replace(/\s+/g, ' ').trim();
      expect(cardFull.length).toBeGreaterThan(0);

      await taskPage.clickScenarioCard(i);

      await expect.poll(
        async () => (await chatInput.inputValue()).length,
        { timeout: 5_000 },
      ).toBeGreaterThan(0);

      const valueRaw = await chatInput.inputValue();
      const value = valueRaw.replace(/\s+/g, ' ').trim();

      expect(value.length, `card[${i}] textarea must be non-empty`).toBeGreaterThan(0);
      expect(
        cardFull.includes(value),
        `card[${i}] textarea value must be a substring of cardFull. cardFull="${cardFull}" value="${value}"`,
      ).toBe(true);
      expect(
        value.length,
        `card[${i}] textarea value must be strictly shorter than cardFull (value must not include title). cardFull.length=${cardFull.length} value.length=${value.length}`,
      ).toBeLessThan(cardFull.length);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-TSS-SG-003  P1  二次点击覆盖：v2 完全替换 v0，不追加
  // ───────────────────────────────────────────────────────────────────────────
  test('TC-TSS-SG-003 二次点击覆盖：textarea 被完全替换为第二张卡的 description', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(20_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    const cards = taskPage.getScenarioSuggestions();
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    await expect(cards).toHaveCount(4);

    const chatInput = taskPage.getChatInput();

    // Click card 0 → capture v0
    await taskPage.clickScenarioCard(0);
    await expect.poll(
      async () => (await chatInput.inputValue()).length,
      { timeout: 5_000 },
    ).toBeGreaterThan(0);
    const v0 = await chatInput.inputValue();
    expect(v0.length).toBeGreaterThan(0);

    // Click card 2 → capture v2
    await taskPage.clickScenarioCard(2);
    await expect.poll(
      async () => {
        const current = await chatInput.inputValue();
        return current !== v0 && current.length > 0;
      },
      { timeout: 5_000 },
    ).toBe(true);
    const v2 = await chatInput.inputValue();

    const card2FullRaw = await taskPage.getScenarioCardText(2);
    const card2Full = card2FullRaw.replace(/\s+/g, ' ').trim();
    const v2Trim = v2.replace(/\s+/g, ' ').trim();
    const v0Trim = v0.replace(/\s+/g, ' ').trim();

    expect(v2Trim, 'v2 must differ from v0 (actual replacement)').not.toBe(v0Trim);
    expect(
      card2Full.includes(v2Trim),
      `card2Full must contain v2. card2Full="${card2Full}" v2="${v2Trim}"`,
    ).toBe(true);
    expect(
      v2Trim.length,
      `v2.length must be strictly less than card2Full.length (description only). card2Full.length=${card2Full.length} v2.length=${v2Trim.length}`,
    ).toBeLessThan(card2Full.length);
    expect(
      v2Trim.includes(v0Trim),
      `v2 must NOT contain v0 (replace, not append). v0="${v0Trim}" v2="${v2Trim}"`,
    ).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-TSS-SG-004  P1  用户手动输入被场景卡片覆盖（锁定 overwrite 行为）
  // ───────────────────────────────────────────────────────────────────────────
  test('TC-TSS-SG-004 用户手动输入被场景卡片覆盖（锁定当前行为，防回归）', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(20_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    const cards = taskPage.getScenarioSuggestions();
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    await expect(cards).toHaveCount(4);

    const chatInput = taskPage.getChatInput();
    const submitBtn = taskPage.getSubmitButton();

    // User types a unique marker string
    const userTyped = `USER_TYPED_XYZ_${Date.now()}`;
    await taskPage.fillChatInput(userTyped);
    await expect(chatInput).toHaveValue(userTyped);

    // Click card 1 — should fully replace user-typed text
    await taskPage.clickScenarioCard(1);
    await expect.poll(
      async () => {
        const v = await chatInput.inputValue();
        return v !== userTyped && v.length > 0;
      },
      { timeout: 5_000 },
    ).toBe(true);

    const value = await chatInput.inputValue();
    const cardFullRaw = await taskPage.getScenarioCardText(1);
    const cardFull = cardFullRaw.replace(/\s+/g, ' ').trim();
    const valueTrim = value.replace(/\s+/g, ' ').trim();

    expect(
      valueTrim.includes(userTyped),
      `textarea must NOT contain the user-typed marker. value="${valueTrim}"`,
    ).toBe(false);
    expect(
      cardFull.includes(valueTrim),
      `cardFull must contain the new value. cardFull="${cardFull}" value="${valueTrim}"`,
    ).toBe(true);
    expect(
      valueTrim.length,
      `value.length must be strictly less than cardFull.length (description only). cardFull.length=${cardFull.length} value.length=${valueTrim.length}`,
    ).toBeLessThan(cardFull.length);
    await expect(submitBtn).toBeEnabled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-TSS-SG-005  P1  内容完整性：label + 4 张卡片渲染正确
  // ───────────────────────────────────────────────────────────────────────────
  test('TC-TSS-SG-005 4 张卡片内容完整性 & label 可见', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(15_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    const label = taskPage.getScenarioLabel();
    await expect(label).toBeVisible({ timeout: 10_000 });
    await expect(label).toContainText(i18n.t('dashboard.tryScenarios'));

    const cards = taskPage.getScenarioSuggestions();
    await expect(cards).toHaveCount(4);

    for (let i = 0; i < 4; i++) {
      const card = cards.nth(i);
      await expect(card, `card[${i}] must be visible`).toBeVisible();
      await expect(card, `card[${i}] must be enabled`).toBeEnabled();
      const text = (await card.textContent()) ?? '';
      expect(
        text.trim().length,
        `card[${i}] textContent must be non-empty after trim. got="${text}"`,
      ).toBeGreaterThan(0);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TC-TSS-SG-006  P2  点击卡片后 4 张卡片仍保持可见（不触发 submit）
  // ───────────────────────────────────────────────────────────────────────────
  test('TC-TSS-SG-006 点击卡片后所有 4 张场景卡片仍保持可见（不点击 Submit）', {
    tag: ['@P2', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(15_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    const cards = taskPage.getScenarioSuggestions();
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    await expect(cards).toHaveCount(4);

    // Pre-click: all 4 visible
    for (let i = 0; i < 4; i++) {
      await expect(cards.nth(i), `pre-click card[${i}] must be visible`).toBeVisible();
    }

    // Click card 0 — fills textarea but stays on /task (no submit)
    await taskPage.clickScenarioCard(0);

    // Post-click: still 4 visible cards, URL unchanged
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(cards.nth(i), `post-click card[${i}] must still be visible`).toBeVisible();
    }

    // URL must still be /task (no navigation to /task/{id})
    expect(page.url()).toMatch(/\/task\/?($|\?)/);
  });
});
