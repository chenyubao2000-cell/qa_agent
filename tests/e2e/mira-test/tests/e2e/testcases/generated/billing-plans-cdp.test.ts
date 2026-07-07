// source: cdp
// handoff: test-cases/generated/playwright-handoff-billing-plans.json
// baseline: test-cases/generated/page-baseline-billing-plans.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { BillingPlansPage } from "../../pages/billing-plans.page";

test.describe("[CDP] Billing plans — load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PLANS-001 定价页加载并渲染标题、四张套餐卡与积分包区块",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const plansPage = new BillingPlansPage(page, i18n);
      await plansPage.goto();

      await expect(plansPage.heading).toBeVisible();
      await expect(plansPage.cardHeading("Starter")).toBeVisible();
      await expect(plansPage.cardHeading("Individual")).toBeVisible();
      await expect(plansPage.cardHeading("Team")).toBeVisible();
      await expect(plansPage.cardHeading("Enterprise")).toBeVisible();
      await expect(plansPage.creditPackSection).toBeVisible();
      await expect(plansPage.backButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Billing plans — CTA state (free account)", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PLANS-002 免费账户下三张付费卡显示 Upgrade、Team 显示 Most Popular、且无 Your Plan 徽标",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const plansPage = new BillingPlansPage(page, i18n);
      await plansPage.goto();

      await expect(plansPage.upgradeButtons.first()).toBeVisible();
      await expect(plansPage.upgradeButtons.first()).toBeEnabled();
      await expect(plansPage.contactUsButton).toBeVisible();
      await expect(plansPage.mostPopularBadge).toBeVisible();
      await expect(plansPage.yourPlanBadge).toHaveCount(0);
    },
  );
});

test.describe("[CDP] Billing plans — credit pack purchase gating", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PLANS-003 积分包 Buy 按钮默认禁用，选中任一积分包 tile 后启用且 tile 置为选中态",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const plansPage = new BillingPlansPage(page, i18n);
      await plansPage.goto();

      await expect(plansPage.buyButton).toBeDisabled();

      const packTile = plansPage.packTile(/\$199.*6,000 Credits/);
      await plansPage.selectPackTile(/\$199.*6,000 Credits/);

      await expect(packTile).toHaveAttribute("aria-pressed", "true");
      await expect(plansPage.buyButton).toBeEnabled();
    },
  );
});

test.describe("[CDP] Billing plans — Enterprise contact", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PLANS-004 点击 Enterprise Contact us 客户端导航至线索表单页（非支付流）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const plansPage = new BillingPlansPage(page, i18n);
      await plansPage.goto();

      await plansPage.openEnterpriseContact();

      await expect(page).toHaveURL(/\/billing\/plans\/contact/);
      await expect(plansPage.contactPageHeading).toBeVisible();
      await expect(plansPage.contactSubmitButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Billing plans — pricing display", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-PLANS-005 各套餐价格与计费周期后缀正确展示",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const plansPage = new BillingPlansPage(page, i18n);
      await plansPage.goto();

      // Starter $20/month, Individual $100/month, Team $200/person/month, Enterprise Custom
      // (per page-baseline-billing-plans.json S0 interactives).
      await expect(plansPage.cardPrice("Starter", "$20")).toBeVisible();
      await expect(plansPage.cardPrice("Individual", "$100")).toBeVisible();
      await expect(plansPage.cardPrice("Team", "$200")).toBeVisible();
      await expect(plansPage.cardPrice("Enterprise", "Custom")).toBeVisible();
      await expect(plansPage.cardSuffix("Team", "/person/month")).toHaveText("/person/month");
    },
  );
});
