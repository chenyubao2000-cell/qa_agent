#!/usr/bin/env bun
/**
 * eval-cron.ts — Langfuse Eval 定时任务脚本
 *
 * 定时执行 eval 评分，检测质量退化，输出告警信息。
 *
 * Usage:
 *   bun run scripts/eval-cron.ts [--interval 3600] [--threshold 10] [--baseline eval-reports/baseline.json]
 *
 * Environment variables (from .env):
 *   LANGFUSE_HOST          — Langfuse API endpoint
 *   LANGFUSE_PUBLIC_KEY    — Langfuse public API key
 *   LANGFUSE_SECRET_KEY    — Langfuse secret API key
 *   SLACK_WEBHOOK_URL      — (optional) Slack webhook for degradation alerts
 *   EVAL_LATENCY_THRESHOLD — (optional) latency threshold in ms, default 30000
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ── Types ──

interface EvalBaseline {
  timestamp: string;
  scores: DimensionScores;
}

interface DimensionScores {
  accuracy: number;
  safety: number;
  format: number;
  tool_use: number;
  latency_pass_rate: number;
}

interface TraceStats {
  totalTraces: number;
  avgScores: DimensionScores;
  errorRate: number;
  latencyP95: number;
  tokenCost: number;
  timestamp: string;
}

interface Degradation {
  dimension: string;
  baseline: number;
  current: number;
  dropPct: number;
}

interface AlertPayload {
  level: "warning" | "critical";
  timestamp: string;
  degradations: Degradation[];
  stats: TraceStats;
  baselineFile: string;
}

// ── CLI Argument Parsing ──

function parseArgs(): {
  interval: number;
  threshold: number;
  baselinePath: string;
} {
  const args = process.argv.slice(2);
  let interval = 3600;
  let threshold = 10;
  let baselinePath = "eval-reports/baseline.json";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--interval":
        interval = parseInt(args[++i], 10);
        break;
      case "--threshold":
        threshold = parseFloat(args[++i]);
        break;
      case "--baseline":
        baselinePath = args[++i];
        break;
    }
  }

  return { interval, threshold, baselinePath };
}

// ── Environment Loading ──

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), ".env");
  const env: Record<string, string> = {};

  if (!existsSync(envPath)) {
    console.error("[eval-cron] .env file not found");
    process.exit(1);
  }

  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function validateEnv(env: Record<string, string>): {
  host: string;
  publicKey: string;
  secretKey: string;
  slackWebhook: string | null;
  latencyThreshold: number;
} {
  const host = env.LANGFUSE_HOST;
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;

  if (!host || !publicKey || !secretKey) {
    console.error(
      "[eval-cron] Missing required env vars: LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY"
    );
    process.exit(1);
  }

  return {
    host: host.replace(/\/$/, ""),
    publicKey,
    secretKey,
    slackWebhook: env.SLACK_WEBHOOK_URL || null,
    latencyThreshold: parseInt(env.EVAL_LATENCY_THRESHOLD || "30000", 10),
  };
}

// ── Langfuse API ──

async function fetchRecentTraces(
  host: string,
  publicKey: string,
  secretKey: string,
  hoursAgo: number
): Promise<any[]> {
  const fromTimestamp = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000
  ).toISOString();
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
  const traces: any[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const url = `${host}/api/public/traces?limit=${limit}&page=${page}&fromTimestamp=${fromTimestamp}&orderBy=timestamp&orderDirection=desc`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(
        `[eval-cron] Langfuse API error: ${response.status} ${response.statusText}`
      );
      break;
    }

    const body = await response.json();
    const data = body.data || [];
    traces.push(...data);

    if (data.length < limit || page >= (body.meta?.totalPages || 1)) {
      break;
    }
    page++;
  }

  return traces;
}

// ── Stats Calculation ──

function calculateStats(
  traces: any[],
  latencyThreshold: number
): TraceStats {
  if (traces.length === 0) {
    return {
      totalTraces: 0,
      avgScores: {
        accuracy: 0,
        safety: 0,
        format: 0,
        tool_use: 0,
        latency_pass_rate: 0,
      },
      errorRate: 0,
      latencyP95: 0,
      tokenCost: 0,
      timestamp: new Date().toISOString(),
    };
  }

  let totalAccuracy = 0;
  let totalSafety = 0;
  let totalFormat = 0;
  let totalToolUse = 0;
  let latencyPassCount = 0;
  let errorCount = 0;
  let totalTokens = 0;
  const latencies: number[] = [];
  let scoredCount = 0;

  for (const trace of traces) {
    // Extract scores from trace metadata or scores
    const scores = trace.scores || {};
    if (scores.accuracy != null) {
      totalAccuracy += scores.accuracy;
      totalSafety += scores.safety || 0;
      totalFormat += scores.format || 0;
      totalToolUse += scores.tool_use || 0;
      scoredCount++;
    }

    // Latency
    const latency = trace.latency || trace.duration || 0;
    if (latency > 0) {
      latencies.push(latency);
      if (latency <= latencyThreshold) {
        latencyPassCount++;
      }
    }

    // Error detection
    if (
      trace.status === "ERROR" ||
      trace.level === "ERROR" ||
      trace.metadata?.error
    ) {
      errorCount++;
    }

    // Token cost
    const usage = trace.usage || {};
    totalTokens += (usage.totalTokens || usage.total_tokens || 0);
  }

  // Calculate P95 latency
  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const latencyP95 = latencies.length > 0 ? latencies[p95Index] || 0 : 0;

  // Estimate cost (Claude Sonnet: ~$3/$15 per 1M input/output tokens, simplified)
  const tokenCost = (totalTokens / 1_000_000) * 9;

  const denominator = scoredCount || 1;

  return {
    totalTraces: traces.length,
    avgScores: {
      accuracy: totalAccuracy / denominator,
      safety: totalSafety / denominator,
      format: totalFormat / denominator,
      tool_use: totalToolUse / denominator,
      latency_pass_rate:
        latencies.length > 0 ? latencyPassCount / latencies.length : 1,
    },
    errorRate: errorCount / traces.length,
    latencyP95,
    tokenCost,
    timestamp: new Date().toISOString(),
  };
}

// ── Degradation Detection ──

function detectDegradations(
  baseline: EvalBaseline,
  current: TraceStats,
  thresholdPct: number
): Degradation[] {
  const degradations: Degradation[] = [];
  const dimensions: (keyof DimensionScores)[] = [
    "accuracy",
    "safety",
    "format",
    "tool_use",
    "latency_pass_rate",
  ];

  for (const dim of dimensions) {
    const baseVal = baseline.scores[dim];
    const curVal = current.avgScores[dim];

    if (baseVal === 0) continue; // Skip if baseline is zero

    const dropPct = ((baseVal - curVal) / baseVal) * 100;

    if (dropPct > thresholdPct) {
      degradations.push({
        dimension: dim,
        baseline: baseVal,
        current: curVal,
        dropPct: Math.round(dropPct * 10) / 10,
      });
    }
  }

  return degradations;
}

// ── Baseline Management ──

function loadBaseline(baselinePath: string): EvalBaseline | null {
  const absPath = resolve(process.cwd(), baselinePath);
  if (!existsSync(absPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(absPath, "utf-8"));
  } catch {
    console.warn(`[eval-cron] Failed to parse baseline: ${absPath}`);
    return null;
  }
}

function saveBaseline(baselinePath: string, stats: TraceStats): void {
  const absPath = resolve(process.cwd(), baselinePath);
  const baseline: EvalBaseline = {
    timestamp: stats.timestamp,
    scores: stats.avgScores,
  };
  writeFileSync(absPath, JSON.stringify(baseline, null, 2), "utf-8");
  console.log(`[eval-cron] Baseline saved: ${absPath}`);
}

// ── Alert Output ──

async function sendAlert(
  payload: AlertPayload,
  slackWebhook: string | null
): Promise<void> {
  // Always output to stdout (JSON format for pipeline consumption)
  console.log(JSON.stringify(payload, null, 2));

  // Send to Slack if webhook configured
  if (slackWebhook) {
    const dimLines = payload.degradations
      .map(
        (d) =>
          `- *${d.dimension}*: ${d.baseline.toFixed(2)} -> ${d.current.toFixed(2)} (${d.dropPct}% drop)`
      )
      .join("\n");

    const slackBody = {
      text: `:warning: *LLM Eval Degradation Alert*\n\nTraces analyzed: ${payload.stats.totalTraces}\nError rate: ${(payload.stats.errorRate * 100).toFixed(1)}%\nLatency P95: ${payload.stats.latencyP95}ms\n\n*Degraded Dimensions:*\n${dimLines}`,
    };

    try {
      const res = await fetch(slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackBody),
      });
      if (!res.ok) {
        console.error(
          `[eval-cron] Slack webhook failed: ${res.status} ${res.statusText}`
        );
      } else {
        console.log("[eval-cron] Alert sent to Slack");
      }
    } catch (err) {
      console.error(`[eval-cron] Slack webhook error: ${err}`);
    }
  }
}

// ── Main Loop ──

async function runEvalCheck(
  config: ReturnType<typeof validateEnv>,
  intervalHours: number,
  thresholdPct: number,
  baselinePath: string
): Promise<void> {
  console.log(
    `[eval-cron] Fetching traces from last ${intervalHours} hour(s)...`
  );

  const traces = await fetchRecentTraces(
    config.host,
    config.publicKey,
    config.secretKey,
    intervalHours
  );

  if (traces.length === 0) {
    console.log("[eval-cron] No traces found in the time window. Skipping.");
    return;
  }

  const stats = calculateStats(traces, config.latencyThreshold);
  console.log(
    `[eval-cron] Analyzed ${stats.totalTraces} traces | Error rate: ${(stats.errorRate * 100).toFixed(1)}% | Latency P95: ${stats.latencyP95}ms | Token cost: $${stats.tokenCost.toFixed(2)}`
  );

  // Load or initialize baseline
  let baseline = loadBaseline(baselinePath);
  if (!baseline) {
    console.log(
      "[eval-cron] No baseline found. Saving current stats as baseline."
    );
    saveBaseline(baselinePath, stats);
    return;
  }

  // Detect degradations
  const degradations = detectDegradations(baseline, stats, thresholdPct);

  if (degradations.length > 0) {
    const alertPayload: AlertPayload = {
      level: degradations.some((d) => d.dropPct > 20) ? "critical" : "warning",
      timestamp: stats.timestamp,
      degradations,
      stats,
      baselineFile: baselinePath,
    };

    console.warn(
      `[eval-cron] DEGRADATION DETECTED in ${degradations.length} dimension(s):`
    );
    for (const d of degradations) {
      console.warn(
        `  - ${d.dimension}: ${d.baseline.toFixed(2)} -> ${d.current.toFixed(2)} (${d.dropPct}% drop)`
      );
    }

    await sendAlert(alertPayload, config.slackWebhook);
  } else {
    console.log("[eval-cron] All dimensions within threshold. No degradation.");

    // Update baseline with current stats (quality is stable)
    saveBaseline(baselinePath, stats);
  }
}

async function main(): Promise<void> {
  const { interval, threshold, baselinePath } = parseArgs();
  const env = loadEnv();
  const config = validateEnv(env);

  const intervalHours = interval / 3600;

  console.log("[eval-cron] Starting eval cron job");
  console.log(`  Interval: ${interval}s (${intervalHours}h)`);
  console.log(`  Threshold: ${threshold}%`);
  console.log(`  Baseline: ${baselinePath}`);
  console.log(`  Langfuse: ${config.host}`);
  console.log(`  Slack: ${config.slackWebhook ? "configured" : "not configured"}`);
  console.log("");

  // Run immediately on start
  await runEvalCheck(config, intervalHours, threshold, baselinePath);

  // Schedule recurring runs
  setInterval(async () => {
    try {
      await runEvalCheck(config, intervalHours, threshold, baselinePath);
    } catch (err) {
      console.error(`[eval-cron] Error during eval check: ${err}`);
    }
  }, interval * 1000);
}

main().catch((err) => {
  console.error(`[eval-cron] Fatal error: ${err}`);
  process.exit(1);
});
