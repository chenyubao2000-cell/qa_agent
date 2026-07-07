// source: cdp
// baseline: test-cases/generated/page-baseline-channels.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/channels/page.tsx                              (ChannelsPage — route)
//   apps/mira-work/features/channels/components/channel-list-client.tsx        (list state machine)
//   apps/mira-work/features/channels/components/channel-list-header.tsx        (h1 + subtitle + search + New channel)
//   apps/mira-work/features/channels/components/channel-empty-state.tsx        (noMatch / initial variants)
//   apps/mira-work/features/channels/components/channel-row.tsx                (row: data-slot, kebab menu)
//   i18n namespace: agent → channel.list.*
//
// Locator strategy (hasTestIds=false, dominantStrategy = aria-label + role/name; data-slot fallback):
//   • No data-testid exists anywhere in the channels feature source — every locator is role/name
//     or the stable data-slot="channel-row" / "channel-empty-state" attributes.
//   • The `agent` i18n namespace lives in a separate source file (agent.json) that is NOT merged
//     into this QA project's messages/en.json, so i18n.t() returns the raw key. This is a
//     single-locale ("en") deployment, so the observed English CDP literals are used as fallbacks
//     via t(key, fallback) — identical to contacts.page.ts.
//   • Search affordance: collapsed = ghost icon button (aria-label "Search channels"); expanded =
//     text input (placeholder "Search channels"). Different roles, conditionally rendered — no clash.
//   • Row "More actions" kebab button is `opacity-0` until the row is hovered (Tailwind hover-reveal,
//     see e2e-flakiness-playbook.md §8/§11) — openFirstRowMenu() hovers the row before clicking.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "channel.list.title",
  searchPlaceholder: "channel.list.searchPlaceholder",
  clearSearch: "channel.list.clearSearch",
  newButton: "channel.list.newButton",
  moreActions: "channel.list.moreActions",
  emptyNoMatchTitle: "channel.list.emptyNoMatchTitle",
  emptyNoMatchSubtitle: "channel.list.emptyNoMatchSubtitle",
  menuShare: "channel.list.menuShare",
  menuRename: "channel.list.menuRename",
  menuDelete: "channel.list.menuDelete",
} as const;

