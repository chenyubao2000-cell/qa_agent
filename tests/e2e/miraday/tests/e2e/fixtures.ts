import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  LOCALE_NATIVE_NAMES,
  authFileForLocale,
  defaultLocale as computedDefaultLocale,
  toProjectLocale,
} from "./locale-map";
// Optional: project may already expose i18nRegex from ./i18n-helpers for cross-locale regexes.
// import { i18nRegex } from "./i18n-helpers";

// ── i18n fixture (auto-generated when APP_LANGUAGES is set) ──
import enMessages from '../../messages/en.json';

const i18nMessages: Record<string, Record<string, any>> = {
  en: enMessages,
};

export type I18n = { t: (key: string) => string; locale: string };

function localeFromProjectName(name: string): string {
  const m = /^(?:e2e|setup)-(.+)$/.exec(name);
  return m?.[1] ? toProjectLocale(m[1]) : computedDefaultLocale();
}

// Worker-scoped data-creation fixtures reuse the default-locale storage (data content is
// locale-agnostic — task prompts are usually the source language regardless of UI locale).
const WORKER_AUTH_FILE = authFileForLocale(computedDefaultLocale());

const SIGN_IN_PATH = "/sign-in";

async function reAuthenticate(
  page: Page,
  info: { authFile: string; targetLocale: string },
): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error("Session expired but no credentials in env");

  console.log("[session-guard] Session expired, re-authenticating...");
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.fill(email);
  const continueBtn = page.getByRole("button", { name: /^Continue$|^继续$|^Continuer$/i });
  await continueBtn.click({ timeout: 30_000 });
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
  await passwordInput.fill(password);
  await continueBtn.click({ timeout: 30_000 });
  await page.waitForURL("**/task**", { timeout: 60_000, waitUntil: "domcontentloaded" });

  // Re-apply UI locale so account preference stays aligned with the project locale.
  await ensureUiLocale(page, info.targetLocale).catch(() => {});

  await page.context().storageState({ path: info.authFile });
}

async function ensureUiLocale(page: Page, targetLocale: string): Promise<void> {
  const nativeName = LOCALE_NATIVE_NAMES[targetLocale];
  if (!nativeName) return;
  const currentLang = await page.locator("html").getAttribute("lang").catch(() => null);
  if (currentLang === targetLocale) return;

  // IMPORTANT: user-menu selector is app-specific — replace with the stable locator discovered
  // via CDP for the target project. Example for shadcn/Radix sidebar footer:
  const userMenuBtn = page
    .locator('[data-sidebar="footer"] [data-sidebar="menu-button"]')
    .first();
  if (!(await userMenuBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
  await userMenuBtn.click();

  // Language menuitem — prefer i18nRegex("common.language", "Layout.language") etc.,
  // fall back to first expandable menuitem inside the menu.
  const langItem = page.getByRole("menuitem", { name: /Language|语言|Langue|Sprache|言語|언어|Idioma|Lingua|Bahasa|ภาษา|Tiếng|Idioma/i });
  if (await langItem.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await langItem.first().click();
  } else {
    await page.locator('[role="menu"] [role="menuitem"][aria-haspopup="menu"]').first().click();
  }
  await page
    .getByRole("menuitemcheckbox", {
      name: new RegExp(`^${nativeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    })
    .click({ timeout: 10_000 });
  await page
    .waitForFunction((loc) => document.documentElement.lang === loc, targetLocale, { timeout: 15_000 })
    .catch(() => {});
}

export const test = base.extend<{ i18n: I18n; ensureAuthenticated: void }>({
  // Auto-fixture: intercepts page.goto to detect login redirects and re-authenticate
  // (including re-applying UI locale for the current project).
  ensureAuthenticated: [async ({ page }, use, testInfo) => {
    const targetLocale = localeFromProjectName(testInfo.project.name);
    const authFile = authFileForLocale(targetLocale);
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: any) => {
      // Default waitUntil to "domcontentloaded" — Next.js dev mode compiles on
      // first visit and the full "load" event can exceed 60s under parallel
      // workers. Tests that need full load can override via options.
      const mergedOptions = { waitUntil: "domcontentloaded" as const, ...(options || {}) };
      const response = await originalGoto(url, mergedOptions);
      const isSignInTarget = url.includes(SIGN_IN_PATH);
      if (!isSignInTarget && page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page, { authFile, targetLocale });
        return originalGoto(url, mergedOptions);
      }
      return response;
    };
    await use();
  }, { auto: true }],

  i18n: [async ({}, use, testInfo) => {
    const locale = localeFromProjectName(testInfo.project.name);
    const dict = i18nMessages[locale] ?? i18nMessages["en"];
    const t = (key: string): string => {
      const parts = key.split(".");
      let val: any = dict;
      for (const p of parts) { val = val?.[p]; }
      return typeof val === "string" ? val : key;
    };
    await use({ t, locale });
  }, { scope: "worker" }],
});

export { expect };
