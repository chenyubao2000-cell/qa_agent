// source: cdp
// handoff: test-cases/generated/playwright-handoff-channels.json
// baseline: test-cases/generated/page-baseline-channels.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ChannelsPage } from "../../pages/channels.page";

test.describe("[CDP] Channels — list view", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CHANNEL-001 频道列表页加载并渲染标题、计数副标题与频道列表",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const channelsPage = new ChannelsPage(page, i18n);
      await channelsPage.goto();

      await expect(channelsPage.heading).toBeVisible();
      await expect(channelsPage.subtitle).toBeVisible();
      await expect(channelsPage.newChannelButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Channels — search", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CHANNEL-002 搜索无匹配关键词展示 noMatch 空态，清除后还原列表",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const channelsPage = new ChannelsPage(page, i18n);
      await channelsPage.goto();

      await channelsPage.search("zzznonexistentchannelxyz");

      await expect(channelsPage.noMatchTitle).toBeVisible();
      await expect(channelsPage.noMatchSubtitle).toBeVisible();

      await channelsPage.clearSearch();
      await expect(channelsPage.noMatchTitle).toBeHidden();
    },
  );
});

test.describe("[CDP] Channels — row actions", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CHANNEL-003 行 More actions 菜单暴露 Share/Rename/Delete，Escape 关闭",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const channelsPage = new ChannelsPage(page, i18n);
      await channelsPage.goto();

      await channelsPage.openFirstRowMenu();

      await expect(channelsPage.menuShareItem).toBeVisible();
      await expect(channelsPage.menuRenameItem).toBeVisible();
      await expect(channelsPage.menuDeleteItem).toBeVisible();

      // closeRowMenu() presses Escape and internally waits for the menu to become
      // hidden, which is the "Escape 关闭" behavior referenced in the title.
      await channelsPage.closeRowMenu();
    },
  );
});

test.describe("[CDP] Channels — create", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CHANNEL-004 New channel 按钮客户端跳转到 /task 新建页",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const channelsPage = new ChannelsPage(page, i18n);
      await channelsPage.goto();

      await channelsPage.clickNewChannel();

      await expect(page).toHaveURL(/\/task/);
    },
  );
});

test.describe("[CDP] Channels — search affordance", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-CHANNEL-005 点击搜索图标将搜索入口从图标展开为文本输入框",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const channelsPage = new ChannelsPage(page, i18n);
      await channelsPage.goto();

      await channelsPage.expandSearch();

      await expect(channelsPage.searchInput).toBeVisible();
    },
  );
});
