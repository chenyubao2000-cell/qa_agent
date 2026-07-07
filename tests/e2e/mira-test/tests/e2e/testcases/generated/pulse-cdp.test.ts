// source: cdp
// handoff: test-cases/generated/playwright-handoff-pulse.json
// baseline: test-cases/generated/page-baseline-pulse.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { PulsePage } from "../../pages/pulse.page";

test.describe("[CDP] Pulse — load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PULSE-001 Pulse 页加载并渲染标题与两个内容分区",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const pulsePage = new PulsePage(page, i18n);
      await pulsePage.goto();

      await expect(pulsePage.pageHeading).toHaveText("Pulse");
      await expect(pulsePage.awaitingHeading).toHaveText("Awaiting your reply");
      await expect(pulsePage.activityHeading).toHaveText("Recent activity");
    },
  );
});

test.describe("[CDP] Pulse — HITL awaiting section", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PULSE-002 HITL 待处理区展示待办项、计数徽标与 Reply/More 操作",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const pulsePage = new PulsePage(page, i18n);
      await pulsePage.goto();

      await expect(pulsePage.awaitingHeading).toBeVisible();
      await expect(pulsePage.awaitingCountBadge).toBeVisible();

      const badgeText = await pulsePage.awaitingCountText();
      const count = parseInt(badgeText, 10);
      expect(count).toBeGreaterThanOrEqual(1);

      await expect(pulsePage.hitlItemLink).toBeVisible();
      await expect(pulsePage.replyButton).toBeVisible();
      await expect(pulsePage.moreButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Pulse — activity empty state", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PULSE-003 Activity 区在 HITL 有数据/Activity 无数据时展示行内空态文案",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const pulsePage = new PulsePage(page, i18n);
      await pulsePage.goto();

      await expect(pulsePage.activityHeading).toHaveText("Recent activity");
      await expect(pulsePage.activityEmptyText).toBeVisible();
      await expect(pulsePage.activityEmptyText).toContainText(
        "will post here as your channel or agents move",
      );
    },
  );
});

test.describe("[CDP] Pulse — row more menu", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PULSE-004 HITL 行 More 下拉打开显示 Dismiss，Escape 关闭且不误触",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const pulsePage = new PulsePage(page, i18n);
      await pulsePage.goto();

      await pulsePage.openFirstRowMoreMenu();
      await expect(pulsePage.dismissMenuItem).toHaveText("Dismiss");

      await pulsePage.closeRowMenu();
      await expect(pulsePage.dismissMenuItem).toBeHidden();
      // No accidental dismiss — the HITL item link is still present after Escape.
      await expect(pulsePage.hitlItemLink).toBeVisible();
    },
  );

  test(
    "TC-CDP-PULSE-005 HITL 待办项标题链接指向源任务 /task/",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const pulsePage = new PulsePage(page, i18n);
      await pulsePage.goto();

      await expect(pulsePage.hitlItemLink).toBeVisible();
      await expect(pulsePage.hitlItemLink).toHaveAttribute("href", /\/task\//);
    },
  );
});
