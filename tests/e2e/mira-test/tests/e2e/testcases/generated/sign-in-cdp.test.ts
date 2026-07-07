// source: cdp
// handoff: test-cases/generated/playwright-handoff-sign-in.json
// baseline: test-cases/generated/page-baseline-sign-in.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { SignInPage } from "../../pages/sign-in.page";

// Public page (per sign-in.page.ts source comment) — opt out of authenticated storageState.
test.use({ storageState: { cookies: [], origins: [] } });

// NOTE: playwright-handoff-sign-in.json has no explicit `tags` field per test case —
// tags below are inferred from `priority` following this project's standard convention
// (P0 -> @P0,@smoke,@regression,@full / P1 -> @P1,@regression,@full / P2 -> @P2,@full),
// same as contacts-cdp.test.ts / task-cdp.test.ts.

test.describe("[CDP] Sign-In — email step load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNIN-001 直接访问 /sign-in 直出统一登录表单并渲染全部关键元素",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      await expect(page).toHaveURL(/\/sign-in/);
      await expect(signIn.signInHeading).toBeVisible();
      await expect(signIn.signInHeading).toHaveText(i18n.t("auth.unifiedTitle"));
      await expect(signIn.emailInput).toBeVisible();
      // Empty email -> Continue disabled (source: disabled while email input is empty).
      await expect(signIn.continueButton).toBeDisabled();
      await expect(signIn.googleButton).toBeVisible();
      await expect(signIn.googleButton).toContainText(i18n.t("auth.continueWithGoogle"));
      await expect(signIn.googleButton).toBeEnabled();
      await expect(signIn.microsoftButton).toBeVisible();
      await expect(signIn.microsoftButton).toContainText(i18n.t("auth.continueWithMicrosoft"));
      await expect(signIn.microsoftButton).toBeEnabled();
    },
  );
});

test.describe("[CDP] Sign-In — Continue button state", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNIN-002 Continue 按钮随邮箱内容在禁用/启用间切换",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      await expect(signIn.continueButton).toBeDisabled();

      await signIn.fillEmail("a@b.com");
      await expect(signIn.continueButton).toBeEnabled();

      await signIn.clearEmail();
      await expect(signIn.continueButton).toBeDisabled();
    },
  );

  test(
    "TC-CDP-SIGNIN-003 纯空白邮箱保持 Continue 禁用（trim 边界）",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      // Source: !email.trim() treated as empty -> stays disabled.
      await signIn.fillEmail("   ");
      await expect(signIn.continueButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] Sign-In — email validation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNIN-004 非法邮箱格式点击 Continue 触发内联校验错误",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      await signIn.fillEmail("not-an-email");
      await signIn.clickContinue();

      await expect(signIn.emailError).toBeVisible();
      await expect(signIn.emailError).toHaveText(i18n.t("auth.validation.emailInvalid"));
      await expect(signIn.emailInput).toHaveAttribute("aria-invalid", "true");
      // Not submitted, no navigation.
      await expect(page).toHaveURL(/\/sign-in/);
    },
  );

  test(
    "TC-CDP-SIGNIN-005 在邮箱框按 Enter 触发与点击 Continue 相同的校验",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      await signIn.fillEmail("not-an-email");
      await signIn.pressEnterInEmail();

      await expect(signIn.emailError).toBeVisible();
      await expect(signIn.emailError).toHaveText(i18n.t("auth.validation.emailInvalid"));
      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});
