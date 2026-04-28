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

// Per-locale setup projects (each authenticates + switches UI language).
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

// Per-locale test projects. DEFAULT locale runs full suite; non-default runs @smoke only.
// Deep i18n coverage should go through /qa-i18n-audit, not regression.
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
  timeout: 3 * 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 0 : 0,
  workers: process.env.CI ? 3 : 5,
  outputDir: "./test-results",
  reporter: [
    ["json", { outputFile: "tests/reports/playwright-results.json" }],
    ["html", { open: "never" }],
  ],
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || process.env.PREVIEW_URL || "http://localhost:3000",
    viewport: { width: 1280, height: 720 },
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    locale: PLAYWRIGHT_LOCALE[defaultLocale] || defaultLocale || "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    channel: "chrome",
  },
  // Pipeline: setup-<loc>(auth) → data-setup(serial data creation, bound to defaultLocale) → e2e-<loc>(N workers)
  projects: [
    ...setupProjects,
    {
      name: "data-setup",
      testMatch: /data\.setup\.ts/,
      timeout: 20 * 60_000, // 20 min for serial task creation (locale-agnostic; uses defaultLocale session)
      use: {
        ...(hasAuth ? { storageState: authFileForLocale(defaultLocale) } : {}),
      },
      ...(hasAuth ? { dependencies: [`setup-${defaultLocale}`] } : {}),
    },
    ...testProjects.map((p) => ({
      ...p,
      ...(hasAuth ? { dependencies: [...p.dependencies!, "data-setup"] } : {}),
    })),
  ],
});
