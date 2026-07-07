// source: cdp
// baseline: test-cases/generated/page-baseline-projects.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(sourcing)/projects/page.tsx   (ProjectsPage — static placeholder route)
//   i18n namespace: chatbot → chatbot.projects (h1 title). "Coming soon" is HARDCODED (non-i18n).
//
// Locator strategy (hasTestIds=false, dominantStrategy = role + name):
//   • The route component is a static "Coming soon" placeholder: a single translated <h1>
//     (t('chatbot.projects') → "Projects") plus a hardcoded English paragraph. It owns NO
//     interactive elements, NO forms, NO testIds, NO conditional rendering.
//   • chatbot.projects IS present in this QA project's messages/en.json (→ "Projects"), so
//     i18n.t() resolves correctly. English fallback is still supplied via t(key, fallback)
//     for robustness — identical pattern to contacts.page.ts (single-locale "en" deployment).
//   • The "Coming soon" text is NOT translated in source, so it is matched by the live literal
//     via a case-insensitive regex, never i18n.t().
//   • "New channel" / "Files" / "Recent" are SHARED app-shell side-nav buttons (role+name), NOT
//     owned by ProjectsPage — used only to assert the placeholder renders inside the authenticated
//     shell. NEVER use Tailwind utility classes (mx-auto, text-muted-foreground, …) as locators.
//   • Production (mira.day) shell differs from the Railway preview this POM was first generated
//     against: the preview exposed "Contacts"/"Calendar"/"Files" nav buttons; production's shared
//     shell instead shows "New channel", "Files", and a "Recent" chat-history section. "Files" is
//     the only name stable across both. Confirmed via live CDP snapshot of https://mira.day/projects
//     on 2026-07-03 — see e2e-flakiness-playbook.md for the general pattern of re-verifying shared
//     shell chrome per-environment instead of assuming it's shared page content.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "chatbot.projects",
} as const;

export class ProjectsPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Page-owned content (S0) ────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _comingSoonText: Locator;

  // ── Shared app-shell side nav (NOT owned by ProjectsPage) ───────────────────
  private readonly _newChannelNavButton: Locator;
  private readonly _filesNavButton: Locator;
  private readonly _recentNavSection: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const titleLabel = this.t(KEYS.title, "Projects");

    this._heading = page.getByRole("heading", { level: 1, name: titleLabel });
    // Hardcoded (non-i18n) placeholder copy — matched by live literal, case-insensitive.
    this._comingSoonText = page.getByText(/coming soon/i);

    this._newChannelNavButton = page.getByRole("button", { name: "New channel", exact: true });
    this._filesNavButton = page.getByRole("button", { name: "Files", exact: true });
    this._recentNavSection = page.getByRole("button", { name: "Recent", exact: true });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get comingSoonText(): Locator { return this._comingSoonText; }
  get newChannelNavButton(): Locator { return this._newChannelNavButton; }
  get filesNavButton(): Locator { return this._filesNavButton; }
  get recentNavSection(): Locator { return this._recentNavSection; }

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Open the authenticated Projects placeholder page. Auth via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/projects");
    // SSR ships the static skeleton (h1) before React hydrates; a `visible` assertion only
    // proves the DOM exists, not that handlers are attached. Wait for the h1, then a
    // hydration-readiness proxy (networkidle) before any assertion/interaction. This deployment
    // has a confirmed SSR-before-hydration race on every page. See e2e-flakiness-playbook.md §19b.
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }
}
