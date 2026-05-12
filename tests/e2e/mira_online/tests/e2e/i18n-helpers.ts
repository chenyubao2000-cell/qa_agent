/**
 * Shared i18n helpers for page objects and test files.
 *
 * Reads DIRECTLY from Mira source files — no sync needed.
 * Path derived from SOURCE_PROJECT_DIR in qa_agent/.env
 */
import path from "node:path";
import fs from "node:fs";

// ── Load Mira source messages at import time ──

function findMiraMessagesDir(): string {
  // 1. Explicit env var
  if (process.env.MIRA_I18N_SOURCE) return process.env.MIRA_I18N_SOURCE;

  // 2. Derive from SOURCE_PROJECT_DIR (qa_agent/.env)
  if (process.env.SOURCE_PROJECT_DIR) {
    const qaRoot = path.resolve(__dirname, "../../../..");
    return path.resolve(
      qaRoot,
      process.env.SOURCE_PROJECT_DIR,
      "apps/mira-work/i18n/messages",
    );
  }

  // 3. Fallback: local messages copy
  return path.resolve(__dirname, "../../messages");
}

function loadAllMessages(): Record<string, Record<string, unknown>> {
  const dir = findMiraMessagesDir();
  const locales: Record<string, Record<string, unknown>> = {};

  if (!fs.existsSync(dir)) {
    console.warn(
      `[i18n-helpers] Messages dir not found: ${dir}, falling back to local messages`,
    );
    const fallback = path.resolve(__dirname, "../../messages");
    if (!fs.existsSync(fallback)) return locales;
    return loadFromDir(fallback);
  }

  return loadFromDir(dir);
}

function loadFromDir(dir: string): Record<string, Record<string, unknown>> {
  const locales: Record<string, Record<string, unknown>> = {};
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    // Legacy layout: messages/{locale}.json
    if (stat.isFile() && entry.endsWith(".json") && !entry.endsWith(".d.json.ts")) {
      const locale = entry.replace(/\.json$/, "");
      try {
        locales[locale] = JSON.parse(fs.readFileSync(full, "utf-8"));
      } catch {}
      continue;
    }
    // New layout: messages/{locale}/{namespace}.json — namespace files already
    // wrap content in their own top-level key (e.g. en/auth.json starts with
    // { "auth": {...}, "email": {...} }), so merge with Object.assign, NOT
    // wrap again under filename.
    if (stat.isDirectory()) {
      const merged: Record<string, unknown> = {};
      for (const nsFile of fs.readdirSync(full)) {
        if (!nsFile.endsWith(".json") || nsFile.endsWith(".d.json.ts")) continue;
        try {
          const parsed = JSON.parse(
            fs.readFileSync(path.join(full, nsFile), "utf-8"),
          );
          if (parsed && typeof parsed === "object") {
            Object.assign(merged, parsed);
          }
        } catch {}
      }
      if (Object.keys(merged).length > 0) {
        locales[entry] = merged;
      }
    }
  }
  return locales;
}

/** All locale dictionaries, keyed by locale code */
export const allMessages = loadAllMessages();

/** All dictionaries as a flat array (for regex building) */
const allDicts = Object.values(allMessages);

// ── Helpers ──

/** Resolve a dotted key from a nested object */
function resolve(
  dict: Record<string, unknown>,
  key: string,
): string | undefined {
  const parts = key.split(".");
  let val: unknown = dict;
  for (const p of parts) {
    if (val == null || typeof val !== "object") return undefined;
    val = (val as Record<string, unknown>)[p];
  }
  return typeof val === "string" ? val : undefined;
}

/** Build a regex matching the i18n key's value across ALL locales. Accepts multiple keys. */
export function i18nRegex(...args: (string | { exact?: boolean })[]): RegExp {
  const keys: string[] = [];
  let options: { exact?: boolean } | undefined;
  for (const arg of args) {
    if (typeof arg === "string") keys.push(arg);
    else options = arg;
  }
  const texts = new Set<string>();
  for (const key of keys) {
    for (const dict of allDicts) {
      const text = resolve(dict, key);
      if (text) texts.add(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    }
  }
  if (texts.size === 0) return new RegExp(keys.join("|"), "i"); // fallback to keys
  const pattern = [...texts].join("|");
  return options?.exact
    ? new RegExp(`^(${pattern})$`, "i")
    : new RegExp(pattern, "i");
}

/** Build a CSS selector matching multiple title attribute values across locales */
export function i18nTitleSelector(tag: string, key: string): string {
  const titles: string[] = [];
  for (const dict of allDicts) {
    const text = resolve(dict, key);
    if (text && !titles.includes(text)) titles.push(text);
  }
  return titles.map((t) => `${tag}[title="${t}"]`).join(", ");
}
