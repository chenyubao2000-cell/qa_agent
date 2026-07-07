// source: cdp
// baseline: test-cases/generated/page-baseline-calendar.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/calendar/page.tsx                              (CalendarRoute — route)
//   apps/mira-work/features/calendar/components/calendar-page.tsx             (view state machine, mounted guard)
//   apps/mira-work/features/calendar/components/calendar-header.tsx           (h1 + subtitle + Month/Agenda toggle + prev/next/today + New)
//   i18n namespace: agent → calendar.title / calendar.view.* / calendar.today / calendar.agenda.*
//
// Locator strategy (hasTestIds=false, dominantStrategy = aria-label + role/name; aria-pressed for toggle state):
//   • No data-testid exists anywhere in the calendar feature source — every locator is role/name/aria-label.
//   • The `agent` i18n namespace lives in a separate source file (agent.json) that is NOT merged into
//     this QA project's messages/en.json, so i18n.t() returns the raw key. This is a single-locale ("en")
//     deployment, so observed English CDP literals are used as fallbacks via t(key, fallback) — same
//     pattern as contacts.page.ts / home.page.ts.
//   • Month/Agenda/Today are stateful toggle buttons — selected state is exposed via aria-pressed, not a class.
//   • Month heading (h2) is Intl-formatted from the cursor date (formatDate(cursor, {month:'long', year:'numeric'})),
//     NOT an i18n key — assert against a runtime-computed label, never a hardcoded month string.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "calendar.title",
  viewMonth: "calendar.view.month",
  viewAgenda: "calendar.view.agenda",
  today: "calendar.today",
  prevMonth: "calendar.prevMonth",
  nextMonth: "calendar.nextMonth",
  newButton: "calendar.new",
  agendaEmpty: "calendar.agenda.empty",
} as const;

export class CalendarPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Header (S0) ───────────────────────────────────────────────────────────
  private readonly _heading: Locator;        // h1 "Calendar"
  private readonly _monthHeading: Locator;   // h2 "<Month> <Year>" (Intl-formatted cursor)
  private readonly _subtitle: Locator;       // "<Month Year> · N tasks · M sources"

  // ── View toggle (S0 ⇄ S2) ─────────────────────────────────────────────────
  private readonly _monthToggle: Locator;
  private readonly _agendaToggle: Locator;

  // ── Month navigation (S0 ⇄ S1) ────────────────────────────────────────────
  private readonly _prevMonthButton: Locator;
  private readonly _nextMonthButton: Locator;
  private readonly _todayButton: Locator;

  // ── New (event creation entry — destructive, not exercised) ────────────────
  private readonly _newButton: Locator;

  // ── Agenda empty state (S2) ────────────────────────────────────────────────
  private readonly _agendaEmptyText: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    const titleLabel = this.t(KEYS.title, "Calendar");
    const monthLabel = this.t(KEYS.viewMonth, "Month");
    const agendaLabel = this.t(KEYS.viewAgenda, "Agenda");
    const todayLabel = this.t(KEYS.today, "Today");
    const prevLabel = this.t(KEYS.prevMonth, "Previous month");
    const nextLabel = this.t(KEYS.nextMonth, "Next month");
    const newLabel = this.t(KEYS.newButton, "New");

    this._heading = page.getByRole("heading", { level: 1, name: titleLabel });
    this._monthHeading = page.getByRole("heading", { level: 2 });
    // Subtitle: "<Month Year> · N tasks · M sources" — match the stable "tasks · sources" tail.
    this._subtitle = page.getByText(/\d+\s+tasks?\s+·\s+\d+\s+sources?/);

    this._monthToggle = page.getByRole("button", { name: monthLabel, exact: true });
    this._agendaToggle = page.getByRole("button", { name: agendaLabel, exact: true });

    this._prevMonthButton = page.getByRole("button", { name: prevLabel, exact: true });
    this._nextMonthButton = page.getByRole("button", { name: nextLabel, exact: true });
    this._todayButton = page.getByRole("button", { name: todayLabel, exact: true });

    this._newButton = page.getByRole("button", { name: newLabel, exact: true });

    this._agendaEmptyText = page.getByText(this.t(KEYS.agendaEmpty, "No agenda yet"), { exact: false });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get monthHeading(): Locator { return this._monthHeading; }
  get subtitle(): Locator { return this._subtitle; }
  get monthToggle(): Locator { return this._monthToggle; }
  get agendaToggle(): Locator { return this._agendaToggle; }
  get prevMonthButton(): Locator { return this._prevMonthButton; }
  get nextMonthButton(): Locator { return this._nextMonthButton; }
  get todayButton(): Locator { return this._todayButton; }
  get newButton(): Locator { return this._newButton; }
  get agendaEmptyText(): Locator { return this._agendaEmptyText; }

  // ── Date helpers ──────────────────────────────────────────────────────────
  /**
   * Intl-formatted month label for the current real month + `offsetMonths`, matching the
   * source's formatDate(cursor, {month:'long', year:'numeric'}) (e.g. "July 2026").
   * Use to build date-robust assertions instead of hardcoded month strings.
   */
  monthLabel(offsetMonths = 0): string {
    const base = new Date();
    const d = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1);
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(d);
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Open the authenticated Calendar page. Auth via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/calendar");
    // Wait for the h1 to render, then a hydration-readiness proxy — this deployment ships the
    // SSR skeleton before React attaches handlers; interacting too early silently no-ops.
    // See e2e-flakiness-playbook.md §19b (applied proactively, per task instructions).
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Advance the month grid to the next month (S0 → S1). */
  async clickNextMonth(): Promise<void> {
    await this._nextMonthButton.click();
  }

  /** Step the month grid to the previous month. */
  async clickPrevMonth(): Promise<void> {
    await this._prevMonthButton.click();
  }

  /** Return the cursor to the real current month (S1 → S0). */
  async clickToday(): Promise<void> {
    await this._todayButton.click();
  }

  /** Switch to the Agenda view (S0 → S2). */
  async showAgenda(): Promise<void> {
    await this._agendaToggle.click();
  }

  /** Switch back to the Month view (S2 → S0). */
  async showMonth(): Promise<void> {
    await this._monthToggle.click();
  }
}
