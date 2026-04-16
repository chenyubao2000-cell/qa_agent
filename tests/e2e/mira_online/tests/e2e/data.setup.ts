/**
 * data.setup.ts — Pre-create expensive AI task data before parallel test execution.
 *
 * Pipeline: setup(auth) → data-setup(this file) → e2e-*(10 workers)
 *
 * For each fixture URL:
 *   1. Check env var (E2E_TASK_WITH_*_URL) — skip if set
 *   2. Check .test-data.json — skip if present & not expired
 *   3. Create via UI → write URL to .test-data.json
 *
 * On a fresh environment: creates ~5 tasks serially (10-20 min).
 * On subsequent runs: reuses cached URLs (instant).
 */

import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

import { i18nRegex as i18nPattern } from "./i18n-helpers";

const AUTH_FILE = "playwright/.auth/user.json";
const SIGN_IN_PATH = "/sign-in";
const TEST_DATA_PATH = path.join(
  __dirname,
  "..",
  "..",
  "playwright",
  ".test-data.json",
);
const DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Helpers ──

function readTestData(): Record<string, string> {
  try {
    if (!fs.existsSync(TEST_DATA_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(TEST_DATA_PATH, "utf-8"));
    // Check if data is expired
    if (raw._createdAt && Date.now() - raw._createdAt > DATA_MAX_AGE_MS) {
      console.log("[data-setup] Cached data expired, will recreate");
      return {};
    }
    return raw;
  } catch {
    return {};
  }
}

function writeTestData(data: Record<string, string>) {
  const dir = path.dirname(TEST_DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    TEST_DATA_PATH,
    JSON.stringify({ _createdAt: Date.now(), ...data }, null, 2),
  );
}

function needsCreation(
  key: string,
  envVar: string,
  cached: Record<string, string>,
): boolean {
  if (process.env[envVar]) {
    console.log(`[data-setup] ${key}: using env var ${envVar}`);
    return false;
  }
  if (cached[key]) {
    console.log(`[data-setup] ${key}: using cached URL ${cached[key]}`);
    return false;
  }
  return true;
}

async function reAuthenticate(
  page: import("@playwright/test").Page,
): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error("No credentials in env");
  console.log("[data-setup] Re-authenticating...");
  const emailInput = page
    .locator('input[type="email"], input[name="email"]')
    .first();
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.fill(email);
  const continueBtn = page.getByRole("button", {
    name: i18nPattern("auth.continueButton", { exact: true }),
  });
  await continueBtn.click({ timeout: 30_000 });
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
  await passwordInput.fill(password);
  await continueBtn.click({ timeout: 30_000 });
  await page.waitForURL("**/task**", {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  await page.context().storageState({ path: AUTH_FILE });
}

async function ensureAuthenticated(
  page: import("@playwright/test").Page,
): Promise<void> {
  if (page.url().includes(SIGN_IN_PATH)) {
    await reAuthenticate(page);
  }
}

/** Submit a prompt and wait for task completion. Returns the task pathname. */
async function createTask(
  page: import("@playwright/test").Page,
  prompt: string,
  waitIndicator: RegExp = i18nPattern("chatbot.completed"),
  fallbackFill = "请直接开始",
): Promise<string> {
  await page.goto("/task", { timeout: 120_000, waitUntil: "domcontentloaded" });
  await ensureAuthenticated(page);
  await page.context().storageState({ path: AUTH_FILE });

  const textarea = page.getByRole("textbox", {
    name: i18nPattern("chatbot.placeholder"),
  });
  await textarea.waitFor({ state: "visible", timeout: 30_000 });
  await textarea.click();
  await textarea.pressSequentially(prompt, { delay: 30 });
  const submitBtn = page.getByRole("button", { name: "Submit" });
  await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
  await submitBtn.click({ timeout: 30_000 });
  await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
  await page.waitForTimeout(3000);

  // Wait for completion with clarification handling
  const target = page.getByText(waitIndicator);
  const clarificationBtn = page.locator('[role="log"] button').filter({
    hasText: i18nPattern("toolForms.clarifyQuestion.submit", { exact: true }),
  });
  for (let i = 0; i < 60; i++) {
    if (await target.isVisible().catch(() => false)) break;
    if (await clarificationBtn.isVisible().catch(() => false)) {
      const inputs = page.locator('[role="log"] textarea');
      const count = await inputs.count();
      for (let j = 0; j < count; j++) {
        if (!(await inputs.nth(j).inputValue())) {
          await inputs.nth(j).fill(fallbackFill);
        }
      }
      if (await clarificationBtn.isEnabled().catch(() => false)) {
        await clarificationBtn.click();
      }
    }
    await page.waitForTimeout(5000);
    // Refresh session every ~3 min
    if (i > 0 && i % 36 === 0) {
      await page
        .reload({ timeout: 30_000, waitUntil: "domcontentloaded" })
        .catch(() => {});
      await page
        .context()
        .storageState({ path: AUTH_FILE })
        .catch(() => {});
    }
  }
  await target.waitFor({ state: "visible", timeout: 300_000 });
  await page.waitForTimeout(3000);
  return new URL(page.url()).pathname;
}

// ── Setup test ──

/** Run a task creation in its own browser context (isolated page). */
async function createTaskInContext(
  browser: import("@playwright/test").Browser,
  key: string,
  prompt: string,
  waitIndicator: RegExp = i18nPattern("chatbot.completed"),
  fallbackFill = "请直接开始",
): Promise<string> {
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  try {
    console.log(`[data-setup] Creating ${key}...`);
    const url = await createTask(page, prompt, waitIndicator, fallbackFill);
    console.log(`[data-setup] ${key}: ${url}`);
    return url;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** Create shareUrl: needs task creation + share dialog interaction. */
async function createShareInContext(
  browser: import("@playwright/test").Browser,
): Promise<string> {
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  try {
    console.log("[data-setup] Creating shareUrl...");
    await page.goto("/task", {
      timeout: 120_000,
      waitUntil: "domcontentloaded",
    });
    await ensureAuthenticated(page);
    const textarea = page.getByRole("textbox", {
      name: i18nPattern("chatbot.placeholder"),
    });
    await textarea.waitFor({ state: "visible", timeout: 30_000 });
    await textarea.click();
    await textarea.pressSequentially("用 Python 写一个 hello world", {
      delay: 50,
    });
    const submitBtn = page.getByRole("button", { name: "Submit" });
    await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
    await submitBtn.click({ timeout: 30_000 });
    await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
    const completedIndicator = page.getByText(i18nPattern("chatbot.completed"));
    await completedIndicator.waitFor({ state: "visible", timeout: 300_000 });

    // Open share dialog
    const shareBtn = page
      .locator("button")
      .filter({
        has: page.locator("svg.lucide-share2, svg.lucide-share-2"),
      })
      .first();
    await shareBtn.waitFor({ state: "visible", timeout: 15_000 });
    await shareBtn.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    const copyBtn = dialog.getByRole("button", { name: /复制链接|Copy link/i });
    const createBtn = dialog.getByRole("button", {
      name: /创建分享链接|Create share link/i,
    });
    const hasLink = await copyBtn
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasLink) {
      await createBtn.click({ timeout: 10_000 });
      await copyBtn.waitFor({ state: "visible", timeout: 15_000 });
    }

    const shareText = await dialog
      .locator("text=/\\/share\\//")
      .textContent({ timeout: 5_000 });
    const sharePath = shareText
      ? new URL(shareText.trim()).pathname + new URL(shareText.trim()).search
      : "";
    if (!sharePath) throw new Error("Failed to extract share URL");
    console.log(`[data-setup] shareUrl: ${sharePath}`);
    return sharePath;
  } finally {
    await ctx.close().catch(() => {});
  }
}

setup("create test data", async ({ browser }) => {
  const cached = readTestData();
  const results: Record<string, string> = { ...cached };

  // Build parallel task list — each gets its own browser context
  const tasks: Array<{ key: string; promise: Promise<string> }> = [];

  if (needsCreation("taskWithCodeUrl", "E2E_TASK_WITH_CODE_URL", cached)) {
    tasks.push({
      key: "taskWithCodeUrl",
      promise: createTaskInContext(
        browser,
        "taskWithCodeUrl",
        "用 Python 写一个快速排序算法",
        i18nPattern("chatbot.completed"),
        "请直接编写代码",
      ),
    });
  }
  if (needsCreation("taskWithFilesUrl", "E2E_TASK_WITH_FILES_URL", cached)) {
    tasks.push({
      key: "taskWithFilesUrl",
      promise: createTaskInContext(
        browser,
        "taskWithFilesUrl",
        "帮我写一个简单的PPT，主题是自我介绍，3页就够，不需要问我问题直接创建",
        i18nPattern("chatbot.completed"),
        "请直接创建文件",
      ),
    });
  }
  if (
    needsCreation(
      "taskWithPeopleDataUrl",
      "E2E_TASK_WITH_PEOPLE_DATA_URL",
      cached,
    )
  ) {
    tasks.push({
      key: "taskWithPeopleDataUrl",
      promise: createTaskInContext(
        browser,
        "taskWithPeopleDataUrl",
        "帮我搜索苏州的软件工程师候选人，不需要问我问题直接搜索",
        i18nPattern("files.types.peopleData"),
        "软件工程师，3年以上经验",
      ),
    });
  }
  if (
    needsCreation(
      "taskWithToolChainUrl",
      "E2E_TASK_WITH_TOOL_CHAIN_URL",
      cached,
    )
  ) {
    tasks.push({
      key: "taskWithToolChainUrl",
      promise: createTaskInContext(
        browser,
        "taskWithToolChainUrl",
        '请帮我完成一个关于"2025年全球AI大模型市场"的综合研究任务。' +
          "不需要问我问题，直接开始执行，最终必须交付以下 6 种格式的文件（缺一不可）：" +
          "1) 一个 .xlsx 表格文件，内容为头部AI公司对比数据；" +
          "2) 一个 .pptx 演示文件，2页，概述市场格局；" +
          "3) 一个 .pdf 报告文件，总结研究发现；" +
          "4) 一个 .docx 文档文件，详细研究摘要；" +
          "5) 一个 .png 图片文件，用柱状图展示公司融资额对比；" +
          "6) 一个 .json 数据文件，包含公司统计的结构化数据。" +
          "请先搜索相关信息，再逐一生成以上所有文件，确保 6 个文件全部交付。",
        i18nPattern("chatbot.completed"),
        "请直接开始，使用默认设置",
      ),
    });
  }
  if (needsCreation("shareUrl", "E2E_SHARE_URL", cached)) {
    tasks.push({ key: "shareUrl", promise: createShareInContext(browser) });
  }

  if (tasks.length === 0) {
    console.log("[data-setup] All data cached, nothing to create.");
    return;
  }

  console.log(`[data-setup] Creating ${tasks.length} resources in parallel...`);

  // Run all in parallel, collect results
  const settled = await Promise.allSettled(tasks.map((t) => t.promise));
  let created = 0;
  for (let i = 0; i < tasks.length; i++) {
    const { key } = tasks[i];
    const result = settled[i];
    if (result.status === "fulfilled") {
      results[key] = result.value;
      created++;
    } else {
      console.error(`[data-setup] FAILED ${key}: ${result.reason}`);
    }
  }

  writeTestData(results);
  console.log(
    `[data-setup] Done. Created ${created}/${tasks.length}, ${Object.keys(results).length - 1} total cached.`,
  );
});
