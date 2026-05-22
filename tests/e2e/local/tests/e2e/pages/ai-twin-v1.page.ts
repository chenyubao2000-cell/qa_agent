// AI Twin V1 (Lite) Page Object Model
// Covers: U1 form (/ai-twin/create), U2 first-meeting (/task/...?first_meet=true),
//         U9.2 sidebar user menu (AI Twin section + Settings sub menu)
//
// Source: read from /Users/stephen/Documents/code/preview/mira/apps/mira-work
//   features/twin/components/{twin-setup-form,name-input,personality-radio-list,
//                              u1-cta,u1-hero,u1-top-bar,avatar-field,avatar-picker}.tsx
//   features/sidebar/app-sidebar-user.tsx
//   i18n/messages/en/twin.json
//
// Locator strategy: prefer i18n.t() role-based queries (next-intl labels), fall back
// to data-testid only where source has it (sidebar-user-button). Avoid Tailwind CSS
// classes. POM accepts i18n fixture so the same locators work across locales.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

export type TwinSetupMode = "onboarding" | "migration" | "edit";
export type TwinPersonality = "default" | "professional" | "friendly" | "concise";

/**
 * Top-level POM for AI Twin V1 user-perception surfaces.
 * All locators routed through public getters; specs MUST NOT call page.* directly.
 */
export class AiTwinV1Page {
  readonly page: Page;
  private readonly i18n: I18n;

  // ── U1 Top Bar ─────────────────────────────────────────────────────────
  private readonly _topBarMiraLogoLink: Locator;
  private readonly _topBarCloseBtn: Locator; // edit-only X

  // ── U1 Hero ────────────────────────────────────────────────────────────
  private readonly _heroTitleH1: Locator;

  // ── U1 Form fields ─────────────────────────────────────────────────────
  private readonly _avatarFieldLabel: Locator;
  private readonly _avatarFieldHint: Locator;
  private readonly _changeAvatarBtn: Locator;
  private readonly _nameInput: Locator;
  private readonly _nameHint: Locator; // <p id="twin-name-hint"> — error or hint text
  private readonly _personalityLabel: Locator;
  private readonly _personalityRadioDefault: Locator;
  private readonly _personalityRadioProfessional: Locator;
  private readonly _personalityRadioFriendly: Locator;
  private readonly _personalityRadioConcise: Locator;

  // ── U1 CTA ─────────────────────────────────────────────────────────────
  // CTA has dual-form (desktop floating btn / mobile bottom bar). Both rendered;
  // visibility toggled by `md:` breakpoint. Desktop tests use desktop-named btn.
  private readonly _ctaContinueBtn: Locator; // onboarding/migration desktop
  private readonly _ctaSaveChangesBtn: Locator; // edit
  private readonly _ctaCreateAriaAndStartBtn: Locator; // onboarding/migration mobile

  // ── Avatar Picker dialog ───────────────────────────────────────────────
  private readonly _avatarPickerDialog: Locator;
  private readonly _avatarPickerTitle: Locator;
  private readonly _avatarPickerSaveBtn: Locator;
  private readonly _avatarPickerCancelBtn: Locator;
  private readonly _avatarPickerUploadInput: Locator;

  // ── U2 First Meeting ───────────────────────────────────────────────────
  private readonly _u2ChatRoot: Locator;
  private readonly _u2PromptTextarea: Locator;
  private readonly _u2TaskHeaderTitle: Locator;

  // ── Sidebar User Menu (U9.2) ───────────────────────────────────────────
  private readonly _sidebarUserButton: Locator;
  private readonly _sidebarUserMenu: Locator;
  private readonly _twinSectionAvatar: Locator;
  private readonly _twinSectionEditBtn: Locator;
  private readonly _menuItemSettings: Locator;
  private readonly _menuItemLanguage: Locator;
  private readonly _menuItemTheme: Locator;
  private readonly _menuItemSignOut: Locator;
  private readonly _settingsSubPopover: Locator;
  private readonly _subMenuSkills: Locator;
  private readonly _subMenuConnectors: Locator;
  private readonly _subMenuChromeExtension: Locator;
  private readonly _footerDocs: Locator;
  private readonly _footerBlog: Locator;

