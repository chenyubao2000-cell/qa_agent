// source: cdp
// handoff: test-cases/generated/playwright-handoff-contacts.json
// baseline: test-cases/generated/page-baseline-contacts.json
// generated: 2026-07-03T00:00:00Z

import { test, expect } from "../../fixtures";
import { ContactsPage } from "../../pages/contacts.page";

test.describe("[CDP] Contacts — list view", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONTACT-001 联系人页加载并渲染全量列表",
    { tag: ["@P0", "@smoke", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const contactsPage = new ContactsPage(page, i18n);
      await contactsPage.goto();

      // h1 title + populated count + default "All" tab selected + table structure.
      await expect(contactsPage.heading).toBeVisible();
      await expect(contactsPage.countText).toBeVisible();
      await expect(contactsPage.countText).toHaveText(/\d+\s+(people|person)\b/);
      await expect(contactsPage.allTab).toBeChecked();
      await expect(contactsPage.nameColumnHeader).toBeVisible();

      // Populated list: at least one contact row is rendered.
      await expect(contactsPage.rowButtons.first()).toBeVisible();
      const rows = await contactsPage.rowCount();
      expect(rows).toBeGreaterThan(0);

      const count = await contactsPage.peopleCount();
      expect(count).toBeGreaterThan(0);
    },
  );
});

test.describe("[CDP] Contacts — segmented filter", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONTACT-002 切换到空类别 Clients tab 显示无数据提示且头部保留",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const contactsPage = new ContactsPage(page, i18n);
      await contactsPage.goto();

      await contactsPage.selectClientsTab();

      // Empty-category inline message shows; count zeroes; header + toolbar stay visible
      // (verifies the fixed "tab disappears" regression referenced in source comments).
      await expect(contactsPage.emptyCategoryText).toBeVisible();
      await expect(contactsPage.countText).toHaveText(/\b0\s+(people|person)\b/);
      await expect(contactsPage.heading).toBeVisible();
      await expect(contactsPage.searchInput).toBeVisible();
    },
  );
});

test.describe("[CDP] Contacts — search", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONTACT-003 搜索无匹配关键字显示无匹配态并同步 URL，清空后还原",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const contactsPage = new ContactsPage(page, i18n);
      await contactsPage.goto();

      const query = "zzzznonexistentquery";
      await contactsPage.search(query);

      // Debounced no-match state + URL sync to ?q=...
      await expect(contactsPage.noMatchText).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`q=${query}`));

      // Clear via keyboard (fill('') silently no-ops on this controlled input) → full list restored.
      await contactsPage.clearSearch();
      await expect(contactsPage.noMatchText).toBeHidden();
      await expect(contactsPage.rowButtons.first()).toBeVisible();
      const rows = await contactsPage.rowCount();
      expect(rows).toBeGreaterThan(0);
      await expect(page).not.toHaveURL(new RegExp(`q=${query}`));
    },
  );
});

test.describe("[CDP] Contacts — import dialog", { tag: ["@regression", "@full"] }, () => {
  test(
    "TC-CDP-CONTACT-005 打开导入弹窗且未选文件时 Continue 禁用，关闭后返回列表",
    { tag: ["@P1", "@regression", "@full"] },
    async ({ page, i18n }) => {
      const contactsPage = new ContactsPage(page, i18n);
      await contactsPage.goto();

      await contactsPage.openImportDialog();

      await expect(contactsPage.importDialogHeading).toBeVisible();
      await expect(contactsPage.selectFilesButton).toBeVisible();
      // Form gating: Continue disabled until a file is selected.
      await expect(contactsPage.continueButton).toBeDisabled();

      await contactsPage.closeImportDialog();
      await expect(contactsPage.heading).toBeVisible();
    },
  );

  test(
    "TC-CDP-CONTACT-004 导入弹窗 IMPORT AS 单选组默认无选中，需用户手动选择",
    { tag: ["@P2", "@full"] },
    async ({ page, i18n }) => {
      const contactsPage = new ContactsPage(page, i18n);
      await contactsPage.goto();

      await contactsPage.openImportDialog();

      // Source: contact-import-dialog.tsx `useState<ContactType | null>(null)` — no default
      // type value; contact-import-upload-step.tsx renders `RadioGroup value={type ?? undefined}`,
      // so neither option is checked until the user picks one (Continue stays disabled per
      // `canContinue = !!type && files.length > 0`, covered by TC-CDP-CONTACT-005).
      await expect(contactsPage.importAsCandidateRadio).toBeVisible();
      await expect(contactsPage.importAsCandidateRadio).not.toBeChecked();
      await expect(contactsPage.importAsClientRadio).toBeVisible();
      await expect(contactsPage.importAsClientRadio).not.toBeChecked();
    },
  );
});
