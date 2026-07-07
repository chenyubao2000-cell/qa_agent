// source: cdp
// baseline: test-cases/generated/page-baseline-settings-connectors.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/settings/connectors/page.tsx              (ConnectorsPage — route)
//   apps/mira-work/app/(agent)/settings/connectors/connectors-client.tsx (ConnectorsClient list + ConnectorDetail + ConnectorSection)
//   i18n namespace: agent → settings.connectors.*  (values in apps/mira-work/i18n/messages/en/agent.json)
//
// Locator strategy (hasTestIds=false, dominantStrategy = aria-label + role/name):
//   • No data-testid anywhere in this component tree — every locator is role/name/aria-label.
//   • Section headers (CollapsibleTrigger) are role=button with aria-label = title, e.g. "Connected (2)".
//     "Not Connected (2)" contains "Connected (2)" as a substring, so the connected-section regex is
//     anchored with ^ to avoid a strict-mode double match.
//   • Connector rows are role=button (tabIndex=0) whose composite accessible name STARTS with the
//     server name, e.g. "Market Leads … Disconnect Market Leads". The nested action button's name
//     starts with "Disconnect"/"Connect", so `/^{name}/` + .first() selects the row, not the button.
//   • Row action buttons carry aria-label `${t('disconnect')} ${name}` / `${t('connect')} ${name}`,
//     e.g. "Disconnect Market Leads", "Connect Outlook".
//   • Detail-view header action button (when rendered) uses visible text t('connect')/t('disconnect')
//     with NO aria-label override → exact-name "Connect"/"Disconnect". Immutable presets render none.
//   • The settings.connectors i18n dict is NOT merged into this QA project's messages/en.json, so
//     i18n.t() returns the raw key; t(key, fallback) supplies the source English literal. Single-locale
//     ("en") deployment — identical approach to contacts.page.ts.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "settings.connectors.title",
  sectionConnected: "settings.connectors.sectionConnected",
  sectionNotConnected: "settings.connectors.sectionNotConnected",
  tools: "settings.connectors.tools",
  connect: "settings.connectors.connect",
  disconnect: "settings.connectors.disconnect",
} as const;

export class SettingsConnectorsPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── List header (S0) ──────────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _backButton: Locator;

  // ── Collapsible section headers (S0) ──────────────────────────────────────
  private readonly _connectedSection: Locator;
  private readonly _notConnectedSection: Locator;

  // ── Connector rows (S0) ───────────────────────────────────────────────────
  private readonly _marketLeadsRow: Locator;
  private readonly _miraVoiceRow: Locator;
  private readonly _outlookRow: Locator;
  private readonly _gmailRow: Locator;

  // ── Row action buttons (S0) ───────────────────────────────────────────────
  private readonly _disconnectMarketLeads: Locator;
  private readonly _disconnectMiraVoice: Locator;
  private readonly _connectOutlook: Locator;
  private readonly _connectGmail: Locator;

  // ── Detail view (S1) ──────────────────────────────────────────────────────
  private readonly _detailToolsLabel: Locator;
  private readonly _detailSwitches: Locator;
  private readonly _detailConnectButton: Locator;
  private readonly _detailDisconnectButton: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const titleLabel = this.t(KEYS.title, "Connectors");
    const toolsLabel = this.t(KEYS.tools, "Tools");

    this._heading = page.getByRole("heading", { level: 1, name: titleLabel });
    // exact: true — a non-exact "Back" substring-matches any sidebar/recent-task entry
    // whose accessible name happens to start with "Back" (e.g. a "Backend Engineer
    // Candidates Search" task created by other specs in this shared account), which would
    // otherwise make this resolve to multiple elements (strict-mode violation). Same class
    // of bug already guarded against elsewhere in this suite — see task.page.ts's
    // driveUntil() "No" vs "not detected" / Send button comments.
    this._backButton = page.getByRole("button", { name: "Back", exact: true });

    // Section triggers: aria-label = "Connected (n)" / "Not Connected (n)". Anchor the
    // connected regex so it does not also match "Not Connected (n)".
    this._connectedSection = page.getByRole("button", { name: /^Connected \(\d+\)/ });
    this._notConnectedSection = page.getByRole("button", { name: /Not Connected \(\d+\)/ });

    // Rows: composite accessible name starts with the server name; .first() + ^ anchor
    // disambiguates from the nested Connect/Disconnect action button.
    this._marketLeadsRow = page.getByRole("button", { name: /^Market Leads/ }).first();
    this._miraVoiceRow = page.getByRole("button", { name: /^Mira Voice/ }).first();
    this._outlookRow = page.getByRole("button", { name: /^Outlook/ }).first();
    this._gmailRow = page.getByRole("button", { name: /^Gmail/ }).first();

    const disconnect = this.t(KEYS.disconnect, "Disconnect");
    const connect = this.t(KEYS.connect, "Connect");
    // exact: true is required — the row itself is an unlabeled role=button whose composite
    // accessible name aggregates descendant content (e.g. "Market Leads … Disconnect Market
    // Leads"), which contains this exact string as a substring. Non-exact getByRole name
    // matching is substring-based and would resolve to both the row and the nested action
    // button (strict-mode violation). See e2e-flakiness-playbook.md §19b addendum.
    this._disconnectMarketLeads = page.getByRole("button", { name: `${disconnect} Market Leads`, exact: true });
    this._disconnectMiraVoice = page.getByRole("button", { name: `${disconnect} Mira Voice`, exact: true });
    this._connectOutlook = page.getByRole("button", { name: `${connect} Outlook`, exact: true });
    this._connectGmail = page.getByRole("button", { name: `${connect} Gmail`, exact: true });

    // Detail view.
    this._detailToolsLabel = page.getByText(toolsLabel, { exact: true });
    this._detailSwitches = page.getByRole("switch", { name: /^Toggle / });
    // Detail-header action button uses bare visible text (no aria-label) → exact name.
    this._detailConnectButton = page.getByRole("button", { name: connect, exact: true });
    this._detailDisconnectButton = page.getByRole("button", { name: disconnect, exact: true });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get backButton(): Locator { return this._backButton; }
  get connectedSection(): Locator { return this._connectedSection; }
  get notConnectedSection(): Locator { return this._notConnectedSection; }
  get marketLeadsRow(): Locator { return this._marketLeadsRow; }
  get miraVoiceRow(): Locator { return this._miraVoiceRow; }
  get outlookRow(): Locator { return this._outlookRow; }
  get gmailRow(): Locator { return this._gmailRow; }
  get disconnectMarketLeadsButton(): Locator { return this._disconnectMarketLeads; }
  get disconnectMiraVoiceButton(): Locator { return this._disconnectMiraVoice; }
  get connectOutlookButton(): Locator { return this._connectOutlook; }
  get connectGmailButton(): Locator { return this._connectGmail; }
  get detailToolsLabel(): Locator { return this._detailToolsLabel; }
  get detailSwitches(): Locator { return this._detailSwitches; }
  get detailConnectButton(): Locator { return this._detailConnectButton; }
  get detailDisconnectButton(): Locator { return this._detailDisconnectButton; }

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

  /** Count of tool-toggle switches rendered in the current detail view. */
  async switchCount(): Promise<number> {
    return this._detailSwitches.count();
  }
}
