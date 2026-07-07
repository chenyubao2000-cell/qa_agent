// source: cdp
// baseline: test-cases/generated/page-baseline-home.json
// generated: 2026-07-03T00:00:00Z
// Merged from fragments (per .claude/references/pom-merge.md):
//   home.page.tabs-features.fragment.ts (area: tabs-features)
//   home.page.nav-top.fragment.ts       (area: nav-top)
//
// Source: read from D:\code\mira
//   packages/growth/src/home/components/features-tabs.tsx    (TabSwitcher — plain <button>, no role=tab / testid)
//   packages/growth/src/home/components/features-section.tsx (CoreFeatures / RecruitingFeatures — conditional mount)
//   packages/growth/src/home/components/lp-navbar-1.tsx       (nav: Features scroll button, Sign in / Join Waitlist links)
//   apps/mira-work/components/language-selector.tsx           (Radix Select → role=combobox trigger + role=option items)
//   messages/en.json → homepage.features.*, homepage.nav.*, auth.*, auth.joinWaitlist.*
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name):
//   • Tab buttons + nav are scoped (#features / <nav>) to avoid the floating duplicate TabSwitcher
//     and desktop/mobile duplicate nav links (.first() binds the desktop instance, viewport 1280x720).
//   • "Active tab" / "Features" scroll are DOM-state changes with no URL change.
//   • "Sign in" (href=/task) redirects unauthenticated users to /sign-in; "Join Waitlist" → /join-waitlist.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  coreTab: "homepage.features.core",
  recruitingTab: "homepage.features.recruiting",
  featuresNav: "homepage.nav.features",
  signInNav: "homepage.nav.signIn",
  joinWaitlistNav: "homepage.nav.getStarted",
  signInHeading: "auth.unifiedTitle",
  oauthGoogle: "auth.continueWithGoogle",
  oauthMicrosoft: "auth.continueWithMicrosoft",
  signInEmailPlaceholder: "auth.emailPlaceholder",
  joinWaitlistHeading: "auth.joinWaitlist.title",
  joinWaitlistEmailPlaceholder: "auth.joinWaitlist.emailPlaceholder",
} as const;

