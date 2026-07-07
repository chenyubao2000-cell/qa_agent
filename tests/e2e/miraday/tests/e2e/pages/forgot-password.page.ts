// source: cdp
// baseline: test-cases/generated/page-baseline-forgot-password.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/forgot-password/page.tsx
//   apps/mira-work/features/auth/components/forgot-password-form.tsx (TanStack Form + zod z.email(), next-intl "auth")
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+label, all i18n-sensitive):
//   • NO data-testid / aria-label anywhere in the component tree → use getByRole heading/button/link + getByLabel('Email').
//   • Email <Input id="email"> paired with <FieldLabel htmlFor="email"> → getByLabel('Email') resolves it.
//   • Validation is on-blur only (zod z.email via TanStack onBlur validator). FieldError text renders under the field.
//   • aria-invalid is a string attribute: "false" on load / valid, "true" after blur with an invalid value.
//   • Hidden 3-step flow email → confirm → success. onSubmit only setStep('confirm') (NO API). The real
//     password-reset email is sent ONLY by clicking "Continue" in the confirm step → POM intentionally exposes
//     continueButton as a getter but NEVER clicks it; specs must not click it either.
//
// i18n: appLanguages="en". POM accepts the i18n fixture per project convention and resolves all text-based
//   locators via i18n.t('auth.*') with an English literal fallback (single-locale project).

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

export class ForgotPasswordPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Text tokens (i18n) ───────────────────────────────────────────────────
  private get titleText(): string {
    return this.t("auth.forgotPasswordTitle", "Forgot Password");
  }
  private get emailLabel(): string {
    return this.t("auth.email", "Email");
  }
  private get sendResetLinkText(): string {
    return this.t("auth.sendResetLink", "Send Reset Link");
  }
  private get backToSignInText(): string {
    return this.t("auth.backToSignIn", "Back to Sign In");
  }
  private get emailInvalidText(): string {
    return this.t("auth.validation.emailInvalid", "Please enter a valid email address");
  }
  private get continueText(): string {
    return this.t("auth.continueButton", "Continue");
  }
  private get returnToSignInText(): string {
    return this.t("auth.returnToLogin", "Return to Sign In");
  }

  // ── Locators (step=email) ──────────────────────────────────────────────────
  /** Step-email / step-confirm heading "Forgot Password" (renders as h1). */
  get pageHeading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: this.titleText });
  }

  /** Email input — <Input id="email"> bound to <FieldLabel htmlFor="email">. */
  get emailInput(): Locator {
    return this.page.getByLabel(this.emailLabel, { exact: true });
  }

  /** "Send Reset Link" submit button (type=submit). */
  get submitButton(): Locator {
    return this.page.getByRole("button", { name: this.sendResetLinkText });
  }

  /** "Back to Sign In" link (<Link href="/sign-in">). */
  get backToSignInLink(): Locator {
    return this.page.getByRole("link", { name: this.backToSignInText });
  }

  /** Field validation error rendered under the email input on blur. */
  get emailError(): Locator {
    return this.page.getByText(this.emailInvalidText);
  }

  // ── Locators (step=confirm — DO NOT click Continue) ────────────────────────
  /** Confirm-step "Continue" button. Present ONLY after a valid submit advances to step=confirm.
   *  NEVER click it — it fires authClient.requestPasswordReset and sends a real reset email. */
  get continueButton(): Locator {
    return this.page.getByRole("button", { name: this.continueText });
  }

  /** Confirm-step "Return to Sign In" button (goes back to step=email locally). */
  get returnToSignInButton(): Locator {
    return this.page.getByRole("button", { name: this.returnToSignInText });
  }

  // ── Actions / queries ──────────────────────────────────────────────────────
  /** Open the public forgot-password page (no auth required). */
  async goto(): Promise<void> {
    await this.page.goto("/forgot-password");
    await this.pageHeading.waitFor({ state: "visible", timeout: 20_000 });
    // Hydration-readiness proxy — SSR renders the heading before React attaches
    // handlers; interacting too early silently no-ops. See e2e-flakiness-playbook.md §19b.
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Type into the email field (does not blur). */
  async fillEmail(value: string): Promise<void> {
    await this.emailInput.fill(value);
  }

  /** Blur the email field to trigger the on-blur zod validator. */
  async blurEmail(): Promise<void> {
    await this.emailInput.blur();
  }

  /** Submit the step=email form. onSubmit only advances local step to 'confirm' — no API, no email. */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Current aria-invalid attribute value on the email input ("true" | "false" | null). */
  async emailAriaInvalid(): Promise<string | null> {
    return this.emailInput.getAttribute("aria-invalid");
  }

  /** Current URL pathname. */
  pathname(): string {
    return new URL(this.page.url()).pathname;
  }
}
