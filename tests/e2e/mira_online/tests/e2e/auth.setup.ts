import { test as setup, expect } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";

import { i18nRegex as i18nPattern } from "./i18n-helpers";
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

setup("authenticate", async ({ page, browserName: _browserName }, testInfo) => {
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
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  // Step 1: Enter email
  await page.waitForTimeout(2000); // wait for React hydration
  const emailInput = page.locator("input#email").first();
  await emailInput.waitFor({ state: "visible", timeout: 15_000 });
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 20 });
  await page.waitForTimeout(500);

  const continueBtn = page.getByRole("button", {
    name: i18nPattern("auth.continueButton", { exact: true }),
  });
  await expect(continueBtn).toBeEnabled({ timeout: 15_000 });
  await continueBtn.click();

  // Step 2: Enter password
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
  await passwordInput.focus();
  await page.keyboard.type(password, { delay: 10 });
  await continueBtn.click({ timeout: 30_000 });

  await page.waitForURL("**/task**", {
    timeout: 90_000,
    waitUntil: "domcontentloaded",
  });
  console.log(`[auth:${targetLocale}] login successful as ${email}.`);

  // Step 3: Switch UI locale to targetLocale via user menu (server persists it to account prefs).
  await switchLocaleIfNeeded(page, targetLocale);

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

  // Fast path: if html[lang] already matches, server already renders target locale.
  // We also proactively persist NEXT_LOCALE cookie in the context so storageState carries it.
  const currentHtmlLang = await page.locator("html").getAttribute("lang").catch(() => null);
  if (currentHtmlLang === targetLocale) {
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
    console.log(`[auth:${targetLocale}] html[lang]=${currentHtmlLang} — cookie persisted, no UI switch needed.`);
    return;
  }

  // Open user menu (footer, sidebar). Prefer the button containing the user email; fall back to footer-menu-button.
  const email = process.env.E2E_TEST_EMAIL || "";
  const userMenuBtn = email
    ? page.locator(`button:has-text("${email}")`).first()
    : page.locator('[data-sidebar="footer"] [data-sidebar="menu-button"]').first();
  await userMenuBtn.waitFor({ state: "visible", timeout: 15_000 });
  await userMenuBtn.click();
  // Wait for the menu to mount
  await page.locator('[role="menu"]').first().waitFor({ state: "visible", timeout: 10_000 });

  // Click "Language" menuitem (first expandable item in the user menu).
  // i18n key is common.language / Layout.language (NOT UserMenu.language).
  const languageItem = page.getByRole("menuitem", {
    name: i18nPattern("common.language", "Layout.language"),
  });
  const langVisible = await languageItem
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  if (langVisible) {
    await languageItem.first().click();
  } else {
    await page
      .locator('[role="menu"] [role="menuitem"][aria-haspopup="menu"]')
      .first()
      .click();
  }

  // Click native name of target locale
  const localeItem = page.getByRole("menuitemcheckbox", {
    name: new RegExp(`^${escapeRegex(nativeName)}$`),
  });
  await localeItem.waitFor({ state: "visible", timeout: 10_000 });
  await localeItem.click();

  // Wait for page to reflect new locale (html[lang] + NEXT_LOCALE cookie).
  await page.waitForFunction(
    (loc) => document.documentElement.lang === loc,
    targetLocale,
    { timeout: 20_000 },
  );
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).find((c) => c.name === "NEXT_LOCALE")
          ?.value,
      { timeout: 15_000, intervals: [500, 1000] },
    )
    .toBe(targetLocale);

  console.log(`[auth:${targetLocale}] locale switched via UI — cookie + html lang confirmed.`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
