// source: cdp
// handoff: test-cases/generated/playwright-handoff-sign-up.json
// baseline: test-cases/generated/page-baseline-sign-up.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { SignUpPage } from "../../pages/sign-up.page";

test.describe("[CDP] Sign up — access guard", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNUP-001 无 email 参数直达 /sign-up 被重定向到 /sign-in",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signUpPage = new SignUpPage(page, i18n);

      // gotoWithoutEmail() is the POM's dedicated method for this exact page-level
      // `redirect('/sign-in')` guard (missing ?email=) — see sign-up.page.ts doc comment.
      await signUpPage.gotoWithoutEmail();

      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});

test.describe("[CDP] Sign up — create password form", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNUP-002 带合法 email 进入渲染 Create password 表单且邮箱只读预填",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signUpPage = new SignUpPage(page, i18n);
      await signUpPage.goto("test@example.com");

      await expect(signUpPage.heading).toBeVisible();
      await expect(signUpPage.emailInput).toHaveValue("test@example.com");
      await expect(signUpPage.emailInput).toHaveAttribute("readonly", "");
      await expect(signUpPage.passwordInput).toBeVisible();
      await expect(signUpPage.backToLoginButton).toBeVisible();
      await expect(signUpPage.continueButton).toBeDisabled();
    },
  );

  test(
    "TC-CDP-SIGNUP-005 点击 Back to Login 返回 /sign-in",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const signUpPage = new SignUpPage(page, i18n);
      await signUpPage.goto("test@example.com");

      await signUpPage.clickBackToLogin();

      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});

test.describe("[CDP] Sign up — password validation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNUP-003 弱密码经校验触发内联强度错误且 Continue 保持禁用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signUpPage = new SignUpPage(page, i18n);
      await signUpPage.goto("test@example.com");

      await signUpPage.fillPassword("abc");
      // Validation is only evaluated once the field is touched (on blur) — confirmed against
      // the real page: typing alone leaves Continue enabled and shows no error until blur.
      await signUpPage.blurPassword();

      await expect(signUpPage.passwordError).toBeVisible();
      await expect(signUpPage.passwordInput).toHaveAttribute("aria-invalid", "true");
      await expect(signUpPage.continueButton).toBeDisabled();
      await expect(page).toHaveURL(/\/sign-up/);
    },
  );

  test(
    "TC-CDP-SIGNUP-004 强密码使校验通过并启用 Continue 按钮",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signUpPage = new SignUpPage(page, i18n);
      await signUpPage.goto("test@example.com");

      await signUpPage.fillPassword("abc");
      // Validation is only evaluated once the field is touched (on blur) — confirmed against
      // the real page: typing alone leaves Continue enabled and shows no error until blur.
      await signUpPage.blurPassword();
      await expect(signUpPage.passwordError).toBeVisible();

      // Once touched, the field revalidates live on every change — no further blur needed.
      await signUpPage.fillPassword("Abcd1234!");

      await expect(signUpPage.passwordError).toBeHidden();
      await expect(signUpPage.passwordInput).not.toHaveAttribute("aria-invalid", "true");
      await expect(signUpPage.continueButton).toBeEnabled();
    },
  );
});
