import { type Page, type Locator } from '@playwright/test';
import type { I18n } from '../fixtures';

export class TaskPage {
  private readonly page: Page;
  private readonly i18n?: I18n;

  // ── Sidebar locators ──
  private readonly toggleSidebarBtn: Locator;
  private readonly newTaskBtn: Locator;
  private readonly tasksSectionBtn: Locator;
  private readonly userMenuBtn: Locator;

  // ── Main area locators ──
  private readonly welcomeHeading: Locator;
  private readonly chatInput: Locator;
  private readonly submitBtn: Locator;
  private readonly fileUploadBtn: Locator;

  // ── Task detail locators ──
  private readonly chatLog: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // Sidebar (all bilingual regex — NEXT_LOCALE cookie may not control app language)
    this.toggleSidebarBtn = page.getByRole('button', { name: 'Toggle Sidebar' }).first();
    this.newTaskBtn = page.getByRole('button', { name: /新建任务|New Task/ });
    this.tasksSectionBtn = page.getByRole('button', { name: /^任务$|^Tasks$/ });
    this.userMenuBtn = page.locator('[data-sidebar="footer"] [data-sidebar="menu-button"]');

    // Main area
    this.welcomeHeading = page.getByRole('heading', { name: /我能为你做什么|What can I do for you/ });
    this.chatInput = page.locator('textarea');
    this.submitBtn = page.getByRole('button', { name: 'Submit' });
    this.fileUploadBtn = page.getByRole('button', { name: /添加照片或文件|Add photos or files/ });

