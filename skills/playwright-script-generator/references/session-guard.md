# Session Guard — Auto Re-Authentication on Expiry

> **When to read this file**: Any test or fixture that navigates to an authenticated page.
> Session tokens expire. Tests that run after expiry land on `/sign-in` instead of the expected page.
> This reference defines the pattern to detect and recover from expired sessions automatically.

---

## Problem

Playwright's `auth.setup.ts` runs **once** at the start and saves cookies to `playwright/.auth/user.json`.
All test projects reuse this cached state via `storageState` in config.

Failure modes:
1. **Stale cache** — `user.json` was saved hours/days ago, session token expired
2. **Mid-run expiry** — long test suite (30+ min), token expires mid-run
3. **Server restart** — preview server restarted, invalidating all sessions

Symptoms: `page.goto('/task')` → redirected to `/sign-in` → all subsequent locators fail with timeout/not found.

---

## Solution: `ensureAuthenticated` Page-Scope Fixture

Add an `ensureAuthenticated` fixture that wraps every `page`. After navigation, it checks whether
the page landed on the login page. If so, it re-authenticates inline and navigates back.

### Implementation (in fixtures.ts)

```typescript
const AUTH_FILE = 'playwright/.auth/user.json';
const SIGN_IN_PATH = '/sign-in';

/** Re-authenticate when session has expired (detected by redirect to sign-in page). */
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

  // Update cached auth state so subsequent pages in this context don't need to re-auth
  await page.context().storageState({ path: AUTH_FILE });
}

// In the test.extend block:
ensureAuthenticated: [async ({ page }, use) => {
  const originalGoto = page.goto.bind(page);
  page.goto = async (url: string, options?: any) => {
    const response = await originalGoto(url, options);
    // Check if redirected to sign-in page
    if (page.url().includes(SIGN_IN_PATH)) {
      await reAuthenticate(page);
      // Navigate to the original intended URL
      await originalGoto(url, options);
    }
    return response;
  };
  await use();
}, { auto: true }],  // auto: true → runs for every test without explicit destructuring
```

### Key Design Decisions

1. **`auto: true`** — no spec changes needed, every test automatically gets session guard
2. **Patches `page.goto`** — intercepts at the navigation level, before any locator runs
3. **Updates `user.json`** — after re-auth, saves fresh state so other workers/contexts benefit
4. **Login flow mirrors `auth.setup.ts`** — uses the same selectors, so if login page changes, only one place to update

### Worker-Scope Fixtures

Worker-scope fixtures (e.g., `taskWithFilesUrl`) create their own `browser.newContext({ storageState: AUTH_FILE })`.
They do NOT get the `ensureAuthenticated` fixture. For these, add an explicit check:

```typescript
taskWithFilesUrl: [async ({ browser }, use) => {
  const ctx = await browser.newContext({ storageState: AUTH_FILE });
  const page = await ctx.newPage();
  try {
    await page.goto('/task', { timeout: 30_000 });

    // Session guard for worker-scope fixture
    if (page.url().includes('/sign-in')) {
      await reAuthenticate(page);
      await page.goto('/task', { timeout: 30_000 });
    }

    // ... rest of fixture setup
  } finally {
    await ctx.close().catch(() => {});
  }
}, { scope: 'worker', timeout: 360_000 }],
```

---

## auth.setup.ts Staleness Check

Add a staleness check at the beginning of `auth.setup.ts`. If `user.json` exists but is older than
a threshold (default: 30 minutes), delete it and re-authenticate:

```typescript
const AUTH_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

setup('authenticate', async ({ page }) => {
  // Check if existing auth state is still fresh
  if (fs.existsSync(authFile)) {
    const stat = fs.statSync(authFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < AUTH_MAX_AGE_MS) {
      // Validate by checking if cookies are non-empty
      try {
        const state = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
        if (state.cookies?.length > 0) {
          console.log(`Auth state is fresh (${Math.round(ageMs / 60000)}m old), reusing.`);
          return; // Skip re-authentication
        }
      } catch {}
    }
    console.log(`Auth state is stale (${Math.round(ageMs / 60000)}m old), re-authenticating.`);
  }

  // ... proceed with login flow
});
```

---

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| No session check at all | Tests silently fail on login page | Add `ensureAuthenticated` fixture |
| `try/catch` around every `goto` | Verbose, easy to forget | Use `auto: true` fixture |
| Hardcoded `AUTH_MAX_AGE_MS = 24h` | Most sessions expire in < 1h | Use 30min default |
| Re-auth without saving state | Other workers still use stale state | Always `storageState({ path })` after re-auth |
