# Phase 0 — Workspace Initialization (Shared Reference)

> **Variable naming convention**: `.env` uses `SCREAMING_SNAKE_CASE` (e.g., `APP_LANGUAGES`, `SOURCE_PROJECT_DIR`).
> Agent prompts and projectContext use `camelCase` (e.g., `appLanguages`, `sourceProjectDir`).
> They refer to the same values — the command layer reads `.env` and passes as camelCase to agents.

> **Authoritative source**: This file defines the workspace initialization steps shared by all commands.
> Commands MUST reference this file, NOT duplicate the steps inline.
> Used by: `/qa-explore`, `/qa-from-issue`, `/qa-run-prd`, `/qa-fix-tests`

## Precondition

Check `$QA_WORKSPACE_DIR`; if it doesn't exist or is empty, perform initialization.
Each sub-step is **skip-if-exists** — safe to re-run.

## Step 2a. Copy .env (if not present)

Write Playwright-related variables from the qa-platform's `.env` into `$QA_WORKSPACE_DIR/.env`:

```
PREVIEW_URL=<from qa-platform .env>
PLAYWRIGHT_HEADLESS=<from qa-platform .env>
E2E_TEST_EMAIL=<from qa-platform .env>
E2E_TEST_PASSWORD=<from qa-platform .env>
APP_LANGUAGES=<from qa-platform .env, if set>
```

> dotenv loads this file in playwright.config.ts and auth.setup.ts.

## Step 2b. Directory Structure (skip if exists)

```bash
mkdir -p tests/e2e/testcases/generated tests/e2e/pages tests/e2e/test-data/files playwright/.auth
mkdir -p tests/reports/combined test-cases/generated test-cases/excel test-results messages
```

## Step 2b-1. Copy i18n Messages (when APP_LANGUAGES is set, skip if messages/ already exists)

```bash
# Validate I18N_MESSAGES_DIR exists
if [ -n "$I18N_MESSAGES_DIR" ] && [ ! -d "$I18N_MESSAGES_DIR" ]; then
  echo "ERROR: I18N_MESSAGES_DIR directory not found: $I18N_MESSAGES_DIR"
  exit 1
fi

# Copy message files (cross-platform via node)
if [ -n "$I18N_MESSAGES_DIR" ] && [ ! -f "$QA_WORKSPACE_DIR/messages/en.json" ]; then
  node -e "const fs=require('fs'),p=require('path'); fs.readdirSync('$I18N_MESSAGES_DIR').filter(f=>f.endsWith('.json')).forEach(f=>fs.copyFileSync(p.join('$I18N_MESSAGES_DIR',f),p.join('$QA_WORKSPACE_DIR/messages',f)))"
fi

# Validate ALL languages have message files
if [ -n "$APP_LANGUAGES" ]; then
  IFS=',' read -ra LANGS <<< "$APP_LANGUAGES"
  for lang in "${LANGS[@]}"; do
    lang=$(echo "$lang" | tr -d ' ')
    if [ ! -f "$QA_WORKSPACE_DIR/messages/${lang}.json" ]; then
      echo "ERROR: Missing message file for '${lang}': $QA_WORKSPACE_DIR/messages/${lang}.json"
      exit 1
    fi
  done
fi
```

> **Why copy**: fixtures.ts uses `import from '../messages/en.json'` (local relative path). Copy once, self-contained.

## Step 2c. Install Playwright (if package.json doesn't exist)

```bash
npm init -y && npm install -D @playwright/test dotenv && npx playwright install chromium
```

## Step 2d. Generate playwright.config.ts (if not present, OR upgrade when APP_LANGUAGES changed)

**Upgrade logic**:
1. `APP_LANGUAGES` set AND config has no per-language projects → **regenerate**
2. `APP_LANGUAGES` set AND config already has per-language projects → **skip**
3. `APP_LANGUAGES` not set → **skip** if file exists

**Template**: defined in `.claude/references/phase-0-templates.md` § "playwright.config.ts Template" (the ONLY location — do not duplicate elsewhere).
Key features: dotenv config, **per-locale auth setup projects** (`setup-${locale}`) each writing `user.${locale}.json`, per-language Playwright test projects when APP_LANGUAGES set, locale-aware `storageState` binding, JSON + HTML reporters, retain-on-failure trace/video.

> **Multi-locale rationale**: see `phase-0-templates.md` § "Multi-locale Design Overview". Requires `locale-map.ts` at `$QA_WORKSPACE_DIR/tests/e2e/locale-map.ts` — template in the same file.
> **POM/spec rules**: generated POMs and specs must follow `.claude/references/i18n-locator-rules.md` (no hardcoded translatable text, no hardcoded `user.json` paths).

## Step 2e. Generate fixtures.ts (if not present, OR upgrade when APP_LANGUAGES changed)

**Upgrade logic**:
1. `APP_LANGUAGES` set AND fixtures.ts lacks `export type I18n` → **regenerate** with i18n fixture
2. `APP_LANGUAGES` set AND fixtures.ts has `export type I18n` → **skip**
3. `APP_LANGUAGES` not set → **skip** if file exists

**Template**: defined in `.claude/references/phase-0-templates.md` § "fixtures.ts Template" (the ONLY location — do not duplicate elsewhere).
Two variants: with APP_LANGUAGES (i18n fixture + dynamic imports per language) / without (minimal re-export).

