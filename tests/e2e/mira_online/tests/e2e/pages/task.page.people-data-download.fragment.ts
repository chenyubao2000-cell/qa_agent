import { type Page, type Locator } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex, i18nTitleSelector } from "../i18n-helpers";

/**
 * POM fragment: People Data download area (S 3.2.5)
 * Merge target: task.page.ts
 * Source: prd | generated: 2026-03-29T00:00:00Z
 */
export class TaskPagePeopleDataDownloadFragment {
  private readonly page: Page;
  private readonly i18n?: I18n;

  // ── People Data tool card (in chat log) ──
  private readonly peopleDataCard: Locator;

  // ── People Data panel header elements ──
  private readonly peopleDataPanelDownloadBtn: Locator;
  private readonly peopleDataPanelCloseBtn: Locator;

  // ── Toast / notification area ──
  private readonly toastContainer: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // People Data tool card — div[role="button"] inside chat log that opens the panel
    this.peopleDataCard = page
      .locator('[role="log"] div[role="button"]')
      .filter({
        hasText: i18n
          ? i18n.t("files.types.peopleData")
          : i18nRegex("files.types.peopleData"),
      })
      .first();

    // Download button inside People Data panel header (title attr from i18n)
    this.peopleDataPanelDownloadBtn = i18n
      ? page
          .locator(
            `div.flex.h-12 button[title="${i18n.t("canvas.downloadFile")}"]`,
          )
          .first()
      : page
          .locator(i18nTitleSelector("button", "canvas.downloadFile"))
          .first();

    // Close button in People Data panel header (title attr from i18n)
    this.peopleDataPanelCloseBtn = i18n
      ? page
          .locator(`div.flex.h-12 button[title="${i18n.t("canvas.close")}"]`)
          .first()
      : page.locator(i18nTitleSelector("button", "canvas.close")).last();

    // Sonner toast container
    this.toastContainer = page.locator("[data-sonner-toast]");
  }

  // ── Getters ──

  /**
   * The People Data tool card button shown in the chat log.
   * Clicking this opens the right-side People Data panel.
   */
  getPeopleDataCard(): Locator {
    return this.peopleDataCard;
  }

  /**
   * The download button (DownloadIcon) in the People Data panel header.
   * Scoped to the panel header bar (div.flex.h-12) to avoid strict mode violations
   * from identically-named download buttons in the chat log.
   */
  getPeopleDataPanelDownloadButton(): Locator {
    const panelHeader = this.page.locator("div.flex.h-12");
    if (this.i18n) {
      const label = this.i18n.t("canvas.downloadFile");
      return panelHeader.locator(`button[title="${label}"]`).first();
    }
    return panelHeader
      .locator(i18nTitleSelector("button", "canvas.downloadFile"))
      .first();
  }

  /**
   * The close button (XIcon) in the People Data panel header.
   * Scoped to the panel header bar to avoid ambiguity.
   */
  getPeopleDataPanelCloseButton(): Locator {
    const panelHeader = this.page.locator("div.flex.h-12");
    if (this.i18n) {
      const label = this.i18n.t("canvas.close");
      return panelHeader.locator(`button[title="${label}"]`).first();
    }
    return panelHeader
      .locator(i18nTitleSelector("button", "canvas.close"))
      .last();
  }

  /**
   * The file name text shown in the People Data panel header (truncated <p> tag).
   */
  getPeopleDataPanelFilename(): Locator {
    // The filename is a <p> tag with truncate class inside the panel header
    return this.page.locator("div.flex.h-12 p.truncate").first();
  }

  /**
   * Toast notification container (Sonner toast).
   */
  getToast(): Locator {
    return this.toastContainer;
  }

  /**
   * Toast with specific text — used for error/success assertions.
   */
  getToastWithText(text: string): Locator {
    return this.page.getByText(text).first();
  }

  // ── Actions ──

  /**
   * Navigate to a task detail page and wait for content to load.
   */
  async gotoTask(taskUrl: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto(taskUrl, { timeout: 30_000 });
        await this.page.waitForLoadState("domcontentloaded");
        await this.page
          .locator('[role="log"]')
          .waitFor({ state: "visible", timeout: 15_000 })
          .catch(() => {});
        return;
      } catch (e) {
        if (attempt < 2) await this.page.waitForTimeout(2000);
        else throw e;
      }
    }
  }

  /**
   * Click the People Data tool card in the chat log to open the panel.
   * Waits for the card to be visible first.
   */
  async openPeopleDataPanel(): Promise<void> {
    await this.page
      .locator('[role="log"]')
      .waitFor({ state: "visible", timeout: 15_000 });
    const card = this.getPeopleDataCard();
    await card.waitFor({ state: "visible", timeout: 15_000 });
    // Scroll the card into view before clicking (chat log can be long)
    await card.scrollIntoViewIfNeeded();
    await card.click();
    // Wait for panel header filename to appear; retry click once if panel didn't open
    const filename = this.getPeopleDataPanelFilename();
    try {
      await filename.waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      await card.click({ force: true });
      await filename.waitFor({ state: "visible", timeout: 10_000 });
    }
  }

  /**
   * Click the download button in the People Data panel header.
   * Returns the download promise so caller can await the actual file download.
   */
  async clickPeopleDataDownloadButton(): Promise<void> {
    const btn = this.getPeopleDataPanelDownloadButton();
    await btn.waitFor({ state: "visible", timeout: 10_000 });
    await btn.click();
  }

  /**
   * Click the close button in the People Data panel header.
   */
  async closePeopleDataPanel(): Promise<void> {
    const btn = this.getPeopleDataPanelCloseButton();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
  }
}
