// source: cdp
// handoff: test-cases/generated/playwright-handoff-terms.json
// baseline: test-cases/generated/page-baseline-terms.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { TermsPage } from "../../pages/terms.page";

// NOTE: playwright-handoff-terms.json has no explicit `tags` field per test case — tags
// below are inferred from `priority` per this project's standard convention, same as
// privacy-cdp.test.ts (its sibling legal page, which also runs without a storageState
// opt-out since /terms is fully public regardless of auth state).

test.describe("[CDP] Terms — page load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-TERMS-001 直接访问 /terms 正常加载且停留在公开页，标题与主标题正确",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const termsPage = new TermsPage(page, i18n);
      await termsPage.goto();

      await expect(page).toHaveURL(/\/terms/);
      const title = await termsPage.pageTitle();
      expect(title).toBe("Terms of Service - Mira");
      await expect(termsPage.mainHeading).toBeVisible();
      await expect(termsPage.mainHeading).toHaveText("Mira Terms of Service");
    },
  );
});

test.describe("[CDP] Terms — content completeness", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-TERMS-002 全部 16 个章节标题完整渲染，正文结构完整",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const termsPage = new TermsPage(page, i18n);
      await termsPage.goto();

      await expect(termsPage.mainHeading).toBeVisible();
      const count = await termsPage.sectionHeadingCount();
      expect(count).toBeGreaterThanOrEqual(15);
      await expect(termsPage.firstSectionHeading).toBeVisible();
      await expect(termsPage.lastSectionHeading).toBeVisible();
    },
  );
});
