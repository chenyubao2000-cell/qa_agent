// source: cdp
// baseline: test-cases/generated/page-baseline-sign-up.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/sign-up/page.tsx            (page-level gate: redirect('/sign-in') when !searchParams.email)
//   apps/mira-work/features/auth/components/sign-up-form.tsx
//     • h1 = t('createPasswordTitle')
//     • <Input id="email-display"> readOnly, value={email}, FieldLabel htmlFor="email-display" = t('emailLabel')
//     • Edit <button> = t('editLink') → window.location.href = '/sign-in'
//     • <Input id="password"> FieldLabel htmlFor="password" = t('password'); aria-invalid={Boolean(passwordError)}
//     • show/hide password toggle <button aria-label={showPassword ? t('hidePassword') : t('showPassword')}>
//     • Continue <Button> = t('continueTitle'), disabled={isPending || !password || Boolean(passwordError)}
//     • Back to Login <Button> = t('backToLogin') → window.location.href = '/sign-in'
//   messages/en.json → auth.createPasswordTitle, auth.emailLabel, auth.editLink, auth.password,
//                      auth.showPassword, auth.continueTitle, auth.backToLogin, auth.validation.passwordStrength
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name / getByLabel):
//   • No data-testid anywhere in SignUpForm — use role+name / label / text only.
//   • continueButton uses { exact: true } so it never collides with "Back to Login" (defensive; only one "Continue" here).
//   • Public page (no auth); specs opt out of storageState.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  heading: "auth.createPasswordTitle",
  emailLabel: "auth.emailLabel",
  editLink: "auth.editLink",
  password: "auth.password",
  showPassword: "auth.showPassword",
  continue: "auth.continueTitle",
  backToLogin: "auth.backToLogin",
  passwordStrength: "auth.validation.passwordStrength",
} as const;

const DEFAULT_EMAIL = "test@example.com";

export class SignUpPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  private readonly _heading: Locator;
  private readonly _emailInput: Locator;
  private readonly _editButton: Locator;
  private readonly _passwordInput: Locator;
  private readonly _showPasswordToggle: Locator;
  private readonly _continueButton: Locator;
  private readonly _backToLoginButton: Locator;
  private readonly _passwordError: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", {
      name: this.t(KEYS.heading, "Create password"),
    });
    this._emailInput = page.getByRole("textbox", {
      name: this.t(KEYS.emailLabel, "Email"),
    });
    this._editButton = page.getByRole("button", {
      name: this.t(KEYS.editLink, "Edit"),
    });
    // exact:true — the "Show password" toggle button's aria-label contains "password"
    // as a substring, so a non-exact getByLabel('Password') matches both the input
    // AND the toggle button (strict-mode violation).
    this._passwordInput = page.getByLabel(this.t(KEYS.password, "Password"), { exact: true });
    this._showPasswordToggle = page.getByRole("button", {
      name: this.t(KEYS.showPassword, "Show password"),
    });
    // exact:true — defensive against any future "Continue with …" siblings.
    this._continueButton = page.getByRole("button", {
      name: this.t(KEYS.continue, "Continue"),
      exact: true,
    });
    this._backToLoginButton = page.getByRole("button", {
      name: this.t(KEYS.backToLogin, "Back to Login"),
    });
    this._passwordError = page.getByText(
      this.t(
        KEYS.passwordStrength,
        "Password must be at least 8 characters and include letters, numbers, and symbols",
      ),
    );
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get emailInput(): Locator { return this._emailInput; }
  get editButton(): Locator { return this._editButton; }
  get passwordInput(): Locator { return this._passwordInput; }
  get showPasswordToggle(): Locator { return this._showPasswordToggle; }
  get continueButton(): Locator { return this._continueButton; }
  get backToLoginButton(): Locator { return this._backToLoginButton; }
  get passwordError(): Locator { return this._passwordError; }

  // ── Navigation ──────────────────────────────────────────────────────────
  /** Open the Create-password form directly with a pre-filled email (public, no auth). */
  async goto(email: string = DEFAULT_EMAIL): Promise<void> {
    await this.page.goto(`/sign-up?email=${encodeURIComponent(email)}`);
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    // Hydration-readiness proxy — SSR renders the heading before React attaches
    // handlers; interacting too early silently no-ops. See e2e-flakiness-playbook.md §19b.
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /**
   * Navigate to bare /sign-up with NO email param — exercises the page-level
   * redirect guard. Intended to run on a fresh (unwrapped) page/context so the
   * session-guard fixture does not intercept the resulting /sign-in landing.
   */
  async gotoWithoutEmail(): Promise<void> {
    await this.page.goto("/sign-up");
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Set the password field value (fires React onChange). Pass "" to clear. */
  async fillPassword(value: string): Promise<void> {
    await this._passwordInput.fill(value);
  }

  /** Move focus off the password field to trigger onBlur validation. */
  async blurPassword(): Promise<void> {
    await this._passwordInput.blur();
  }

  /** Click the Continue button (submit — only when intentionally exercised). */
  async clickContinue(): Promise<void> {
    await this._continueButton.click();
  }

  /** Click Back to Login (hard navigation to /sign-in). */
  async clickBackToLogin(): Promise<void> {
    await this._backToLoginButton.click();
  }
}
