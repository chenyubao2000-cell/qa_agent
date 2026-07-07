// source: cdp
// baseline: test-cases/generated/page-baseline-files.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/files/page.tsx        (FilesRoute — route)
//   apps/mira-work/features/files/files-page.tsx     (FilesPage — header toolbar + state machine)
//   apps/mira-work/features/files/files-view.tsx     (FilesView — list/grid section)
//   i18n namespace: root → files.page.* / files.tabs.* / files.search.* / files.empty.*
//
// Locator strategy (hasTestIds=false, dominantStrategy = role + i18n-derived name):
//   • No stable data-testid on toolbar/tab controls — every locator is role/name.
//   • The `files.*` root-namespace keys used by the toolbar/tabs/empty-state are NOT merged
//     into this QA project's messages/en.json (only files.types.* exists there), so i18n.t()
//     returns the raw key. This is a single-locale ("en") deployment, so the observed English
//     CDP literals are used as fallbacks via t(key, fallback) — identical to contacts.page.ts.
//   • File rows vs. group-section headers: both are role=button. File rows carry a metadata
//     suffix with a middot separator ("… Text · 12 KB · 6/23"); group headers do NOT
//     ("Untitled channel (1 files) 6/23"). fileRows scopes on name /·/ to exclude group headers.
//   • Source tabs use aria-selected (role=tab), NOT checked. View toggle uses role=radio (checked).
//   • Clearing the search box: fill('') silently no-ops on this controlled input (same class of
//     control as contacts); clearSearch() uses keyboard select-all + Backspace instead.
//   • mainScrollMetrics() measures the scrollable ancestor of the h1 via evaluate — used by the
//     Grid-view horizontal-overflow regression guard (baseline knownIssue S2). Class-based
//     selectors are avoided per flakiness-playbook §3; the ancestor is found by computed overflow.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "files.page.title",
  searchPlaceholder: "files.search.placeholder",
  tabAll: "files.tabs.all",
  tabUserUpload: "files.tabs.user_upload",
  clearFilters: "files.empty.no_search_results.clear_filters",
  emptyTitle: "files.empty.no_search_results.title",
} as const;

export interface ScrollMetrics {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}

