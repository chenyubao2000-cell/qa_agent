// source: cdp
// handoff: test-cases/generated/playwright-handoff-sign-in.json
// baseline: test-cases/generated/page-baseline-sign-in.json
// generated: 2026-03-23T00:00:00Z

import { test, expect } from "../../fixtures";
import { SignInPage } from "../../pages/sign-in.page";
import { i18nRegex } from "../../i18n-helpers";

// Public page — opt out of authenticated storageState
test.use({ storageState: { cookies: [], origins: [] } });

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "test@example.com";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "";

test.describe("[CDP] Sign-In Page", () => {
  test(
    "TC-CDP-SIGNIN-001 输入有效邮箱后继续按钮可用并进入密码步骤",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      await signIn.fillEmail(TEST_EMAIL);
      await signIn.clickContinue();

      await expect(signIn.getPasswordTitleHeading()).toBeVisible();
      await expect(signIn.getPasswordTitleHeading()).toHaveText(
        i18nRegex("auth.enterPasswordTitle", "auth.createPasswordTitle"),
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-002 输入无效邮箱格式后显示验证错误",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      await signIn.fillEmail("invalid-email");
      await signIn.clickContinue();

      await expect(signIn.getEmailValidationError()).toBeVisible();
      await expect(signIn.getEmailValidationError()).toHaveText(
        i18nRegex("auth.validation.emailInvalid"),
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-003 邮箱输入框为空时继续按钮禁用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      await expect(signIn.getContinueButton()).toBeDisabled();
    },
  );

  test(
    "TC-CDP-SIGNIN-004 密码输入框为空时继续按钮禁用",
    { tag: ["@P1", "@regression", "@full", "@failing"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);

      await expect(signIn.getContinueButton()).toBeDisabled();
    },
  );

  test(
    "TC-CDP-SIGNIN-005 输入正确密码后登录成功跳转到 /task",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      test.skip(!TEST_PASSWORD, "E2E_TEST_PASSWORD not set");
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);

      await signIn.fillPassword(TEST_PASSWORD);
      await signIn.clickContinue();

      await expect(page).toHaveURL(/\/task/);
    },
  );

  test(
    "TC-CDP-SIGNIN-006 输入错误密码后显示凭证错误信息",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      test.skip(!TEST_PASSWORD, "E2E_TEST_PASSWORD not set");
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);

      await signIn.fillPassword("wrongpassword");
      await signIn.clickContinue();

      await expect(signIn.getCredentialError()).toBeVisible();
      await expect(signIn.getCredentialError()).toHaveText(
        i18nRegex("auth.errors.invalidEmailOrPassword"),
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-007 密码步骤点击编辑返回邮箱步骤",
    { tag: ["@P1", "@regression", "@full", "@failing"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);

      await signIn.clickEdit();

      await expect(signIn.getTitleHeading()).toBeVisible();
      await expect(signIn.getTitleHeading()).toHaveText(
        i18nRegex("auth.unifiedTitle"),
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-008 密码步骤点击返回登录返回邮箱步骤",
    { tag: ["@P1", "@regression", "@full", "@failing"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);

      await signIn.clickBackToLogin();

      await expect(signIn.getTitleHeading()).toBeVisible();
      await expect(signIn.getTitleHeading()).toHaveText(
        i18nRegex("auth.unifiedTitle"),
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-009 点击显示密码切换为明文显示",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);
      await signIn.fillPassword("Test@12345678");

      await signIn.clickShowPassword();

      await expect(signIn.getHidePasswordButton()).toBeVisible();
      await expect(signIn.getPasswordInput()).toHaveAttribute("type", "text");
    },
  );

  test(
    "TC-CDP-SIGNIN-010 点击隐藏密码切换回密文显示",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);
      await signIn.fillPassword("Test@12345678");
      await signIn.clickShowPassword();
      await expect(signIn.getPasswordInput()).toHaveAttribute("type", "text");

      await signIn.clickHidePassword();

      await expect(signIn.getShowPasswordButton()).toBeVisible();
      await expect(signIn.getPasswordInput()).toHaveAttribute(
        "type",
        "password",
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-011 完整登录流程 — 邮箱 → 密码 → 成功跳转",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      test.skip(!TEST_PASSWORD, "E2E_TEST_PASSWORD not set");
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      // Step 1: Verify initial page elements
      await expect(signIn.getTitleHeading()).toHaveText(
        i18nRegex("auth.unifiedTitle"),
      );
      await expect(signIn.getGoogleOAuthButton()).toBeVisible();
      await expect(signIn.getGoogleOAuthButton()).toContainText(
        i18nRegex("auth.continueWithGoogle"),
      );
      await expect(signIn.getMicrosoftOAuthButton()).toBeVisible();
      await expect(signIn.getMicrosoftOAuthButton()).toContainText(
        i18nRegex("auth.continueWithMicrosoft"),
      );

      // Step 2: Enter email and proceed
      await signIn.fillEmail(TEST_EMAIL);
      await signIn.clickContinue();

      // Step 3: Verify password step — must be sign-IN (enterPasswordTitle), not sign-up.
      // If check-email returns exists=false (e.g. rate-limit 429 treated as missing account),
      // the app redirects to /sign-up showing "Create password". Asserting only enterPasswordTitle
      // catches this mis-route early with a clear failure message.
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });
      await expect(signIn.getPasswordTitleHeading()).toHaveText(
        i18nRegex("auth.enterPasswordTitle"),
        { timeout: 15_000 },
      );

      // Step 4: Enter password and submit — wait for Continue to be enabled before clicking
      await signIn.fillPassword(TEST_PASSWORD);
      await expect(signIn.getContinueButton()).toBeEnabled({ timeout: 5_000 });
      await signIn.clickContinue();

      await expect(page).toHaveURL(/\/task/, { timeout: 30_000 });
    },
  );

  test(
    "TC-CDP-SIGNIN-012 验证 Google OAuth 按钮可见",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await page.waitForLoadState("networkidle");

      await expect(signIn.getGoogleOAuthButton()).toBeVisible({
        timeout: 15_000,
      });
      await expect(signIn.getGoogleOAuthButton()).toBeEnabled();
      await expect(signIn.getGoogleOAuthButton()).toContainText(
        i18nRegex("auth.continueWithGoogle"),
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-013 验证 Microsoft OAuth 按钮可见",
    { tag: ["@P1", "@regression", "@full", "@failing"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();

      await expect(signIn.getMicrosoftOAuthButton()).toBeVisible();
      await expect(signIn.getMicrosoftOAuthButton()).toBeEnabled();
      await expect(signIn.getMicrosoftOAuthButton()).toContainText(
        i18nRegex("auth.continueWithMicrosoft"),
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-014 密码步骤验证忘记密码链接可见",
    {
      tag: ["@P2", "@full"],
      annotation: {
        type: "skip",
        description:
          "Forgot password link only appears for registered accounts (Enter password step), not for Create password step",
      },
    },
    async ({ page, i18n }) => {
      test.skip();
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);

      await expect(signIn.getForgotPasswordLink()).toBeVisible();
      await expect(signIn.getForgotPasswordLink()).toHaveText(
        i18nRegex("auth.forgotPassword"),
      );
    },
  );

  test(
    "TC-CDP-SIGNIN-015 密码步骤邮箱显示为只读",
    { tag: ["@P2", "@full", "@failing"] },
    async ({ page, i18n }) => {
      const signIn = new SignInPage(page, i18n);
      await signIn.goto();
      await signIn.goToPasswordStep(TEST_EMAIL);

      await expect(signIn.getReadonlyEmailInput()).toBeVisible();
      await expect(signIn.getReadonlyEmailInput()).toHaveValue(TEST_EMAIL);
    },
  );
});
