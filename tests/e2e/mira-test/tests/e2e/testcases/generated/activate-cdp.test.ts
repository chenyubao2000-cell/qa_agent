// source: cdp
// handoff: test-cases/generated/playwright-handoff-activate.json
// baseline: test-cases/generated/page-baseline-activate.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ActivatePage, SIGN_IN_URL } from "../../pages/activate.page";
import { SignInPage } from "../../pages/sign-in.page";

// Anonymous guard page (per activate.page.ts source comment: "storageState-opted-out") —
// opt out of the default authenticated storageState, otherwise every /activate visit here
// lands on the ActivationForm as an already-signed-in user and never reaches the /sign-in
// guard redirect these tests assert on. Same pattern as sign-in-cdp.test.ts / sign-up-cdp.test.ts.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("[CDP] Activate — anonymous guard", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ACT-001 匿名访问 /activate 被重定向到 /sign-in 并渲染统一登录表单",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const activatePage = new ActivatePage(page, i18n);
      const signInPage = new SignInPage(page, i18n);

      // navigate: '/' then ActivatePage client-navigates to /activate (window.location.assign,
      // deliberately bypassing the ensureAuthenticated auto-fixture — see activate.page.ts header).
      await activatePage.gotoAnonymous();

      await expect(page).toHaveURL(SIGN_IN_URL);
      await expect(signInPage.signInHeading).toBeVisible();
      await expect(signInPage.emailInput).toBeVisible();
    },
  );
});

test.describe("[CDP] Activate — hasCode query bypass attempt", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ACT-002 匿名携带 ?hasCode=true 访问 /activate 仍被重定向到 /sign-in（查询参数不绕过鉴权）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const activatePage = new ActivatePage(page, i18n);
      const signInPage = new SignInPage(page, i18n);

      await activatePage.gotoAnonymous("?hasCode=true");

      await expect(page).toHaveURL(SIGN_IN_URL);
      await expect(signInPage.signInHeading).toBeVisible();
      await expect(signInPage.emailInput).toBeVisible();
    },
  );
});

test.describe("[CDP] Activate — unknown query params", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-ACT-003 匿名携带未知/异常查询参数访问 /activate 仍干净重定向到 /sign-in（无报错）",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const activatePage = new ActivatePage(page, i18n);
      const signInPage = new SignInPage(page, i18n);

      await activatePage.gotoAnonymous("?foo=bar&x=%20");

      await expect(page).toHaveURL(SIGN_IN_URL);
      await expect(signInPage.signInHeading).toBeVisible();
    },
  );
});
