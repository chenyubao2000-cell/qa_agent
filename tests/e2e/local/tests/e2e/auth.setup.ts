import { test as setup, expect } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";

import {
  LOCALE_NATIVE_NAMES,
  authFileAbsolute,
  defaultLocale,
  toProjectLocale,
} from "./locale-map";

config();

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const AUTH_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

function localeFromProjectName(name: string): string {
  // `setup` (legacy single-locale) or `setup-<locale>` (per-locale).
  const m = /^setup(?:-(.+))?$/.exec(name);
  return m?.[1] ? toProjectLocale(m[1]) : defaultLocale();
}

// Localized "Continue" button labels (sign-in flow). Add more locales here as needed.
const CONTINUE_LABELS_REGEX = /^(Continue|继续|Continuer|Weiter|Continuar|Continua|Tiếp tục|계속|続行|ดำเนินการต่อ|Lanjut)$/i;

setup("authenticate", async ({ page }, testInfo) => {
  setup.setTimeout(180_000);
  const baseURL = (
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.PREVIEW_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    console.log("No test credentials configured, skipping auth setup.");
    return;
  }

  const targetLocale = localeFromProjectName(testInfo.project.name);
  const authFile = authFileAbsolute(PROJECT_ROOT, targetLocale);
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  // Reuse cached state when fresh AND cookie locale matches target.
  if (fs.existsSync(authFile)) {
    const stat = fs.statSync(authFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < AUTH_MAX_AGE_MS) {
      try {
        const state = JSON.parse(fs.readFileSync(authFile, "utf-8"));
        const localeCookie = state.cookies?.find(
          (c: any) => c.name === "NEXT_LOCALE",
        )?.value;
        if (state.cookies?.length > 0 && localeCookie === targetLocale) {
          console.log(
            `[auth:${targetLocale}] fresh state (${Math.round(ageMs / 60000)}m, NEXT_LOCALE=${localeCookie}) — reusing.`,
          );
          return;
        }
        console.log(
          `[auth:${targetLocale}] state cookie mismatch (NEXT_LOCALE=${localeCookie}), re-authenticating.`,
        );
      } catch {
        /* fall through to re-auth */
      }
    } else {
      console.log(
        `[auth:${targetLocale}] stale (${Math.round(ageMs / 60000)}m), re-authenticating.`,
      );
    }
  }

  await page.goto(`${baseURL}/sign-in`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });

  // Step 1: Enter email. The sign-in page has a sessionStorage-gated `restored`
  // state that delays form mount; explicitly wait for the email input.
  const emailInput = page.locator('input[type="email"], input#email').first();
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(email);

  const continueBtn = page.getByRole("button", { name: CONTINUE_LABELS_REGEX });
  // click() auto-waits for enabled state (actionability checks); more resilient
  // than toBeEnabled() + click() when hydration is slow.
  await continueBtn.first().click({ timeout: 30_000 });

  // Step 2: Enter password
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
  await passwordInput.fill(password);
  await continueBtn.first().click({ timeout: 30_000 });

  // Successful login lands on /task or (for users without a twin profile) on
  // /ai-twin/create — both are post-login URLs. Wait for either.
  await page.waitForURL(/\/(task|ai-twin\/create|workspace)/, {
    timeout: 90_000,
    waitUntil: "domcontentloaded",
  });
  console.log(`[auth:${targetLocale}] login successful as ${email}.`);

  // Step 2.5: Ensure twin profile exists. Without it, the server-side route guard
  // (computeRequiredMode) forces all /task/* and /ai-twin/create?mode=edit URLs
  // to render onboarding/migration, breaking every edit-mode + sidebar test.
  // Idempotent: API returns 409 PROFILE_ALREADY_EXISTS if already set, which we ignore.
  if (page.url().includes("/ai-twin/create")) {
    console.log(`[auth:${targetLocale}] no twin profile — creating via POST /api/twin/setup`);
    // Use in-page fetch so the request carries the same session cookie the page just acquired.
    // page.request.post in a fresh setup project does NOT yet share the page's cookies.
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/twin/setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "migration",
          twinName: "TestTwin",
          twinAvatarSource: "preset_female_a",
          twinPersonality: "default",
        }),
      });
      return { status: r.status, body: await r.text() };
    });
    if (result.status === 201) {
      console.log(`[auth:${targetLocale}] profile created.`);
    } else if (result.status === 409) {
      console.log(`[auth:${targetLocale}] profile already exists (409) — ok.`);
    } else {
      throw new Error(`[auth] Profile setup failed: ${result.status} ${result.body}`);
    }
    await page.goto(`${baseURL}/task`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }

  // Step 3: Switch UI locale to targetLocale (best-effort). Some pages crash on
  // first dev-server mount due to a Turbopack stale-cache issue — wrap in
  // try/catch so we don't fail auth if the menu can't be opened.
  await switchLocaleIfNeeded(page, targetLocale).catch((err) => {
    console.warn(`[auth:${targetLocale}] locale switch failed (best-effort): ${err.message}`);
  });

  await page.context().storageState({ path: authFile });
  console.log(`[auth:${targetLocale}] state saved → ${path.basename(authFile)}`);
});

