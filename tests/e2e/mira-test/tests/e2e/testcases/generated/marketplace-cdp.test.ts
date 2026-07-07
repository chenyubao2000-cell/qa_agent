// source: cdp
// handoff: test-cases/generated/playwright-handoff-marketplace.json
// baseline: test-cases/generated/page-baseline-marketplace.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { MarketplacePage } from "../../pages/marketplace.page";

test.describe("[CDP] Marketplace — load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-MARKETPLACE-001 技能广场加载并渲染标题、计数行、技能卡片与顶栏操作",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const marketplacePage = new MarketplacePage(page, i18n);
      await marketplacePage.goto();

      await expect(marketplacePage.heading).toBeVisible();
      await expect(marketplacePage.counterLine).toBeVisible();
      await expect(marketplacePage.counterLine).toHaveText(/All skills \(\d+\)/);
      const cardCount = await marketplacePage.cardCount();
      expect(cardCount).toBeGreaterThanOrEqual(1);
      await expect(marketplacePage.publishedButton).toBeVisible();
      await expect(marketplacePage.publishNewButton).toBeEnabled();
      await expect(marketplacePage.backButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Marketplace — category filter", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-MARKETPLACE-002 分类筛选 Recruit — 列表与计数响应式更新",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const marketplacePage = new MarketplacePage(page, i18n);
      await marketplacePage.goto();

      const allCount = await marketplacePage.counterCount();
      expect(allCount).not.toBeNull();

      await marketplacePage.selectCategory("Recruit");

      await expect(marketplacePage.counterLine).toBeVisible();
      await expect(marketplacePage.counterLine).toHaveText(/All skills \(\d+\)/);
      const recruitCount = await marketplacePage.counterCount();
      expect(recruitCount).not.toBeNull();
      // Filtered subset ≤ full count.
      expect(recruitCount as number).toBeLessThanOrEqual(allCount as number);
    },
  );
});

test.describe("[CDP] Marketplace — sort", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-MARKETPLACE-003 排序下拉打开并切换为 Oldest first",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const marketplacePage = new MarketplacePage(page, i18n);
      await marketplacePage.goto();

      await marketplacePage.openSortMenu();

      await expect(marketplacePage.sortMenu).toBeVisible();
      await expect(marketplacePage.sortMenuItem("Newest first")).toBeVisible();
      await expect(marketplacePage.sortMenuItem("Oldest first")).toBeVisible();

      await marketplacePage.sortMenuItem("Oldest first").click();

      await expect(marketplacePage.sortMenu).toBeHidden();
      await expect(marketplacePage.sortTrigger).toHaveText("Oldest first");
    },
  );

  test(
    "TC-CDP-MARKETPLACE-005 排序菜单按 Escape 关闭",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const marketplacePage = new MarketplacePage(page, i18n);
      await marketplacePage.goto();

      await marketplacePage.openSortMenu();
      await expect(marketplacePage.sortMenu).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(marketplacePage.sortMenu).toBeHidden();
    },
  );
});

test.describe("[CDP] Marketplace — pagination", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-MARKETPLACE-004 分页控件 — 首页 Previous 禁用，存在次页时可翻页",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const marketplacePage = new MarketplacePage(page, i18n);
      await marketplacePage.goto();

      await expect(marketplacePage.paginationNav).toBeVisible();
      await expect(marketplacePage.prevButton).toBeDisabled();

      // Conditional: only exercise page 2 if a second page actually exists (handoff:
      // "仅当存在第二页时").
      const hasPageTwo = await marketplacePage.pageButton(2).isVisible().catch(() => false);
      if (hasPageTwo) {
        await marketplacePage.goToPage(2);
        await expect(marketplacePage.prevButton).toBeEnabled();
        const cardCount = await marketplacePage.cardCount();
        expect(cardCount).toBeGreaterThanOrEqual(1);
      } else {
        // Single page — both Previous and Next stay disabled.
        await expect(marketplacePage.nextButton).toBeDisabled();
      }
    },
  );
});