  // ── Toast / dialog ─────────────────────────────────────────────────────
  private readonly _toastRegion: Locator;
  private readonly _exitConfirmDialog: Locator;

  constructor(page: Page, i18n: I18n) {
    this.page = page;
    this.i18n = i18n;

    // U1 Top Bar
    this._topBarMiraLogoLink = page.getByRole("link", { name: "Mira" });
    this._topBarCloseBtn = page.getByRole("button", { name: i18n.t("twin.exit.close") });

    // U1 Hero — query by current mode using heading; combined regex of all 3 titles
    this._heroTitleH1 = page.getByRole("heading", { level: 1 });

    // U1 Form Fields
    this._avatarFieldLabel = page.getByText(i18n.t("twin.fields.avatar.label"), { exact: true }).first();
    this._avatarFieldHint = page.getByText(i18n.t("twin.fields.avatar.hint"), { exact: true });
    this._changeAvatarBtn = page.getByRole("button", { name: i18n.t("twin.fields.avatar.change"), exact: true });
    this._nameInput = page.locator("#twin-name-input");
    this._nameHint = page.locator("#twin-name-hint");
    this._personalityLabel = page.getByText(i18n.t("twin.fields.personality.label"), { exact: true });
    this._personalityRadioDefault = page.locator("#twin-personality-default");
    this._personalityRadioProfessional = page.locator("#twin-personality-professional");
    this._personalityRadioFriendly = page.locator("#twin-personality-friendly");
    this._personalityRadioConcise = page.locator("#twin-personality-concise");

    // U1 CTA — buttons with stable role + name (i18n)
    this._ctaContinueBtn = page.getByRole("button", { name: i18n.t("twin.cta.onboarding.desktop"), exact: true });
    this._ctaSaveChangesBtn = page.getByRole("button", { name: i18n.t("twin.cta.edit.desktop"), exact: true });
    this._ctaCreateAriaAndStartBtn = page.getByRole("button", {
      name: i18n.t("twin.cta.onboarding.mobile"),
      exact: true,
    });

    // Avatar Picker
    this._avatarPickerDialog = page.getByRole("dialog");
    this._avatarPickerTitle = page.getByRole("heading", {
      level: 2,
      name: i18n.t("twin.avatarPicker.title"),
    });
    this._avatarPickerSaveBtn = page.getByRole("button", { name: i18n.t("twin.avatarPicker.save"), exact: true });
    this._avatarPickerCancelBtn = page.getByRole("button", { name: i18n.t("twin.avatarPicker.cancel"), exact: true });
    this._avatarPickerUploadInput = page.locator('input[type="file"]');

    // U2 First Meeting (best-effort locators; final selectors may need CDP verify)
    this._u2ChatRoot = page.locator('[data-testid="chat-body"], main').first();
    this._u2PromptTextarea = page.locator('textarea, [contenteditable="true"]').first();
    this._u2TaskHeaderTitle = page.locator('[data-testid="task-header-title"], header h2').first();

    // Sidebar User Menu
    // After hydration the real menu trigger gets aria-haspopup="menu" injected by Radix.
    // Filter on that attribute to avoid clicking the Suspense Skeleton fallback (which
    // has the same data-testid but no dropdown handler).
    this._sidebarUserButton = page
      .locator('[data-testid="sidebar-user-button"][aria-haspopup="menu"]')
      .first();
    this._sidebarUserMenu = page.getByRole("menu").first();
    this._twinSectionAvatar = this._sidebarUserMenu.locator("img,[role=img]").first();
    this._twinSectionEditBtn = page.getByRole("button", { name: i18n.t("Layout.editAiTwin"), exact: true });

    this._menuItemSettings = page.getByRole("menuitem", { name: i18n.t("Layout.settings"), exact: true });
    this._menuItemLanguage = page.getByRole("menuitem", { name: i18n.t("Layout.language"), exact: true });
    this._menuItemTheme = page.getByRole("menuitem", { name: i18n.t("Layout.theme"), exact: true });
    this._menuItemSignOut = page.getByRole("menuitem", { name: i18n.t("Layout.signOut"), exact: true });

    // Settings sub-menu (Radix DropdownMenuSub uses role="menu" for the popout)
    this._settingsSubPopover = page.getByRole("menu").nth(1);
    this._subMenuSkills = page.getByRole("menuitem", { name: i18n.t("Layout.skills"), exact: true });
    this._subMenuConnectors = page.getByRole("menuitem", { name: i18n.t("Layout.connectors"), exact: true });
    this._subMenuChromeExtension = page.getByRole("menuitem", {
      name: i18n.t("Layout.chromeExtension"),
      exact: true,
    });
    this._footerDocs = page.getByRole("menuitem", { name: i18n.t("Layout.docs"), exact: true });
    this._footerBlog = page.getByRole("menuitem", { name: i18n.t("Layout.blog"), exact: true });

    // Toast & dialog
    this._toastRegion = page.locator('[role="status"], [data-sonner-toaster]');
    this._exitConfirmDialog = page.getByRole("dialog");
  }

