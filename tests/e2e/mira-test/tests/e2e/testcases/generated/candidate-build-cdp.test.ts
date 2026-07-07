// source: cdp
// handoff: test-cases/generated/playwright-handoff-candidate-build.json
// baseline: test-cases/generated/page-baseline-candidate-build.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { CandidateBuildPage } from "../../pages/candidate-build.page";

test.describe("[CDP] Candidate build — role guard", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-BUILD-001 顾问/雇主会话裸访问 /candidate/build 被服务端角色守卫重定向至 /task 且落地首页欢迎标题可见",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const buildPage = new CandidateBuildPage(page, i18n);
      await buildPage.goto();

      // 最终 URL 匹配 /task，不停留于 /candidate/build。
      await expect(page).toHaveURL(/\/task/);
      // 落地页 h1 欢迎标题可见，证明守卫落点为可用首页。
      await expect(buildPage.welcomeHeading).toBeVisible();
    },
  );

  test(
    "TC-CDP-BUILD-002 携带 ?rebuild=1 的重建深链仍被角色守卫拦截并重定向至 /task",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const buildPage = new CandidateBuildPage(page, i18n);
      await buildPage.gotoRebuild();

      // 角色检查先于 profile/rebuild 分支执行，rebuild 无法绕过守卫。
      await expect(page).toHaveURL(/\/task/);
    },
  );

  test(
    "TC-CDP-BUILD-003 BuildEmpty 向导在非候选人会话下未渲染（守卫在 BuildClient 挂载前生效）",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const buildPage = new CandidateBuildPage(page, i18n);
      await buildPage.goto();

      // 最终 URL 绝不停留于 /candidate/build。
      await expect(page).not.toHaveURL(/\/candidate\/build/);
      // h1 精确等于 /task 欢迎标题，即 build 页专属标题缺席，BuildClient/BuildEmpty 未挂载。
      await expect(buildPage.welcomeHeading).toHaveText(buildPage.welcomeTitle);
    },
  );

  test(
    "TC-CDP-BUILD-004 携带任意非 rebuild 查询参数访问 /candidate/build 仍重定向至 /task",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const buildPage = new CandidateBuildPage(page, i18n);
      await buildPage.gotoWithQuery("foo=bar");

      // 守卫对该角色无条件生效，附加查询参数不改变结果。
      await expect(page).toHaveURL(/\/task/);
    },
  );
});
