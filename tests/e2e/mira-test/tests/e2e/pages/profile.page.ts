// source: cdp
// baseline: test-cases/generated/page-baseline-profile.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/profile/page.tsx                    (ProfilePage — route)
//   apps/mira-work/app/(agent)/profile/profile-page-client.tsx     (ProfilePageClient — filled/empty/loading state machine)
//   i18n namespace: candidate → candidate.profile.* / candidate.confirm.*
//
// Locator strategy (hasTestIds=false, dominantStrategy = role+name via aria-label/text):
//   • No data-testid exists anywhere in ProfilePageClient / ProfileFormSections — every locator is role/name.
//   • The `candidate` i18n namespace is NOT merged into this QA project's messages/en.json, so i18n.t()
//     returns the raw key. This is a single-locale ("en") deployment, so observed English CDP literals are
//     used as fallbacks via t(key, fallback) — identical to contacts.page.ts / home.page.ts.
//   • Portrait card header carries a dynamic account-derived name ("…'s read on you") — matched by the
//     stable /read on you/i substring, never the exact prefix.
//   • Never use Tailwind utility classes as locators for this page (baseline locatorProfile).
//
// Hydration note (e2e-flakiness-playbook §19b): this preview ships SSR skeleton before React hydrates;
// interacting before hydration silently no-ops. goto() waits for the h1 then a networkidle readiness proxy.
//
// Destructive-action guardrail: the "Rebuild" button (deleteProfile + redirect) and the "Save" submit
// (persists profile changes) are NEVER clicked by this POM's smoke methods — only their state is asserted.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  heading: "candidate.profile.heading",
  visibility: "candidate.profile.visibility",
  save: "candidate.profile.save",
  rebuild: "candidate.confirm.rebuild",
} as const;

export class ProfilePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Header / section headings (S0) ────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _basicInfoHeading: Locator;
  private readonly _contactHeading: Locator;
  private readonly _jobPreferencesHeading: Locator;
  private readonly _experienceHeading: Locator;
  private readonly _certificationsHeading: Locator;

  // ── Portrait card ("…'s read on you" collapsible) (S0 ↔ S1) ───────────────
  private readonly _portraitToggle: Locator;

  // ── Form fields (S0) ──────────────────────────────────────────────────────
  private readonly _nameInput: Locator;
  private readonly _emailInput: Locator;

  // ── Visibility switch (S0) ────────────────────────────────────────────────
  private readonly _visibilitySwitch: Locator;

  // ── Footer bar ────────────────────────────────────────────────────────────
  private readonly _saveButton: Locator;
  private readonly _rebuildButton: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const headingLabel = this.t(KEYS.heading, "Profile");
    const visibilityLabel = this.t(KEYS.visibility, "Discoverable by employers");
    const saveLabel = this.t(KEYS.save, "Save");
    const rebuildLabel = this.t(KEYS.rebuild, "Rebuild");

    this._heading = page.getByRole("heading", { level: 1, name: headingLabel });
    this._basicInfoHeading = page.getByRole("heading", { name: "Basic info", exact: true });
    this._contactHeading = page.getByRole("heading", { name: "Contact & social", exact: true });
    this._jobPreferencesHeading = page.getByRole("heading", { name: "Job preferences", exact: true });
    this._experienceHeading = page.getByRole("heading", { name: "Experience & education", exact: true });
    this._certificationsHeading = page.getByRole("heading", { name: "Certifications / Licenses", exact: true });

    // Dynamic account-derived prefix ("Mira11111's read on you") — match on the stable substring.
    this._portraitToggle = page.getByRole("button", { name: /read on you/i });

    this._nameInput = page.getByRole("textbox", { name: "Your name" });
    this._emailInput = page.getByRole("textbox", { name: "name@example.com" });

    this._visibilitySwitch = page.getByRole("switch", { name: visibilityLabel });

    this._saveButton = page.getByRole("button", { name: saveLabel, exact: true });
    this._rebuildButton = page.getByRole("button", { name: rebuildLabel, exact: true });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get basicInfoHeading(): Locator { return this._basicInfoHeading; }
  get contactHeading(): Locator { return this._contactHeading; }
  get jobPreferencesHeading(): Locator { return this._jobPreferencesHeading; }
  get experienceHeading(): Locator { return this._experienceHeading; }
  get certificationsHeading(): Locator { return this._certificationsHeading; }
  get portraitToggle(): Locator { return this._portraitToggle; }
  get nameInput(): Locator { return this._nameInput; }
  get emailInput(): Locator { return this._emailInput; }
  get visibilitySwitch(): Locator { return this._visibilitySwitch; }
  get saveButton(): Locator { return this._saveButton; }
  get rebuildButton(): Locator { return this._rebuildButton; }

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Open the authenticated Profile page. Auth is applied via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/profile");
    // Wait for the h1, then a hydration-readiness proxy — SSR ships the skeleton before React
    // attaches handlers; interacting too early silently no-ops on this deployment (§19b).
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Current value of the "Your name" text field. */
  async nameValue(): Promise<string> {
    return (await this._nameInput.inputValue()) ?? "";
  }

  /** Replace the "Your name" field value (marks the form dirty → Save enabled). */
  async setName(value: string): Promise<void> {
    await this._nameInput.click();
    await this._nameInput.fill(value);
  }

  /** aria-expanded state of the portrait card header ("true" | "false" | null). */
  async portraitExpanded(): Promise<string | null> {
    return this._portraitToggle.getAttribute("aria-expanded");
  }

  /** Click the portrait card header to toggle expand/collapse (S0 ↔ S1). */
  async togglePortrait(): Promise<void> {
    await this._portraitToggle.click();
  }

  /**
   * Click the "Discoverable by employers" switch (fires PUT /api/profile/visibility).
   * Callers MUST toggle back to restore the original state — this mutates server data.
   *
   * Waits for the underlying PUT response, not just the optimistic UI update — the switch
   * flips its visual state immediately while the request is still in flight, so a test that
   * asserts UI state and then tears down the page/context can race the request and cancel it,
   * leaving the server-side value stuck at the wrong state for the NEXT test run (see
   * e2e-flakiness-playbook.md §22 for the shared-account race this caused).
   */
  async toggleVisibility(): Promise<void> {
    const response = this.page.waitForResponse(
      (res) => res.url().includes("/api/profile/visibility") && res.request().method() === "PUT",
      { timeout: 10_000 },
    );
    await this._visibilitySwitch.click();
    await response;
  }
}
