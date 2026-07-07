// source: cdp
// handoff: test-cases/generated/playwright-handoff-privacy.json
// baseline: test-cases/generated/page-baseline-privacy.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { PrivacyPage } from "../../pages/privacy.page";

test.describe("[CDP] Privacy — page load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PRIVACY-001 匿名用户直接访问 /privacy 页面直出、无登录墙、主标题渲染",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const privacyPage = new PrivacyPage(page, i18n);
      await privacyPage.goto();

      await expect(page).toHaveURL(/\/privacy/);
      await expect(privacyPage.pageHeading).toBeVisible();
      await expect(privacyPage.pageHeading).toHaveText("Mira Privacy Policy");
    },
  );
});

test.describe("[CDP] Privacy — content structure", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PRIVACY-002 隐私政策 14 个顶级章节标题（1-14）完整渲染",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const privacyPage = new PrivacyPage(page, i18n);
      await privacyPage.goto();

      await expect(privacyPage.sectionHeadings).toHaveCount(14);
      await expect(privacyPage.sectionHeading("1. Overview")).toBeVisible();
      await expect(privacyPage.sectionHeading("9. Your Rights")).toBeVisible();
      await expect(privacyPage.sectionHeading("14. Contact Us")).toBeVisible();
    },
  );

  test(
    "TC-CDP-PRIVACY-003 页脚版权信息渲染（年份动态生成）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const privacyPage = new PrivacyPage(page, i18n);
      await privacyPage.goto();

      await expect(privacyPage.footer).toBeVisible();
      // Year is dynamic (new Date().getFullYear()) — asserted via pattern, never a hardcoded year.
      await expect(privacyPage.footer).toHaveText(/©\s*20\d{2}\s+Mira\. All rights reserved\./);
    },
  );
});

test.describe("[CDP] Privacy — document metadata", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-PRIVACY-005 页面文档元数据正确（title 与 html lang）",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const privacyPage = new PrivacyPage(page, i18n);
      await privacyPage.goto();

      expect(await privacyPage.documentTitle()).toBe("Privacy Policy - Mira");
      expect(await privacyPage.htmlLang()).toBe("en");
    },
  );
});
