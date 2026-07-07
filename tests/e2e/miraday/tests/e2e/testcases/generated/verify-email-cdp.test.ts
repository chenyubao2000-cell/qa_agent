// source: cdp
// handoff: test-cases/generated/playwright-handoff-verify-email.json
// baseline: test-cases/generated/page-baseline-verify-email.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { VerifyEmailPage } from "../../pages/verify-email.page";

test.describe("[CDP] Verify email — access guard", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-VE-001 无 email 参数直接访问 /verify-email 被服务端重定向到 /sign-in",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page }) => {
      const verifyEmailPage = new VerifyEmailPage(page);

      // gotoBare() is the POM's dedicated method for this exact guard case — see its
      // doc comment: navigating to /verify-email with no ?email= must NOT be
      // intercepted by the fixtures.ts ensureAuthenticated guard as an "expired
      // session" (comment explicitly references this spec, TC-CDP-VE-001).
      await verifyEmailPage.gotoBare();

      await expect(page).toHaveURL(/\/sign-in/);
    },
  );

  test(
    "TC-CDP-VE-002 携带 ?email= 参数访问时表单完整渲染且 Continue 初始禁用",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmailPage = new VerifyEmailPage(page, i18n);
      await verifyEmailPage.goto("test@example.com");

      expect(verifyEmailPage.pathname()).toBe("/verify-email");
      await expect(verifyEmailPage.pageHeading).toHaveText("Verify your email");
      await expect(verifyEmailPage.otpInput).toBeVisible();
      await expect(verifyEmailPage.backToLoginButton).toBeVisible();
      await expect(verifyEmailPage.continueButton).toBeDisabled();
    },
  );

  test(
    "TC-CDP-VE-006 点击 Back to Login 硬跳转到 /sign-in",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmailPage = new VerifyEmailPage(page, i18n);
      await verifyEmailPage.goto("test@example.com");

      await verifyEmailPage.clickBackToLogin();

      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});

test.describe("[CDP] Verify email — OTP form", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-VE-003 输入非空 OTP 后 Continue 按钮由禁用变为可用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmailPage = new VerifyEmailPage(page, i18n);
      await verifyEmailPage.goto("test@example.com");

      await expect(verifyEmailPage.continueButton).toBeDisabled();

      await verifyEmailPage.fillOtp("123456");

      await expect(verifyEmailPage.continueButton).toBeEnabled();
    },
  );

  test(
    "TC-CDP-VE-004 OTP 输入框过滤非数字并限制最多 6 位",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmailPage = new VerifyEmailPage(page, i18n);
      await verifyEmailPage.goto("test@example.com");

      await verifyEmailPage.fillOtp("12ab34");
      await expect(verifyEmailPage.otpInput).toHaveValue("1234");

      await verifyEmailPage.fillOtp("1234567");
      await expect(verifyEmailPage.otpInput).toHaveValue("123456");
    },
  );

  test(
    "TC-CDP-VE-005 空 OTP 时回车提交展示必填校验错误且不发起请求",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmailPage = new VerifyEmailPage(page, i18n);
      await verifyEmailPage.goto("test@example.com");

      await verifyEmailPage.pressEnterInOtp();

      await expect(verifyEmailPage.requiredError).toBeVisible();
      await expect(verifyEmailPage.otpInput).toHaveAttribute("aria-invalid", "true");
      await expect(page).toHaveURL(/\/verify-email/);
    },
  );
});
