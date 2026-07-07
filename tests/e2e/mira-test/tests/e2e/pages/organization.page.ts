// source: cdp
// baseline: test-cases/generated/page-baseline-organization.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/organization/page.tsx                 (OrganizationPage — route)
//   apps/mira-work/app/(agent)/organization/organization-client.tsx  (OrganizationClient — full page)
//   i18n namespaces: billing.org.* (page) / plans.* (plan badge)
//
// Locator strategy (hasTestIds=false, dominantStrategy = role+name / aria-label):
//   • No data-testid exists anywhere in OrganizationClient — every locator is role/name,
//     aria-label (icon-only buttons: Edit name / Save name / Action / Close), or the stable
//     id `#org-name` on the profile name input.
//   • The `billing.org` and `plans` i18n namespaces are NOT merged into this QA project's
//     messages/en.json, so i18n.t() returns the raw key. This is a single-locale ("en")
//     deployment, so the observed English CDP literals are used as fallbacks via t(key,
//     fallback) — identical to contacts.page.ts / home.page.ts.
//   • Invite dialog close is animated (Radix/Framer Motion) — the [role=dialog] element
//     persists ~500ms after Cancel before unmounting. closeInviteDialog() waits for
//     state:'hidden' rather than asserting instantly (flakiness-playbook #10).
//   • SSR ships the skeleton before React hydrates; goto() adds a hydration-readiness proxy
//     after the h1 is visible (flakiness-playbook §19b) — this deployment has a confirmed
//     SSR-before-hydration race on every page.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "billing.org.title",
  profile: "billing.org.profile",
  nameLabel: "billing.org.nameLabel",
  editName: "billing.org.editName",
  saveName: "billing.org.saveName",
  currentPlan: "billing.org.currentPlan",
  members: "billing.org.members",
  inviteMember: "billing.org.inviteMember",
  filterActive: "billing.org.filter.active",
  filterAll: "billing.org.filter.all",
  colAction: "billing.org.col.action",
  inviteTitle: "billing.org.inviteDialog.title",
  inviteCancel: "billing.org.inviteDialog.cancel",
  inviteSend: "billing.org.inviteDialog.send",
} as const;

