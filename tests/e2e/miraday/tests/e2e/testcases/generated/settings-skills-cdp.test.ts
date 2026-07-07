// source: cdp
// handoff: test-cases/generated/playwright-handoff-settings-skills.json
// baseline: test-cases/generated/page-baseline-settings-skills.json
// generated: 2026-07-03T00:00:00Z
//
// NOTE: playwright-handoff-settings-skills.json has no explicit `tags` field per test case —
// tags below are inferred from `priority` per this project's standard convention (P0 →
// @P0,@smoke,@regression,@full; P1 → @P1,@regression,@full; P2 → @P2,@full), same convention
// used for terms-cdp.test.ts / sign-in-cdp.test.ts / task-cdp.test.ts in this batch.

import { test, expect } from "../../fixtures";
import { SettingsSkillsPage } from "../../pages/settings-skills.page";

test.describe("[CDP] Settings skills — official list", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-SKILL-001 技能页默认加载，Official tab 渲染官方技能列表及启用开关（数量与 tab 计数徽标一致）",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const skillsPage = new SettingsSkillsPage(page, i18n);
      await skillsPage.goto();

      await expect(skillsPage.heading).toHaveText("All Skills");
      await expect(skillsPage.officialTab).toBeVisible();

      // Official skill count is environment-dependent (see settings-skills.page.ts /
      // handoff notes) — parse the expected count from the tab's own accessible-name
      // count badge (e.g. "Official 4") instead of hardcoding, then cross-check it
      // against the actually-rendered switch count.
      const tabLabel = (await skillsPage.officialTab.textContent()) ?? "";
      const expectedCount = parseInt(tabLabel.replace(/\D/g, ""), 10);
      expect(await skillsPage.skillSwitchCount()).toBe(expectedCount);

      const firstSkillName = await skillsPage.firstOfficialSkillName();
      const firstSwitch = skillsPage.skillSwitch(firstSkillName);
      await expect(firstSwitch).toBeChecked();
      await expect(firstSwitch).toBeEnabled();
    },
  );

  test(
    "TC-CDP-SKILL-005 官方技能行不可点击（渲染为文本而非按钮），开关可用",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const skillsPage = new SettingsSkillsPage(page, i18n);
      await skillsPage.goto();

      const firstSkillName = await skillsPage.firstOfficialSkillName();

      // Official rows render as a plain non-clickable <div> (source='system' branch) —
      // no button carries the skill name as its accessible name.
      await expect(skillsPage.skillNameButton(firstSkillName)).toHaveCount(0);
      await expect(skillsPage.skillNameText(firstSkillName)).toBeVisible();
      await expect(skillsPage.skillSwitch(firstSkillName)).toBeEnabled();
    },
  );
});

test.describe("[CDP] Settings skills — personal empty state", { tag: ["@regression", "@full"] }, () => {
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

test.describe("[CDP] Settings skills — new skill menu", { tag: ["@regression", "@full"] }, () => {
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
