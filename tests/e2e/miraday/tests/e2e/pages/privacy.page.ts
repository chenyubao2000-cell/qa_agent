// source: cdp
// baseline: test-cases/generated/page-baseline-privacy.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(legal)/privacy/page.tsx  (metadata.title = "Privacy Policy - Mira"; static markdown content)
//   apps/mira-work/app/(legal)/legal-content.tsx (<Streamdown plugins controls={false} mode="static">)
//   apps/mira-work/app/(legal)/layout.tsx         (LegalLayout footer: © {new Date().getFullYear()} Mira. All rights reserved.)
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name):
//   • Static legal document — no data-testid, no aria-label anywhere in source. Use getByRole heading/link + contentinfo.
//   • Headings come straight from the markdown (# / ## / ###); section titles are stable English literals.
//   • Footer copyright YEAR is dynamic (new Date().getFullYear()) — never assert a hardcoded year.
//   • Body "links" (apollo.io / exa.ai / edpb.europa.eu / ico.org.uk) are genuine markdown links WITH real
//     hrefs in source, but Streamdown mode="static"+controls={false} renders them as inert
//     <button data-streamdown="link"> with NO href. complianceLink() targets the EXPECTED anchor (role=link);
//     under the current build it resolves to zero → TC-CDP-PRIVACY-004 fails, surfacing the compliance defect.
//
// i18n: privacy body is hardcoded English markdown (no t() keys); appLanguages="en" only. POM still accepts the
//   i18n fixture per project convention, with an English literal fallback for the one keyed label (nav privacyPolicy).

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

export class PrivacyPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  private readonly _pageHeading: Locator;
  private readonly _sectionHeadings: Locator;
  private readonly _footer: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // H1 rendered from markdown "# Mira Privacy Policy".
    this._pageHeading = page.getByRole("heading", { level: 1, name: "Mira Privacy Policy" });
    // All top-level "## N. ..." sections render as level-2 headings.
    this._sectionHeadings = page.getByRole("heading", { level: 2 });
    // LegalLayout <footer> → contentinfo landmark.
    this._footer = page.getByRole("contentinfo");
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get pageHeading(): Locator {
    return this._pageHeading;
  }

  get sectionHeadings(): Locator {
    return this._sectionHeadings;
  }

  get footer(): Locator {
    return this._footer;
  }

  /** A top-level section heading (h2) by its exact text, e.g. "1. Overview". */
  sectionHeading(name: string): Locator {
    return this.page.getByRole("heading", { level: 2, name, exact: true });
  }

  /**
   * A body link by its visible text (e.g. "edpb.europa.eu"), expressed as the EXPECTED
   * actionable anchor (role=link). Streamdown static mode currently renders these as inert
   * buttons, so this resolves to zero — intentionally exposing the inert-link defect.
   */
  complianceLink(name: string): Locator {
    return this.page.getByRole("link", { name, exact: true });
  }

  // ── Actions / queries ─────────────────────────────────────────────────────
  /** Open the public privacy policy page (no auth). */
  async goto(): Promise<void> {
    await this.page.goto("/privacy");
    await this._pageHeading.waitFor({ state: "visible", timeout: 20_000 });
  }

  /** Current document <title>. */
  async documentTitle(): Promise<string> {
    return this.page.title();
  }

  /** Current UI locale from <html lang>. */
  async htmlLang(): Promise<string | null> {
    return this.page.locator("html").getAttribute("lang");
  }
}
