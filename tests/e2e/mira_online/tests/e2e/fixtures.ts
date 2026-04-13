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
// See: skills/playwright-script-generator/references/session-guard.md
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

  await page.waitForURL('**/task**', { timeout: 60_000, waitUntil: 'domcontentloaded' });
  console.log('[session-guard] Re-authentication successful');

  await page.context().storageState({ path: AUTH_FILE });
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
  targetLocator: import('@playwright/test').Locator,
  fallbackFill = '软件工程师',
  /** Persist cookies periodically so session_data stays fresh across long waits */
  authFile = AUTH_FILE,
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
          console.log(`[fixture] Submit stuck disabled, bypassing via chat at ${i * 5}s`);
          const chatInput = page.locator('textarea').last();
          await chatInput.fill('请直接开始创建，使用默认设置');
          await page.getByRole('button', { name: /^Submit$|^提交$/i }).click({ timeout: 5_000 }).catch(() => {});
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
      await page.reload({ timeout: 30_000, waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.context().storageState({ path: authFile }).catch(() => {});
    }
  }

  console.log(`[fixture] Polling exhausted (300s), doing final wait...`);
  await targetLocator.waitFor({ state: 'visible', timeout: 300_000 });
}

export const test = base.extend<{ i18n: I18n; ensureAuthenticated: void }, TestDataFixtures>({
  ensureAuthenticated: [async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: any) => {
      const response = await originalGoto(url, options);
      if (page.url().includes(SIGN_IN_PATH)) {
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
      await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
      if (page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page);
        await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
      }
      await ctx.storageState({ path: AUTH_FILE });
      await page.waitForLoadState('domcontentloaded');
      const textarea = page.getByRole('textbox', { name: /请输入|Ask anything/i });
      await textarea.waitFor({ state: 'visible', timeout: 30_000 });
      await textarea.click();
      await textarea.pressSequentially('帮我写一个简单的PPT，主题是自我介绍，3页就够，不需要问我问题直接创建', { delay: 30 });
      const submitBtn = page.getByRole('button', { name: /^Submit$|^提交$/i });
      await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
      await submitBtn.click({ timeout: 30_000 });
      await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

      // Wait for task completion (file generation) — also handles clarification forms
      const completedIndicator = page.getByText(/任务已完成|Task completed/);
      await waitForResultWithClarification(page, completedIndicator, '请直接创建文件');
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
      await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
      if (page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page);
        await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
      }
      await ctx.storageState({ path: AUTH_FILE });
      await page.waitForLoadState('domcontentloaded');
      const textarea = page.getByRole('textbox', { name: /请输入|Ask anything/i });
      await textarea.waitFor({ state: 'visible', timeout: 30_000 });
      await textarea.click();
      await textarea.pressSequentially('帮我搜索苏州的软件工程师候选人，不需要问我问题直接搜索', { delay: 30 });
      const submitBtn = page.getByRole('button', { name: /^Submit$|^提交$/i });
      await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
      await submitBtn.click({ timeout: 30_000 });
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

  taskWithCodeUrl: [async ({ page }, use) => {
    // Fast path: use pre-existing task URL from env
    const presetUrl = process.env.E2E_TASK_WITH_CODE_URL;
    if (presetUrl) {
      console.log(`[fixture:taskWithCodeUrl] Using preset URL: ${presetUrl}`);
      await use(presetUrl);
      return;
    }

    // Use the test's own page (inherits storageState + Cloudflare cookies from config)
    await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    const textarea = page.getByRole('textbox', { name: /请输入|Ask anything/i });
    await textarea.waitFor({ state: 'visible', timeout: 30_000 });
    await textarea.click();
    await textarea.pressSequentially('用 Python 写一个快速排序算法', { delay: 50 });
    // Wait for Submit button to become enabled after input
    const submitBtn = page.getByRole('button', { name: /^Submit$|^提交$/i });
    await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click({ timeout: 30_000 });
    await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

    // Wait for task to be persisted to DB
    await page.waitForTimeout(3000);

    const completedIndicator = page.getByText(/任务已完成|Task completed/);
    await waitForResultWithClarification(page, completedIndicator, '请直接编写代码');
    await page.waitForTimeout(3000);
    await use(new URL(page.url()).pathname);
  }, { timeout: 480_000 }],

  shareUrl: [async ({ browser }, use) => {
    // Fast path: use pre-existing share URL from env
    const presetUrl = process.env.E2E_SHARE_URL;
    if (presetUrl) {
      console.log(`[fixture:shareUrl] Using preset URL: ${presetUrl}`);
      await use(presetUrl);
      return;
    }

    const ctx = await browser.newContext({ storageState: AUTH_FILE });
    const page = await ctx.newPage();
    try {
      // Create a task first
      await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
      if (page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page);
        await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
      }
      await ctx.storageState({ path: AUTH_FILE });

      const textarea = page.getByRole('textbox', { name: /请输入|Ask anything/i });
      await textarea.waitFor({ state: 'visible', timeout: 30_000 });
      await textarea.click();
      await textarea.pressSequentially('用 Python 写一个 hello world', { delay: 50 });
      const submitBtn = page.getByRole('button', { name: /^Submit$|^提交$/i });
      await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await submitBtn.click({ timeout: 30_000 });
      await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

      // Wait for task completion
      const completedIndicator = page.getByText(/任务已完成|Task completed/);
      await waitForResultWithClarification(page, completedIndicator, '请直接编写代码');

      // Click share button (lucide-share2 icon)
      const shareBtn = page.locator('button').filter({
        has: page.locator('svg.lucide-share2, svg.lucide-share-2'),
      }).first();
      await shareBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await shareBtn.click();

      // Wait for share dialog
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible', timeout: 10_000 });

      // Click "创建分享链接" if link doesn't already exist
      const copyBtn = dialog.getByRole('button', { name: /复制链接|Copy link/i });
      const createBtn = dialog.getByRole('button', { name: /创建分享链接|Create share link/i });
      const hasLink = await copyBtn.isVisible({ timeout: 2_000 }).catch(() => false);

      if (!hasLink) {
        await createBtn.click({ timeout: 10_000 });
        await copyBtn.waitFor({ state: 'visible', timeout: 15_000 });
      }

      // Extract the share URL from the dialog text
      const shareText = await dialog.locator('text=/\\/share\\//').textContent({ timeout: 5_000 });
      const sharePath = shareText ? new URL(shareText.trim()).pathname + new URL(shareText.trim()).search : '';

      if (!sharePath) throw new Error('Failed to extract share URL from dialog');
      console.log(`[fixture:shareUrl] Created share URL: ${sharePath}`);

      // Close dialog
      await dialog.getByRole('button', { name: 'Close' }).click().catch(() => page.keyboard.press('Escape'));

      await use(sharePath);
    } finally {
      await ctx.close().catch(() => {});
    }
  }, { scope: 'worker', timeout: 600_000 }],

  taskWithToolChainUrl: [async ({ page }, use) => {
    const presetUrl = process.env.E2E_TASK_WITH_TOOL_CHAIN_URL;
    if (presetUrl) {
      console.log(`[fixture:taskWithToolChainUrl] Using preset URL: ${presetUrl}`);
      await use(presetUrl);
      return;
    }

    // Same pattern as taskWithCodeUrl — uses test's own page (inherits storageState + channel from config)
    await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    const textarea = page.getByRole('textbox', { name: /请输入|Ask anything/i });
    await textarea.waitFor({ state: 'visible', timeout: 30_000 });
    await textarea.click();
    // Single-line prompt (pressSequentially treats \n as Enter)
    await textarea.pressSequentially('请帮我完成以下综合任务，这是一个工具测试场景，主题为"2025年全球AI大模型市场"。请用 write_todos 管理以下所有步骤，并在最后用 complete 统一交付所有文件：用 search 搜索"2025 AI LLM market landscape"，取3条结果。用 company_search 搜索全球头部AI大模型公司，取5家。用 people_search 搜索具有LLM研究背景的技术专家，取3人；用 evaluate_people 评估（岗位：AI研究科学家，要求大模型预训练经验）；用 generate_people_data 生成候选人文件。用 code_interpreter 写一段Python代码，对上述5家公司做简单统计。用 sb_command_execute 执行 ls -la。生成以下文件：sb_file_create .md研究摘要；sb_file_rewrite 重写.md；sb_file_edit 追加结论；sb_xlsx_create 公司表格；sb_pptx_create 2页PPT；sb_pdf_create PDF报告；sb_docx_create Word文档；sb_image_create 柱状图展示融资额', { delay: 50 });
    const submitBtn = page.getByRole('button', { name: /^Submit$|^提交$/i });
    await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
    await submitBtn.click({ timeout: 30_000 });
    await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });

    await page.waitForTimeout(3000);

    const completedIndicator = page.getByText(/任务已完成|Task completed/);
    await waitForResultWithClarification(page, completedIndicator, '请直接开始，使用默认设置');
    await page.waitForTimeout(3000);
    console.log(`[fixture:taskWithToolChainUrl] Task completed: ${page.url()}`);
    await use(new URL(page.url()).pathname);
  }, { timeout: 600_000 }],
});

export { expect };