  // ── Public getters (for assertions in specs) ───────────────────────────
  get topBarMiraLogo(): Locator { return this._topBarMiraLogoLink; }
  get topBarCloseButton(): Locator { return this._topBarCloseBtn; }
  get heroTitle(): Locator { return this._heroTitleH1; }
  get avatarFieldLabel(): Locator { return this._avatarFieldLabel; }
  get avatarFieldHint(): Locator { return this._avatarFieldHint; }
  get changeAvatarButton(): Locator { return this._changeAvatarBtn; }
  get nameInput(): Locator { return this._nameInput; }
  get nameHint(): Locator { return this._nameHint; }
  get personalityLabel(): Locator { return this._personalityLabel; }
  get continueButton(): Locator { return this._ctaContinueBtn; }
  get saveChangesButton(): Locator { return this._ctaSaveChangesBtn; }
  get createAriaAndStartButton(): Locator { return this._ctaCreateAriaAndStartBtn; }
  get avatarPickerDialog(): Locator { return this._avatarPickerDialog; }
  get avatarPickerTitle(): Locator { return this._avatarPickerTitle; }
  get avatarPickerSaveBtn(): Locator { return this._avatarPickerSaveBtn; }
  get avatarPickerCancelBtn(): Locator { return this._avatarPickerCancelBtn; }
  get avatarPickerUploadInput(): Locator { return this._avatarPickerUploadInput; }
  get u2Chat(): Locator { return this._u2ChatRoot; }
  get u2PromptTextarea(): Locator { return this._u2PromptTextarea; }
  get u2TaskHeader(): Locator { return this._u2TaskHeaderTitle; }
  get sidebarUserButton(): Locator { return this._sidebarUserButton; }
  get sidebarUserMenu(): Locator { return this._sidebarUserMenu; }
  get twinSectionAvatar(): Locator { return this._twinSectionAvatar; }
  get twinSectionEditButton(): Locator { return this._twinSectionEditBtn; }
  get settingsMenuItem(): Locator { return this._menuItemSettings; }
  get languageMenuItem(): Locator { return this._menuItemLanguage; }
  get themeMenuItem(): Locator { return this._menuItemTheme; }
  get signOutMenuItem(): Locator { return this._menuItemSignOut; }
  get settingsSubPopover(): Locator { return this._settingsSubPopover; }
  get skillsSubMenuItem(): Locator { return this._subMenuSkills; }
  get connectorsSubMenuItem(): Locator { return this._subMenuConnectors; }
  get chromeExtensionSubMenuItem(): Locator { return this._subMenuChromeExtension; }
  get docsMenuItem(): Locator { return this._footerDocs; }
  get blogMenuItem(): Locator { return this._footerBlog; }
  get toastRegion(): Locator { return this._toastRegion; }
  get exitConfirmDialog(): Locator { return this._exitConfirmDialog; }

  /** Personality radio by enum value */
  personalityRadio(value: TwinPersonality): Locator {
    switch (value) {
      case "default": return this._personalityRadioDefault;
      case "professional": return this._personalityRadioProfessional;
      case "friendly": return this._personalityRadioFriendly;
      case "concise": return this._personalityRadioConcise;
    }
  }

  /** Personality label row wrapping the radio (for selected-stroke assertions) */
  personalityRow(value: TwinPersonality): Locator {
    return this.page.locator(`label[for="twin-personality-${value}"]`);
  }

  /** Generic text getter helper (i18n-aware) — for U2 messages, toasts etc */
  textByValue(text: string, exact = false): Locator {
    return this.page.getByText(text, { exact });
  }

