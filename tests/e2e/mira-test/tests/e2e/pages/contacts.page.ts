// source: cdp
// baseline: test-cases/generated/page-baseline-contacts.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/contacts/page.tsx                          (ContactListPage — route)
//   apps/mira-work/features/contact/components/contact-list-client.tsx    (list state machine)
//   apps/mira-work/features/contact/components/contact-list-header.tsx    (h1 + count + Import btn)
//   apps/mira-work/features/contact/components/contact-list-toolbar.tsx   (search + segmented filter)
//   apps/mira-work/features/contact/components/contact-segmented-filter.tsx (role=radiogroup / radio)
//   apps/mira-work/features/contact/components/contact-list-table.tsx     (row aria-label "Open {name}")
//   apps/mira-work/features/contact/components/contact-import-dialog.tsx  (role=dialog "Import contacts")
//   i18n namespace: agent → contact.list.* / contact.import.*
//
// Locator strategy (hasTestIds=false, dominantStrategy = aria-label + role/name):
//   • No data-testid exists anywhere in the contact feature source — every locator is role/name.
//   • The `agent` i18n namespace lives in a separate source file (agent.json) that is NOT merged
//     into this QA project's messages/en.json, so i18n.t() returns the raw key. This is a
//     single-locale ("en") deployment, so the observed English CDP literals are used as fallbacks
//     via t(key, fallback) — identical to home.page.ts.
//   • Clearing the search box: fill('') silently no-ops on this controlled input (baseline
//     knownIssues); clearSearch() uses keyboard Ctrl/Cmd+A + Backspace instead.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "contact.list.title",
  importButton: "contact.list.importButton",
  searchPlaceholder: "contact.list.searchPlaceholder",
  emptyCategory: "contact.list.emptyCategory",
  noMatch: "contact.list.noMatch",
  importTitle: "contact.import.title",
} as const;

