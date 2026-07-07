// source: cdp
// handoff: test-cases/generated/playwright-handoff-marketplace.json
// baseline: test-cases/generated/page-baseline-marketplace.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { MarketplacePage, SETTINGS_SKILLS_URL } from "../../pages/marketplace.page";

test.describe("[CDP] Marketplace — skill-access gate redirect", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-MARKETPLACE-001 无技能访问权限的账户访问 /marketplace 被重定向到 /settings/skills 且落地页正常渲染",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const marketplacePage = new MarketplacePage(page, i18n);
      await marketplacePage.goto();

      await expect(page).toHaveURL(SETTINGS_SKILLS_URL);
      await expect(marketplacePage.redirectHeading).toBeVisible();
    },
  );

  test(
    "TC-CDP-MARKETPLACE-002 重复访问 /marketplace 的重定向行为保持一致（非偶发）",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const marketplacePage = new MarketplacePage(page, i18n);
      await marketplacePage.goto();

      await expect(page).toHaveURL(SETTINGS_SKILLS_URL);
      await expect(marketplacePage.redirectHeading).toBeVisible();

      // Leave for /task and come back — the redirect must trigger again, not just once.
      await page.goto("/task");
      await marketplacePage.goto();

      await expect(page).toHaveURL(SETTINGS_SKILLS_URL);
      await expect(marketplacePage.redirectHeading).toBeVisible();
    },
  );
});
