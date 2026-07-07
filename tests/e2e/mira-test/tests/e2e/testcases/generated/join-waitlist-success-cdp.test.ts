// source: cdp
// handoff: test-cases/generated/playwright-handoff-join-waitlist-success.json
// baseline: test-cases/generated/page-baseline-join-waitlist-success.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { JoinWaitlistSuccessPage } from "../../pages/join-waitlist-success.page";

test.describe("[CDP] Join Waitlist Success — render", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-JWS-001 带合法 email 参数访问成功页正确渲染确认内容",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const successPage = new JoinWaitlistSuccessPage(page, i18n);
      await successPage.gotoWithEmail("qa-test@example.com");

      // Valid email param → no redirect, URL stays on /join-waitlist/success.
      await expect(page).toHaveURL(/\/join-waitlist\/success/);
      await expect(successPage.successHeading).toBeVisible();
      await expect(successPage.successHeading).toHaveText("Application Submitted");
      await expect(successPage.successDescription).toBeVisible();
      await expect(successPage.backToHomeLink).toBeVisible();
    },
  );

  test(
    "TC-CDP-JWS-002 成功页原样回显传入的 email 值",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const successPage = new JoinWaitlistSuccessPage(page, i18n);
      await successPage.gotoWithEmail("qa-test@example.com");

      await expect(successPage.emailEcho("qa-test@example.com")).toBeVisible();
    },
  );

  test(
    "TC-CDP-JWS-006 URL 编码的特殊字符邮箱正确解码并原样回显",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const successPage = new JoinWaitlistSuccessPage(page, i18n);
      // gotoWithEmail encodes the raw value itself (encodeURIComponent), so pass the decoded form.
      await successPage.gotoWithEmail("qa+tag@example.com");

      await expect(successPage.emailEcho("qa+tag@example.com")).toBeVisible();
    },
  );
});

test.describe("[CDP] Join Waitlist Success — redirect", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-JWS-003 无 email 参数裸访问触发服务端重定向到申请表单",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const successPage = new JoinWaitlistSuccessPage(page, i18n);
      await successPage.gotoBare();

      await expect(page).not.toHaveURL(/\/success/);
      await expect(page).toHaveURL(/\/join-waitlist$/);
      await expect(successPage.joinWaitlistFormHeading).toBeVisible();
    },
  );

  test(
    "TC-CDP-JWS-004 空 email 参数（?email=）被视为缺失并重定向",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const successPage = new JoinWaitlistSuccessPage(page, i18n);
      await successPage.gotoWithEmptyEmail();

      await expect(page).not.toHaveURL(/\/success/);
      await expect(page).toHaveURL(/\/join-waitlist$/);
      await expect(successPage.joinWaitlistFormHeading).toBeVisible();
    },
  );
});

test.describe("[CDP] Join Waitlist Success — navigation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-JWS-005 点击 Back to Homepage 跳转到站点根首页",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const successPage = new JoinWaitlistSuccessPage(page, i18n);
      await successPage.gotoWithEmail("qa-test@example.com");

      await successPage.clickBackToHome();

      await expect(page).not.toHaveURL(/\/join-waitlist\/success/);
      await expect(page).toHaveURL(/\/$/);
    },
  );
});
