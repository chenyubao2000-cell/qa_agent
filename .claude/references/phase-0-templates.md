# Phase 0 — Workspace Initialization Templates

> **Authoritative source for all config/fixtures templates** used by Phase 0 workspace initialization.
> Referenced by `.claude/references/phase-0-workspace-init.md` Steps 2d and 2e.
> Commands MUST NOT duplicate these templates inline.

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

config();

const AUTH_FILE = "playwright/.auth/user.json";

const hasAuth = !!(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

const testProjects = process.env.APP_LANGUAGES
  ? process.env.APP_LANGUAGES.split(',').map(lang => ({
      name: `e2e-${lang.trim().toLowerCase()}`,
      testDir: "./tests/e2e",
      testMatch: "**/testcases/**/*.test.ts",
      use: {
        ...devices["Desktop Chrome"],
        ...(hasAuth ? { storageState: AUTH_FILE } : {}),
        locale: { zh: 'zh-CN', 'zh-tw': 'zh-TW', ja: 'ja-JP', ko: 'ko-KR' }[lang.trim().toLowerCase()] || lang.trim().toLowerCase(),
        extraHTTPHeaders: { 'Cookie': `NEXT_LOCALE=${lang.trim().toLowerCase()}` },
      },
      ...(hasAuth ? { dependencies: ['setup'] } : {}),
    }))
  : [{
      name: "e2e",
      testDir: "./tests/e2e",
      testMatch: "**/testcases/**/*.test.ts",
      use: {
        ...devices["Desktop Chrome"],
        ...(hasAuth ? { storageState: AUTH_FILE } : {}),
      },
      ...(hasAuth ? { dependencies: ['setup'] } : {}),
    }];

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
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
    locale: process.env.APP_LANGUAGES?.split(',')[0]?.trim() === 'zh' ? 'zh-CN' : 'en-US',
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  // Setup project runs auth.setup.ts before all test projects.
  // Even for public-page-only test runs, setup still executes if hasAuth=true.
  // This is by design: setup is fast (~5s) and ensures auth state is fresh.
  // Public page tests opt out via test.use({ storageState: { cookies: [], origins: [] } }).
  projects: [
    ...(hasAuth ? [{ name: 'setup', testMatch: /auth\.setup\.ts/ }] : []),
    ...testProjects,
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

**With E2E_TEST_EMAIL** → auth is handled by setup project (auth.setup.ts), fixtures only provide i18n:

> **Dynamic imports**: Generate one `import` line per language in APP_LANGUAGES. Example below shows `APP_LANGUAGES=en,zh`. For `APP_LANGUAGES=en,fr,de`, generate `import enMessages from '../../messages/en.json'`, `import frMessages from '../../messages/fr.json'`, `import deMessages from '../../messages/de.json'` and matching entries in `i18nMessages`.

```typescript
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ── i18n fixture (auto-generated when APP_LANGUAGES is set) ──
// messages/ directory copied from source project to QA_WORKSPACE_DIR/messages/ by Phase 0 Step 2b-1
// IMPORTANT: Generate one import per language in APP_LANGUAGES, not hardcoded en/zh
import enMessages from '../../messages/en.json';
import zhMessages from '../../messages/zh.json';
// ^^^ Dynamic: for each lang in APP_LANGUAGES, generate: import {lang}Messages from '../../messages/{lang}.json';

const i18nMessages: Record<string, Record<string, any>> = {
  en: enMessages,
  zh: zhMessages,
  // ^^^ Dynamic: for each lang in APP_LANGUAGES, generate: {lang}: {lang}Messages,
};

export type I18n = { t: (key: string) => string; locale: string };

// ── Session guard: auto re-authenticate on expiry ──
// See: skills/playwright-script-generator/references/session-guard.md
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

export const test = base.extend<{ i18n: I18n; ensureAuthenticated: void }>({
  // Auto-fixture: intercepts page.goto to detect login redirects and re-authenticate
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

  i18n: [async ({}, use, testInfo) => {
    const locale = testInfo.project.name.replace('e2e-', '') || 'en';
    const dict = i18nMessages[locale] ?? i18nMessages['en'];
    const t = (key: string): string => {
      const parts = key.split('.');
      let val: any = dict;
      for (const p of parts) { val = val?.[p]; }
      return typeof val === 'string' ? val : key;
    };
    await use({ t, locale });
  }, { scope: 'worker' }],
});

export { expect };
```

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
