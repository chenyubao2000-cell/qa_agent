// Page Object: Join Waitlist (public anonymous waitlist application form)
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/join-waitlist/page.tsx              (page, mode=anonymous default)
//   apps/mira-work/features/auth/components/join-waitlist-form.tsx (form: email gate + 5 fields + Submit/Cancel)
//   messages/en.json → auth.joinWaitlist.{title,workEmail,emailPlaceholder,sendOtp,company,role,
//                      useCase,submit,cancel,errors.emailNotVerified}
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+label — see baseline locatorProfile):
//   • No data-testid anywhere in source or DOM → use getByRole / getByLabel / getByText only.
//   • Labels resolved via i18n.t(key, fallback). NOTE: the deployed preview renders SEPARATE
//     "First name" / "Last name" fields, but the local messages/en.json snapshot only carries a
//     single `name` key (stale copy). The t(key, fallback) helper returns the English fallback
//     whenever a key is missing/unresolved, so first/last-name locators use hard fallbacks that
//     match the LIVE page — the live page is the source of truth for what tests actually see.
//   • Public page (no auth) → specs opt out of storageState.
//   • WORK EMAIL EXCEPTION: confirmed via CDP snapshot + source read (join-waitlist-form.tsx) that
//     the "Work Email" <FieldLabel> has no `htmlFor` and the email <Input> has no `id`/`aria-label`
//     — the ONLY field in this form missing that wiring (firstName/lastName/company/role/useCase
//     all correctly pair FieldLabel htmlFor="wl-*" with Input id="wl-*"). getByLabel('Work Email')
//     therefore resolves to 0 elements on the live page (verified: accessible name of the input is
//     "name@company.com", i.e. its placeholder, not "Work Email"). This is a real source-side
//     accessibility gap, but the field itself renders and functions correctly, so the test fix is
//     to locate it by placeholder (i18n key auth.joinWaitlist.emailPlaceholder) instead of label.
//
// SMOKE safety: Send Verify Code is NEVER clicked (would POST /api/waitlist/send-otp and send a
// real OTP email). The full verified-submit path is NEVER exercised (would create a real waitlist
// record + redirect to /join-waitlist/success). Only client-side gating + the safe unverified
// Submit short-circuit (toast, no network call) are covered.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  heading: "auth.joinWaitlist.title",
  workEmail: "auth.joinWaitlist.workEmail",
  emailPlaceholder: "auth.joinWaitlist.emailPlaceholder",
  sendOtp: "auth.joinWaitlist.sendOtp",
  company: "auth.joinWaitlist.company",
  role: "auth.joinWaitlist.role",
  useCase: "auth.joinWaitlist.useCase",
  submit: "auth.joinWaitlist.submit",
  cancel: "auth.joinWaitlist.cancel",
  emailNotVerified: "auth.joinWaitlist.errors.emailNotVerified",
} as const;

export class JoinWaitlistPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  private readonly _heading: Locator;
  private readonly _emailInput: Locator;
  private readonly _firstNameInput: Locator;
  private readonly _lastNameInput: Locator;
  private readonly _companyInput: Locator;
  private readonly _roleInput: Locator;
  private readonly _useCaseInput: Locator;
  private readonly _sendVerifyCodeButton: Locator;
  private readonly _submitButton: Locator;
  private readonly _cancelButton: Locator;
  private readonly _emailNotVerifiedToast: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", {
      name: this.t(KEYS.heading, "Join Waitlist"),
    });
    // "Work Email" label has no htmlFor/id association on the live page (source-confirmed gap,
    // unique to this field) — getByLabel would match 0 elements. Use the input's placeholder
    // instead, which IS present and i18n-resolved (auth.joinWaitlist.emailPlaceholder).
    this._emailInput = page.getByPlaceholder(
      this.t(KEYS.emailPlaceholder, "name@company.com"),
    );
    // First/Last name keys are absent from the local messages snapshot — the live page
    // renders these literal labels, so fall back to them directly.
    this._firstNameInput = page.getByLabel("First name");
    this._lastNameInput = page.getByLabel("Last name");
    this._companyInput = page.getByLabel(this.t(KEYS.company, "Company"));
    this._roleInput = page.getByLabel(this.t(KEYS.role, "Role / Position"));
    this._useCaseInput = page.getByLabel(
      this.t(KEYS.useCase, "How do you plan to use Mira"),
    );
    this._sendVerifyCodeButton = page.getByRole("button", {
      name: this.t(KEYS.sendOtp, "Send Verify Code"),
    });
    this._submitButton = page.getByRole("button", {
      name: this.t(KEYS.submit, "Submit Application"),
    });
    this._cancelButton = page.getByRole("button", {
      name: this.t(KEYS.cancel, "Cancel"),
    });
    this._emailNotVerifiedToast = page.getByText(
      this.t(KEYS.emailNotVerified, "Please verify your email before submitting"),
    );
  }

  /** i18n-aware label resolver with an English fallback (single-locale project, stale dict tolerant). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get emailInput(): Locator { return this._emailInput; }
  get firstNameInput(): Locator { return this._firstNameInput; }
  get lastNameInput(): Locator { return this._lastNameInput; }
  get companyInput(): Locator { return this._companyInput; }
  get roleInput(): Locator { return this._roleInput; }
  get useCaseInput(): Locator { return this._useCaseInput; }
  get sendVerifyCodeButton(): Locator { return this._sendVerifyCodeButton; }
  get submitButton(): Locator { return this._submitButton; }
  get cancelButton(): Locator { return this._cancelButton; }
  get emailNotVerifiedToast(): Locator { return this._emailNotVerifiedToast; }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open the join-waitlist page directly (public, anonymous). */
  async goto(): Promise<void> {
    await this.page.goto("/join-waitlist");
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    // Heading is SSR-rendered instantly and does NOT guarantee React hydration has attached
    // event handlers to the form yet. Under load (parallel workers hitting the shared preview
    // deployment), interacting before hydration completes silently no-ops clicks/fills (observed:
    // Send Verify Code staying disabled after fill, Submit Application producing no toast). Wait
    // for the network to settle as a best-effort hydration-readiness proxy.
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Set the Work Email field value (fires React onChange). Pass "" to clear. */
  async fillEmail(value: string): Promise<void> {
    await this._emailInput.fill(value);
  }

  /**
   * Click Submit Application. SAFE when the email is unverified: the onClick handler
   * short-circuits to the email-not-verified toast before any network call.
   * Do NOT call this on a fully verified form in smoke scope (would create a real record).
   */
  async clickSubmit(): Promise<void> {
    await this._submitButton.click();
  }
}
