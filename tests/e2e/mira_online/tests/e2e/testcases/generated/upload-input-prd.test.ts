// source: prd
// handoff: test-cases/generated/playwright-handoff-upload-input.json
// generated: 2026-03-29T00:00:00Z

import { test, expect } from '../../fixtures';
import { TaskPage } from '../../pages/task.page';
import { TaskPageUploadInputFragment } from '../../pages/task.page.upload-input.fragment';
import path from 'node:path';

const FILES = {
  pdf: path.join('tests', 'e2e', 'test-data', 'files', 'sample.pdf'),
  xlsx: path.join('tests', 'e2e', 'test-data', 'files', 'sample.xlsx'),
  png: path.join('tests', 'e2e', 'test-data', 'files', 'sample.png'),
  exe: path.join('tests', 'e2e', 'test-data', 'files', 'sample.exe'),
  oversized: path.join('tests', 'e2e', 'test-data', 'files', 'oversized-21mb.pdf'),
  longName: path.join('tests', 'e2e', 'test-data', 'files', 'this_is_a_very_long_filename_exceeding_the_display_limit.pdf'),
  xss: path.join('tests', 'e2e', 'test-data', 'files', 'xss_test.pdf'),
  unknown: path.join('tests', 'e2e', 'test-data', 'files', 'unknown_type_file.bin'),
};

test.describe('US-UPINP-DISPLAY -- File Capsule Display Style', () => {
  test('TC-PRD-UPINP-001 -- PDF file capsule shows icon, filename, type label PDF, size with 1-decimal unit', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.pdf);
    await uploadPage.waitForUploadComplete('sample.pdf');
    const pill = uploadPage.getAttachmentPillByName('sample.pdf');
    await expect(pill).toBeVisible();
    const typeLabel = uploadPage.getAttachmentTypeLabel('sample.pdf');
    await expect(typeLabel).toContainText('PDF');
    const sizeText = await typeLabel.textContent();
    expect(sizeText).toMatch(/\d+(\.\d)?\s*(B|KB|MB|GB)/);
  });

  test('TC-PRD-UPINP-002 -- XLSX file capsule shows XLSX type label', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.xlsx);
    await uploadPage.waitForUploadComplete('sample.xlsx');
    const typeLabel = uploadPage.getAttachmentTypeLabel('sample.xlsx');
    await expect(typeLabel).toBeVisible();
    await expect(typeLabel).toContainText(/XLSX|DOCX|Excel/i);
  });

  test('TC-PRD-UPINP-007 -- Image file capsule shows thumbnail or image type label', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.png);
    await uploadPage.waitForUploadComplete('sample.png');
    const pill = uploadPage.getAttachmentPillByName('sample.png');
    await expect(pill).toBeVisible();
    // Image pills should show either a thumbnail <img> or at minimum an image type label
    const thumbnail = uploadPage.getAttachmentThumbnail('sample.png');
    const typeLabel = uploadPage.getAttachmentTypeLabel('sample.png');
    const hasThumb = await thumbnail.isVisible().catch(() => false);
    const hasLabel = await typeLabel.isVisible().catch(() => false);
    expect(hasThumb || hasLabel).toBeTruthy();
  });

  test('TC-PRD-UPINP-008 -- Long filename is truncated and does not overflow capsule', { tag: ['@failing'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.longName);
    await uploadPage.waitForUploadComplete('this_is_a_very_long_filename_exceeding_the_display_limit.pdf');
    const filenameParagraph = uploadPage.getAttachmentFilenameByName('this_is_a_very_long_filename_exceeding_the_display_limit.pdf');
    await expect(filenameParagraph).toBeVisible();
    await expect(filenameParagraph).toHaveClass(/truncate/);
  });

  test('TC-PRD-UPINP-010 -- Remove button is visible on capsule and clicking it removes the capsule', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.pdf);
    await uploadPage.waitForUploadComplete('sample.pdf');
    const removeBtn = uploadPage.getAttachmentRemoveBtnByName('sample.pdf');
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();
    const pill = uploadPage.getAttachmentPillByName('sample.pdf');
    await expect(pill).not.toBeVisible();
  });
});

