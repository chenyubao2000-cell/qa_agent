// source: cdp
// handoff: test-cases/generated/playwright-handoff-forgot-password.json
// baseline: test-cases/generated/page-baseline-forgot-password.json
// generated: 2026-03-23T00:00:00Z

import { test, expect } from '../../fixtures';
import { ForgotPasswordPage } from '../../pages/forgot-password.page';

// Public page — opt out of authenticated storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Forgot Password Form', () => {
  test('TC-CDP-FP-001 输入有效邮箱后点击发送重置链接，进入确认步骤', async ({ page, i18n }) => {
    const forgotPassword = new ForgotPasswordPage(page, i18n);
    await forgotPassword.goto();

    const email = `test_${Date.now()}@example.com`;
    await forgotPassword.fillEmail(email);
    await forgotPassword.clickSendResetLink();

    await expect(forgotPassword.getPageTitle()).toHaveText(/Forgot Password|忘记密码/);
    await expect(forgotPassword.getContinueButton()).toBeVisible();
    await expect(forgotPassword.getContinueButton()).toBeEnabled();
  });

  test('TC-CDP-FP-002 输入无效邮箱后点击发送重置链接，显示验证错误', async ({ page, i18n }) => {
    const forgotPassword = new ForgotPasswordPage(page, i18n);
    await forgotPassword.goto();

    await forgotPassword.fillEmail('notanemail');
    await forgotPassword.clickSendResetLink();

    await expect(forgotPassword.getValidationError()).toHaveText(/Please enter a valid email address|请输入有效的邮箱地址/);
  });

  test('TC-CDP-FP-003 提交空邮箱时显示验证错误', async ({ page, i18n }) => {
    const forgotPassword = new ForgotPasswordPage(page, i18n);
    await forgotPassword.goto();

    await forgotPassword.clickSendResetLink();

    await expect(forgotPassword.getValidationError()).toHaveText(/Please enter a valid email address|请输入有效的邮箱地址/);
  });

  test('TC-CDP-FP-006 用户完成完整的密码重置请求流程', async ({ page, i18n }) => {
    const forgotPassword = new ForgotPasswordPage(page, i18n);
    await forgotPassword.goto();

    const email = `test_${Date.now()}@example.com`;
    await forgotPassword.fillEmail(email);
    await forgotPassword.clickSendResetLink();

    await expect(forgotPassword.getConfirmationText()).toBeVisible();
    await expect(forgotPassword.getConfirmationText()).toContainText(email);
    await forgotPassword.clickContinue();

    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('TC-CDP-FP-007 多次提交同一邮箱不导致页面崩溃', async ({ page, i18n }) => {
    const forgotPassword = new ForgotPasswordPage(page, i18n);
    await forgotPassword.goto();

    const email = `test_${Date.now()}@example.com`;

    // First submission
    await forgotPassword.fillEmail(email);
    await forgotPassword.clickSendResetLink();
    await expect(forgotPassword.getContinueButton()).toBeVisible();

    // Navigate back
    await forgotPassword.goto();

    // Second submission with same email
    await forgotPassword.fillEmail(email);
    await forgotPassword.clickSendResetLink();
    await expect(forgotPassword.getPageTitle()).toHaveText(/Forgot Password|忘记密码/);
  });

  test('TC-CDP-FP-008 页面初始状态正确显示所有 UI 元素', async ({ page, i18n }) => {
    const forgotPassword = new ForgotPasswordPage(page, i18n);
    await forgotPassword.goto();

    await expect(forgotPassword.getPageTitle()).toHaveText(/Forgot Password|忘记密码/);
    await expect(forgotPassword.getPageDescription()).toContainText(/Enter your email address and we'll send you a link to reset your password|输入您的邮箱地址，我们将向您发送重置密码的链接/);
    await expect(forgotPassword.getEmailInput()).toBeVisible();
    await expect(forgotPassword.getEmailInput()).toHaveAttribute('type', 'email');
    await expect(forgotPassword.getSendResetLinkButton()).toBeVisible();
    await expect(forgotPassword.getSendResetLinkButton()).toBeEnabled();
    await expect(forgotPassword.getBackToLoginLink()).toBeVisible();
    await expect(forgotPassword.getBackToLoginLink()).toHaveAttribute('href', /sign-in/);
  });
});

test.describe('Forgot Password Navigation', () => {
  test('TC-CDP-FP-004 确认步骤点击"返回登录"返回邮箱输入步骤', async ({ page, i18n }) => {
    const forgotPassword = new ForgotPasswordPage(page, i18n);
    await forgotPassword.goto();

    // Setup: reach confirmation step
    const email = `test_${Date.now()}@example.com`;
    await forgotPassword.submitValidEmail(email);
    await expect(forgotPassword.getContinueButton()).toBeVisible();

    // Action: click "Return to Sign In" button on confirmation step — returns to email input (S0)
    await forgotPassword.clickBackToLoginButton();

    await expect(forgotPassword.getSendResetLinkButton()).toBeVisible();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test('TC-CDP-FP-005 邮箱输入页点击"返回登录"链接导航到 /sign-in', async ({ page, i18n }) => {
    const forgotPassword = new ForgotPasswordPage(page, i18n);
    await forgotPassword.goto();

    await forgotPassword.clickBackToLoginLink();

    await expect(page).toHaveURL(/\/sign-in/);
  });
});