export class FilesPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Header + toolbar (S0) ──────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _searchInput: Locator;
  private readonly _groupByButton: Locator;
  private readonly _sortByButton: Locator;
  private readonly _filterButton: Locator;

  // ── View toggle (S0 / S2) ──────────────────────────────────────────────────
  private readonly _listViewRadio: Locator;
  private readonly _gridViewRadio: Locator;

  // ── Source tabs (S0 / S1) ──────────────────────────────────────────────────
  private readonly _sourceTablist: Locator;
  private readonly _allTab: Locator;
  private readonly _miraGeneratedTab: Locator;
  private readonly _myUploadsTab: Locator;

  // ── File list (S0) ─────────────────────────────────────────────────────────
  private readonly _fileRows: Locator;

  // ── Empty state (S1) ───────────────────────────────────────────────────────
  private readonly _emptyTitle: Locator;
  private readonly _clearFiltersButton: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", { level: 1, name: this.t(KEYS.title, "Files") });
    this._searchInput = page.getByRole("textbox", { name: /Search by file name/i });
    this._groupByButton = page.getByRole("button", { name: "Group files by", exact: true });
    this._sortByButton = page.getByRole("button", { name: "Sort files by", exact: true });
    this._filterButton = page.getByRole("button", { name: "Filter files", exact: true });

    this._listViewRadio = page.getByRole("radio", { name: "List view", exact: true });
    this._gridViewRadio = page.getByRole("radio", { name: "Grid view", exact: true });

    this._sourceTablist = page.getByRole("tablist", { name: /Filter by source/i });
    this._allTab = this._sourceTablist.getByRole("tab", { name: "All", exact: true });
    // "Mira Generated" label is interpolated with {twinName} (renders e.g. "Mira11111 Generated")
    // — match on the stable suffix, never a literal.
    this._miraGeneratedTab = this._sourceTablist.getByRole("tab", { name: /Generated$/ });
    this._myUploadsTab = this._sourceTablist.getByRole("tab", { name: "My Uploads", exact: true });

    // File rows are role=button carrying a "· {size} · {date}" metadata suffix; the middot
    // distinguishes them from grouped-section header buttons ("Untitled channel (1 files) 6/23").
    this._fileRows = page.getByRole("button", { name: /·/ });

    this._emptyTitle = page.getByText(/No matching files/i);
    this._clearFiltersButton = page.getByRole("button", { name: this.t(KEYS.clearFilters, "Clear filters"), exact: true });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get searchInput(): Locator { return this._searchInput; }
  get groupByButton(): Locator { return this._groupByButton; }
  get sortByButton(): Locator { return this._sortByButton; }
  get filterButton(): Locator { return this._filterButton; }
  get listViewRadio(): Locator { return this._listViewRadio; }
  get gridViewRadio(): Locator { return this._gridViewRadio; }
  get sourceTablist(): Locator { return this._sourceTablist; }
  get allTab(): Locator { return this._allTab; }
  get miraGeneratedTab(): Locator { return this._miraGeneratedTab; }
  get myUploadsTab(): Locator { return this._myUploadsTab; }
  get fileRows(): Locator { return this._fileRows; }
  get emptyTitle(): Locator { return this._emptyTitle; }
  get clearFiltersButton(): Locator { return this._clearFiltersButton; }

  // ── Actions ──────────────────────────────────────────────────────────────────
  /** Open the authenticated Files page. Auth is applied via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/files");
    // Wait for the h1 to render, then a hydration-readiness proxy — SSR ships the
    // skeleton before React attaches handlers; interacting too early silently
    // no-ops on this deployment. See e2e-flakiness-playbook.md §19b.
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Number of file rows currently rendered (excludes group-section headers). */
  async fileRowCount(): Promise<number> {
    return this._fileRows.count();
  }

  /** Click the "My Uploads" source tab (→ empty-state S1 on this account, URL ?sources=user_upload). */
  async selectMyUploadsTab(): Promise<void> {
    await this._myUploadsTab.click();
  }

  /** Click the "All" source tab (→ populated list S0). */
  async selectAllTab(): Promise<void> {
    await this._allTab.click();
  }

  /** Click the "Clear filters" button shown in the filtered empty state. */
  async clearFilters(): Promise<void> {
    await this._clearFiltersButton.click();
  }

  /** Toggle to Grid view and wait for the radio to report checked. */
  async switchToGridView(): Promise<void> {
    await this._gridViewRadio.click();
    await this._gridViewRadio.waitFor({ state: "visible" });
  }

  /** Toggle to List view and wait for the radio to report checked. */
  async switchToListView(): Promise<void> {
    await this._listViewRadio.click();
    await this._listViewRadio.waitFor({ state: "visible" });
  }

  /** Type a query into the search box (debounced; syncs to ?q= and refetches). */
  async search(query: string): Promise<void> {
    await this._searchInput.click();
    await this._searchInput.fill(query);
  }

  /**
   * Clear the search box. fill('') silently no-ops on this controlled input —
   * use keyboard select-all + Backspace instead (same class of control as contacts).
   */
  async clearSearch(): Promise<void> {
    await this._searchInput.click();
    await this._searchInput.press("ControlOrMeta+a");
    await this._searchInput.press("Backspace");
  }

  /**
   * Measure the main scrollable container (scrollable ancestor of the h1). Used by the
   * Grid-view horizontal-overflow regression guard. A correctly-laid-out file browser
   * toolbar must not scroll horizontally: scrollWidth ≈ clientWidth and scrollLeft === 0.
   */
  async mainScrollMetrics(): Promise<ScrollMetrics | null> {
    return this.page.evaluate(() => {
      const h1 = document.querySelector("h1");
      let el: HTMLElement | null = h1?.parentElement ?? null;
      while (el && el !== document.body) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === "auto" || oy === "scroll") break;
        el = el.parentElement;
      }
      if (!el || el === document.body) {
        // Fallback to the documented container selector from the baseline S2 note.
        el = document.querySelector<HTMLElement>("div.overflow-y-auto.min-h-0");
      }
      if (!el) return null;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollLeft: el.scrollLeft };
    });
  }
}
