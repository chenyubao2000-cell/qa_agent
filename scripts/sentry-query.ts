/**
 * Sentry Issue Query Script
 *
 * Usage:
 *   npx tsx scripts/sentry-query.ts [options]
 *
 * Options:
 *   --env <env>        Sentry environment (default: from SENTRY_ENV or "preview")
 *   --minutes <n>      Look back N minutes (default: 30)
 *   --level <level>    Filter by level: error | warning | info (default: all)
 *   --limit <n>        Max issues to return (default: 25)
 *   --query <q>        Extra Sentry search query (e.g. "is:unresolved url:/task")
 *   --json             Output raw JSON (for piping to report-analyzer)
 *   --with-events      Fetch latest event detail per issue (slower, richer)
 */

import * as fs from "fs";
import * as path from "path";

// ── Load .env ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ── Parse CLI args ─────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") { opts.json = true; continue; }
    if (args[i] === "--with-events") { opts.withEvents = true; continue; }
    if (args[i].startsWith("--") && i + 1 < args.length) {
      opts[args[i].slice(2)] = args[++i];
    }
  }
  return opts;
}

const opts = parseArgs();

const SENTRY_KEY = process.env.SENTRY_KEY;
const SENTRY_ORG = process.env.SENTRY_ORG || "career-it";
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || "mira";
const SENTRY_ENV = (opts.env as string) || process.env.SENTRY_ENV || "preview";
const MINUTES = parseInt((opts.minutes as string) || "30", 10);
const LEVEL = (opts.level as string) || "";
const LIMIT = parseInt((opts.limit as string) || "25", 10);
const EXTRA_QUERY = (opts.query as string) || "";
const JSON_OUTPUT = !!opts.json;
const WITH_EVENTS = !!opts.withEvents;

if (!SENTRY_KEY) {
  console.error("ERROR: SENTRY_KEY not set in .env");
  process.exit(1);
}

const BASE = "https://sentry.io/api/0";
const headers = { Authorization: `Bearer ${SENTRY_KEY}`, "Content-Type": "application/json" };

// ── API helpers ────────────────────────────────────────────────────────
async function sentryGet<T = any>(url: string): Promise<T> {
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sentry API ${resp.status}: ${body}`);
  }
  return resp.json() as Promise<T>;
}

interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  count: string;
  level: string;
  firstSeen: string;
  lastSeen: string;
  status: string;
  metadata?: { type?: string; value?: string; filename?: string };
  shortId?: string;
  permalink?: string;
}

interface SentryEvent {
  eventID: string;
  context?: Record<string, any>;
  tags?: { key: string; value: string }[];
  entries?: { type: string; data: any }[];
  message?: string;
  dateCreated?: string;
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const since = new Date(Date.now() - MINUTES * 60 * 1000).toISOString();

  // Build query
  let query = `is:unresolved lastSeen:>${since}`;
  if (LEVEL) query += ` level:${LEVEL}`;
  if (EXTRA_QUERY) query += ` ${EXTRA_QUERY}`;

  const url = `${BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=${encodeURIComponent(query)}&environment=${SENTRY_ENV}&limit=${LIMIT}&sort=date`;

  const issues: SentryIssue[] = await sentryGet(url);

  if (issues.length === 0) {
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({ env: SENTRY_ENV, since, issues: [], count: 0 }));
    } else {
      console.log(`\n  No unresolved Sentry issues in [${SENTRY_ENV}] within the last ${MINUTES} minutes.\n`);
    }
    return;
  }

  // Optionally fetch latest event per issue
  let eventDetails: Map<string, SentryEvent> = new Map();
  if (WITH_EVENTS) {
    const eventPromises = issues.slice(0, 10).map(async (issue) => {
      try {
        const ev = await sentryGet<SentryEvent>(
          `${BASE}/issues/${issue.id}/events/latest/`
        );
        eventDetails.set(issue.id, ev);
      } catch { /* skip */ }
    });
    await Promise.all(eventPromises);
  }

  if (JSON_OUTPUT) {
    const output = issues.map((i) => ({
      id: i.id,
      shortId: i.shortId,
      title: i.title,
      culprit: i.culprit,
      level: i.level,
      count: parseInt(i.count),
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      permalink: i.permalink,
      metadata: i.metadata,
      ...(eventDetails.has(i.id)
        ? { latestEvent: summarizeEvent(eventDetails.get(i.id)!) }
        : {}),
    }));
    console.log(JSON.stringify({ env: SENTRY_ENV, since, issues: output, count: output.length }, null, 2));
  } else {
    printTable(issues, eventDetails);
  }
}

function summarizeEvent(ev: SentryEvent) {
  const exception = ev.entries?.find((e) => e.type === "exception");
  const frames = exception?.data?.values?.[0]?.stacktrace?.frames;
  const topFrame = frames?.[frames.length - 1];
  return {
    eventId: ev.eventID,
    message: ev.message || null,
    topFrame: topFrame
      ? `${topFrame.filename}:${topFrame.lineNo} in ${topFrame.function}`
      : null,
    tags: ev.tags
      ?.filter((t) => ["browser", "os", "url", "transaction"].includes(t.key))
      .reduce((acc: Record<string, string>, t) => { acc[t.key] = t.value; return acc; }, {}),
  };
}

function printTable(issues: SentryIssue[], events: Map<string, SentryEvent>) {
  console.log(`\n  Sentry Issues [${SENTRY_ENV}] — last ${MINUTES} min — ${issues.length} found\n`);
  console.log("  " + "─".repeat(100));
  console.log(
    `  ${"#".padEnd(4)} ${"Level".padEnd(8)} ${"Count".padEnd(7)} ${"Title".padEnd(50)} ${"Culprit"}`
  );
  console.log("  " + "─".repeat(100));

  issues.forEach((issue, idx) => {
    const levelIcon =
      issue.level === "error" ? "🔴" :
      issue.level === "warning" ? "🟡" :
      issue.level === "fatal" ? "💀" : "ℹ️ ";
    console.log(
      `  ${String(idx + 1).padEnd(4)} ${levelIcon} ${issue.level.padEnd(5)} ${issue.count.padEnd(7)} ${issue.title.slice(0, 48).padEnd(50)} ${issue.culprit}`
    );
    if (events.has(issue.id)) {
      const ev = summarizeEvent(events.get(issue.id)!);
      if (ev.topFrame) console.log(`       ↳ ${ev.topFrame}`);
    }
  });

  console.log("  " + "─".repeat(100));
  console.log(`\n  Permalink: https://${SENTRY_ORG}.sentry.io/issues/?project=${SENTRY_PROJECT}&environment=${SENTRY_ENV}\n`);
}

main().catch((err) => {
  console.error("Sentry query failed:", err.message);
  process.exit(1);
});
