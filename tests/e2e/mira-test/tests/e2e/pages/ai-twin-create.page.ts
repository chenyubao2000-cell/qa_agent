// Page Object: AI Twin Create/Edit (authenticated) — /ai-twin/create?mode=edit
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(twin)/ai-twin/create/page.tsx              (server guard: profile exists + mode=edit → edit)
//   apps/mira-work/app/(twin)/ai-twin/create/twin-create-client.tsx
//   apps/mira-work/features/twin/components/twin-setup-form.tsx    (submitDisabled = !nameValid || (edit && !hasChanges))
//   apps/mira-work/features/twin/components/name-input.tsx          (id="twin-name-input", hint p#twin-name-hint role=alert on error)
//   apps/mira-work/features/twin/components/personality-radio-list.tsx (Radix radios, name = t(`personality.${option}`))
//   apps/mira-work/features/twin/components/u1-cta.tsx              (Save changes + Cancel rendered TWICE: desktop inline + mobile sticky)
//   apps/mira-work/features/twin/components/u1-top-bar.tsx          (edit-only Close X, aria-label = t('exit.close'))
//   messages/en.json → twin.{hero.edit.title, fields.name.label, cta.edit.desktop, cta.cancel, exit.close,
//                      personality.*, errors.nameInvalidChars, errors.nameBlockedBrand, fields.avatar.change}
//
// Locator strategy (baseline locatorProfile: hasTestIds=false, dominantStrategy=role+name; only stable id is #twin-name-input):
//   • No data-testid anywhere in source → getByRole / getByLabel only; text resolved via i18n.t(key) with English fallback.
//   • DUPLICATE CTAs: <U1CTA variant="desktop"> (hidden md:flex) and <U1CTA variant="mobile"> (md:hidden) BOTH render a
//     "Save changes" and "Cancel" button, so getByRole matches 2 elements → strict-mode violation. At the config viewport
//     (1280×720 ≥ md breakpoint) only the desktop CTA is displayed, so we scope with .filter({ visible: true }) to bind
//     the single visible button regardless of DOM order.
//   • Name error hint is p#twin-name-hint; it gains role="alert" ONLY when the value is invalid — stable id used for scope.
//
// SMOKE safety: "Save changes" is NEVER clicked (would POST /api/twin/edit and mutate the persisted profile). Only the
// disabled/enabled gating + client-side name validation + the safe Cancel (router.back, discards edits) are exercised.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  heading: "twin.hero.edit.title",
  nameLabel: "twin.fields.name.label",
  save: "twin.cta.edit.desktop",
  cancel: "twin.cta.cancel",
  close: "twin.exit.close",
  change: "twin.fields.avatar.change",
  errInvalidChars: "twin.errors.nameInvalidChars",
  errBlockedBrand: "twin.errors.nameBlockedBrand",
  personality: {
    default: "twin.personality.default",
    professional: "twin.personality.professional",
    friendly: "twin.personality.friendly",
    concise: "twin.personality.concise",
  },
} as const;

export type TwinPersonality = "default" | "professional" | "friendly" | "concise";

const PERSONALITY_FALLBACK: Record<TwinPersonality, string> = {
  default: "Default",
  professional: "Professional",
  friendly: "Friendly",
  concise: "Concise",
};

export class AiTwinCreatePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  private readonly _heading: Locator;
  private readonly _nameInput: Locator;
  private readonly _nameHint: Locator;
  private readonly _saveButton: Locator;
  private readonly _cancelButton: Locator;
  private readonly _closeButton: Locator;
  private readonly _changeAvatarButton: Locator;
  private readonly _alertDialog: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", {
      name: this.t(KEYS.heading, "Edit your AI Twin"),
    });
    this._nameInput = page.getByLabel(this.t(KEYS.nameLabel, "AI Twin name"));
    // Stable id from source (name-input.tsx). Carries role="alert" + destructive text only when invalid.
    this._nameHint = page.locator("#twin-name-hint");
    // Save changes / Cancel appear in both the desktop (hidden md:flex) and mobile (md:hidden) CTA blocks;
    // .filter({ visible: true }) binds the single one shown at the current viewport (desktop at 1280×720).
    this._saveButton = page
      .getByRole("button", { name: this.t(KEYS.save, "Save changes") })
      .filter({ visible: true });
    this._cancelButton = page
      .getByRole("button", { name: this.t(KEYS.cancel, "Cancel") })
      .filter({ visible: true });
    this._closeButton = page.getByRole("button", { name: this.t(KEYS.close, "Close") });
    this._changeAvatarButton = page.getByRole("button", { name: this.t(KEYS.change, "Change") });
    // Edit mode has NO unsaved-changes confirm dialog; used to assert its absence after Cancel.
    this._alertDialog = page.getByRole("alertdialog");
  }

  /** i18n-aware label resolver with an English fallback (single-locale project, stale-dict tolerant). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get nameInput(): Locator { return this._nameInput; }
  get nameHint(): Locator { return this._nameHint; }
  get saveButton(): Locator { return this._saveButton; }
  get cancelButton(): Locator { return this._cancelButton; }
  get closeButton(): Locator { return this._closeButton; }
  get changeAvatarButton(): Locator { return this._changeAvatarButton; }
  get alertDialog(): Locator { return this._alertDialog; }

  /** Personality radio by option key (accessible name = localized personality label). */
  personalityRadio(option: TwinPersonality): Locator {
    return this.page.getByRole("radio", {
      name: this.t(KEYS.personality[option], PERSONALITY_FALLBACK[option]),
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open the edit page directly. Existing-profile account + mode=edit renders the edit form (no server redirect). */
  async goto(): Promise<void> {
    await this.page.goto("/ai-twin/create?mode=edit");
    await this.waitForReady();
  }

  /**
   * Navigate to /task first, then into the edit page — gives router.back() (Cancel/Close) a deterministic
   * target (/task) instead of an empty history stack.
   */
  async gotoViaTask(): Promise<void> {
    await this.page.goto("/task");
    await this.page.waitForURL("**/task**", { timeout: 60_000, waitUntil: "domcontentloaded" }).catch(() => {});
    await this.page.goto("/ai-twin/create?mode=edit");
    await this.waitForReady();
  }

  /**
   * Wait for the heading, then settle the network as a hydration-readiness proxy (playbook §19b): the SSR heading
   * being visible does NOT guarantee React has attached the controlled-input onChange / button onClick handlers.
   * Interacting before hydration silently no-ops (fills reset, disabled state stale) — especially under parallel
   * workers on the shared preview deployment.
   */
  async waitForReady(): Promise<void> {
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Fill the AI Twin name (fires React onChange for controlled input). Pass "" to clear. */
  async fillName(value: string): Promise<void> {
    await this._nameInput.fill(value);
  }

  /** Select a personality option. */
  async selectPersonality(option: TwinPersonality): Promise<void> {
    await this.personalityRadio(option).click();
  }

  /** Click Cancel (router.back(), discards edits, no confirm dialog in edit mode). */
  async clickCancel(): Promise<void> {
    await this._cancelButton.click();
  }
}
