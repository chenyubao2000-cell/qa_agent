// Page Object: Candidate Role selection (/candidate/role)
//
// Source: read from D:\code\mira
//   apps/mira-work/app/candidate/role/page.tsx
//     - mode = searchParams.switch === "1" ? "switch" : "welcome"  (strict equality on "1")
//   apps/mira-work/app/candidate/role/role-select-client.tsx
//     - useTranslations("candidate"); title = mode==="switch" ? role.switchTitle : role.welcome
//     - welcome: role.welcome "Welcome to Mira" + role.subtitle "Choose your role", NO close(X)
//     - switch : role.switchTitle "Switch role" + role.switchSubtitle "Choose the role to switch to",
//                close(X) button (aria-label role.close "Close", onClick router.back())
//     - 3 RoleCards: consultant(Agency)/candidate(Job Seeker) interactive; employer(Employer) disabled
//     - Each card: mobile full-card overlay <button aria-label={title}> (md:hidden) + desktop CTA
//       <button>{cta}</button> ("hidden ... md:inline-flex"). On the default desktop viewport only
//       the 3 desktop "Get started" CTAs are in the a11y tree; the md:hidden overlay buttons are not.
//       Employer CTA carries the native disabled attribute.
//   i18n keys live under the "candidate" namespace (candidate.role.*). NOTE: the QA workspace
//   messages/en.json does NOT ship the candidate namespace, so i18n.t("candidate.role.*") returns
//   the raw key — resolve every label via t(key, fallback) with the real English source value.
//
// Locator strategy (hasTestIds=false, dominantStrategy=role+name):
//   • No data-testid anywhere. h1 heading via role+level; card titles/subtitle via getByText;
//     CTAs via getByRole button name "Get started" (+ nth for the 3 same-labelled desktop CTAs);
//     close(X) via getByRole button name = role.close aria-label.
//   • Authenticated page — specs run with the default storageState (do NOT opt out of auth).

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  welcome: "candidate.role.welcome",
  switchTitle: "candidate.role.switchTitle",
  subtitle: "candidate.role.subtitle",
  switchSubtitle: "candidate.role.switchSubtitle",
  close: "candidate.role.close",
  consultantTitle: "candidate.role.consultant.title",
  candidateTitle: "candidate.role.candidate.title",
  employerTitle: "candidate.role.employer.title",
  cta: "candidate.role.consultant.cta", // all three CTAs share the same label ("Get started")
} as const;

export class CandidateRolePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // Resolved label text (i18n if the key is present, otherwise the source English fallback).
  readonly welcomeTitle: string;
  readonly switchTitle: string;
  readonly welcomeSubtitle: string;
  readonly switchSubtitle: string;
  readonly closeLabel: string;
  readonly consultantTitle: string;
  readonly candidateTitle: string;
  readonly employerTitle: string;
  readonly ctaLabel: string;

  private readonly _heading: Locator;
  private readonly _closeButton: Locator;
  private readonly _cta: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this.welcomeTitle = this.t(KEYS.welcome, "Welcome to Mira");
    this.switchTitle = this.t(KEYS.switchTitle, "Switch role");
    this.welcomeSubtitle = this.t(KEYS.subtitle, "Choose your role");
    this.switchSubtitle = this.t(KEYS.switchSubtitle, "Choose the role to switch to");
    this.closeLabel = this.t(KEYS.close, "Close");
    this.consultantTitle = this.t(KEYS.consultantTitle, "Agency");
    this.candidateTitle = this.t(KEYS.candidateTitle, "Job Seeker");
    this.employerTitle = this.t(KEYS.employerTitle, "Employer");
    this.ctaLabel = this.t(KEYS.cta, "Get started");

    // Single <h1>; its text is welcomeTitle or switchTitle depending on entry mode.
    this._heading = page.getByRole("heading", { level: 1 });
    this._closeButton = page.getByRole("button", { name: this.closeLabel });
    // The 3 desktop CTA buttons (consultant nth0, jobSeeker nth1, employer nth2). The md:hidden
    // mobile overlay buttons (aria-label = card title) are excluded from the a11y tree on desktop.
    this._cta = page.getByRole("button", { name: this.ctaLabel });
  }

  /** i18n-aware label resolver with an English fallback (single-locale project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get closeButton(): Locator { return this._closeButton; }
  get welcomeSubtitleText(): Locator { return this.page.getByText(this.welcomeSubtitle, { exact: true }); }
  get switchSubtitleText(): Locator { return this.page.getByText(this.switchSubtitle, { exact: true }); }
  get consultantTitleText(): Locator { return this.page.getByText(this.consultantTitle, { exact: true }); }
  get candidateTitleText(): Locator { return this.page.getByText(this.candidateTitle, { exact: true }); }
  get employerTitleText(): Locator { return this.page.getByText(this.employerTitle, { exact: true }); }
  /** All desktop "Get started" CTA buttons (expected count 3). */
  get ctaButtons(): Locator { return this._cta; }
  /** Agency/Consultant card desktop CTA (interactive). */
  get consultantCta(): Locator { return this._cta.nth(0); }
  /** Job Seeker/Candidate card desktop CTA (interactive). */
  get jobSeekerCta(): Locator { return this._cta.nth(1); }
  /** Employer card desktop CTA (permanently disabled). */
  get employerCta(): Locator { return this._cta.nth(2); }

  // ── Navigation ────────────────────────────────────────────────────────────
  /** Core goto with the mandatory SSR-before-hydration readiness guard (playbook §19b). */
  private async gotoPath(pathSuffix: string): Promise<void> {
    await this.page.goto(`/candidate/role${pathSuffix}`);
    // Heading is SSR-rendered instantly; "visible" does NOT prove React has hydrated. This preview
    // deployment has a confirmed SSR-before-hydration race on every page — wait for the network to
    // settle as a best-effort hydration-readiness proxy before asserting/interacting.
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Bare visit → welcome (first-onboarding) mode. */
  async gotoWelcome(): Promise<void> {
    await this.gotoPath("");
  }

  /** Visit with ?switch=1 → switch (role-switching) mode. */
  async gotoSwitch(): Promise<void> {
    await this.gotoPath("?switch=1");
  }

  /** Visit with an arbitrary switch query value (e.g. "?switch=0") to exercise the strict-equality fallback. */
  async gotoWithSwitchQuery(value: string): Promise<void> {
    await this.gotoPath(`?switch=${encodeURIComponent(value)}`);
  }
}