export class HomePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Feature tabs (#features section) ────────────────────────────────────
  private readonly _featuresSection: Locator;
  private readonly _coreTab: Locator;
  private readonly _recruitingTab: Locator;

  // ── Top navigation (S0) ──────────────────────────────────────────────────
  private readonly _nav: Locator;
  private readonly _featuresNavButton: Locator;
  private readonly _navSignInLink: Locator;
  private readonly _navJoinWaitlistLink: Locator;
  private readonly _languageCombobox: Locator;
  private readonly _languageOptions: Locator;

  // ── Sign in / Sign up wall (S2) ──────────────────────────────────────────
  private readonly _signInHeading: Locator;
  private readonly _oauthGoogleButton: Locator;
  private readonly _oauthMicrosoftButton: Locator;
  private readonly _signInEmailInput: Locator;

  // ── Join Waitlist page (S3) ──────────────────────────────────────────────
  private readonly _joinWaitlistHeading: Locator;
  private readonly _workEmailInput: Locator;

  // ── All "Join Waitlist" CTAs (nav + hero + footer) — equivalence class ─────
  private readonly _joinWaitlistCtaLinks: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const coreLabel = this.t(KEYS.coreTab, "Core");
    const recruitingLabel = this.t(KEYS.recruitingTab, "Recruiting");
    const featuresLabel = this.t(KEYS.featuresNav, "Features");
    const signInLabel = this.t(KEYS.signInNav, "Sign in");
    const joinWaitlistLabel = this.t(KEYS.joinWaitlistNav, "Join Waitlist");

    this._featuresSection = page.locator("#features");
    this._coreTab = this._featuresSection.getByRole("button", { name: coreLabel, exact: true });
    this._recruitingTab = this._featuresSection.getByRole("button", { name: recruitingLabel, exact: true });

    this._nav = page.getByRole("navigation");
    this._featuresNavButton = this._nav.getByRole("button", { name: featuresLabel, exact: true }).first();
    this._navSignInLink = this._nav.getByRole("link", { name: signInLabel, exact: true }).first();
    this._navJoinWaitlistLink = this._nav.getByRole("link", { name: joinWaitlistLabel, exact: true }).first();
    this._languageCombobox = this._nav.getByRole("combobox").first();
    this._languageOptions = page.getByRole("option");

    this._signInHeading = page.getByRole("heading", { name: this.t(KEYS.signInHeading, "Sign in or Sign up") });
    this._oauthGoogleButton = page.getByRole("button", { name: this.t(KEYS.oauthGoogle, "Continue with Google") });
    this._oauthMicrosoftButton = page.getByRole("button", { name: this.t(KEYS.oauthMicrosoft, "Continue with Microsoft") });
    this._signInEmailInput = page.getByPlaceholder(this.t(KEYS.signInEmailPlaceholder, "Enter your email address"));

    this._joinWaitlistHeading = page.getByRole("heading", { name: this.t(KEYS.joinWaitlistHeading, "Join Waitlist") });
    this._workEmailInput = page.getByPlaceholder(this.t(KEYS.joinWaitlistEmailPlaceholder, "name@company.com"));

    // Case-insensitive covers both "Join Waitlist" (nav/hero) and "Join waitlist" (footer cta).
    this._joinWaitlistCtaLinks = page.getByRole("link", { name: /join\s*waitlist/i });
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get coreTab(): Locator { return this._coreTab; }
  get recruitingTab(): Locator { return this._recruitingTab; }

  get featuresNavButton(): Locator { return this._featuresNavButton; }
  get navSignInLink(): Locator { return this._navSignInLink; }
  get navJoinWaitlistLink(): Locator { return this._navJoinWaitlistLink; }
  get languageCombobox(): Locator { return this._languageCombobox; }
  get languageOptions(): Locator { return this._languageOptions; }
  get featuresSection(): Locator { return this._featuresSection; }

  get signInHeading(): Locator { return this._signInHeading; }
  get oauthGoogleButton(): Locator { return this._oauthGoogleButton; }
  get oauthMicrosoftButton(): Locator { return this._oauthMicrosoftButton; }
  get signInEmailInput(): Locator { return this._signInEmailInput; }

  get joinWaitlistHeading(): Locator { return this._joinWaitlistHeading; }
  get workEmailInput(): Locator { return this._workEmailInput; }

  get joinWaitlistCtaLinks(): Locator { return this._joinWaitlistCtaLinks; }

  /**
   * Feature panel heading by visible text (h2 in CoreFeatures / RecruitingFeatures).
   * Callers pass the resolved (i18n) text so assertions stay locale-safe.
   */
  featureHeading(name: string): Locator {
    return this.page.getByRole("heading", { name, exact: true });
  }

  /** A specific language option by its display name (e.g. "English"). */
  languageOption(name: string): Locator {
    return this.page.getByRole("option", { name, exact: true });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open the marketing home page (public, no auth). */
  async goto(): Promise<void> {
    await this.page.goto("/");
    // The features tab bar is client-rendered; wait for the Core tab to be interactive.
    await this._coreTab.waitFor({ state: "visible", timeout: 20_000 });
    // Hydration-readiness proxy — SSR renders content before React attaches
    // handlers; interacting too early can silently no-op. See e2e-flakiness-playbook.md §19b.
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  async clickCoreTab(): Promise<void> {
    await this._coreTab.click();
  }

  async clickRecruitingTab(): Promise<void> {
    await this._recruitingTab.click();
  }

  /** Rapid double-click the Recruiting tab (error-guessing race scenario). */
  async doubleClickRecruitingTab(): Promise<void> {
    await this._recruitingTab.dblclick();
  }

  /** Click the Features nav button (smooth-scrolls to #features; no navigation). */
  async clickFeatures(): Promise<void> {
    await this._featuresNavButton.click();
  }

  /** Click nav "Sign in" (href=/task → redirects to /sign-in auth wall). */
  async clickNavSignIn(): Promise<void> {
    await this._navSignInLink.click();
    await this.page.waitForURL("**/sign-in**", { timeout: 30_000, waitUntil: "domcontentloaded" });
  }

  /** Click nav "Join Waitlist" → /join-waitlist. */
  async clickNavJoinWaitlist(): Promise<void> {
    await this._navJoinWaitlistLink.click();
    await this.page.waitForURL("**/join-waitlist**", { timeout: 30_000, waitUntil: "domcontentloaded" });
  }

  /** Open the language selector dropdown (Radix Select). */
  async openLanguageMenu(): Promise<void> {
    await this._languageCombobox.click();
    await this._languageOptions.first().waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Close the language dropdown WITHOUT selecting (Escape) — no locale switch. */
  async closeLanguageMenu(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await this._languageOptions.first().waitFor({ state: "hidden", timeout: 10_000 });
  }

  /** Current UI locale from <html lang>. */
  async htmlLang(): Promise<string | null> {
    return this.page.locator("html").getAttribute("lang");
  }

  /** hrefs of every "Join Waitlist"/"Join waitlist" CTA on the page. */
  async joinWaitlistHrefs(): Promise<(string | null)[]> {
    const n = await this._joinWaitlistCtaLinks.count();
    const hrefs: (string | null)[] = [];
    for (let i = 0; i < n; i++) {
      hrefs.push(await this._joinWaitlistCtaLinks.nth(i).getAttribute("href"));
    }
    return hrefs;
  }
}
