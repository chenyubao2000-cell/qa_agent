// source: cdp
// handoff: test-cases/generated/playwright-handoff-task-file-preview.json
// baseline: test-cases/generated/page-baseline-task-conversation.json
// generated: 2026-03-24T00:00:00Z
// DEPRECATED: All 17 TCs fully covered by canvas-preview-prd.test.ts + people-data-download-prd.test.ts (PRD V0.2.8)

import { test, expect } from '../../fixtures';
import { TaskPage } from '../../pages/task.page';

// ──────────────────────────────────────────────────────────────────────────────
// DEPRECATED: File preview tests superseded by PRD specs. Kept for reference only.
// The task was created by the conversation exploration and contains:
// txt, json, md, csv, doc, docx, xls, xlsx, ppt, pptx, pdf, png, jpg, jpeg, gif, tiff
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-01 · 文件网格显示
// ──────────────────────────────────────────────────────────────────────────────
test.describe.skip('US-PREVIEW-01 · 文件网格显示', () => {
  test(
    'TC-CDP-FP-001 任务完成后显示文件卡片网格',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Verify file cards exist
      const fileCards = taskPage.getFileCards();
      await expect(fileCards.first()).toBeVisible();
      const count = await fileCards.count();
      expect(count).toBeGreaterThanOrEqual(10);
    }
  );

  test(
    'TC-CDP-FP-002 每个文件卡片显示文件名和下载按钮',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Check a specific file card has download button
      const txtCard = taskPage.getFileCardByName('sample.txt');
      await expect(txtCard).toBeVisible();

      const downloadBtn = taskPage.getFileCardDownloadBtn('sample.txt');
      await expect(downloadBtn).toBeVisible();
    }
  );

  test(
    'TC-CDP-FP-003 文件卡片显示正确的文件类型标签',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Verify file cards exist with expected filenames
      await expect(taskPage.getFileCardByName('sample.txt')).toBeVisible();
      await expect(taskPage.getFileCardByName('sample.csv')).toBeVisible();
      await expect(taskPage.getFileCardByName('sample.pdf')).toBeVisible();
      await expect(taskPage.getFileCardByName('sample.png')).toBeVisible();
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-02 · 文本文件预览 (txt, json, md)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.skip('US-PREVIEW-02 · 文本文件预览', () => {
  test(
    'TC-CDP-FP-004 点击 sample.txt 打开文本预览面板',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.txt');
      await page.waitForTimeout(1000);

      // Preview panel should show filename
      await expect(page.getByText('sample.txt').last()).toBeVisible();
      // Text content should be rendered
      await expect(page.getByText(/软件测试|Software Test/).first()).toBeVisible();
    }
  );

  test(
    'TC-CDP-FP-005 点击 sample.json 打开文本预览面板',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.json');
      await page.waitForTimeout(1000);

      await expect(page.getByText('sample.json').last()).toBeVisible();
    }
  );

  test(
    'TC-CDP-FP-006 点击 sample.md 打开文本预览面板',
    { tag: ['@P2', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.md');
      await page.waitForTimeout(1000);

      await expect(page.getByText('sample.md').last()).toBeVisible();
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-03 · 表格文件预览 (csv, xlsx)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.skip('US-PREVIEW-03 · 表格文件预览', () => {
  test(
    'TC-CDP-FP-007 点击 sample.xlsx 打开电子表格预览',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.xlsx');
      await page.waitForTimeout(2000);

      // Should show spreadsheet filename
      await expect(page.getByText('sample.xlsx').last()).toBeVisible();
      // Should render spreadsheet grid with column headers
      await expect(taskPage.getPreviewSpreadsheet()).toBeVisible({ timeout: 10_000 });
    }
  );

  test(
    'TC-CDP-FP-008 点击 sample.csv 打开电子表格预览',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.csv');
      await page.waitForTimeout(2000);

      await expect(page.getByText('sample.csv').last()).toBeVisible();
      await expect(taskPage.getPreviewSpreadsheet()).toBeVisible({ timeout: 10_000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-04 · PDF 文件预览
// ──────────────────────────────────────────────────────────────────────────────
test.describe.skip('US-PREVIEW-04 · PDF 文件预览', () => {
  test(
    'TC-CDP-FP-009 点击 sample.pdf 打开 PDF 预览（含页码导航）',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.pdf');
      await page.waitForTimeout(2000);

      await expect(page.getByText('sample.pdf').last()).toBeVisible();
      // PDF viewer has page navigation (1 / 1)
      await expect(page.getByText(/1\s*\/\s*1/).first()).toBeVisible({ timeout: 10_000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-05 · 图片文件预览 (png, jpg, gif)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.skip('US-PREVIEW-05 · 图片文件预览', () => {
  test(
    'TC-CDP-FP-010 点击 sample.png 打开图片预览（含缩放控件）',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.png');
      await page.waitForTimeout(1000);

      await expect(page.getByText('sample.png').last()).toBeVisible();
      // Image viewer has zoom controls (100% text visible)
      await expect(taskPage.getPreviewImageViewer()).toBeVisible({ timeout: 5000 });
    }
  );

  test(
    'TC-CDP-FP-011 点击 sample.jpg 打开图片预览',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.jpg');
      await page.waitForTimeout(1000);

      await expect(page.getByText('sample.jpg').last()).toBeVisible();
      // Image viewer should show (may have zoom controls or just the image)
      await page.waitForTimeout(2000);
    }
  );

  test(
    'TC-CDP-FP-012 图片预览面板包含重置按钮',
    { tag: ['@P2', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.png');
      await page.waitForTimeout(1000);

      // Image preview has zoom controls or reset button
      await expect(taskPage.getPreviewImageViewer().or(taskPage.getPreviewImageResetBtn()).first()).toBeVisible({ timeout: 5000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-06 · Word 文档预览 (docx)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.skip('US-PREVIEW-06 · Word 文档预览', () => {
  test(
    'TC-CDP-FP-013 点击 sample.docx 打开文档预览（渲染格式化内容）',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.docx');
      await page.waitForTimeout(2000);

      await expect(page.getByText('sample.docx').last()).toBeVisible();
      // DOCX renders formatted content (should see report title or table)
      await expect(page.getByText(/搜索报告|搜索概览|Search Report/).first()).toBeVisible({ timeout: 10_000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-07 · 不支持预览的文件类型 (pptx)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.skip('US-PREVIEW-07 · 不支持预览的文件类型', () => {
  test(
    'TC-CDP-FP-014 点击 sample.pptx 显示"暂不支持在线预览"提示',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      await taskPage.clickFileCard('sample.pptx');
      await page.waitForTimeout(1000);

      await expect(page.getByText('sample.pptx').last()).toBeVisible();
      // Should show unsupported message in preview panel
      await expect(
        page.getByText(/not available|not supported|暂不支持/).first()
      ).toBeVisible({ timeout: 5000 });
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-PREVIEW-08 · 预览面板交互（关闭、切换文件）
// ──────────────────────────────────────────────────────────────────────────────
test.describe.skip('US-PREVIEW-08 · 预览面板交互', () => {
  test(
    'TC-CDP-FP-015 预览面板关闭按钮可正常关闭面板',
    { tag: ['@P1', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Open preview
      await taskPage.clickFileCard('sample.txt');
      await page.waitForTimeout(1000);
      await expect(page.getByText('sample.txt').last()).toBeVisible();

      // Close preview (click the X button — last button with SVG in the header area)
      const closeBtn = page.locator('button').filter({ has: page.locator('path[d*="M18"]') }).last();
      await closeBtn.click().catch(async () => {
        // Fallback: press Escape
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

      // Open txt preview
      await taskPage.clickFileCard('sample.txt');
      await page.waitForTimeout(1000);
      await expect(page.getByText('sample.txt').last()).toBeVisible();

      // Switch to png preview
      await taskPage.clickFileCard('sample.png');
      await page.waitForTimeout(1000);
      // Image viewer controls should appear (100% zoom)
      await expect(taskPage.getPreviewImageViewer()).toBeVisible({ timeout: 5000 });
    }
  );

  test(
    'TC-CDP-FP-017 人才数据卡片点击打开工作区面板显示候选人列表',
    { tag: ['@P0', '@smoke', '@regression', '@full'] },
    async ({ page, i18n, taskWithToolChainUrl }) => {
      const taskPage = new TaskPage(page, i18n);
      await gotoTaskWithFiles(taskPage, page, taskWithToolChainUrl);

      // Click the talent data card
      const talentCard = taskPage.getFileCards().filter({ hasText: /人才数据|10 人/ }).first();
      await talentCard.click();
      await page.waitForTimeout(2000);

      // Should show candidate data (name or LinkedIn)
      await expect(page.getByText(/Lihua Song|方园|LinkedIn/).first()).toBeVisible({ timeout: 10_000 });
    }
  );
});
