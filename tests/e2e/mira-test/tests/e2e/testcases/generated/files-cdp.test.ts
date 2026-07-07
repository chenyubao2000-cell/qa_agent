// source: cdp
// handoff: test-cases/generated/playwright-handoff-files.json
// baseline: test-cases/generated/page-baseline-files.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { FilesPage } from "../../pages/files.page";

test.describe("[CDP] Files — list view", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-FILES-001 文件页加载并渲染已分组文件列表与完整工具栏",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const filesPage = new FilesPage(page, i18n);
      await filesPage.goto();

      await expect(filesPage.heading).toBeVisible();
      await expect(filesPage.searchInput).toBeVisible();
      await expect(filesPage.groupByButton).toBeVisible();
      await expect(filesPage.sortByButton).toBeVisible();
      await expect(filesPage.filterButton).toBeVisible();
      await expect(filesPage.listViewRadio).toBeChecked();
      await expect(filesPage.allTab).toHaveAttribute("aria-selected", "true");

      const rows = await filesPage.fileRowCount();
      expect(rows).toBeGreaterThan(0);
      await expect(filesPage.emptyTitle).toBeHidden();
    },
  );
});

test.describe("[CDP] Files — source filter", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-FILES-002 切到 My Uploads tab 显示无匹配空态并出现 Clear filters，URL 同步 sources=user_upload",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const filesPage = new FilesPage(page, i18n);
      await filesPage.goto();

      await filesPage.selectMyUploadsTab();

      await expect(filesPage.emptyTitle).toBeVisible();
      await expect(filesPage.clearFiltersButton).toBeVisible();
      await expect(page).toHaveURL(/sources=user_upload/);
      await expect(filesPage.heading).toBeVisible();
    },
  );

  test(
    "TC-CDP-FILES-003 空态点击 Clear filters 还原到有数据列表",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const filesPage = new FilesPage(page, i18n);
      await filesPage.goto();
      await filesPage.selectMyUploadsTab();

      await filesPage.clearFilters();

      await expect(filesPage.emptyTitle).toBeHidden();
      const rows = await filesPage.fileRowCount();
      expect(rows).toBeGreaterThan(0);
      await expect(page).not.toHaveURL(/sources=user_upload/);
    },
  );
});

test.describe("[CDP] Files — view toggle", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-FILES-004 List↔Grid 视图切换后主内容无水平溢出（Grid 布局缺陷回归护栏）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const filesPage = new FilesPage(page, i18n);
      await filesPage.goto();

      await filesPage.switchToGridView();
      const gridMetrics = await filesPage.mainScrollMetrics();
      expect(gridMetrics).not.toBeNull();
      expect(gridMetrics!.scrollWidth).toBeLessThanOrEqual(gridMetrics!.clientWidth + 1);
      expect(gridMetrics!.scrollLeft).toBe(0);

      await filesPage.switchToListView();
      const listMetrics = await filesPage.mainScrollMetrics();
      expect(listMetrics).not.toBeNull();
      expect(listMetrics!.scrollWidth).toBeLessThanOrEqual(listMetrics!.clientWidth + 1);
      expect(listMetrics!.scrollLeft).toBe(0);
    },
  );
});

test.describe("[CDP] Files — search", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-FILES-005 按不存在的文件名搜索显示无结果空态，清空后还原",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const filesPage = new FilesPage(page, i18n);
      await filesPage.goto();

      // No URL-sync assertion here: /files search is local React state only, unlike
      // /contacts which syncs ?q= — see handoff notes for TC-CDP-FILES-005.
      await filesPage.search("zzznonexistentfilexyz");
      await expect(filesPage.emptyTitle).toBeVisible();

      await filesPage.clearSearch();
      await expect(filesPage.emptyTitle).toBeHidden();
      const rows = await filesPage.fileRowCount();
      expect(rows).toBeGreaterThan(0);
    },
  );
});