## Step 2f-0. Generate data.setup.ts (if not present)

**When**: Always generate if `E2E_TEST_EMAIL` is set (data-setup needs auth to create tasks).

**Skip if**: `$QA_WORKSPACE_DIR/tests/e2e/data.setup.ts` already exists.

**Template**: Read `skills/test-data-setup/SKILL.md` for the generation rules.
The data-setup project pre-creates expensive AI task data in parallel, writes URLs to `playwright/.test-data.json`, so parallel workers never block on fixture creation.

**Config-driven**: Read the project's `test-data.config.json` (at `$QA_WORKSPACE_DIR/test-data.config.json`) to determine:
- Which fixtures to create (prompts, wait patterns, timeouts)
- Route paths (task creation, sign-in)
- Selector patterns (textarea, submit button, completion indicator)
- Clarification handler configuration (if applicable)
- Cache TTL and path

If `test-data.config.json` does not exist, fall back to `.claude/references/test-data-setup.md` § "data.setup.ts structure" as the legacy pattern.

> **Important**: Project-specific knowledge (prompts, selectors, routes) lives in `test-data.config.json`, NOT in the generated code. To modify fixture behavior, update the config and regenerate.

## Step 2f. Copy static test data files (if not present)

```
Source: <qa-platform-dir>/tests/e2e/fixtures/files/*
Target: $QA_WORKSPACE_DIR/tests/e2e/test-data/files/
Files: sample.png, sample.jpg, sample.pdf, sample.csv, sample.xlsx, sample.txt, empty.txt, oversized-6mb.bin
```

Only copy files that don't already exist (preserve user customizations).

---

## i18n Infrastructure Validation (post-init check)

When `APP_LANGUAGES` is set, validate infrastructure is complete:

```
1. playwright.config.ts has per-language projects (Grep "e2e-" in config)
2. fixtures.ts has i18n fixture (Grep "export type I18n" in fixtures.ts)
3. messages/ has .json for each language
```

If any check fails → ERROR with actionable message pointing to the specific step above.

## Data Pipeline Validation (post-init check)

When `E2E_TEST_EMAIL` is set, validate data-setup infrastructure:

```
1. playwright.config.ts has data-setup project (Grep "data-setup" in config)
2. data.setup.ts exists at $QA_WORKSPACE_DIR/tests/e2e/data.setup.ts
3. Test projects depend on a setup project — regex: `setup(-\w+)?` (accepts both legacy 'setup' and per-locale 'setup-${locale}')
4. fixtures.ts contains readTestData helper (Grep "readTestData" in fixtures.ts)
```

> See `.claude/references/test-data-setup.md` for full data pipeline documentation.

## Auth Infrastructure Validation (post-init check)

When `E2E_TEST_EMAIL` is set, validate:

```
1. playwright.config.ts has at least one setup project — Grep -E "name:\s*['\"]setup(-\w+)?['\"]" in config
2. playwright/.auth/ directory exists (create if missing)
3. auth.setup.ts — WARNING if missing (generated by CDP login wall detection, not by init)
4. auth.setup.ts includes staleness check (AUTH_MAX_AGE_MS) — if missing, auth state may be reused even when expired
5. fixtures.ts includes ensureAuthenticated auto-fixture — if missing, session expiry mid-run will cause cascade failures
```

### Per-locale Auth Validation (when APP_LANGUAGES is set)

Additional checks for multi-locale projects:

```
6. locale-map.ts exists at $QA_WORKSPACE_DIR/tests/e2e/locale-map.ts
7. For each locale in APP_LANGUAGES:
     a. playwright.config.ts has a matching `setup-${locale}` project — Grep -E "name:\s*['\"]setup-${locale}['\"]"
     b. The project's dependencies include `setup-${locale}` — Grep -E "dependencies:\s*\[[^]]*['\"]setup-${locale}['\"]"
     c. auth.setup.ts reads targetLocale from testInfo.project.name — Grep "localeFromProjectName" in auth.setup.ts
     d. After `setup-${locale}` runs once, $QA_WORKSPACE_DIR/playwright/.auth/user.${locale}.json exists with NEXT_LOCALE cookie = ${locale}
8. fixtures.ts imports from ./locale-map (Grep "from ['\"]./locale-map['\"]" in fixtures.ts)
9. fixtures.ts reAuthenticate signature accepts { authFile, targetLocale } — Grep "reAuthenticate.*authFile.*targetLocale"
```

> **Per-locale rationale**: the server may re-write `Set-Cookie: NEXT_LOCALE=<accountPref>` after auth, overriding Playwright's `extraHTTPHeaders.Cookie`. One shared `user.json` pollutes cross-locale tests. Solution: per-locale storageState + UI-driven locale switch during `setup-${locale}`. Full design: `phase-0-templates.md` § "Multi-locale Design Overview".

> **Session guard**: auth.setup.ts staleness check handles stale cached state (> 30min old).
> fixtures.ts `ensureAuthenticated` auto-fixture handles mid-run session expiry by intercepting `page.goto`,
> re-authenticating, AND re-applying UI locale so account preference stays aligned with the project locale.
> See `skills/playwright-script-generator/references/session-guard.md` for full pattern.