export class OrganizationPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Header / cards (S0 ready) ─────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _profileHeading: Locator;
  private readonly _currentPlanHeading: Locator;
  private readonly _membersHeading: Locator;
  private readonly _seatsText: Locator;

  // ── Profile card: inline rename (S0 / S1) ─────────────────────────────────
  private readonly _nameInput: Locator;
  private readonly _editNameButton: Locator;
  private readonly _saveNameButton: Locator;

  // ── Members card: filter + row action menus (S0) ──────────────────────────
  private readonly _filterCombobox: Locator;
  private readonly _actionMenuButtons: Locator;

  // ── Invite members dialog (S2) ────────────────────────────────────────────
  private readonly _inviteMemberButton: Locator;
  private readonly _inviteDialog: Locator;
  private readonly _inviteTextarea: Locator;
  private readonly _inviteSendButton: Locator;
  private readonly _inviteCancelButton: Locator;
  private readonly _inviteCounter: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", { level: 1, name: this.t(KEYS.title, "Organization") });
    this._profileHeading = page.getByRole("heading", { name: this.t(KEYS.profile, "Profile"), exact: true });
    this._currentPlanHeading = page.getByRole("heading", { name: this.t(KEYS.currentPlan, "Current plan") });
    this._membersHeading = page.getByRole("heading", { name: this.t(KEYS.members, "Members"), exact: true });
    // PlanCard seat usage renders as "<used> / <limit>" (e.g. "1 / 16"); "—" when no limit.
    // On S0 (dialog closed) this is the only "N / M" text on the page.
    this._seatsText = page.getByText(/^\s*\d+\s*\/\s*(\d+|—)\s*$/);

    // Profile name input has a stable id (`org-name`); disabled unless editing.
    this._nameInput = page.locator("#org-name");
    this._editNameButton = page.getByRole("button", { name: this.t(KEYS.editName, "Edit name") });
    this._saveNameButton = page.getByRole("button", { name: this.t(KEYS.saveName, "Save name") });

    // Single Radix Select on the page (status filter).
    this._filterCombobox = page.getByRole("combobox");
    // Ellipsis action menu — rendered ONLY for invite rows (members have none). Count = invite rows.
    this._actionMenuButtons = page.getByRole("button", { name: this.t(KEYS.colAction, "Action") });

    // "Invite member" button (exact) — distinct from the dialog title "Invite members".
    this._inviteMemberButton = page.getByRole("button", { name: this.t(KEYS.inviteMember, "Invite member"), exact: true });
    this._inviteDialog = page.getByRole("dialog", { name: this.t(KEYS.inviteTitle, "Invite members") });
    this._inviteTextarea = this._inviteDialog.getByRole("textbox");
    this._inviteSendButton = this._inviteDialog.getByRole("button", { name: this.t(KEYS.inviteSend, "Send invitations") });
    this._inviteCancelButton = this._inviteDialog.getByRole("button", { name: this.t(KEYS.inviteCancel, "Cancel"), exact: true });
    this._inviteCounter = this._inviteDialog.getByText(/\d+\s*\/\s*50/);
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get profileHeading(): Locator { return this._profileHeading; }
  get currentPlanHeading(): Locator { return this._currentPlanHeading; }
  get membersHeading(): Locator { return this._membersHeading; }
  get seatsText(): Locator { return this._seatsText; }
  get nameInput(): Locator { return this._nameInput; }
  get editNameButton(): Locator { return this._editNameButton; }
  get saveNameButton(): Locator { return this._saveNameButton; }
  get filterCombobox(): Locator { return this._filterCombobox; }
  get actionMenuButtons(): Locator { return this._actionMenuButtons; }
  get inviteMemberButton(): Locator { return this._inviteMemberButton; }
  get inviteDialog(): Locator { return this._inviteDialog; }
  get inviteTextarea(): Locator { return this._inviteTextarea; }
  get inviteSendButton(): Locator { return this._inviteSendButton; }
  get inviteCancelButton(): Locator { return this._inviteCancelButton; }
  get inviteCounter(): Locator { return this._inviteCounter; }

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Open the authenticated Organization page. Auth applied via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/organization");
    // Wait for the h1, then a hydration-readiness proxy — SSR ships the skeleton before React
    // attaches handlers; interacting too early silently no-ops on this deployment (§19b).
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Enter inline-edit mode for the org name (view → edit). */
  async startEditName(): Promise<void> {
    await this._editNameButton.click();
    await this._nameInput.waitFor({ state: "visible", timeout: 10_000 });
  }

  /**
   * Click Save without changing the value. Source `save()` early-returns when
   * `trimmed === org.name`, so NO PATCH is issued — non-destructive round-trip
   * back to view mode. Do NOT modify the input before calling this.
   */
  async saveNameUnchanged(): Promise<void> {
    await this._saveNameButton.click();
    await this._editNameButton.waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Open the Invite members dialog from the Members card. */
  async openInviteDialog(): Promise<void> {
    await this._inviteMemberButton.click();
    await this._inviteDialog.waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * Close the Invite dialog via Cancel. Close is animated (Radix/Framer Motion) — the
   * [role=dialog] element persists ~500ms before unmounting, so wait for state:'hidden'
   * rather than asserting instantly (flakiness-playbook #10).
   */
  async closeInviteDialogViaCancel(): Promise<void> {
    await this._inviteCancelButton.click();
    await this._inviteDialog.waitFor({ state: "hidden", timeout: 15_000 });
  }

  /** Type into the invite emails textarea (live-parsed by the component on change). */
  async fillInviteEmails(value: string): Promise<void> {
    await this._inviteTextarea.fill(value);
  }

  /** Clear the invite emails textarea. */
  async clearInviteEmails(): Promise<void> {
    await this._inviteTextarea.fill("");
  }

  /** Open the status-filter Select and choose the option with the given accessible name. */
  async selectStatusFilter(optionName: string): Promise<void> {
    await this._filterCombobox.click();
    await this.page.getByRole("option", { name: optionName }).click();
    // Radix Select closes on selection; wait for the listbox to detach before asserting.
    await this.page.getByRole("listbox").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  }

  /** Convenience: the localized "Active" filter option label. */
  get activeFilterLabel(): string {
    return this.t(KEYS.filterActive, "Active");
  }

  /** Number of invite-row action (ellipsis) menu buttons currently rendered. */
  async actionMenuCount(): Promise<number> {
    return this._actionMenuButtons.count();
  }
}
