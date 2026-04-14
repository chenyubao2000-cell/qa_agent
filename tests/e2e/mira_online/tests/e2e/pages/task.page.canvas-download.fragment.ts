import { type Page, type Locator } from '@playwright/test';
import type { I18n } from '../fixtures';

/**
 * POM fragment: Canvas Download feature
 *
 * CDP-verified (2026-03-29, task hxWr07LasxF6tFG3):
 * - ArtifactEntry cards: div[role="button"] with rounded-xl border p-3,
 *   inner download <button> has span.sr-only text ("Download file" / "下载文件")
 * - Canvas header: .h-12 inside main div.border-l, buttons use title attr for a11y name
 * - Download is DIRECT - no format dropdown. Original for normal files, xlsx for people-data.
 * - Download flow: /api/files/verify → R2 fetch → blob download (no /api/r2/ route)
 * - Toast from Sonner: "Download successful" / "下载成功" (canvas namespace)
 */
export class CanvasDownloadFragment {
  constructor(private readonly page: Page, private readonly i18n?: I18n) {}

  // -- Navigation --

  async gotoTaskWithFiles(taskUrl: string) {
    await this.page.goto(taskUrl, { timeout: 45_000, waitUntil: 'domcontentloaded' });
    await this.getFirstFileCard()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => {});
  }

  // -- Canvas header locators (scoped to .h-12 inside canvas panel) --

  private getCanvasHeader(): Locator {
    return this.page.locator('main div.border-l .h-12');
  }

  getCanvasDownloadButton(): Locator {
    // First button in canvas header is the download button (title="Download file" / "下载文件")
    return this.getCanvasHeader().locator('button').first();
  }

  getCanvasMaximizeButton(): Locator {
    // Second-to-last button in canvas header (title="Maximize" / "最大化")
    return this.getCanvasHeader().locator('button').nth(1);
  }

  getCanvasCloseButton(): Locator {
    // Last button in canvas header (title="Close" / "关闭")
    return this.getCanvasHeader().locator('button').last();
  }

  getCanvasDownloadSpinner(): Locator {
    return this.getCanvasDownloadButton().locator('svg.animate-spin, .animate-spin');
  }

  // -- File cards (ArtifactEntry in chat log) --

  getFirstFileCard(): Locator {
    return this.page.locator('[role="log"] div[role="button"]').filter({
      has: this.page.locator('button'),
    }).first();
  }

  getFileCardByExt(ext: string): Locator {
    return this.page.locator('[role="log"] div[role="button"]').filter({
      hasText: new RegExp(`\\.${ext}`, 'i'),
    }).first();
  }

  getFileCardByName(name: string | RegExp): Locator {
    return this.page.locator('[role="log"] div[role="button"]').filter({
      hasText: name,
    }).first();
  }

  getPeopleDataCard(): Locator {
    return this.page.locator('[role="log"] div[role="button"]').filter({
      hasText: /人才数据|People Data|\d+ 人/i,
    }).first();
  }

  // -- Artifact download button (inline in file card) --

  getArtifactDownloadButton(filename?: string): Locator {
    const dlName = /Download file|下载文件/i;
    if (filename) {
      return this.page.locator('[role="log"] div[role="button"]')
        .filter({ hasText: filename })
        .getByRole('button', { name: dlName })
        .first();
    }
    return this.page.locator('[role="log"] div[role="button"]')
      .first()
      .getByRole('button', { name: dlName });
  }

  // -- Toast assertions (Sonner) --

  getDownloadSuccessToast(): Locator {
    // Sonner toast: scope to [data-sonner-toast] to avoid matching unrelated page text.
    // Fallback to page-wide search for resilience.
    return this.page.locator('[data-sonner-toast]').getByText(
      /Download successful|File downloaded successfully|文件下载成功|下载成功/i
    ).first().or(
      this.page.getByText(/Download successful|File downloaded successfully|文件下载成功|下载成功/i).first()
    );
  }

  getDownloadErrorToast(): Locator {
    return this.page.locator('[data-sonner-toast]').getByText(
      /Failed to|下载失败|文件下载失败|格式转换失败|Internal Server Error|500/i
    ).first().or(
      this.page.getByText(/Failed to|下载失败|文件下载失败|格式转换失败|Internal Server Error|500/i).first()
    );
  }

  // -- Canvas panel --

  getCanvasPanel(): Locator {
    return this.page.locator('main div.border-l').first();
  }

  // -- Combined actions --

  async openFileInCanvas(ext: string): Promise<void> {
    const card = this.getFileCardByExt(ext);
    await card.waitFor({ state: 'visible', timeout: 15_000 });
    await card.click();
    // Wait for canvas panel + header to render
    const header = this.getCanvasHeader();
    try {
      await header.waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      // Retry: click card again if canvas header didn't appear
      await card.click();
      await header.waitFor({ state: 'visible', timeout: 15_000 });
    }
  }

  async clickCanvasDownload(): Promise<void> {
    const btn = this.getCanvasDownloadButton();
    await btn.waitFor({ state: 'visible', timeout: 15_000 });
    await btn.click();
  }

  async clickArtifactDownload(filename?: string): Promise<void> {
    await this.getArtifactDownloadButton(filename).click();
  }

  async waitForDownloadSuccess(timeout = 30_000): Promise<void> {
    await this.getDownloadSuccessToast().waitFor({ state: 'visible', timeout });
  }

  async waitForDownloadError(timeout = 15_000): Promise<void> {
    await this.getDownloadErrorToast().waitFor({ state: 'visible', timeout });
  }
}
