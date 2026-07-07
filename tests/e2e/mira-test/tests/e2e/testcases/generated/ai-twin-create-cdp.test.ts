// source: cdp
// handoff: test-cases/generated/playwright-handoff-ai-twin-create.json
// baseline: test-cases/generated/page-baseline-ai-twin-create.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { AiTwinCreatePage } from "../../pages/ai-twin-create.page";

test.describe("[CDP] AI Twin edit — load & initial state", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-TWIN-001 编辑页在 edit 模式正确加载且初始 Save changes 禁用",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const twinPage = new AiTwinCreatePage(page, i18n);
      await twinPage.goto();

      await expect(twinPage.heading).toBeVisible();
      await expect(twinPage.nameInput).toBeVisible();
      // 编辑模式预填当前分身名，值应非空。
      const currentName = await twinPage.nameInput.inputValue();
      expect(currentName.length).toBeGreaterThan(0);
      // 初始无字段 diff -> submitDisabled。
      await expect(twinPage.saveButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] AI Twin edit — name validation & save gating", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-TWIN-002 修改名称为合法新值后 Save changes 由禁用变为启用",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const twinPage = new AiTwinCreatePage(page, i18n);
      await twinPage.goto();

      // 合法且不同于当前名，<=20 codepoint，带时间戳保证唯一。
      const uniqueName = `QA ${Date.now()}`;
      await twinPage.fillName(uniqueName);

      // 名称产生 diff 且 nameValid -> 启用（不提交）。
      await expect(twinPage.saveButton).toBeEnabled();
    },
  );

  test(
    "TC-CDP-TWIN-004 名称含非法字符时显示内联错误且 Save changes 保持禁用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const twinPage = new AiTwinCreatePage(page, i18n);
      await twinPage.goto();

      await twinPage.fillName("Mira@@");

      // #twin-name-hint 以 role=alert 渲染错误文案（twin.errors.nameInvalidChars）。
      await expect(twinPage.nameHint).toBeVisible();
      await expect(twinPage.nameHint).toHaveText(i18n.t("twin.errors.nameInvalidChars"));
      await expect(twinPage.nameInput).toHaveAttribute("aria-invalid", "true");
      await expect(twinPage.saveButton).toBeDisabled();
    },
  );

  test(
    "TC-CDP-TWIN-005 名称含品牌黑名单词时显示品牌错误且 Save changes 保持禁用",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const twinPage = new AiTwinCreatePage(page, i18n);
      await twinPage.goto();

      await twinPage.fillName("claudeBot");

      // 品牌黑名单错误（twin.errors.nameBlockedBrand）。
      await expect(twinPage.nameHint).toBeVisible();
      await expect(twinPage.nameHint).toHaveText(i18n.t("twin.errors.nameBlockedBrand"));
      await expect(twinPage.saveButton).toBeDisabled();
    },
  );
});

test.describe("[CDP] AI Twin edit — personality selection", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-TWIN-003 选择不同个性单选项后该项被选中",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const twinPage = new AiTwinCreatePage(page, i18n);
      await twinPage.goto();

      await twinPage.selectPersonality("professional");

      // 点击后该单选项 checked（与初始个性无关，恒定成立）。
      await expect(twinPage.personalityRadio("professional")).toBeChecked();
    },
  );
});

test.describe("[CDP] AI Twin edit — cancel", { tag: ["@full"] }, () => {
  test(
    "TC-CDP-TWIN-006 Cancel 丢弃修改并返回上一页且无挽留对话框",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const twinPage = new AiTwinCreatePage(page, i18n);
      // 先访问 /task 再进入编辑页，使 router.back() 目标确定为 /task。
      await twinPage.gotoViaTask();

      // 制造 dirty 态。
      const uniqueName = `QA ${Date.now()}`;
      await twinPage.fillName(uniqueName);

      await twinPage.clickCancel();

      // 编辑模式无未保存挽留对话框。
      await expect(twinPage.alertDialog).toHaveCount(0);
      await expect(page).toHaveURL(/\/task/);
    },
  );
});
