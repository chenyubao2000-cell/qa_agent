/**
 * Shared setup helper: creates a task via UI that generates files (PPTX, PDF, PNG, MD, People Data).
 * Used by canvas-preview, canvas-download, view-all-files, people-data-download specs.
 *
 * Pattern A from SKILL.md §0c — create data in beforeAll via UI.
 * Returns the task URL for use in subsequent tests.
 */
import { type Browser } from "@playwright/test";

import { i18nRegex as i18nPattern } from "../i18n-helpers";

const AUTH_FILE = "playwright/.auth/user.json";

/**
 * Creates a new task that generates multiple file types.
 * The prompt is designed to trigger Mira's file generation tools.
 */
export async function createTaskWithFiles(browser: Browser): Promise<string> {
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();

  try {
    await page.goto("/task", { timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");

    // Send a prompt that triggers file generation (PPTX, PDF, image, etc.)
    const textarea = page.locator("textarea");
    await textarea.waitFor({ state: "visible", timeout: 15_000 });
    await textarea.fill(
      "请帮我创建以下文件：1) 一个关于天气的PPT演示文稿 2) 一个工作报告PDF 3) 搜索苏州的候选人数据",
    );
    await page
      .getByRole("button", { name: "Submit" })
      .click({ timeout: 10_000 });

    // Wait for navigation to task detail page
    await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

    // Wait for task to complete and file cards to appear in chat log
    await page.locator('[role="log"] div[role="button"]').first().waitFor({
      state: "visible",
      timeout: 300_000, // AI task may take up to 5 minutes
    });

    // Wait a bit more for all file cards to render
    await page.waitForTimeout(3000);

    const taskUrl = new URL(page.url()).pathname; // e.g., '/task/abc123'
    return taskUrl;
  } finally {
    await ctx.close();
  }
}

/**
 * Creates a new task specifically for People Data results.
 * Returns the task URL.
 */
export async function createTaskWithPeopleData(
  browser: Browser,
): Promise<string> {
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();

  try {
    await page.goto("/task", { timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");

    const textarea = page.locator("textarea");
    await textarea.waitFor({ state: "visible", timeout: 15_000 });
    await textarea.fill("帮我搜索苏州的软件工程师候选人");
    await page
      .getByRole("button", { name: "Submit" })
      .click({ timeout: 10_000 });

    await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

    // Wait for People Data card to appear
    await page
      .locator('[role="log"] div[role="button"]')
      .filter({
        hasText: i18nPattern("files.types.peopleData"),
      })
      .first()
      .waitFor({ state: "visible", timeout: 300_000 });

    await page.waitForTimeout(2000);

    const taskUrl = new URL(page.url()).pathname;
    return taskUrl;
  } finally {
    await ctx.close();
  }
}
