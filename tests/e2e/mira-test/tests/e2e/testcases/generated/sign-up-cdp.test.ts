// source: cdp
// handoff: test-cases/generated/playwright-handoff-sign-up.json
// baseline: test-cases/generated/page-baseline-sign-up.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { SignUpPage } from "../../pages/sign-up.page";

// Public page (per sign-up.page.ts source comment) — opt out of authenticated storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("[CDP] Sign-Up — access guard", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNUP-001 无 email 参数直达 /sign-up 被重定向到 /sign-in",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ browser }) => {
      // Per sign-up.page.ts gotoWithoutEmail() doc: must run on a fresh, unwrapped
      // context — the shared `page` fixture's goto is patched by ensureAuthenticated
      // to auto re-login whenever a navigation lands on /sign-in, which would mask
      // this redirect-guard assertion.
      const context = await browser.newContext();
      const page = await context.newPage();
      const signUp = new SignUpPage(page);

      await signUp.gotoWithoutEmail();

      await expect(page).toHaveURL(/\/sign-in/);
      await context.close();
    },
  );
});

test.describe("[CDP] Sign-Up — create password form", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNUP-002 带合法 email 进入渲染 Create password 表单且邮箱只读预填",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signUp = new SignUpPage(page, i18n);
      await signUp.goto("test@example.com");

      await expect(signUp.heading).toBeVisible();
      await expect(signUp.heading).toHaveText(i18n.t("auth.createPasswordTitle"));
      await expect(signUp.emailInput).toHaveValue("test@example.com");
      await expect(signUp.emailInput).toHaveAttribute("readonly", "");
      await expect(signUp.passwordInput).toBeVisible();
      await expect(signUp.backToLoginButton).toBeVisible();
      // disabled={isPending || !password || Boolean(passwordError)} — empty password -> disabled.
      await expect(signUp.continueButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] Sign-Up — password strength validation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNUP-003 弱密码经校验触发内联强度错误且 Continue 保持禁用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signUp = new SignUpPage(page, i18n);
      await signUp.goto("test@example.com");

      await signUp.fillPassword("abc");
      // Validation is on-blur (zod onBlur validator per sign-up.page.ts / same pattern as
      // reset-password.page.ts, forgot-password.page.ts) — fill() alone never triggers it.
      await signUp.blurPassword();

      await expect(signUp.passwordError).toBeVisible();
      await expect(signUp.passwordError).toHaveText(i18n.t("auth.validation.passwordStrength"));
      await expect(signUp.passwordInput).toHaveAttribute("aria-invalid", "true");
      await expect(signUp.continueButton).toBeDisabled();
      await expect(page).toHaveURL(/\/sign-up/);
    },
  );

  test(
    "TC-CDP-SIGNUP-004 强密码使校验通过并启用 Continue 按钮",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signUp = new SignUpPage(page, i18n);
      await signUp.goto("test@example.com");

      await signUp.fillPassword("abc");
      // Validation is on-blur — see TC-CDP-SIGNUP-003 note above.
      await signUp.blurPassword();
      await expect(signUp.passwordError).toBeVisible();

      await signUp.fillPassword("Abcd1234!");
      await signUp.blurPassword();

      await expect(signUp.passwordError).toBeHidden();
      await expect(signUp.passwordInput).not.toHaveAttribute("aria-invalid", "true");
      await expect(signUp.continueButton).toBeEnabled();
    },
  );
});

test.describe("[CDP] Sign-Up — navigation", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-SIGNUP-005 点击 Back to Login 返回 /sign-in",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const signUp = new SignUpPage(page, i18n);
      await signUp.goto("test@example.com");

      await signUp.clickBackToLogin();

      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});
