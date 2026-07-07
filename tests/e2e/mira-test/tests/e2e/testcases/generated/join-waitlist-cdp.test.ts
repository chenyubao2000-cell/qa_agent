// source: cdp
// handoff: test-cases/generated/playwright-handoff-join-waitlist.json
// baseline: test-cases/generated/page-baseline-join-waitlist.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { JoinWaitlistPage } from "../../pages/join-waitlist.page";

test.describe("[CDP] Join Waitlist — form render", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-JW-001 匿名直达 /join-waitlist 直出完整申请表单并渲染全部关键元素",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const joinWaitlistPage = new JoinWaitlistPage(page, i18n);
      await joinWaitlistPage.goto();

      // No login wall / no redirect — URL stays on /join-waitlist.
      await expect(page).toHaveURL(/\/join-waitlist$/);
      await expect(joinWaitlistPage.heading).toBeVisible();
      await expect(joinWaitlistPage.emailInput).toBeVisible();
      await expect(joinWaitlistPage.firstNameInput).toBeVisible();
      await expect(joinWaitlistPage.lastNameInput).toBeVisible();
      await expect(joinWaitlistPage.companyInput).toBeVisible();
      await expect(joinWaitlistPage.roleInput).toBeVisible();
      await expect(joinWaitlistPage.useCaseInput).toBeVisible();
      await expect(joinWaitlistPage.sendVerifyCodeButton).toBeVisible();
      await expect(joinWaitlistPage.submitButton).toBeVisible();
      await expect(joinWaitlistPage.cancelButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Join Waitlist — button gating", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-JW-002 初始渲染时按钮门控状态正确（Send Verify Code 禁用、Submit Application 启用）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const joinWaitlistPage = new JoinWaitlistPage(page, i18n);
      await joinWaitlistPage.goto();

      // Email empty → Send Verify Code disabled.
      await expect(joinWaitlistPage.sendVerifyCodeButton).toBeDisabled();
      // Submit Application is only disabled while isSubmitting — stays enabled even with an
      // all-empty, unverified form (source: join-waitlist-form.tsx gating).
      await expect(joinWaitlistPage.submitButton).toBeEnabled();
    },
  );

  test(
    "TC-CDP-JW-003 输入非空邮箱（含非法格式）即启用 Send Verify Code — 仅按非空判定、不校验格式",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const joinWaitlistPage = new JoinWaitlistPage(page, i18n);
      await joinWaitlistPage.goto();

      await expect(joinWaitlistPage.sendVerifyCodeButton).toBeDisabled();

      await joinWaitlistPage.fillEmail("notanemail");

      // Gate is email.trim() non-empty — illegal format still enables the button.
      await expect(joinWaitlistPage.sendVerifyCodeButton).toBeEnabled();
    },
  );

  test(
    "TC-CDP-JW-004 纯空白邮箱保持 Send Verify Code 禁用（trim 边界）",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const joinWaitlistPage = new JoinWaitlistPage(page, i18n);
      await joinWaitlistPage.goto();

      await joinWaitlistPage.fillEmail("   ");

      // trim() of pure whitespace is empty → button stays disabled.
      await expect(joinWaitlistPage.sendVerifyCodeButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] Join Waitlist — submit gate", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-JW-005 邮箱未验证时点击 Submit Application 触发「请先验证邮箱」toast 且不离开页面",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const joinWaitlistPage = new JoinWaitlistPage(page, i18n);
      await joinWaitlistPage.goto();

      // Safe: unverified-email click short-circuits to a toast before any network call.
      await joinWaitlistPage.clickSubmit();

      await expect(joinWaitlistPage.emailNotVerifiedToast).toBeVisible();
      await expect(page).toHaveURL(/\/join-waitlist$/);
    },
  );
});
