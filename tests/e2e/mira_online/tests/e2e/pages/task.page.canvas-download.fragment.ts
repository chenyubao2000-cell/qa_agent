import { type Page, type Locator } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

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
  constructor(
    private readonly page: Page,
    private readonly i18n?: I18n,
  ) {}

  // -- Navigation --

  async gotoTaskWithFiles(taskUrl: string) {
    await this.page.goto(taskUrl, {
      timeout: 45_000,
      waitUntil: "domcontentloaded",
    });
    await this.getFirstFileCard()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {});
  }

  // -- Canvas header locators (scoped to .h-12 inside canvas panel) --

  private getCanvasHeader(): Locator {
    return this.page.locator("main div.border-l .h-12");
  }

  getCanvasDownloadButton(): Locator {
    // First button in canvas header is the download button
    return this.getCanvasHeader().locator("button").first();
  }

  getCanvasMaximizeButton(): Locator {
    // Second-to-last button in canvas header
    return this.getCanvasHeader().locator("button").nth(1);
  }

  getCanvasCloseButton(): Locator {
    // Last button in canvas header
    return this.getCanvasHeader().locator("button").last();
  }

  getCanvasDownloadSpinner(): Locator {
    return this.getCanvasDownloadButton().locator(
      "svg.animate-spin, .animate-spin",
    );
  }

  // -- File cards (ArtifactEntry in chat log) --

  getFirstFileCard(): Locator {
    return this.page
      .locator('[role="log"] div[role="button"]')
      .filter({
        has: this.page.locator("button"),
      })
      .first();
  }

  getFileCardByExt(ext: string): Locator {
    return this.page
      .locator('[role="log"] div[role="button"]')
      .filter({
        hasText: new RegExp(`\\.${ext}`, "i"),
      })
      .first();
  }

  getFileCardByName(name: string | RegExp): Locator {
    return this.page
      .locator('[role="log"] div[role="button"]')
      .filter({
        hasText: name,
      })
      .first();
  }

  getPeopleDataCard(): Locator {
    return this.page
      .locator('[role="log"] div[role="button"]')
      .filter({
        hasText: this.i18n
          ? this.i18n.t("files.types.peopleData")
          : i18nRegex("files.types.peopleData"),
      })
      .first();
  }

  // -- Artifact download button (inline in file card) --

  getArtifactDownloadButton(filename?: string): Locator {
    const dlName = this.i18n
      ? this.i18n.t("tools.complete.downloadFile")
      : i18nRegex("tools.complete.downloadFile");
    if (filename) {
      return this.page
        .locator('[role="log"] div[role="button"]')
        .filter({ hasText: filename })
        .getByRole("button", { name: dlName })
        .first();
    }
    return this.page
      .locator('[role="log"] div[role="button"]')
      .first()
      .getByRole("button", { name: dlName });
  }

  // -- Toast assertions (Sonner) --

  getDownloadSuccessToast(): Locator {
    const pattern = this.i18n
      ? this.i18n.t("canvas.downloadSuccess")
      : i18nRegex("canvas.downloadSuccess");
    return this.page
      .locator("[data-sonner-toast]")
      .getByText(pattern)
      .first()
      .or(this.page.getByText(pattern).first());
  }

  getDownloadErrorToast(): Locator {
    // canvas.downloadError i18n key does not exist in the app source.
    // The app (use-download-with-format.ts) calls toast.error(err.message) with a
    // dynamic JS error string, so we cannot match by text. Instead rely on Sonner's
    // data-type="error" attribute which is always present on error toasts.
    return this.page.locator('[data-sonner-toast][data-type="error"]').first();
  }

  // -- Canvas panel --

  getCanvasPanel(): Locator {
    return this.page.locator("main div.border-l").first();
  }

  // -- Combined actions --

  async openFileInCanvas(ext: string): Promise<void> {
    const card = this.getFileCardByExt(ext);
    await card.waitFor({ state: "visible", timeout: 15_000 });
    await card.click();
    // Wait for canvas panel + header to render
    const header = this.getCanvasHeader();
    try {
      await header.waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      // Retry: click card again if canvas header didn't appear
      await card.click();
      await header.waitFor({ state: "visible", timeout: 15_000 });
    }
  }

  async clickCanvasDownload(): Promise<void> {
    const btn = this.getCanvasDownloadButton();
    await btn.waitFor({ state: "visible", timeout: 15_000 });
    await btn.click();
  }

  async clickArtifactDownload(filename?: string): Promise<void> {
    await this.getArtifactDownloadButton(filename).click();
  }

  async waitForDownloadSuccess(timeout = 30_000): Promise<void> {
    await this.getDownloadSuccessToast().waitFor({
      state: "visible",
      timeout,
    });
  }

  async waitForDownloadError(timeout = 15_000): Promise<void> {
    await this.getDownloadErrorToast().waitFor({ state: "visible", timeout });
  }
}