export class ContactsPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Header (S0) ───────────────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _countText: Locator;
  private readonly _importButton: Locator;

  // ── Toolbar: search + segmented filter (S0) ───────────────────────────────
  private readonly _searchInput: Locator;
  private readonly _filterGroup: Locator;
  private readonly _allTab: Locator;
  private readonly _candidatesTab: Locator;
  private readonly _clientsTab: Locator;

  // ── Table (S0) ────────────────────────────────────────────────────────────
  private readonly _nameColumnHeader: Locator;
  private readonly _rowButtons: Locator;

  // ── Empty / no-match states (S1 / S2) ─────────────────────────────────────
  private readonly _emptyCategoryText: Locator;
  private readonly _noMatchText: Locator;

  // ── Import dialog (S3) ────────────────────────────────────────────────────
  private readonly _importDialog: Locator;
  private readonly _importDialogHeading: Locator;
  private readonly _selectFilesButton: Locator;
  private readonly _continueButton: Locator;
  private readonly _cancelButton: Locator;
  private readonly _closeButton: Locator;
  private readonly _importAsCandidateRadio: Locator;
  private readonly _importAsClientRadio: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const titleLabel = this.t(KEYS.title, "Contacts");
    const importLabel = this.t(KEYS.importButton, "Import");

    this._heading = page.getByRole("heading", { level: 1, name: titleLabel });
    this._countText = page.getByText(/\d+\s+(people|person)\b/);
    this._importButton = page.getByRole("button", { name: importLabel, exact: true });

    // Placeholder copy is truncated with a literal ellipsis; match on the stable prefix.
    this._searchInput = page.getByRole("textbox", { name: /Search contacts/i });
    this._filterGroup = page.getByRole("radiogroup");
    this._allTab = page.getByRole("radio", { name: /^All \d+/ });
    this._candidatesTab = page.getByRole("radio", { name: /^Candidates \d+/ });
    this._clientsTab = page.getByRole("radio", { name: /^Clients \d+/ });

    this._nameColumnHeader = page.getByRole("columnheader", { name: "Name", exact: true });
    // Each contact row is a role=button with accessible name "Open {name}".
    this._rowButtons = page.getByRole("button", { name: /^Open / });

    this._emptyCategoryText = page.getByText(
      this.t(KEYS.emptyCategory, "No contacts in this category yet."),
      { exact: false },
    );
    this._noMatchText = page.getByText(/No contacts match this search/i);

    this._importDialog = page.getByRole("dialog", { name: /Import contacts/i });
    this._importDialogHeading = this._importDialog.getByRole("heading", {
      name: this.t(KEYS.importTitle, "Import contacts"),
    });
    this._selectFilesButton = this._importDialog.getByRole("button", { name: "Select files", exact: true });
    this._continueButton = this._importDialog.getByRole("button", { name: "Continue", exact: true });
    this._cancelButton = this._importDialog.getByRole("button", { name: "Cancel", exact: true });
    this._closeButton = this._importDialog.getByRole("button", { name: "Close", exact: true });
    this._importAsCandidateRadio = this._importDialog.getByRole("radio", { name: /Candidate/ });
    this._importAsClientRadio = this._importDialog.getByRole("radio", { name: /Client/ });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get countText(): Locator { return this._countText; }
  get importButton(): Locator { return this._importButton; }
  get searchInput(): Locator { return this._searchInput; }
  get filterGroup(): Locator { return this._filterGroup; }
  get allTab(): Locator { return this._allTab; }
  get candidatesTab(): Locator { return this._candidatesTab; }
  get clientsTab(): Locator { return this._clientsTab; }
  get nameColumnHeader(): Locator { return this._nameColumnHeader; }
  get rowButtons(): Locator { return this._rowButtons; }
  get emptyCategoryText(): Locator { return this._emptyCategoryText; }
  get noMatchText(): Locator { return this._noMatchText; }
  get importDialog(): Locator { return this._importDialog; }
  get importDialogHeading(): Locator { return this._importDialogHeading; }
  get selectFilesButton(): Locator { return this._selectFilesButton; }
  get continueButton(): Locator { return this._continueButton; }
  get cancelButton(): Locator { return this._cancelButton; }
  get closeButton(): Locator { return this._closeButton; }
  get importAsCandidateRadio(): Locator { return this._importAsCandidateRadio; }
  get importAsClientRadio(): Locator { return this._importAsClientRadio; }

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Open the authenticated Contacts page. Auth is applied via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/contacts");
    // Wait for the h1 to render, then a hydration-readiness proxy — SSR ships the
    // skeleton before React attaches handlers; interacting too early silently
    // no-ops on this deployment. See e2e-flakiness-playbook.md §19b.
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Current visible people-count number parsed from the count text (e.g. "42 people" → 42). */
  async peopleCount(): Promise<number> {
    const text = (await this._countText.textContent()) ?? "";
    const m = /(\d+)/.exec(text);
    return m ? Number(m[1]) : NaN;
  }

  /** Number of contact rows currently rendered. */
  async rowCount(): Promise<number> {
    return this._rowButtons.count();
  }

  /** Click the Clients segmented-filter tab (→ empty-category state S1). */
  async selectClientsTab(): Promise<void> {
    await this._clientsTab.click();
  }

  /** Type a query into the search box (debounced; syncs to ?q= and refetches). */
  async search(query: string): Promise<void> {
    await this._searchInput.click();
    await this._searchInput.fill(query);
  }

  /**
   * Clear the search box. fill('') silently no-ops on this controlled input
   * (baseline knownIssues) — use keyboard select-all + backspace instead.
   */
  async clearSearch(): Promise<void> {
    await this._searchInput.click();
    await this._searchInput.press("ControlOrMeta+a");
    await this._searchInput.press("Backspace");
  }

  /** Open the Import contacts dialog from the header Import button. */
  async openImportDialog(): Promise<void> {
    await this._importButton.click();
    await this._importDialog.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Close the Import dialog via its Close button (→ returns to S0). */
  async closeImportDialog(): Promise<void> {
    await this._closeButton.click();
    await this._importDialog.waitFor({ state: "hidden", timeout: 15_000 });
  }
}
