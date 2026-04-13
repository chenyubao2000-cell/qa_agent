import { type Page, type Locator } from '@playwright/test';
import type { I18n } from '../fixtures';

export class AiElementsPage {
  private readonly page: Page;
  private readonly i18n?: I18n;

  // ── Conversation log ──
  private readonly conversationLog: Locator;
  private readonly userMessages: Locator;
  private readonly assistantMessages: Locator;

  // ── Code block (rendered inside workspace panel as pre.shiki, NOT in conversation) ──
  private readonly codeBlockPre: Locator;
  private readonly codeBlockCode: Locator;

  // ── Tool card (simplified Tool component) ──
  private readonly toolCards: Locator;
  private readonly firstToolCardTitle: Locator;
  private readonly firstToolCardDescription: Locator;

  // ── Workspace panel ──
  private readonly workspaceHeading: Locator;
  private readonly codeViewer: Locator;
  private readonly timelineSlider: Locator;

  // ── Completed indicator ──
  private readonly completedIndicator: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // Conversation log
    this.conversationLog = page.getByRole('log');
    this.userMessages = page.locator('.is-user.group');
    this.assistantMessages = page.locator('.is-assistant.group');

    // Code block — rendered inside workspace panel (Shiki syntax highlighting)
    // The pre element uses shiki CSS variables but does NOT have a .shiki class
    // Actual class: "m-0 p-4 text-sm dark:!bg-[var(--shiki-dark-bg)] ..."
    this.codeBlockPre = page.locator('.overflow-auto > pre').first();
    this.codeBlockCode = this.codeBlockPre.locator('code');

    // Tool card — compact card from tool.tsx
    this.toolCards = page.locator('.not-prose.rounded-md.border.cursor-pointer');
    this.firstToolCardTitle = this.toolCards.first().locator('.shrink-0.font-medium');
    this.firstToolCardDescription = this.toolCards.first().locator('.text-muted-foreground');

    // Workspace panel
    const wsTitle = i18n ? i18n.t('workspace.title') : 'Mira 的工作区';
    this.workspaceHeading = page.getByRole('heading', { name: wsTitle });
    this.codeViewer = page.locator('.overflow-auto > pre');
    this.timelineSlider = page.getByRole('slider');

    // Completed indicator
    const completedText = i18n ? i18n.t('chatbot.completed') : '任务已完成';
    this.completedIndicator = page.getByText(completedText);
  }

  // ── Navigation ──

  async gotoTaskWithAI(taskUrl: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto(taskUrl, { timeout: 30_000 });
        await this.page.waitForLoadState('domcontentloaded');
        // Wait for conversation log to appear
        await this.conversationLog.waitFor({ state: 'visible', timeout: 15_000 });
        return;
      } catch {
        if (attempt < 2) await this.page.waitForTimeout(2000);
        else throw new Error('Failed to navigate to task with AI content after 3 attempts');
      }
    }
  }

  // ── Conversation log getters ──

  getConversationLog(): Locator {
    return this.conversationLog;
  }

  getUserMessages(): Locator {
    return this.userMessages;
  }

  getAssistantMessages(): Locator {
    return this.assistantMessages;
  }

  getMiraLabel(): Locator {
    return this.page.locator('[role="log"] .real-msg span').filter({ hasText: /^Mira$/ }).first();
  }

  // ── Code block getters (workspace panel) ──

  getCodeBlockPre(): Locator {
    return this.codeBlockPre;
  }

  getCodeBlockCode(): Locator {
    return this.codeBlockCode;
  }

  // ── Tool card getters ──

  getToolCards(): Locator {
    return this.toolCards;
  }

  getFirstToolCardTitle(): Locator {
    return this.firstToolCardTitle;
  }

  getFirstToolCardDescription(): Locator {
    return this.firstToolCardDescription;
  }

  async clickFirstToolCard(): Promise<void> {
    await this.toolCards.first().waitFor({ state: 'visible', timeout: 15_000 });
    await this.toolCards.first().click();
  }

  // ── Workspace panel getters ──

  getWorkspaceHeading(): Locator {
    return this.workspaceHeading;
  }

  getCodeViewer(): Locator {
    return this.codeViewer;
  }

  getTimelineSlider(): Locator {
    return this.timelineSlider;
  }

  async waitForWorkspaceOpen(): Promise<void> {
    await this.workspaceHeading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async waitForWorkspaceClosed(): Promise<void> {
    await this.workspaceHeading.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  async closeWorkspacePanel(): Promise<void> {
    // Close button is a sibling of the workspace heading's parent container
    // Structure: div.flex.shrink-0.items-center > div (heading container) + button (close, has svg)
    const closeBtn = this.workspaceHeading
      .locator('xpath=../..') // go up to the flex container holding heading + close button
      .locator('button')
      .filter({ has: this.page.locator('svg') })
      .first();
    const isVisible = await closeBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (isVisible) {
      await closeBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
  }

  // ── Completed indicator ──

  getCompletedIndicator(): Locator {
    return this.completedIndicator;
  }
}
