// source: cdp
// handoff: test-cases/generated/playwright-handoff-settings-connectors.json
// baseline: test-cases/generated/page-baseline-settings-connectors.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { SettingsConnectorsPage } from "../../pages/settings-connectors.page";

test.describe("[CDP] Settings Connectors — list", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONN-001 连接器设置页加载并渲染 Not Connected 分段与两个连接器行",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const settingsConnectorsPage = new SettingsConnectorsPage(page, i18n);
      await settingsConnectorsPage.goto();

      await expect(settingsConnectorsPage.heading).toBeVisible();
      await expect(settingsConnectorsPage.notConnectedSection).toBeVisible();
      await expect(settingsConnectorsPage.outlookRow).toBeVisible();
      await expect(settingsConnectorsPage.gmailRow).toBeVisible();
    },
  );

  test(
    "TC-CDP-CONN-002 两个未连接连接器的 Connect 按钮均可见且可用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const settingsConnectorsPage = new SettingsConnectorsPage(page, i18n);
      await settingsConnectorsPage.goto();

      await expect(settingsConnectorsPage.connectOutlookButton).toBeEnabled();
      await expect(settingsConnectorsPage.connectGmailButton).toBeEnabled();
    },
  );
});

test.describe("[CDP] Settings Connectors — detail drill-in", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONN-003 点击 Outlook 行下钻至详情（未授权态）并可 Back 返回列表",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const settingsConnectorsPage = new SettingsConnectorsPage(page, i18n);
      await settingsConnectorsPage.goto();

      await settingsConnectorsPage.openConnector("Outlook");

      await expect(settingsConnectorsPage.detailHeading("Outlook")).toHaveText("Outlook");
      // Both connectors in this environment are needsAuth === true.
      await expect(settingsConnectorsPage.detailConnectButton).toBeVisible();
      await expect(settingsConnectorsPage.detailConnectFirstText).toBeVisible();

      await settingsConnectorsPage.goBack();
      await expect(settingsConnectorsPage.heading).toBeVisible();
    },
  );
});

test.describe("[CDP] Settings Connectors — OAuth popup", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-CONN-004 点击 Connect Outlook 打开真实 OAuth 弹窗但不完成登录",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const settingsConnectorsPage = new SettingsConnectorsPage(page, i18n);
      await settingsConnectorsPage.goto();

      const popup = await settingsConnectorsPage.clickConnectAndCapturePopup(
        settingsConnectorsPage.connectOutlookButton,
      );

      await expect(popup).toHaveURL(/login\.microsoftonline\.com|composio\.dev/);
      await expect(page).toHaveURL(/\/settings\/connectors/);

      // Teardown: close the popup + reload the list WITHOUT completing OAuth (no credentials),
      // resetting the pending/disabled Connect button state per POM safety notes.
      await popup.close();
      await settingsConnectorsPage.goto();
    },
  );
});
