// source: cdp
// handoff: test-cases/generated/playwright-handoff-organization.json
// baseline: test-cases/generated/page-baseline-organization.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { OrganizationPage } from "../../pages/organization.page";

test.describe("[CDP] Organization — load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ORG-001 组织页加载并渲染就绪态仪表盘",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const organizationPage = new OrganizationPage(page, i18n);
      await organizationPage.goto();

      await expect(organizationPage.heading).toBeVisible();
      await expect(organizationPage.heading).toHaveText("Organization");
      await expect(organizationPage.profileHeading).toBeVisible();
      await expect(organizationPage.currentPlanHeading).toBeVisible();
      await expect(organizationPage.membersHeading).toBeVisible();
      await expect(organizationPage.seatsText).toHaveText(/^\s*\d+\s*\/\s*(\d+|—)\s*$/);
    },
  );
});

test.describe("[CDP] Organization — profile rename", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ORG-002 Profile 改名进入编辑态并可保存回退（未改动不写库）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const organizationPage = new OrganizationPage(page, i18n);
      await organizationPage.goto();

      await expect(organizationPage.nameInput).toBeDisabled();

      await organizationPage.startEditName();

      await expect(organizationPage.nameInput).toBeEnabled();
      await expect(organizationPage.saveNameButton).toBeVisible();

      // save() early-returns when unchanged — no PATCH issued, non-destructive round trip.
      await organizationPage.saveNameUnchanged();

      await expect(organizationPage.editNameButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Organization — invite members dialog", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ORG-003 打开邀请成员弹窗且空输入时发送禁用，取消关闭返回列表",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const organizationPage = new OrganizationPage(page, i18n);
      await organizationPage.goto();

      await organizationPage.openInviteDialog();

      await expect(organizationPage.inviteDialog).toBeVisible();
      await expect(organizationPage.inviteSendButton).toBeDisabled();
      await expect(organizationPage.inviteCounter).toHaveText(/0\s*\/\s*50/);

      await organizationPage.closeInviteDialogViaCancel();

      await expect(organizationPage.inviteDialog).toBeHidden();
    },
  );

  test(
    "TC-CDP-ORG-004 邀请弹窗邮箱校验——非法保持禁用、合法启用发送",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const organizationPage = new OrganizationPage(page, i18n);
      await organizationPage.goto();
      await organizationPage.openInviteDialog();

      await organizationPage.fillInviteEmails("not-an-email");

      await expect(organizationPage.inviteSendButton).toBeDisabled();
      await expect(organizationPage.inviteCounter).toHaveText(/1\s*\/\s*50/);

      // Handoff asserts an "enabled Send with a legal, unique email" state alongside the
      // illegal-email check, but only lists the illegal-value fill as a step — reconstructing
      // the minimal action that actually reaches that state: replace with one valid address
      // using the same already-existing fillInviteEmails() method.
      await organizationPage.fillInviteEmails("qa-test@example.com");

      await expect(organizationPage.inviteSendButton).toBeEnabled();
    },
  );
});

test.describe("[CDP] Organization — members filter", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ORG-005 成员状态筛选切换到 Active，邀请行操作菜单消失",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const organizationPage = new OrganizationPage(page, i18n);
      await organizationPage.goto();

      await organizationPage.selectStatusFilter(organizationPage.activeFilterLabel);

      const count = await organizationPage.actionMenuCount();
      expect(count).toBe(0);
      await expect(organizationPage.membersHeading).toBeVisible();
    },
  );
});
