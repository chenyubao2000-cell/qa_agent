// source: cdp
// handoff: test-cases/generated/playwright-handoff-settings-skills.json
// baseline: test-cases/generated/page-baseline-settings-skills.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { SettingsSkillsPage } from "../../pages/settings-skills.page";

// NOTE: playwright-handoff-settings-skills.json has no explicit `tags` field per test case —
// tags below are inferred from `priority` per this project's standard convention. Authenticated
// page — no storageState opt-out (default project storageState/ensureAuthenticated applies).

test.describe("[CDP] Settings Skills — Official list", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SKILL-001 技能页默认加载，Official tab 渲染 5 个官方技能及启用开关",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const skillsPage = new SettingsSkillsPage(page, i18n);
      await skillsPage.goto();

      await expect(skillsPage.heading).toBeVisible();
      await expect(skillsPage.heading).toHaveText("All Skills");
      await expect(skillsPage.officialTab).toBeVisible();
      await expect(skillsPage.officialTab).toHaveAttribute("aria-selected", "true");

      const count = await skillsPage.skillSwitchCount();
      expect(count).toBe(5);

      const candidateProfileSwitch = skillsPage.skillSwitch("mira-candidate-profile");
      await expect(candidateProfileSwitch).toBeVisible();
      await expect(candidateProfileSwitch).toBeChecked();
      await expect(candidateProfileSwitch).toBeEnabled();
    },
  );

  test(
    "TC-CDP-SKILL-005 官方技能行不可点击（渲染为文本而非按钮），开关可用",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const skillsPage = new SettingsSkillsPage(page, i18n);
      await skillsPage.goto();

      // Source: SkillRow renders official (source='system') rows as a plain non-clickable
      // <div>, not a <button> — "官方不可点击" per skills-client.tsx comment.
      await expect(skillsPage.skillNameButton("mira-candidate-profile")).toHaveCount(0);
      await expect(skillsPage.skillNameText("mira-candidate-profile")).toBeVisible();

      const candidateProfileSwitch = skillsPage.skillSwitch("mira-candidate-profile");
      await expect(candidateProfileSwitch).toBeEnabled();
    },
  );
});

test.describe("[CDP] Settings Skills — Personal empty state", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SKILL-002 切换到 Personal tab 显示空状态与创建引导，URL 同步 tab=personal",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const skillsPage = new SettingsSkillsPage(page, i18n);
      await skillsPage.goto();

      await skillsPage.switchToPersonalTab();

      await expect(skillsPage.emptyPersonalTitle).toBeVisible();
      await expect(skillsPage.createFirstSkillButton).toBeVisible();
      await expect(page).toHaveURL(/tab=personal/);
    },
  );
});

test.describe("[CDP] Settings Skills — New Skill menu", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SKILL-003 空状态 CTA 打开 New Skill 下拉，展示两个创建入口，Escape 关闭返回空状态",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const skillsPage = new SettingsSkillsPage(page, i18n);
      await skillsPage.goto();
      await skillsPage.switchToPersonalTab();

      await skillsPage.openNewSkillMenuFromCta();

      await expect(skillsPage.fromChatItem).toBeVisible();
      await expect(skillsPage.fromFileItem).toBeVisible();

      await skillsPage.closeMenuWithEscape();

      await expect(skillsPage.menu).toBeHidden();
      await expect(page).toHaveURL(/\/settings\/skills/);
    },
  );

  test(
    "TC-CDP-SKILL-004 Header + New Skill 触发器打开与 CTA 相同的两个选项菜单，Escape 关闭",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const skillsPage = new SettingsSkillsPage(page, i18n);
      await skillsPage.goto();

      await skillsPage.openNewSkillMenuFromHeader();

      await expect(skillsPage.fromChatItem).toBeVisible();
      await expect(skillsPage.fromFileItem).toBeVisible();

      await skillsPage.closeMenuWithEscape();

      await expect(skillsPage.menu).toBeHidden();
      await expect(page).toHaveURL(/\/settings\/skills/);
    },
  );
});
