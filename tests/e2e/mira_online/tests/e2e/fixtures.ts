import { test as base, expect } from "@playwright/test";
import type { Page, WorkerInfo, TestInfo } from "@playwright/test";

// ── i18n: read directly from Mira source via i18n-helpers ──
import { allMessages, i18nRegex } from "./i18n-helpers";
import {
  LOCALE_NATIVE_NAMES,
  authFileForLocale,
  defaultLocale as computedDefaultLocale,
  toProjectLocale,
} from "./locale-map";

const i18nMessages = allMessages;

export type I18n = { t: (key: string) => string; locale: string };

function localeFromProjectName(name: string): string {
  const m = /^(?:e2e|setup)-(.+)$/.exec(name);
  if (m?.[1]) return toProjectLocale(m[1]);
  return computedDefaultLocale();
}

// Worker-scoped fixtures create data via a logged-in context; reuse the default-locale
// storageState (data content is locale-agnostic — tasks have Chinese prompts regardless).
const WORKER_AUTH_FILE = authFileForLocale(computedDefaultLocale());

// ── Session guard: auto re-authenticate on expiry ──
const SIGN_IN_PATH = "/sign-in";

async function reAuthenticate(
  page: Page,
  info: { authFile: string; targetLocale: string },
): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password)
    throw new Error("Session expired but no credentials in env");

  console.log("[session-guard] Session expired, re-authenticating...");

  const emailInput = page
    .locator('input[type="email"], input[name="email"]')
    .first();
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.fill(email);

  const continueBtn = page.getByRole("button", {
    name: i18nRegex("auth.continueButton", { exact: true }),
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
  console.log("[session-guard] Re-authentication successful");

  // Re-apply UI locale so account preference stays aligned with the project locale.
  await ensureUiLocale(page, info.targetLocale).catch(() => {});

  await page.context().storageState({ path: info.authFile });
}

async function ensureUiLocale(page: Page, targetLocale: string): Promise<void> {
  const nativeName = LOCALE_NATIVE_NAMES[targetLocale];
  if (!nativeName) return;
  const currentLang = await page.locator("html").getAttribute("lang").catch(() => null);
  if (currentLang === targetLocale) return;

  const userMenuBtn = page
    .locator('[data-sidebar="footer"] [data-sidebar="menu-button"]')
    .first();
  if (!(await userMenuBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
  await userMenuBtn.click();

  const langItem = page.getByRole("menuitem", {
    name: i18nRegex("common.language", "Layout.language"),
  });
  const ok = await langItem
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  if (ok) {
    await langItem.first().click();
  } else {
    await page
      .locator('[role="menu"] [role="menuitem"][aria-haspopup="menu"]')
      .first()
      .click();
  }
  await page
    .getByRole("menuitemcheckbox", {
      name: new RegExp(`^${nativeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    })
    .click({ timeout: 10_000 });
  await page
    .waitForFunction(
      (loc) => document.documentElement.lang === loc,
      targetLocale,
      { timeout: 15_000 },
    )
    .catch(() => {});
}

// ── Shared test-data file for cross-project URL passing ──
import path from "node:path";
import fs from "node:fs";

const TEST_DATA_PATH = path.join(
  __dirname,
  "..",
  "..",
  "playwright",
  ".test-data.json",
);

function readTestData(key: string): string | undefined {
  try {
    if (!fs.existsSync(TEST_DATA_PATH)) return undefined;
    const data = JSON.parse(fs.readFileSync(TEST_DATA_PATH, "utf-8"));
    return data[key] || undefined;
  } catch {
    return undefined;
  }
}

// ── Worker-scope fixtures for expensive AI task creation ──

type TestDataFixtures = {
  taskWithFilesUrl: string;
  taskWithPeopleDataUrl: string;
  taskWithCodeUrl: string;
  shareUrl: string;
  taskWithToolChainUrl: string;
};

/** Auto-dismiss Mira's clarification form if it appears before the target element. */
async function waitForResultWithClarification(
  page: Page,
  targetLocator: import("@playwright/test").Locator,
  fallbackFill = "软件工程师",
  /** Persist cookies periodically so session_data stays fresh across long waits */
  authFile = WORKER_AUTH_FILE,
) {
  const clarificationBtn = page.locator('[role="log"] button').filter({
    hasText: i18nRegex("toolForms.clarifyQuestion.submit", { exact: true }),
  });
  let disabledCount = 0;

  for (let i = 0; i < 60; i++) {
    if (await targetLocator.isVisible().catch(() => false)) {
      console.log(`[fixture] Target element visible after ${i * 5}s`);
      return;
    }
    if (await clarificationBtn.isVisible().catch(() => false)) {
      // Fill empty textareas
      const inputs = page.locator('[role="log"] textarea');
      const count = await inputs.count();
      for (let j = 0; j < count; j++) {
        if (!(await inputs.nth(j).inputValue())) {
          await inputs.nth(j).click();
          await inputs.nth(j).fill(fallbackFill);
          await inputs.nth(j).dispatchEvent("input");
        }
      }
      // Click first unchecked radio in each group
      const radios = page.locator('[role="log"] [role="radiogroup"]');
      const radioCount = await radios.count();
      for (let j = 0; j < radioCount; j++) {
        const checked = await radios
          .nth(j)
          .locator('[role="radio"][data-state="checked"]')
          .count();
        if (checked === 0) {
          await radios
            .nth(j)
            .locator('[role="radio"]')
            .first()
            .click()
            .catch(() => {});
        }
      }
      const isEnabled = await clarificationBtn.isEnabled().catch(() => false);
      if (isEnabled) {
        await clarificationBtn.click();
        console.log(`[fixture] Clarification submitted at ${i * 5}s`);
        disabledCount = 0;
      } else {
        disabledCount++;
        if (disabledCount >= 3) {
          console.log(
            `[fixture] Submit stuck disabled, bypassing via chat at ${i * 5}s`,
          );
          const chatInput = page.locator("textarea").last();
          await chatInput.fill("请直接开始创建，使用默认设置");
          await page
            .getByRole("button", {
              name: i18nRegex("toolForms.clarifyQuestion.submit", {
                exact: true,
              }),
            })
            .click({ timeout: 5_000 })
            .catch(() => {});
          disabledCount = 0;
        }
      }
    }
    await page.waitForTimeout(5000);

    // Refresh session every ~3 min by reloading the page.
    // session_data cookie expires in 5 min (better-auth cookieCache.maxAge).
    // A full page reload triggers server to send fresh Set-Cookie headers.
    if (i > 0 && i % 36 === 0) {
      console.log(`[fixture] Refreshing session via reload at ${i * 5}s...`);
      await page
        .reload({ timeout: 30_000, waitUntil: "domcontentloaded" })
        .catch(() => {});
      await page
        .context()
        .storageState({ path: authFile })
        .catch(() => {});
    }
  }

  console.log(`[fixture] Polling exhausted (300s), doing final wait...`);
  await targetLocator.waitFor({ state: "visible", timeout: 300_000 });
}

// Per-locale execution strategy: the default locale runs the full suite, non-default
// locales run only @smoke tagged tests. Implemented as a beforeEach skip so the
// filter is explicit and independent of Playwright's CLI/project grep interactions.
// Bypass with env `FORCE_ALL_LOCALES=1` when a full audit across locales is wanted
// (mainly to diagnose regressions before releasing — normally use /qa-i18n-audit).
base.beforeEach(async ({}, testInfo) => {
  if (process.env.FORCE_ALL_LOCALES === "1") return;
  const projectName = testInfo.project.name;
  // Only gate real test projects; let setup-* and data-setup always run.
  if (!projectName.startsWith("e2e-")) return;
  const projectLocale = projectName.replace(/^e2e-/, "");
  if (projectLocale === computedDefaultLocale()) return;
  const tags = (testInfo as any).tags || [];
  if (tags.includes("@smoke")) return;
  base.skip(
    true,
    `non-default locale '${projectLocale}' runs only @smoke; deep i18n coverage via /qa-i18n-audit`,
  );
});

export const test = base.extend<
  { i18n: I18n; ensureAuthenticated: void },
  TestDataFixtures
>({
  ensureAuthenticated: [
    async ({ page }, use, testInfo) => {
      const targetLocale = localeFromProjectName(testInfo.project.name);
      const authFile = authFileForLocale(targetLocale);
      const originalGoto = page.goto.bind(page);
      page.goto = async (url: string, options?: any) => {
        const response = await originalGoto(url, options);
        // Skip session guard when the test intentionally navigates to sign-in
        const isSignInTarget = url.includes(SIGN_IN_PATH);
        if (!isSignInTarget && page.url().includes(SIGN_IN_PATH)) {
          await reAuthenticate(page, { authFile, targetLocale });
          return originalGoto(url, options);
        }
        return response;
      };
      await use();
    },
    { auto: true },
  ],

  i18n: [
    async ({}, use, testInfo) => {
      const locale = testInfo.project.name.replace("e2e-", "") || "en";
      const dict = i18nMessages[locale] ?? i18nMessages["en"];
      const t = (key: string): string => {
        const parts = key.split(".");
        let val: any = dict;
        for (const p of parts) {
          val = val?.[p];
        }
        return typeof val === "string" ? val : key;
      };
      await use({ t, locale });
    },
    { scope: "worker" },
  ],

  taskWithFilesUrl: [
    async ({ browser }, use) => {
      const presetUrl =
        process.env.E2E_TASK_WITH_FILES_URL || readTestData("taskWithFilesUrl");
      if (presetUrl) {
        console.log(
          `[fixture:taskWithFilesUrl] Using preset URL: ${presetUrl}`,
        );
        await use(presetUrl);
        return;
      }
      const ctx = await browser.newContext({ storageState: WORKER_AUTH_FILE });
      const page = await ctx.newPage();
      try {
        await page.goto("/task", {
          timeout: 120_000,
          waitUntil: "domcontentloaded",
        });
        if (page.url().includes(SIGN_IN_PATH)) {
          await reAuthenticate(page, { authFile: WORKER_AUTH_FILE, targetLocale: computedDefaultLocale() });
          await page.goto("/task", {
            timeout: 120_000,
            waitUntil: "domcontentloaded",
          });
        }
        await ctx.storageState({ path: WORKER_AUTH_FILE });
        await page.waitForLoadState("domcontentloaded");
        const textarea = page.getByRole("textbox", {
          name: i18nRegex("chatbot.placeholder"),
        });
        await textarea.waitFor({ state: "visible", timeout: 30_000 });
        await textarea.click();
        await textarea.pressSequentially(
          "帮我写一个简单的PPT，主题是自我介绍，3页就够，不需要问我问题直接创建",
          { delay: 30 },
        );
        const submitBtn = page.getByRole("button", {
          name: i18nRegex("toolForms.clarifyQuestion.submit", { exact: true }),
        });
        await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
        await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
        await submitBtn.click({ timeout: 30_000 });
        await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

        // Wait for task completion (file generation) — also handles clarification forms
        const completedIndicator = page.getByText(
          i18nRegex("chatbot.completed"),
        );
        await waitForResultWithClarification(
          page,
          completedIndicator,
          "请直接创建文件",
        );
        await page.waitForTimeout(3000);
        await use(new URL(page.url()).pathname);
      } finally {
        await ctx.close().catch(() => {});
      }
    },
    { scope: "worker", timeout: 480_000 },
  ],

  taskWithPeopleDataUrl: [
    async ({ browser }, use) => {
      const presetUrl =
        process.env.E2E_TASK_WITH_PEOPLE_DATA_URL ||
        readTestData("taskWithPeopleDataUrl");
      if (presetUrl) {
        console.log(
          `[fixture:taskWithPeopleDataUrl] Using preset URL: ${presetUrl}`,
        );
        await use(presetUrl);
        return;
      }
      const ctx = await browser.newContext({ storageState: WORKER_AUTH_FILE });
      const page = await ctx.newPage();
      try {
        await page.goto("/task", {
          timeout: 120_000,
          waitUntil: "domcontentloaded",
        });
        if (page.url().includes(SIGN_IN_PATH)) {
          await reAuthenticate(page, { authFile: WORKER_AUTH_FILE, targetLocale: computedDefaultLocale() });
          await page.goto("/task", {
            timeout: 120_000,
            waitUntil: "domcontentloaded",
          });
        }
        await ctx.storageState({ path: WORKER_AUTH_FILE });
        await page.waitForLoadState("domcontentloaded");
        const textarea = page.getByRole("textbox", {
          name: i18nRegex("chatbot.placeholder"),
        });
        await textarea.waitFor({ state: "visible", timeout: 30_000 });
        await textarea.click();
        await textarea.pressSequentially(
          "帮我搜索苏州的软件工程师候选人，不需要问我问题直接搜索",
          { delay: 30 },
        );
        const submitBtn = page.getByRole("button", {
          name: i18nRegex("toolForms.clarifyQuestion.submit", { exact: true }),
        });
        await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
        await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
        await submitBtn.click({ timeout: 30_000 });
        await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

        const peopleDataCard = page
          .locator('[role="log"] div[role="button"]')
          .filter({
            hasText: i18nRegex("files.types.peopleData"),
          })
          .first();
        await waitForResultWithClarification(
          page,
          peopleDataCard,
          "软件工程师，3年以上经验",
        );
        await page.waitForTimeout(2000);
        await use(new URL(page.url()).pathname);
      } finally {
        await ctx.close().catch(() => {});
      }
    },
    { scope: "worker", timeout: 360_000 },
  ],

  taskWithCodeUrl: [
    async ({ browser }, use) => {
      const presetUrl =
        process.env.E2E_TASK_WITH_CODE_URL || readTestData("taskWithCodeUrl");
      if (presetUrl) {
        console.log(`[fixture:taskWithCodeUrl] Using preset URL: ${presetUrl}`);
        await use(presetUrl);
        return;
      }

      const ctx = await browser.newContext({ storageState: WORKER_AUTH_FILE });
      const page = await ctx.newPage();
      try {
        await page.goto("/task", {
          timeout: 120_000,
          waitUntil: "domcontentloaded",
        });
        if (page.url().includes(SIGN_IN_PATH)) {
          await reAuthenticate(page, { authFile: WORKER_AUTH_FILE, targetLocale: computedDefaultLocale() });
          await page.goto("/task", {
            timeout: 120_000,
            waitUntil: "domcontentloaded",
          });
        }
        await ctx.storageState({ path: WORKER_AUTH_FILE });
        await page.waitForLoadState("domcontentloaded");
        const textarea = page.getByRole("textbox", {
          name: i18nRegex("chatbot.placeholder"),
        });
        await textarea.waitFor({ state: "visible", timeout: 30_000 });
        await textarea.click();
        await textarea.pressSequentially("用 Python 写一个快速排序算法", {
          delay: 50,
        });
        const submitBtn = page.getByRole("button", {
          name: i18nRegex("toolForms.clarifyQuestion.submit", { exact: true }),
        });
        await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
        await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
        await submitBtn.click({ timeout: 30_000 });
        await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
        await page.waitForTimeout(3000);
        const completedIndicator = page.getByText(
          i18nRegex("chatbot.completed"),
        );
        await waitForResultWithClarification(
          page,
          completedIndicator,
          "请直接编写代码",
        );
        await page.waitForTimeout(3000);
        await use(new URL(page.url()).pathname);
      } finally {
        await ctx.close().catch(() => {});
      }
    },
    { scope: "worker", timeout: 480_000 },
  ],

  shareUrl: [
    async ({ browser }, use) => {
      const presetUrl = process.env.E2E_SHARE_URL || readTestData("shareUrl");
      if (presetUrl) {
        console.log(`[fixture:shareUrl] Using preset URL: ${presetUrl}`);
        await use(presetUrl);
        return;
      }

      const ctx = await browser.newContext({ storageState: WORKER_AUTH_FILE });
      const page = await ctx.newPage();
      try {
        // Create a task first
        await page.goto("/task", {
          timeout: 120_000,
          waitUntil: "domcontentloaded",
        });
        if (page.url().includes(SIGN_IN_PATH)) {
          await reAuthenticate(page, { authFile: WORKER_AUTH_FILE, targetLocale: computedDefaultLocale() });
          await page.goto("/task", {
            timeout: 120_000,
            waitUntil: "domcontentloaded",
          });
        }
        await ctx.storageState({ path: WORKER_AUTH_FILE });

        const textarea = page.getByRole("textbox", {
          name: i18nRegex("chatbot.placeholder"),
        });
        await textarea.waitFor({ state: "visible", timeout: 30_000 });
        await textarea.click();
        await textarea.pressSequentially("用 Python 写一个 hello world", {
          delay: 50,
        });
        const submitBtn = page.getByRole("button", {
          name: i18nRegex("toolForms.clarifyQuestion.submit", { exact: true }),
        });
        await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
        await submitBtn.click({ timeout: 30_000 });
        await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

        // Wait for task completion
        const completedIndicator = page.getByText(
          i18nRegex("chatbot.completed"),
        );
        await waitForResultWithClarification(
          page,
          completedIndicator,
          "请直接编写代码",
        );

        // Click share button (lucide-share2 icon)
        const shareBtn = page
          .locator("button")
          .filter({
            has: page.locator("svg.lucide-share2, svg.lucide-share-2"),
          })
          .first();
        await shareBtn.waitFor({ state: "visible", timeout: 15_000 });
        await shareBtn.click();

        // Wait for share dialog
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ state: "visible", timeout: 10_000 });

        // Click "创建分享链接" if link doesn't already exist
        const copyBtn = dialog.getByRole("button", {
          name: i18nRegex("chatbot.copyLink"),
        });
        const createBtn = dialog.getByRole("button", {
          name: i18nRegex("chatbot.createShareLink"),
        });
        const hasLink = await copyBtn
          .isVisible({ timeout: 2_000 })
          .catch(() => false);

        if (!hasLink) {
          await createBtn.click({ timeout: 10_000 });
          await copyBtn.waitFor({ state: "visible", timeout: 15_000 });
        }

        // Extract the share URL from the dialog text
        const shareText = await dialog
          .locator("text=/\\/share\\//")
          .textContent({ timeout: 5_000 });
        const sharePath = shareText
          ? new URL(shareText.trim()).pathname +
            new URL(shareText.trim()).search
          : "";

        if (!sharePath)
          throw new Error("Failed to extract share URL from dialog");
        console.log(`[fixture:shareUrl] Created share URL: ${sharePath}`);

        // Close dialog
        await dialog
          .getByRole("button", { name: "Close" })
          .click()
          .catch(() => page.keyboard.press("Escape"));

        await use(sharePath);
      } finally {
        await ctx.close().catch(() => {});
      }
    },
    { scope: "worker", timeout: 600_000 },
  ],

  taskWithToolChainUrl: [
    async ({ browser }, use) => {
      const presetUrl =
        process.env.E2E_TASK_WITH_TOOL_CHAIN_URL ||
        readTestData("taskWithToolChainUrl");
      if (presetUrl) {
        console.log(
          `[fixture:taskWithToolChainUrl] Using preset URL: ${presetUrl}`,
        );
        await use(presetUrl);
        return;
      }

      const ctx = await browser.newContext({ storageState: WORKER_AUTH_FILE });
      const page = await ctx.newPage();
      try {
        await page.goto("/task", {
          timeout: 120_000,
          waitUntil: "domcontentloaded",
        });
        if (page.url().includes(SIGN_IN_PATH)) {
          await reAuthenticate(page, { authFile: WORKER_AUTH_FILE, targetLocale: computedDefaultLocale() });
          await page.goto("/task", {
            timeout: 120_000,
            waitUntil: "domcontentloaded",
          });
        }
        await ctx.storageState({ path: WORKER_AUTH_FILE });
        await page.waitForLoadState("domcontentloaded");
        const textarea = page.getByRole("textbox", {
          name: i18nRegex("chatbot.placeholder"),
        });
        await textarea.waitFor({ state: "visible", timeout: 30_000 });
        await textarea.click();
        await textarea.pressSequentially(
          '请帮我完成一个关于"2025年全球AI大模型市场"的综合研究任务。' +
            "不需要问我问题，直接开始执行，最终必须交付以下 6 种格式的文件（缺一不可）：" +
            "1) 一个 .xlsx 表格文件，内容为头部AI公司对比数据；" +
            "2) 一个 .pptx 演示文件，2页，概述市场格局；" +
            "3) 一个 .pdf 报告文件，总结研究发现；" +
            "4) 一个 .docx 文档文件，详细研究摘要；" +
            "5) 一个 .png 图片文件，用柱状图展示公司融资额对比；" +
            "6) 一个 .json 数据文件，包含公司统计的结构化数据。" +
            "请先搜索相关信息，再逐一生成以上所有文件，确保 6 个文件全部交付。",
          { delay: 50 },
        );
        const submitBtn = page.getByRole("button", {
          name: i18nRegex("toolForms.clarifyQuestion.submit", { exact: true }),
        });
        await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
        await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
        await submitBtn.click({ timeout: 30_000 });
        await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
        await page.waitForTimeout(3000);
        const completedIndicator = page.getByText(
          i18nRegex("chatbot.completed"),
        );
        await waitForResultWithClarification(
          page,
          completedIndicator,
          "请直接开始，使用默认设置",
        );
        await page.waitForTimeout(3000);
        console.log(
          `[fixture:taskWithToolChainUrl] Task completed: ${page.url()}`,
        );
        await use(new URL(page.url()).pathname);
      } finally {
        await ctx.close().catch(() => {});
      }
    },
    { scope: "worker", timeout: 600_000 },
  ],
});

export { expect };
