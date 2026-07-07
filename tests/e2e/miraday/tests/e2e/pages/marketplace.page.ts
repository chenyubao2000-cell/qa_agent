// source: cdp
// baseline: test-cases/generated/page-baseline-marketplace.json
// generated: 2026-07-03T00:00:00Z
// adapted-for: https://mira.day/ (production) — see marketplace-cdp.test.ts header for why.
//
// Source (read from D:\code\mira):
//   apps/mira-work/app/(agent)/marketplace/page.tsx (MarketplacePage — server gate: isSkillEnabledForUser)
//
// On production, this test account fails the isSkillEnabledForUser gate and is server-redirected
// to /settings/skills before any marketplace UI renders — confirmed live via CDP (consistent across
// repeated navigations, not a flake). This differs from the Railway preview this suite was
// originally built against, where the gate's redirect target was a dead /settings route (404 bug).
// On production the redirect target is a real, working page — so this POM now models the GUARD
// behavior (redirect + landing page sanity), not the marketplace content itself, which this
// account cannot reach here.

import type { Locator, Page } from "@playwright/test";
import type { I18n } from "../fixtures";

export const SETTINGS_SKILLS_URL = /\/settings\/skills/;

export class MarketplacePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  private readonly _redirectHeading: Locator;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;

    // Landing page after the gate redirect: /settings/skills renders an "All Skills" heading.
    this._redirectHeading = page.getByRole("heading", { level: 1, name: "All Skills" });
  }

  get redirectHeading(): Locator { return this._redirectHeading; }

  /** Navigate to /marketplace — this account's session fails the skill-access gate and is
   * server-redirected elsewhere before any marketplace UI mounts. */
  async goto(): Promise<void> {
    await this.page.goto("/marketplace");
    await this._redirectHeading.waitFor({ state: "visible", timeout: 20_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }
}
