import { type Page } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

export class ForgotPasswordPage {
  constructor(
    private readonly page: Page,
    private readonly i18n?: I18n,
  ) {}

  // ── Navigation ──

  async goto() {
    await this.page.goto("/forgot-password");
  }

  // ── Locators (private) ──

  private get emailInput() {
    return this.page.getByRole("textbox", {
      name: /Email|邮箱|E-mail/i,
    });
  }

  private get sendResetLinkButton() {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.sendResetLink")
        : i18nRegex("auth.sendResetLink"),
    });
  }

  private get backToLoginLink() {
    return this.page.getByRole("link", {
      name: this.i18n
        ? this.i18n.t("auth.backToSignIn")
        : i18nRegex("auth.backToSignIn"),
    });
  }

  private get backToLoginButton() {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.returnToLogin")
        : i18nRegex("auth.returnToLogin"),
    });
  }

  private get continueButton() {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.continueButton")
        : i18nRegex("auth.continueButton"),
    });
  }

  private get pageTitle() {
    return this.page.getByRole("heading", {
      name: this.i18n
        ? this.i18n.t("auth.forgotPasswordTitle")
        : i18nRegex("auth.forgotPasswordTitle"),
    });
  }

  private get pageDescription() {
    return this.page.locator("p").filter({
      hasText: this.i18n
        ? this.i18n.t("auth.forgotPasswordDescription")
        : i18nRegex("auth.forgotPasswordDescription"),
    });
  }

  private get confirmationText() {
    // The confirm step paragraph contains interpolated email — match on static prefix only
    // en: 'Click "Continue" to send a password reset link to <email>'
    return this.page.locator("p").filter({
      hasText: /send a password reset link/i,
    });
  }

  private get validationError() {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("auth.validation.emailInvalid")
        : i18nRegex("auth.validation.emailInvalid"),
    );
  }

  // ── Public getters ──

  getEmailInput() {
    return this.emailInput;
  }
  getSendResetLinkButton() {
    return this.sendResetLinkButton;
  }
  getBackToLoginLink() {
    return this.backToLoginLink;
  }
  getBackToLoginButton() {
    return this.backToLoginButton;
  }
  getContinueButton() {
    return this.continueButton;
  }
  getPageTitle() {
    return this.pageTitle;
  }
  getPageDescription() {
    return this.pageDescription;
  }
  getConfirmationText() {
    return this.confirmationText;
  }
  getValidationError() {
    return this.validationError;
  }

  // ── Actions ──

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async clickSendResetLink() {
    await this.sendResetLinkButton.click();
  }

  async clickBackToLoginLink() {
    await this.backToLoginLink.click();
  }

  async clickBackToLoginButton() {
    await this.backToLoginButton.click();
  }

  async clickContinue() {
    await this.continueButton.click();
  }

  async submitValidEmail(email: string = `test_${Date.now()}@example.com`) {
    await this.fillEmail(email);
    await this.clickSendResetLink();
  }
}
