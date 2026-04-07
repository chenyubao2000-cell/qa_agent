import { type Page } from '@playwright/test';
import type { I18n } from '../fixtures';

export class ForgotPasswordPage {
  constructor(private readonly page: Page, private readonly i18n?: I18n) {}

  // ── Navigation ──

  async goto() {
    await this.page.goto('/forgot-password');
  }

  // ── Locators (private) ──

  private get emailInput() {
    return this.page.getByRole('textbox', {
      name: /Email|邮箱/i,
    });
  }

  private get sendResetLinkButton() {
    return this.page.getByRole('button', {
      name: /Send Reset Link|发送重置链接/i,
    });
  }

  private get backToLoginLink() {
    return this.page.getByRole('link', {
      name: /Back to Sign In|返回登录/i,
    });
  }

  private get backToLoginButton() {
    return this.page.getByRole('button', {
      name: /Return to Sign In|返回登录/i,
    });
  }

  private get continueButton() {
    return this.page.getByRole('button', {
      name: /Continue|继续/i,
    });
  }

  private get pageTitle() {
    return this.page.getByRole('heading', {
      name: /Forgot Password|忘记密码/i,
    });
  }

  private get pageDescription() {
    return this.page.locator('p').filter({
      hasText: /Enter your email|输入您的邮箱/i,
    });
  }

  private get confirmationText() {
    return this.page.locator('p').filter({
      hasText: /Continue.*send a password reset link|继续.*发送重置密码链接/i,
    });
  }

  private get validationError() {
    return this.page.getByText(
      /Please enter a valid email|请输入有效的邮箱/i,
    );
  }

  // ── Public getters ──

  getEmailInput() { return this.emailInput; }
  getSendResetLinkButton() { return this.sendResetLinkButton; }
  getBackToLoginLink() { return this.backToLoginLink; }
  getBackToLoginButton() { return this.backToLoginButton; }
  getContinueButton() { return this.continueButton; }
  getPageTitle() { return this.pageTitle; }
  getPageDescription() { return this.pageDescription; }
  getConfirmationText() { return this.confirmationText; }
  getValidationError() { return this.validationError; }

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
