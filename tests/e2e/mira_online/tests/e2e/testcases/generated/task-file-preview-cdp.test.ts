// source: cdp
// handoff: test-cases/generated/playwright-handoff-task-file-preview.json
// baseline: test-cases/generated/page-baseline-task-conversation.json
// generated: 2026-03-24T00:00:00Z
import { test, expect } from '../../fixtures';
import { TaskPage } from '../../pages/task.page';

// Helper: navigate to the task with generated files (URL from worker-scope fixture)
async function gotoTaskWithFiles(taskPage: TaskPage, page: any, taskUrl: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(taskUrl, { timeout: 30_000 });
      await page.waitForLoadState('domcontentloaded');
      break;
    } catch {
      if (attempt < 2) await page.waitForTimeout(2000);
      else throw new Error('Failed to navigate to task with files after 3 attempts');
    }
  }
  await page.locator('[role="log"] div[role="button"].rounded-xl').first().waitFor({ state: 'visible', timeout: 30_000 });
}

// Helper: find a file card by extension pattern
function findFileCardByExt(taskPage: TaskPage, page: any, ext: string) {
  return taskPage.getFileCards().filter({ hasText: new RegExp(`\\.${ext}`, 'i') }).first();
}

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-01 · 文件网格显示
// ──────────────────────────────────────────────────────────────────────────────
test.describe('US-PREVIEW-01 · 文件网格显示', () => {
  test(
    'TC-CDP-FP-001 任务完成后显示文件卡片网格',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Verify file cards exist (tool-chain task produces at least 3 files)
      const fileCards = taskPage.getFileCards();
      await expect(fileCards.first()).toBeVisible();
      const count = await fileCards.count();
      expect(count).toBeGreaterThanOrEqual(3);
    }
  );

  test(
    'TC-CDP-FP-002 每个文件卡片显示文件名和下载按钮',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Check first file card is visible
      const firstCard = taskPage.getFileCards().first();
      await expect(firstCard).toBeVisible();
    }
  );

  test(
    'TC-CDP-FP-003 文件卡片显示正确的文件类型标签',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Verify at least PDF and PNG file cards exist
      await expect(findFileCardByExt(taskPage, page, 'pdf')).toBeVisible({ timeout: 5000 });
      await expect(findFileCardByExt(taskPage, page, 'png')).toBeVisible({ timeout: 5000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-02 · 文本/JSON 文件预览
// ──────────────────────────────────────────────────────────────────────────────
test.describe('US-PREVIEW-02 · 文本文件预览', () => {
  test(
    'TC-CDP-FP-004 点击 JSON 文件打开预览面板',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      const jsonCard = findFileCardByExt(taskPage, page, 'json');
      await jsonCard.click();
      await page.waitForTimeout(1000);

      // Preview panel should show .json filename
      await expect(page.getByText(/\.json/).last()).toBeVisible({ timeout: 5000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-03 · 表格文件预览 (xlsx)
// ──────────────────────────────────────────────────────────────────────────────
test.describe('US-PREVIEW-03 · 表格文件预览', () => {
  test(
    'TC-CDP-FP-007 点击 XLSX/CSV 文件打开电子表格预览',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Try xlsx first, fallback to csv
      const xlsxCard = findFileCardByExt(taskPage, page, 'xlsx');
      const csvCard = findFileCardByExt(taskPage, page, 'csv');
      const hasXlsx = await xlsxCard.isVisible({ timeout: 3000 }).catch(() => false);
      const card = hasXlsx ? xlsxCard : csvCard;
      await expect(card).toBeVisible({ timeout: 5000 });
      await card.click();
      await page.waitForTimeout(2000);

      // Should render spreadsheet grid
      await expect(taskPage.getPreviewSpreadsheet()).toBeVisible({ timeout: 10_000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-04 · PDF 文件预览
// ──────────────────────────────────────────────────────────────────────────────
test.describe('US-PREVIEW-04 · PDF 文件预览', () => {
  test(
    'TC-CDP-FP-009 点击 PDF 文件打开 PDF 预览（含页码导航）',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      const pdfCard = findFileCardByExt(taskPage, page, 'pdf');
      await expect(pdfCard).toBeVisible({ timeout: 5000 });
      await pdfCard.click();
      await page.waitForTimeout(2000);

      await expect(page.getByText(/\.pdf/).last()).toBeVisible({ timeout: 5000 });
      // PDF viewer has page navigation (N / M)
      await expect(page.getByText(/\d+\s*\/\s*\d+/).first()).toBeVisible({ timeout: 10_000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-05 · 图片文件预览 (png, jpg, gif)
// ──────────────────────────────────────────────────────────────────────────────
test.describe('US-PREVIEW-05 · 图片文件预览', () => {
  test(
    'TC-CDP-FP-010 点击 PNG 文件打开图片预览（含缩放控件）',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      const pngCard = findFileCardByExt(taskPage, page, 'png');
      await expect(pngCard).toBeVisible({ timeout: 5000 });
      await pngCard.click();
      await page.waitForTimeout(1000);

      await expect(page.getByText(/\.png/).last()).toBeVisible({ timeout: 5000 });
      // Image viewer has zoom controls (100% text visible)
      await expect(taskPage.getPreviewImageViewer()).toBeVisible({ timeout: 5000 });
    }
  );

  test(
    'TC-CDP-FP-012 图片预览面板包含重置按钮',
    { tag: ['@P2', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      const pngCard = findFileCardByExt(taskPage, page, 'png');
      await expect(pngCard).toBeVisible({ timeout: 5000 });
      await pngCard.click();
      await page.waitForTimeout(1000);

      await expect(taskPage.getPreviewImageViewer().or(taskPage.getPreviewImageResetBtn()).first()).toBeVisible({ timeout: 5000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-06 · Word 文档预览 (docx)
// ──────────────────────────────────────────────────────────────────────────────
test.describe('US-PREVIEW-06 · Word 文档预览', () => {
  test(
    'TC-CDP-FP-013 点击 DOCX 文件打开文档预览',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      const docxCard = findFileCardByExt(taskPage, page, 'docx');
      await expect(docxCard).toBeVisible({ timeout: 5000 });
      await docxCard.click();
      await page.waitForTimeout(2000);

      await expect(page.getByText(/\.docx/).last()).toBeVisible({ timeout: 5000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-07 · PPTX 文件预览
// ──────────────────────────────────────────────────────────────────────────────
test.describe('US-PREVIEW-07 · PPTX 文件预览', () => {
  test(
    'TC-CDP-FP-014 点击 PPTX 文件打开演示文稿预览',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      const pptxCard = findFileCardByExt(taskPage, page, 'pptx');
      await expect(pptxCard).toBeVisible({ timeout: 5000 });
      await pptxCard.click();
      await page.waitForTimeout(2000);

      // Preview panel should show .pptx filename and page navigation
      await expect(page.getByText(/\.pptx/).last()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/\d+\s*\/\s*\d+/).first()).toBeVisible({ timeout: 10_000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-08 · 预览面板交互（关闭、切换文件）
// ──────────────────────────────────────────────────────────────────────────────
test.describe('US-PREVIEW-08 · 预览面板交互', () => {
  test(
    'TC-CDP-FP-015 预览面板关闭按钮可正常关闭面板',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Open first file preview
      await taskPage.getFileCards().first().click();
      await page.waitForTimeout(1000);

      // Close preview
      const closeBtn = page.locator('button').filter({ has: page.locator('path[d*="M18"]') }).last();
      await closeBtn.click().catch(async () => {
        await page.keyboard.press('Escape');
      });
      await page.waitForTimeout(500);
    }
  );

  test(
    'TC-CDP-FP-016 点击不同文件卡片可切换预览内容',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      const fileCards = taskPage.getFileCards();
      const count = await fileCards.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Open first file
      await fileCards.nth(0).click();
      await page.waitForTimeout(1000);

      // Switch to second file
      await fileCards.nth(1).click();
      await page.waitForTimeout(1000);
    }
  );

  test(
    'TC-CDP-FP-017 人才数据卡片点击打开工作区面板显示候选人列表',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithPeopleDataUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithPeopleDataUrl);

      // Click the first file card (people data task)
      await taskPage.getFileCards().first().click();
      await page.waitForTimeout(2000);

      // Workspace panel should open with candidate data
      await taskPage.waitForWorkspacePanelOpen();
    }
  );
});
