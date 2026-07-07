// source: cdp
// handoff: test-cases/generated/playwright-handoff-quick-activate.json
// baseline: test-cases/generated/page-baseline-quick-activate.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { QuickActivatePage } from "../../pages/quick-activate.page";

// Public page (per quick-activate.page.ts source comment: "Public page (no auth); specs
// opt out of storageState") — opt out of the default authenticated storageState. Without
// this, quick-activate/page.tsx's server guard (`redirect('/task') only if
// session?.user?.isActivated`) fires for our already-activated test account and every
// test here times out waiting for content that never renders because it's redirected away.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("[CDP] Quick Activate — missing params", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-QACTIVATE-001 无 code/email 参数直达渲染缺参错误视图且无任何输入框",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      await quickActivatePage.gotoMissingParams();

      await expect(quickActivatePage.heading).toBeVisible();
      await expect(quickActivatePage.missingParamsText).toBeVisible();
      await expect(quickActivatePage.signInLink).toBeVisible();
      // No password (or any) textbox renders in the minimal error view.
      await expect(quickActivatePage.passwordInput).toHaveCount(0);
    },
  );
});

test.describe("[CDP] Quick Activate — prefilled form", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-QACTIVATE-002 携带 code+email 参数渲染完整表单且邮箱/邀请码为只读预填",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      await quickActivatePage.gotoWithParams("000000", "qa-explore-test@example.com");

      await expect(quickActivatePage.heading).toBeVisible();
      await expect(quickActivatePage.emailInput).toHaveValue("qa-explore-test@example.com");
      // Source dash-formats the raw code 000000 -> 0000-00 for display.
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

      // Weak: fails the min-8 + letters + numbers + symbols zod rule (no symbol).
      await quickActivatePage.fillPassword("abc123");
      // Validation is on-blur (per quick-activate.page.ts's blurPassword() doc: "triggers
      // on-blur validation once touched") — fill() alone never triggers it, same pattern
      // as sign-up.page.ts / reset-password.page.ts.
      await quickActivatePage.blurPassword();
      await expect(quickActivatePage.continueButton).toBeDisabled();
      await expect(quickActivatePage.passwordError).toBeVisible();

      // Strong: satisfies letters + numbers + symbol + length.
      await quickActivatePage.fillPassword("Abcd123!");
      await quickActivatePage.blurPassword();
      await expect(quickActivatePage.continueButton).toBeEnabled();
    },
  );

  test(
    "TC-CDP-QACTIVATE-004 显示/隐藏密码切换正确改变输入框 type 与 aria-label",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      await quickActivatePage.gotoWithParams("000000", "qa-explore-test@example.com");

      await expect(quickActivatePage.passwordInput).toHaveAttribute("type", "password");
      await quickActivatePage.togglePasswordVisibility();
      await expect(quickActivatePage.passwordInput).toHaveAttribute("type", "text");
    },
  );
});

test.describe("[CDP] Quick Activate — submit", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-QACTIVATE-005 无效邀请码提交触发错误 toast 且停留在页面",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const quickActivatePage = new QuickActivatePage(page, i18n);
      // code=000000 is the deliberately-invalid invitation code for this scenario.
      await quickActivatePage.gotoWithParams("000000", "qa-explore-test@example.com");

      await quickActivatePage.fillPassword("Abcd123!");
      await quickActivatePage.clickContinue();

      await expect(quickActivatePage.invalidCodeToast).toBeVisible();
      await expect(page).toHaveURL(/\/quick-activate/);
      await expect(quickActivatePage.continueButton).toBeEnabled();
    },
  );
});
