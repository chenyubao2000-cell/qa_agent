import { type Page } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

export class JoinWaitlistPage {
  constructor(
    private readonly page: Page,
    private readonly i18n?: I18n,
  ) {}

  // ── Navigation ──

  async goto() {
    await this.page.goto("/join-waitlist");
  }

  // ── Heading & Description ──

  getHeading() {
    return this.page.getByRole("heading", {
      name: this.i18n
        ? this.i18n.t("auth.joinWaitlist.title")
        : i18nRegex("auth.joinWaitlist.title"),
    });
  }

  getDescription() {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("auth.joinWaitlist.description")
        : i18nRegex("auth.joinWaitlist.description"),
    );
  }

  // ── Form Fields ──

  getEmailInput() {
    return this.page.getByPlaceholder(/name@company\.com|nom@entreprise\.com/i);
  }

  getNameInput() {
    return this.page.getByRole("textbox", {
      name: this.i18n
        ? this.i18n.t("auth.joinWaitlist.name")
        : i18nRegex("auth.joinWaitlist.name", { exact: true }),
      exact: true,
    });
  }

  getCompanyInput() {
    return this.page.getByRole("textbox", {
      name: this.i18n
        ? this.i18n.t("auth.joinWaitlist.company")
        : i18nRegex("auth.joinWaitlist.company", { exact: true }),
      exact: true,
    });
  }

  getRoleInput() {
    return this.page.getByRole("textbox", {
      name: this.i18n
        ? this.i18n.t("auth.joinWaitlist.role")
        : i18nRegex("auth.joinWaitlist.role"),
      exact: true,
    });
  }

  getUseCaseInput() {
    return this.page.getByRole("textbox", {
      name: this.i18n
        ? this.i18n.t("auth.joinWaitlist.useCase")
        : i18nRegex("auth.joinWaitlist.useCase"),
      exact: true,
    });
  }

  // ── Buttons ──

  getSendCodeButton() {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.joinWaitlist.sendOtp")
        : i18nRegex("auth.joinWaitlist.sendOtp"),
    });
  }

  getSubmitButton() {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("auth.joinWaitlist.submit")
        : i18nRegex("auth.joinWaitlist.submit"),
    });
  }

  getCancelButton() {
    return this.page.getByRole("button", {
      name: this.i18n
        ? new RegExp(`^${this.i18n.t("chatbot.cancel")}$`)
        : i18nRegex("chatbot.cancel", { exact: true }),
    });
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

  async fillForm(data: {
    email?: string;
    name?: string;
    company?: string;
    role?: string;
    useCase?: string;
  }) {
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
