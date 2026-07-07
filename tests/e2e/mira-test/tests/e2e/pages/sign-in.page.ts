// source: cdp
// baseline: test-cases/generated/page-baseline-sign-in.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/features/auth/components/sign-in-form.tsx   (email step S0: <Input id="email"> + Continue <Button>; zod z.email() → FieldError; aria-invalid)
//   apps/mira-work/features/auth/components/social-buttons.tsx (Google / Microsoft OAuth <Button> — plain buttons, no role=tab/testid)
//   messages/en.json → auth.unifiedTitle, auth.emailPlaceholder, auth.continueTitle,
//                      auth.continueWithGoogle, auth.continueWithMicrosoft, auth.validation.emailInvalid
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name / placeholder):
//   • No data-testid anywhere in SignInForm/SocialButtons — use role+name / placeholder / text.
//   • continueButton uses { exact: true } so it never collides with the OAuth
//     "Continue with Google" / "Continue with Microsoft" buttons (all contain "Continue").
//   • Public page (no auth); specs opt out of storageState.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  heading: "auth.unifiedTitle",
  emailPlaceholder: "auth.emailPlaceholder",
  continue: "auth.continueTitle",
  oauthGoogle: "auth.continueWithGoogle",
  oauthMicrosoft: "auth.continueWithMicrosoft",
  emailInvalid: "auth.validation.emailInvalid",
} as const;

export class SignInPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  private readonly _heading: Locator;
  private readonly _emailInput: Locator;
  private readonly _continueButton: Locator;
  private readonly _googleButton: Locator;
  private readonly _microsoftButton: Locator;
  private readonly _emailError: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", {
      name: this.t(KEYS.heading, "Sign in or Sign up"),
    });
    this._emailInput = page.getByPlaceholder(
      this.t(KEYS.emailPlaceholder, "Enter your email address"),
    );
    // exact:true — must NOT match "Continue with Google" / "Continue with Microsoft".
    this._continueButton = page.getByRole("button", {
      name: this.t(KEYS.continue, "Continue"),
      exact: true,
    });
    this._googleButton = page.getByRole("button", {
      name: this.t(KEYS.oauthGoogle, "Continue with Google"),
    });
    this._microsoftButton = page.getByRole("button", {
      name: this.t(KEYS.oauthMicrosoft, "Continue with Microsoft"),
    });
    this._emailError = page.getByText(
      this.t(KEYS.emailInvalid, "Please enter a valid email address"),
    );
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get signInHeading(): Locator { return this._heading; }
  get emailInput(): Locator { return this._emailInput; }
  get continueButton(): Locator { return this._continueButton; }
  get googleButton(): Locator { return this._googleButton; }
  get microsoftButton(): Locator { return this._microsoftButton; }
  get emailError(): Locator { return this._emailError; }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open the sign-in page directly (public, no auth). */
  async goto(): Promise<void> {
    await this.page.goto("/sign-in");
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
  }

  /** Set the email field value (fires React onChange). Pass "" to clear. */
  async fillEmail(value: string): Promise<void> {
    await this._emailInput.fill(value);
  }

  /** Clear the email field. */
  async clearEmail(): Promise<void> {
    await this._emailInput.fill("");
  }

  /** Click the Continue button (email step submit). */
  async clickContinue(): Promise<void> {
    await this._continueButton.click();
  }

  /** Press Enter while focused in the email field (keyboard submit path). */
  async pressEnterInEmail(): Promise<void> {
    await this._emailInput.press("Enter");
  }
}
