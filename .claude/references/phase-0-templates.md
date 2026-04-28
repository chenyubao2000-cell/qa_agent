# Phase 0 — Workspace Initialization Templates

> **Authoritative source for all config/fixtures templates** used by Phase 0 workspace initialization.
> Referenced by `.claude/references/phase-0-workspace-init.md` Steps 2d and 2e.
> Commands MUST NOT duplicate these templates inline.

## Multi-locale Design Overview

> This section explains **why** the templates below are structured as "per-locale" when `APP_LANGUAGES` has ≥1 entry. Read before modifying any template.

The canonical way for Next.js + `next-intl` apps to pick a locale is the `NEXT_LOCALE` cookie. However many apps **persist the user's account-preference locale** and the server re-writes `Set-Cookie: NEXT_LOCALE=<accountPref>` on every authenticated request. This means `extraHTTPHeaders.Cookie` sent by Playwright is overwritten after the first round-trip, and a shared `storageState` file pollutes cross-locale projects.

The only stable solution is **per-locale storageState**:

- One `setup-${locale}` project per locale → each logs in then switches UI language via the user menu (so the server updates account pref + Set-Cookie in agreement)
- One `user.${locale}.json` storage file per locale → test project binds to its own
- `data-setup` (locale-agnostic data creation) depends on the **default locale** setup only
- Session guard in `fixtures.ts` re-authenticates **and re-applies** UI locale so mid-run session expiry doesn't regress to account default

All templates below implement this pattern. Single-locale projects fall back to `setup-${defaultLocale}` naturally.

## locale-map.ts Template (write once when APP_LANGUAGES is set)

Generate at `$QA_WORKSPACE_DIR/tests/e2e/locale-map.ts`. Shared helpers for all templates below.

```typescript
import path from "node:path";

// Native names used by the app's language switcher UI. Extend for new locales.
export const LOCALE_NATIVE_NAMES: Record<string, string> = {
  en: "English",
  zh: "简体中文",
  "zh-tw": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ms: "Bahasa Melayu",
  pt: "Português",
  th: "ภาษาไทย",
  vi: "Tiếng Việt",
};

// Playwright locale strings (BCP-47). Only override where tag differs from .env value.
export const PLAYWRIGHT_LOCALE: Record<string, string> = {
  zh: "zh-CN",
  "zh-tw": "zh-TW",
  ja: "ja-JP",
  ko: "ko-KR",
};

export function toProjectLocale(raw: string): string {
  return raw.trim().toLowerCase();
}

export function authFileForLocale(locale: string): string {
  return path.join("playwright", ".auth", `user.${locale}.json`);
}

export function authFileAbsolute(projectRoot: string, locale: string): string {
  return path.join(projectRoot, "playwright", ".auth", `user.${locale}.json`);
}

export function defaultLocale(): string {
  const list = (process.env.APP_LANGUAGES || "")
    .split(",")
    .map(toProjectLocale)
    .filter(Boolean);
  return list[0] || "en";
}
```