  /** Localized i18n key getter — preferred for content assertions */
  textByKey(key: string, vars?: Record<string, string>): Locator {
    let v = this.i18n.t(key);
    if (vars) {
      for (const [k, val] of Object.entries(vars)) v = v.replace(`{${k}}`, val);
    }
    return this.page.getByText(v, { exact: false });
  }

  // ── Public navigation / action helpers ────────────────────────────────

  /** Goto U1 in the requested mode (forces query param) */
  async gotoU1(mode: TwinSetupMode): Promise<void> {
    await this.page.goto(`/ai-twin/create?mode=${mode}`);
    // Hydration guard: under Next.js dev + Turbopack the heading renders from SSR
    // before React attaches event handlers — clicks on Close/Save/radio land on
    // raw DOM elements with no onClick wired. Wait for a React fiber prop key
    // (`__reactProps$*`) to appear on the AI Twin name input as proof that
    // hydration has reached the form.
    await this._nameInput.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForFunction(
      () => {
        const el = document.querySelector("#twin-name-input");
        return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$"));
      },
      undefined,
      { timeout: 20_000, polling: 100 },
    );
  }

  /** Click the desktop Continue CTA (onboarding/migration) */
  async clickContinue(): Promise<void> {
    await this._ctaContinueBtn.click();
  }

  /** Click the edit Save changes CTA */
  async clickSaveChanges(): Promise<void> {
    await this._ctaSaveChangesBtn.click();
  }

  /** Fill the AI Twin name input */
  async fillTwinName(value: string): Promise<void> {
    await this._nameInput.fill(value);
  }

  /** Select a personality radio */
  async selectPersonality(value: TwinPersonality): Promise<void> {
    // Radix RadioGroupItem renders as a styled button; check() via the wrapping label
    await this.personalityRow(value).click();
  }

  /** Open the avatar picker dialog */
  async openAvatarPicker(): Promise<void> {
    await this._changeAvatarBtn.click();
    await this._avatarPickerDialog.waitFor({ state: "visible", timeout: 5000 });
  }

  /** Upload a custom avatar via the picker */
  async uploadCustomAvatar(filePath: string): Promise<void> {
    await this._avatarPickerUploadInput.setInputFiles(filePath);
  }

  /** Confirm the avatar picker (Save button) */
  async confirmAvatarPicker(): Promise<void> {
    await this._avatarPickerSaveBtn.click();
    await this._avatarPickerDialog.waitFor({ state: "hidden", timeout: 5000 });
  }

  /** Submit U1 with all-default values (just click the appropriate CTA) */
  async submitU1Defaults(mode: TwinSetupMode = "onboarding"): Promise<void> {
    if (mode === "edit") {
      await this.clickSaveChanges();
    } else {
      await this.clickContinue();
    }
  }

  /** Open the sidebar user menu (U9.2) — assumes a workspace/task page is loaded */
  async openSidebarUserMenu(): Promise<void> {
    await this._sidebarUserButton.click();
    await this._sidebarUserMenu.first().waitFor({ state: "visible", timeout: 5000 });
  }

  /** Open the AI Twin edit page via the sidebar settings icon */
  async openTwinEditFromMenu(): Promise<void> {
    await this.openSidebarUserMenu();
    await this._twinSectionEditBtn.click();
  }

  /** Hover the Settings sub-menu trigger (desktop only) */
  async hoverSettingsMenu(): Promise<void> {
    await this._menuItemSettings.hover();
  }

  /** Click the Settings sub-menu trigger */
  async clickSettingsMenu(): Promise<void> {
    await this._menuItemSettings.click();
  }

  /** Click the top-bar exit / cancel button (edit only). Onboarding/migration
   *  does NOT render an exit control in the current implementation; callers
   *  testing the "挽留 dialog" path will find nothing to click — that case
   *  is tagged `@manual` until product re-introduces an exit affordance.
   */
  async clickTopBarClose(): Promise<void> {
    await this._topBarCloseBtn.click();
  }

  /** Best-effort: detect whether the user is currently on U2 (first meeting) */
  async isOnFirstMeeting(): Promise<boolean> {
    const url = this.page.url();
    return /\/task\/.+first_meet=true/.test(url);
  }
}
