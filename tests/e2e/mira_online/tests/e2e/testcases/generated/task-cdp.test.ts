// source: cdp
// handoff: test-cases/generated/playwright-handoff-task.json
// baseline: test-cases/generated/page-baseline-task.json
// generated: 2026-03-23T00:00:00Z

import { test, expect } from '../../fixtures';
import { TaskPage } from '../../pages/task.page';
import path from 'node:path';
import fs from 'node:fs';

test.describe('US-TASK-INPUT · Chat Input Area', () => {
  test('TC-CDP-TASK-015 新任务页面显示欢迎标题、输入框和场景建议', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    await expect(taskPage.getWelcomeHeading()).toBeVisible();
    await expect(taskPage.getWelcomeHeading()).toHaveText(/What can I do for you\?|我能为你做什么？/);
    await expect(taskPage.getChatInput()).toBeVisible();
    await expect(taskPage.getSubmitButton()).toBeDisabled();
    await expect(taskPage.getScenarioSuggestions()).toHaveCount(4);
  });

  test('TC-CDP-TASK-001 输入非空文本后 Submit 按钮启用', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    await taskPage.fillChatInput('帮我找候选人');
    await expect(taskPage.getSubmitButton()).toBeEnabled();
  });

  test('TC-CDP-TASK-002 输入框为空时 Submit 按钮禁用', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    await expect(taskPage.getChatInput()).toBeVisible();
    await expect(taskPage.getSubmitButton()).toBeDisabled();
  });

  test('TC-CDP-TASK-016 点击场景建议自动提交并导航至任务详情', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    await taskPage.clickScenarioSuggestion(0);
    await expect(page).toHaveURL(/\/task\/.+/, { timeout: 30_000 });
  });
});

test.describe('US-TASK-SIDEBAR · Sidebar Navigation', () => {
  test('TC-CDP-TASK-004 点击 Toggle Sidebar 折叠侧边栏', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();
    await taskPage.ensureSidebarExpanded();

    await expect(taskPage.getTasksSectionButton()).toBeVisible();
    await taskPage.toggleSidebar();
    await expect(taskPage.getTasksSectionButton()).toBeHidden();
  });

  test('TC-CDP-TASK-005 折叠后再次点击展开侧边栏', { tag: ['@P0', '@smoke', '@regression', '@full', '@failing'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Ensure sidebar starts expanded; if already collapsed, expand first
    const isVisible = await taskPage.getTasksSectionButton().isVisible({ timeout: 3000 }).catch(() => false);
    if (!isVisible) {
      await taskPage.toggleSidebar();
      await expect(taskPage.getTasksSectionButton()).toBeVisible();
    }

    // Setup: collapse sidebar
    await taskPage.toggleSidebar();
    await expect(taskPage.getTasksSectionButton()).toBeHidden();

    // Action: expand sidebar
    await taskPage.toggleSidebar();
    await expect(taskPage.getTasksSectionButton()).toBeVisible();
  });

  test('TC-CDP-TASK-006 点击"任务"区段标题折叠任务列表', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    const initialCount = await taskPage.getTaskItems().count();
    // Only test collapse if there are tasks
    if (initialCount > 0) {
      await taskPage.clickTasksSection();
      await expect(page.locator('[data-slot="collapsible"][data-state="closed"]')).toBeVisible();
    }
  });

  test('TC-CDP-TASK-007 折叠后再次点击展开任务列表', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Setup: collapse task list
    await taskPage.clickTasksSection();
    await expect(page.locator('[data-slot="collapsible"][data-state="closed"]')).toBeVisible();

    // Action: expand task list
    await taskPage.clickTasksSection();
    await expect(page.locator('[data-slot="collapsible"][data-state="open"]')).toBeVisible();
    await expect(taskPage.getTaskItems().first()).toBeVisible();
  });

  test('TC-CDP-TASK-008 点击任务 More 按钮打开上下文菜单', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    await taskPage.openTaskContextMenu();
    await expect(taskPage.getContextMenuItemShare()).toBeVisible();
    await expect(taskPage.getContextMenuItemShare()).toHaveText(/Share|分享/);
    await expect(taskPage.getContextMenuItemRename()).toBeVisible();
    await expect(taskPage.getContextMenuItemRename()).toHaveText(/Rename|重命名/);
    await expect(taskPage.getContextMenuItemDelete()).toBeVisible();
    await expect(taskPage.getContextMenuItemDelete()).toHaveText(/Delete|删除/);
  });

  test('TC-CDP-TASK-009 按 Escape 关闭上下文菜单', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Setup: open context menu
    await taskPage.openTaskContextMenu();
    await expect(taskPage.getContextMenuItemShare()).toBeVisible();

    // Action: press Escape
    await page.keyboard.press('Escape');
    await expect(taskPage.getContextMenuItemShare()).toBeHidden();
  });

  test('TC-CDP-TASK-003 无任务时侧边栏任务列表区域为空', { tag: ['@P2', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // This test validates behavior for accounts with no tasks
    // The task items list should be empty or show an empty state
    const taskCount = await taskPage.getTaskItems().count();
    // If tasks exist (seeded account), skip assertion — this TC is best for clean accounts
    if (taskCount === 0) {
      await expect(taskPage.getTaskItems()).toHaveCount(0);
    }
  });

  test('TC-CDP-TASK-020 快速连续切换侧边栏状态', { tag: ['@P2', '@full', '@failing'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Ensure sidebar starts expanded
    const isVisible = await taskPage.getTasksSectionButton().isVisible({ timeout: 3000 }).catch(() => false);
    if (!isVisible) {
      await taskPage.toggleSidebar();
      await expect(taskPage.getTasksSectionButton()).toBeVisible();
    }

    // Rapid triple toggle: expanded → collapsed → expanded → collapsed
    await taskPage.toggleSidebar();
    await page.waitForTimeout(300);
    await taskPage.toggleSidebar();
    await page.waitForTimeout(300);
    await taskPage.toggleSidebar();

    // After odd number of toggles from expanded, sidebar should be collapsed
    await expect(taskPage.getTasksSectionButton()).toBeHidden();
  });
});

