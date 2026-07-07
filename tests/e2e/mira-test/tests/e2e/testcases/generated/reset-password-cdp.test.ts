// source: cdp
// handoff: test-cases/generated/playwright-handoff-reset-password.json
// baseline: test-cases/generated/page-baseline-reset-password.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ResetPasswordPage } from "../../pages/reset-password.page";
import { ForgotPasswordPage } from "../../pages/forgot-password.page";

test.describe("[CDP] Reset Password — invalid link guard", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-RP-001 无 token 直接访问渲染「无效链接」引导块且无登录墙",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const resetPasswordPage = new ResetPasswordPage(page, i18n);
      await resetPasswordPage.gotoWithoutToken();

      await expect(page).toHaveURL(/\/reset-password/);
      await expect(resetPasswordPage.invalidLinkHeading).toHaveText("Reset Link Invalid or Expired");
      await expect(resetPasswordPage.invalidLinkMessage).toBeVisible();
      await expect(resetPasswordPage.requestNewLinkLink).toBeVisible();
    },
  );

  test(
    "TC-CDP-RP-002 点击「Request New Link」跳转到 /forgot-password",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const resetPasswordPage = new ResetPasswordPage(page, i18n);
      await resetPasswordPage.gotoWithoutToken();

      await resetPasswordPage.requestNewLinkLink.click();

      await expect(page).toHaveURL(/\/forgot-password/);
      const forgotPasswordPage = new ForgotPasswordPage(page, i18n);
      await expect(forgotPasswordPage.pageHeading).toBeVisible();
    },
  );
});

test.describe("[CDP] Reset Password — form (token present)", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-RP-003 带 token 访问渲染完整重置密码表单",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const resetPasswordPage = new ResetPasswordPage(page, i18n);
      await resetPasswordPage.gotoWithToken();

      await expect(resetPasswordPage.formHeading).toHaveText("Reset Password");
      await expect(resetPasswordPage.formDescription).toBeVisible();
      await expect(resetPasswordPage.passwordInput).toBeVisible();
      await expect(resetPasswordPage.confirmPasswordInput).toBeVisible();
      await expect(resetPasswordPage.submitButton).toBeEnabled();
    },
  );

  test(
    "TC-CDP-RP-004 新密码显示/隐藏切换按钮翻转输入框类型与 aria-label",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const resetPasswordPage = new ResetPasswordPage(page, i18n);
      await resetPasswordPage.gotoWithToken();

      await resetPasswordPage.togglePasswordVisibility();
      await expect(resetPasswordPage.passwordInput).toHaveAttribute("type", "text");
      // Toggle is located by DOM relationship (stable across the Show<->Hide aria-label flip);
      // after the click it should now read "Hide password".
      await expect(resetPasswordPage.passwordToggle).toHaveAttribute("aria-label", "Hide password");
    },
  );

  test(
    "TC-CDP-RP-005 弱密码失焦触发强度校验错误",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const resetPasswordPage = new ResetPasswordPage(page, i18n);
      await resetPasswordPage.gotoWithToken();

      await resetPasswordPage.fillPassword("abc123");
      await resetPasswordPage.blurPassword();

      await expect(resetPasswordPage.passwordStrengthError).toBeVisible();
      await expect(resetPasswordPage.passwordInput).toHaveAttribute("aria-invalid", "true");
    },
  );

  test(
    "TC-CDP-RP-006 确认密码与新密码不一致触发不匹配错误",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const resetPasswordPage = new ResetPasswordPage(page, i18n);
      await resetPasswordPage.gotoWithToken();

      await resetPasswordPage.fillPassword("Abcd123!");
      await resetPasswordPage.fillConfirmPassword("Abcd123?");
      await resetPasswordPage.blurConfirmPassword();

      await expect(resetPasswordPage.passwordMismatchError).toHaveText("Passwords do not match");
      await expect(resetPasswordPage.confirmPasswordInput).toHaveAttribute("aria-invalid", "true");
    },
  );
});