    // Task detail
    this.chatLog = page.locator('div[role="log"]');
  }

  // ── Navigation ──

  async goto() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto('/task', { timeout: 30_000 });
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1000);
        return;
      } catch (e) {
        if (attempt < 2) await this.page.waitForTimeout(2000);
        else throw e;
      }
    }
  }

  async ensureSidebarExpanded() {
    await this.page.waitForLoadState('networkidle').catch(() => {});
    const tasksVisible = await this.tasksSectionBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!tasksVisible) {
      await this.page.evaluate(() => {
        (document.querySelector('[data-sidebar="trigger"]') as HTMLButtonElement)?.click();
      });
      await this.tasksSectionBtn.waitFor({ state: 'visible', timeout: 10_000 });
    }
  }

  // ── Sidebar actions ──

  async toggleSidebar() {
    await this.page.evaluate(() => {
      (document.querySelector('[data-sidebar="trigger"]') as HTMLButtonElement)?.click();
    });
    await this.page.waitForTimeout(400);
  }

  async clickNewTask() {
    await this.newTaskBtn.click();
  }

  async clickTasksSection() {
    await this.tasksSectionBtn.click();
  }

  async openUserMenu() {
    await this.userMenuBtn.click();
  }

  async clickFirstTask() {
    await this.ensureSidebarExpanded();
    const collapsible = this.page.locator('[data-slot="collapsible"][data-state="open"]');
    const taskItems = collapsible.locator('[data-sidebar="menu-item"] [data-sidebar="menu-button"]');
    await taskItems.first().click();
  }

  async openTaskContextMenu() {
    await this.ensureSidebarExpanded();
    const collapsible = this.page.locator('[data-slot="collapsible"][data-state="open"]');
    const firstItem = collapsible.locator('[data-sidebar="menu-item"]').first();
    await firstItem.hover();
    const moreBtn = firstItem.locator('[data-sidebar="menu-action"]');
    await moreBtn.click();
  }

  // ── User menu sub-actions ──

  async clickLanguageMenuItem() {
    const menuItem = this.page.getByRole('menuitem', { name: /语言|Language/ });
    await menuItem.click();
  }

  async clickThemeMenuItem() {
    const menuItem = this.page.getByRole('menuitem', { name: /主题|Theme/ });
    await menuItem.click();
  }

  async clickSignOut() {
    const menuItem = this.page.getByRole('menuitem', { name: /退出登录|Sign Out/ });
    await menuItem.click();
  }

  // ── Main area actions ──

  async fillChatInput(text: string) {
    await this.chatInput.fill(text);
  }

  async clickSubmit() {
    // Playwright click() auto-waits for the button to be enabled
    await this.submitBtn.click({ timeout: 10_000 });
  }

  async clickScenarioSuggestion(index = 0) {
    const suggestions = this.getScenarioSuggestions();
    await suggestions.nth(index).waitFor({ state: 'visible', timeout: 15_000 });
    await suggestions.nth(index).click();
    // Some scenario buttons only fill the input without auto-submitting; click Submit if needed
    const navigated = await this.page.waitForURL(/\/task\/.+/, { timeout: 3000 }).then(() => true).catch(() => false);
    if (!navigated) {
      const submitBtn = this.page.getByRole('button', { name: 'Submit' });
      const isEnabled = await submitBtn.isEnabled({ timeout: 3000 }).catch(() => false);
      if (isEnabled) await submitBtn.click();
    }
  }

  // ── Getters (for assertions) ──

  getWelcomeHeading(): Locator {
    return this.welcomeHeading;
  }

  getChatInput(): Locator {
    return this.chatInput;
  }

  getSubmitButton(): Locator {
    return this.submitBtn;
  }

  getFileUploadButton(): Locator {
    return this.fileUploadBtn;
  }

  getToggleSidebarButton(): Locator {
    return this.toggleSidebarBtn;
  }

  getNewTaskButton(): Locator {
    return this.newTaskBtn;
  }

  getTasksSectionButton(): Locator {
    return this.tasksSectionBtn;
  }

  getUserMenuButton(): Locator {
    return this.userMenuBtn;
  }

  getChatLog(): Locator {
    return this.chatLog;
  }

  getScenarioSuggestions(): Locator {
    // CDP-confirmed: desktop grid uses Tailwind `sm:grid sm:grid-cols-2` (not bare `.grid`)
    return this.page.locator('main [class*="grid-cols"] button');
  }

  getScenarioLabel(): Locator {
    return this.page.getByText(
      this.i18n ? this.i18n.t('task.tryScenarios') : /试试以下场景|Try these scenarios/
    );
  }

  async getScenarioCardText(index = 0): Promise<string> {
    const card = this.getScenarioSuggestions().nth(index);
    await card.waitFor({ state: 'visible', timeout: 15_000 });
    return (await card.textContent()) ?? '';
  }

  /** Click scenario card at index. Does NOT wait for navigation — caller controls post-click assertions. */
  async clickScenarioCard(index = 0): Promise<void> {
    const card = this.getScenarioSuggestions().nth(index);
    await card.waitFor({ state: 'visible', timeout: 15_000 });
    await card.click();
  }

  getTaskItems(): Locator {
    const collapsible = this.page.locator('[data-slot="collapsible"][data-state="open"]');
    return collapsible.locator('[data-sidebar="menu-item"] [data-sidebar="menu-button"]');
  }

  getContextMenu(): Locator {
    return this.page.locator("[role='menu']");
  }

  getContextMenuItemShare(): Locator {
    return this.page.getByRole('menuitem', { name: /分享|Share/ });
  }

  getContextMenuItemRename(): Locator {
    return this.page.getByRole('menuitem', { name: /重命名|Rename/ });
  }

  getContextMenuItemDelete(): Locator {
    return this.page.getByRole('menuitem', { name: /删除|Delete/ });
  }

  // ── Share Dialog (S8) ──

  getShareDialog(): Locator {
    return this.page.locator('[role="dialog"]');
  }

  getCreateShareLinkBtn(): Locator {
    return this.page.locator('[role="dialog"]').getByRole('button', { name: /创建分享链接|Create Share Link/ });
  }

  getDialogCloseBtn(): Locator {
    return this.page.locator('[role="dialog"]').getByRole('button', { name: /Close|关闭/ });
  }

  // ── Rename Dialog (S9) ──

  getRenameDialog(): Locator {
    return this.page.locator('[role="dialog"]');
  }

  getRenameInput(): Locator {
    return this.page.locator('[role="dialog"] input');
  }

  getRenameSaveBtn(): Locator {
    return this.page.locator('[role="dialog"]').getByRole('button', { name: /Save|保存/ });
  }

  getRenameCancelBtn(): Locator {
    return this.page.locator('[role="dialog"]').getByRole('button', { name: /Cancel|取消/ });
  }

  // ── Delete Dialog (S10) ──

  getDeleteDialog(): Locator {
    return this.page.locator("[role='alertdialog']");
  }

  getDeleteDialogWarning(): Locator {
    return this.page.locator("[role='alertdialog'] p");
  }

  getDeleteConfirmBtn(): Locator {
    return this.page.locator("[role='alertdialog']").getByRole('button', { name: /^Delete$|^删除$/ });
  }

  getDeleteCancelBtn(): Locator {
    return this.page.locator("[role='alertdialog']").getByRole('button', { name: /Cancel|取消/ });
  }

  // ── Composite sidebar actions ──

  async clickShareMenuItem(): Promise<void> {
    await this.getContextMenuItemShare().click();
  }

  async clickRenameMenuItem(): Promise<void> {
    await this.getContextMenuItemRename().click();
  }

  async clickDeleteMenuItem(): Promise<void> {
    await this.getContextMenuItemDelete().click();
  }

  async closeShareDialog(): Promise<void> {
    await this.getDialogCloseBtn().click();
  }

  async cancelRename(): Promise<void> {
    await this.getRenameCancelBtn().click();
  }

  async saveRename(newName: string): Promise<void> {
    await this.getRenameInput().fill(newName);
    await this.getRenameSaveBtn().click();
  }

  async cancelDelete(): Promise<void> {
    await this.getDeleteCancelBtn().click();
  }

  async confirmDelete(): Promise<void> {
    await this.getDeleteConfirmBtn().click();
  }

  async pressEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  async createTask(taskName: string): Promise<void> {
    await this.clickNewTask();
    await this.fillChatInput(taskName);
    await this.clickSubmit();
    await this.page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
    await this.goto();
  }

  async deleteTask(taskName: string): Promise<void> {
    await this.openTaskContextMenuForItem(taskName);
    await this.clickDeleteMenuItem();
    await this.confirmDelete();
  }

  async renameTask(oldName: string, newName: string): Promise<void> {
    await this.openTaskContextMenuForItem(oldName);
    await this.clickRenameMenuItem();
    await this.saveRename(newName);
  }

  async openTaskContextMenuForItem(taskName: string, timeout = 10_000): Promise<void> {
    await this.ensureSidebarExpanded();
    const collapsible = this.page.locator('[data-slot="collapsible"][data-state="open"]');
    const taskItem = collapsible.locator('[data-sidebar="menu-item"]').filter({
      has: this.page.getByText(taskName, { exact: true }),
    }).first();
    await taskItem.hover({ timeout });
    const moreBtn = taskItem.locator('[data-sidebar="menu-action"]');
    await moreBtn.click({ timeout: 5000 });
  }

  async getFirstTaskName(): Promise<string> {
    await this.ensureSidebarExpanded();
    const firstTask = this.getTaskItems().first();
    await firstTask.waitFor({ state: 'visible', timeout: 10_000 });
    return (await firstTask.innerText()).trim();
  }

  getTaskItemByName(taskName: string): Locator {
    const collapsible = this.page.locator('[data-slot="collapsible"][data-state="open"]');
    return collapsible.locator('[data-sidebar="menu-item"]').filter({
      has: this.page.getByText(taskName, { exact: true }),
    }).first();
  }

  getTaskListContent(): Locator {
    return this.page.locator("[data-sidebar='group-content']");
  }

  getSidebarContainer(): Locator {
    return this.page.locator("[data-sidebar='sidebar']");
  }

  getCollapsibleClosed(): Locator {
    return this.page.locator('[data-slot="collapsible"][data-state="closed"]');
  }

  getUserMenuLanguageItem(): Locator {
    return this.page.getByRole('menuitem', { name: /语言|Language/ });
  }

  getUserMenuThemeItem(): Locator {
    return this.page.getByRole('menuitem', { name: /主题|Theme/ });
  }

  getUserMenuSignOutItem(): Locator {
    return this.page.getByRole('menuitem', { name: /退出登录|Sign Out/ });
  }

  getLanguageOption(name: string): Locator {
    return this.page.getByRole('menuitemcheckbox', { name });
  }

  getThemeOptionLight(): Locator {
    return this.page.getByRole('menuitemcheckbox', { name: /浅色|Light/ });
  }

  getThemeOptionDark(): Locator {
    return this.page.getByRole('menuitemcheckbox', { name: /深色|Dark/ });
  }

  getThemeOptionSystem(): Locator {
    return this.page.getByRole('menuitemcheckbox', { name: /系统|System/ });
  }

  getAiLabel(): Locator {
    return this.page.locator('span').filter({ hasText: 'Mira' }).first();
  }

  getDownloadFileButton(): Locator {
    return this.page.getByRole('button', { name: /下载文件|Download file/ });
  }

  getCopyButton(): Locator {
    return this.page.getByRole('button', { name: /复制|Copy/ });
  }

  getTaskCompletedLabel(): Locator {
    return this.page.getByText(/任务已完成|Task completed/);
  }

  // ── Conversation: File Upload (S0 → S1) ──

  private readonly hiddenFileInput: Locator;
  private readonly attachmentRemoveBtn: Locator;

  // NOTE: hiddenFileInput and attachmentRemoveBtn are initialized in a secondary
  // init block appended here; callers use getHiddenFileInput() / getAttachmentRemoveBtn().

  getHiddenFileInput(): Locator {
    return this.page.locator("input[type='file']");
  }

  getAttachmentRemoveBtn(): Locator {
    return this.page.getByRole('button', { name: 'Remove attachment' });
  }

  getAttachmentFilenameText(partialName: string): Locator {
    return this.page.locator(`text=${partialName}`);
  }

  async attachFile(filePath: string): Promise<void> {
    await this.getHiddenFileInput().setInputFiles(filePath);
  }

  async attachFiles(filePaths: string[]): Promise<void> {
    await this.getHiddenFileInput().setInputFiles(filePaths);
  }

  async removeAttachment(): Promise<void> {
    await this.getAttachmentRemoveBtn().click();
  }

  // ── Conversation: Chat Response (S2 / S3) ──

  getThinkingIndicator(): Locator {
    return this.page.getByText(/思考中\.\.\.|Thinking\.\.\./);
  }

  getAiMiraLabel(): Locator {
    return this.page.locator('span').filter({ hasText: /^Mira$/ }).first();
  }

  getToolCards(): Locator {
    return this.page.locator("div[role='button'].rounded-xl.border.cursor-pointer");
  }

  getFirstToolCard(): Locator {
    return this.getToolCards().first();
  }

  async clickFirstToolCard(): Promise<void> {
    await this.getFirstToolCard().waitFor({ state: 'visible', timeout: 30_000 });
    await this.getFirstToolCard().click();
  }

  // ── Conversation: Workspace Panel (S5) ──

  getWorkspacePanel(): Locator {
    // The workspace/preview panel is a right-side panel with border-l inside the flex layout
    return this.page.locator('main div.flex > div.border-l').first();
  }

  getWorkspacePanelTitle(): Locator {
    // The panel header shows the filename in a <p> tag (no heading element)
    return this.getWorkspacePanel().locator('p.truncate').first();
  }

  getWorkspacePanelCloseBtn(): Locator {
    // Close button is the last button in the panel header
    return this.getWorkspacePanel().locator('div.flex.items-center.justify-between > div.flex.items-center button').last();
  }

  async closeWorkspacePanel(): Promise<void> {
    await this.getWorkspacePanelCloseBtn().click();
  }

  async waitForWorkspacePanelOpen(): Promise<void> {
    await this.getWorkspacePanel().waitFor({ state: 'visible', timeout: 15_000 });
  }

  async waitForWorkspacePanelClosed(): Promise<void> {
    await this.getWorkspacePanel().waitFor({ state: 'hidden', timeout: 10_000 });
  }

  // ── Conversation: Combined actions ──

  async sendMessage(text: string): Promise<void> {
    await this.chatInput.fill(text);
    await this.submitBtn.click({ timeout: 10_000 });
    await this.page.waitForURL(/\/task\/.+/, { timeout: 30_000 });
  }

  async sendMessageWithFile(filePath: string, text?: string): Promise<void> {
    await this.attachFile(filePath);
    if (text) {
      await this.chatInput.fill(text);
    }
    await this.submitBtn.click({ timeout: 10_000 });
    await this.page.waitForURL(/\/task\/.+/, { timeout: 30_000 });
  }

  // ── File Preview Panel (click file card → right panel) ──

  getFileCards(): Locator {
    // File grid cards are div[role="button"] with rounded-xl inside the chat log
    return this.page.locator('[role="log"] div[role="button"].rounded-xl');
  }

  getFileCardByName(filename: string): Locator {
    return this.getFileCards().filter({ hasText: filename }).first();
  }

  getFileCardDownloadBtn(filename: string): Locator {
    // Download button is a clickable div/svg area inside the file card
    return this.getFileCardByName(filename).locator('svg').last();
  }

  async clickFileCard(filename: string): Promise<void> {
    await this.getFileCardByName(filename).click();
  }

  // Preview panel (right side, opens when clicking a file card)
  getPreviewPanelTitle(): Locator {
    // The panel header shows the filename — it's outside the log, after main content
    // Structure: icon + filename text + download btn + close btn
    return this.page.locator('main').locator('~ div').getByRole('heading').first();
  }

  getPreviewPanelFilename(): Locator {
    // The filename appears as static text next to the file icon in the panel header
    return this.page.locator('[class*="flex"][class*="items-center"] > span, [class*="flex"][class*="items-center"] > h2').last();
  }

  getPreviewPanelCloseBtn(): Locator {
    // Close button (X) in the preview panel header — rightmost button
    return this.page.locator('button').filter({ has: this.page.locator('svg') }).last();
  }

  getPreviewPanelDownloadBtn(): Locator {
    // Download button (↓) in the preview panel header
    return this.page.locator('main').locator('~ div').locator('button').first();
  }

  // Preview content type detectors
  getPreviewSpreadsheet(): Locator {
    // Excel/CSV renders as a table grid with row numbers
    return this.page.locator('table, [class*="spreadsheet"], [role="grid"]');
  }

  getPreviewPdfViewer(): Locator {
    // PDF renders with page navigation (< 1/1 >)
    return this.page.locator('canvas, [class*="pdf"], [data-page-number]');
  }

  getPreviewImageViewer(): Locator {
    // Image preview has zoom controls (100%, reset)
    return this.page.getByText('100%');
  }

  getPreviewImageResetBtn(): Locator {
    return this.page.getByText(/重置|Reset/);
  }

  getPreviewUnsupportedMessage(): Locator {
    // PPTX shows "暂不支持在线预览"
    return this.page.getByText(/暂不支持在线预览|not supported/);
  }

  getPreviewDownloadFallbackBtn(): Locator {
    // "下载文件" button shown for unsupported preview types
    return this.page.getByRole('button', { name: /下载文件|Download/ });
  }

  getTaskCompletedStatus(): Locator {
    return this.page.getByText(/任务已完成|Task completed/);
  }
}
