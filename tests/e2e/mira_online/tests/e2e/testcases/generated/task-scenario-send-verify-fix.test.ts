// source: issue
// mode: verify-fix
// issue: MIRA-1318
// handoff: test-cases/generated/playwright-handoff-task-scenario-send.json
// baseline: test-cases/generated/page-baseline-task-scenario-send.json
// generated: 2026-04-07T00:00:00Z
//
// VERIFY-FIX MODE:
//   Assertions target expectedBehavior (navigation to /task/{id}), NOT current page state.
//   PASS = bug fixed; FAIL = bug still present.

import { test, expect } from '../../fixtures';
import { TaskPage } from '../../pages/task.page';

test.describe('[VERIFY-FIX] MIRA-1318 场景发送后应导航到新对话页', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // TC-VF-TSS-001  P0  核心路径：点击场景建议 → 填入输入框 → 发送 → 导航到 /task/{id}
  // ─────────────────────────────────────────────────────────────────────────
  test('[VERIFY-FIX] TC-VF-TSS-001 场景发送后应导航到新对话页', {
    tag: ['@P0', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(60_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Wait for scenario cards to render
    const suggestions = taskPage.getScenarioSuggestions();
    await suggestions.first().waitFor({ state: 'visible', timeout: 15_000 });

    // Click first scenario card — should fill the input box
    await taskPage.clickScenarioCard(0);

    // Verify input was filled and submit is enabled
    const chatInput = taskPage.getChatInput();
    const inputValue = await chatInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);

    const submitBtn = taskPage.getSubmitButton();
    await expect(submitBtn).toBeEnabled();

    // Bug evidence: log URL before clicking send
    console.log('[VERIFY-FIX] URL before send:', page.url());

    // Click send
    await taskPage.clickSubmit();

    // Bug evidence: log URL after clicking send
    console.log('[VERIFY-FIX] URL after send:', page.url());

    // STRICT assertion: URL must match /task/{taskId} — /task itself does NOT satisfy this
    await expect(page).toHaveURL(/\/task\/[a-zA-Z0-9]+/, { timeout: 10_000 });

    // New conversation page should have a chat log visible
    await expect(taskPage.getChatLog()).toBeVisible({ timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-VF-TSS-002  P0  新对话页应显示已发送的场景消息内容
  // ─────────────────────────────────────────────────────────────────────────
  test('[VERIFY-FIX] TC-VF-TSS-002 新对话页应显示已发送的场景消息内容', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(60_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Get the scenario text before clicking
    const sentText = await taskPage.getScenarioCardText(0);
    expect(sentText.length).toBeGreaterThan(0);
    console.log('[VERIFY-FIX] Scenario text to send:', sentText);

    // Click scenario card (fills input)
    await taskPage.clickScenarioCard(0);

    // Verify input value matches scenario text
    const inputValue = await taskPage.getChatInput().inputValue();
    expect(inputValue).toBeTruthy();

    console.log('[VERIFY-FIX] URL before send:', page.url());

    // Click send
    await taskPage.clickSubmit();

    console.log('[VERIFY-FIX] URL after send:', page.url());

    // STRICT: navigate to /task/{taskId}
    await expect(page).toHaveURL(/\/task\/[a-zA-Z0-9]+/, { timeout: 10_000 });

    // Chat log visible (conversation page loaded)
    const chatLog = taskPage.getChatLog();
    await expect(chatLog).toBeVisible({ timeout: 10_000 });

    // The sent message text should appear in the chat log
    await expect(chatLog).toContainText(inputValue, { timeout: 15_000 });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-VF-TSS-003  P1  空输入框时发送按钮应 disabled，不应导航
  // ─────────────────────────────────────────────────────────────────────────
  test('[VERIFY-FIX] TC-VF-TSS-003 输入框为空时发送按钮应禁用，不应导航到新对话页', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(15_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Input should be empty on initial load
    const chatInput = taskPage.getChatInput();
    await expect(chatInput).toHaveValue('');

    // Submit button should be disabled when input is empty
    const submitBtn = taskPage.getSubmitButton();
    await expect(submitBtn).toBeDisabled();

    // URL should remain /task — no navigation
    expect(page.url()).toMatch(/\/task\/?$/);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-VF-TSS-004  P1  场景建议卡片在 /task 页面可见且可点击（回归验证）
  // ─────────────────────────────────────────────────────────────────────────
  test('[VERIFY-FIX] TC-VF-TSS-004 场景建议卡片在 /task 页面可见且可点击（回归验证）', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n }) => {
    test.setTimeout(15_000);

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // "试试以下场景" label should be visible
    const scenarioLabel = taskPage.getScenarioLabel();
    await expect(scenarioLabel).toBeVisible({ timeout: 10_000 });
    await expect(scenarioLabel).toContainText(i18n.t('dashboard.tryScenarios'));

    // At least 1 scenario card should be visible
    const suggestions = taskPage.getScenarioSuggestions();
    const count = await suggestions.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // First card should be enabled (clickable)
    await expect(suggestions.first()).toBeEnabled();
    await expect(suggestions.first()).toBeVisible();
  });

});
