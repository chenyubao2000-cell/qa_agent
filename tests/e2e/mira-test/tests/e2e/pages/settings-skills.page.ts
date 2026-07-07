// source: cdp
// baseline: test-cases/generated/page-baseline-settings-skills.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/settings/skills/skills-client.tsx  (SkillsClient — page, SkillRow, SkillEmptyState)
//   apps/mira-work/app/(agent)/settings/skills/new-skill-menu.tsx (NewSkillMenu — DropdownMenu / Drawer)
//   i18n namespace: settings.skills.* (source en/agent.json)
//
// Locator strategy (hasTestIds=false, dominantStrategy = role + name / aria-label):
//   • No data-testid exists anywhere in the settings/skills feature — every locator is role/name
//     or aria-label (icon-only Back button; per-skill toggle Switch aria-label
//     "Enable or disable {name}").
//   • The settings.skills.* namespace is NOT merged into this QA project's messages/en.json
//     (only a nav "skills" label exists), so i18n.t() returns the raw key. This is a
//     single-locale ("en") deployment, so the source English literals are used as fallbacks
//     via t(key, fallback) — identical to organization.page.ts / contacts.page.ts.
//   • SkillRow renders official (source='system') rows as a plain non-clickable <div>; personal
//     rows as a <button>. So an official skill name is NOT reachable via getByRole('button').
//     This is intentional ('官方不可点击') and asserted by TC-CDP-SKILL-005.
//   • Header "+ New Skill" and the personal empty-state "Create your first skill" CTA are BOTH
//     backed by the same NewSkillMenu (desktop → Radix DropdownMenu with role=menu / menuitem).
//   • SSR ships the skeleton before React hydrates; goto() adds a hydration-readiness proxy
//     after the h1 is visible (flakiness-playbook §19b) — this deployment has a confirmed
//     SSR-before-hydration race on every page.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "settings.skills.title",
  back: "settings.skills.back",
  tabOfficial: "settings.skills.tabs.official",
  tabPersonal: "settings.skills.tabs.personal",
  newSkillTrigger: "settings.skills.newSkill.trigger",
  fromChat: "settings.skills.newSkill.fromChat",
  fromFile: "settings.skills.newSkill.fromFile",
  emptyPersonalTitle: "settings.skills.empty.personal.title",
  emptyPersonalCta: "settings.skills.empty.personal.cta",
  toggleAriaLabel: "settings.skills.toggleAriaLabel",
} as const;

export class SettingsSkillsPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Header ────────────────────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _backButton: Locator;
  private readonly _newSkillButton: Locator;

  // ── Tabs ──────────────────────────────────────────────────────────────────
  private readonly _officialTab: Locator;
  private readonly _personalTab: Locator;

  // ── List (official) ─────────────────────────────────────────────────────────
  private readonly _skillSwitches: Locator;

  // ── Personal empty state ────────────────────────────────────────────────────
  private readonly _emptyPersonalTitle: Locator;
  private readonly _createFirstSkillButton: Locator;

  // ── New Skill dropdown menu ──────────────────────────────────────────────────
  private readonly _menu: Locator;
  private readonly _fromChatItem: Locator;
  private readonly _fromFileItem: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", { level: 1, name: this.t(KEYS.title, "All Skills") });
    this._backButton = page.getByRole("button", { name: this.t(KEYS.back, "Back"), exact: true });
    // Header trigger text is "+ New Skill" — regex on "New Skill" avoids the leading "+".
    // Distinct from the empty-state CTA button ("Create your first skill").
    this._newSkillButton = page.getByRole("button", { name: /New Skill/ });

    // Radix tab accessible name = label + count span (e.g. "Official 5") → match on label.
    this._officialTab = page.getByRole("tab", { name: new RegExp(this.t(KEYS.tabOfficial, "Official")) });
    this._personalTab = page.getByRole("tab", { name: new RegExp(this.t(KEYS.tabPersonal, "Personal")) });

    // Every SkillRow renders exactly one Switch → switch count == visible skill count.
    this._skillSwitches = page.getByRole("switch");

    // Empty-state <p> is "<title> · <description>" — substring match on the title.
    this._emptyPersonalTitle = page.getByText(
      new RegExp(this.escapeRe(this.t(KEYS.emptyPersonalTitle, "You haven't created any skills yet"))),
    );
    this._createFirstSkillButton = page.getByRole("button", {
      name: this.t(KEYS.emptyPersonalCta, "Create your first skill"),
      exact: true,
    });

    // Radix DropdownMenuContent → role=menu; items → role=menuitem.
    this._menu = page.getByRole("menu");
    this._fromChatItem = page.getByRole("menuitem", { name: new RegExp(this.escapeRe(this.t(KEYS.fromChat, "Create via Chat"))) });
    this._fromFileItem = page.getByRole("menuitem", { name: new RegExp(this.escapeRe(this.t(KEYS.fromFile, "Import File"))) });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  private escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ── Public getters ────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get backButton(): Locator { return this._backButton; }
  get newSkillButton(): Locator { return this._newSkillButton; }
  get officialTab(): Locator { return this._officialTab; }
  get personalTab(): Locator { return this._personalTab; }
  get skillSwitches(): Locator { return this._skillSwitches; }
  get emptyPersonalTitle(): Locator { return this._emptyPersonalTitle; }
  get createFirstSkillButton(): Locator { return this._createFirstSkillButton; }
  get menu(): Locator { return this._menu; }
  get fromChatItem(): Locator { return this._fromChatItem; }
  get fromFileItem(): Locator { return this._fromFileItem; }

  /** Per-skill toggle Switch by skill name (aria-label "Enable or disable {name}"). */
  skillSwitch(name: string): Locator {
    const template = this.t(KEYS.toggleAriaLabel, "Enable or disable {name}");
    return this.page.getByRole("switch", { name: template.replace("{name}", name) });
  }

  /** The official skill name rendered as plain text (non-clickable div). */
  skillNameText(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }

  /** A button whose accessible name is the skill name — expected count 0 for official rows. */
  skillNameButton(name: string): Locator {
    return this.page.getByRole("button", { name });
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Open the authenticated Skills page. Auth applied via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/settings/skills");
    // Wait for the h1, then a hydration-readiness proxy — SSR ships the skeleton before React
    // attaches handlers; interacting too early silently no-ops on this deployment (§19b).
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Switch to the Personal tab and wait for the empty-state (this account has 0 personal skills). */
  async switchToPersonalTab(): Promise<void> {
    await this._personalTab.click();
    await this._emptyPersonalTitle.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Switch back to the Official tab and wait for the list (switches) to render. */
  async switchToOfficialTab(): Promise<void> {
    await this._officialTab.click();
    await this._skillSwitches.first().waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Open the New Skill dropdown from the header "+ New Skill" trigger. */
  async openNewSkillMenuFromHeader(): Promise<void> {
    await this._newSkillButton.click();
    await this._menu.waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Open the New Skill dropdown from the personal empty-state CTA. */
  async openNewSkillMenuFromCta(): Promise<void> {
    await this._createFirstSkillButton.click();
    await this._menu.waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Close the open dropdown via Escape and wait for it to detach. */
  async closeMenuWithEscape(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await this._menu.waitFor({ state: "hidden", timeout: 10_000 });
  }

  /** Count of currently-rendered skill toggle switches (== visible skill rows). */
  async skillSwitchCount(): Promise<number> {
    return this._skillSwitches.count();
  }
}
