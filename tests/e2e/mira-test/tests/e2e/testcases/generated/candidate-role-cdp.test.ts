// source: cdp
// handoff: test-cases/generated/playwright-handoff-candidate-role.json
// baseline: test-cases/generated/page-baseline-candidate-role.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { CandidateRolePage } from "../../pages/candidate-role.page";

test.describe("[CDP] Candidate role — welcome landing", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ROLE-001 首次引导 welcome 态落地渲染欢迎标题、副标题与三张身份卡且无关闭按钮",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const rolePage = new CandidateRolePage(page, i18n);
      await rolePage.gotoWelcome();

      await expect(page).toHaveURL(/\/candidate\/role/);
      await expect(rolePage.heading).toHaveText(rolePage.welcomeTitle);
      await expect(rolePage.welcomeSubtitleText).toBeVisible();
      await expect(rolePage.consultantTitleText).toBeVisible();
      await expect(rolePage.candidateTitleText).toBeVisible();
      await expect(rolePage.employerTitleText).toBeVisible();
      await expect(rolePage.closeButton).toHaveCount(0);
    },
  );
});

test.describe("[CDP] Candidate role — CTA state", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ROLE-002 雇主卡永久禁用而顾问/求职者卡 CTA 可用",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const rolePage = new CandidateRolePage(page, i18n);
      await rolePage.gotoWelcome();

      await expect(rolePage.consultantCta).toBeEnabled();
      await expect(rolePage.jobSeekerCta).toBeEnabled();
      await expect(rolePage.employerCta).toBeDisabled();
    },
  );

  test(
    "TC-CDP-ROLE-003 三张身份卡展示正确标题与各自 CTA",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const rolePage = new CandidateRolePage(page, i18n);
      await rolePage.gotoWelcome();

      await expect(rolePage.consultantTitleText).toHaveText(rolePage.consultantTitle);
      await expect(rolePage.candidateTitleText).toHaveText(rolePage.candidateTitle);
      await expect(rolePage.employerTitleText).toHaveText(rolePage.employerTitle);
      await expect(rolePage.ctaButtons).toHaveCount(3);
    },
  );
});

test.describe("[CDP] Candidate role — switch mode", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-ROLE-004 switch 切换态渲染切换标题、切换副标题与关闭(X)按钮",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const rolePage = new CandidateRolePage(page, i18n);
      await rolePage.gotoSwitch();

      await expect(rolePage.heading).toHaveText(rolePage.switchTitle);
      await expect(rolePage.switchSubtitleText).toBeVisible();
      await expect(rolePage.closeButton).toBeVisible();
    },
  );

  test(
    "TC-CDP-ROLE-005 非「1」的 switch query 回落为 welcome 态",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const rolePage = new CandidateRolePage(page, i18n);
      await rolePage.gotoWithSwitchQuery("0");

      await expect(rolePage.heading).toHaveText(rolePage.welcomeTitle);
      await expect(rolePage.closeButton).toHaveCount(0);
    },
  );
});