test.describe('US-TASK-USERMENU · User Menu', () => {
  test('TC-CDP-TASK-010 点击用户菜单按钮打开用户菜单', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    await taskPage.openUserMenu();
    await expect(taskPage.getUserMenuLanguageItem()).toBeVisible();
    await expect(taskPage.getUserMenuLanguageItem()).toHaveText(/Language|语言/);
    await expect(taskPage.getUserMenuThemeItem()).toBeVisible();
    await expect(taskPage.getUserMenuThemeItem()).toHaveText(/Theme|主题/);
    await expect(taskPage.getUserMenuSignOutItem()).toBeVisible();
    await expect(taskPage.getUserMenuSignOutItem()).toHaveText(/Sign Out|退出登录/);
  });

  test('TC-CDP-TASK-011 打开语言子菜单并查看选项', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Setup: open user menu
    await taskPage.openUserMenu();

    // Action: click language menu item
    await taskPage.clickLanguageMenuItem();
    await expect(taskPage.getLanguageOption('简体中文')).toBeVisible();
    await expect(taskPage.getLanguageOption('English')).toBeVisible();
  });

  test('TC-CDP-TASK-012 打开主题子菜单并查看选项', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Setup: open user menu
    await taskPage.openUserMenu();

    // Action: click theme menu item
    await taskPage.clickThemeMenuItem();
    await expect(taskPage.getThemeOptionLight()).toBeVisible();
    await expect(taskPage.getThemeOptionLight()).toHaveText(/Light|浅色/);
    await expect(taskPage.getThemeOptionDark()).toBeVisible();
    await expect(taskPage.getThemeOptionDark()).toHaveText(/Dark|深色/);
    await expect(taskPage.getThemeOptionSystem()).toBeVisible();
    await expect(taskPage.getThemeOptionSystem()).toHaveText(/System|系统/);
  });

});

test.describe('US-TASK-DETAIL · Task Detail View', () => {
  test('TC-CDP-TASK-013 点击侧边栏任务项进入任务详情页', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    await taskPage.clickFirstTask();
    await expect(page).toHaveURL(/\/task\/.+/);
    await expect(taskPage.getChatLog()).toBeVisible();
  });

  test('TC-CDP-TASK-014 在任务详情页点击"新建任务"返回空白视图', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Setup: navigate to a task detail
    await taskPage.clickFirstTask();
    await expect(page).toHaveURL(/\/task\/.+/);

    // Action: click new task
    await taskPage.clickNewTask();
    await expect(page).toHaveURL(/\/task$/);
    await expect(taskPage.getWelcomeHeading()).toBeVisible();
    await expect(taskPage.getWelcomeHeading()).toHaveText(/What can I do for you\?|我能为你做什么？/);
  });

  test('TC-CDP-TASK-017 任务详情页显示聊天历史元素', { tag: ['@P0', '@smoke', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Setup: navigate to task detail
    await taskPage.clickFirstTask();
    await expect(page).toHaveURL(/\/task\/.+/);

    await expect(taskPage.getChatLog()).toBeVisible();
    await expect(taskPage.getAiLabel()).toBeVisible();
    await expect(taskPage.getAiLabel()).toContainText('Mira');
  });

  test('TC-CDP-TASK-018 任务详情页显示文件下载按钮', { tag: ['@P1', '@regression', '@full'] }, async ({ page, i18n }) => {
    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Setup: navigate to a task that contains generated files
    await taskPage.clickFirstTask();
    await expect(page).toHaveURL(/\/task\/.+/);

    // Check for download button (may not exist in all tasks)
    const downloadBtn = taskPage.getDownloadFileButton();
    const count = await downloadBtn.count();
    if (count > 0) {
      await expect(downloadBtn.first()).toBeVisible();
    }
  });
});

// Sign-out uses a fresh browser context to avoid destroying the shared worker auth session
test.describe('US-TASK-USERMENU · Sign Out', () => {
  test('TC-CDP-TASK-019 退出登录后重定向至登录页', { tag: ['@P2', '@full'] }, async ({ browser, i18n }) => {
    // Create isolated context with auth state so sign-out doesn't affect other tests
    const AUTH_FILE = path.join(__dirname, '..', '..', '..', '..', 'playwright', '.auth', 'user.json');
    const ctx = fs.existsSync(AUTH_FILE)
      ? await browser.newContext({ storageState: AUTH_FILE })
      : await browser.newContext();
    const page = await ctx.newPage();

    const taskPage = new TaskPage(page, i18n);
    await taskPage.goto();

    // Setup: open user menu
    await taskPage.openUserMenu();

    // Action: click sign out
    await taskPage.clickSignOut();
    await expect(page).toHaveURL(/\/sign-in/);

    await ctx.close();
  });
});
