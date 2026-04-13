import { test as setup, expect } from '@playwright/test';
import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

config();

const authFile = path.join(__dirname, '..', '..', 'playwright', '.auth', 'user.json');
const AUTH_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

setup('authenticate', async ({ page }) => {
  setup.setTimeout(120_000);
  const baseURL = (process.env.PLAYWRIGHT_BASE_URL || process.env.PREVIEW_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    console.log('No test credentials configured, skipping auth setup.');
    return;
  }

  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  // Check if existing auth state is still fresh
  if (fs.existsSync(authFile)) {
    const stat = fs.statSync(authFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < AUTH_MAX_AGE_MS) {
      try {
        const state = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
        if (state.cookies?.length > 0) {
          console.log(`Auth state is fresh (${Math.round(ageMs / 60000)}m old), reusing.`);
          return;
        }
      } catch {}
    }
    console.log(`Auth state is stale (${Math.round(ageMs / 60000)}m old), re-authenticating.`);
  }

  await page.goto(`${baseURL}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  // Step 1: Enter email
  // Must use pressSequentially (keydown events) + Tab (blur) to trigger React form validation.
  // fill() / native setter alone do not enable the Continue button on this form.
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.click({ clickCount: 3 }); // select-all any pre-filled text
  await emailInput.pressSequentially(email, { delay: 80 });
  await emailInput.press('Tab'); // blur → triggers React validation → enables button

  const continueBtn = page.getByRole('button', { name: /^继续$|^Continue$/i });
  await expect(continueBtn).toBeEnabled({ timeout: 8_000 });
  await continueBtn.click();

  // Step 2: Enter password
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
  await passwordInput.fill(password);
  await continueBtn.click({ timeout: 30_000 });

  // Wait for redirect after login
  await page.waitForURL('**/task**', { timeout: 60_000, waitUntil: 'domcontentloaded' });
  console.log(`Login successful as ${email}, saving auth state.`);

  await page.context().storageState({ path: authFile });
});
