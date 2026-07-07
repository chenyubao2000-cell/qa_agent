// source: cdp
// baseline: test-cases/generated/page-baseline-reset-password.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/reset-password/page.tsx
//   apps/mira-work/features/auth/components/reset-password-form.tsx
//     (TanStack Form + zod, next-intl "auth" namespace)
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+label/aria, all i18n-sensitive):
//   • NO data-testid anywhere → use getByRole heading/button/link + getByLabel for the password inputs.
//   • Two password inputs share the label prefix "New Password" / "Confirm New Password" → getByLabel
//     MUST use { exact: true } so "New Password" does not also match "Confirm New Password".
//   • Each password field has a sibling show/hide <button> with aria-label that FLIPS between
//     auth.showPassword / auth.hidePassword. Because both toggles share the same accessible name,
//     they are located by DOM relationship (following-sibling of their input), NOT by name — this is
//     stable across the aria-label flip and avoids strict-mode collisions between the two toggles.
//   • Conditional render: `error || !token` → invalid-link guard; `token` present → reset form.
//     The component performs NO client-side token validity check (any non-empty token renders the form).
//   • Password onBlur zod: min(8) + letters + digits + symbol → auth.validation.passwordStrength.
//     confirmPassword onBlur: mismatch → auth.passwordMismatch.
//
// i18n: appLanguages="en". POM accepts the i18n fixture per project convention and resolves all
//   text-based locators via i18n.t('auth.*') with an English literal fallback (single-locale project).

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

export class ResetPasswordPage {
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

  // ── Text tokens (i18n) ───────────────────────────────────────────────────────
  private get invalidTitleText(): string {
    return this.t("auth.invalidResetLink", "Reset Link Invalid or Expired");
  }
  private get invalidMessageText(): string {
    return this.t(
      "auth.invalidResetLinkMessage",
      "This password reset link is invalid or has expired. Please request a new password reset.",
    );
  }
  private get requestNewLinkText(): string {
    return this.t("auth.requestNewLink", "Request New Link");
  }
  private get formTitleText(): string {
    return this.t("auth.resetPasswordTitle", "Reset Password");
  }
  private get formDescriptionText(): string {
    return this.t("auth.resetPasswordDescription", "Please enter your new password");
  }
  private get newPasswordLabel(): string {
    return this.t("auth.newPassword", "New Password");
  }
  private get confirmPasswordLabel(): string {
    return this.t("auth.confirmNewPassword", "Confirm New Password");
  }
  private get submitText(): string {
    return this.t("auth.resetPassword", "Reset Password");
  }
  private get showPasswordText(): string {
    return this.t("auth.showPassword", "Show password");
  }
  private get hidePasswordText(): string {
    return this.t("auth.hidePassword", "Hide password");
  }
  private get signInText(): string {
    return this.t("auth.signIn", "Sign In");
  }
  private get passwordStrengthText(): string {
    return this.t(
      "auth.validation.passwordStrength",
      "Password must be at least 8 characters and include letters, numbers, and symbols",
    );
  }
  private get passwordMismatchText(): string {
    return this.t("auth.passwordMismatch", "Passwords do not match");
  }

  // ── Locators: invalid-link guard state (error || !token) ─────────────────────
  /** h1 shown when the route is accessed without a valid token. */
  get invalidLinkHeading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: this.invalidTitleText });
  }

  /** Explanatory paragraph under the invalid-link heading. */
  get invalidLinkMessage(): Locator {
    return this.page.getByText(this.invalidMessageText);
  }

  /** "Request New Link" — rendered as <Link href="/forgot-password"> (role=link). */
  get requestNewLinkLink(): Locator {
    return this.page.getByRole("link", { name: this.requestNewLinkText });
  }

  // ── Locators: reset-password form state (token present) ──────────────────────
  /** h1 "Reset Password" (form state). */
  get formHeading(): Locator {
    return this.page.getByRole("heading", { level: 1, name: this.formTitleText });
  }

  /** Form description paragraph. */
  get formDescription(): Locator {
    return this.page.getByText(this.formDescriptionText);
  }

  /** New-password <Input id="password"> bound to <FieldLabel htmlFor="password">.
   *  exact:true so it does NOT also match the "Confirm New Password" label. */
  get passwordInput(): Locator {
    return this.page.getByLabel(this.newPasswordLabel, { exact: true });
  }

  /** Confirm-new-password <Input id="confirmPassword">. */
  get confirmPasswordInput(): Locator {
    return this.page.getByLabel(this.confirmPasswordLabel, { exact: true });
  }

  /** Show/hide toggle for the new-password field — sibling <button> of the input.
   *  Located by DOM relationship (not aria-label) so it survives the Show↔Hide flip. */
  get passwordToggle(): Locator {
    return this.passwordInput.locator("xpath=following-sibling::button[1]");
  }

  /** Show/hide toggle for the confirm-password field. */
  get confirmPasswordToggle(): Locator {
    return this.confirmPasswordInput.locator("xpath=following-sibling::button[1]");
  }

  /** "Reset Password" submit button (type=submit; disabled while isPending). */
  get submitButton(): Locator {
    return this.page.getByRole("button", { name: this.submitText });
  }

  /** Footer "Sign In" link (<Link href="/sign-in">). */
  get signInLink(): Locator {
    return this.page.getByRole("link", { name: this.signInText });
  }

  /** Password-strength validation error (rendered under the new-password field on blur). */
  get passwordStrengthError(): Locator {
    return this.page.getByText(this.passwordStrengthText);
  }

  /** Password-mismatch validation error (rendered under the confirm field on blur). */
  get passwordMismatchError(): Locator {
    return this.page.getByText(this.passwordMismatchText);
  }

  // ── Actions / queries ────────────────────────────────────────────────────────
  /** Open the reset-password route with NO token → invalid-link guard state. */
  async gotoWithoutToken(): Promise<void> {
    await this.page.goto("/reset-password");
    await this.invalidLinkHeading.waitFor({ state: "visible", timeout: 20_000 });
  }

  /** Open the reset-password route with a token → form state.
   *  Default token is a deliberately fake value: the component does NOT validate it client-side. */
  async gotoWithToken(token = "fake-invalid-token-12345"): Promise<void> {
    await this.page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await this.formHeading.waitFor({ state: "visible", timeout: 20_000 });
    // SSR renders the form skeleton before React hydrates (see e2e-flakiness-playbook.md §19b).
    // Interactions below (password toggle click, onBlur validators) require hydration to have
    // attached event listeners — without this wait, clicks/blurs land on dead DOM and silently no-op.
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Fill the new-password field (does not blur). */
  async fillPassword(value: string): Promise<void> {
    await this.passwordInput.fill(value);
  }

  /** Fill the confirm-password field (does not blur). */
  async fillConfirmPassword(value: string): Promise<void> {
    await this.confirmPasswordInput.fill(value);
  }

  /** Blur the new-password field to trigger its on-blur zod validator. */
  async blurPassword(): Promise<void> {
    await this.passwordInput.blur();
  }

  /** Blur the confirm-password field to trigger its on-blur validator. */
  async blurConfirmPassword(): Promise<void> {
    await this.confirmPasswordInput.blur();
  }

  /** Click the new-password show/hide toggle. */
  async togglePasswordVisibility(): Promise<void> {
    await this.passwordToggle.click();
  }

  /** Current type attribute of the new-password input ("password" | "text"). */
  async passwordInputType(): Promise<string | null> {
    return this.passwordInput.getAttribute("type");
  }

  /** Current URL pathname. */
  pathname(): string {
    return new URL(this.page.url()).pathname;
  }
}
