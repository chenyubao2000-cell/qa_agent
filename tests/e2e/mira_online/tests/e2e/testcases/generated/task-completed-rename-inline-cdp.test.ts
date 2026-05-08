// source: cdp
// handoff: test-cases/generated/playwright-handoff-task-completed-rename-inline.json
// baseline: test-cases/generated/page-baseline-task-completed.json
// generated: 2026-04-28T00:00:00Z

import { test, expect } from "../../fixtures";
import { TaskCompletedFragment } from "../../pages/task.page.task-completed.fragment";

// NOTE: Baseline labelled this area "rename-inline" but task-header.tsx +
// rename-task-dialog.tsx confirm that pen-line opens a Dialog (not inline edit).
// Tests are written against the Dialog behavior. The Save path (TC-004) writes
// to the backend and is gated with @failing.
test.describe("[CDP] US-TASK-COMPLETED-RENAME · Inline Rename Trigger", () => {
  test(
    "TC-CDP-RENAME-001 浏览态下 pen-line 按钮通过 hover 显示 (md+ 屏幕)",
    { tag: ["@P2", "@smoke", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      await completed.hoverTitle();
      // Even though the button has md:opacity-0 in browse state, hover gives it
      // opacity-100 via group-hover. attached() suffices on mobile breakpoints
      // where the button is always visible.
      await expect(completed.getPenLineBtn()).toBeVisible({ timeout: 10_000 });
    },
  );

  test(
    "TC-CDP-RENAME-002 点击 pen-line 打开 RenameTaskDialog 且 input 预填当前 title",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      const originalTitle = await completed.readTopbarTitle();
      expect(originalTitle.length).toBeGreaterThan(0);

      await completed.clickPenLine();

      await expect(completed.getRenameDialog()).toBeVisible();
      await expect(completed.getRenameDialogHeading()).toBeVisible();
      await expect(completed.getRenameInput()).toHaveValue(originalTitle);
    },
  );

  test(
    "TC-CDP-RENAME-003 点击 Cancel 关闭 dialog 且不写后端",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      const originalTitle = await completed.readTopbarTitle();
      await completed.clickPenLine();

      // Append a draft suffix, then cancel — title must stay original.
      await completed.fillRename(`${originalTitle} - draft`);
      await completed.clickRenameCancel();

      await expect(completed.getRenameDialog()).toBeHidden();
      const after = await completed.readTopbarTitle();
      expect(after).toBe(originalTitle);
    },
  );

  test(
    "TC-CDP-RENAME-004 输入新 title + Save → 顶栏 + sidebar 都更新 (destructive @failing)",
    { tag: ["@P1", "@regression", "@full", "@failing"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      const originalTitle = await completed.readTopbarTitle();
      const newTitle = `Renamed-${Date.now()}`;

      try {
        // Save the new title
        await completed.clickPenLine();
        await completed.fillRename(newTitle);
        await completed.clickRenameSave();

        // Topbar title updates
        await expect(completed.getTopbarTaskTitleSpan()).toHaveText(newTitle, {
          timeout: 15_000,
        });

        // Sidebar active task button also updates (data-active="true")
        await expect(completed.getSidebarActiveTaskBtn()).toContainText(newTitle, {
          timeout: 30_000,
        });
      } finally {
        // Teardown: restore original title regardless of outcome.
        const currentTitle = await completed.readTopbarTitle().catch(() => "");
        if (currentTitle && currentTitle !== originalTitle) {
          await completed.clickPenLine().catch(() => {});
          await completed.fillRename(originalTitle).catch(() => {});
          await completed.clickRenameSave().catch(() => {});
        }
      }
    },
  );
});
