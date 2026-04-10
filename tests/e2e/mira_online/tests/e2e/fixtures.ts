import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ── i18n fixture (auto-generated when APP_LANGUAGES is set) ──
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';

const i18nMessages: Record<string, Record<string, any>> = {
  en: enMessages,
  zh: zhMessages,
};

export type I18n = { t: (key: string) => string; locale: string };

// ── Session guard: auto re-authenticate on expiry ──
const AUTH_FILE = 'playwright/.auth/user.json';
const SIGN_IN_PATH = '/sign-in';

async function reAuthenticate(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Session expired but no credentials in env');

  console.log('[session-guard] Session expired, re-authenticating...');

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(email);

  const continueBtn = page.getByRole('button', { name: /^Continue$|^继续$/i });
  await continueBtn.click({ timeout: 30_000 });

  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
  await passwordInput.fill(password);
  await continueBtn.click({ timeout: 30_000 });

  await page.waitForURL('**/task**', { timeout: 60_000 });
  console.log('[session-guard] Re-authentication successful');

  await page.context().storageState({ path: AUTH_FILE });
}

// ── Worker-scope fixtures for expensive AI task creation ──

type TestDataFixtures = {
  taskWithFilesUrl: string;
  taskWithPeopleDataUrl: string;
};

/** Auto-dismiss Mira's clarification form if it appears before the target element. */
async function waitForResultWithClarification(
  page: Page,
  targetLocator: import('@playwright/test').Locator,
  fallbackFill = '软件工程师',
) {
  const clarificationBtn = page.locator('[role="log"] button').filter({ hasText: /^提交$|^Submit$/ });
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
          await inputs.nth(j).dispatchEvent('input');
        }
      }
      // Click first unchecked radio in each group
      const radios = page.locator('[role="log"] [role="radiogroup"]');
      const radioCount = await radios.count();
      for (let j = 0; j < radioCount; j++) {
        const checked = await radios.nth(j).locator('[role="radio"][data-state="checked"]').count();
        if (checked === 0) {
          await radios.nth(j).locator('[role="radio"]').first().click().catch(() => {});
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
          // Submit button stuck disabled — bypass by replying in chat input
          console.log(`[fixture] Submit stuck disabled, bypassing via chat at ${i * 5}s`);
          const chatInput = page.locator('textarea').last();
          await chatInput.fill('请直接开始创建，使用默认设置');
          await page.getByRole('button', { name: 'Submit' }).click({ timeout: 5_000 }).catch(() => {});
          disabledCount = 0;
        }
      }
    }
    await page.waitForTimeout(5000);
  }

  console.log(`[fixture] Polling exhausted (300s), doing final wait...`);
  await targetLocator.waitFor({ state: 'visible', timeout: 300_000 });
}

export const test = base.extend<{ i18n: I18n; ensureAuthenticated: void }, TestDataFixtures>({
  ensureAuthenticated: [async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: any) => {
      const response = await originalGoto(url, options);
      // Handle sign-in redirect
      if (!url.includes(SIGN_IN_PATH) && page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page);
        return originalGoto(url, options);
      }
      // Handle "no permission" error page (stale session — cookie exists but server rejected)
      const noPermission = await page.locator('h1').filter({ hasText: /无权限访问|Access Denied|No Permission/ })
        .isVisible({ timeout: 1_000 }).catch(() => false);
      if (noPermission) {
        console.log('[session-guard] "No permission" detected, re-authenticating...');
        await originalGoto(`${SIGN_IN_PATH}`, options);
        await reAuthenticate(page);
        return originalGoto(url, options);
      }
      return response;
    };
    await use();
  }, { auto: true }],

  i18n: [async ({}, use, testInfo) => {
    const locale = testInfo.project.name.replace('e2e-', '') || 'en';
    const dict = i18nMessages[locale] ?? i18nMessages['en'];
    const t = (key: string): string => {
      const parts = key.split('.');
      let val: any = dict;
      for (const p of parts) { val = val?.[p]; }
      return typeof val === 'string' ? val : key;
    };
    await use({ t, locale });
  }, { scope: 'worker' }],

  taskWithFilesUrl: [async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: AUTH_FILE });
    const page = await ctx.newPage();
    try {
      await page.goto('/task', { timeout: 30_000 });
      if (page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page);
        await page.goto('/task', { timeout: 30_000 });
      }
      // Sync auth state so test contexts get fresh cookies
      await ctx.storageState({ path: AUTH_FILE });
      await page.waitForLoadState('domcontentloaded');
      const textarea = page.locator('textarea');
      await textarea.waitFor({ state: 'visible', timeout: 15_000 });
      await textarea.fill('请帮我创建以下文件：1) 一个关于天气的PPT演示文稿 2) 一个工作报告PDF 3) 搜索苏州的候选人数据');
      await page.getByRole('button', { name: 'Submit' }).click({ timeout: 10_000 });
      await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

      const fileCard = page.locator('[role="log"] div[role="button"]').filter({
        has: page.locator('button'),
        hasText: /\.pptx|\.pdf|\.xlsx|PPT|PDF/i,
      }).first();
      await waitForResultWithClarification(page, fileCard);
      await page.waitForTimeout(3000);
      await use(new URL(page.url()).pathname);
    } finally {
      await ctx.close().catch(() => {});
    }
  }, { scope: 'worker', timeout: 480_000 }],

  taskWithPeopleDataUrl: [async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: AUTH_FILE });
    const page = await ctx.newPage();
    try {
      await page.goto('/task', { timeout: 30_000 });
      if (page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page);
        await page.goto('/task', { timeout: 30_000 });
      }
      // Sync auth state so test contexts get fresh cookies
      await ctx.storageState({ path: AUTH_FILE });
      await page.waitForLoadState('domcontentloaded');
      const textarea = page.locator('textarea');
      await textarea.waitFor({ state: 'visible', timeout: 15_000 });
      await textarea.fill('帮我搜索苏州的软件工程师候选人');
      await page.getByRole('button', { name: 'Submit' }).click({ timeout: 10_000 });
      await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

      const peopleDataCard = page.locator('[role="log"] div[role="button"]').filter({
        hasText: /People Data|人才数据/i,
      }).first();
      await waitForResultWithClarification(page, peopleDataCard, '软件工程师，3年以上经验');
      await page.waitForTimeout(2000);
      await use(new URL(page.url()).pathname);
    } finally {
      await ctx.close().catch(() => {});
    }
  }, { scope: 'worker', timeout: 360_000 }],
});

export { expect };
