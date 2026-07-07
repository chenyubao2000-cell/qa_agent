// source: cdp
// handoff: test-cases/generated/playwright-handoff-settings-connectors.json
// baseline: test-cases/generated/page-baseline-settings-connectors.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { SettingsConnectorsPage } from "../../pages/settings-connectors.page";

test.describe("[CDP] Settings Connectors — list load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONN-001 连接器设置页加载并渲染分段与全部连接器行",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const settingsConnectorsPage = new SettingsConnectorsPage(page, i18n);
      await settingsConnectorsPage.goto();

      await expect(settingsConnectorsPage.heading).toBeVisible();
      await expect(settingsConnectorsPage.connectedSection).toBeVisible();
      await expect(settingsConnectorsPage.notConnectedSection).toBeVisible();
      await expect(settingsConnectorsPage.marketLeadsRow).toBeVisible();
      await expect(settingsConnectorsPage.miraVoiceRow).toBeVisible();
      await expect(settingsConnectorsPage.outlookRow).toBeVisible();
      await expect(settingsConnectorsPage.gmailRow).toBeVisible();
    },
  );
});

test.describe("[CDP] Settings Connectors — detail navigation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONN-002 点击 Market Leads 行下钻至详情并可 Back 返回列表",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const settingsConnectorsPage = new SettingsConnectorsPage(page, i18n);
      await settingsConnectorsPage.goto();

      await settingsConnectorsPage.openConnector("Market Leads");

      await expect(settingsConnectorsPage.detailHeading("Market Leads")).toBeVisible();
      await expect(settingsConnectorsPage.detailToolsLabel).toBeVisible();
      expect(await settingsConnectorsPage.switchCount()).toBe(8);

      await settingsConnectorsPage.goBack();
      await expect(settingsConnectorsPage.heading).toBeVisible();
    },
  );

  test(
    "TC-CDP-CONN-004 不可变预置详情页头部不渲染任何 Connect/Disconnect 动作按钮",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const settingsConnectorsPage = new SettingsConnectorsPage(page, i18n);
      await settingsConnectorsPage.goto();

      await settingsConnectorsPage.openConnector("Market Leads");

      await expect(settingsConnectorsPage.detailHeading("Market Leads")).toBeVisible();
      await expect(settingsConnectorsPage.detailConnectButton).toBeHidden();
      await expect(settingsConnectorsPage.detailDisconnectButton).toBeHidden();
    },
  );
});

test.describe("[CDP] Settings Connectors — connection state", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONN-003 连接状态决定动作按钮状态（预置 Disconnect 禁用 / 未连接 Connect 可用）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const settingsConnectorsPage = new SettingsConnectorsPage(page, i18n);
      await settingsConnectorsPage.goto();

      await expect(settingsConnectorsPage.disconnectMarketLeadsButton).toBeDisabled();
      await expect(settingsConnectorsPage.disconnectMiraVoiceButton).toBeDisabled();
      await expect(settingsConnectorsPage.connectOutlookButton).toBeEnabled();
      await expect(settingsConnectorsPage.connectGmailButton).toBeEnabled();
    },
  );
});
