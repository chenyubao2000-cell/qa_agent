// source: cdp
// baseline: test-cases/generated/page-baseline-terms.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(legal)/terms/page.tsx        (TermsOfServicePage — renders <LegalContent>)
//   apps/mira-work/app/(legal)/legal-content.tsx      (Streamdown mode="static", controls=false)
//
// Locator strategy (hasTestIds=false, no aria-label, no i18n keys — dominantStrategy=role+text):
//   • Page is a hardcoded English static markdown string rendered via Streamdown. NOT i18n-wired,
//     so all text below is literal English (no i18n.t() lookups). The POM still accepts the shared
//     `i18n` fixture for signature consistency with other POMs in this project.
//   • Streamdown renders markdown links (both internal [Privacy Policy](/privacy) and
//     mailto:support@mira.day) as <button type="button" data-streamdown="link"> with NO href.
//     "Privacy Policy" appears twice (Sec.1, 9.1) and "support@mira.day" 5x — both use .first().
//   • Headings are real <h1>/<h2> elements → getByRole('heading', { level }).

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

export class TermsPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Page structure ────────────────────────────────────────────────────────
  private readonly _mainHeading: Locator;
  private readonly _sectionHeadings: Locator;
  private readonly _firstSectionHeading: Locator;
  private readonly _lastSectionHeading: Locator;

  // ── Markdown links (rendered by Streamdown as inert <button>) ──────────────
  private readonly _privacyPolicyLink: Locator;
  private readonly _supportEmailLink: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._mainHeading = page.getByRole("heading", { level: 1, name: "Mira Terms of Service" });
    // All second-level section headings (§1 … §14, incl. §2.2).
    this._sectionHeadings = page.getByRole("heading", { level: 2 });
    this._firstSectionHeading = page.getByRole("heading", { name: "1. Acceptance of Terms" });
    this._lastSectionHeading = page.getByRole("heading", { name: "14. General Provisions" });

    // Rendered as <button>, appears multiple times → bind the first occurrence.
    this._privacyPolicyLink = page.getByRole("button", { name: "Privacy Policy" }).first();
    this._supportEmailLink = page.getByRole("button", { name: "support@mira.day" }).first();
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get mainHeading(): Locator { return this._mainHeading; }
  get sectionHeadings(): Locator { return this._sectionHeadings; }
  get firstSectionHeading(): Locator { return this._firstSectionHeading; }
  get lastSectionHeading(): Locator { return this._lastSectionHeading; }
  get privacyPolicyLink(): Locator { return this._privacyPolicyLink; }
  get supportEmailLink(): Locator { return this._supportEmailLink; }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open the public Terms of Service page (no auth). */
  async goto(): Promise<void> {
    await this.page.goto("/terms");
    await this._mainHeading.waitFor({ state: "visible", timeout: 20_000 });
  }

  /** document.title of the current page. */
  async pageTitle(): Promise<string> {
    return this.page.title();
  }

  /** Number of second-level (H2) section headings rendered. */
  async sectionHeadingCount(): Promise<number> {
    return this._sectionHeadings.count();
  }

  /** Click the in-body "Privacy Policy" cross-reference (Sec.1). */
  async clickPrivacyPolicyLink(): Promise<void> {
    await this._privacyPolicyLink.click();
  }
}
