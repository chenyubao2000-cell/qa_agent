// source: cdp
// handoff: test-cases/generated/playwright-handoff-verify-email.json
// baseline: test-cases/generated/page-baseline-verify-email.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { VerifyEmailPage } from "../../pages/verify-email.page";

// Public/anonymous flow (per verify-email.page.ts source comment: all preconditions in the
// handoff are "匿名访问，无 storageState") — opt out of authenticated storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("[CDP] Verify Email — access guard", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-VE-001 无 email 参数直接访问 /verify-email 被服务端重定向到 /sign-in",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ browser }) => {
      // Per verify-email.page.ts gotoBare() doc: MUST run on a fresh, unwrapped context —
      // the shared `page` fixture's goto is patched by ensureAuthenticated to auto re-login
      // whenever a navigation lands on /sign-in, which would mask this redirect assertion.
      const context = await browser.newContext();
      const page = await context.newPage();
      const verifyEmail = new VerifyEmailPage(page);

      await verifyEmail.gotoBare();

      await expect(page).toHaveURL(/\/sign-in/);
      await context.close();
    },
  );

  test(
    "TC-CDP-VE-006 点击 Back to Login 硬跳转到 /sign-in",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmail = new VerifyEmailPage(page, i18n);
      await verifyEmail.goto("test@example.com");

      await verifyEmail.clickBackToLogin();

      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});

test.describe("[CDP] Verify Email — form render", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-VE-002 携带 ?email= 参数访问时表单完整渲染且 Continue 初始禁用",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmail = new VerifyEmailPage(page, i18n);
      await verifyEmail.goto("test@example.com");

      await expect(page).toHaveURL(/\/verify-email/);
      await expect(verifyEmail.pageHeading).toBeVisible();
      await expect(verifyEmail.pageHeading).toHaveText(i18n.t("auth.verifyEmail.title"));
      await expect(verifyEmail.otpInput).toBeVisible();
      await expect(verifyEmail.backToLoginButton).toBeVisible();
      // disabled={isLoading || !otp.trim()} — empty OTP -> disabled.
      await expect(verifyEmail.continueButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] Verify Email — OTP interaction", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-VE-003 输入非空 OTP 后 Continue 按钮由禁用变为可用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmail = new VerifyEmailPage(page, i18n);
      await verifyEmail.goto("test@example.com");

      await expect(verifyEmail.continueButton).toBeDisabled();

      await verifyEmail.fillOtp("123456");

      await expect(verifyEmail.continueButton).toBeEnabled();
    },
  );

  test(
    "TC-CDP-VE-004 OTP 输入框过滤非数字并限制最多 6 位",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmail = new VerifyEmailPage(page, i18n);
      await verifyEmail.goto("test@example.com");

      // Source: onChange sanitizes value.replace(/\D/g,'').slice(0,6).
      await verifyEmail.fillOtp("12ab34");
      await expect(verifyEmail.otpInput).toHaveValue("1234");

      await verifyEmail.fillOtp("1234567");
      await expect(verifyEmail.otpInput).toHaveValue("123456");
    },
  );
});

test.describe("[CDP] Verify Email — validation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-VE-005 空 OTP 时回车提交展示必填校验错误且不发起请求",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const verifyEmail = new VerifyEmailPage(page, i18n);
      await verifyEmail.goto("test@example.com");

      await verifyEmail.pressEnterInOtp();

      await expect(verifyEmail.requiredError).toBeVisible();
      await expect(verifyEmail.requiredError).toHaveText(i18n.t("auth.validation.fieldRequired"));
      await expect(verifyEmail.otpInput).toHaveAttribute("aria-invalid", "true");
      await expect(page).toHaveURL(/\/verify-email/);
    },
  );
});
