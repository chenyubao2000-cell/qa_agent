// source: cdp
// handoff: test-cases/generated/playwright-handoff-projects.json
// baseline: test-cases/generated/page-baseline-projects.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ProjectsPage } from "../../pages/projects.page";

test.describe("[CDP] Projects — placeholder load", { tag: ["@regression", "@full"] }, () => {
  test(
    'TC-CDP-PROJECTS-001 Projects 占位页加载并渲染标题与 "Coming soon" 文案',
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const projectsPage = new ProjectsPage(page, i18n);
      await projectsPage.goto();

      await expect(projectsPage.heading).toBeVisible();
      await expect(projectsPage.heading).toHaveText("Projects");
      // Hardcoded (non-i18n) placeholder copy — matched case-insensitively by the POM.
      await expect(projectsPage.comingSoonText).toBeVisible();
    },
  );
});

test.describe("[CDP] Projects — routing & auth", { tag: ["@regression", "@full"] }, () => {
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

test.describe("[CDP] Projects — app shell", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PROJECTS-003 占位页渲染于共享 app-shell 内（左侧导航栏可见）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const projectsPage = new ProjectsPage(page, i18n);
      await projectsPage.goto();

      await expect(projectsPage.heading).toBeVisible();
      // Shared app-shell side nav — not owned by ProjectsPage, proves the placeholder
      // renders inside the authenticated shell rather than a bare/standalone route.
      await expect(projectsPage.contactsNavButton).toBeVisible();
      await expect(projectsPage.calendarNavButton).toBeVisible();
      await expect(projectsPage.filesNavButton).toBeVisible();
    },
  );
});