> **Extension policy**: to support a new locale, add its entry to `LOCALE_NATIVE_NAMES` (must exactly match the text shown in the app's language menu). All other templates pick it up automatically.

---

## playwright.config.ts Template

**Upgrade logic**: If file exists, check whether it needs upgrading:
1. `APP_LANGUAGES` is set AND config has no per-language projects (no `e2e-en`/`e2e-zh`) → **regenerate** with multi-project config
2. `APP_LANGUAGES` is set AND config already has per-language projects → **skip** (already correct)
3. `APP_LANGUAGES` is NOT set → **skip** if file exists

```bash
# Pseudo-check:
if file exists AND APP_LANGUAGES is set:
  Grep for "e2e-${firstLang}" in playwright.config.ts
  If NOT found → regenerate (upgrade to multi-project)
  If found → skip
```

```typescript
import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import {
  PLAYWRIGHT_LOCALE,
  authFileForLocale,
  defaultLocale as defaultLocaleFn,
  toProjectLocale,
} from "./tests/e2e/locale-map";

config();

const hasAuth = !!(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

const locales = (process.env.APP_LANGUAGES || "")
  .split(",")
  .map(toProjectLocale)
  .filter(Boolean);

const defaultLocale = locales[0] || defaultLocaleFn();

// Per-locale setup projects (each authenticates + switches UI language via user menu).
const setupProjects = hasAuth
  ? (locales.length > 0 ? locales : [defaultLocale]).map((loc) => ({
      name: `setup-${loc}`,
      testMatch: /auth\.setup\.ts/,
      use: {
        locale: PLAYWRIGHT_LOCALE[loc] || loc,
        extraHTTPHeaders: { Cookie: `NEXT_LOCALE=${loc}` },
      },
    }))
  : [];

// Per-locale test projects — each binds to its own storageState + setup project.
// Strategy: the DEFAULT locale runs the full suite; non-default locales run only
// `@smoke` tests (intersection with any --grep). Rationale: business logic is
// locale-agnostic so covering it once in the default locale is enough; the
// secondary locales only need to prove the infra (per-locale auth / i18n
// rendering / locale cookie) still works. For deep i18n coverage run
// `/qa-i18n-audit` — not full regression on every locale.
const testProjects = locales.length > 0
  ? locales.map((loc) => ({
      name: `e2e-${loc}`,
      testDir: "./tests/e2e",
      testMatch: "**/testcases/**/*.test.ts",
      use: {
        ...devices["Desktop Chrome"],
        ...(hasAuth ? { storageState: authFileForLocale(loc) } : {}),
        locale: PLAYWRIGHT_LOCALE[loc] || loc,
        extraHTTPHeaders: { Cookie: `NEXT_LOCALE=${loc}` },
      },
      ...(loc === defaultLocale ? {} : { grep: /@smoke/ }),
      ...(hasAuth ? { dependencies: [`setup-${loc}`] } : {}),
    }))
  : [
      {
        name: "e2e",
        testDir: "./tests/e2e",
        testMatch: "**/testcases/**/*.test.ts",
        use: {
          ...devices["Desktop Chrome"],
          ...(hasAuth ? { storageState: authFileForLocale(defaultLocale) } : {}),
        },
        ...(hasAuth ? { dependencies: [`setup-${defaultLocale}`] } : {}),
      },
    ];

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 5,
  outputDir: "./test-results",
  reporter: [
    ["json", { outputFile: "tests/reports/playwright-results.json" }],
    ["html", { open: "never" }],
  ],
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || process.env.PREVIEW_URL || "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    locale: PLAYWRIGHT_LOCALE[defaultLocale] || defaultLocale || "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  // Pipeline: setup-<loc>(auth) → data-setup(serial data creation, bound to defaultLocale)
  //         → e2e-<loc>(N workers per locale)
  projects: [
    ...setupProjects,
    {
      name: "data-setup",
      testMatch: /data\.setup\.ts/,
      timeout: 20 * 60_000,
      use: {
        ...(hasAuth ? { storageState: authFileForLocale(defaultLocale) } : {}),
      },
      ...(hasAuth ? { dependencies: [`setup-${defaultLocale}`] } : {}),
    },
    ...testProjects.map((p) => ({
      ...p,
      ...(hasAuth ? { dependencies: [...(p.dependencies || []), "data-setup"] } : {}),
    })),
  ],
});
```

> **Configuration notes**:
> - `reporter`: Always outputs JSON (consumed by report-analyzer) + HTML (for manual review). Do NOT use `--reporter` CLI override — it would replace this config and lose the JSON file output
> - `headless`: Controlled by environment variable, defaults to true. Control via `.env`'s `PLAYWRIGHT_HEADLESS`
> - `retries`: Retry once in CI to reduce flaky false positives; no retries locally for fast failure exposure
> - `trace` + `video`: Retained on failure for debugging. `on-first-retry` is inferior to `retain-on-failure` (preserves evidence without requiring a retry)
> - `locale`: Dynamically inferred — uses first language when APP_LANGUAGES is set, defaults to `en-US` otherwise. Each language project sets locale independently.
> - `outputDir`: Explicitly specified to prevent artifacts from scattering
> - `expect.timeout`: Default 5s is too short for remote environments, set to 10s
> - `workers`: CI=3, local=5. 10 workers overwhelms single-instance preview servers, causing page-load timeouts
> - `data-setup` project: Serial pre-creation of expensive test data. See `.claude/references/test-data-setup.md`
> - Test projects depend on `setup-${locale}` + `data-setup`. `data-setup` itself depends on `setup-${defaultLocale}` (data content is locale-agnostic, so one session is enough). Chain: `setup-<defaultLocale>` → `data-setup` → `e2e-<locale>`; other `setup-<locale>` run in parallel with `data-setup`.
> - **Multi-locale design**: see "Multi-locale Design Overview" at the top of this file for the why (server Set-Cookie overrides extraHTTPHeaders → need per-locale storageState).

---

## fixtures.ts Template

**Upgrade logic**: If file exists, check whether it needs upgrading:
1. `APP_LANGUAGES` is set AND fixtures.ts does NOT contain `export type I18n` → **regenerate** with i18n fixture
2. `APP_LANGUAGES` is set AND fixtures.ts already contains `export type I18n` → **skip** (already correct)
3. `APP_LANGUAGES` is NOT set → **skip** if file exists

```bash
# Pseudo-check:
if file exists AND APP_LANGUAGES is set:
  Grep for "export type I18n" in fixtures.ts
  If NOT found → regenerate (upgrade to add i18n fixture)
  If found → skip
```

### With APP_LANGUAGES — fixtures.ts with i18n fixture

**With E2E_TEST_EMAIL** → auth is handled by per-locale `setup-${locale}` projects (auth.setup.ts); fixtures only provide i18n + per-locale session guard.

> **Dynamic imports**: Generate one `import` line per language in APP_LANGUAGES. Example below shows `APP_LANGUAGES=en,zh`. For `APP_LANGUAGES=en,fr,de`, add `import frMessages from '../../messages/fr.json'`, etc.

```typescript
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
import zhMessages from '../../messages/zh.json';
// ^^^ Dynamic: for each lang in APP_LANGUAGES, generate: import {lang}Messages from '../../messages/{lang}.json';

const i18nMessages: Record<string, Record<string, any>> = {
  en: enMessages,
  zh: zhMessages,
  // ^^^ Dynamic: for each lang in APP_LANGUAGES, generate: {lang}: {lang}Messages,
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
      const response = await originalGoto(url, options);
      const isSignInTarget = url.includes(SIGN_IN_PATH);
      if (!isSignInTarget && page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page, { authFile, targetLocale });
        return originalGoto(url, options);
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
```

> **Worker-scope data-creation fixtures** should pass `{ authFile: WORKER_AUTH_FILE, targetLocale: computedDefaultLocale() }` when calling `reAuthenticate()` — they create locale-agnostic data under the default-locale session.

> **Session guard**: `ensureAuthenticated` is an `auto: true` fixture — every test gets it without explicit destructuring. It patches `page.goto` to detect redirects to `/sign-in` and re-authenticates automatically. See `references/session-guard.md` for details.
> **Worker-scope fixtures** that create their own context must check `page.url().includes('/sign-in')` after navigation and call `reAuthenticate(page)` manually — they don't get the auto-fixture.
> **Auth is handled by config**: `storageState` is declared in playwright.config.ts projects, and setup project runs auth.setup.ts before all tests.
> Tests use `{ page, i18n }` — `page` is already authenticated via config storageState, with session guard as safety net.
> **Public page tests** (sign-in, forgot-password etc.) opt out with `test.use({ storageState: { cookies: [], origins: [] } })`.

### Without APP_LANGUAGES — minimal fixtures.ts (still includes session guard when E2E_TEST_EMAIL is set)

```typescript
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ── Session guard (when E2E_TEST_EMAIL is set) ──
const AUTH_FILE = 'playwright/.auth/user.json';
const SIGN_IN_PATH = '/sign-in';

async function reAuthenticate(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) throw new Error('Session expired but no credentials in env');
  console.log('[session-guard] Session expired, re-authenticating...');
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(email);
  const continueBtn = page.getByRole('button', { name: /^Continue$|^继续$/i });
  await continueBtn.click({ timeout: 30_000 });
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
  await passwordInput.fill(password);
  await continueBtn.click({ timeout: 30_000 });
  await page.waitForURL('**/task**', { timeout: 60_000 });
  console.log('[session-guard] Re-authentication successful');
  await page.context().storageState({ path: AUTH_FILE });
}

export const test = base.extend<{ ensureAuthenticated: void }>({
  ensureAuthenticated: [async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: any) => {
      const response = await originalGoto(url, options);
      if (page.url().includes(SIGN_IN_PATH)) {
        await reAuthenticate(page);
        return originalGoto(url, options);
      }
      return response;
    };
    await use();
  }, { auto: true }],
});
export { expect };
```

> When E2E_TEST_EMAIL is NOT set (public-only pages), omit session guard entirely:
> ```typescript
> import { test, expect } from "@playwright/test";
> export { test, expect };
> ```

> **auth.setup.ts is not generated at this point** — it requires Phase 1 CDP exploration of the login page to write with verified real selectors.
> **Pre-check**: If `E2E_TEST_EMAIL` is set but `auth.setup.ts` does not exist at `$QA_WORKSPACE_DIR/tests/e2e/auth.setup.ts`, log a WARNING: "Auth credentials configured but auth.setup.ts not found. It will be generated when CDP encounters a login wall in Phase 1. If the initial URL is a public page, auth.setup.ts may not be created — run /qa-explore on a protected page to trigger generation."

---

## auth.setup.ts Template (multi-locale, when APP_LANGUAGES is set)

> **When to use**: multi-locale projects (`APP_LANGUAGES` has ≥1 entry) **must** use this template. Single-locale projects may keep the legacy single-file template below (backwards compatible — `setup-${defaultLocale}` still runs).
>
> **Generation trigger**: normally written by `/qa-explore` Phase 1 upon login-wall detection with **CDP-discovered** selectors. Do not hand-write login selectors.

```typescript
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
const AUTH_MAX_AGE_MS = 30 * 60 * 1000; // 30 min

function localeFromProjectName(name: string): string {
  // `setup` (legacy) or `setup-<locale>`
  const m = /^setup(?:-(.+))?$/.exec(name);
  return m?.[1] ? toProjectLocale(m[1]) : defaultLocale();
}

setup("authenticate", async ({ page }, testInfo) => {
  setup.setTimeout(180_000);
  const baseURL = (process.env.PLAYWRIGHT_BASE_URL || process.env.PREVIEW_URL || "http://localhost:3000").replace(/\/+$/, "");
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) return;

  const targetLocale = localeFromProjectName(testInfo.project.name);
  const authFile = authFileAbsolute(PROJECT_ROOT, targetLocale);
  if (!fs.existsSync(path.dirname(authFile))) fs.mkdirSync(path.dirname(authFile), { recursive: true });

  // Reuse cached state when fresh AND NEXT_LOCALE matches target.
  if (fs.existsSync(authFile)) {
    const ageMs = Date.now() - fs.statSync(authFile).mtimeMs;
    if (ageMs < AUTH_MAX_AGE_MS) {
      try {
        const state = JSON.parse(fs.readFileSync(authFile, "utf-8"));
        const cookieLocale = state.cookies?.find((c: any) => c.name === "NEXT_LOCALE")?.value;
        if (state.cookies?.length > 0 && cookieLocale === targetLocale) {
          console.log(`[auth:${targetLocale}] fresh state reused.`);
          return;
        }
      } catch { /* fall through */ }
    }
  }

  // 1) Full login — replace selectors below with CDP-verified ones from /qa-explore Phase 1.
  await page.goto(`${baseURL}/sign-in`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(2000);
  const emailInput = page.locator("input#email").first();
  await emailInput.click();
  await emailInput.pressSequentially(email, { delay: 20 });
  const continueBtn = page.getByRole("button", { name: i18nPattern("auth.continueButton", { exact: true }) });
  await expect(continueBtn).toBeEnabled({ timeout: 15_000 });
  await continueBtn.click();
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: 15_000 });
  await passwordInput.focus();
  await page.keyboard.type(password, { delay: 10 });
  await continueBtn.click({ timeout: 30_000 });
  await page.waitForURL("**/task**", { timeout: 90_000, waitUntil: "domcontentloaded" });

  // 2) Ensure UI locale matches target → persists account preference server-side.
  await switchLocaleIfNeeded(page, targetLocale);

  // 3) Save per-locale storage
  await page.context().storageState({ path: authFile });
  console.log(`[auth:${targetLocale}] state saved → ${path.basename(authFile)}`);
});

async function switchLocaleIfNeeded(page: import("@playwright/test").Page, targetLocale: string) {
  const nativeName = LOCALE_NATIVE_NAMES[targetLocale];
  if (!nativeName) return;

  // Fast path: if html[lang] matches, just persist the NEXT_LOCALE cookie.
  const currentLang = await page.locator("html").getAttribute("lang").catch(() => null);
  if (currentLang === targetLocale) {
    const url = new URL(page.url());
    await page.context().addCookies([{
      name: "NEXT_LOCALE", value: targetLocale, domain: url.hostname, path: "/",
      httpOnly: false, secure: url.protocol === "https:", sameSite: "Lax",
    }]);
    return;
  }

  // Open user menu. Prefer button matching the email text (locale-stable).
  const email = process.env.E2E_TEST_EMAIL || "";
  const userMenuBtn = email
    ? page.locator(`button:has-text("${email}")`).first()
    : page.locator('[data-sidebar="footer"] [data-sidebar="menu-button"]').first();
  await userMenuBtn.waitFor({ state: "visible", timeout: 15_000 });
  await userMenuBtn.click();
  await page.locator('[role="menu"]').first().waitFor({ state: "visible", timeout: 10_000 });

  // Language menuitem — use i18n key(s) that exist in messages/*.json for this project.
  // (E.g. Mira uses `common.language` / `Layout.language` — NOT `UserMenu.language`.)
  const langItem = page.getByRole("menuitem", { name: i18nPattern("common.language", "Layout.language") });
  if (await langItem.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await langItem.first().click();
  } else {
    // Fallback: first expandable menuitem inside the user menu
    await page.locator('[role="menu"] [role="menuitem"][aria-haspopup="menu"]').first().click();
  }

  // Click native name of target locale
  await page.getByRole("menuitemcheckbox", {
    name: new RegExp(`^${nativeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  }).click({ timeout: 10_000 });

  // Confirm html lang + cookie
  await page.waitForFunction((loc) => document.documentElement.lang === loc, targetLocale, { timeout: 20_000 });
  await expect.poll(
    async () => (await page.context().cookies()).find((c) => c.name === "NEXT_LOCALE")?.value,
    { timeout: 15_000, intervals: [500, 1000] },
  ).toBe(targetLocale);
}
```

> **Key assumptions**:
> 1. App has a user menu → "Language" submenu → checkable items with native language name (standard shadcn/Radix DropdownMenu pattern).
> 2. Server persists locale as account preference after UI switch (typical `next-intl` + BetterAuth/NextAuth setups).
> 3. `messages/*.json` has the i18n key used for the "Language" label. Adjust the key names in `switchLocaleIfNeeded` to match your project (grep with CDP — see `i18n-locator-rules.md` D4).

---

## Copy Static Test Data Files (Step 2f)

Copy test data fixture files from qa-platform to the target project. Only copy files that don't already exist (preserve user customizations):

```
Source: <qa-platform-dir>/tests/e2e/fixtures/files/*
Target: $QA_WORKSPACE_DIR/tests/e2e/test-data/files/

Files: sample.png, sample.jpg, sample.pdf, sample.csv, sample.xlsx, sample.txt, empty.txt, oversized-6mb.bin
```

```bash
# Copy each static file only if it doesn't exist in target
for f in <qa-platform-dir>/tests/e2e/fixtures/files/*; do
  target="$QA_WORKSPACE_DIR/tests/e2e/test-data/files/$(basename $f)"
  [ ! -f "$target" ] && cp "$f" "$target"
done

# Generate oversized test file dynamically (not stored in repo due to size)
if [ ! -f "$QA_WORKSPACE_DIR/tests/e2e/test-data/files/oversized-6mb.bin" ]; then
  node -e "require('fs').writeFileSync('$QA_WORKSPACE_DIR/tests/e2e/test-data/files/oversized-6mb.bin', Buffer.alloc(6*1024*1024, 0x41))"
fi
```

> These files are referenced by generated specs when handoff entries use `file.*` dataTypes (see `skills/playwright-script-generator/SKILL.md` §0d). Without them, file upload tests will fail with "file not found". The oversized file is generated dynamically to avoid bloating the qa-platform repository.
