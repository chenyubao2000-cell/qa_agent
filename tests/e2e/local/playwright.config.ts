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
  timeout: 120_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 5,
  outputDir: "./test-results",
  reporter: [
    ["list"],
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
