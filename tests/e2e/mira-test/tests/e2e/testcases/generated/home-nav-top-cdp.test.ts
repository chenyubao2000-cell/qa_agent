// source: cdp
// handoff: test-cases/generated/playwright-handoff-home-nav-top.json
// baseline: test-cases/generated/page-baseline-home.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { HomePage } from "../../pages/home.page";

test.describe("[CDP] Home — top nav Features scroll", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-NAV-001 点击导航 Features 按钮同页滚动至 Features 区块",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.clickFeatures();

      await expect(homePage.featuresSection).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    },
  );
});

test.describe("[CDP] Home — top nav language selector", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-NAV-002 语言下拉展开并显示可选语言项，取消后不切换语言",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.openLanguageMenu();
      await expect(homePage.languageOption("English")).toBeVisible();
      const optionCount = await homePage.languageOptions.count();
      expect(optionCount).toBeGreaterThanOrEqual(2);

      // Cancel without selecting — language must not switch.
      await homePage.closeLanguageMenu();
      await expect(homePage.languageCombobox).toBeVisible();
    },
  );
});

test.describe("[CDP] Home — top nav Sign in", { tag: ["@regression", "@full"] }, () => {
  // Per home.page.ts source comment: "Sign in" (href=/task) redirects UNAUTHENTICATED
  // users to /sign-in — an authenticated session just lands on /task instead, so this
  // describe (unlike its NAV-001/002/004/005 siblings) must opt out of the default
  // authenticated storageState to actually exercise the redirect-to-/sign-in guard.
  test.use({ storageState: { cookies: [], origins: [] } });

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
});

test.describe("[CDP] Home — top nav Join Waitlist", { tag: ["@regression", "@full"] }, () => {
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

  test(
    "TC-CDP-NAV-005 所有 Join Waitlist CTA（导航/hero/footer）目标一致指向 /join-waitlist",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      const count = await homePage.joinWaitlistCtaLinks.count();
      expect(count).toBeGreaterThanOrEqual(3);

      const hrefs = await homePage.joinWaitlistHrefs();
      for (const href of hrefs) {
        expect(href).toMatch(/\/join-waitlist/);
      }
    },
  );
});
