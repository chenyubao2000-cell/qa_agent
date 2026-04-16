import { type Page, type Locator } from "@playwright/test";
import type { I18n } from "../fixtures";
import { i18nRegex } from "../i18n-helpers";

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

    // Sidebar
    this.toggleSidebarBtn = page
      .getByRole("button", { name: "Toggle Sidebar" })
      .first();
    this.newTaskBtn = page.getByRole("button", {
      name: i18n ? i18n.t("chatbot.newChat") : i18nRegex("chatbot.newChat"),
    });
    this.tasksSectionBtn = page.getByRole("button", {
      name: i18n
        ? new RegExp(`^${i18n.t("chatbot.tasks")}$`)
        : i18nRegex("chatbot.tasks", { exact: true }),
    });
    this.userMenuBtn = page.locator(
      '[data-sidebar="footer"] [data-sidebar="menu-button"]',
    );

    // Main area
    this.welcomeHeading = page.getByRole("heading", {
      name: i18n ? i18n.t("dashboard.welcome") : i18nRegex("dashboard.welcome"),
    });
    this.chatInput = page.locator("textarea");
    this.submitBtn = page.getByRole("button", { name: "Submit" });
    // The visible attachment button in task-input.tsx uses aria-label={tChatbot("addAttachments")}.
    // Production en.json → "Add photos or files"
    // QA test env en.json → "Upload file" (singular)
    // zh.json → "上传文件" / "添加照片或文件"
    // The hidden <input type="file" aria-label="Upload files"> in prompt-input.tsx
    // is className="hidden" and is never visible — do NOT target it.
    this.fileUploadBtn = page.getByRole("button", {
      name: /Upload files?|Add photos or files|上传文件|添加照片或文件/i,
    });

    // Task detail
    this.chatLog = page.locator('div[role="log"]');
  }

  // ── Navigation ──

  async goto() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.page.goto("/task", { timeout: 30_000 });
        await this.page.waitForLoadState("domcontentloaded");
        await this.page.waitForTimeout(1000);
        return;
      } catch (e) {
        if (attempt < 2) await this.page.waitForTimeout(2000);
        else throw e;
      }
    }
  }

  async ensureSidebarExpanded() {
    await this.page.waitForLoadState("domcontentloaded");
    await this.page.waitForLoadState("networkidle").catch(() => {});
    // Detect sidebar collapsed state via data-state attribute (reliable, not dependent on task list loading)
    const sidebarWrapper = this.page.locator(".peer[data-state]").first();
    const state = await sidebarWrapper.getAttribute("data-state", { timeout: 5000 }).catch(() => null);
    if (state === "collapsed") {
      await this.page
        .locator('[data-sidebar="trigger"]')
        .click({ timeout: 5_000 });
      await sidebarWrapper.waitFor({ state: "visible" });
      await this.page.waitForFunction(
        () => document.querySelector(".peer[data-state]")?.getAttribute("data-state") === "expanded",
        undefined,
        { timeout: 10_000 },
      );
    }
  }

  // ── Sidebar actions ──

  async toggleSidebar() {
    // Read current state before toggling so we can wait for the opposite
    const currentState = await this.page
      .locator(".peer[data-state]")
      .first()
      .getAttribute("data-state")
      .catch(() => null);
    const targetState = currentState === "expanded" ? "collapsed" : "expanded";

    await this.page.evaluate(() => {
      (
        document.querySelector('[data-sidebar="trigger"]') as HTMLButtonElement
      )?.click();
    });

    // Wait for the data-state to flip (200ms CSS transition + React re-render)
    await this.page.waitForFunction(
      (expected) => document.querySelector(".peer[data-state]")?.getAttribute("data-state") === expected,
      targetState,
      { timeout: 5_000 },
    );
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
    const collapsible = this.page.locator(
      '[data-slot="collapsible"][data-state="open"]',
    );
    const taskItems = collapsible.locator(
      '[data-sidebar="menu-item"] [data-sidebar="menu-button"]',
    );
    await taskItems.first().click();
  }

  async openTaskContextMenu() {
    await this.ensureSidebarExpanded();
    const collapsible = this.page.locator(
      '[data-slot="collapsible"][data-state="open"]',
    );
    const firstItem = collapsible.locator('[data-sidebar="menu-item"]').first();
    await firstItem.hover();
    const moreBtn = firstItem.locator('[data-sidebar="menu-action"]');
    await moreBtn.click();
  }

  // ── User menu sub-actions ──

  async clickLanguageMenuItem() {
    const menuItem = this.page.getByRole("menuitem", {
      name: this.i18n
        ? this.i18n.t("Layout.language")
        : i18nRegex("Layout.language"),
    });
    await menuItem.click();
  }

  async clickThemeMenuItem() {
    const menuItem = this.page.getByRole("menuitem", {
      name: this.i18n ? this.i18n.t("Layout.theme") : i18nRegex("Layout.theme"),
    });
    await menuItem.click();
  }

  async clickSignOut() {
    const menuItem = this.page.getByRole("menuitem", {
      name: this.i18n
        ? this.i18n.t("Layout.signOut")
        : i18nRegex("Layout.signOut"),
    });
    await menuItem.click();
  }

  // ── Main area actions ──

  async fillChatInput(text: string) {
    await this.chatInput.fill(text);
  }

  async clickSubmit() {
    await this.submitBtn.click({ timeout: 10_000 });
  }

  async clickScenarioSuggestion(index = 0) {
    const suggestions = this.getScenarioSuggestions();
    await suggestions.nth(index).waitFor({ state: "visible", timeout: 15_000 });
    await suggestions.nth(index).click();
    const navigated = await this.page
      .waitForURL(/\/task\/.+/, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (!navigated) {
      const submitBtn = this.page.getByRole("button", { name: "Submit" });
      const isEnabled = await submitBtn
        .isEnabled({ timeout: 3000 })
        .catch(() => false);
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
    return this.page.locator('main [class*="grid-cols"] button');
  }

  getScenarioLabel(): Locator {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("dashboard.tryScenarios")
        : i18nRegex("dashboard.tryScenarios"),
    );
  }

  async getScenarioCardText(index = 0): Promise<string> {
    const card = this.getScenarioSuggestions().nth(index);
    await card.waitFor({ state: "visible", timeout: 15_000 });
    return (await card.textContent()) ?? "";
  }

  async clickScenarioCard(index = 0): Promise<void> {
    const card = this.getScenarioSuggestions().nth(index);
    await card.waitFor({ state: "visible", timeout: 15_000 });
    await card.click();
  }

  getTaskItems(): Locator {
    const collapsible = this.page.locator(
      '[data-slot="collapsible"][data-state="open"]',
    );
    return collapsible.locator(
      '[data-sidebar="menu-item"] [data-sidebar="menu-button"]',
    );
  }

  getContextMenu(): Locator {
    return this.page.locator("[role='menu']");
  }

  getContextMenuItemShare(): Locator {
    return this.page.getByRole("menuitem", {
      name: this.i18n
        ? this.i18n.t("chatbot.share")
        : i18nRegex("chatbot.share"),
    });
  }

  getContextMenuItemRename(): Locator {
    return this.page.getByRole("menuitem", {
      name: this.i18n
        ? this.i18n.t("chatbot.rename")
        : i18nRegex("chatbot.rename"),
    });
  }

  getContextMenuItemDelete(): Locator {
    return this.page.getByRole("menuitem", {
      name: this.i18n
        ? this.i18n.t("chatbot.delete")
        : i18nRegex("chatbot.delete"),
    });
  }

  // ── Share Dialog (S8) ──

  getShareDialog(): Locator {
    return this.page.locator('[role="dialog"]');
  }

  getCreateShareLinkBtn(): Locator {
    return this.page.locator('[role="dialog"]').getByRole("button", {
      name: this.i18n
        ? this.i18n.t("chatbot.createShareLink")
        : i18nRegex("chatbot.createShareLink"),
    });
  }

  getDialogCloseBtn(): Locator {
    return this.page.locator('[role="dialog"]').getByRole("button", {
      name: this.i18n ? this.i18n.t("canvas.close") : i18nRegex("canvas.close"),
    });
  }

  // ── Rename Dialog (S9) ──

  getRenameDialog(): Locator {
    return this.page.locator('[role="dialog"]');
  }

  getRenameInput(): Locator {
    return this.page.locator('[role="dialog"] input');
  }

  getRenameSaveBtn(): Locator {
    return this.page.locator('[role="dialog"]').getByRole("button", {
      name: this.i18n ? this.i18n.t("chatbot.save") : i18nRegex("chatbot.save"),
    });
  }

  getRenameCancelBtn(): Locator {
    return this.page.locator('[role="dialog"]').getByRole("button", {
      name: this.i18n
        ? this.i18n.t("chatbot.cancel")
        : i18nRegex("chatbot.cancel"),
    });
  }

  // ── Delete Dialog (S10) ──

  getDeleteDialog(): Locator {
    return this.page.locator("[role='alertdialog']");
  }

  getDeleteDialogWarning(): Locator {
    return this.page.locator("[role='alertdialog'] p");
  }

  getDeleteConfirmBtn(): Locator {
    return this.page.locator("[role='alertdialog']").getByRole("button", {
      name: this.i18n
        ? new RegExp(`^${this.i18n.t("chatbot.delete")}$`)
        : i18nRegex("chatbot.delete", { exact: true }),
    });
  }

  getDeleteCancelBtn(): Locator {
    return this.page.locator("[role='alertdialog']").getByRole("button", {
      name: this.i18n
        ? this.i18n.t("chatbot.cancel")
        : i18nRegex("chatbot.cancel"),
    });
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
    // Wait for the dialog to close after the API call completes
    await this.getRenameDialog().waitFor({ state: "hidden", timeout: 15_000 });
  }

  async cancelDelete(): Promise<void> {
    await this.getDeleteCancelBtn().click();
  }

  async confirmDelete(): Promise<void> {
    await this.getDeleteConfirmBtn().click();
    // Wait for the alertdialog to close after action
    await this.getDeleteDialog().waitFor({ state: "hidden", timeout: 15_000 });
  }

  async pressEscape(): Promise<void> {
    await this.page.keyboard.press("Escape");
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

  async openTaskContextMenuForItem(
    taskName: string,
    timeout = 10_000,
  ): Promise<void> {
    await this.ensureSidebarExpanded();
    const collapsible = this.page.locator(
      '[data-slot="collapsible"][data-state="open"]',
    );
    const taskItem = collapsible
      .locator('[data-sidebar="menu-item"]')
      .filter({
        has: this.page.getByText(taskName, { exact: true }),
      })
      .first();
    await taskItem.hover({ timeout });
    const moreBtn = taskItem.locator('[data-sidebar="menu-action"]');
    await moreBtn.click({ timeout: 5000 });
  }

  async getFirstTaskName(): Promise<string> {
    await this.ensureSidebarExpanded();
    const firstTask = this.getTaskItems().first();
    await firstTask.waitFor({ state: "visible", timeout: 10_000 });
    // Wait for AI-generated title to be populated (non-empty)
    await this.page.waitForFunction(
      () => {
        const btn = document.querySelector(
          '[data-slot="collapsible"][data-state="open"] [data-sidebar="menu-item"] [data-sidebar="menu-button"]',
        );
        return btn ? (btn.textContent ?? "").trim().length > 0 : false;
      },
      undefined,
      { timeout: 45_000 },
    );
    return (await firstTask.innerText()).trim();
  }

  /**
   * Wait for the currently-active sidebar task (the one highlighted after
   * creating/navigating to a task) to receive its AI-generated title, then
   * return that title.  Call this while already on a /task/:id page so that
   * [data-active="true"] reliably points to the right item.
   */
  async getActiveTaskName(): Promise<string> {
    await this.ensureSidebarExpanded();
    // Wait up to 45s for the active sidebar button to have non-empty text
    await this.page.waitForFunction(
      () => {
        const btn = document.querySelector(
          '[data-sidebar="menu-button"][data-active="true"]',
        );
        return btn ? (btn.textContent ?? "").trim().length > 0 : false;
      },
      undefined,
      { timeout: 45_000 },
    );
    const activeBtn = this.page.locator(
      '[data-sidebar="menu-button"][data-active="true"]',
    );
    return (await activeBtn.innerText()).trim();
  }

  getTaskItemByName(taskName: string): Locator {
    const collapsible = this.page.locator(
      '[data-slot="collapsible"][data-state="open"]',
    );
    return collapsible
      .locator('[data-sidebar="menu-item"]')
      .filter({
        has: this.page.getByText(taskName, { exact: true }),
      })
      .first();
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
    return this.page.getByRole("menuitem", {
      name: this.i18n
        ? this.i18n.t("Layout.language")
        : i18nRegex("Layout.language"),
    });
  }

  getUserMenuThemeItem(): Locator {
    return this.page.getByRole("menuitem", {
      name: this.i18n ? this.i18n.t("Layout.theme") : i18nRegex("Layout.theme"),
    });
  }

  getUserMenuSignOutItem(): Locator {
    return this.page.getByRole("menuitem", {
      name: this.i18n
        ? this.i18n.t("Layout.signOut")
        : i18nRegex("Layout.signOut"),
    });
  }

  getLanguageOption(name: string): Locator {
    return this.page.getByRole("menuitemcheckbox", { name });
  }

  getThemeOptionLight(): Locator {
    return this.page.getByRole("menuitemcheckbox", {
      name: this.i18n ? this.i18n.t("Layout.light") : i18nRegex("Layout.light"),
    });
  }

  getThemeOptionDark(): Locator {
    return this.page.getByRole("menuitemcheckbox", {
      name: this.i18n ? this.i18n.t("Layout.dark") : i18nRegex("Layout.dark"),
    });
  }

  getThemeOptionSystem(): Locator {
    return this.page.getByRole("menuitemcheckbox", {
      name: this.i18n
        ? this.i18n.t("Layout.system")
        : i18nRegex("Layout.system"),
    });
  }

  getAiLabel(): Locator {
    return this.page.locator("span").filter({ hasText: "Mira" }).first();
  }

  getDownloadFileButton(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("tools.complete.downloadFile")
        : i18nRegex("tools.complete.downloadFile"),
    });
  }

  getCopyButton(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n ? this.i18n.t("chatbot.copy") : i18nRegex("chatbot.copy"),
    });
  }

  getTaskCompletedLabel(): Locator {
    return this.page
      .getByText(
        this.i18n
          ? new RegExp(`^${this.i18n.t("chatbot.completed")}$`)
          : i18nRegex("chatbot.completed", { exact: true }),
      )
      .first();
  }

  // ── Conversation: File Upload (S0 → S1) ──

  private readonly hiddenFileInput: Locator;
  private readonly attachmentRemoveBtn: Locator;

  getHiddenFileInput(): Locator {
    return this.page.locator("input[type='file']");
  }

  getAttachmentRemoveBtn(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("chatbot.removeAttachment")
        : i18nRegex("chatbot.removeAttachment"),
    });
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
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("chatbot.thinking")
        : i18nRegex("chatbot.thinking"),
    );
  }

  getAiMiraLabel(): Locator {
    return this.page
      .locator("span")
      .filter({ hasText: /^Mira$/ })
      .first();
  }

  getToolCards(): Locator {
    return this.page.locator(
      "div[role='button'].rounded-xl.border.cursor-pointer",
    );
  }

  getFirstToolCard(): Locator {
    return this.getToolCards().first();
  }

  async clickFirstToolCard(): Promise<void> {
    const card = this.getFirstToolCard();
    await card.waitFor({ state: "visible", timeout: 30_000 });
    await this.page.waitForLoadState("networkidle");
    await card.click({ position: { x: 50, y: 20 } });
  }

  // ── Conversation: Workspace Panel (S5) ──

  getWorkspacePanel(): Locator {
    return this.page
      .locator("div.border-l, div.fixed.inset-0.z-50")
      .filter({
        has: this.page.getByRole("button", {
          name: this.i18n
            ? new RegExp(`^${this.i18n.t("canvas.close")}$`)
            : i18nRegex("canvas.close", { exact: true }),
        }),
      })
      .first();
  }

  getWorkspacePanelTitle(): Locator {
    return this.getWorkspacePanel().locator("p").first();
  }

  getWorkspacePanelCloseBtn(): Locator {
    return this.getWorkspacePanel().getByRole("button", {
      name: this.i18n
        ? new RegExp(`^${this.i18n.t("canvas.close")}$`)
        : i18nRegex("canvas.close", { exact: true }),
    });
  }

  async closeWorkspacePanel(): Promise<void> {
    await this.getWorkspacePanelCloseBtn().click();
  }

  async waitForWorkspacePanelOpen(): Promise<void> {
    await this.getWorkspacePanel().waitFor({
      state: "visible",
      timeout: 15_000,
    });
  }

  async waitForWorkspacePanelClosed(): Promise<void> {
    await this.getWorkspacePanel().waitFor({
      state: "hidden",
      timeout: 10_000,
    });
  }

  // ── Conversation: User message hover (reveals copy button at md+ breakpoints) ──

  async hoverUserMessage(): Promise<void> {
    const userMsg = this.page.locator('[role="log"] .is-user').first();
    await userMsg.waitFor({ state: "visible", timeout: 15_000 });
    await userMsg.hover();
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
    return this.page.locator('[role="log"] div[role="button"].rounded-xl');
  }

  getFileCardByName(filename: string): Locator {
    return this.getFileCards().filter({ hasText: filename }).first();
  }

  getFileCardDownloadBtn(filename: string): Locator {
    return this.getFileCardByName(filename).locator("svg").last();
  }

  async clickFileCard(filename: string): Promise<void> {
    await this.getFileCardByName(filename).click();
  }

  getPreviewPanelTitle(): Locator {
    return this.page
      .locator("main")
      .locator("~ div")
      .getByRole("heading")
      .first();
  }

  getPreviewPanelFilename(): Locator {
    return this.page
      .locator(
        '[class*="flex"][class*="items-center"] > span, [class*="flex"][class*="items-center"] > h2',
      )
      .last();
  }

  getPreviewPanelCloseBtn(): Locator {
    return this.page
      .locator("button")
      .filter({ has: this.page.locator("svg") })
      .last();
  }

  getPreviewPanelDownloadBtn(): Locator {
    return this.page.locator("main").locator("~ div").locator("button").first();
  }

  getPreviewSpreadsheet(): Locator {
    return this.page.locator('table, [class*="spreadsheet"], [role="grid"]');
  }

  getPreviewPdfViewer(): Locator {
    return this.page.locator('canvas, [class*="pdf"], [data-page-number]');
  }

  getPreviewImageViewer(): Locator {
    return this.page.getByText("100%");
  }

  getPreviewImageResetBtn(): Locator {
    return this.page.getByText(
      this.i18n ? this.i18n.t("canvas.reset") : i18nRegex("canvas.reset"),
    );
  }

  getPreviewUnsupportedMessage(): Locator {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("canvas.renderers.unsupported.message")
        : i18nRegex("canvas.renderers.unsupported.message"),
    );
  }

  getPreviewDownloadFallbackBtn(): Locator {
    return this.page.getByRole("button", {
      name: this.i18n
        ? this.i18n.t("canvas.renderers.unsupported.downloadButton")
        : i18nRegex("canvas.renderers.unsupported.downloadButton"),
    });
  }

  getTaskCompletedStatus(): Locator {
    return this.page.getByText(
      this.i18n
        ? this.i18n.t("chatbot.completed")
        : i18nRegex("chatbot.completed"),
    );
  }
}
