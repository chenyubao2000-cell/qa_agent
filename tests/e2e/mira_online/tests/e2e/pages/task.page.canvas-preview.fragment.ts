// POM fragment: canvas-preview area
// Merge target: tests/e2e/pages/task.page.ts
// generated: 2026-03-29T00:00:00Z

import { type Page, type Locator } from '@playwright/test';
import type { I18n } from '../fixtures';

export class CanvasPreviewFragment {
  private readonly page: Page;
  private readonly i18n?: I18n;

  private readonly canvasPanel: Locator;
  private readonly canvasDownloadBtn: Locator;
  private readonly canvasCloseBtn: Locator;
  private readonly pdfPrevPageBtn: Locator;
  private readonly pdfNextPageBtn: Locator;
  private readonly pdfZoomInBtn: Locator;
  private readonly pdfZoomOutBtn: Locator;
  private readonly pdfPageCount: Locator;
  private readonly pdfZoomPercent: Locator;
  private readonly pptThumbnailSidebar: Locator;
  private readonly pptPageIndicator: Locator;
  private readonly pptMainArea: Locator;
  private readonly canvasRetryBtn: Locator;
  private readonly canvasLoadingIndicator: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // Canvas panel: matches both normal (border-l) and maximized (fixed inset-0) states.
    // Use the inner container that always has bg-background + text-foreground + flex + flex-col.
    this.canvasPanel = page.locator('div.bg-background.text-foreground.flex.flex-col').last();

    // Download button: first button in header actions group
    this.canvasDownloadBtn = this.canvasPanel.locator('div.flex.items-center.gap-1 button').first();

    // Close button: last button in header actions group
    this.canvasCloseBtn = this.canvasPanel.locator('div.flex.items-center.gap-1 button').last();

    // PDF toolbar controls (inside div.bg-muted/30)
    const pdfToolbar = this.canvasPanel.locator('div[class*="bg-muted"]');
    this.pdfPrevPageBtn = pdfToolbar.locator('button').first();
    this.pdfNextPageBtn = pdfToolbar.locator('button').nth(1);
    this.pdfZoomOutBtn = pdfToolbar.locator('button').nth(2);
    this.pdfZoomInBtn = pdfToolbar.locator('button').nth(3);
    // Page count: "1 / 4" in span.text-sm
    this.pdfPageCount = pdfToolbar.locator('span.text-sm').first();
    // Zoom percent: "100%" in span.text-xs
    this.pdfZoomPercent = pdfToolbar.locator('span.text-xs').first();

    // PPT thumbnail sidebar: hidden on mobile, visible on md+ with data-slide children
    this.pptThumbnailSidebar = this.canvasPanel.locator('div[class*="md\:flex"]').filter({
      has: page.locator('[data-slide]'),
    }).first();
    // PPT page indicator: "{current}/{total}" in span.tabular-nums
    this.pptPageIndicator = this.canvasPanel.locator('span.tabular-nums').last();
    this.pptMainArea = this.canvasPanel.locator('div[class*="flex-1"][class*="overflow-hidden"]').last();

    // Retry button in canvas error state (no canvas.retry i18n key; use bilingual regex)
    this.canvasRetryBtn = page.getByRole('button', { name: /Retry|重试/i });

    // Loading indicator (spinner)
    this.canvasLoadingIndicator = page.locator('[class*="animate-spin"]').first();
  }

  getCanvasMaximizeBtn(): Locator {
    return this.canvasPanel.locator('button[title="Maximize"], button[title="最大化"]').first();
  }

  getCanvasRestoreBtn(): Locator {
    return this.canvasPanel.locator('button[title="Restore"], button[title="还原"]').first();
  }

  getCanvasDownloadBtn(): Locator {
    return this.canvasPanel.locator('button[title="Download file"], button[title="下载文件"]').first();
  }

  getCanvasCloseBtn(): Locator {
    return this.canvasPanel.locator('button[title="Close"], button[title="关闭"]').first();
  }

  getPdfPrevPageBtn(): Locator { return this.pdfPrevPageBtn; }
  getPdfNextPageBtn(): Locator { return this.pdfNextPageBtn; }
  getPdfZoomInBtn(): Locator { return this.pdfZoomInBtn; }
  getPdfZoomOutBtn(): Locator { return this.pdfZoomOutBtn; }
  getPdfPageCount(): Locator { return this.pdfPageCount; }
  getPdfZoomPercent(): Locator { return this.pdfZoomPercent; }

  getPptThumbnailSidebar(): Locator { return this.pptThumbnailSidebar; }
  getPptPageIndicator(): Locator { return this.pptPageIndicator; }
  getPptMainArea(): Locator { return this.pptMainArea; }

  getPptThumbnailByIndex(index: number): Locator {
    return this.page.locator(`[data-slide="${index}"]`);
  }

  getCanvasRetryBtn(): Locator { return this.canvasRetryBtn; }
  getCanvasLoadingIndicator(): Locator { return this.canvasLoadingIndicator; }

  getCanvasFilename(): Locator {
    // Scoped to the canvas panel to avoid matching file cards in chat log
    return this.canvasPanel.locator('p.truncate[title]').first();
  }

  getUnsupportedDownloadBtn(): Locator {
    return this.i18n
      ? this.canvasPanel.getByRole('button', { name: this.i18n.t('canvas.renderers.unsupported.downloadButton') })
      : this.canvasPanel.getByRole('button', { name: /Download file|下载文件/i });
  }

  async clickCanvasMaximize(): Promise<void> { await this.getCanvasMaximizeBtn().click(); }
  async clickCanvasRestore(): Promise<void> { await this.getCanvasRestoreBtn().click(); }
  async clickCanvasClose(): Promise<void> { await this.getCanvasCloseBtn().click(); }
  async clickPdfNextPage(): Promise<void> { await this.pdfNextPageBtn.click(); }
  async clickPdfPrevPage(): Promise<void> { await this.pdfPrevPageBtn.click(); }
  async clickPdfZoomIn(): Promise<void> { await this.pdfZoomInBtn.click(); }
  async clickPdfZoomOut(): Promise<void> { await this.pdfZoomOutBtn.click(); }
  async clickPptThumbnail(index: number): Promise<void> { await this.getPptThumbnailByIndex(index).click(); }
  async clickCanvasRetry(): Promise<void> { await this.canvasRetryBtn.click(); }

  async waitForCanvasPanelVisible(): Promise<void> {
    await this.canvasPanel.locator('p.truncate[title]').first().waitFor({ state: 'visible', timeout: 15_000 });
  }

  async waitForCanvasPanelClosed(): Promise<void> {
    await this.canvasPanel.locator('p.truncate[title]').first().waitFor({ state: 'hidden', timeout: 10_000 });
  }

  async waitForPptRendered(): Promise<void> {
    await this.page.locator('[data-slide="1"]').waitFor({ state: 'visible', timeout: 30_000 });
  }

  async waitForPdfRendered(): Promise<void> {
    await this.pdfPageCount.waitFor({ state: 'visible', timeout: 15_000 });
  }
}
