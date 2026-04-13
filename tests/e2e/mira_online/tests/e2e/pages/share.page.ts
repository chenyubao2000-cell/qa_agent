import { type Page } from '@playwright/test';
import type { I18n } from '../fixtures';

export class SharePage {
  constructor(private readonly page: Page, private readonly i18n?: I18n) {}

  // ── Header ──
  private get miraLogoLink() {
    // Share page: Mira logo link in banner has no accessible name (icon-only link)
    return this.page.getByRole('banner').getByRole('link').first();
  }

  private get taskTitle() {
    return this.page.locator('header span.text-foreground');
  }

  // ── Valid share: content area ──
  private get conversationLog() {
    return this.page.locator('[role="log"]');
  }

  // ── Error: invalid link ──
  private get invalidLinkHeading() {
    const text = this.i18n ? this.i18n.t('share.invalidLink') : '链接无效';
    return this.page.getByRole('heading', { name: text });
  }

  private get invalidLinkDescription() {
    const text = this.i18n ? this.i18n.t('share.invalidLinkDescription') : '抱歉，此分享链接无效或已过期。';
    return this.page.getByText(text);
  }

  // ── Error: not found ──
  private get notFoundHeading() {
    const text = this.i18n ? this.i18n.t('share.notFound') : '会话不存在';
    return this.page.getByRole('heading', { name: text });
  }

  private get notFoundDescription() {
    const text = this.i18n ? this.i18n.t('share.notFoundDescription') : '抱歉，您访问的会话不存在或已被删除。';
    return this.page.getByText(text);
  }

  // ── Read-only mode indicators ──
  private get textareaInput() {
    return this.page.locator('textarea');
  }

  // ── Shared navigation ──
  private get backToHomeLink() {
    const text = this.i18n ? this.i18n.t('share.backToHome') : '返回首页';
    return this.page.getByRole('link', { name: text });
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
    await this.page.goto(path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  }

  async clickBackToHome() {
    await this.backToHomeLink.click();
  }
}
