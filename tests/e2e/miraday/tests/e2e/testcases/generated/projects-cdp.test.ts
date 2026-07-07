// source: cdp
// handoff: test-cases/generated/playwright-handoff-projects.json
// baseline: test-cases/generated/page-baseline-projects.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ProjectsPage } from "../../pages/projects.page";

test.describe("[CDP] Projects — placeholder page", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PROJECTS-001 Projects 占位页加载并渲染标题与 \"Coming soon\" 文案",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const projectsPage = new ProjectsPage(page, i18n);
      await projectsPage.goto();

      await expect(projectsPage.heading).toBeVisible();
      await expect(projectsPage.heading).toHaveText("Projects");
      // Hardcoded (non-i18n) placeholder copy.
      await expect(projectsPage.comingSoonText).toBeVisible();
    },
  );

  test(
    "TC-CDP-PROJECTS-002 已认证直达 /projects 停留在目标路由且未被重定向到登录页",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const projectsPage = new ProjectsPage(page, i18n);
      await projectsPage.goto();

      await expect(page).toHaveURL(/\/projects$/);
      await expect(projectsPage.heading).toBeVisible();
    },
  );
});

test.describe("[CDP] Projects — shared app-shell", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PROJECTS-003 占位页渲染于共享 app-shell 内（左侧导航栏可见）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const projectsPage = new ProjectsPage(page, i18n);
      await projectsPage.goto();

      await expect(projectsPage.heading).toBeVisible();
      // Shared side-nav chrome (not owned by ProjectsPage) — confirms rendering inside the shell.
      await expect(projectsPage.newChannelNavButton).toBeVisible();
      await expect(projectsPage.filesNavButton).toBeVisible();
      await expect(projectsPage.recentNavSection).toBeVisible();
    },
  );
});
