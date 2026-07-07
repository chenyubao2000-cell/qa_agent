// source: cdp
// baseline: test-cases/generated/page-baseline-billing-plans.json
// generated: 2026-07-03T00:00:00Z
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(billing)/billing/plans/page.tsx          (PlansPage — PlanCard, resolveButton)
//   apps/mira-work/features/billing/components/enterprise-card.tsx (EnterpriseCard)
//   apps/mira-work/features/billing/components/credit-pack-section.tsx (CreditPackSection, PackTile)
//   i18n namespaces: plans.* / packs.* / billing.* (source en/billing.json)
//
// Locator strategy (hasTestIds=false, dominantStrategy = role + name):
//   • No data-testid exists anywhere in PlansPage / EnterpriseCard / CreditPackSection — every
//     locator is role/name (Tailwind utility classes are decorative only, never used as selectors).
//   • Each plan card AND the Enterprise card render as <article> with an <h2> name → scope a card
//     via getByRole('article').filter({ hasText: <name> }); assert presence via the h2 heading.
//   • The credit-pack block is a <section aria-labelledby="credit-pack-title"> whose h2 text is
//     "Need more credits?" → role=region with that accessible name. The single "Buy" CTA and the 3
//     pack tiles (aria-pressed toggle buttons) live inside it.
//   • The plans.*/packs.* namespaces are NOT merged into this QA project's messages/en.json, so
//     i18n.t() returns the raw key. This is a single-locale ("en") deployment, so the source English
//     literals are used as t(key, fallback) fallbacks — identical to settings-skills.page.ts.
//   • SSR ships the static skeleton before React hydrates; goto() adds a hydration-readiness proxy
//     after the h1 is visible (flakiness-playbook §19b) — this deployment has a confirmed
//     SSR-before-hydration race on every page. networkidle also lets useBillingSubscription() settle
//     so CTA buttons render (not the loading Skeleton) before any assertion runs.
//   • SMOKE scope: Upgrade / Buy POST to /api/billing/* then redirect to a real Stripe checkout —
//     these are NEVER clicked; only their state (visible/enabled/pressed) is asserted.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

const KEYS = {
  title: "plans.title",
  back: "plans.back",
  mostPopular: "plans.mostPopular",
  yourPlan: "plans.yourPlan",
  upgrade: "plans.cta.upgrade",
  perMonth: "plans.perMonth",
  perSeatPerMonth: "plans.perSeatPerMonth",
  enterpriseCta: "plans.enterprise.cta",
  packSectionTitle: "packs.sectionTitle",
  packCta: "packs.cta",
} as const;

export class BillingPlansPage {
  readonly page: Page;
  private readonly i18n?: I18n;

  // ── Header ────────────────────────────────────────────────────────────────
  private readonly _heading: Locator;
  private readonly _backButton: Locator;

  // ── Plan cards (badges + Enterprise CTA) ────────────────────────────────────
  private readonly _upgradeButtons: Locator;
  private readonly _contactUsButton: Locator;
  private readonly _mostPopularBadge: Locator;
  private readonly _yourPlanBadge: Locator;

  // ── Credit pack section ─────────────────────────────────────────────────────
  private readonly _creditPackSection: Locator;
  private readonly _buyButton: Locator;

  // ── Enterprise contact page (navigation target) ──────────────────────────────
  private readonly _contactPageHeading: Locator;
  private readonly _contactSubmitButton: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    this._heading = page.getByRole("heading", {
      level: 1,
      name: this.t(KEYS.title, "Simple, transparent pricing"),
    });
    this._backButton = page.getByRole("button", { name: this.t(KEYS.back, "Back"), exact: true });

    // Free-tier account renders "Upgrade" on all 3 paid cards (Starter/Individual/Team).
    this._upgradeButtons = page.getByRole("button", { name: this.t(KEYS.upgrade, "Upgrade"), exact: true });
    this._contactUsButton = page.getByRole("button", { name: this.t(KEYS.enterpriseCta, "Contact us"), exact: true });

