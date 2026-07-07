// source: cdp
// baseline: test-cases/generated/page-baseline-invite-accept.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/invite/accept/page.tsx (InviteAcceptPage)
//   apps/mira-work/app/(auth)/layout.tsx (AuthLayout — registers ns ["auth","inviteAccept","common"])
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name):
//   • NO data-testid / aria-label anywhere in the component tree → getByRole heading/button/link/combobox.
//   • Bare access (no ?token=) short-circuits to phase='missing_token', which renders IDENTICAL copy to the
//     'invalid' phase: h1 invalidTitle + subtitle invalidSubtitle + "Go to Mira" (goToApp) button. No API POST fires.
//   • The verifying spinner only appears when a token param is present; not reachable on bare access.
//   • Clicking "Go to Mira" is a client-side router.push('/') → lands on the public marketing homepage.
//
// i18n: appLanguages="en". The auth.inviteAccept.* keys are NOT present in the current messages/en.json,
//   so i18n.t() would return the key verbatim. The t(key, fallback) helper therefore falls back to the live
//   English literal captured via CDP. Specs assert against these POM getters (not raw i18n.t()) to stay correct.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

export class InviteAcceptPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;
  }

  /** i18n-aware resolver with an English fallback. Falls back when the key is absent
   *  from the message dict (i18n.t returns the key unchanged in that case). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Text tokens (i18n, with live-page English fallback) ──────────────────────
  /** Expected h1 text for the invalid / missing_token phase (public getter for spec assertions). */
  get invalidTitleText(): string {
    return this.t("auth.inviteAccept.invalidTitle", "This invitation link is invalid");
  }
  private get invalidSubtitleText(): string {
    return this.t(
      "auth.inviteAccept.invalidSubtitle",
      "The link may be broken or already used. Ask the team Owner to send a new one.",
    );
  }
  private get goToAppText(): string {
    return this.t("auth.inviteAccept.goToApp", "Go to Mira");
  }
  private get homepageHeadingText(): string {
    // Marketing homepage marker (post-navigation target of "Go to Mira").
    return "Work With You, Not For You";
  }

  // ── Locators: /invite/accept (missing_token / invalid phase) ─────────────────
  /** Error-phase h1 ("This invitation link is invalid"). */
  get pageHeading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: this.invalidTitleText });
  }

  /** Error-phase subtitle static text. */
  get invalidSubtitle(): Locator {
    return this.page.getByText(this.invalidSubtitleText);
  }

  /** "Go to Mira" action button — client-side navigates to '/'. */
  get goToMiraButton(): Locator {
    return this.page.getByRole("button", { name: this.goToAppText });
  }

  // ── Locators: (auth) layout header ───────────────────────────────────────────
  /** Header brand link "Mira" (href="/"). Scoped to banner to avoid homepage-body matches. */
  get brandLink(): Locator {
    return this.page.getByRole("banner").getByRole("link", { name: "Mira", exact: true });
  }

  /** Language switcher combobox (default shows "English"). */
  get languageCombobox(): Locator {
    return this.page.getByRole("combobox");
  }

  // ── Locators: marketing homepage (post "Go to Mira" navigation target) ───────
  /** Homepage hero heading, used to confirm navigation succeeded. */
  get homepageHeading(): Locator {
    return this.page.getByRole("heading", { name: this.homepageHeadingText });
  }

  // ── Actions / queries ────────────────────────────────────────────────────────
  /** Open the public invite-accept page with no query params (bare access → missing_token). */
  async goto(): Promise<void> {
    await this.page.goto("/invite/accept");
    await this.pageHeading.waitFor({ state: "visible", timeout: 20_000 });
  }

  /** Click "Go to Mira" and wait for the client-side navigation to the homepage root. */
  async clickGoToMira(): Promise<void> {
    await this.goToMiraButton.click();
    await this.page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 20_000 });
  }

  /** Current URL pathname. */
  pathname(): string {
    return new URL(this.page.url()).pathname;
  }
}
