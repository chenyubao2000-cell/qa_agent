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
  retries: 1,
  workers: 4,
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
  projects: [
    ...(hasAuth ? [{ name: 'setup', testMatch: /auth\.setup\.ts/ }] : []),
    ...testProjects,
  ],
});
