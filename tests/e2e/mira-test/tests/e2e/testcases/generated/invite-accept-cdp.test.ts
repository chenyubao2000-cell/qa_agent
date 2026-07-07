// source: cdp
// handoff: test-cases/generated/playwright-handoff-invite-accept.json
// baseline: test-cases/generated/page-baseline-invite-accept.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { InviteAcceptPage } from "../../pages/invite-accept.page";

test.describe("[CDP] Invite accept — no token error state", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-IA-001 无 token 裸访问 /invite/accept 直出、无登录墙、渲染 invalid 错误态",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const inviteAcceptPage = new InviteAcceptPage(page, i18n);
      await inviteAcceptPage.goto();

      expect(inviteAcceptPage.pathname()).toBe("/invite/accept");
      await expect(inviteAcceptPage.pageHeading).toBeVisible();
      await expect(inviteAcceptPage.pageHeading).toHaveText(inviteAcceptPage.invalidTitleText);
      await expect(inviteAcceptPage.invalidSubtitle).toBeVisible();
      await expect(inviteAcceptPage.goToMiraButton).toBeVisible();
      await expect(inviteAcceptPage.goToMiraButton).toBeEnabled();
    },
  );
});

test.describe("[CDP] Invite accept — network behavior", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-IA-002 无 token 裸访问不触发 POST /api/invite/accept（fetch effect 短路）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const inviteAcceptPage = new InviteAcceptPage(page, i18n);

      let postAcceptRequests = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().includes("/api/invite/accept")) {
          postAcceptRequests += 1;
        }
      });

      await inviteAcceptPage.goto();

      expect(postAcceptRequests).toBe(0);
      await expect(inviteAcceptPage.pageHeading).toBeVisible();
    },
  );
});

test.describe("[CDP] Invite accept — navigation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-IA-003 点击 Go to Mira 客户端跳转到营销首页 /",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const inviteAcceptPage = new InviteAcceptPage(page, i18n);
      await inviteAcceptPage.goto();

      await inviteAcceptPage.clickGoToMira();

      expect(inviteAcceptPage.pathname()).toBe("/");
      await expect(inviteAcceptPage.pageHeading).toBeHidden();
      await expect(inviteAcceptPage.homepageHeading).toBeVisible();
    },
  );
});

test.describe("[CDP] Invite accept — auth layout header", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-IA-004 错误态下 (auth) layout 头部品牌链接与语言选择器正常渲染",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const inviteAcceptPage = new InviteAcceptPage(page, i18n);
      await inviteAcceptPage.goto();

      await expect(inviteAcceptPage.brandLink).toBeVisible();
      await expect(inviteAcceptPage.brandLink).toHaveAttribute("href", "/");
      await expect(inviteAcceptPage.languageCombobox).toBeVisible();
    },
  );
});