async function switchLocaleIfNeeded(
  page: import("@playwright/test").Page,
  targetLocale: string,
): Promise<void> {
  const nativeName = LOCALE_NATIVE_NAMES[targetLocale];
  if (!nativeName) {
    console.log(
      `[auth:${targetLocale}] no native-name mapping — skipping locale switch.`,
    );
    return;
  }

  // Fast path: if html[lang] already matches AND NEXT_LOCALE cookie is set, do nothing.
  const currentHtmlLang = await page.locator("html").getAttribute("lang").catch(() => null);
  const currentCookie = (await page.context().cookies()).find((c) => c.name === "NEXT_LOCALE")?.value;
  if (currentHtmlLang === targetLocale && currentCookie === targetLocale) {
    console.log(`[auth:${targetLocale}] html[lang]=${currentHtmlLang}, cookie matches — skipping UI switch.`);
    return;
  }

  // Always set the cookie so subsequent navigations render in target locale.
  const url = new URL(page.url());
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: targetLocale,
      domain: url.hostname,
      path: "/",
      httpOnly: false,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);

  if (currentHtmlLang === targetLocale) {
    console.log(`[auth:${targetLocale}] html[lang]=${currentHtmlLang} — cookie persisted, no UI switch needed.`);
    return;
  }

  // Open user menu via stable data-testid.
  const userMenuBtn = page.locator('[data-testid="sidebar-user-button"]').first();
  const menuVisible = await userMenuBtn.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!menuVisible) {
    console.log(`[auth:${targetLocale}] sidebar user menu not visible — skipping UI switch (cookie set).`);
    return;
  }
  await userMenuBtn.click();
  await page.locator('[role="menu"]').first().waitFor({ state: "visible", timeout: 10_000 });

  // Click "Language" menuitem.
  const languageItem = page.getByRole("menuitem", {
    name: /^(Language|语言|Langue|Sprache|Idioma|Lingua|Bahasa|ภาษา|Tiếng Việt|언어|言語)$/i,
  });
  const langVisible = await languageItem.first().isVisible({ timeout: 5_000 }).catch(() => false);
  if (!langVisible) {
    await page
      .locator('[role="menu"] [role="menuitem"][aria-haspopup="menu"]')
      .first()
      .click();
  } else {
    await languageItem.first().click();
  }

  // Click native name of target locale.
  const localeItem = page.getByRole("menuitemcheckbox", {
    name: new RegExp(`^${escapeRegex(nativeName)}$`),
  });
  await localeItem.waitFor({ state: "visible", timeout: 10_000 });
  await localeItem.click();

  // Wait for page to reflect new locale.
  await page.waitForFunction(
    (loc) => document.documentElement.lang === loc,
    targetLocale,
    { timeout: 20_000 },
  );
  console.log(`[auth:${targetLocale}] locale switched via UI — html lang confirmed.`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
