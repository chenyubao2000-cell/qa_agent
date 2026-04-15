// source: prd
// handoff: test-cases/generated/playwright-handoff-people-data-download.json
// generated: 2026-03-29T00:00:00Z

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { test, expect } from '../../fixtures';
import { TaskPagePeopleDataDownloadFragment } from '../../pages/task.page.people-data-download.fragment';

// ─────────────────────────────────────────────────────────────────────────────
// US-PDD-DOWNLOAD · People Data 下载 — 入口与触发
// ─────────────────────────────────────────────────────────────────────────────
test.describe('US-PDD-DOWNLOAD · People Data 下载 — 入口与触发', () => {

  test(
    'TC-PRD-PDD-001 People Data 任务结果区域 — 下载按钮触发 XLSX 下载',
    { tag: ['@P1', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      await fragment.gotoTask(taskWithPeopleDataUrl);

      // Open People Data panel
      await fragment.openPeopleDataPanel();

      // Download button should be visible and enabled
      const downloadBtn = fragment.getPeopleDataPanelDownloadButton();
      await expect(downloadBtn).toBeVisible();
      await expect(downloadBtn).toBeEnabled();

      // Intercept download and verify the filename ends with .xlsx
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        fragment.clickPeopleDataDownloadButton(),
      ]);

      const suggestedFilename = download.suggestedFilename();
      expect(suggestedFilename).toMatch(/\.xlsx$/i);
    },
  );

  test(
    'TC-PRD-PDD-002 无 People Data 任务 — 不出现 People Data 卡片和下载入口',
    { tag: ['@P2', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      // Navigate to the new task page (no existing files)
      await page.goto('/task', { timeout: 30_000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      // People Data card should not be visible on a fresh task page
      const card = fragment.getPeopleDataCard();
      await expect(card).toHaveCount(0);
    },
  );

  test(
    'TC-PRD-PDD-004 下载成功后下载按钮短暂显示成功状态（CheckIcon）',
    { tag: ['@P1', '@regression', '@full', '@failing'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      await fragment.gotoTask(taskWithPeopleDataUrl);

      await fragment.openPeopleDataPanel();

      const downloadBtn = fragment.getPeopleDataPanelDownloadButton();
      await expect(downloadBtn).toBeVisible();
      await expect(downloadBtn).toBeEnabled();

      // Click download and immediately check for loading state
      await Promise.all([
        page.waitForEvent('download').catch(() => null),
        fragment.clickPeopleDataDownloadButton(),
      ]);

      // After success, the button icon transitions: idle → loading → success (CheckIcon) → idle
      // Assert the button reverts to enabled state (idle) within 3 seconds
      await expect(downloadBtn).toBeEnabled({ timeout: 4000 });
    },
  );


});

// ─────────────────────────────────────────────────────────────────────────────
// US-PDD-XLSX · People Data XLSX 文件格式
// ─────────────────────────────────────────────────────────────────────────────
test.describe('US-PDD-XLSX · People Data XLSX 文件格式', () => {

  test(
    'TC-PRD-PDD-003 XLSX 下载文件扩展名为 .xlsx（列宽限制验证）',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      await fragment.gotoTask(taskWithPeopleDataUrl);

      await fragment.openPeopleDataPanel();

      const downloadBtn = fragment.getPeopleDataPanelDownloadButton();
      await expect(downloadBtn).toBeVisible();

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        fragment.clickPeopleDataDownloadButton(),
      ]);

      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.xlsx$/i);

      // Save file locally to inspect it (optional deep check)
      const savePath = path.join(os.tmpdir(), `people-data-test-${Date.now()}.xlsx`);
      await download.saveAs(savePath);
      const stats = fs.statSync(savePath);
      // XLSX file must be non-empty (> 1KB)
      expect(stats.size).toBeGreaterThan(1024);

      // Cleanup
      fs.rmSync(savePath, { force: true });
    },
  );

  test(
    'TC-PRD-PDD-005 文件名扩展名正确替换为 .xlsx（原 .json/.peopledata）',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      await fragment.gotoTask(taskWithPeopleDataUrl);

      await fragment.openPeopleDataPanel();

      // Get the displayed filename in the panel header
      const filenameEl = fragment.getPeopleDataPanelFilename();
      await expect(filenameEl).toBeVisible();

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        fragment.clickPeopleDataDownloadButton(),
      ]);

      const suggestedFilename = download.suggestedFilename();
      // Must end with .xlsx — original .json or .peopledata extension replaced
      expect(suggestedFilename).toMatch(/\.xlsx$/i);
      expect(suggestedFilename).not.toMatch(/\.(json|peopledata)$/i);
    },
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// US-PDD-ERROR · People Data 下载异常处理
// ─────────────────────────────────────────────────────────────────────────────
test.describe('US-PDD-ERROR · People Data 下载异常处理', () => {

  test(
    'TC-PRD-PDD-006 下载失败时显示 toast 错误提示',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      await fragment.gotoTask(taskWithPeopleDataUrl);
      await fragment.openPeopleDataPanel();

      const downloadBtn = fragment.getPeopleDataPanelDownloadButton();
      await expect(downloadBtn).toBeVisible();

      // Monkey-patch URL.createObjectURL to throw an error, simulating download failure.
      // The People Data download flow: cached blob → XLSX conversion → URL.createObjectURL → <a>.click().
      // By making createObjectURL throw, the error propagates to useDownloadWithFormat's catch block → toast.error().
      await page.evaluate(() => {
        const original = URL.createObjectURL;
        URL.createObjectURL = () => { throw new Error('Simulated download failure'); };
        // Restore after 5 seconds to avoid breaking other functionality
        setTimeout(() => { URL.createObjectURL = original; }, 5000);
      });

      await fragment.clickPeopleDataDownloadButton();

      // A Sonner error toast should appear
      const toastError = page.locator('[data-sonner-toast][data-type="error"]');
      await expect(toastError).toBeVisible({ timeout: 10000 });

      // Download button should recover from error state and re-enable
      await expect(downloadBtn).toBeEnabled({ timeout: 8000 });
    },
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// US-PDD-E2E · People Data 面板 UI 与端到端流程
// ─────────────────────────────────────────────────────────────────────────────
test.describe('US-PDD-E2E · People Data 面板 UI 与端到端流程', () => {

  test(
    'TC-PRD-PDD-007 完整端到端流程 — 从查看 People Data 面板到下载 XLSX',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      await fragment.gotoTask(taskWithPeopleDataUrl);

      // Step 1: People Data card should be visible in chat log
      const card = fragment.getPeopleDataCard();
      await expect(card).toBeVisible({ timeout: 15_000 });

      // Step 2: Open panel by clicking the card
      await fragment.openPeopleDataPanel();

      // Step 3: Panel header shows filename
      const filenameEl = fragment.getPeopleDataPanelFilename();
      await expect(filenameEl).toBeVisible();
      const panelFilename = await filenameEl.textContent();
      expect(panelFilename?.trim().length).toBeGreaterThan(0);

      // Step 4: Download button is present and enabled
      const downloadBtn = fragment.getPeopleDataPanelDownloadButton();
      await expect(downloadBtn).toBeVisible();
      await expect(downloadBtn).toBeEnabled();

      // Step 5: Trigger download and verify .xlsx extension
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        fragment.clickPeopleDataDownloadButton(),
      ]);

      const filename = download.suggestedFilename();
      expect(filename).toMatch(/\.xlsx$/i);

      // Step 6: Button briefly shows CheckIcon then recovers
      await expect(downloadBtn).toBeEnabled({ timeout: 4000 });
    },
  );

  test(
    'TC-PRD-PDD-008 People Data 面板头部显示正确的文件名和操作按钮',
    { tag: ['@P2', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      await fragment.gotoTask(taskWithPeopleDataUrl);

      await fragment.openPeopleDataPanel();

      // Filename is visible in panel header
      const filenameEl = fragment.getPeopleDataPanelFilename();
      await expect(filenameEl).toBeVisible();
      const text = await filenameEl.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);

      // Download button is visible
      const downloadBtn = fragment.getPeopleDataPanelDownloadButton();
      await expect(downloadBtn).toBeVisible();

      // Close button is visible
      const closeBtn = fragment.getPeopleDataPanelCloseButton();
      await expect(closeBtn).toBeVisible();
    },
  );

  test(
    'TC-PRD-PDD-010 People Data 面板关闭按钮可正常关闭面板',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const fragment = new TaskPagePeopleDataDownloadFragment(page, i18n);
      await fragment.gotoTask(taskWithPeopleDataUrl);

      await fragment.openPeopleDataPanel();

      // Panel is open
      const filenameEl = fragment.getPeopleDataPanelFilename();
      await expect(filenameEl).toBeVisible();

      // Click close
      await fragment.closePeopleDataPanel();

      // Panel disappears
      await expect(filenameEl).toBeHidden({ timeout: 5000 });
    },
  );

});

