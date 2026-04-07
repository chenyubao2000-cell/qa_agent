import { type Page } from '@playwright/test';

type I18n = { t: (key: string) => string; locale: string };

export class JoinWaitlistPage {
  constructor(
    private readonly page: Page,
    private readonly i18n?: I18n,
  ) {}

  // ── Navigation ──

  async goto() {
    await this.page.goto('/join-waitlist');
  }

  // ── Heading & Description ──

  getHeading() {
    return this.page.getByRole('heading', { name: /Join Waitlist|加入等待名单/i });
  }

  getDescription() {
    return this.page.getByText(/send an invitation code once your application|审核通过后.*发送邀请码/i);
  }

  // ── Form Fields ──

  getEmailInput() {
    return this.page.getByPlaceholder(/name@company\.com/i);
  }

  getNameInput() {
    return this.page.getByRole('textbox', { name: /^Name$|^姓名$/i });
  }

  getCompanyInput() {
    return this.page.getByRole('textbox', { name: /^Company$|^公司$/i });
  }

  getRoleInput() {
    return this.page.getByRole('textbox', { name: /Role.*Position|岗位.*角色/i });
  }

  getUseCaseInput() {
    return this.page.getByRole('textbox', { name: /how do you plan|如何使用/i });
  }

  // ── Buttons ──

  getSendCodeButton() {
    return this.page.getByRole('button', { name: /send verify code|发送验证码/i });
  }

  getSubmitButton() {
    return this.page.getByRole('button', { name: /submit application|提交申请/i });
  }

  getCancelButton() {
    return this.page.getByRole('button', { name: /^Cancel$|^取消$/i });
  }

  // ── Toast ──

  getToast() {
    return this.page.locator('[role="status"], [role="alert"]').first();
  }

  getToastByText(text: string) {
    return this.page.getByText(text).first();
  }

  // ── Composite Actions ──

  async fillEmail(email: string) {
    await this.getEmailInput().fill(email);
  }

  async fillForm(data: { email?: string; name?: string; company?: string; role?: string; useCase?: string }) {
    if (data.email) await this.getEmailInput().fill(data.email);
    if (data.name) await this.getNameInput().fill(data.name);
    if (data.company) await this.getCompanyInput().fill(data.company);
    if (data.role) await this.getRoleInput().fill(data.role);
    if (data.useCase) await this.getUseCaseInput().fill(data.useCase);
  }

  async clickSubmit() {
    await this.getSubmitButton().click();
  }

  async clickCancel() {
    await this.getCancelButton().click();
  }

  async clickSendCode() {
    await this.getSendCodeButton().click();
  }
}
