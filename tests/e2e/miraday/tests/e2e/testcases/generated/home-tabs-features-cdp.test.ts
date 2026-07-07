// source: cdp
// handoff: test-cases/generated/playwright-handoff-home-tabs-features.json
// baseline: test-cases/generated/page-baseline-home.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { HomePage } from "../../pages/home.page";

test.describe("[CDP] Home — features tab switch", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-TABS-001 默认落地页展示 Core 标签面板内容",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await expect(homePage.featureHeading("Work With You, Not For You")).toBeVisible();
      await expect(homePage.featureHeading("Candidate Data")).toBeHidden();
    },
  );

  test(
    "TC-CDP-TABS-002 点击 Recruiting 切换到招聘功能面板",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.clickRecruitingTab();

      await expect(homePage.featureHeading("Candidate Data")).toBeVisible();
      await expect(homePage.featureHeading("Work With You, Not For You")).toBeHidden();
    },
  );

  test(
    "TC-CDP-TABS-003 从 Recruiting 切回 Core（往返一致性）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.clickRecruitingTab();
      await homePage.clickCoreTab();

      await expect(homePage.featureHeading("Work With You, Not For You")).toBeVisible();
      await expect(homePage.featureHeading("Candidate Data")).toBeHidden();
    },
  );

  test(
    "TC-CDP-TABS-004 重复点击已激活的 Core 标签保持幂等",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.clickCoreTab();

      await expect(homePage.featureHeading("Work With You, Not For You")).toBeVisible();
    },
  );

  test(
    "TC-CDP-TABS-005 快速双击 Recruiting 标签不导致面板错乱",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const homePage = new HomePage(page, i18n);
      await homePage.goto();

      await homePage.doubleClickRecruitingTab();

      await expect(homePage.featureHeading("Candidate Data")).toBeVisible();
      await expect(homePage.featureHeading("Candidate Data")).toHaveCount(1);
      await expect(homePage.featureHeading("Work With You, Not For You")).toBeHidden();
    },
  );
});
