// POM fragment: view-all-files area
// Merge target: tests/e2e/pages/task.page.ts
// generated: 2026-03-29T00:00:00Z

import { type Page, type Locator } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex, i18nTitleSelector } from "../i18n-helpers";

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

    // Toolbar button: icon-only. Anchor on stable svg marker (lucide-folder-search)
    // — locale-independent and resilient to stale messages/*.json caches.
    // See: .claude/references/i18n-locator-rules.md §D4 / selection rule 2.
    this.viewAllFilesToolbarBtn = page
      .locator("button:has(svg.lucide-folder-search)")
      .first();

    // Result area button: inside chat log, tools.complete.viewAllFiles
    // Always use i18nRegex (multi-locale) to match user's account locale.
    this.viewAllFilesResultBtn = page
      .locator('[role="log"]')
      .getByRole("button", {
        name: i18nRegex("tools.complete.viewAllFiles"),
      })
      .last();

    // Panel container — used as scope for all panel-internal locators.
    // The motion.div in task-content.tsx is `.shrink-0.overflow-hidden` with an
    // inline `width` style (set by Framer Motion).  The inner TaskFilesViewer root
    // div is `bg-background text-foreground flex flex-col h-full w-full` which is
    // unique to the files panel.  We scope to that inner root so that the
    // container is always visible when the panel is open.
    this.filesPanelContainer = page
      .locator(
        "div.bg-background.text-foreground.flex.flex-col.h-full.w-full",
      )
      .last();

    // Use panel container as scope for internal elements to avoid matching
    // elements in other panels (workspace, canvas) or in the chat log.
    const panelScope = this.filesPanelContainer;

    // Panel title h2: taskFiles.title
    // Always use i18nRegex (multi-locale) because the page renders in the
    // user's account locale (e.g. zh) which may differ from the test locale.
    this.filesPanelTitle = page.getByRole("heading", {
      name: i18nRegex("taskFiles.title"),
    });

    // Close button: title attr = taskFiles.close
    // Always use i18nTitleSelector (multi-locale) so it matches regardless of
    // the user's account locale (e.g. "关闭" in zh, "Close" in en).
    this.filesPanelCloseBtn = page
      .locator(i18nTitleSelector("button", "taskFiles.close"))
      .last();

    // Batch download icon button: SVG <title>Batch download</title> — scoped to panel
    this.batchDownloadIconBtn = panelScope
      .locator("button")
      .filter({
        has: page.locator('svg title:text("Batch download")'),
      })
      .first();

    // File cards: In browse mode they are div[role="button"] inside grid columns
    // In selection mode the outer wrapper is div[role="checkbox"]
    this.fileCards = panelScope.locator('[role="button"], [role="checkbox"]');

    // Select all button — scoped to panel footer to avoid matching other "Select all" buttons
    // Always use i18nRegex (multi-locale) to match user's account locale.
    this.selectAllBtn = panelScope
      .locator("button")
      .filter({ hasText: i18nRegex("taskFiles.selectAll") })
      .first();

    // Cancel selection button — scoped to panel footer
    this.cancelSelectionBtn = panelScope.getByRole("button", {
      name: i18nRegex("taskFiles.cancelSelection", { exact: true }),
    });

    // Batch download footer button — scoped to panel footer
    this.batchDownloadFooterBtn = panelScope.getByRole("button", {
      name: i18nRegex("taskFiles.batchDownload", { exact: true }),
    });

    // Fullscreen preview overlay: FilePreviewOverlay renders div.fixed.inset-0.z-50.flex.flex-col
    this.fullscreenPreviewOverlay = page
      .locator(".fixed.inset-0.z-50.flex.flex-col")
      .last();

    // Load error text
    this.loadErrorMessage = page.getByText(i18nRegex("taskFiles.loadError"));

    // Refresh now button
    this.refreshNowBtn = page.getByRole("button", {
      name: i18nRegex("taskFiles.refreshNow"),
    });

    // Packing badge
    this.packingBadge = page.getByText(i18nRegex("taskFiles.packing"));
  }

  async clickViewAllFilesToolbar(): Promise<void> {
    // React hydration completes after role=log is visible; without a pre-click
    // wait the onClick handler may not be attached yet and the click is
    // silently absorbed → waitForFilesPanelOpen hits 30s timeout. If panel
    // does not open within 3s after first click, retry once.
    await this.page.waitForTimeout(1500);
    await this.viewAllFilesToolbarBtn.click();
    try {
      await this.filesPanelTitle.waitFor({ state: "visible", timeout: 3000 });
    } catch {
      // Retry: handler may have attached between first click and now
      await this.viewAllFilesToolbarBtn.click();
    }
  }
  async clickViewAllFilesResult(): Promise<void> {
    await this.viewAllFilesResultBtn.click();
  }
  async closeFilesPanel(): Promise<void> {
    await this.filesPanelCloseBtn.click();
  }

  async waitForFilesPanelOpen(): Promise<void> {
    await this.filesPanelTitle.waitFor({ state: "visible", timeout: 30_000 });
  }

  async waitForFilesPanelClosed(): Promise<void> {
    await this.filesPanelTitle.waitFor({ state: "hidden", timeout: 30_000 });
  }

  async waitForFileCardsLoaded(): Promise<void> {
    // Wait for any file card to appear inside the files panel
    // Browse mode: div[role="button"] inside the panel
    // Selection mode: div[role="checkbox"] inside the panel
    await this.fileCards.first().waitFor({ state: "visible", timeout: 30_000 });
  }

  async clickFirstFileCard(): Promise<void> {
    await this.fileCards.first().click();
  }

  async clickFileCardDownloadBtn(index = 0): Promise<void> {
    const card = this.fileCards.nth(index);
    await card.locator("button").last().click();
  }

  async clickBatchDownloadIcon(): Promise<void> {
    await this.batchDownloadIconBtn.click();
  }
  async clickSelectAll(): Promise<void> {
    await this.selectAllBtn.click();
  }
  async clickCancelSelection(): Promise<void> {
    await this.cancelSelectionBtn.click();
  }
  async clickBatchDownloadFooter(): Promise<void> {
    await this.batchDownloadFooterBtn.click();
  }

  async selectFileAtIndex(index: number): Promise<void> {
    // Scope checkboxes to the files panel to avoid matching checkboxes elsewhere on the page
    const checkboxes = this.fileCards;
    await checkboxes.nth(index).click();
  }

  async waitForFullscreenPreviewOpen(): Promise<void> {
    await this.fullscreenPreviewOverlay.waitFor({
      state: "visible",
      timeout: 10_000,
    });
  }

  async waitForFullscreenPreviewClosed(): Promise<void> {
    await this.fullscreenPreviewOverlay.waitFor({
      state: "hidden",
      timeout: 10_000,
    });
  }

  async pressEscapeInFullscreen(): Promise<void> {
    await this.page.keyboard.press("Escape");
  }

  getViewAllFilesToolbarBtn(): Locator {
    return this.viewAllFilesToolbarBtn;
  }
  getViewAllFilesResultBtn(): Locator {
    return this.viewAllFilesResultBtn;
  }
  getFilesPanelContainer(): Locator {
    return this.filesPanelContainer;
  }
  getFilesPanelTitle(): Locator {
    return this.filesPanelTitle;
  }
  getFilesPanelCloseBtn(): Locator {
    return this.filesPanelCloseBtn;
  }
  getBatchDownloadIconBtn(): Locator {
    return this.batchDownloadIconBtn;
  }
  getFileCards(): Locator {
    return this.fileCards;
  }
  getSelectAllBtn(): Locator {
    return this.selectAllBtn;
  }
  getCancelSelectionBtn(): Locator {
    return this.cancelSelectionBtn;
  }
  getBatchDownloadFooterBtn(): Locator {
    return this.batchDownloadFooterBtn;
  }
  getFullscreenPreviewOverlay(): Locator {
    return this.fullscreenPreviewOverlay;
  }
  getLoadErrorMessage(): Locator {
    return this.loadErrorMessage;
  }
  getRefreshNowBtn(): Locator {
    return this.refreshNowBtn;
  }
  getPackingBadge(): Locator {
    return this.packingBadge;
  }
  getFileCheckboxes(): Locator {
    // Scoped to the files panel — returns file cards in selection mode (role="checkbox")
    return this.fileCards;
  }
}