export class ChannelsPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Header (S0) ────────────────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _subtitle: Locator;
  private readonly _newChannelButton: Locator;

  // ── Search affordance (S0 / S1) ─────────────────────────────────────────────
  private readonly _searchToggleButton: Locator; // collapsed ghost icon button
  private readonly _searchInput: Locator; // expanded text input
  private readonly _clearSearchButton: Locator;

  // ── List rows (S0) ───────────────────────────────────────────────────────────
  private readonly _channelRows: Locator;

  // ── Empty state — noMatch (S2) ────────────────────────────────────────────────
  private readonly _emptyState: Locator;
  private readonly _noMatchTitle: Locator;
  private readonly _noMatchSubtitle: Locator;

  // ── Row kebab menu (S3) ───────────────────────────────────────────────────────
  private readonly _menuShareItem: Locator;
  private readonly _menuRenameItem: Locator;
  private readonly _menuDeleteItem: Locator;

  // Resolved "More actions" aria-label, cached for row-scoped kebab lookups.
  private readonly _moreActionsLabel: string;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const titleLabel = this.t(KEYS.title, "Channels");
    const searchLabel = this.t(KEYS.searchPlaceholder, "Search channels");
    const clearLabel = this.t(KEYS.clearSearch, "Clear search");
    const newLabel = this.t(KEYS.newButton, "New channel");
    const moreLabel = this.t(KEYS.moreActions, "More actions");

    this._heading = page.getByRole("heading", { level: 1, name: titleLabel });
    // Subtitle: "{n} channels · sorted by recent update" — match on the stable trailing phrase.
    this._subtitle = page.getByText(/channels\s*·\s*sorted by recent update/i);
    this._newChannelButton = page.getByRole("button", { name: newLabel, exact: true });

    // Collapsed search = role=button (aria-label); expanded search = role=textbox (placeholder).
    this._searchToggleButton = page.getByRole("button", { name: searchLabel, exact: true });
    this._searchInput = page.getByRole("textbox", { name: new RegExp(searchLabel, "i") });
    this._clearSearchButton = page.getByRole("button", { name: clearLabel, exact: true });

    this._channelRows = page.locator('[data-slot="channel-row"]');

    this._emptyState = page.locator('[data-slot="channel-empty-state"]');
    this._noMatchTitle = page.getByText(this.t(KEYS.emptyNoMatchTitle, "No matching channels"), {
      exact: true,
    });
    this._noMatchSubtitle = page.getByText(
      this.t(KEYS.emptyNoMatchSubtitle, "Try other keywords, or just create a new channel"),
      { exact: false },
    );

    // Kebab menu items are portaled DropdownMenuItem → role=menuitem.
    this._menuShareItem = page.getByRole("menuitem", { name: this.t(KEYS.menuShare, "Share") });
    this._menuRenameItem = page.getByRole("menuitem", { name: this.t(KEYS.menuRename, "Rename") });
    this._menuDeleteItem = page.getByRole("menuitem", { name: this.t(KEYS.menuDelete, "Delete") });

    // Cache the resolved "More actions" label for row-scoped lookups in methods.
    this._moreActionsLabel = moreLabel;
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ─────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get subtitle(): Locator { return this._subtitle; }
  get newChannelButton(): Locator { return this._newChannelButton; }
  get searchToggleButton(): Locator { return this._searchToggleButton; }
  get searchInput(): Locator { return this._searchInput; }
  get clearSearchButton(): Locator { return this._clearSearchButton; }
  get channelRows(): Locator { return this._channelRows; }
  get emptyState(): Locator { return this._emptyState; }
  get noMatchTitle(): Locator { return this._noMatchTitle; }
  get noMatchSubtitle(): Locator { return this._noMatchSubtitle; }
  get menuShareItem(): Locator { return this._menuShareItem; }
  get menuRenameItem(): Locator { return this._menuRenameItem; }
  get menuDeleteItem(): Locator { return this._menuDeleteItem; }

  // ── Actions ──────────────────────────────────────────────────────────────────
  /** Open the authenticated Channels page. Auth is applied via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/channels");
    // Wait for the h1, then a hydration-readiness proxy — this deployment ships SSR skeleton
    // before React attaches handlers; interacting too early silently no-ops. See §19b.
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Number of channel rows currently rendered. */
  async rowCount(): Promise<number> {
    return this._channelRows.count();
  }

  /** Expand the collapsed search icon into the text input (S0 → S1). */
  async expandSearch(): Promise<void> {
    await this._searchToggleButton.click();
    await this._searchInput.waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Expand search (if needed) and type a query (debounced; drives the empty-state variants). */
  async search(query: string): Promise<void> {
    if (!(await this._searchInput.isVisible().catch(() => false))) {
      await this.expandSearch();
    }
    await this._searchInput.fill(query);
  }

  /** Clear the query via the in-field Clear search (X) button (→ restores S0). */
  async clearSearch(): Promise<void> {
    await this._clearSearchButton.click();
  }

  /**
   * Open the first row's "More actions" kebab menu (S0 → S3). The kebab button is
   * opacity-0 until the row is hovered (Tailwind hover-reveal), so hover the row first.
   */
  async openFirstRowMenu(): Promise<void> {
    const firstRow = this._channelRows.first();
    await firstRow.hover();
    await firstRow
      .getByRole("button", { name: this._moreActionsLabel, exact: true })
      .click();
    await this._menuShareItem.waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Close the open kebab menu via Escape (S3 → S0). */
  async closeRowMenu(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await this._menuShareItem.waitFor({ state: "hidden", timeout: 10_000 });
  }

  /** Click the "New channel" button (client-side router.push to /task). */
  async clickNewChannel(): Promise<void> {
    await this._newChannelButton.click();
  }
}
