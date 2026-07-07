// source: cdp
// baseline: test-cases/generated/page-baseline-library.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(sourcing)/library/page.tsx   (LibraryPage — static "use client" placeholder; no state/props/conditionals)
//   @mira/canvas/client <Canvas> wrapped with a static MVP-placeholder body (external package, not inlined)
//   packages/design-system/src/atoms/sidebar.tsx     (app-shell sidebar; desktop wrapper carries data-state="expanded|collapsed")
//   i18n namespace: chatbot → chatbot.library ("Library") — present in this QA project's messages/en.json.
//
// Locator strategy (hasTestIds=false; dominantStrategy = role+name / text):
//   • No data-testid anywhere on this page — every locator is role/name or visible text.
//   • h1 uses i18n key chatbot.library; single-locale ("en") deployment, resolved via i18n.t() with an
//     English fallback (same pattern as calendar.page.ts / contacts.page.ts).
//   • The only interactive element in <main> is NONE — the page is an intentional MVP placeholder.
//     The sole exercisable control is the shared app-shell "Toggle Sidebar" button (global layout).
//   • Sidebar collapse state lives on the desktop wrapper div (data-variant="sidebar" + data-state);
//     data-variant is Mira-specific (Radix floating elements never emit it), so the pair is a stable anchor.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "chatbot.library",
} as const;

export class LibraryPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Main content (S0 — static placeholder) ────────────────────────────────
  private readonly _heading: Locator;        // h1 "Library" (i18n chatbot.library)
  private readonly _comingSoon: Locator;     // "Coming soon" subheading
  private readonly _canvasHeading: Locator;  // h2 "Talent Library" (inside Canvas placeholder)
  private readonly _placeholderBody: Locator; // MVP explanatory paragraph
  private readonly _sceneIdRow: Locator;     // "scene.id — sourcing-library"
  private readonly _sceneIdValue: Locator;   // <code>sourcing-library</code>
  private readonly _sceneModeRow: Locator;   // "scene.mode — viewer"
  private readonly _sceneModeValue: Locator; // <code>viewer</code>

  // ── App shell (S0 ⇄ S1 — sidebar toggle) ──────────────────────────────────
  private readonly _toggleSidebarButton: Locator;
  private readonly _sidebarRoot: Locator;    // desktop sidebar wrapper carrying data-state

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", { level: 1, name: this.t(KEYS.title, "Library") });
    this._comingSoon = page.getByText("Coming soon", { exact: true });
    this._canvasHeading = page.getByRole("heading", { level: 2, name: "Talent Library" });
    // Stable, source-anchored phrase from the MVP placeholder body.
    this._placeholderBody = page.getByText(/candidate cards in a later phase/i);
    // Scene metadata list — CDP-verified live DOM: <li>scene.id — sourcing-library</li> (no wrapping
    // <code>/<span> around the value; label and value are two concatenated text nodes in the same <li>).
    // getByText(exact) can never match just the value here, and a non-exact substring match on
    // "sourcing-library" would also hit the placeholder body paragraph (which repeats that word),
    // producing a NEW strict-mode violation. Fix: scope to the row (regex is unique on the page) and
    // assert containment in the spec instead of full-text equality. See e2e-flakiness-playbook.md.
    this._sceneIdRow = page.getByText(/scene\.id/);
    this._sceneIdValue = this._sceneIdRow;
    this._sceneModeRow = page.getByText(/scene\.mode/);
    this._sceneModeValue = this._sceneModeRow;

    // CDP-verified: getByRole('button', { name: 'Toggle Sidebar' }) resolves to TWO elements —
    // the real trigger (data-sidebar="trigger", accessible name from an sr-only span) and the
    // app-shell resize rail (data-sidebar="rail", tabindex=-1, name from aria-label). Both share
    // the same accessible name, so scope by the stable data attribute to hit only the real trigger.
    // Verified live: clicking [data-sidebar="trigger"] flips the sidebar's data-state
    // expanded -> collapsed; the rail is a decorative resize handle, not the intended toggle target.
    this._toggleSidebarButton = page.locator('button[data-sidebar="trigger"]');
    // .first() is defensive; on desktop only the single md:block sidebar wrapper renders.
    this._sidebarRoot = page.locator('[data-variant="sidebar"][data-state]').first();
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get comingSoon(): Locator { return this._comingSoon; }
  get canvasHeading(): Locator { return this._canvasHeading; }
  get placeholderBody(): Locator { return this._placeholderBody; }
  get sceneIdRow(): Locator { return this._sceneIdRow; }
  get sceneIdValue(): Locator { return this._sceneIdValue; }
  get sceneModeRow(): Locator { return this._sceneModeRow; }
  get sceneModeValue(): Locator { return this._sceneModeValue; }
  get toggleSidebarButton(): Locator { return this._toggleSidebarButton; }
  get sidebarRoot(): Locator { return this._sidebarRoot; }

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Open the authenticated Library page. Auth via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/library");
    // Wait for the h1, then a hydration-readiness proxy — this deployment ships the SSR skeleton
    // before React attaches handlers; clicking too early silently no-ops.
    // See e2e-flakiness-playbook.md §19b (applied proactively, per task instructions).
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Toggle the global app-shell sidebar (S0 ⇄ S1). */
  async toggleSidebar(): Promise<void> {
    await this._toggleSidebarButton.click();
  }
}
