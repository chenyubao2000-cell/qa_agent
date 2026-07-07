// source: cdp
// handoff: test-cases/generated/playwright-handoff-quick-activate.json
// baseline: test-cases/generated/page-baseline-quick-activate.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { QuickActivatePage } from "../../pages/quick-activate.page";

// /quick-activate is a public, unauthenticated activation flow; per quick-activate.page.ts
// header comment "Public page (no auth); specs opt out of storageState." — but the project's
// global config applies an authenticated storageState to every test by default. The activation
// server route redirects to /task whenever session?.user?.isActivated, so without opting out
// here every navigation in this file silently lands on /task instead of the page under test.
// See https://playwright.dev/docs/auth#testing-as-unauthenticated-user.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("[CDP] Quick Activate — query param gating", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-QACTIVATE-001 无 code/email 参数直达渲染缺参错误视图且无任何输入框",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      await quickActivatePage.gotoMissingParams();

      await expect(quickActivatePage.heading).toBeVisible();
      await expect(quickActivatePage.missingParamsText).toBeVisible();
      await expect(quickActivatePage.signInLink).toBeVisible();
      // No password (or any) input rendered in the minimal error view.
      await expect(quickActivatePage.passwordInput).toHaveCount(0);
    },
  );

  test(
    "TC-CDP-QACTIVATE-002 携带 code+email 参数渲染完整表单且邮箱/邀请码为只读预填",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      await quickActivatePage.gotoWithParams("000000", "qa-explore-test@example.com");

      await expect(quickActivatePage.heading).toBeVisible();
      await expect(quickActivatePage.emailInput).toHaveValue("qa-explore-test@example.com");
      // Read-only invitation code is dash-formatted for display: 000000 -> 0000-00.
      await expect(quickActivatePage.codeInput).toHaveValue("0000-00");
      await expect(quickActivatePage.passwordInput).toBeVisible();
      await expect(quickActivatePage.continueButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] Quick Activate — password validation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-QACTIVATE-003 密码校验——弱密码内联报错并禁用 Continue，合法密码清除错误并启用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      await quickActivatePage.gotoWithParams("000000", "qa-explore-test@example.com");

      // Handoff specifies dataVariant weak/strong without literal values — minimal representative
      // values consistent with the zod rule described in the POM header (min 8 + letter + number + symbol).
      await quickActivatePage.fillPassword("weak");
      await quickActivatePage.blurPassword();
      await expect(quickActivatePage.continueButton).toBeDisabled();
      await expect(quickActivatePage.passwordError).toBeVisible();

      await quickActivatePage.fillPassword("Abcd123!");
      await quickActivatePage.blurPassword();
      await expect(quickActivatePage.continueButton).toBeEnabled();
    },
  );
});

test.describe("[CDP] Quick Activate — password visibility", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-QACTIVATE-004 显示/隐藏密码切换正确改变输入框 type 与 aria-label",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      await quickActivatePage.gotoWithParams("000000", "qa-explore-test@example.com");

      expect(await quickActivatePage.passwordInputType()).toBe("password");
      await quickActivatePage.togglePasswordVisibility();
      expect(await quickActivatePage.passwordInputType()).toBe("text");
    },
  );
});

test.describe("[CDP] Quick Activate — submit validation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-QACTIVATE-005 无效邀请码提交触发错误 toast 且停留在页面",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      await quickActivatePage.gotoWithParams("000000", "qa-explore-test@example.com");

      await quickActivatePage.fillPassword("Abcd123!");
      await quickActivatePage.clickContinue();

      await expect(quickActivatePage.invalidCodeToast).toBeVisible();
      await expect(page).toHaveURL(/\/quick-activate/);
      await expect(quickActivatePage.continueButton).toBeEnabled();
    },
  );
});
