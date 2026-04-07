import { type Page, type Locator } from '@playwright/test';
import type { I18n } from '../fixtures';

const SHARE_URL =
  'https://mira-bff-preview.up.railway.app/share/C2J66q10Qw3Fw1uS?token=Gi5-TZFZeyKP96B3352xtxTAHW8qK9GigLCMPT8IbGA';

export class TalentListPage {
  private readonly page: Page;
  private readonly i18n?: I18n;

  // ── Share page: result cards ──
  private readonly onePersonCard: Locator;
  private readonly sixPersonCard: Locator;

  // ── Side panel controls ──
  private readonly maximizeBtn: Locator;
  private readonly restoreBtn: Locator;
  private readonly closePanelBtn: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // Result cards on the share page (chat log area)
    this.onePersonCard = page.getByRole('button', { name: /case01_技术人才.*1 人/ });
    this.sixPersonCard = page.getByRole('button', { name: /case01_技术人才.*6 人/ });

    // Side / fullscreen panel control buttons
    this.maximizeBtn = page.getByRole('button', { name: '最大化' });
    this.restoreBtn = page.getByRole('button', { name: '还原' });
    this.closePanelBtn = page.getByRole('button', { name: '关闭' });
  }

  // ── Navigation ──

  /** Navigate directly to the share page (public, no auth required). */
  async gotoSharePage(): Promise<void> {
    await this.page.goto(SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  // ── Result card interactions ──

  async clickOnePersonCard(): Promise<void> {
    await this.onePersonCard.waitFor({ state: 'visible', timeout: 15_000 });
    await this.onePersonCard.click();
  }

  async clickSixPersonCard(): Promise<void> {
    await this.sixPersonCard.waitFor({ state: 'visible', timeout: 15_000 });
    await this.sixPersonCard.click();
  }

  // ── Side panel / fullscreen panel interactions ──

  async clickMaximize(): Promise<void> {
    await this.maximizeBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await this.maximizeBtn.click();
  }

  async clickRestore(): Promise<void> {
    await this.restoreBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await this.restoreBtn.click();
  }

  async closePanel(): Promise<void> {
    await this.closePanelBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await this.closePanelBtn.click();
  }

  // ── Talent card getters ──

  /**
   * Returns all talent cards in the currently-open panel.
   * In the side panel and maximized fullscreen view, talent cards are
   * div elements with role=article (or generic divs) inside the panel container.
   */
  getTalentCards(): Locator {
    // Talent cards render as direct children of the grid container.
    // They contain the person name + company/title info.
    // We scope to the panel area (right-side panel or fullscreen overlay).
    return this.page.locator(
      // The grid container has the container-query grid classes
      '.grid.gap-3 > div, [class*="grid"][class*="gap-3"] > div',
    );
  }

  /**
   * Returns the grid container element (used for JS assertions on gridTemplateColumns).
   */
  getTalentGrid(): Locator {
    return this.page.locator('[class*="grid-cols"]').first();
  }

  // ── Getters for assertions ──

  getOnePersonCard(): Locator {
    return this.onePersonCard;
  }

  getSixPersonCard(): Locator {
    return this.sixPersonCard;
  }

  getMaximizeButton(): Locator {
    return this.maximizeBtn;
  }

  getRestoreButton(): Locator {
    return this.restoreBtn;
  }

  getClosePanelButton(): Locator {
    return this.closePanelBtn;
  }

  // ── JS evaluation helpers (for CSS grid bug detection) ──

  /**
   * Returns the computed gridTemplateColumns value from the talent grid container.
   * Used to verify how many CSS columns are actually rendered.
   */
  async getGridTemplateColumns(): Promise<string> {
    const grid = this.getTalentGrid();
    await grid.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {});
    return this.page.evaluate(() => {
      const gridEl = document.querySelector('[class*="grid-cols-"]');
      if (!gridEl) return 'NOT_FOUND';
      return window.getComputedStyle(gridEl).gridTemplateColumns;
    });
  }

  /**
   * Returns the number of child elements (talent cards) inside the grid container.
   */
  async getGridChildCount(): Promise<number> {
    return this.page.evaluate(() => {
      const gridEl = document.querySelector('[class*="grid-cols-"]');
      if (!gridEl) return 0;
      return gridEl.childElementCount;
    });
  }

  /**
   * Counts the number of separate column widths in a gridTemplateColumns string.
   * e.g. "463px 463px 463px 463px" → 4 columns
   */
  parseColumnCount(gridTemplateColumns: string): number {
    if (!gridTemplateColumns || gridTemplateColumns === 'NOT_FOUND') return 0;
    return gridTemplateColumns.trim().split(/\s+/).length;
  }

  /**
   * Waits for the side panel to become visible after clicking a result card.
   */
  async waitForPanelOpen(): Promise<void> {
    await this.maximizeBtn.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /**
   * Waits for the fullscreen panel state (restore button visible).
   */
  async waitForFullscreenPanel(): Promise<void> {
    await this.restoreBtn.waitFor({ state: 'visible', timeout: 10_000 });
  }
}
