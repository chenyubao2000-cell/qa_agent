// source: prd
// handoff: test-cases/generated/playwright-handoff-view-all-files.json
// generated: 2026-03-29T00:00:00Z
// fixed: 2026-03-29 via CDP exploration

import { test, expect } from '../../fixtures';
import { TaskPage } from '../../pages/task.page';
import { ViewAllFilesFragment } from '../../pages/task.page.view-all-files.fragment';

/** Wait for the task page to fully load (chat log populated, toolbar visible) */
async function waitForTaskReady(page: import('@playwright/test').Page, taskUrl: string) {
  await page.goto(taskUrl, { timeout: 60_000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('[role="log"]').waitFor({ state: 'visible', timeout: 20_000 });
}

// US-VF-ENTRY
test.describe('US-VF-ENTRY - View All Files -- entry visibility', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('TC-PRD-VF-001: toolbar entry button visible when task has files', {
    tag: ['@P0', '@smoke', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await expect(vaf.getViewAllFilesToolbarBtn()).toBeVisible({ timeout: 30_000 });
  });

  test('TC-PRD-VF-007: result area button visible in chat with files', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await expect(vaf.getViewAllFilesResultBtn()).toBeVisible({ timeout: 15_000 });
  });
});

// US-VF-MODAL
test.describe('US-VF-MODAL - View All Files -- panel open and close', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('TC-PRD-VF-003: clicking toolbar button opens files panel', {
    tag: ['@P0', '@smoke', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await expect(vaf.getFilesPanelTitle()).toBeVisible();
    await expect(vaf.getFilesPanelTitle()).toContainText(/此任务中的所有文件|All files in this task/i);
  });

  test('TC-PRD-VF-004: clicking result area button opens files panel', {
    tag: ['@P0', '@smoke', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesResultBtn().waitFor({ state: 'visible', timeout: 15_000 });
    await vaf.clickViewAllFilesResult();
    await vaf.waitForFilesPanelOpen();
    await expect(vaf.getFilesPanelTitle()).toBeVisible();
  });

  test('TC-PRD-VF-005: files panel shows file cards after opening', {
    tag: ['@P0', '@smoke', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.waitForFileCardsLoaded();
    await expect(vaf.getFileCards().first()).toBeVisible();
  });

  test('TC-PRD-VF-014: close button dismisses files panel', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.closeFilesPanel();
    await vaf.waitForFilesPanelClosed();
    await expect(vaf.getFilesPanelTitle()).toBeHidden();
  });

  test('TC-PRD-VF-019: batch download icon button visible in panel header', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await expect(vaf.getBatchDownloadIconBtn()).toBeVisible();
  });
});

// US-VF-BATCH
test.describe('US-VF-BATCH - View All Files -- batch download', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('TC-PRD-VF-011: clicking batch download icon enters selection mode', {
    tag: ['@P0', '@smoke', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.waitForFileCardsLoaded();
    await vaf.clickBatchDownloadIcon();
    await expect(vaf.getSelectAllBtn()).toBeVisible({ timeout: 5_000 });
    await expect(vaf.getCancelSelectionBtn()).toBeVisible();
  });

  test('TC-PRD-VF-008: clicking select all checks all file checkboxes', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.waitForFileCardsLoaded();
    await vaf.clickBatchDownloadIcon();
    await vaf.getSelectAllBtn().waitFor({ state: 'visible', timeout: 5_000 });
    await vaf.clickSelectAll();
    const checkboxes = vaf.getFileCheckboxes();
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
  });

  test('TC-PRD-VF-009: selecting a file enables batch download button', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.waitForFileCardsLoaded();
    await vaf.clickBatchDownloadIcon();
    await vaf.getSelectAllBtn().waitFor({ state: 'visible', timeout: 5_000 });
    await vaf.selectFileAtIndex(0);
    await expect(vaf.getBatchDownloadFooterBtn()).toBeEnabled();
  });

  test('TC-PRD-VF-012: clicking cancel exits selection mode', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.waitForFileCardsLoaded();
    await vaf.clickBatchDownloadIcon();
    await vaf.getSelectAllBtn().waitFor({ state: 'visible', timeout: 5_000 });
    await vaf.clickCancelSelection();
    // After cancel, the files panel should revert to browse mode (no select all / cancel buttons)
    await expect(vaf.getSelectAllBtn()).toBeHidden({ timeout: 5_000 });
  });

  test('TC-PRD-VF-020: clicking select all again deselects all files', {
    tag: ['@P2', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.waitForFileCardsLoaded();
    await vaf.clickBatchDownloadIcon();
    await vaf.getSelectAllBtn().waitFor({ state: 'visible', timeout: 5_000 });
    await vaf.clickSelectAll();
    // Click select all again to deselect
    await vaf.clickSelectAll();
    const checkboxes = vaf.getFileCheckboxes();
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).not.toBeChecked();
    }
  });

  test('TC-PRD-VF-021: individual file download button is visible', {
    tag: ['@P2', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.waitForFileCardsLoaded();
    // In browse mode, each file card has a "下载文件" button
    const downloadBtns = page.locator('button[title="下载"], button[title="Download"]');
    await expect(downloadBtns.first()).toBeVisible();
  });
});

// US-VF-E2E
test.describe('US-VF-E2E - View All Files -- end-to-end scenarios', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('TC-PRD-VF-013: full batch download flow select files and trigger download', {
    tag: ['@P1', '@regression', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();
    await vaf.waitForFileCardsLoaded();

    await vaf.clickBatchDownloadIcon();
    await expect(vaf.getSelectAllBtn()).toBeVisible({ timeout: 5_000 });
    await vaf.clickSelectAll();
    await expect(vaf.getBatchDownloadFooterBtn()).toBeEnabled();
    await vaf.clickBatchDownloadFooter();

    // After batch download, panel should still be visible
    await expect(vaf.getFilesPanelContainer()).toBeVisible();
  });

  test('TC-PRD-VF-016: navigating away closes files panel', {
    tag: ['@P2', '@full'],
  }, async ({ page, i18n, taskWithFilesUrl }) => {
    const taskPage = new TaskPage(page, i18n);
    const vaf = new ViewAllFilesFragment(page, i18n);
    await waitForTaskReady(page,taskWithFilesUrl);
    await vaf.getViewAllFilesToolbarBtn().waitFor({ state: 'visible', timeout: 30_000 });
    await vaf.clickViewAllFilesToolbar();
    await vaf.waitForFilesPanelOpen();

    // Navigate away
    await taskPage.goto();
    await expect(vaf.getFilesPanelTitle()).toBeHidden({ timeout: 10_000 });
  });
});

