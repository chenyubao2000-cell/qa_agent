// source: cdp
// handoff: test-cases/generated/playwright-handoff-task-completed-share.json
// baseline: test-cases/generated/page-baseline-task-completed.json
// generated: 2026-04-28T00:00:00Z

import { test, expect } from "../../fixtures";
import { ShareDialogFragment } from "../../pages/task.page.share-dialog.fragment";
import { TaskCompletedFragment } from "../../pages/task.page.task-completed.fragment";

// Helper: derive the /task/{taskId} pathname from a shareUrl fixture
// shareUrl format = /share/{taskId}?token={token}
function taskUrlFromShareUrl(shareUrl: string): string {
  const m = /^\/share\/([^/?]+)/.exec(shareUrl);
  if (!m) throw new Error(`Invalid shareUrl format: ${shareUrl}`);
  return `/task/${m[1]}`;
}

test.describe("[CDP] US-TASK-COMPLETED-SHARE · Top-bar Share Dialog", () => {
  test.beforeEach(async ({ context }) => {
    // Required for navigator.clipboard.readText() in TC-003
    await context
      .grantPermissions(["clipboard-read", "clipboard-write"])
      .catch(() => {});
  });

  test(
    "TC-CDP-SHARE-001 点击 share2 按钮打开分享会话对话框",
    { tag: ["@P1", "@smoke", "@regression", "@full"] },
    async ({ page, i18n, shareUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);
      const shareDialog = new ShareDialogFragment(page, i18n);

      await page.goto(taskUrlFromShareUrl(shareUrl), {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      await shareDialog.openShareDialog();

      await expect(shareDialog.getShareDialog()).toBeVisible();
      await expect(shareDialog.getShareDialogHeading()).toBeVisible();
    },
  );

  test(
    "TC-CDP-SHARE-002 dialog 含 share URL (State B) 或 createShareLink 按钮 (State A)",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n, shareUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);
      const shareDialog = new ShareDialogFragment(page, i18n);

      await page.goto(taskUrlFromShareUrl(shareUrl), {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      await shareDialog.openShareDialog();

      const stateB = await shareDialog.isInActiveShareState(5000);
      if (!stateB) {
        // State A: click createShareLink → enter State B
        await shareDialog.clickCreateShareLink();
      }
      await expect(shareDialog.getShareUrlText()).toBeVisible();
      const text = await shareDialog.readShareUrlText();
      expect(text).toMatch(/\/share\/.+token=/);
    },
  );

  test(
    "TC-CDP-SHARE-003 点击复制链接将 URL 写入剪贴板，按钮显示 Copied",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n, shareUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);
      const shareDialog = new ShareDialogFragment(page, i18n);

      await page.goto(taskUrlFromShareUrl(shareUrl), {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      await shareDialog.openShareDialog();
      // Ensure State B
      const stateB = await shareDialog.isInActiveShareState(5000);
      if (!stateB) await shareDialog.clickCreateShareLink();

      const expectedUrl = await shareDialog.readShareUrlText();
      expect(expectedUrl).toMatch(/\/share\/.+token=/);

      await shareDialog.clickCopyLink();
      // Allow clipboard write + isCopied state to settle
      await page.waitForTimeout(300);

      const clipboardText = await page.evaluate(
        async () => await navigator.clipboard.readText(),
      );
      expect(clipboardText.trim()).toBe(expectedUrl);
    },
  );

  test(
    "TC-CDP-SHARE-004 点击 Close 关闭 dialog",
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

      await shareDialog.openShareDialog();
      await expect(shareDialog.getShareDialog()).toBeVisible();
      await shareDialog.closeShareDialog();
      await expect(shareDialog.getShareDialog()).toBeHidden();
    },
  );

  test(
    "TC-CDP-SHARE-005 点击移除分享 → dialog 退回 State A (destructive @failing)",
    { tag: ["@P3", "@full", "@failing"] },
    async ({ page, i18n, shareUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);
      const shareDialog = new ShareDialogFragment(page, i18n);

      await page.goto(taskUrlFromShareUrl(shareUrl), {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      await shareDialog.openShareDialog();
      const stateB = await shareDialog.isInActiveShareState(5000);
      test.skip(
        !stateB,
        "Dialog not in State B at start — fixture didn't pre-create active share",
      );

      try {
        await shareDialog.clickRemoveShare();
        await expect(shareDialog.getCreateShareLinkBtn()).toBeVisible();
      } finally {
        // Best-effort teardown: re-create share so subsequent test runs
        // (and downstream share-branch.test.ts) keep a working shareUrl fixture.
        const inA = await shareDialog
          .getCreateShareLinkBtn()
          .isVisible({ timeout: 2000 })
          .catch(() => false);
        if (inA) {
          await shareDialog.clickCreateShareLink().catch(() => {});
        }
      }
    },
  );
});
