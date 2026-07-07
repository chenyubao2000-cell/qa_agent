// source: cdp
// handoff: test-cases/generated/playwright-handoff-activate.json
// baseline: test-cases/generated/page-baseline-activate.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ActivatePage, SIGN_IN_URL } from "../../pages/activate.page";
import { SignInPage } from "../../pages/sign-in.page";

// This suite exercises the anonymous /activate auth guard. The project's global config
// applies an authenticated storageState to every test by default (see playwright.config.ts),
// which would make these "anonymous" navigations actually hit the server as a logged-in user
// (redirecting to /task instead of the expected /sign-in guard redirect). Opt out with the
// official Playwright "unauthenticated" pattern so the guard is exercised as a real anonymous
// visitor. See https://playwright.dev/docs/auth#testing-as-unauthenticated-user.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("[CDP] Activate — anonymous auth guard", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ACT-001 匿名访问 /activate 被重定向到 /sign-in 并渲染统一登录表单",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const activatePage = new ActivatePage(page, i18n);
      const signInPage = new SignInPage(page, i18n);

      await activatePage.gotoAnonymous();

      // Anonymous /activate is a pure server-redirect guard — lands on /sign-in with
      // the unified sign-in/sign-up form rendered.
      await expect(page).toHaveURL(SIGN_IN_URL);
      await expect(signInPage.signInHeading).toBeVisible();
      await expect(signInPage.signInHeading).toHaveText("Sign in or Sign up");
      await expect(signInPage.emailInput).toBeVisible();
    },
  );

  test(
    "TC-CDP-ACT-002 匿名携带 ?hasCode=true 访问 /activate 仍被重定向到 /sign-in（查询参数不绕过鉴权）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const activatePage = new ActivatePage(page, i18n);
      const signInPage = new SignInPage(page, i18n);

      await activatePage.gotoAnonymous("?hasCode=true");

      // The server-side session guard fires before the ?hasCode branch is ever
      // evaluated, so the query param cannot bypass the redirect.
      await expect(page).toHaveURL(SIGN_IN_URL);
      await expect(signInPage.signInHeading).toBeVisible();
      await expect(signInPage.emailInput).toBeVisible();
    },
  );

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
