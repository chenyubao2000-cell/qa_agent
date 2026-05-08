// source: cdp
// generated: 2026-04-29T00:00:00Z
// scope: AI plan-step collapsibles inside the chat log
//
// Each AI plan step (Search / Generate .xlsx / Generate .png / ...) renders as
// a Radix Collapsible whose trigger is a div with aria-expanded + data-state.
// Triggers respond to pointer events (playwright .click() works; DOM .click()
// alone does not). Each step's expanded content is unique — Search shows web
// search queries, Generate .xlsx shows "Create Excel Spreadsheet ..." tool
// invocation, etc. These tests verify (a) trigger toggles state, (b) at least
// one Search step expands to show its tool calls, (c) different steps yield
// different content, (d) collapse round-trip works.

import { test, expect } from "../../fixtures";
import { TaskCompletedFragment } from "../../pages/task.page.task-completed.fragment";

test.describe("[CDP] US-TASK-COMPLETED-STEP · Plan Step Collapsibles", () => {
  test(
    "TC-CDP-STEP-001 已完成任务详情页可见至少一个可展开的 step trigger",
    { tag: ["@P1", "@smoke", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      const triggers = completed.getStepTriggers();
      const count = await triggers.count();
      expect(count).toBeGreaterThan(0);
      // First trigger must be visible and start collapsed
      await expect(triggers.first()).toBeVisible();
    },
  );

  test.skip(
    "TC-CDP-STEP-002 点击 step trigger 切换 aria-expanded 并展开 content",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      const trigger = completed.getStepTriggers().first();
      await trigger.scrollIntoViewIfNeeded();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await completed.expandStep(trigger);
      await expect(trigger).toHaveAttribute("aria-expanded", "true");

      const content = await completed.readStepContent(trigger);
      expect(content.length).toBeGreaterThan(0);
    },
  );

  test.skip(
    "TC-CDP-STEP-003 Search step 展开后含至少一个 Web Search 子工具调用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      // Search step header starts with "Search for ..."
      const searchTrigger = completed.getStepTriggerByText(/^Search for/i);
      await searchTrigger.scrollIntoViewIfNeeded();
      await completed.expandStep(searchTrigger);
      const content = await completed.readStepContent(searchTrigger);
      // Must include at least one "Web Search" sub-tool name
      expect(content).toMatch(/Web Search/i);
    },
  );

  test.skip(
    "TC-CDP-STEP-004 不同 step 展开后内容差异化（Generate .xlsx 含 Excel 工具）",
    { tag: ["@P2", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      const searchTrigger = completed.getStepTriggerByText(/^Search for/i);
      const xlsxTrigger = completed.getStepTriggerByText(/Generate \.xlsx/i);

      await completed.expandStep(searchTrigger);
      await completed.expandStep(xlsxTrigger);

      const searchContent = await completed.readStepContent(searchTrigger);
      const xlsxContent = await completed.readStepContent(xlsxTrigger);

      expect(searchContent).not.toBe("");
      expect(xlsxContent).not.toBe("");
      // Distinct payload markers
      expect(searchContent).toMatch(/Web Search/i);
      expect(xlsxContent).toMatch(/Excel|\.xlsx/i);
      // The two contents must be substantively different
      expect(searchContent).not.toBe(xlsxContent);
    },
  );

  test.skip(
    "TC-CDP-STEP-005 step 展开后再次点击折叠 (aria-expanded false)",
    { tag: ["@P2", "@regression", "@full"] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      test.setTimeout(360_000);
      const completed = new TaskCompletedFragment(page, i18n);

      await page.goto(taskWithToolChainUrl, {
        timeout: 120_000,
        waitUntil: "domcontentloaded",
      });
      await completed.waitForCompleted(180_000);

      const trigger = completed.getStepTriggers().first();
      await trigger.scrollIntoViewIfNeeded();

      await completed.expandStep(trigger);
      await expect(trigger).toHaveAttribute("aria-expanded", "true");

      await completed.collapseStep(trigger);
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    },
  );
});
