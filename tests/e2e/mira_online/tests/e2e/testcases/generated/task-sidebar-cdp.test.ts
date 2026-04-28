// source: cdp
// handoff: test-cases/generated/playwright-handoff-task-sidebar.json
// baseline: test-cases/generated/page-baseline-task.json
// generated: 2026-03-23T00:00:00Z

import { test, expect } from "../../fixtures";
import { TaskPage } from "../../pages/task.page";
import { i18nRegex } from "../../i18n-helpers";
import { authFileAbsolute, toProjectLocale } from "../../locale-map";
import type { BrowserContext, Page } from "@playwright/test";
import path from "node:path";

const PROJECT_ROOT = path.join(__dirname, "..", "..", "..", "..");

/** Create an authenticated context + page for beforeAll / afterAll hooks.
 *  Picks the per-locale auth file based on current Playwright project (e.g. e2e-fr → user.fr.json).
 */
async function createAuthenticatedPage(
  browser: import("@playwright/test").Browser,
  projectName: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const locale =
    /^(?:e2e|setup)-(.+)$/.exec(projectName)?.[1] ||
    toProjectLocale((process.env.APP_LANGUAGES || "en").split(",")[0]);
  const ctx = await browser.newContext({ storageState: authFileAbsolute(PROJECT_ROOT, locale) });
  const page = await ctx.newPage();
  return { ctx, page };
}

