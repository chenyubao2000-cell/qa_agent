// source: cdp
// handoff: test-cases/generated/playwright-handoff-home-nav-top.json
// baseline: test-cases/generated/page-baseline-home.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { HomePage } from "../../pages/home.page";

// The landing page nav's "Sign in" link (href=/task) only redirects to /sign-in for a genuinely
// anonymous visitor; the project's global config applies an authenticated storageState to every
// test by default, which would navigate straight to /task instead of the auth wall under test
// here. Opt out so this suite observes the public, logged-out nav. See
// https://playwright.dev/docs/auth#testing-as-unauthenticated-user.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("[CDP] Home — top navigation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-NAV-001 点击导航 Features 按钮同页滚动至 Features 区块",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.clickFeatures();

      await expect(homePage.featuresSection).toBeVisible();
      // In-page smooth scroll — no navigation, URL stays on the landing root.
      await expect(page).toHaveURL(/\/$/);
    },
  );

  test(
    "TC-CDP-NAV-002 语言下拉展开并显示可选语言项，取消后不切换语言",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      // Assert the trigger is visible BEFORE opening the menu: this is a Radix Select, and
      // real product behavior hides background content (including the trigger itself) from
      // the accessibility tree via aria-hidden while the listbox is expanded — asserting
      // combobox visibility after opening the menu would fail against actual DOM, not because
      // of a script defect.
      await expect(homePage.languageCombobox).toBeVisible();

      await homePage.openLanguageMenu();

      await expect(homePage.languageOption("English")).toBeVisible();
      expect(await homePage.languageOptions.count()).toBeGreaterThanOrEqual(2);

      // Cancel via Escape — no locale switch should occur.
      await homePage.closeLanguageMenu();
      expect(await homePage.htmlLang()).toBe("en");
    },
  );

  test(
    "TC-CDP-NAV-003 点击导航 Sign in 跳转至鉴权墙并渲染关键登录元素",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.clickNavSignIn();

      await expect(page).toHaveURL(/\/sign-in/);
      await expect(homePage.signInHeading).toBeVisible();
      await expect(homePage.oauthGoogleButton).toBeVisible();
      await expect(homePage.oauthMicrosoftButton).toBeVisible();
      await expect(homePage.signInEmailInput).toBeVisible();
    },
  );

  test(
    "TC-CDP-NAV-004 点击导航 Join Waitlist 跳转至 /join-waitlist 并渲染工作邮箱字段",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.clickNavJoinWaitlist();

      await expect(page).toHaveURL(/\/join-waitlist/);
      await expect(homePage.joinWaitlistHeading).toBeVisible();
      await expect(homePage.workEmailInput).toBeVisible();
    },
  );
});

test.describe("[CDP] Home — CTA consistency", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-NAV-005 所有 Join Waitlist CTA（导航/hero/footer）目标一致指向 /join-waitlist",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      expect(await homePage.joinWaitlistCtaLinks.count()).toBeGreaterThanOrEqual(3);

      const hrefs = await homePage.joinWaitlistHrefs();
      for (const href of hrefs) {
        expect(href).toBe("/join-waitlist");
      }
    },
  );
});
