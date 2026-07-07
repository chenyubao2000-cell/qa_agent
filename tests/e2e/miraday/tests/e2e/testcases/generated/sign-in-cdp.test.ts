// source: cdp
// handoff: test-cases/generated/playwright-handoff-sign-in.json
// baseline: test-cases/generated/page-baseline-sign-in.json
// generated: 2026-07-03T00:00:00Z
//
// NOTE: playwright-handoff-sign-in.json has no explicit `tags` field per test case — tags
// below are inferred from `priority` per this project's standard convention (P0 →
// @P0,@smoke,@regression,@full; P1 → @P1,@regression,@full; P2 → @P2,@full).

import { test, expect } from "../../fixtures";
import { SignInPage } from "../../pages/sign-in.page";

test.describe("[CDP] Sign in — email step load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNIN-001 直接访问 /sign-in 直出统一登录表单并渲染全部关键元素",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signInPage = new SignInPage(page, i18n);
      await signInPage.goto();

      // Direct hit on /sign-in itself — the fixtures.ts ensureAuthenticated guard only
      // re-authenticates when a NON-/sign-in target lands on /sign-in, so navigating
      // here directly is unaffected (no redirect, no login wall).
      await expect(page).toHaveURL(/\/sign-in/);
      await expect(signInPage.signInHeading).toBeVisible();
      await expect(signInPage.emailInput).toBeVisible();
      await expect(signInPage.continueButton).toBeDisabled();
      await expect(signInPage.googleButton).toBeVisible();
      await expect(signInPage.googleButton).toBeEnabled();
      await expect(signInPage.microsoftButton).toBeVisible();
      await expect(signInPage.microsoftButton).toBeEnabled();
    },
  );
});

test.describe("[CDP] Sign in — Continue button state", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNIN-002 Continue 按钮随邮箱内容在禁用/启用间切换",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signInPage = new SignInPage(page, i18n);
      await signInPage.goto();

      await expect(signInPage.continueButton).toBeDisabled();

      await signInPage.fillEmail("a@b.com");
      await expect(signInPage.continueButton).toBeEnabled();

      await signInPage.clearEmail();
      await expect(signInPage.continueButton).toBeDisabled();
    },
  );

  test(
    "TC-CDP-SIGNIN-003 纯空白邮箱保持 Continue 禁用（trim 边界）",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const signInPage = new SignInPage(page, i18n);
      await signInPage.goto();

      await signInPage.fillEmail("   ");
      await expect(signInPage.continueButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] Sign in — email validation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SIGNIN-004 非法邮箱格式点击 Continue 触发内联校验错误",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signInPage = new SignInPage(page, i18n);
      await signInPage.goto();

      await signInPage.fillEmail("not-an-email");
      await signInPage.clickContinue();

      await expect(signInPage.emailError).toBeVisible();
      await expect(signInPage.emailInput).toHaveAttribute("aria-invalid", "true");
      await expect(page).toHaveURL(/\/sign-in/);
    },
  );

  test(
    "TC-CDP-SIGNIN-005 在邮箱框按 Enter 触发与点击 Continue 相同的校验",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const signInPage = new SignInPage(page, i18n);
      await signInPage.goto();

      await signInPage.fillEmail("not-an-email");
      await signInPage.pressEnterInEmail();

      await expect(signInPage.emailError).toBeVisible();
      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});
