// source: cdp
// baseline: test-cases/generated/page-baseline-activate.json
// generated: 2026-07-03T00:00:00Z
//
// Source: read from D:\code\mira
//   apps/mira-work/app/(auth)/activate/page.tsx
//     → server component: `const session = await getServerSession(); if (!session) redirect('/sign-in')`
//       fires BEFORE any /activate UI (ActivationForm / WaitlistApplyForm / WaitlistPendingForm)
//       or the ?hasCode / waitlist-status branch is evaluated.
//   apps/mira-work/app/(auth)/sign-in/page.tsx  (redirect target — landed-form assertions reuse SignInPage POM)
//
// Anonymous /activate is a pure server-redirect guard: there is NO /activate-specific DOM to
// model for an unauthenticated visitor — every anonymous hit terminates on /sign-in. This POM
// therefore only models NAVIGATION into /activate and the observation that it lands on /sign-in.
//
// Why navigation uses window.location.assign (NOT page.goto):
//   fixtures.ts installs an `auto` ensureAuthenticated fixture that wraps page.goto and, when a
//   NON-/sign-in target lands on /sign-in, treats it as an expired session and re-authenticates.
//   For the *expected* anonymous /activate→/sign-in guard redirect that is wrong: it would either
//   throw (no creds) or silently log the visitor in and defeat the anonymous scenario. A
//   browser-initiated location.assign is never intercepted, so we observe the raw guard redirect.

import type { Page } from "@playwright/test";
import type { I18n } from "../fixtures";

/** Matches the /sign-in URL (with or without trailing slash / query). */
export const SIGN_IN_URL = /\/sign-in(\b|\/|\?|$)/;

export class ActivatePage {
  readonly page: Page;
  private readonly i18n?: I18n;

  constructor(page: Page, i18n?: I18n) {
    this.page = page;
    this.i18n = i18n;
  }

  /**
   * Navigate to /activate (optionally with a query string) as the current
   * (anonymous, storageState-opted-out) session and wait until the auth guard
   * settles the browser on /sign-in.
   *
   * Starts from the public landing page ('/') so that (1) window.location has a
   * valid origin for the client-side assign, and (2) the final wait for /sign-in
   * proves a real transition occurred — the start URL is provably not /sign-in.
   *
   * @param query optional query string beginning with '?' (e.g. '?hasCode=true')
   */
  async gotoAnonymous(query = ""): Promise<void> {
    await this.page.goto("/");
    await this.page.waitForLoadState("domcontentloaded");

    const target = `/activate${query}`;
    await this.page.evaluate((t) => {
      window.location.assign(t);
    }, target);

    await this.page.waitForURL(SIGN_IN_URL, { timeout: 20_000 });
    await this.page.waitForLoadState("domcontentloaded");
  }
}
