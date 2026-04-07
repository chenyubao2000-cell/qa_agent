import { type Page, type Locator } from '@playwright/test';
import type { I18n } from '../fixtures';

export class SignInPage {
  constructor(private readonly page: Page, private readonly i18n?: I18n) {}

  // ── Navigation ──

  async goto() {
    await this.page.goto('/sign-in');
  }

  // ── Step 1: Email Input ──

  private get titleHeading(): Locator {
    return this.page.getByRole('heading', { name: /登录或注册|Sign in or Sign up/i });
  }

  private get emailInput(): Locator {
    return this.page.getByRole('textbox', { name: /email|邮件/i });
  }

  private get continueButton(): Locator {
    return this.page.getByRole('button', { name: /^(继续|Continue)$/i });
  }

  private get googleOAuthButton(): Locator {
    return this.page.getByRole('button', { name: /Google/i });
  }

  private get microsoftOAuthButton(): Locator {
    return this.page.getByRole('button', { name: /Microsoft/i });
  }

  private get emailValidationError(): Locator {
    return this.page.getByText(/请输入有效的邮箱地址|enter a valid email/i);
  }

  // ── Step 2: Password Input ──

  private get passwordTitleHeading(): Locator {
    return this.page.getByRole('heading', { name: /输入密码|创建密码|Enter password|Create password/i });
  }

  private get passwordInput(): Locator {
    return this.page.locator('input#password');
  }

  private get editButton(): Locator {
    return this.page.getByRole('button', { name: /编辑|Edit/i });
  }

  private get showPasswordButton(): Locator {
    return this.page.getByRole('button', { name: /显示密码|Show password/i });
  }

  private get hidePasswordButton(): Locator {
    return this.page.getByRole('button', { name: /隐藏密码|Hide password/i });
  }

  private get forgotPasswordLink(): Locator {
    return this.page.getByRole('link', { name: /忘记密码|Forgot password/i });
  }

  private get backToLoginButton(): Locator {
    return this.page.getByRole('button', { name: /返回登录|Back to Login/i });
  }

  private get credentialError(): Locator {
    return this.page.getByText(/邮箱或密码错误|Invalid email or password/i);
  }

  private get readonlyEmailInput(): Locator {
    return this.page.getByRole('textbox', { name: /email|邮箱|电子邮件/i });
  }

  // ── Public Getters ──

  getTitleHeading(): Locator { return this.titleHeading; }
  getEmailInput(): Locator { return this.emailInput; }
  getContinueButton(): Locator { return this.continueButton; }
  getGoogleOAuthButton(): Locator { return this.googleOAuthButton; }
  getMicrosoftOAuthButton(): Locator { return this.microsoftOAuthButton; }
  getEmailValidationError(): Locator { return this.emailValidationError; }
  getPasswordTitleHeading(): Locator { return this.passwordTitleHeading; }
  getPasswordInput(): Locator { return this.passwordInput; }
  getEditButton(): Locator { return this.editButton; }
  getShowPasswordButton(): Locator { return this.showPasswordButton; }
  getHidePasswordButton(): Locator { return this.hidePasswordButton; }
  getForgotPasswordLink(): Locator { return this.forgotPasswordLink; }
  getBackToLoginButton(): Locator { return this.backToLoginButton; }
  getCredentialError(): Locator { return this.credentialError; }
  getReadonlyEmailInput(): Locator { return this.readonlyEmailInput; }

  // ── Actions ──

  async fillEmail(email: string) {
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
    await this.passwordTitleHeading.waitFor({ state: 'visible' });
  }
}
