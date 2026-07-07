// source: cdp
// handoff: test-cases/generated/playwright-handoff-profile.json
// baseline: test-cases/generated/page-baseline-profile.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ProfilePage } from "../../pages/profile.page";

test.describe("[CDP] Profile — load", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PROFILE-001 个人资料页加载并渲染已填充资料表单",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const profilePage = new ProfilePage(page, i18n);
      await profilePage.goto();

      await expect(profilePage.heading).toBeVisible();
      await expect(profilePage.basicInfoHeading).toBeVisible();
      await expect(profilePage.contactHeading).toBeVisible();
      await expect(profilePage.jobPreferencesHeading).toBeVisible();
      await expect(profilePage.experienceHeading).toBeVisible();
      await expect(profilePage.certificationsHeading).toBeVisible();

      // "Your name" textbox is pre-filled (test account has a complete candidate profile).
      await expect(profilePage.nameInput).toBeVisible();
      await expect(profilePage.nameInput).not.toHaveValue("");

      await expect(profilePage.visibilitySwitch).toBeChecked();
      await expect(profilePage.saveButton).toBeDisabled();
      // Destructive entry point — asserted visible only, never clicked (POM guardrail).
      await expect(profilePage.rebuildButton).toBeVisible();
    },
  );
});

test.describe("[CDP] Profile — portrait card", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PROFILE-002 Mira 人像卡点击可折叠再展开",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const profilePage = new ProfilePage(page, i18n);
      await profilePage.goto();

      await expect(profilePage.portraitToggle).toHaveAttribute("aria-expanded", "true");

      await profilePage.togglePortrait();
      await expect(profilePage.portraitToggle).toHaveAttribute("aria-expanded", "false");

      await profilePage.togglePortrait();
      await expect(profilePage.portraitToggle).toHaveAttribute("aria-expanded", "true");
    },
  );
});

test.describe("[CDP] Profile — save gating", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PROFILE-003 Save 按钮默认禁用，编辑表单字段后变为可用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const profilePage = new ProfilePage(page, i18n);
      await profilePage.goto();

      await expect(profilePage.saveButton).toBeDisabled();

      const originalName = await profilePage.nameValue();
      await profilePage.setName(`${originalName}-QA${Date.now()}`);

      await expect(profilePage.saveButton).toBeEnabled();

      // Teardown: restore the original name. Save is never clicked, so this is a
      // pure client-side field revert — no persisted write to roll back.
      await profilePage.setName(originalName);
    },
  );
});

test.describe("[CDP] Profile — visibility switch", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-PROFILE-004 Discoverable by employers 可见性开关可切换并回滚",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const profilePage = new ProfilePage(page, i18n);
      await profilePage.goto();

      await expect(profilePage.visibilitySwitch).toBeChecked();

      // toggleVisibility() persists via PUT /api/profile/visibility — must roll back.
      await profilePage.toggleVisibility();
      await expect(profilePage.visibilitySwitch).not.toBeChecked();

      await profilePage.toggleVisibility();
      await expect(profilePage.visibilitySwitch).toBeChecked();
    },
  );
});