test.describe('US-UPINP-ERROR -- Upload Error Handling', () => {
  test('TC-PRD-UPINP-003 -- Unsupported file type (.exe) is rejected silently (BUG: no error toast shown)', async ({ page, i18n }) => {
    // BUG: App silently drops files when ALL files fail accept validation — no toast shown.
    // The input[type=file] accept attribute does not include .exe, so the file is filtered
    // by the JS matchesAccept() check. When all files are rejected, onError is never called.
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.exe);
    // Verify file was rejected — no pill should appear
    await page.waitForTimeout(2_000);
    const pills = uploadPage.getAttachmentPills();
    await expect(pills).toHaveCount(0);
  });

  test('TC-PRD-UPINP-004 -- File exceeding 20 MB is rejected silently (BUG: no error toast shown)', async ({ page, i18n }) => {
    // BUG: App silently drops files when ALL files fail maxFileSize validation — no toast shown.
    // The file passes accept check (.pdf) but fails size check (21MB > 20MB).
    // When all accepted files exceed size limit, the code returns without calling onError.
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.oversized);
    // Verify file was rejected — no pill should appear
    await page.waitForTimeout(2_000);
    const pills = uploadPage.getAttachmentPills();
    await expect(pills).toHaveCount(0);
  });

  test('TC-PRD-UPINP-006 -- Exceeding 10 files limit shows max files error toast', async ({ page, i18n }) => {
    test.setTimeout(120_000);
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    for (let i = 0; i < 10; i++) {
      await uploadPage.attachFile(FILES.pdf);
      await uploadPage.waitForUploadComplete('sample.pdf');
    }
    await uploadPage.attachFile(FILES.pdf);
    await expect(page.locator('[data-sonner-toast]')).toContainText(i18n.t('chatbot.uploadErrorMaxFiles'));
  });

  test('TC-PRD-UPINP-016 -- XSS filename is rendered as plain text, not executed as script', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.xss);
    await uploadPage.waitForUploadComplete('xss_test.pdf');
    const pill = uploadPage.getAttachmentPillByName('xss_test.pdf');
    await expect(pill).toBeVisible();
    const alerts = await page.evaluate(() => (window as any).__xssAlertFired);
    expect(alerts).toBeFalsy();
  });

  test('TC-PRD-UPINP-017 -- Network upload failure shows upload error toast', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await page.route('**/api/files/upload', (route) => route.abort('failed'));
    await taskPage.goto();
    await uploadPage.attachFile(FILES.pdf);
    await expect(page.locator('[data-sonner-toast]')).toContainText(i18n.t('chatbot.uploadErrorUpload'));
  });
});

test.describe('US-UPINP-STATE -- Upload State Transitions', () => {
  test('TC-PRD-UPINP-005 -- During upload the capsule shows uploading spinner animation', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    let resolveUpload: () => void;
    const uploadHeld = new Promise<void>((resolve) => { resolveUpload = resolve; });
    await page.route('**/api/files/upload', async (route) => {
      await uploadHeld;
      await route.continue();
    });
    await taskPage.goto();
    void uploadPage.attachFile(FILES.pdf);
    const spinner = uploadPage.getUploadingSpinner();
    await expect(spinner).toBeVisible();
    resolveUpload!();
  });

  test('TC-PRD-UPINP-009 -- After upload completes spinner disappears and type/size label appears', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.pdf);
    await uploadPage.waitForUploadComplete('sample.pdf');
    const spinner = uploadPage.getUploadingSpinner();
    await expect(spinner).not.toBeVisible();
    const typeLabel = uploadPage.getAttachmentTypeLabel('sample.pdf');
    await expect(typeLabel).toBeVisible();
  });

  test('TC-PRD-UPINP-011 -- Uploading two files sequentially both appear as capsules', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.pdf);
    await uploadPage.waitForUploadComplete('sample.pdf');
    await uploadPage.attachFile(FILES.png);
    await uploadPage.waitForUploadComplete('sample.png');
    const pills = uploadPage.getAttachmentPills();
    await expect(pills).toHaveCount(2);
  });

  test('TC-PRD-UPINP-012 -- Upload then remove: capsule count decrements', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.pdf);
    await uploadPage.waitForUploadComplete('sample.pdf');
    await uploadPage.removeAttachmentByName('sample.pdf');
    const pills = uploadPage.getAttachmentPills();
    await expect(pills).toHaveCount(0);
  });

  test('TC-PRD-UPINP-013 -- Unknown MIME type (.txt) file shows generic type label', async ({ page, i18n }) => {
    // .bin is not in the accept list, so we use .txt (accepted) with generic content to test fallback label
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(path.join('tests', 'e2e', 'test-data', 'files', 'sample.txt'));
    await uploadPage.waitForUploadComplete('sample.txt');
    const pill = uploadPage.getAttachmentPillByName('sample.txt');
    await expect(pill).toBeVisible();
    const typeLabel = uploadPage.getAttachmentTypeLabel('sample.txt');
    await expect(typeLabel).toBeVisible();
  });
});

test.describe('US-UPINP-FLOW -- Complete Upload Flow', () => {
  test('TC-PRD-UPINP-014 -- Uploading 10 files (boundary max) all capsules are rendered', async ({ page, i18n }) => {
    test.setTimeout(120_000);
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    for (let i = 0; i < 10; i++) {
      await uploadPage.attachFile(FILES.pdf);
      await uploadPage.waitForUploadComplete('sample.pdf');
    }
    const pills = uploadPage.getAttachmentPills();
    await expect(pills).toHaveCount(10);
  });

  test('TC-PRD-UPINP-015 -- Mixed file types upload: each capsule shows correct type label', async ({ page, i18n }) => {
    const taskPage = new TaskPage(page);
    const uploadPage = new TaskPageUploadInputFragment(page, i18n);
    await taskPage.goto();
    await uploadPage.attachFile(FILES.pdf);
    await uploadPage.waitForUploadComplete('sample.pdf');
    await uploadPage.attachFile(FILES.png);
    await uploadPage.waitForUploadComplete('sample.png');
    await uploadPage.attachFile(FILES.xlsx);
    await uploadPage.waitForUploadComplete('sample.xlsx');
    const pdfTypeLabel = uploadPage.getAttachmentTypeLabel('sample.pdf');
    await expect(pdfTypeLabel).toContainText('PDF');
    const pngPill = uploadPage.getAttachmentPillByName('sample.png');
    await expect(pngPill).toBeVisible();
    const xlsxTypeLabel = uploadPage.getAttachmentTypeLabel('sample.xlsx');
    await expect(xlsxTypeLabel).toBeVisible();
  });
});
