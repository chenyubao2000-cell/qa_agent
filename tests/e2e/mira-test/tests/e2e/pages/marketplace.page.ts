// source: cdp
// baseline: test-cases/generated/page-baseline-marketplace.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/marketplace/page.tsx                    (MarketplacePage — server gate)
//   apps/mira-work/app/(agent)/marketplace/marketplace-home-client.tsx (MarketplaceHomeClient — UI)
//   i18n namespace: skill.marketplace.* (title/back/published/publishNew/totalCount),
//                   skill.marketplace.categories.*, skill.marketplace.sort.*,
//                   skill.marketplace.pagination.*, skill.marketplace.card.*
//
// Locator strategy (hasTestIds=false, dominantStrategy = role + name):
//   • No data-testid anywhere in the page/child components — every locator is role/name.
//   • The `skill.marketplace.*` namespace is NOT present in this QA project's messages/en.json
//     (no top-level `skill` key at all — verified). The live page renders correct English via
//     the app's own bundled next-intl catalog, so i18n.t() here returns the raw key. This is a
//     single-locale ("en") deployment, so observed English CDP literals are used as fallbacks
//     via t(key, fallback) — identical pattern to files.page.ts / contacts.page.ts.
//   • Category chips, sort trigger, and sort menu items are plain <button>/role=menuitem with
//     text labels. NEVER use Tailwind utility classes (rounded-full, bg-foreground, …) as
//     locators (baseline locatorProfile + flakiness-playbook §3).
//   • Listing cards are <Card> (div, no role); each card title is an <h2> (role=heading level 2),
//     used as the card-count anchor.
//   • Counter line text is interpolated ("All skills (N)") and its key is absent from the fixture,
//     so it is matched by the live-rendered regex /All skills \(\d+\)/, not i18n.t().
//   • Sort trigger label mutates with the current sort (Newest first ↔ Oldest first); it is
//     located by the /Newest first|Oldest first/ regex so the same getter works in both states.
//     Sort menu items are scoped inside getByRole('menu') to avoid clashing with the trigger.
//   • Pagination prev/next carry aria-label ("Previous"/"Next"); page buttons carry aria-label
//     "Page N". The active page button has aria-current="page".

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "skill.marketplace.title",
  back: "skill.marketplace.back",
  published: "skill.marketplace.published",
  publishNew: "skill.marketplace.publishNew",
  catRecruit: "skill.marketplace.categories.recruit",
  sortLatest: "skill.marketplace.sort.latest",
  sortOldest: "skill.marketplace.sort.oldest",
  paginationPrev: "skill.marketplace.pagination.prev",
  paginationNext: "skill.marketplace.pagination.next",
} as const;

