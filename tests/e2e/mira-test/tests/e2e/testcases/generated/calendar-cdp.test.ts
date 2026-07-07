// source: cdp
// handoff: test-cases/generated/playwright-handoff-calendar.json
// baseline: test-cases/generated/page-baseline-calendar.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { CalendarPage } from "../../pages/calendar.page";

test.describe("[CDP] Calendar — default load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CAL-001 已登录用户打开日历页默认展示当前月视图",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const calendarPage = new CalendarPage(page, i18n);
      await calendarPage.goto();

      // 未被重定向到 /sign-in。
      await expect(page).toHaveURL(/\/calendar/);
      await expect(calendarPage.heading).toHaveText("Calendar");
      await expect(calendarPage.monthToggle).toHaveAttribute("aria-pressed", "true");
      // 默认位于真实当前月。
      await expect(calendarPage.todayButton).toHaveAttribute("aria-pressed", "true");
      // 运行时 Intl 计算当前真实月标签。
      await expect(calendarPage.monthHeading).toHaveText(calendarPage.monthLabel());
      await expect(calendarPage.subtitle).toBeVisible();
    },
  );
});

test.describe("[CDP] Calendar — month navigation", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CAL-002 点击下一月前进到下个月且 Today 取消高亮",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const calendarPage = new CalendarPage(page, i18n);
      await calendarPage.goto();

      await calendarPage.clickNextMonth();

      // 运行时按当前月 +1 计算。
      await expect(calendarPage.monthHeading).toHaveText(calendarPage.monthLabel(1));
      // 游标离开真实当前月。
      await expect(calendarPage.todayButton).toHaveAttribute("aria-pressed", "false");
    },
  );

  test(
    "TC-CDP-CAL-003 从非当前月点击 Today 回到当前月并重新高亮",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const calendarPage = new CalendarPage(page, i18n);
      await calendarPage.goto();
      await calendarPage.clickNextMonth();

      await calendarPage.clickToday();

      // 回到运行时计算的当前真实月标签。
      await expect(calendarPage.monthHeading).toHaveText(calendarPage.monthLabel());
      await expect(calendarPage.todayButton).toHaveAttribute("aria-pressed", "true");
    },
  );
});

test.describe("[CDP] Calendar — view toggle", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CAL-004 切换到 Agenda 视图显示空状态并重置游标到当前月",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const calendarPage = new CalendarPage(page, i18n);
      await calendarPage.goto();

      await calendarPage.showAgenda();

      await expect(calendarPage.agendaToggle).toHaveAttribute("aria-pressed", "true");
      await expect(calendarPage.agendaEmptyText).toBeVisible();
      // 游标重置为当前真实月。
      await expect(calendarPage.monthHeading).toHaveText(calendarPage.monthLabel());
    },
  );

  test(
    "TC-CDP-CAL-005 从 Agenda 视图切回 Month 视图恢复月网格",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const calendarPage = new CalendarPage(page, i18n);
      await calendarPage.goto();
      await calendarPage.showAgenda();

      await calendarPage.showMonth();

      await expect(calendarPage.monthToggle).toHaveAttribute("aria-pressed", "true");
      // 月网格恢复，"No agenda yet" 不可见。
      await expect(calendarPage.agendaEmptyText).toBeHidden();
      await expect(calendarPage.subtitle).toBeVisible();
    },
  );
});
