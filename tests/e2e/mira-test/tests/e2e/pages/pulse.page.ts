// source: cdp
// baseline: test-cases/generated/page-baseline-pulse.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/pulse/page.tsx                       (PulsePage — route)
//   apps/mira-work/app/(agent)/pulse/pulse-client.tsx               (h1 + two-section layout / empty-state branching)
//   apps/mira-work/features/pulse/components/hitl-section.tsx       (h2 "Awaiting your reply" + count Badge + ul[role=list])
//   apps/mira-work/components/pulse/hitl-row.tsx                    (li[data-slot="hitl-row"] · Link→/task · Reply/Approve/More · Dismiss menuitem)
//   apps/mira-work/features/pulse/components/activity-section.tsx   (h2 "Recent activity" + inline empty <p>)
//   i18n namespace: pulse.* (useTranslations("pulse") / "pulse.awaiting")
//
// Locator strategy (hasTestIds=false — 0 data-testid across the entire pulse feature; dominantStrategy = role+name):
//   • Every locator is role/name or the stable data-slot="hitl-row" attribute — no CSS/Tailwind utility selectors.
//   • The `pulse` i18n namespace is NOT merged into this QA project's messages/en.json (grep-confirmed no `pulse` key),
//     so i18n.t() returns the raw key. This is a single-locale ("en") deployment, so the observed English CDP
//     literals are used as fallbacks via t(key, fallback) — identical to channels.page.ts / contacts.page.ts.
//   • Count badge is a <span> with aria-label = t("awaiting.count", {n}) → "N item(s) pending"; visible text = count.
//     Located by aria-label (getByLabel) — unique vs the sidebar "Pulse N item awaiting" nav button.
//   • Reply / More / Dismiss only render when a HITL item exists (items.length>0 branch), so their presence proves
//     the populated state. Dismiss is DESTRUCTIVE (optimistic removal of the pending item) — only opened + Escaped,
//     never clicked, per the baseline destructiveActions note.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  pageTitle: "pulse.page.title",
  awaitingTitle: "pulse.awaiting.title",
  awaitingCount: "pulse.awaiting.count",
  reply: "pulse.awaiting.actions.reply",
  more: "pulse.awaiting.actions.more",
  dismiss: "pulse.awaiting.actions.dismiss",
  activityTitle: "pulse.activity.title",
} as const;

export class PulsePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Page title (S0) ──────────────────────────────────────────────────────────
  private readonly _pageHeading: Locator;

  // ── HITL "Awaiting your reply" section (S0) ────────────────────────────────────
  private readonly _awaitingHeading: Locator;
  private readonly _awaitingCountBadge: Locator;
  private readonly _hitlRows: Locator;
  private readonly _hitlItemLink: Locator;
  private readonly _replyButton: Locator;
  private readonly _moreButton: Locator;

  // ── HITL row More-menu (S1) ────────────────────────────────────────────────────
  private readonly _dismissMenuItem: Locator;

  // ── Activity "Recent activity" section (S0) ─────────────────────────────────────
  private readonly _activityHeading: Locator;
  private readonly _activityEmptyText: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const pageTitle = this.t(KEYS.pageTitle, "Pulse");
    const awaitingTitle = this.t(KEYS.awaitingTitle, "Awaiting your reply");
    const replyLabel = this.t(KEYS.reply, "Reply");
    const moreLabel = this.t(KEYS.more, "More");
    const dismissLabel = this.t(KEYS.dismiss, "Dismiss");
    const activityTitle = this.t(KEYS.activityTitle, "Recent activity");

    this._pageHeading = page.getByRole("heading", { level: 1, name: pageTitle, exact: true });

    this._awaitingHeading = page.getByRole("heading", { level: 2, name: awaitingTitle, exact: true });
    // Badge aria-label observed live = "1 item pending" (singular "item", no literal "(s)"; plural likely "N items pending").
    // The i18nKeys note in the baseline ("{n} item(s) pending") describes the *source template*, not the literal
    // rendered string — never match "(s)" literally. Match digit + items?/item + pending instead.
    this._awaitingCountBadge = page.getByLabel(/\d+\s*items?\s*pending/i);

    this._hitlRows = page.locator('[data-slot="hitl-row"]');
    // Each row is wrapped by a Link → /task/{chatId}?focus... ; scope to the row to avoid nav links.
    this._hitlItemLink = page.locator('[data-slot="hitl-row"] a[href*="/task/"]').first();
    // Scoped to the first HITL row: the sidebar's "Recent" task list renders its own per-item
    // "More" buttons (Share/Rename/Delete menu) with the exact same accessible name "More".
    // An unscoped getByRole('button', { name: 'More' }).first() picks up the SIDEBAR's More button
    // (DOM-order first, since nav precedes main), opening the wrong dropdown — see e2e-flakiness-playbook.md.
    this._replyButton = this._hitlRows.first().getByRole("button", { name: replyLabel, exact: true });
    this._moreButton = this._hitlRows.first().getByRole("button", { name: moreLabel, exact: true });

    // Portaled DropdownMenuItem → role=menuitem.
    this._dismissMenuItem = page.getByRole("menuitem", { name: dismissLabel, exact: true });

    this._activityHeading = page.getByRole("heading", { level: 2, name: activityTitle, exact: true });
    // Inline empty: "No recent activity. {twinName} will post here as your channel or agents move."
    // twinName is interpolated (live data), so match on the stable leading + trailing phrases.
    this._activityEmptyText = page.getByText(/No recent activity\..*will post here as your channel or agents move/i);
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project; pulse namespace not in local messages). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ─────────────────────────────────────────────────────────────
  get pageHeading(): Locator { return this._pageHeading; }
  get awaitingHeading(): Locator { return this._awaitingHeading; }
  get awaitingCountBadge(): Locator { return this._awaitingCountBadge; }
  get hitlRows(): Locator { return this._hitlRows; }
  get hitlItemLink(): Locator { return this._hitlItemLink; }
  get replyButton(): Locator { return this._replyButton; }
  get moreButton(): Locator { return this._moreButton; }
  get dismissMenuItem(): Locator { return this._dismissMenuItem; }
  get activityHeading(): Locator { return this._activityHeading; }
  get activityEmptyText(): Locator { return this._activityEmptyText; }

  // ── Actions ──────────────────────────────────────────────────────────────────────
  /** Open the authenticated Pulse page. Auth is applied via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/pulse");
    // Wait for the h1, then a hydration-readiness proxy — this deployment ships an SSR skeleton
    // before React attaches handlers; interacting too early silently no-ops. See e2e-flakiness-playbook.md §19b.
    await this._pageHeading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Number of HITL pending rows currently rendered. */
  async hitlRowCount(): Promise<number> {
    return this._hitlRows.count();
  }

  /** Read the numeric pending-count shown in the HITL badge (throws if absent / non-numeric handled by caller). */
  async awaitingCountText(): Promise<string> {
    return (await this._awaitingCountBadge.textContent())?.trim() ?? "";
  }

  /**
   * Open the first HITL row's More dropdown (S0 → S1). Reveals the "Dismiss" menuitem.
   * NOTE: Dismiss is destructive (optimistic removal) — callers must NOT click it.
   */
  async openFirstRowMoreMenu(): Promise<void> {
    await this._moreButton.click();
    await this._dismissMenuItem.waitFor({ state: "visible", timeout: 10_000 });
  }

  /** Close the open More dropdown via Escape (S1 → S0) without triggering Dismiss. */
  async closeRowMenu(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await this._dismissMenuItem.waitFor({ state: "hidden", timeout: 10_000 });
  }
}
