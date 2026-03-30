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

**Template**: defined in `.claude/commands/qa-explore.md` § "2d. Generate playwright.config.ts" (the ONLY location — do not duplicate elsewhere).
Key features: dotenv config, auth setup project with `dependencies: ['setup']`, per-language Playwright projects when APP_LANGUAGES set, JSON + HTML reporters, retain-on-failure trace/video.

## Step 2e. Generate fixtures.ts (if not present, OR upgrade when APP_LANGUAGES changed)

**Upgrade logic**:
1. `APP_LANGUAGES` set AND fixtures.ts lacks `export type I18n` → **regenerate** with i18n fixture
2. `APP_LANGUAGES` set AND fixtures.ts has `export type I18n` → **skip**
3. `APP_LANGUAGES` not set → **skip** if file exists

**Template**: defined in `.claude/commands/qa-explore.md` § "2e. Generate fixtures.ts" (the ONLY location — do not duplicate elsewhere).
Two variants: with APP_LANGUAGES (i18n fixture + dynamic imports per language) / without (minimal re-export).

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

## Auth Infrastructure Validation (post-init check)

When `E2E_TEST_EMAIL` is set, validate:

```
1. playwright.config.ts has setup project (Grep "name: 'setup'" in config)
2. playwright/.auth/ directory exists (create if missing)
3. auth.setup.ts — WARNING if missing (generated by CDP login wall detection, not by init)
```
