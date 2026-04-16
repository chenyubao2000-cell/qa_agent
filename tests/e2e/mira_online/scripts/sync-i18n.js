#!/usr/bin/env node
/**
 * Sync i18n messages from Mira source to E2E test messages.
 *
 * Usage:
 *   node scripts/sync-i18n.js                  # sync all locales
 *   node scripts/sync-i18n.js --check          # dry-run, exit 1 if out of date
 *   node scripts/sync-i18n.js --source /path   # override Mira source path
 *
 * How it works:
 *   1. Reads the "template" key structure from messages/en.json (the test suite's key subset)
 *   2. For each of the 13 locales, extracts matching keys from Mira source files
 *   3. Writes the result to messages/{locale}.json
 *
 * Add to package.json scripts:   "sync-i18n": "node scripts/sync-i18n.js"
 * Add to CI pre-test:            node scripts/sync-i18n.js --check
 */

const fs = require("fs");
const path = require("path");

// ── Config ──
// Load platform root .env (qa_agent/.env) which has SOURCE_PROJECT_DIR
const QA_ROOT = path.resolve(__dirname, "../../../..");
try {
  require("dotenv").config({ path: path.join(QA_ROOT, ".env") });
} catch {}
// Also load local .env for overrides
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "../.env"),
    override: false,
  });
} catch {}

// Derive i18n source from SOURCE_PROJECT_DIR (qa_agent/.env) → {mira}/apps/mira-work/i18n/messages
const sourceProject = process.env.SOURCE_PROJECT_DIR
  ? path.resolve(QA_ROOT, process.env.SOURCE_PROJECT_DIR)
  : "";
const MIRA_SOURCE_DEFAULT =
  process.env.MIRA_I18N_SOURCE ||
  (sourceProject
    ? path.join(sourceProject, "apps/mira-work/i18n/messages")
    : "");
const TEST_MESSAGES_DIR = path.resolve(__dirname, "../messages");
const LOCALES = [
  "de",
  "en",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "ms",
  "pt",
  "th",
  "vi",
  "zh",
  "zh-TW",
];

// ── Args ──
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const sourceIdx = args.indexOf("--source");
const MIRA_SOURCE =
  sourceIdx >= 0 && args[sourceIdx + 1]
    ? args[sourceIdx + 1]
    : MIRA_SOURCE_DEFAULT;

// ── Helpers ──

/** Collect all leaf key paths from a nested object */
function collectKeyPaths(obj, prefix = "") {
  const paths = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      paths.push(...collectKeyPaths(v, p));
    } else {
      paths.push(p);
    }
  }
  return paths;
}

/** Resolve a dotted key path from a nested object */
function resolve(obj, keyPath) {
  const parts = keyPath.split(".");
  let val = obj;
  for (const p of parts) {
    if (val == null || typeof val !== "object") return undefined;
    val = val[p];
  }
  return val;
}

/** Set a dotted key path in a nested object */
function setNested(obj, keyPath, value) {
  const parts = keyPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur) || typeof cur[parts[i]] !== "object") {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// ── Main ──

// 1. Read template key structure from existing test en.json
const templatePath = path.join(TEST_MESSAGES_DIR, "en.json");
if (!fs.existsSync(templatePath)) {
  console.error("ERROR: Template file not found:", templatePath);
  process.exit(1);
}
const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
const keyPaths = collectKeyPaths(template);
console.log(`Template: ${keyPaths.length} keys from ${templatePath}`);

// 2. Check Mira source exists
if (!fs.existsSync(MIRA_SOURCE)) {
  console.error("ERROR: Mira source not found:", MIRA_SOURCE);
  console.error("Use --source /path/to/mira/apps/mira-work/i18n/messages");
  process.exit(1);
}
console.log(`Source:   ${MIRA_SOURCE}`);

// 3. Sync each locale
let outdated = 0;
let updated = 0;

for (const locale of LOCALES) {
  const sourceFile = path.join(MIRA_SOURCE, `${locale}.json`);
  const targetFile = path.join(TEST_MESSAGES_DIR, `${locale}.json`);

  if (!fs.existsSync(sourceFile)) {
    console.warn(`SKIP: ${locale}.json not found in Mira source`);
    continue;
  }

  const source = JSON.parse(fs.readFileSync(sourceFile, "utf-8"));
  const result = {};
  let missing = 0;

  for (const keyPath of keyPaths) {
    const val = resolve(source, keyPath);
    if (val !== undefined) {
      setNested(result, keyPath, val);
    } else {
      // Fallback to English value if key missing in this locale
      const enVal = resolve(template, keyPath);
      if (enVal !== undefined) {
        setNested(result, keyPath, enVal);
      }
      missing++;
    }
  }

  const newContent = JSON.stringify(result, null, 2) + "\n";
  const oldContent = fs.existsSync(targetFile)
    ? fs.readFileSync(targetFile, "utf-8")
    : "";

  if (newContent !== oldContent) {
    outdated++;
    if (checkOnly) {
      console.log(`OUTDATED: ${locale}.json`);
    } else {
      fs.writeFileSync(targetFile, newContent);
      updated++;
      console.log(
        `UPDATED: ${locale}.json (${keyPaths.length - missing}/${keyPaths.length} keys${missing > 0 ? `, ${missing} missing → en fallback` : ""})`,
      );
    }
  } else {
    console.log(`OK:      ${locale}.json (up to date)`);
  }
}

// 4. Summary
console.log(
  `\nDone. ${updated} updated, ${outdated - updated} outdated, ${LOCALES.length - outdated} up to date.`,
);

if (checkOnly && outdated > 0) {
  console.error(
    `\nERROR: ${outdated} locale(s) out of date. Run: node scripts/sync-i18n.js`,
  );
  process.exit(1);
}
