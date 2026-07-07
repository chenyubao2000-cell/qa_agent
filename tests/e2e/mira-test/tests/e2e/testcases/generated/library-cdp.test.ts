// source: cdp
// handoff: test-cases/generated/playwright-handoff-library.json
// baseline: test-cases/generated/page-baseline-library.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { LibraryPage } from "../../pages/library.page";

test.describe("[CDP] Library — load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-LIB-001 已登录用户打开 Library 页正常加载占位内容且未被登录墙拦截",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const libraryPage = new LibraryPage(page, i18n);
      await libraryPage.goto();

      // URL stays on /library — not bounced to /sign-in.
      await expect(page).toHaveURL(/\/library$/);
      await expect(libraryPage.heading).toBeVisible();
      await expect(libraryPage.heading).toHaveText("Library");
    },
  );

  test(
    "TC-CDP-LIB-002 Library 占位内容完整渲染（Coming soon + Talent Library Canvas 占位）",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const libraryPage = new LibraryPage(page, i18n);
      await libraryPage.goto();

      await expect(libraryPage.comingSoon).toBeVisible();
      await expect(libraryPage.canvasHeading).toBeVisible();
      await expect(libraryPage.canvasHeading).toHaveText("Talent Library");
      await expect(libraryPage.placeholderBody).toBeVisible();
      await expect(libraryPage.sceneIdRow).toBeVisible();
      await expect(libraryPage.sceneModeRow).toBeVisible();
    },
  );
});

test.describe("[CDP] Library — shell", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-LIB-003 点击 Toggle Sidebar 折叠侧栏且主内容保持不变",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const libraryPage = new LibraryPage(page, i18n);
      await libraryPage.goto();

      await expect(libraryPage.sidebarRoot).toHaveAttribute("data-state", "expanded");

      await libraryPage.toggleSidebar();

      await expect(libraryPage.sidebarRoot).toHaveAttribute("data-state", "collapsed");
      await expect(libraryPage.heading).toBeVisible();
      await expect(libraryPage.canvasHeading).toBeVisible();
    },
  );
});
