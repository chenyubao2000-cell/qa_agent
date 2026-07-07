// source: cdp
// baseline: test-cases/generated/page-baseline-settings-connectors.json
// generated: 2026-07-03T00:00:00Z
// adapted-for-production: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/settings/connectors/page.tsx              (ConnectorsPage — route)
//   apps/mira-work/app/(agent)/settings/connectors/connectors-client.tsx (ConnectorsClient list + ConnectorDetail + ConnectorSection)
//   i18n namespace: agent → settings.connectors.*  (values in apps/mira-work/i18n/messages/en/agent.json)
//
// PRODUCTION ADAPTATION NOTE: this POM/spec pair was originally generated against a Railway
// preview deployment where the account had 4 connectors (Market Leads + Mira Voice, both
// "Connected" immutable native presets with Disconnect permanently disabled; Outlook + Gmail,
// "Not Connected" with Connect enabled). Re-verified live via CDP against production
// (https://mira.day/settings/connectors, same account) on 2026-07-03: this account only has
// 2 connectors, both Outlook + Gmail, BOTH "Not Connected". There is no "Connected" section at
// all (only "Not Connected (2)") and no Market Leads / Mira Voice preset exists in this
// environment. All immutable-preset locators (Market Leads/Mira Voice rows, disabled-Disconnect
// assertions, 8-tool-switches detail view) have been dropped — the underlying feature scope
// genuinely differs here, not a broken locator. Locators below reflect ONLY what is live in
// production for this account.
//
// Locator strategy (hasTestIds=false, dominantStrategy = aria-label + role/name):
//   • No data-testid anywhere in this component tree — every locator is role/name/aria-label.
//   • Section header (CollapsibleTrigger) is role=button with aria-label = title, e.g.
//     "Not Connected (2)".
//   • Connector rows are role=button (tabIndex=0) whose composite accessible name STARTS with the
//     server name, e.g. "Outlook … Connect Outlook". The nested action button's name starts with
//     "Connect", so `/^{name}/` + .first() selects the row, not the button.
//   • Row action buttons carry aria-label `${t('connect')} ${name}`, e.g. "Connect Outlook".
//   • Detail-view header action button (when rendered) uses visible text t('connect') with NO
//     aria-label override → exact-name "Connect". needsAuth branch (both connectors here) always
//     renders the Connect button in the detail header plus a "Connect to see available tools"
//     (i18nKey connectFirst) placeholder instead of the tools list/switches.
//   • The settings.connectors i18n dict is NOT merged into this QA project's messages/en.json, so
//     i18n.t() returns the raw key; t(key, fallback) supplies the source English literal. Single-locale
//     ("en") deployment — identical approach to contacts.page.ts.
//
// SAFETY: clicking a "Connect X" button fires POST /api/mcp/servers/{id}/authorize and opens a
// REAL OAuth consent popup as a separate browser page (verified live: Microsoft login for
// Outlook, login.microsoftonline.com via backend.composio.dev redirect). The spec MUST NOT fill
// credentials or complete this flow on production — only assert the popup opened, then close it
// and reload the main page to reset the pending/disabled button state.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "settings.connectors.title",
  sectionNotConnected: "settings.connectors.sectionNotConnected",
  connect: "settings.connectors.connect",
  connectFirst: "settings.connectors.connectFirst",
} as const;

export class SettingsConnectorsPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── List header (S0) ──────────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _backButton: Locator;

  // ── Collapsible section header (S0) ───────────────────────────────────────
  private readonly _notConnectedSection: Locator;

  // ── Connector rows (S0) ───────────────────────────────────────────────────
  private readonly _outlookRow: Locator;
  private readonly _gmailRow: Locator;

  // ── Row action buttons (S0) ───────────────────────────────────────────────
  private readonly _connectOutlook: Locator;
  private readonly _connectGmail: Locator;

  // ── Detail view (S1) ──────────────────────────────────────────────────────
  private readonly _detailConnectButton: Locator;
  private readonly _detailConnectFirstText: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const titleLabel = this.t(KEYS.title, "Connectors");

    this._heading = page.getByRole("heading", { level: 1, name: titleLabel });
    this._backButton = page.getByRole("button", { name: "Back" });

    // Section trigger: aria-label = "Not Connected (n)". No "Connected" section exists in this
    // account/environment, so no anchoring is needed here (unlike the original preview deployment).
    this._notConnectedSection = page.getByRole("button", { name: /Not Connected \(\d+\)/ });

    // Rows: composite accessible name starts with the server name; .first() + ^ anchor
    // disambiguates from the nested Connect action button.
    this._outlookRow = page.getByRole("button", { name: /^Outlook/ }).first();
    this._gmailRow = page.getByRole("button", { name: /^Gmail/ }).first();

    const connect = this.t(KEYS.connect, "Connect");
    // exact: true is required — the row itself is an unlabeled role=button whose composite
    // accessible name aggregates descendant content (e.g. "Outlook … Connect Outlook"), which
    // contains this exact string as a substring. Non-exact getByRole name matching is
    // substring-based and would resolve to both the row and the nested action button (strict-mode
    // violation). See e2e-flakiness-playbook.md §19b addendum.
    this._connectOutlook = page.getByRole("button", { name: `${connect} Outlook`, exact: true });
    this._connectGmail = page.getByRole("button", { name: `${connect} Gmail`, exact: true });

    // Detail view. Both connectors in this environment are needsAuth === true, so the header
    // always renders a bare-text (no aria-label) "Connect" button and a connectFirst placeholder
    // instead of the tools list.
    this._detailConnectButton = page.getByRole("button", { name: connect, exact: true });
    this._detailConnectFirstText = page.getByText(this.t(KEYS.connectFirst, "Connect to see available tools"), { exact: true });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get backButton(): Locator { return this._backButton; }
  get notConnectedSection(): Locator { return this._notConnectedSection; }
  get outlookRow(): Locator { return this._outlookRow; }
  get gmailRow(): Locator { return this._gmailRow; }
  get connectOutlookButton(): Locator { return this._connectOutlook; }
  get connectGmailButton(): Locator { return this._connectGmail; }
  get detailConnectButton(): Locator { return this._detailConnectButton; }
  get detailConnectFirstText(): Locator { return this._detailConnectFirstText; }

  /** Detail-view h1 for a given connector name (unique once the list unmounts). */
  detailHeading(name: string): Locator {
    return this.page.getByRole("heading", { level: 1, name });
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Open the authenticated Connectors settings page. Auth via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/settings/connectors");
    // SSR ships the skeleton before React attaches handlers; interacting too early
    // silently no-ops on this deployment. Wait for the h1, then a hydration-readiness
    // proxy. See e2e-flakiness-playbook.md §19b.
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Drill into a connector's detail view by clicking its list row. */
  async openConnector(name: string): Promise<void> {
    await this.page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
    await this.detailHeading(name).waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Return from a detail view back to the list (→ S0). */
  async goBack(): Promise<void> {
    await this._backButton.click();
    await this._heading.waitFor({ state: "visible", timeout: 15_000 });
  }

  /**
   * Click a row-level "Connect X" button and capture the real OAuth popup it opens, WITHOUT
   * interacting with it (no credentials, no consent). Caller is responsible for closing the
   * popup and reloading the list to reset the pending/disabled button state.
   */
  async clickConnectAndCapturePopup(connectButton: Locator): Promise<Page> {
    const [popup] = await Promise.all([
      this.page.waitForEvent("popup", { timeout: 15_000 }),
      connectButton.click(),
    ]);
    return popup;
  }
}