    // Radix Badge renders its label as plain text (Team card only, when not current plan).
    this._mostPopularBadge = page.getByText(this.t(KEYS.mostPopular, "Most Popular"), { exact: true });
    // "Your Plan" badge appears only for the active current plan — must be absent for a free account.
    this._yourPlanBadge = page.getByText(this.t(KEYS.yourPlan, "Your Plan"), { exact: true });

    // <section aria-labelledby="credit-pack-title"> → role=region, name = h2 text.
    this._creditPackSection = page.getByRole("region", {
      name: this.t(KEYS.packSectionTitle, "Need more credits?"),
    });
    this._buyButton = this._creditPackSection.getByRole("button", {
      name: this.t(KEYS.packCta, "Buy"),
      exact: true,
    });

    this._contactPageHeading = page.getByRole("heading", { name: /Contact Us For Enterprise Plan/i });
    this._contactSubmitButton = page.getByRole("button", { name: /^Submit$/i });
  }

  /** i18n-aware label resolver with an English fallback (single-locale "en" project). */
  private t(key: string, fallback: string): string {
    const v = this.i18n?.t(key);
    return v && v !== key ? v : fallback;
  }

  // ── Public getters ──────────────────────────────────────────────────────────
  get heading(): Locator { return this._heading; }
  get backButton(): Locator { return this._backButton; }
  get upgradeButtons(): Locator { return this._upgradeButtons; }
  get contactUsButton(): Locator { return this._contactUsButton; }
  get mostPopularBadge(): Locator { return this._mostPopularBadge; }
  get yourPlanBadge(): Locator { return this._yourPlanBadge; }
  get creditPackSection(): Locator { return this._creditPackSection; }
  get buyButton(): Locator { return this._buyButton; }
  get contactPageHeading(): Locator { return this._contactPageHeading; }
  get contactSubmitButton(): Locator { return this._contactSubmitButton; }

  /** A plan/Enterprise card scoped by its visible name (each card is an <article>). */
  planCard(name: string): Locator {
    return this.page.getByRole("article").filter({ hasText: name });
  }

  /** A plan card's level-2 heading (used to assert the card is present). */
  cardHeading(name: string): Locator {
    return this.page.getByRole("heading", { level: 2, name, exact: true });
  }

  /** The "Upgrade" CTA scoped to a specific paid card. */
  upgradeButtonFor(cardName: string): Locator {
    return this.planCard(cardName).getByRole("button", { name: this.t(KEYS.upgrade, "Upgrade"), exact: true });
  }

  /** A price value (e.g. "$20", "Custom") scoped inside a specific card. */
  cardPrice(cardName: string, priceText: string): Locator {
    return this.planCard(cardName).getByText(priceText, { exact: true });
  }

  /** A billing-period suffix (e.g. "/month", "/person/month") scoped inside a specific card. */
  cardSuffix(cardName: string, suffixText: string): Locator {
    return this.planCard(cardName).getByText(suffixText, { exact: true });
  }

  /** A credit-pack tile toggle button matched by its price/credits accessible name. */
  packTile(nameRegex: RegExp): Locator {
    return this._creditPackSection.getByRole("button", { name: nameRegex });
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  /** Open the authenticated pricing page. Auth applied via storageState/ensureAuthenticated. */
  async goto(): Promise<void> {
    await this.page.goto("/billing/plans");
    // §19b: wait for the h1, then a hydration-readiness proxy — SSR ships the skeleton before React
    // attaches handlers; networkidle also lets useBillingSubscription() resolve so CTA buttons
    // render (not the loading Skeleton) before assertions.
    await this._heading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  /** Select a credit-pack tile (enables the "Buy" CTA). Does NOT click Buy. */
  async selectPackTile(nameRegex: RegExp): Promise<void> {
    await this.packTile(nameRegex).click();
  }

  /** Click the Enterprise "Contact us" CTA and wait for the client-side navigation to complete. */
  async openEnterpriseContact(): Promise<void> {
    await this._contactUsButton.click();
    await this.page.waitForURL("**/billing/plans/contact", { timeout: 30_000 });
  }

  /** Count of currently-rendered "Upgrade" CTAs (== number of paid cards showing Upgrade). */
  async upgradeButtonCount(): Promise<number> {
    return this._upgradeButtons.count();
  }
}
