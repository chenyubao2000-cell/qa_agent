// POM fragment: share-dialog area (top-bar Share2 button + TaskShareDialog)
// Merge target: tests/e2e/pages/task.page.ts
// Source: features/task/components/task-share-dialog.tsx + share-button.tsx
// generated: 2026-04-28T00:00:00Z

import { type Page, type Locator } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

/**
 * Locators / actions for the top-bar Share2 button and the resulting share dialog
 * (TaskShareDialog component). The dialog has TWO states:
 *   State A — no active share: shows `chatbot.createShareLink` button
 *   State B — active share exists: shows share URL + `chatbot.copyLink` + `chatbot.removeShare`
 */
export class ShareDialogFragment {
  private readonly page: Page;
  private readonly i18n?: I18n;

  // Top-bar share button (lucide-share2 icon). Anchor on stable svg marker —
  // task-header.tsx uses ShareButton with no aria-label, only Share2 icon.
  private readonly shareToolbarBtn: Locator;

  // The dialog itself
  private readonly shareDialog: Locator;
  private readonly shareDialogHeading: Locator;

  // State A — create
  private readonly createShareLinkBtn: Locator;

  // State B — copy / remove / link text
  private readonly copyLinkBtn: Locator;
  private readonly removeShareBtn: Locator;
  private readonly shareUrlText: Locator;

  // Close button (radix Dialog.Close — sr-only "Close" or lucide-x icon)
  private readonly shareDialogCloseBtn: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this.shareToolbarBtn = page
      .locator("button")
      .filter({
        has: page.locator("svg.lucide-share2, svg.lucide-share-2"),
      })
      .first();

    this.shareDialog = page.locator('[role="dialog"]');
    this.shareDialogHeading = this.shareDialog.getByRole("heading", {
      name: i18n
        ? new RegExp(`^${i18n.t("chatbot.shareChat")}$`, "i")
        : i18nRegex("chatbot.shareChat", { exact: true }),
    });

    this.createShareLinkBtn = this.shareDialog.getByRole("button", {
      name: i18n
        ? i18n.t("chatbot.createShareLink")
        : i18nRegex("chatbot.createShareLink"),
    });
    this.copyLinkBtn = this.shareDialog.getByRole("button", {
      name: i18n ? i18n.t("chatbot.copyLink") : i18nRegex("chatbot.copyLink"),
    });
    this.removeShareBtn = this.shareDialog.getByRole("button", {
      name: i18n
        ? i18n.t("chatbot.removeShare")
        : i18nRegex("chatbot.removeShare"),
    });
    // shareUrl is rendered as plain <p> text inside dialog — locate by /share/ + token=
    this.shareUrlText = this.shareDialog
      .locator("p")
      .filter({ hasText: /\/share\/.+token=/ })
      .first();

    this.shareDialogCloseBtn = this.shareDialog
      .locator(
        'button[aria-label="Close"], button:has(svg.lucide-x)',
      )
      .first();
  }

  // ── Getters ──
  getShareToolbarBtn(): Locator {
    return this.shareToolbarBtn;
  }
  getShareDialog(): Locator {
    return this.shareDialog;
  }
  getShareDialogHeading(): Locator {
    return this.shareDialogHeading;
  }
  getCreateShareLinkBtn(): Locator {
    return this.createShareLinkBtn;
  }
  getCopyLinkBtn(): Locator {
    return this.copyLinkBtn;
  }
  getRemoveShareBtn(): Locator {
    return this.removeShareBtn;
  }
  getShareUrlText(): Locator {
    return this.shareUrlText;
  }
  getShareDialogCloseBtn(): Locator {
    return this.shareDialogCloseBtn;
  }

  // ── Actions ──
  async openShareDialog(): Promise<void> {
    // Wait for React hydration: the topbar buttons are rendered server-side
    // but onClick handlers attach only after client hydration completes.
    // Pattern matches the FOLLOWUP/RENAME/MORE flakiness — same root cause.
    await this.shareToolbarBtn.waitFor({ state: "visible", timeout: 15_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    // Pointer-down first (some Radix triggers wire onPointerDown not onClick)
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.shareToolbarBtn.click({ force: true }).catch(() => {});
      try {
        await this.shareDialog.waitFor({ state: "visible", timeout: 5_000 });
        return;
      } catch {
        // Fallback: dispatch native click via DOM (bypasses any pointer-event capture quirk)
        await this.shareToolbarBtn
          .evaluate((el) => (el as HTMLElement).click())
          .catch(() => {});
        try {
          await this.shareDialog.waitFor({ state: "visible", timeout: 5_000 });
          return;
        } catch {
          // brief settle before retry
          await this.page.waitForTimeout(1000);
        }
      }
    }
    // Final attempt with explicit wait — surfaces real failure
    await this.shareDialog.waitFor({ state: "visible", timeout: 5_000 });
  }

  async closeShareDialog(): Promise<void> {
    await this.shareDialogCloseBtn.click();
    await this.shareDialog.waitFor({ state: "hidden", timeout: 10_000 });
  }

  async clickCopyLink(): Promise<void> {
    await this.copyLinkBtn.click();
  }

  async clickCreateShareLink(): Promise<void> {
    await this.createShareLinkBtn.click();
    // Either copyLinkBtn (success) or createShareLinkBtn re-enables (no-op) within 15s
    await this.copyLinkBtn.waitFor({ state: "visible", timeout: 15_000 });
  }

  async clickRemoveShare(): Promise<void> {
    await this.removeShareBtn.click();
    await this.createShareLinkBtn.waitFor({
      state: "visible",
      timeout: 15_000,
    });
  }

  /** Returns true if dialog is currently in State B (active share). */
  async isInActiveShareState(timeoutMs = 3000): Promise<boolean> {
    return await this.copyLinkBtn
      .isVisible({ timeout: timeoutMs })
      .catch(() => false);
  }

  /** Reads the share URL text from the dialog. Throws if not present. */
  async readShareUrlText(): Promise<string> {
    const text = await this.shareUrlText.textContent({ timeout: 5_000 });
    if (!text) throw new Error("Share URL text not found in dialog");
    return text.trim();
  }
}
