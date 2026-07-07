// source: cdp
// baseline: test-cases/generated/page-baseline-verify-email.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/verify-email/page.tsx (server component — redirect('/sign-in') when ?email= is absent)
//   apps/mira-work/features/auth/components/verify-email-form.tsx (client form, next-intl "auth")
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+label, all i18n-sensitive):
//   • NO data-testid / aria-label in the component tree → getByRole heading/button + getByLabel('Verification code').
//   • OTP <Input id="otp"> paired with <FieldLabel htmlFor="otp"> → getByLabel('Verification code') resolves it.
//   • On mount the form auto-fires POST send-verification-otp; while isSending is true the OTP input AND the
//     Continue button are disabled (disabled={isLoading}). Playwright fill()/click() auto-wait for "enabled",
//     so no explicit wait is needed — actionability handles the loading window.
//   • OTP onChange sanitizes input: value.replace(/\D/g,'').slice(0,6) — non-digits stripped, hard cap 6 digits.
//   • Continue button: disabled={isLoading || !otp.trim()} — enabled only once a non-empty OTP is present.
//   • aria-invalid = Boolean(otpError) → renders as string "true"/"false".
//   • "Back to Login" onClick calls window.location.replace('/sign-in') — a hard browser nav (NOT page.goto,
//     so it is NOT intercepted by the ensureAuthenticated session guard).
//
// SAFETY: navigating here auto-sends one real verification email (inherent to the page). Tests never click the
//   "Resend" control (which would send additional real emails) and never submit a valid OTP.
//
// i18n: appLanguages="en". POM accepts the i18n fixture per project convention and resolves all text-based
//   locators via i18n.t('auth.*') with an English literal fallback (single-locale project).

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

export class VerifyEmailPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;
  }

  /** i18n-aware token resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Text tokens (i18n) ───────────────────────────────────────────────────
  private get titleText(): string {
    return this.t("auth.verifyEmail.title", "Verify your email");
  }
  private get otpLabelText(): string {
    return this.t("auth.verifyEmail.otpLabel", "Verification code");
  }
  private get continueText(): string {
    return this.t("auth.continueTitle", "Continue");
  }
  private get backToLoginText(): string {
    return this.t("auth.backToLogin", "Back to Login");
  }
  private get descriptionText(): string {
    return this.t("auth.verifyEmail.description", "We sent a verification code to");
  }
  private get fieldRequiredText(): string {
    return this.t("auth.validation.fieldRequired", "This field is required");
  }

  // ── Locators ───────────────────────────────────────────────────────────────
  /** H1 page title "Verify your email". */
  get pageHeading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: this.titleText });
  }

  /** OTP input — <Input id="otp"> bound to <FieldLabel htmlFor="otp">. */
  get otpInput(): Locator {
    return this.page.getByLabel(this.otpLabelText, { exact: true });
  }

  /** "Continue" submit button (type=button, disabled while loading or OTP empty). */
  get continueButton(): Locator {
    return this.page.getByRole("button", { name: this.continueText });
  }

  /** "Back to Login" ghost button — hard-navigates to /sign-in. */
  get backToLoginButton(): Locator {
    return this.page.getByRole("button", { name: this.backToLoginText });
  }

  /** Paragraph copy that echoes the email the code was sent to. */
  get descriptionParagraph(): Locator {
    return this.page.getByText(this.descriptionText);
  }

  /** FieldError shown under the OTP input on empty submit ("This field is required"). */
  get requiredError(): Locator {
    return this.page.getByText(this.fieldRequiredText);
  }

  // ── Actions / queries ────────────────────────────────────────────────────────
  /** Open the verify-email form with the required ?email= param (renders the form, no redirect). */
  async goto(email: string): Promise<void> {
    await this.page.goto(`/verify-email?email=${encodeURIComponent(email)}`);
    await this.pageHeading.waitFor({ state: "visible", timeout: 20_000 });
    // Hydration-readiness proxy — SSR renders the heading before React attaches
    // handlers; interacting too early silently no-ops. See e2e-flakiness-playbook.md §19b.
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /**
   * Navigate to the bare /verify-email (no ?email=), which server-redirects to /sign-in.
   * MUST be called on a fresh page whose goto is NOT patched by the ensureAuthenticated guard,
   * otherwise the guard tries to re-authenticate on the /sign-in landing. See spec TC-CDP-VE-001.
   */
  async gotoBare(): Promise<void> {
    await this.page.goto("/verify-email");
    await this.page.waitForURL("**/sign-in**", { timeout: 20_000 }).catch(() => {});
  }

  /** Fill the OTP field. Auto-waits for the input to become enabled after the on-mount send completes. */
  async fillOtp(value: string): Promise<void> {
    await this.otpInput.fill(value);
  }

  /** Clear the OTP field. */
  async clearOtp(): Promise<void> {
    await this.otpInput.fill("");
  }

  /** Focus the OTP field and press Enter (submit path). With an empty value this triggers client-side validation. */
  async pressEnterInOtp(): Promise<void> {
    await this.otpInput.focus();
    await this.otpInput.press("Enter");
  }

  /** Click "Back to Login" (hard nav to /sign-in) and wait for the landing. */
  async clickBackToLogin(): Promise<void> {
    await this.backToLoginButton.click();
    await this.page.waitForURL("**/sign-in**", { timeout: 20_000 });
  }

  /** Current URL pathname. */
  pathname(): string {
    return new URL(this.page.url()).pathname;
  }
}