export class MarketplacePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Topbar (S0) ──────────────────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _backButton: Locator;
  private readonly _publishedButton: Locator;
  private readonly _publishNewButton: Locator;

  // ── Filters + sort (S0 / S2) ───────────────────────────────────────────────────
  private readonly _sortTrigger: Locator;
  private readonly _sortMenu: Locator;

  // ── Counter + grid (S0 / S1) ───────────────────────────────────────────────────
  private readonly _counterLine: Locator;
  private readonly _listingCards: Locator;

  // ── Pagination (S0 / S1) ───────────────────────────────────────────────────────
  private readonly _paginationNav: Locator;
  private readonly _prevButton: Locator;
  private readonly _nextButton: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", { level: 1, name: this.t(KEYS.title, "Skill Marketplace") });
    this._backButton = page.getByRole("button", { name: this.t(KEYS.back, "Back"), exact: true });
    this._publishedButton = page.getByRole("button", { name: this.t(KEYS.published, "My Published"), exact: true });
    this._publishNewButton = page.getByRole("button", { name: this.t(KEYS.publishNew, "Publish new skill"), exact: true });

    // Sort trigger label mutates with current sort — match either literal so one getter serves
    // both states. Menu items live inside role=menu (scoped in sortMenuItem()).
    this._sortTrigger = page.getByRole("button", {
      name: new RegExp(`${this.escape(this.t(KEYS.sortLatest, "Newest first"))}|${this.escape(this.t(KEYS.sortOldest, "Oldest first"))}`),
    });
    this._sortMenu = page.getByRole("menu");

    // Counter key is absent from the fixture and is interpolated on the live page — match the
    // rendered text pattern, not an i18n key.
    this._counterLine = page.getByText(/All skills \(\d+\)/);
    // Each listing card renders its skill name as an <h2> (role=heading level 2).
    this._listingCards = page.getByRole("heading", { level: 2 });

    this._paginationNav = page.getByRole("navigation", { name: "Pagination" });
    this._prevButton = this._paginationNav.getByRole("button", { name: this.t(KEYS.paginationPrev, "Previous"), exact: true });
    this._nextButton = this._paginationNav.getByRole("button", { name: this.t(KEYS.paginationNext, "Next"), exact: true });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  private escape(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ── Public getters ──────────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get backButton(): Locator { return this._backButton; }
  get publishedButton(): Locator { return this._publishedButton; }
  get publishNewButton(): Locator { return this._publishNewButton; }
  get sortTrigger(): Locator { return this._sortTrigger; }
  get sortMenu(): Locator { return this._sortMenu; }
  get counterLine(): Locator { return this._counterLine; }
  get listingCards(): Locator { return this._listingCards; }
  get paginationNav(): Locator { return this._paginationNav; }
  get prevButton(): Locator { return this._prevButton; }
  get nextButton(): Locator { return this._nextButton; }

  /** A category filter chip by its (English fallback) label, e.g. "Recruit". */
  categoryChip(name: string): Locator {
    return this.page.getByRole("button", { name, exact: true });
  }

  /** A sort dropdown menu item, scoped inside role=menu to avoid clashing with the trigger. */
  sortMenuItem(name: string): Locator {
    return this._sortMenu.getByRole("menuitem", { name, exact: true });
  }

  /** A pagination page-number button by 1-based index, e.g. pageButton(2) → aria-label "Page 2". */
  pageButton(n: number): Locator {
    return this._paginationNav.getByRole("button", { name: `Page ${n}`, exact: true });
  }

  // ── Actions ──────────────────────────────────────────────────────────────────────
  /** Open the authenticated Marketplace page. Auth via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/marketplace");
    // Wait for the h1, then a hydration-readiness proxy — this deployment ships the SSR
    // skeleton before React attaches handlers; interacting too early silently no-ops.
    // See e2e-flakiness-playbook.md §19b.
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Number of listing cards currently rendered (h2 skill-name headings). */
  async cardCount(): Promise<number> {
    return this._listingCards.count();
  }

  /** Parse the integer N from the counter line "All skills (N)"; null if not present/parseable. */
  async counterCount(): Promise<number | null> {
    const txt = await this._counterLine.textContent();
    const m = txt?.match(/\((\d+)\)/);
    return m ? Number(m[1]) : null;
  }

  /** Click a category chip and wait for the counter line to settle after the client re-fetch. */
  async selectCategory(name: string): Promise<void> {
    await this.categoryChip(name).click();
    // Client-side query re-fetches; give the counter a beat to reflect the new result set.
    await this._counterLine.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Open the sort dropdown menu. */
  async openSortMenu(): Promise<void> {
    await this._sortTrigger.click();
    await this._sortMenu.waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Open the sort menu and select an option (e.g. "Oldest first"); waits for the menu to close. */
  async selectSort(name: string): Promise<void> {
    await this.openSortMenu();
    await this.sortMenuItem(name).click();
    await this._sortMenu.waitFor({ state: "hidden", timeout: 10_000 });
  }

  /** Navigate to a 1-based page number via its pagination button. */
  async goToPage(n: number): Promise<void> {
    await this.pageButton(n).click();
  }
}
