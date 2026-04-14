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

import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const AUTH_FILE = 'playwright/.auth/user.json';
const SIGN_IN_PATH = '/sign-in';
const TEST_DATA_PATH = path.join(__dirname, '..', '..', 'playwright', '.test-data.json');
const DATA_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Helpers ──

function readTestData(): Record<string, string> {
  try {
    if (!fs.existsSync(TEST_DATA_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(TEST_DATA_PATH, 'utf-8'));
    // Check if data is expired
    if (raw._createdAt && Date.now() - raw._createdAt > DATA_MAX_AGE_MS) {
      console.log('[data-setup] Cached data expired, will recreate');
      return {};
    }
    return raw;
  } catch { return {}; }
}

function writeTestData(data: Record<string, string>) {
  const dir = path.dirname(TEST_DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(TEST_DATA_PATH, JSON.stringify({ _createdAt: Date.now(), ...data }, null, 2));
}

function needsCreation(key: string, envVar: string, cached: Record<string, string>): boolean {
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

async function reAuthenticate(page: import('@playwright/test').Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('No credentials in env');
  console.log('[data-setup] Re-authenticating...');
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
  await page.context().storageState({ path: AUTH_FILE });
}

async function ensureAuthenticated(page: import('@playwright/test').Page): Promise<void> {
  if (page.url().includes(SIGN_IN_PATH)) {
    await reAuthenticate(page);
  }
}

/** Submit a prompt and wait for task completion. Returns the task pathname. */
async function createTask(
  page: import('@playwright/test').Page,
  prompt: string,
  waitIndicator: RegExp = /任务已完成|Task completed/,
  fallbackFill = '请直接开始',
): Promise<string> {
  await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
  await ensureAuthenticated(page);
  await page.context().storageState({ path: AUTH_FILE });

  const textarea = page.getByRole('textbox', { name: /请输入|Ask anything/i });
  await textarea.waitFor({ state: 'visible', timeout: 30_000 });
  await textarea.click();
  await textarea.pressSequentially(prompt, { delay: 30 });
  const submitBtn = page.getByRole('button', { name: /^Submit$|^提交$/i });
  await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
  await submitBtn.click({ timeout: 30_000 });
  await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
  await page.waitForTimeout(3000);

  // Wait for completion with clarification handling
  const target = page.getByText(waitIndicator);
  const clarificationBtn = page.locator('[role="log"] button').filter({ hasText: /^提交$|^Submit$/ });
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
      await page.reload({ timeout: 30_000, waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.context().storageState({ path: AUTH_FILE }).catch(() => {});
    }
  }
  await target.waitFor({ state: 'visible', timeout: 300_000 });
  await page.waitForTimeout(3000);
  return new URL(page.url()).pathname;
}

// ── Setup test ──

/** Run a task creation in its own browser context (isolated page). */
async function createTaskInContext(
  browser: import('@playwright/test').Browser,
  key: string,
  prompt: string,
  waitIndicator: RegExp = /任务已完成|Task completed/,
  fallbackFill = '请直接开始',
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
async function createShareInContext(browser: import('@playwright/test').Browser): Promise<string> {
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  try {
    console.log('[data-setup] Creating shareUrl...');
    await page.goto('/task', { timeout: 120_000, waitUntil: 'domcontentloaded' });
    await ensureAuthenticated(page);
    const textarea = page.getByRole('textbox', { name: /请输入|Ask anything/i });
    await textarea.waitFor({ state: 'visible', timeout: 30_000 });
    await textarea.click();
    await textarea.pressSequentially('用 Python 写一个 hello world', { delay: 50 });
    const submitBtn = page.getByRole('button', { name: /^Submit$|^提交$/i });
    await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await submitBtn.click({ timeout: 30_000 });
    await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
    const completedIndicator = page.getByText(/任务已完成|Task completed/);
    await completedIndicator.waitFor({ state: 'visible', timeout: 300_000 });

    // Open share dialog
    const shareBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-share2, svg.lucide-share-2'),
    }).first();
    await shareBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await shareBtn.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    const copyBtn = dialog.getByRole('button', { name: /复制链接|Copy link/i });
    const createBtn = dialog.getByRole('button', { name: /创建分享链接|Create share link/i });
    const hasLink = await copyBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!hasLink) {
      await createBtn.click({ timeout: 10_000 });
      await copyBtn.waitFor({ state: 'visible', timeout: 15_000 });
    }

    const shareText = await dialog.locator('text=/\\/share\\//').textContent({ timeout: 5_000 });
    const sharePath = shareText ? new URL(shareText.trim()).pathname + new URL(shareText.trim()).search : '';
    if (!sharePath) throw new Error('Failed to extract share URL');
    console.log(`[data-setup] shareUrl: ${sharePath}`);
    return sharePath;
  } finally {
    await ctx.close().catch(() => {});
  }
}

setup('create test data', async ({ browser }) => {
  const cached = readTestData();
  const results: Record<string, string> = { ...cached };

  // Build parallel task list — each gets its own browser context
  const tasks: Array<{ key: string; promise: Promise<string> }> = [];

  if (needsCreation('taskWithCodeUrl', 'E2E_TASK_WITH_CODE_URL', cached)) {
    tasks.push({ key: 'taskWithCodeUrl', promise: createTaskInContext(browser, 'taskWithCodeUrl', '用 Python 写一个快速排序算法', /任务已完成|Task completed/, '请直接编写代码') });
  }
  if (needsCreation('taskWithFilesUrl', 'E2E_TASK_WITH_FILES_URL', cached)) {
    tasks.push({ key: 'taskWithFilesUrl', promise: createTaskInContext(browser, 'taskWithFilesUrl', '帮我写一个简单的PPT，主题是自我介绍，3页就够，不需要问我问题直接创建', /任务已完成|Task completed/, '请直接创建文件') });
  }
  if (needsCreation('taskWithPeopleDataUrl', 'E2E_TASK_WITH_PEOPLE_DATA_URL', cached)) {
    tasks.push({ key: 'taskWithPeopleDataUrl', promise: createTaskInContext(browser, 'taskWithPeopleDataUrl', '帮我搜索苏州的软件工程师候选人，不需要问我问题直接搜索', /People Data|人才数据/i, '软件工程师，3年以上经验') });
  }
  if (needsCreation('taskWithToolChainUrl', 'E2E_TASK_WITH_TOOL_CHAIN_URL', cached)) {
    tasks.push({ key: 'taskWithToolChainUrl', promise: createTaskInContext(browser, 'taskWithToolChainUrl',
      '请帮我完成以下综合任务，这是一个工具测试场景，主题为"2025年全球AI大模型市场"。请用 write_todos 管理以下所有步骤，并在最后用 complete 统一交付所有文件：用 search 搜索"2025 AI LLM market landscape"，取3条结果。用 company_search 搜索全球头部AI大模型公司，取5家。用 people_search 搜索具有LLM研究背景的技术专家，取3人；用 evaluate_people 评估（岗位：AI研究科学家，要求大模型预训练经验）；用 generate_people_data 生成候选人文件。用 code_interpreter 写一段Python代码，对上述5家公司做简单统计。用 sb_command_execute 执行 ls -la。生成以下文件：sb_file_create .md研究摘要；sb_file_rewrite 重写.md；sb_file_edit 追加结论；sb_xlsx_create 公司表格；sb_pptx_create 2页PPT；sb_pdf_create PDF报告；sb_docx_create Word文档；sb_image_create 柱状图展示融资额',
      /任务已完成|Task completed/, '请直接开始，使用默认设置') });
  }
  if (needsCreation('shareUrl', 'E2E_SHARE_URL', cached)) {
    tasks.push({ key: 'shareUrl', promise: createShareInContext(browser) });
  }

  if (tasks.length === 0) {
    console.log('[data-setup] All data cached, nothing to create.');
    return;
  }

  console.log(`[data-setup] Creating ${tasks.length} resources in parallel...`);

  // Run all in parallel, collect results
  const settled = await Promise.allSettled(tasks.map(t => t.promise));
  let created = 0;
  for (let i = 0; i < tasks.length; i++) {
    const { key } = tasks[i];
    const result = settled[i];
    if (result.status === 'fulfilled') {
      results[key] = result.value;
      created++;
    } else {
      console.error(`[data-setup] FAILED ${key}: ${result.reason}`);
    }
  }

  writeTestData(results);
  console.log(`[data-setup] Done. Created ${created}/${tasks.length}, ${Object.keys(results).length - 1} total cached.`);
});
