import { type Page } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

export class SharePage {
  constructor(
    private readonly page: Page,
    private readonly i18n?: I18n,
  ) {}

  // ── Header ──
  private get miraLogoLink() {
    // Share page: Mira logo link in banner has no accessible name (icon-only link)
    return this.page.getByRole("banner").getByRole("link").first();
  }

  private get taskTitle() {
    return this.page.locator("header span.text-foreground");
  }

  // ── Valid share: content area ──
  private get conversationLog() {
    return this.page.locator('[role="log"]');
  }

  // ── Error: invalid link ──
  private get invalidLinkHeading() {
    return this.page.getByRole("heading", {
      name: this.i18n
        ? this.i18n.t("share.invalidLink")
        : i18nRegex("share.invalidLink"),
    });
  }

  private get invalidLinkDescription() {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("share.invalidLinkDescription")
        : i18nRegex("share.invalidLinkDescription"),
    );
  }

  // ── Error: not found ──
  private get notFoundHeading() {
    return this.page.getByRole("heading", {
      name: this.i18n
        ? this.i18n.t("share.notFound")
        : i18nRegex("share.notFound"),
    });
  }

  private get notFoundDescription() {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("share.notFoundDescription")
        : i18nRegex("share.notFoundDescription"),
    );
  }

  // ── Read-only mode indicators ──
  private get textareaInput() {
    return this.page.locator("textarea");
  }

  // ── Shared navigation ──
  private get backToHomeLink() {
    return this.page.getByRole("link", {
      name: this.i18n
        ? this.i18n.t("share.backToHome")
        : i18nRegex("share.backToHome"),
    });
  }

  // ── Public getters ──

  get getMiraLogoLink() {
    return this.miraLogoLink;
  }

  get getTaskTitle() {
    return this.taskTitle;
  }

  get getConversationLog() {
    return this.conversationLog;
  }

  get getInvalidLinkHeading() {
    return this.invalidLinkHeading;
  }

  get getInvalidLinkDescription() {
    return this.invalidLinkDescription;
  }

  get getNotFoundHeading() {
    return this.notFoundHeading;
  }

  get getNotFoundDescription() {
    return this.notFoundDescription;
  }

  get getBackToHomeLink() {
    return this.backToHomeLink;
  }

  get getTextareaInput() {
    return this.textareaInput;
  }

  // ── Public methods ──

  async goto(path: string) {
    // Share error pages may never fire 'load' (SSR with hanging resources),
    // use 'domcontentloaded' to avoid timeout; allow 45s for slow server lookups
    await this.page.goto(path, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
  }

  async clickBackToHome() {
    await this.backToHomeLink.click();
  }
}
