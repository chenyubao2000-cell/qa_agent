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
   * The inline download button embedded in the chat-log People Data card
   * (before the side panel is opened). Clicking this triggers the direct
   * client-side JSON→XLSX conversion path, producing a sheetjs XLSX blob
   * regardless of panel state. Prefer this for asserting "download is XLSX"
   * — the panel-header button's download path depends on preview cache state
   * and is unreliable under Playwright.
   */
  getPeopleDataInlineDownloadButton(): Locator {
    // The inline download-icon button embedded in the People Data card in chat log,
    // anchored on the lucide-download svg (locale-independent + stable marker).
    return this.page
      .locator('[role="log"] button:has(svg.lucide-download)')
      .first();
  }

  async clickPeopleDataInlineDownloadButton(): Promise<void> {
    const btn = this.getPeopleDataInlineDownloadButton();
    await btn.waitFor({ state: "visible", timeout: 10_000 });
    await btn.click({ force: true });
  }

  /**
   * Click the close button in the People Data panel header.
   */
  async closePeopleDataPanel(): Promise<void> {
    const btn = this.getPeopleDataPanelCloseButton();
    await btn.waitFor({ state: "visible", timeout: 5_000 });
    await btn.click();
  }

  /**
   * Install a client-side spy capturing blob-based downloads.
   *
   * Why: the download button runs JS that (a) fetches the raw JSON, (b) converts
   * it to XLSX client-side via a sheetjs-like library, (c) triggers a <a download>
   * click on a Blob URL. Playwright's `page.waitForEvent('download')` in headless
   * chrome captures the upstream raw JSON fetch, missing the client XLSX blob.
   * This spy hooks `URL.createObjectURL` + `HTMLAnchorElement.download` setter
   * so assertions can check the actual Blob MIME that the user sees.
   */
  async installDownloadSpy(): Promise<void> {
    // Use addInitScript so the hook is in place BEFORE any page script runs —
    // this captures blobs created during panel mount / preview eagerly. Also apply
    // to the current window in case the page already loaded.
    const hookFn = () => {
      (window as any).__dlEvents = [];
      const desc = Object.getOwnPropertyDescriptor(
        HTMLAnchorElement.prototype,
        "download",
      );
      Object.defineProperty(HTMLAnchorElement.prototype, "download", {
        set(v: string) {
          (window as any).__dlEvents.push({
            type: "download=",
            v,
            href: this.href,
          });
          return desc!.set!.call(this, v);
        },
        get() {
          return desc!.get!.call(this);
        },
        configurable: true,
      });
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob: Blob) {
        const url = origCreate.call(URL, blob);
        try {
          (window as any).__dlEvents.push({
            type: "blob",
            mime: (blob as any)?.type,
            size: (blob as any)?.size,
            url,
          });
        } catch {}
        return url;
      };
    };
    await this.page.addInitScript(hookFn);
    // Apply to the already-loaded page too (idempotent — overwrites any existing hook).
    await this.page.evaluate(hookFn);
  }

  /**
   * Clear events captured so far — call right before a fresh click when the page
   * has done preliminary work (e.g. panel mount fetches) that could pollute the
   * spy buffer. Does not uninstall the hook.
   */
  async resetDownloadSpy(): Promise<void> {
    await this.page.evaluate(() => {
      (window as any).__dlEvents = [];
    });
  }

  /**
   * Read spy data captured after a download click. Returns the blob MIME,
   * its size, the value of `<a download>`, and a computed "effective filename"
   * matching what the user's browser would save (download attr + MIME-inferred
   * extension when the attr has none). Use this instead of
   * `download.suggestedFilename()` when the app performs client-side conversion.
   */
  async getCapturedDownload(
    options: { timeoutMs?: number; expectedBlobMime?: string | RegExp } = {},
  ): Promise<{
    blobMime?: string;
    blobSize?: number;
    downloadAttr?: string;
    effectiveFilename?: string;
  }> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const deadline = Date.now() + timeoutMs;
    const mimeMatches = (mime?: string): boolean => {
      if (!options.expectedBlobMime) return !!mime;
      if (!mime) return false;
      return options.expectedBlobMime instanceof RegExp
        ? options.expectedBlobMime.test(mime)
        : options.expectedBlobMime === mime;
    };
    const MIME_TO_EXT: Record<string, string> = {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "xlsx",
      "application/vnd.ms-excel": "xls",
      "application/json": "json",
      "text/csv": "csv",
      "application/pdf": "pdf",
    };
    const pick = (
      events: any[],
    ): {
      blobMime?: string;
      blobSize?: number;
      downloadAttr?: string;
      effectiveFilename?: string;
    } => {
      const blobs = events.filter((e) => e.type === "blob");
      let blob: any = blobs[blobs.length - 1];
      // If caller specified an expected MIME, prefer the latest blob matching it.
      if (options.expectedBlobMime) {
        const match = [...blobs].reverse().find((b) => mimeMatches(b.mime));
        if (match) blob = match;
      }
      const dl = [...events].reverse().find((e) => e.type === "download=");
      let effective: string | undefined;
      if (dl?.v) {
        effective = dl.v;
        if (!/\.[a-z0-9]{2,5}$/i.test(effective) && blob?.mime) {
          const ext = MIME_TO_EXT[blob.mime];
          if (ext) effective = `${effective}.${ext}`;
        }
      }
      return {
        blobMime: blob?.mime,
        blobSize: blob?.size,
        downloadAttr: dl?.v,
        effectiveFilename: effective,
      };
    };
    let captured: ReturnType<typeof pick> = {};
    while (Date.now() < deadline) {
      const events: any[] = await this.page.evaluate(
        () => (window as any).__dlEvents || [],
      );
      captured = pick(events);
      if (captured.downloadAttr && mimeMatches(captured.blobMime))
        return captured;
      await this.page.waitForTimeout(250);
    }
    return captured;
  }
}
