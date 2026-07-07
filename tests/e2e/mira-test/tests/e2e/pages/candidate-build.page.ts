// Page Object: Candidate Build — role-guard redirect (/candidate/build)
//
// Source: read from D:\code\mira
//   apps/mira-work/app/candidate/build/page.tsx (server component)
//     - lines 20-32: if (session.user.role === "consultant" || role === "employer") redirect("/task")
//       → the ROLE GUARD runs BEFORE BuildClient mounts and BEFORE the profile/rebuild branch.
//     - separately: if getProfile(userId) is truthy AND searchParams.rebuild !== "1" → redirect("/profile").
//   apps/mira-work/app/candidate/build/build-client.tsx  (empty|parsing|failed|confirm state machine)
//   apps/mira-work/app/candidate/build/build-empty.tsx   (LinkedIn-import-first empty state)
//   apps/mira-work/app/(agent)/task/task-index-content.tsx (redirect target: h1 = t("welcome") in "dashboard" ns)
//   messages/en.json → dashboard.welcome ("What can I do for you?")
//
// Observed reality (baseline page-baseline-candidate-build.json):
//   The authenticated test session resolves to a NON-candidate role (consultant/employer), so every
//   entry into /candidate/build is server-redirected to /task before any build UI renders. This POM
//   therefore models the redirect + its landing page (/task chat home), NOT the build wizard — which
//   is unreachable for this session. The build wizard's candidate.build.* namespace is NOT shipped in
//   the QA workspace messages/en.json, further confirming it never rendered here.
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name):
//   • Landing anchor is the /task welcome h1 (role=heading, level=1, i18n dashboard.welcome — a key
//     that DOES resolve in messages/en.json, so i18n.t is authoritative with an English fallback).
//   • hydration-readiness (playbook §19b): every goto waits for that heading visible, THEN networkidle —
//     this preview deployment SSRs the skeleton before React hydrates; asserting/interacting too early
//     can silently no-op. /task has only one-shot fetches (no polling) so networkidle is an adequate
//     settle signal. Authenticated page — runs with the default storageState (no auth opt-out).

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  welcome: "dashboard.welcome",
} as const;

export class CandidateBuildPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  /** Resolved text of the /task landing welcome heading (the guard's redirect target). */
  readonly welcomeTitle: string;

  private readonly _welcomeHeading: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this.welcomeTitle = this.t(KEYS.welcome, "What can I do for you?");
    this._welcomeHeading = page.getByRole("heading", { name: this.welcomeTitle, level: 1 });
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  /** The /task welcome h1 — visible only if the role guard landed us on the functional chat home. */
  get welcomeHeading(): Locator { return this._welcomeHeading; }

  // ── Navigation ────────────────────────────────────────────────────────────
  /**
   * Core goto: navigate to a /candidate/build URL and settle on wherever the server guard lands us.
   * For the consultant/employer session this is always /task. Applies the mandatory SSR-before-
   * hydration readiness guard (playbook §19b) against the landing heading.
   */
  private async gotoBuild(query: string): Promise<void> {
    await this.page.goto(`/candidate/build${query}`);
    // The role guard redirects server-side; the browser follows it and lands on /task. The welcome
    // heading is SSR-rendered instantly, but "visible" does NOT prove React has hydrated — wait for
    // the network to settle as a best-effort hydration-readiness proxy before asserting/interacting.
    await this._welcomeHeading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Bare visit → role guard → /task. */
  async goto(): Promise<void> {
    await this.gotoBuild("");
  }

  /** Rebuild deep-link (?rebuild=1) → still intercepted by the role guard → /task. */
  async gotoRebuild(): Promise<void> {
    await this.gotoBuild("?rebuild=1");
  }

  /** Visit with an arbitrary query string (e.g. "foo=bar") to prove the guard is query-agnostic. */
  async gotoWithQuery(query: string): Promise<void> {
    await this.gotoBuild(`?${query}`);
  }
}
