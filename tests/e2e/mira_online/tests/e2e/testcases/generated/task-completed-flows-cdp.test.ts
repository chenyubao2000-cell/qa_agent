// source: cdp
// handoff: test-cases/generated/playwright-handoff-task-completed-flows.json
// baseline: test-cases/generated/page-baseline-task-completed.json
// generated: 2026-04-28T00:00:00Z

// Cross-area integration: ties together share-dialog × followup-suggestions × more-menu × topbar.
// Uses the shareUrl fixture so the task is guaranteed to be completed and shareable.

import { test, expect } from "../../fixtures";
import { ShareDialogFragment } from "../../pages/task.page.share-dialog.fragment";
import { TaskCompletedFragment } from "../../pages/task.page.task-completed.fragment";

function taskUrlFromShareUrl(shareUrl: string): string {
  const m = /^\/share\/([^/?]+)/.exec(shareUrl);
  if (!m) throw new Error(`Invalid shareUrl format: ${shareUrl}`);
  return `/task/${m[1]}`;
}

test.describe("[CDP] US-TASK-COMPLETED-CROSS · cross-area integration flows", () => {
  test.beforeEach(async ({ context }) => {
    await context
      .grantPermissions(["clipboard-read", "clipboard-write"])
      .catch(() => {});
  });

  // SKIPPED: same root cause as FOLLOWUP-003 — chenyubao2000 -57184 credits
  // means the follow-up auto-submit step never produces a new user-message.
  test.skip(
    "TC-CDP-FLOWS-001 share 对话框 → 复制链接 → 关闭 → 点击 follow-up → log 新增 user-message",
    { tag: ["@P2", "@regression", "@full"] },
    async ({ page, i18n, shareUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);
      const shareDialog = new ShareDialogFragment(page, i18n);

      await page.goto(taskUrlFromShareUrl(shareUrl), {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      // Step 1-5: open share dialog → copy link → verify clipboard
      await shareDialog.openShareDialog();
      const stateB = await shareDialog.isInActiveShareState(5000);
      if (!stateB) await shareDialog.clickCreateShareLink();

      const expectedUrl = await shareDialog.readShareUrlText();
      expect(expectedUrl).toMatch(/\/share\/.+token=/);

      await shareDialog.clickCopyLink();
      await page.waitForTimeout(300);
      const clipboardText = await page.evaluate(
        async () => await navigator.clipboard.readText(),
      );
      expect(clipboardText.trim()).toBe(expectedUrl);

      // Step 6-7: close dialog
      await shareDialog.closeShareDialog();
      await expect(shareDialog.getShareDialog()).toBeHidden();

      // Step 8-10: click follow-up (skip gracefully if no suggestions emitted)
      const ready = await completed
        .waitForFollowUpsReady(60_000)
        .then(() => true)
        .catch(() => false);
      test.skip(!ready, "AI did not emit follow-up suggestions for this run");

      const before = await completed.readUserMessageCount();
      await completed.clickFirstFollowUp();
      await completed.waitForUserMessageCount(before + 1, 30_000);
      const after = await completed.readUserMessageCount();
      expect(after).toBe(before + 1);
    },
  );

  test(
    "TC-CDP-FLOWS-002 ellipsis 菜单 → Esc 关闭 → follow-up 仍可点击",
    { tag: ["@P3", "@full"] },
    async ({ page, i18n, shareUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskUrlFromShareUrl(shareUrl), {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      await completed.clickEllipsis();
      await expect(completed.getMoreMenu()).toBeVisible();
      await completed.pressEscape();
      await expect(completed.getMoreMenu()).toBeHidden();

      const ready = await completed
        .waitForFollowUpsReady(60_000)
        .then(() => true)
        .catch(() => false);
      test.skip(!ready, "AI did not emit follow-up suggestions for this run");

      const before = await completed.readUserMessageCount();
      await completed.clickFirstFollowUp();
      await completed.waitForUserMessageCount(before + 1, 30_000);
      const after = await completed.readUserMessageCount();
      expect(after).toBe(before + 1);
    },
  );

  test(
    "TC-CDP-FLOWS-003 ellipsis → 任务详情 popover → 关闭 → 重新点击 share 仍可打开 dialog",
    { tag: ["@P3", "@full"] },
    async ({ page, i18n, shareUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);
      const shareDialog = new ShareDialogFragment(page, i18n);

      await page.goto(taskUrlFromShareUrl(shareUrl), {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      // Open ellipsis → taskDetails popover
      await completed.clickEllipsis();
      await completed.clickTaskDetails();
      await expect(completed.getTaskDetailsPopover()).toBeVisible();
      await expect(completed.getTaskDetailsCreditsLabel()).toBeVisible();

      // Close popover
      await completed.clickTaskDetailsClose();
      await expect(completed.getTaskDetailsPopover()).toBeHidden();

      // Open share dialog from same page — must work after popover dismissal
      await shareDialog.openShareDialog();
      await expect(shareDialog.getShareDialog()).toBeVisible();
    },
  );
});
