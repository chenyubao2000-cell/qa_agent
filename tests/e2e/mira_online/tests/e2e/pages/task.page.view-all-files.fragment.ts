// POM fragment: view-all-files area
// Merge target: tests/e2e/pages/task.page.ts
// generated: 2026-03-29T00:00:00Z

import { type Page, type Locator } from '@playwright/test';
import type { I18n } from '../fixtures';

export class ViewAllFilesFragment {
  private readonly page: Page;
  private readonly i18n?: I18n;
  private readonly viewAllFilesToolbarBtn: Locator;
  private readonly viewAllFilesResultBtn: Locator;
  private readonly filesPanelContainer: Locator;
  private readonly filesPanelTitle: Locator;
  private readonly filesPanelCloseBtn: Locator;
  private readonly batchDownloadIconBtn: Locator;
  private readonly fileCards: Locator;
  private readonly selectAllBtn: Locator;
  private readonly cancelSelectionBtn: Locator;
  private readonly batchDownloadFooterBtn: Locator;
  private readonly fullscreenPreviewOverlay: Locator;
  private readonly loadErrorMessage: Locator;
  private readonly refreshNowBtn: Locator;
  private readonly packingBadge: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // Toolbar button: icon-only, title attr = chatbot.viewAllFiles
    // en: "View all files" / zh: "查看此任务中所有文件"
    this.viewAllFilesToolbarBtn = page.locator(
      'button[title="View all files"], button[title="查看此任务中所有文件"]'
    ).first();

    // Result area button: inside chat log, tools.complete.viewAllFiles
    // en: "View all files in this task" / zh: "查看此任务中所有文件"
    this.viewAllFilesResultBtn = page.locator('[role="log"]').getByRole('button', {
      name: /View all files in this task|查看此任务中所有文件/i,
    }).last();

    // Panel container
    this.filesPanelContainer = page.locator('.bg-background.shrink-0.overflow-hidden.border-l').last();

    // Panel title h2: taskFiles.title
    this.filesPanelTitle = page.getByRole('heading', {
      name: /All files in this task|此任务中的所有文件/i,
    });

    // Close button: title attr = taskFiles.close
    this.filesPanelCloseBtn = page.locator(
      'button[title="Close"], button[title="关闭"]'
    ).last();

    // Batch download icon button: SVG <title>Batch download</title>
    this.batchDownloadIconBtn = page.locator('button').filter({
      has: page.locator('svg title:text("Batch download")'),
    }).first();

    // File cards: In browse mode they are div[role="button"] with rounded-lg.border.p-3
    // In selection mode they are div[role="checkbox"]
    // Use the panel heading as anchor, then find cards in the same container
    this.fileCards = page.locator('.rounded-lg.border.p-3');

    // Select all button
    this.selectAllBtn = page.locator('button').filter({ hasText: /Select all|全选/i }).first();

    // Cancel selection button
    this.cancelSelectionBtn = page.getByRole('button', { name: /^Cancel$|^取消$/i });

    // Batch download footer button
    this.batchDownloadFooterBtn = page.getByRole('button', { name: /^Batch download$|^批量下载$/i });

    // Fullscreen preview overlay: FilePreviewOverlay renders div.fixed.inset-0.z-50.flex.flex-col
    this.fullscreenPreviewOverlay = page.locator('.fixed.inset-0.z-50.flex.flex-col').last();

    // Load error text
    this.loadErrorMessage = page.getByText(/Failed to load file list|文件列表加载失败/i);

    // Refresh now button
    this.refreshNowBtn = page.getByRole('button', { name: /Refresh now|立即刷新/i });

    // Packing badge
    this.packingBadge = page.getByText(/Packing\.\.\.|打包中\.\.\./i);
  }

  async clickViewAllFilesToolbar(): Promise<void> { await this.viewAllFilesToolbarBtn.click(); }
  async clickViewAllFilesResult(): Promise<void> { await this.viewAllFilesResultBtn.click(); }
  async closeFilesPanel(): Promise<void> { await this.filesPanelCloseBtn.click(); }

  async waitForFilesPanelOpen(): Promise<void> {
    await this.filesPanelTitle.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async waitForFilesPanelClosed(): Promise<void> {
    await this.filesPanelTitle.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  async waitForFileCardsLoaded(): Promise<void> {
    // Wait for any file card to appear -- either browse mode (button with title) or selection mode (checkbox)
    await this.page.locator('.rounded-lg.border.p-3').first().or(
      this.page.getByRole('checkbox').first()
    ).waitFor({ state: 'visible', timeout: 30_000 });
  }

  async clickFirstFileCard(): Promise<void> {
    await this.fileCards.first().click();
  }

  async clickFileCardDownloadBtn(index = 0): Promise<void> {
    const card = this.fileCards.nth(index);
    await card.locator('button').last().click();
  }

  async clickBatchDownloadIcon(): Promise<void> { await this.batchDownloadIconBtn.click(); }
  async clickSelectAll(): Promise<void> { await this.selectAllBtn.click(); }
  async clickCancelSelection(): Promise<void> { await this.cancelSelectionBtn.click(); }
  async clickBatchDownloadFooter(): Promise<void> { await this.batchDownloadFooterBtn.click(); }

  async selectFileAtIndex(index: number): Promise<void> {
    const checkboxes = this.page.locator('[role="checkbox"]');
    await checkboxes.nth(index).click();
  }

  async waitForFullscreenPreviewOpen(): Promise<void> {
    await this.fullscreenPreviewOverlay.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async waitForFullscreenPreviewClosed(): Promise<void> {
    await this.fullscreenPreviewOverlay.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  async pressEscapeInFullscreen(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  getViewAllFilesToolbarBtn(): Locator { return this.viewAllFilesToolbarBtn; }
  getViewAllFilesResultBtn(): Locator { return this.viewAllFilesResultBtn; }
  getFilesPanelContainer(): Locator { return this.filesPanelContainer; }
  getFilesPanelTitle(): Locator { return this.filesPanelTitle; }
  getFilesPanelCloseBtn(): Locator { return this.filesPanelCloseBtn; }
  getBatchDownloadIconBtn(): Locator { return this.batchDownloadIconBtn; }
  getFileCards(): Locator { return this.fileCards; }
  getSelectAllBtn(): Locator { return this.selectAllBtn; }
  getCancelSelectionBtn(): Locator { return this.cancelSelectionBtn; }
  getBatchDownloadFooterBtn(): Locator { return this.batchDownloadFooterBtn; }
  getFullscreenPreviewOverlay(): Locator { return this.fullscreenPreviewOverlay; }
  getLoadErrorMessage(): Locator { return this.loadErrorMessage; }
  getRefreshNowBtn(): Locator { return this.refreshNowBtn; }
  getPackingBadge(): Locator { return this.packingBadge; }
  getFileCheckboxes(): Locator { return this.page.locator('[role="checkbox"]'); }
}
