// Page Object: Join Waitlist Success (public confirmation page after a waitlist application)
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/join-waitlist/success/page.tsx  (React Server Component)
//     - `searchParams.email` missing/empty → redirect("/join-waitlist")
//     - valid email → renders h1 successTitle + <p>{successDescription}<span>{email}</span> + <Link href="/">{backToHome}</Link>
//   messages/en.json → auth.joinWaitlist.{successTitle,successDescription,backToHome,title}
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name — see baseline locatorProfile):
//   • No data-testid anywhere in source or DOM → use getByRole / getByText only.
//   • Text labels resolved via i18n.t(key) with an English fallback (single-locale project,
//     stale-dict tolerant) — same pattern as join-waitlist.page.ts.
//   • Public page (no auth) → specs opt out of storageState.
//
// SMOKE safety: this is a purely static confirmation page — no form submit, no network write,
// no OTP. All interactions (navigation + Back-to-Homepage link) are side-effect-free.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  successTitle: "auth.joinWaitlist.successTitle",
  successDescription: "auth.joinWaitlist.successDescription",
  backToHome: "auth.joinWaitlist.backToHome",
  formHeading: "auth.joinWaitlist.title",
} as const;

const SUCCESS_PATH = "/join-waitlist/success";

export class JoinWaitlistSuccessPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  private readonly _successHeading: Locator;
  private readonly _successDescription: Locator;
  private readonly _backToHomeLink: Locator;
  private readonly _joinWaitlistFormHeading: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._successHeading = page.getByRole("heading", {
      name: this.t(KEYS.successTitle, "Application Submitted"),
    });
    // The <p> combines description + the echoed email in a child <span>. getByText does a
    // normalized substring match, so the description prefix locates the paragraph regardless
    // of the appended email value.
    this._successDescription = page.getByText(
      this.t(KEYS.successDescription, "Once approved, we'll send your invitation code to:"),
    );
    this._backToHomeLink = page.getByRole("link", {
      name: this.t(KEYS.backToHome, "Back to Homepage"),
    });
    // Redirect target: the anonymous Join Waitlist form heading, used to assert that a
    // bare/empty-email visit was bounced to /join-waitlist.
    this._joinWaitlistFormHeading = page.getByRole("heading", {
      name: this.t(KEYS.formHeading, "Join Waitlist"),
    });
  }

  /** i18n-aware label resolver with an English fallback (single-locale project, stale-dict tolerant). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get successHeading(): Locator { return this._successHeading; }
  get successDescription(): Locator { return this._successDescription; }
  get backToHomeLink(): Locator { return this._backToHomeLink; }
  get joinWaitlistFormHeading(): Locator { return this._joinWaitlistFormHeading; }

  /** Locator for the echoed email <span> (verbatim decoded value). */
  emailEcho(email: string): Locator {
    return this.page.getByText(email, { exact: true });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * Open the success page with a valid email query param. The value is URL-encoded here, so
   * pass the raw (decoded) email — e.g. "qa+tag@example.com". Waits for the success heading.
   */
  async gotoWithEmail(email: string): Promise<void> {
    await this.page.goto(`${SUCCESS_PATH}?email=${encodeURIComponent(email)}`);
    await this._successHeading.waitFor({ state: "visible", timeout: 20_000 });
  }

  /**
   * Open the success page with NO query param. The server redirect()s to /join-waitlist;
   * waits for the form heading on the landing page.
   */
  async gotoBare(): Promise<void> {
    await this.page.goto(SUCCESS_PATH);
    await this._joinWaitlistFormHeading.waitFor({ state: "visible", timeout: 20_000 });
  }

  /**
   * Open the success page with an empty email param (?email=). Empty string is falsy → same
   * server redirect() to /join-waitlist; waits for the form heading on the landing page.
   */
  async gotoWithEmptyEmail(): Promise<void> {
    await this.page.goto(`${SUCCESS_PATH}?email=`);
    await this._joinWaitlistFormHeading.waitFor({ state: "visible", timeout: 20_000 });
  }

  /** Click the Back to Homepage link (same-origin nav to site root). */
  async clickBackToHome(): Promise<void> {
    await this._backToHomeLink.click();
  }
}
