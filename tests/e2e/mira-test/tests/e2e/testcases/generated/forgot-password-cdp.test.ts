// source: cdp
// handoff: test-cases/generated/playwright-handoff-forgot-password.json
// baseline: test-cases/generated/page-baseline-forgot-password.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ForgotPasswordPage } from "../../pages/forgot-password.page";

test.describe("[CDP] Forgot Password — page load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-FP-001 匿名用户直接访问 /forgot-password 页面直出、无登录墙、表单完整渲染",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const forgotPasswordPage = new ForgotPasswordPage(page, i18n);
      await forgotPasswordPage.goto();

      expect(forgotPasswordPage.pathname()).toBe("/forgot-password");
      await expect(forgotPasswordPage.pageHeading).toBeVisible();
      await expect(forgotPasswordPage.emailInput).toBeVisible();
      await expect(forgotPasswordPage.submitButton).toBeVisible();
      await expect(forgotPasswordPage.submitButton).toBeEnabled();
      await expect(forgotPasswordPage.backToSignInLink).toBeVisible();
    },
  );
});

test.describe("[CDP] Forgot Password — email validation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-FP-002 输入非法格式邮箱失焦后展示校验错误并置 aria-invalid",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const forgotPasswordPage = new ForgotPasswordPage(page, i18n);
      await forgotPasswordPage.goto();

      await forgotPasswordPage.fillEmail("not-an-email");
      await forgotPasswordPage.blurEmail();

      await expect(forgotPasswordPage.emailError).toBeVisible();
      await expect(forgotPasswordPage.emailInput).toHaveAttribute("aria-invalid", "true");
    },
  );

  test(
    "TC-CDP-FP-003 输入合法格式邮箱失焦后不展示错误且 aria-invalid 保持 false",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const forgotPasswordPage = new ForgotPasswordPage(page, i18n);
      await forgotPasswordPage.goto();

      await forgotPasswordPage.fillEmail("qa.user@example.com");
      await forgotPasswordPage.blurEmail();

      await expect(forgotPasswordPage.emailError).toBeHidden();
      await expect(forgotPasswordPage.emailInput).toHaveAttribute("aria-invalid", "false");
      await expect(forgotPasswordPage.submitButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Forgot Password — step flow", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-FP-004 提交合法邮箱本地推进到 confirm 步骤（不点击 Continue、不发送邮件）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const forgotPasswordPage = new ForgotPasswordPage(page, i18n);
      await forgotPasswordPage.goto();

      await forgotPasswordPage.fillEmail("qa.user@example.com");
      // onSubmit only setStep('confirm') — NO API call, NO email sent.
      await forgotPasswordPage.submit();

      await expect(forgotPasswordPage.continueButton).toBeVisible();
      await expect(forgotPasswordPage.returnToSignInButton).toBeVisible();
      await expect(forgotPasswordPage.pageHeading).toBeVisible();

      // GUARD: continueButton MUST NOT be clicked — it fires authClient.requestPasswordReset
      // and sends a real reset email. See POM comment on ForgotPasswordPage.continueButton.
    },
  );
});

test.describe("[CDP] Forgot Password — navigation", { tag: ["@full"] }, () => {
  test(
    'TC-CDP-FP-005 "Back to Sign In" 链接指向 /sign-in',
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const forgotPasswordPage = new ForgotPasswordPage(page, i18n);
      await forgotPasswordPage.goto();

      await expect(forgotPasswordPage.backToSignInLink).toBeVisible();
      await expect(forgotPasswordPage.backToSignInLink).toHaveAttribute("href", /\/sign-in$/);
    },
  );
});