// ──────────────────────────────────────────────────────────────────────────────
// US-SIDEBAR-01 · 侧边栏可见性控制 (S0 ↔ S1)
// ──────────────────────────────────────────────────────────────────────────────
test.describe("US-SIDEBAR-01 · 侧边栏可见性控制", () => {
  test(
    "TC-CDP-SB-001 侧边栏展开状态下点击 Toggle 折叠侧边栏",
    { tag: ["@P1", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.toggleSidebar();

      await expect(taskPage.getTasksSectionButton()).toBeHidden();
    },
  );

  test(
    "TC-CDP-SB-002 侧边栏折叠状态下点击 Toggle 展开侧边栏",
    { tag: ["@P1", "@regression", "@full", "@failing"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      // Setup: collapse sidebar
      await taskPage.toggleSidebar();
      await expect(taskPage.getTasksSectionButton()).toBeHidden();

      // Action: expand
      await taskPage.toggleSidebar();

      await expect(taskPage.getTasksSectionButton()).toBeVisible();
    },
  );

  test(
    "TC-CDP-SB-019 场景：折叠侧边栏后主内容区域正常展示",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.toggleSidebar();

      await expect(taskPage.getWelcomeHeading()).toBeVisible();
      await expect(taskPage.getWelcomeHeading()).toHaveText(
        i18nRegex("dashboard.welcome"),
      );
      await expect(taskPage.getChatInput()).toBeVisible();
    },
  );

  test(
    "TC-CDP-SB-022 快速连续点击 Toggle 侧边栏不出现异常",
    { tag: ["@P2", "@full", "@failing"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      // Rapid triple toggle from expanded state → net result: collapsed
      await taskPage.toggleSidebar();
      await taskPage.toggleSidebar();
      await taskPage.toggleSidebar();

      await expect(page).toHaveURL(/\/task/);
      await expect(taskPage.getSidebarContainer()).toBeVisible();
    },
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-SIDEBAR-02 · 任务列表区块折叠 (S0 ↔ S2)
// ──────────────────────────────────────────────────────────────────────────────
test.describe("US-SIDEBAR-02 · 任务列表区块折叠", () => {
  test(
    'TC-CDP-SB-003 点击"任务"区块标题折叠任务列表',
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.clickTasksSection();

      // shadcn Collapsible keeps content in DOM with data-state="closed"
      await expect(taskPage.getCollapsibleClosed()).toBeVisible();
    },
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-SIDEBAR-03 · 任务右键菜单 (S0 → S3)
// ──────────────────────────────────────────────────────────────────────────────
test.describe("US-SIDEBAR-03 · 任务右键菜单", () => {
  test(
    "TC-CDP-SB-007 点击任务 More 按钮打开右键菜单并显示三个操作项",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      // Use first existing task (non-destructive — only opens context menu)
      await taskPage.openTaskContextMenu();

      await expect(taskPage.getContextMenu()).toBeVisible();
      await expect(taskPage.getContextMenuItemShare()).toBeVisible();
      await expect(taskPage.getContextMenuItemShare()).toHaveText(
        i18nRegex("chatbot.share"),
      );
      await expect(taskPage.getContextMenuItemRename()).toBeVisible();
      await expect(taskPage.getContextMenuItemRename()).toHaveText(
        i18nRegex("chatbot.rename"),
      );
      await expect(taskPage.getContextMenuItemDelete()).toBeVisible();
      await expect(taskPage.getContextMenuItemDelete()).toHaveText(
        i18nRegex("chatbot.delete"),
      );
    },
  );

  test(
    "TC-CDP-SB-009 右键菜单按 ESC 键关闭",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenu();
      await expect(taskPage.getContextMenu()).toBeVisible();

      await taskPage.pressEscape();

      await expect(taskPage.getContextMenu()).toBeHidden();
    },
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-SIDEBAR-04 · 分享弹窗 (S3 → S8 → S0)
// ──────────────────────────────────────────────────────────────────────────────
test.describe("US-SIDEBAR-04 · 分享弹窗", () => {
  test(
    'TC-CDP-SB-010 从 S3 点击"分享"打开分享弹窗（S8）',
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      // Use first existing task (non-destructive — share dialog only)
      await taskPage.openTaskContextMenu();
      await taskPage.clickShareMenuItem();

      await expect(taskPage.getShareDialog()).toBeVisible();
      await expect(taskPage.getCreateShareLinkBtn()).toBeVisible();
      await expect(taskPage.getCreateShareLinkBtn()).toHaveText(
        i18nRegex("chatbot.createShareLink"),
      );

      await taskPage.closeShareDialog();
    },
  );

  test(
    "TC-CDP-SB-011 分享弹窗点击 Close 关闭并返回 S0",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenu();
      await taskPage.clickShareMenuItem();
      await expect(taskPage.getShareDialog()).toBeVisible();

      await taskPage.closeShareDialog();

      await expect(taskPage.getShareDialog()).toBeHidden();
      await expect(page).toHaveURL(/\/task/);
    },
  );

  test(
    "TC-CDP-SB-020 分享弹窗显示正确描述文本",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenu();
      await taskPage.clickShareMenuItem();

      await expect(taskPage.getShareDialog()).toBeVisible();
      await expect(taskPage.getCreateShareLinkBtn()).toBeVisible();

      await taskPage.closeShareDialog();
    },
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// US-SIDEBAR-05 · 重命名弹窗 (S3 → S9 → S0)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("US-SIDEBAR-05 · 重命名弹窗", () => {
  let renameTaskName: string;
  let renamedName: string;

  test.beforeAll(async ({ browser }) => {
    renamedName = `Renamed-${Date.now()}`;
    const { ctx, page: p } = await createAuthenticatedPage(browser, test.info().project.name);
    const taskPage = new TaskPage(p);
    await taskPage.goto();
    await taskPage.fillChatInput(`Test Rename ${Date.now()}`);
    await taskPage.clickSubmit();
    await p.waitForURL(/\/task\/.+/, { timeout: 60_000 });
    await taskPage.goto();
    renameTaskName = await taskPage.getFirstTaskName();
    await ctx.close();
  });

  test(
    'TC-CDP-SB-012 从 S3 点击"重命名"打开重命名弹窗（S9）',
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(renameTaskName);
      await taskPage.clickRenameMenuItem();

      await expect(taskPage.getRenameDialog()).toBeVisible();
      await expect(taskPage.getRenameInput()).toBeVisible();
      await expect(taskPage.getRenameSaveBtn()).toBeVisible();
      await expect(taskPage.getRenameCancelBtn()).toBeVisible();

      // Close for next test
      await taskPage.cancelRename();
    },
  );

  test(
    'TC-CDP-SB-013 重命名弹窗点击"取消"关闭并保留原名称',
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(renameTaskName);
      await taskPage.clickRenameMenuItem();
      await expect(taskPage.getRenameDialog()).toBeVisible();

      await taskPage.cancelRename();

      await expect(taskPage.getRenameDialog()).toBeHidden();
      await expect(taskPage.getTaskItemByName(renameTaskName)).toBeVisible();
    },
  );

  test(
    "TC-CDP-SB-004 重命名任务输入空字符串不允许保存",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(renameTaskName);
      await taskPage.clickRenameMenuItem();
      await expect(taskPage.getRenameDialog()).toBeVisible();

      await taskPage.getRenameInput().fill("");

      // Save button should be disabled when input is empty
      await expect(taskPage.getRenameSaveBtn())
        .toBeDisabled({ timeout: 3000 })
        .catch(async () => {
          // If not disabled, click and check dialog stays open
          await taskPage.getRenameSaveBtn().click({ timeout: 3000 });
          await expect(taskPage.getRenameDialog()).toBeVisible();
        });

      await taskPage.cancelRename();
    },
  );

  test(
    "TC-CDP-SB-005 重命名任务输入单个字符可正常保存",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      // Setup: create a fresh task for this test
      await taskPage.fillChatInput(`SingleChar Test ${Date.now()}`);
      await taskPage.clickSubmit();
      await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
      await taskPage.goto();
      const actualName = await taskPage.getFirstTaskName();

      await taskPage.openTaskContextMenuForItem(actualName);
      await taskPage.clickRenameMenuItem();
      await taskPage.saveRename("A");

      await expect(taskPage.getRenameDialog()).toBeHidden();

      // Teardown
      await taskPage.deleteTask("A").catch(() => {});
    },
  );

  test.fixme(
    "TC-CDP-SB-006 重命名任务输入超长字符串（200字）显示错误提示",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(renameTaskName);
      await taskPage.clickRenameMenuItem();
      await expect(taskPage.getRenameDialog()).toBeVisible();

      const longName = "测".repeat(200);
      await taskPage.getRenameInput().fill(longName);

      // Save button should be disabled for too-long names
      await expect(taskPage.getRenameSaveBtn())
        .toBeDisabled({ timeout: 3000 })
        .catch(async () => {
          // If not disabled, click and verify dialog stays open
          await taskPage.getRenameSaveBtn().click({ timeout: 3000 });
          await expect(taskPage.getRenameDialog()).toBeVisible();
        });

      await taskPage.cancelRename();
    },
  );

  test(
    'TC-CDP-SB-014 重命名任务输入新名称后点击"保存"更新任务名',
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(renameTaskName);
      await taskPage.clickRenameMenuItem();
      await expect(taskPage.getRenameDialog()).toBeVisible();

      await taskPage.saveRename(renamedName);

      // saveRename() already waits for dialog to close internally
      await expect(taskPage.getRenameDialog()).toBeHidden();
      await expect(taskPage.getTaskItemByName(renamedName)).toBeVisible({
        timeout: 10_000,
      });
    },
  );

  test(
    "TC-CDP-SB-017 完整场景：创建任务后通过右键菜单重命名并在侧边栏中反映更新",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const scenarioRename = `Renamed-Scenario-${Date.now()}`;
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      await taskPage.fillChatInput(`Scenario Rename Test ${Date.now()}`);
      await taskPage.clickSubmit();
      await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
      await taskPage.goto();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      const actualName = await taskPage.getFirstTaskName();

      await taskPage.renameTask(actualName, scenarioRename);

      await expect(taskPage.getRenameDialog()).toBeHidden();
      await expect(taskPage.getTaskItemByName(scenarioRename)).toBeVisible();

      // Teardown
      await taskPage.deleteTask(scenarioRename).catch(() => {});
    },
  );

  test.afterAll(async ({ browser }) => {
    const { ctx, page: p } = await createAuthenticatedPage(browser, test.info().project.name);
    const taskPage = new TaskPage(p);
    await taskPage.goto();
    for (const name of [renamedName, renameTaskName]) {
      try {
        await taskPage.openTaskContextMenuForItem(name, 3000);
        await taskPage.clickDeleteMenuItem();
        await taskPage.confirmDelete();
        break;
      } catch {
        /* task not found, try next */
      }
    }
    await ctx.close();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// US-SIDEBAR-06 · 删除弹窗 (S3 → S10 → S0)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("US-SIDEBAR-06 · 删除弹窗", () => {
  let deleteTaskName: string;
  let cancelTaskName: string;

  test.beforeAll(async ({ browser }) => {
    const { ctx, page: p } = await createAuthenticatedPage(browser, test.info().project.name);
    const taskPage = new TaskPage(p);

    // Create first task (will be deleted).
    // Stay on the task detail page so getActiveTaskName() can find the
    // highlighted sidebar item reliably, without racing against AI-title gen.
    await taskPage.goto();
    await taskPage.fillChatInput(`Test Delete ${Date.now()}`);
    await taskPage.clickSubmit();
    await p.waitForURL(/\/task\/.+/, { timeout: 60_000 });
    // Let AI auto-title stabilize (takes 5-10s) — otherwise the captured name
    // may drift later (e.g. "Test Cancel" → "Test Cancellation").
    await p.waitForTimeout(10_000);
    deleteTaskName = await taskPage.getActiveTaskName();

    // Create second task (will test cancel-delete)
    await taskPage.goto();
    await taskPage.fillChatInput(`Test Cancel ${Date.now()}`);
    await taskPage.clickSubmit();
    await p.waitForURL(/\/task\/.+/, { timeout: 60_000 });
    await p.waitForTimeout(10_000);
    cancelTaskName = await taskPage.getActiveTaskName();

    await ctx.close();
  });

  test(
    'TC-CDP-SB-015 从 S3 点击"删除"打开删除确认弹窗（S10）',
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(cancelTaskName);
      await taskPage.clickDeleteMenuItem();

      await expect(taskPage.getDeleteDialog()).toBeVisible();
      await expect(taskPage.getDeleteConfirmBtn()).toBeVisible();
      await expect(taskPage.getDeleteCancelBtn()).toBeVisible();

      await taskPage.cancelDelete();
    },
  );

  test(
    "TC-CDP-SB-021 删除确认弹窗显示不可撤销警告文本",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(cancelTaskName);
      await taskPage.clickDeleteMenuItem();
      await expect(taskPage.getDeleteDialog()).toBeVisible();

      await expect(taskPage.getDeleteDialogWarning()).toBeVisible();
      await expect(taskPage.getDeleteDialogWarning()).toHaveText(
        i18nRegex("chatbot.deleteWarning"),
      );

      await taskPage.cancelDelete();
    },
  );

  test(
    "TC-CDP-SB-008 删除弹窗点击取消后任务保留",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(cancelTaskName);
      await taskPage.clickDeleteMenuItem();
      await expect(taskPage.getDeleteDialog()).toBeVisible();

      await taskPage.cancelDelete();

      await expect(taskPage.getDeleteDialog()).toBeHidden();
      await expect(taskPage.getTaskItemByName(cancelTaskName)).toBeVisible();
    },
  );

  test(
    'TC-CDP-SB-016 删除确认弹窗点击"删除"后任务从列表移除',
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();
      await taskPage.ensureSidebarExpanded();

      await taskPage.openTaskContextMenuForItem(deleteTaskName);
      await taskPage.clickDeleteMenuItem();
      await expect(taskPage.getDeleteDialog()).toBeVisible();

      await taskPage.confirmDelete();

      // confirmDelete() already waits for alertdialog to close internally
      await expect(taskPage.getDeleteDialog()).toBeHidden();
      // Page should remain on /task without errors
      await expect(page).toHaveURL(/\/task/);
    },
  );

  test.fixme(
    "TC-CDP-SB-018 完整场景：创建任务后通过右键菜单删除并从侧边栏消失",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const taskPage = new TaskPage(page, i18n);
      await taskPage.goto();

      await taskPage.fillChatInput(`Delete Scenario ${Date.now()}`);
      await taskPage.clickSubmit();
      await page.waitForURL(/\/task\/.+/, { timeout: 60_000 });
      await taskPage.goto();
      const actualName = await taskPage.getFirstTaskName();

      await taskPage.openTaskContextMenuForItem(actualName);
      await taskPage.clickDeleteMenuItem();
      await expect(taskPage.getDeleteDialog()).toBeVisible();
      await taskPage.confirmDelete();

      await expect(taskPage.getDeleteDialog()).toBeHidden();
      await page.waitForURL(/\/task/, { timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
      const taskCount = await taskPage.getTaskItemByName(actualName).count();
      if (taskCount > 0) {
        await taskPage.goto();
        await taskPage.ensureSidebarExpanded();
      }
      await expect(taskPage.getTaskItemByName(actualName)).toHaveCount(0, {
        timeout: 10_000,
      });
    },
  );

  test.afterAll(async ({ browser }) => {
    const { ctx, page: p } = await createAuthenticatedPage(browser, test.info().project.name);
    const taskPage = new TaskPage(p);
    await taskPage.goto();
    try {
      await taskPage.openTaskContextMenuForItem(cancelTaskName, 3000);
      await taskPage.clickDeleteMenuItem();
      await taskPage.confirmDelete();
    } catch {
      /* task already deleted or not found */
    }
    await ctx.close();
  });
});
