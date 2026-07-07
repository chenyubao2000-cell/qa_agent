// source: cdp
// baseline: test-cases/generated/page-baseline-quick-activate.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/quick-activate/page.tsx          (server: redirect('/task') only if session?.user?.isActivated)
//   apps/mira-work/features/auth/components/quick-activate-form.tsx
//     - useTranslations("auth.quickActivate"); missing code||email → minimal error view (title + missingParams + hasAccount link, NO inputs)
//     - code&&email → full form: read-only email <input type=email>, read-only code <input type=text> (dash-formatted 000000→0000-00),
//       editable password <input> (placeholder ••••••••, autoFocus), show/hide toggle <button aria-label=Show/Hide password>, Continue <button>
//     - password zod: min 8 + letter + number + symbol; Continue disabled while (pending || !password || passwordError)
//     - submit → POST /api/auth/quick-activate; 400 → toast.error(codeInvalid)
//   messages/en.json → auth.quickActivate.{title,description,missingParams,hasAccount,emailLabel,codeLabel,passwordLabel,
//                      passwordPlaceholder,passwordHint,continueButton,codeInvalid,showPassword,hidePassword}
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name):
//   • No data-testid anywhere — use role+name / placeholder / text, plus attribute selectors for the two read-only inputs
//     (design-system Field labels are not htmlFor-linked, so read-only email/code are located by input type + [readonly]).
//   • Public page (no auth); specs opt out of storageState.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "auth.quickActivate.title",
  description: "auth.quickActivate.description",
  missingParams: "auth.quickActivate.missingParams",
  hasAccount: "auth.quickActivate.hasAccount",
  passwordPlaceholder: "auth.quickActivate.passwordPlaceholder",
  passwordHint: "auth.quickActivate.passwordHint",
  continueButton: "auth.quickActivate.continueButton",
  codeInvalid: "auth.quickActivate.codeInvalid",
  showPassword: "auth.quickActivate.showPassword",
  hidePassword: "auth.quickActivate.hidePassword",
} as const;

export class QuickActivatePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  private readonly _heading: Locator;
  private readonly _missingParamsText: Locator;
  private readonly _signInLink: Locator;
  private readonly _emailInput: Locator;
  private readonly _codeInput: Locator;
  private readonly _passwordInput: Locator;
  private readonly _passwordToggle: Locator;
  private readonly _passwordError: Locator;
  private readonly _continueButton: Locator;
  private readonly _invalidCodeToast: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const showLabel = this.t(KEYS.showPassword, "Show password");
    const hideLabel = this.t(KEYS.hidePassword, "Hide password");
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    this._heading = page.getByRole("heading", {
      name: this.t(KEYS.title, "Welcome to Mira"),
    });
    this._missingParamsText = page.getByText(
      this.t(KEYS.missingParams, "Incomplete link parameters. Please reopen from the email."),
    );
    this._signInLink = page.getByRole("link", {
      name: this.t(KEYS.hasAccount, "Already have an account? Sign in"),
    });
    // Read-only email: the only <input type="email"> on the page (URL-sourced, not editable).
    this._emailInput = page.locator('input[type="email"]');
    // Read-only invitation code: the only read-only text input (dash-formatted display value).
    this._codeInput = page.locator('input[type="text"][readonly]');
    // Editable password field — located by its bullet placeholder.
    this._passwordInput = page.getByPlaceholder(
      this.t(KEYS.passwordPlaceholder, "••••••••"),
    );
    // Visibility toggle — aria-label flips between Show/Hide password.
    this._passwordToggle = page.getByRole("button", {
      name: new RegExp(`${esc(showLabel)}|${esc(hideLabel)}`, "i"),
    });
    this._passwordError = page.getByText(
      this.t(
        KEYS.passwordHint,
        "Password must be at least 8 characters and include letters, numbers, and symbols",
      ),
    );
    // exact:true — the only Continue button on this route (no OAuth buttons here).
    this._continueButton = page.getByRole("button", {
      name: this.t(KEYS.continueButton, "Continue"),
      exact: true,
    });
    this._invalidCodeToast = page.getByText(
      this.t(KEYS.codeInvalid, "Invitation code is invalid or expired"),
    );
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get missingParamsText(): Locator { return this._missingParamsText; }
  get signInLink(): Locator { return this._signInLink; }
  get emailInput(): Locator { return this._emailInput; }
  get codeInput(): Locator { return this._codeInput; }
  get passwordInput(): Locator { return this._passwordInput; }
  get passwordToggle(): Locator { return this._passwordToggle; }
  get passwordError(): Locator { return this._passwordError; }
  get continueButton(): Locator { return this._continueButton; }
  get invalidCodeToast(): Locator { return this._invalidCodeToast; }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open /quick-activate with an email-invite link (code + email query params). */
  async gotoWithParams(code: string, email: string): Promise<void> {
    await this.page.goto(
      `/quick-activate?code=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`,
    );
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    // Heading is SSR-rendered instantly and does NOT guarantee React hydration has attached
    // event handlers to the form yet (same Next.js preview deployment as join-waitlist; confirmed
    // there that interacting before hydration completes silently no-ops clicks/fills — the show/hide
    // password toggle appears to do nothing, and fill() on the controlled password input gets
    // clobbered back to "" on the first post-hydration re-render). Wait for the network to settle
    // as a best-effort hydration-readiness proxy.
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Open bare /quick-activate (no query params) — missing-params error view. */
  async gotoMissingParams(): Promise<void> {
    await this.page.goto("/quick-activate");
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Set the password value (fires React onChange). Pass "" to clear. */
  async fillPassword(value: string): Promise<void> {
    await this._passwordInput.fill(value);
  }

  /** Blur the password field (triggers on-blur validation once touched). */
  async blurPassword(): Promise<void> {
    await this._passwordInput.blur();
  }

  /** Click the show/hide password toggle. */
  async togglePasswordVisibility(): Promise<void> {
    await this._passwordToggle.click();
  }

  /** Read the password input's current type attribute ("password" | "text"). */
  async passwordInputType(): Promise<string | null> {
    return this._passwordInput.getAttribute("type");
  }

  /** Submit the activation form. */
  async clickContinue(): Promise<void> {
    await this._continueButton.click();
  }
}
