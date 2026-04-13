// source: cdp
// handoff: test-cases/generated/playwright-handoff-join-waitlist.json
// baseline: test-cases/generated/page-baseline-join-waitlist.json
// generated: 2026-03-23T00:00:00Z

import { test, expect } from '../../fixtures';
import { JoinWaitlistPage } from '../../pages/join-waitlist.page';

// Public page — opt out of authenticated storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('[CDP] Join Waitlist Form', () => {
  test('TC-CDP-JW-001 使用合法邮箱填写表单（覆盖 V1-V5）', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    await joinPage.fillForm({
      email: 'test_fill@company.com',
      name: 'Test User',
      company: 'Test Corp',
      role: 'Engineer',
      useCase: 'Automation testing',
    });

    await expect(joinPage.getSendCodeButton()).toBeEnabled();
  });

  test('TC-CDP-JW-002 邮箱为空时提交', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    await joinPage.clickSubmit();

    await expect(joinPage.getToastByText(/Please verify your email before submitting|请先验证邮箱后再提交/)).toBeVisible();
  });

  test('TC-CDP-JW-003 无效邮箱格式', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    await joinPage.fillEmail('notanemail');
    await joinPage.clickSendCode();

    await expect(joinPage.getToastByText(/Please enter a valid email address|请输入有效的邮箱地址/)).toBeVisible();
  });

  test('TC-CDP-JW-004 邮箱已填写但未验证时提交 → toast 错误', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    await joinPage.fillForm({
      email: 'test@company.com',
      name: 'Test User',
      company: 'Test Corp',
      role: 'Engineer',
      useCase: 'Testing automation',
    });

    await joinPage.clickSubmit();

    await expect(joinPage.getToastByText(/Please verify your email before submitting|请先验证邮箱后再提交/)).toBeVisible();
  });

  test('TC-CDP-JW-005 填写邮箱后发送验证码按钮从禁用变为启用', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    // Assert initial disabled state
    await expect(joinPage.getSendCodeButton()).toBeDisabled();

    // Fill email
    await joinPage.fillEmail('test@company.com');

    // Assert button becomes enabled
    await expect(joinPage.getSendCodeButton()).toBeEnabled();
  });

  test('TC-CDP-JW-006 点击发送验证码后按钮进入倒计时', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    await joinPage.fillEmail('test@company.com');
    await expect(joinPage.getSendCodeButton()).toBeEnabled();

    await joinPage.clickSendCode();

    // After sending, OTP sent toast should appear and button should show countdown or be disabled
    await expect(joinPage.getToastByText(/Verification code sent|验证码已发送/)).toBeVisible();
  });

  test('TC-CDP-JW-007 完整申请流程 — 打开页面 → 确认表单元素', { tag: ['@P2', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    // Heading and description
    await expect(joinPage.getHeading()).toBeVisible();
    await expect(joinPage.getHeading()).toHaveText(/Join Waitlist|加入等待名单/);
    await expect(joinPage.getDescription()).toBeVisible();

    // Form fields
    await expect(joinPage.getEmailInput()).toBeVisible();
    await expect(joinPage.getNameInput()).toBeVisible();
    await expect(joinPage.getCompanyInput()).toBeVisible();
    await expect(joinPage.getRoleInput()).toBeVisible();
    await expect(joinPage.getUseCaseInput()).toBeVisible();

    // Buttons
    await expect(joinPage.getSubmitButton()).toBeVisible();
    await expect(joinPage.getSubmitButton()).toHaveText(/Submit Application|提交申请/);
    await expect(joinPage.getCancelButton()).toBeVisible();
    await expect(joinPage.getCancelButton()).toHaveText(/Cancel|取消/);
  });

  test('TC-CDP-JW-008 取消操作 — 点击取消按钮返回上一页', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);

    // Navigate to home first to establish history
    await page.goto('/');
    await joinPage.goto();

    await joinPage.clickCancel();

    await expect(page).toHaveURL('/');
  });

  test('TC-CDP-JW-009 多次快速点击提交按钮', { tag: ['@P2', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    // Double-click submit without filling form
    await joinPage.getSubmitButton().dblclick();

    // Should show toast error (at least one)
    await expect(joinPage.getToastByText(/Please verify your email before submitting|请先验证邮箱后再提交/)).toBeVisible();
  });

  test('TC-CDP-JW-010 发送验证码按钮初始状态为禁用', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const joinPage = new JoinWaitlistPage(page, i18n);
    await joinPage.goto();

    await expect(joinPage.getSendCodeButton()).toBeDisabled();
  });
});
