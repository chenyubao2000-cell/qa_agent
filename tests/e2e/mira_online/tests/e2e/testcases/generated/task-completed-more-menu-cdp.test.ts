// source: cdp
// handoff: test-cases/generated/playwright-handoff-task-completed-more-menu.json
// baseline: test-cases/generated/page-baseline-task-completed.json
// generated: 2026-04-28T00:00:00Z

import { test, expect } from "../../fixtures";
import { TaskCompletedFragment } from "../../pages/task.page.task-completed.fragment";

test.describe("[CDP] US-TASK-COMPLETED-MORE-MENU · Top-bar More Menu", () => {
  test(
    "TC-CDP-MORE-001 点击 ellipsis 按钮打开包含任务详情的菜单",
    { tag: ["@P2", "@smoke", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      await completed.clickEllipsis();

      await expect(completed.getMoreMenu()).toBeVisible();
      await expect(completed.getTaskDetailsMenuItem()).toBeVisible();
      // task-header.tsx renders exactly 1 menuitem (taskDetails)
      await expect(completed.getMoreMenu().getByRole("menuitem")).toHaveCount(1);
    },
  );

  test(
    "TC-CDP-MORE-002 点击任务详情打开 Popover 展示 title / creditsConsumed / createdTime",
    { tag: ["@P2", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      await completed.clickEllipsis();
      await completed.clickTaskDetails();

      await expect(completed.getTaskDetailsPopover()).toBeVisible();
      await expect(completed.getTaskDetailsTitleLabel()).toBeVisible();
      await expect(completed.getTaskDetailsCreditsLabel()).toBeVisible();
      await expect(completed.getTaskDetailsCreatedTimeLabel()).toBeVisible();

      // Credits value: integer string OR loading "-" placeholder.
      const creditsText = await completed.readCreditsConsumedValue();
      expect(creditsText).toMatch(/^-?\d+$|^-$/);
    },
  );
});
