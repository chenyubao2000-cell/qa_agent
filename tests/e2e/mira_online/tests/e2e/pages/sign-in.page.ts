import { type Page, type Locator } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

export class SignInPage {
  constructor(
    private readonly page: Page,
    private readonly i18n?: I18n,
  ) {}

  // ── Navigation ──

  async goto() {
    await this.page.goto("/sign-in");
  }

  // ── Step 1: Email Input ──

  private get titleHeading(): Locator {
    return this.page.getByRole("heading", {
      name: this.i18n
        ? this.i18n.t("auth.unifiedTitle")
        : i18nRegex("auth.unifiedTitle"),
    });
  }

  private get emailInput(): Locator {
    return this.page.getByRole("textbox", { name: /email|邮件|e-mail/i });
  }

  private get continueButton(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.continueButton")
        : i18nRegex("auth.continueButton", { exact: true }),
      exact: true,
    });
  }

  private get googleOAuthButton(): Locator {
    return this.page.getByRole("button", { name: /Google/i });
  }

  private get microsoftOAuthButton(): Locator {
    return this.page.getByRole("button", { name: /Microsoft/i });
  }

  private get emailValidationError(): Locator {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("auth.validation.emailInvalid")
        : i18nRegex("auth.validation.emailInvalid"),
    );
  }

  // ── Step 2: Password Input ──

  private get passwordTitleHeading(): Locator {
    if (this.i18n) {
      const enter = this.i18n.t("auth.enterPasswordTitle");
      const create = this.i18n.t("auth.createPasswordTitle");
      return this.page.getByRole("heading", {
        name: new RegExp(`${enter}|${create}`, "i"),
      });
    }
    // Combine both keys for all locales
    const enterRegex = i18nRegex("auth.enterPasswordTitle");
    const createRegex = i18nRegex("auth.createPasswordTitle");
    const combined = new RegExp(
      `${enterRegex.source}|${createRegex.source}`,
      "i",
    );
    return this.page.getByRole("heading", { name: combined });
  }

  private get passwordInput(): Locator {
    return this.page.locator("input#password");
  }

  private get editButton(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.editLink")
        : i18nRegex("auth.editLink"),
    });
  }

  private get showPasswordButton(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.showPassword")
        : i18nRegex("auth.showPassword"),
    });
  }

  private get hidePasswordButton(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.hidePassword")
        : i18nRegex("auth.hidePassword"),
    });
  }

  private get forgotPasswordLink(): Locator {
    return this.page.getByRole("link", {
      name: this.i18n
        ? this.i18n.t("auth.forgotPassword")
        : i18nRegex("auth.forgotPassword"),
    });
  }

  private get backToLoginButton(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.backToLogin")
        : i18nRegex("auth.backToLogin"),
    });
  }

  private get credentialError(): Locator {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("auth.errors.invalidEmailOrPassword")
        : i18nRegex("auth.errors.invalidEmailOrPassword"),
    );
  }

  private get readonlyEmailInput(): Locator {
    return this.page.getByRole("textbox", {
      name: /email|邮箱|电子邮件|e-mail/i,
    });
  }

  // ── Public Getters ──

  getTitleHeading(): Locator {
    return this.titleHeading;
  }
  getEmailInput(): Locator {
    return this.emailInput;
  }
  getContinueButton(): Locator {
    return this.continueButton;
  }
  getGoogleOAuthButton(): Locator {
    return this.googleOAuthButton;
  }
  getMicrosoftOAuthButton(): Locator {
    return this.microsoftOAuthButton;
  }
  getEmailValidationError(): Locator {
    return this.emailValidationError;
  }
  getPasswordTitleHeading(): Locator {
    return this.passwordTitleHeading;
  }
  getPasswordInput(): Locator {
    return this.passwordInput;
  }
  getEditButton(): Locator {
    return this.editButton;
  }
  getShowPasswordButton(): Locator {
    return this.showPasswordButton;
  }
  getHidePasswordButton(): Locator {
    return this.hidePasswordButton;
  }
  getForgotPasswordLink(): Locator {
    return this.forgotPasswordLink;
  }
  getBackToLoginButton(): Locator {
    return this.backToLoginButton;
  }
  getCredentialError(): Locator {
    return this.credentialError;
  }
  getReadonlyEmailInput(): Locator {
    return this.readonlyEmailInput;
  }

  // ── Actions ──

  async fillEmail(email: string) {
    // If the page shows a readonly email (returning user), click Edit first
    const readonlyEmail = this.page.locator("input#email-display[readonly]");
    if (await readonlyEmail.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.editButton.click();
      await this.emailInput.waitFor({ state: "visible", timeout: 5000 });
    }
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async clickContinue() {
    await this.continueButton.click();
  }

  async clickEdit() {
    await this.editButton.click();
  }

  async clickShowPassword() {
    await this.showPasswordButton.click();
  }

  async clickHidePassword() {
    await this.hidePasswordButton.click();
  }

  async clickBackToLogin() {
    await this.backToLoginButton.click();
  }

  /** Navigate to password step by entering a valid email */
  async goToPasswordStep(email: string) {
    await this.fillEmail(email);
    await this.clickContinue();
    await this.passwordTitleHeading.waitFor({ state: "visible" });
  }
}
