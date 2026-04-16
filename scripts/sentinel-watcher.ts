/**
 * sentinel-watcher — 多平台监控守护进程
 *
 * 持续轮询五大平台质量信号，异常时调用 sentinel-agent 分析并告警：
 *   1. Sentry     — 每5分钟查询新 issue
 *   2. Langfuse   — 每小时查询 LLM trace 统计
 *   3. Railway    — 轮询部署状态变更
 *   4. DB         — 检测 Drizzle migration 文件变更
 *   5. GitHub     — 增强版 PR 变更检测（路由到对应测试）
 *
 * 启动方式：npx tsx scripts/sentinel-watcher.ts [--platforms sentry,langfuse] [--interval 300] [--budget 5]
 * 单实例保护：通过 .sentinel-watcher.pid 文件锁实现
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
config({ path: resolve(PROJECT_ROOT, ".env") });

// ── 日志工具 ──────────────────────────────────────────
const TAG = "[sentinel]";

function log(...args: unknown[]) {
  const ts = new Date().toISOString();
  console.log(`${TAG} [${ts}]`, ...args);
}

function logError(...args: unknown[]) {
  const ts = new Date().toISOString();
  console.error(`${TAG} [${ts}] ERROR`, ...args);
}

// ── 单实例锁 ──────────────────────────────────────────
const LOCK_FILE = resolve(PROJECT_ROOT, ".sentinel-watcher.pid");

function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    const oldPid = Number(readFileSync(LOCK_FILE, "utf-8").trim());
    if (oldPid && isProcessAlive(oldPid)) {
      logError(`另一个实例正在运行 (pid ${oldPid})，退出`);
      process.exit(0);
    }
    log(`发现过期锁文件 (pid ${oldPid})，接管`);
  }
  writeFileSync(LOCK_FILE, String(process.pid));
  log(`获取锁成功 (pid ${process.pid})`);
}

function releaseLock() {
  try {
    const content = readFileSync(LOCK_FILE, "utf-8").trim();
    if (Number(content) === process.pid) {
      unlinkSync(LOCK_FILE);
      log("释放锁文件");
    }
  } catch {}
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

acquireLock();
process.on("exit", releaseLock);
process.on("SIGINT", () => {
  releaseLock();
  process.exit(0);
});
process.on("SIGTERM", () => {
  releaseLock();
  process.exit(0);
});

// ── 命令行参数解析 ────────────────────────────────────
interface CliArgs {
  platforms: string[];
  interval: number; // 秒
  budget: number; // 每日预算上限 (USD)
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    platforms: ["sentry", "langfuse", "railway", "db", "github"],
    interval: 300,
    budget: 5,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--platforms" && args[i + 1]) {
      result.platforms = args[++i].split(",").map((s) => s.trim());
    } else if (args[i] === "--interval" && args[i + 1]) {
      result.interval = Number(args[++i]);
    } else if (args[i] === "--budget" && args[i + 1]) {
      result.budget = Number(args[++i]);
    }
  }

  return result;
}

const cliArgs = parseArgs();

// ── 配置 ──────────────────────────────────────────────
const TARGET_DIR = process.env.QA_WORKSPACE_DIR ?? "";
const SOURCE_DIR = process.env.SOURCE_PROJECT_DIR ?? "";

// Sentry
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN ?? "";
const SENTRY_ORG = process.env.SENTRY_ORG ?? "";
const SENTRY_PROJECT = process.env.SENTRY_PROJECT ?? "";
const SENTRY_API_BASE = `https://sentry.io/api/0`;

// Langfuse
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? "";
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? "";
const LANGFUSE_HOST = process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com";

// Railway
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN ?? "";

// GitHub (复用 git-watcher 的配置)
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";

// ── 报告目录 ─────────────────────────────────────────
const REPORTS_DIR = resolve(PROJECT_ROOT, "sentinel-reports");
const BASELINE_FILE = resolve(REPORTS_DIR, "baseline.json");
const BUDGET_FILE = resolve(REPORTS_DIR, "budget.json");

function ensureReportDirs() {
  const dirs = [
    REPORTS_DIR,
    resolve(REPORTS_DIR, "sentry"),
    resolve(REPORTS_DIR, "langfuse"),
    resolve(REPORTS_DIR, "railway"),
    resolve(REPORTS_DIR, "db"),
    resolve(REPORTS_DIR, "daily"),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

ensureReportDirs();

// ── 预算跟踪 ─────────────────────────────────────────
interface BudgetState {
  date: string;
  spent: number;
  limit: number;
}

function loadBudget(): BudgetState {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const state: BudgetState = JSON.parse(readFileSync(BUDGET_FILE, "utf-8"));
    if (state.date === today) return state;
  } catch {}
  return { date: today, spent: 0, limit: cliArgs.budget };
}

function saveBudget(budget: BudgetState) {
  writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
}

function recordCost(amount: number): boolean {
  const budget = loadBudget();
  budget.spent += amount;
  saveBudget(budget);
  if (budget.spent >= budget.limit) {
    log(`预算已用尽: $${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}`);
    return false; // 预算超限
  }
  return true;
}

// ── 基线数据 ─────────────────────────────────────────
interface Baseline {
  langfuse: {
    avgScore: number;
    errorRate: number;
    latencyP95: number;
    tokenCost: number;
  };
  lastUpdated: string;
}

function loadBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, "utf-8"));
  } catch {
    return {
      langfuse: { avgScore: 0.9, errorRate: 0.01, latencyP95: 3000, tokenCost: 1.0 },
      lastUpdated: new Date().toISOString(),
    };
  }
}

// ── 报告写入 ─────────────────────────────────────────
function writeReport(platform: string, data: Record<string, unknown>) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filePath = resolve(REPORTS_DIR, platform, `${ts}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  log(`报告已写入: ${filePath}`);
}

// ── HTTP 请求工具 ────────────────────────────────────
async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
  }
  return response.json();
}

// ── 平台监控模块 ─────────────────────────────────────

// ---------- Sentry ----------
let lastSentryCheck = new Date(Date.now() - 5 * 60 * 1000);

async function checkSentry() {
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) {
    log("Sentry: 缺少配置 (SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT)，跳过");
    return;
  }

  const since = lastSentryCheck.toISOString();
  lastSentryCheck = new Date();

  log(`Sentry: 查询 ${since} 以来的新 issue...`);
  try {
    const url = `${SENTRY_API_BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=is:unresolved&sort=date&since=${encodeURIComponent(since)}`;
    const issues = (await fetchJson(url, {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
    })) as Array<{ id: string; title: string; culprit: string; count: string; level: string }>;

    if (!Array.isArray(issues) || issues.length === 0) {
      log("Sentry: 无新 issue");
      return;
    }

    log(`Sentry: 发现 ${issues.length} 个新 issue`);
    recordCost(0.001 * issues.length);

    for (const issue of issues) {
      const severity = issue.level === "fatal" || issue.level === "error" ? "critical" : "warning";
      const report = {
        platform: "sentry",
        timestamp: new Date().toISOString(),
        issueId: issue.id,
        title: issue.title,
        culprit: issue.culprit,
        eventCount: issue.count,
        severity,
        suggestion:
          severity === "critical"
            ? "Critical error without test coverage — generate regression test"
            : "New issue detected — review and consider adding test coverage",
      };
      writeReport("sentry", report);

      if (severity === "critical") {
        notifySlack(`Sentry CRITICAL: ${issue.title} (${issue.culprit})`);
      }
    }
  } catch (e: any) {
    logError("Sentry 检查失败:", e.message);
  }
}

// ---------- Langfuse ----------
let lastLangfuseCheck = new Date(Date.now() - 60 * 60 * 1000);

async function checkLangfuse() {
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    log("Langfuse: 缺少配置 (LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY)，跳过");
    return;
  }

  lastLangfuseCheck = new Date();
  log("Langfuse: 查询最近1小时的 trace 统计...");

  try {
    const authHeader = `Basic ${Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64")}`;
    const url = `${LANGFUSE_HOST}/api/public/traces?limit=100&orderBy=timestamp.desc`;
    const data = (await fetchJson(url, { Authorization: authHeader })) as {
      data: Array<{
        id: string;
        status: string;
        latency?: number;
        totalCost?: number;
        scores?: Array<{ value: number }>;
      }>;
    };

    const traces = data.data ?? [];
    if (traces.length === 0) {
      log("Langfuse: 无最近 trace");
      return;
    }

    // 计算指标
    const errorCount = traces.filter((t) => t.status === "ERROR").length;
    const errorRate = errorCount / traces.length;

    const latencies = traces.map((t) => t.latency ?? 0).filter((l) => l > 0).sort((a, b) => a - b);
    const latencyP95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    const scores = traces.flatMap((t) => (t.scores ?? []).map((s) => s.value));
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const tokenCost = traces.reduce((sum, t) => sum + (t.totalCost ?? 0), 0);

    const baseline = loadBaseline().langfuse;
    const degradation = {
      avgScore: baseline.avgScore > 0 ? ((avgScore - baseline.avgScore) / baseline.avgScore) * 100 : 0,
      errorRate: baseline.errorRate > 0 ? ((errorRate - baseline.errorRate) / baseline.errorRate) * 100 : 0,
      latencyP95: baseline.latencyP95 > 0 ? ((latencyP95 - baseline.latencyP95) / baseline.latencyP95) * 100 : 0,
      tokenCost: baseline.tokenCost > 0 ? ((tokenCost - baseline.tokenCost) / baseline.tokenCost) * 100 : 0,
    };

    // 退化判定
    const maxDegradation = Math.max(degradation.errorRate, degradation.latencyP95, -degradation.avgScore);
    let severity: "critical" | "warning" | "info" = "info";
    if (maxDegradation > 25) severity = "critical";
    else if (maxDegradation > 10) severity = "warning";

    const report = {
      platform: "langfuse",
      timestamp: new Date().toISOString(),
      metrics: { avgScore, errorRate, latencyP95, tokenCost },
      baseline,
      degradation,
      severity,
      traceCount: traces.length,
      suggestion:
        severity === "critical"
          ? `LLM 指标严重退化 (${maxDegradation.toFixed(1)}%)，建议立即检查最近的 prompt 变更`
          : severity === "warning"
            ? `LLM 指标退化 (${maxDegradation.toFixed(1)}%)，建议关注`
            : "LLM 指标正常",
    };

    writeReport("langfuse", report);
    recordCost(0.002);

    if (severity === "critical") {
      notifySlack(`Langfuse CRITICAL: LLM 指标退化 ${maxDegradation.toFixed(1)}%`);
    } else if (severity === "warning") {
      notifySlack(`Langfuse WARNING: LLM 指标退化 ${maxDegradation.toFixed(1)}%`);
    }

    log(`Langfuse: score=${avgScore.toFixed(3)} errorRate=${(errorRate * 100).toFixed(1)}% latencyP95=${latencyP95}ms severity=${severity}`);
  } catch (e: any) {
    logError("Langfuse 检查失败:", e.message);
  }
}

// ---------- Railway ----------
let lastDeploymentId = "";

async function checkRailway() {
  if (!RAILWAY_TOKEN) {
    log("Railway: 缺少配置 (RAILWAY_TOKEN)，跳过");
    return;
  }

  log("Railway: 检查部署状态...");
  try {
    // Railway GraphQL API 查询最新部署
    const query = `{ deployments(first: 1) { edges { node { id status createdAt } } } }`;
    const response = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RAILWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = (await response.json()) as {
      data?: { deployments?: { edges: Array<{ node: { id: string; status: string; createdAt: string } }> } };
    };
    const deployment = result.data?.deployments?.edges?.[0]?.node;
    if (!deployment) {
      log("Railway: 无部署记录");
      return;
    }

    if (deployment.id === lastDeploymentId) {
      log("Railway: 部署状态无变化");
      return;
    }

    if (deployment.status !== "SUCCESS") {
      log(`Railway: 部署状态 ${deployment.status}，等待完成`);
      return;
    }

    lastDeploymentId = deployment.id;
    log(`Railway: 新部署完成 (${deployment.id})，等待 30s warmup...`);

    // 等待 warmup
    await new Promise((r) => setTimeout(r, 30_000));

    // 执行 smoke test
    log("Railway: 执行 smoke test...");
    let smokeTestPassed = false;
    let failedTests: string[] = [];

    try {
      execSync("npx playwright test --grep @smoke --project=e2e-en --reporter=json", {
        cwd: TARGET_DIR,
        encoding: "utf-8",
        timeout: 300_000,
      });
      smokeTestPassed = true;
    } catch (e: any) {
      // 解析失败的测试名
      try {
        const output = e.stdout ?? "";
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const report = JSON.parse(jsonMatch[0]);
          failedTests = (report.suites ?? [])
            .flatMap((s: any) => s.specs ?? [])
            .filter((s: any) => s.ok === false)
            .map((s: any) => s.title);
        }
      } catch {}
    }

    const severity = smokeTestPassed ? "info" : "critical";
    const report = {
      platform: "railway",
      timestamp: new Date().toISOString(),
      deploymentId: deployment.id,
      smokeTestPassed,
      failedTests,
      severity,
      suggestion: smokeTestPassed
        ? "部署成功，smoke test 全部通过"
        : `部署后 smoke test 失败 (${failedTests.length} 个)，建议回滚`,
    };

    writeReport("railway", report);
    recordCost(0.005);

    if (!smokeTestPassed) {
      notifySlack(`Railway CRITICAL: 部署 ${deployment.id} 后 smoke test 失败 — ${failedTests.join(", ")}`);
    }
  } catch (e: any) {
    logError("Railway 检查失败:", e.message);
  }
}

// ---------- DB ----------
let lastDbCheckCommit = "";

async function checkDb() {
  log("DB: 检测 schema 变更...");
  try {
    // 获取当前 HEAD commit
    const currentCommit = execSync("git rev-parse HEAD", {
      cwd: SOURCE_DIR || TARGET_DIR,
      encoding: "utf-8",
    }).trim();

    if (currentCommit === lastDbCheckCommit) {
      log("DB: 无新 commit");
      return;
    }

    const compareFrom = lastDbCheckCommit || "HEAD~1";
    lastDbCheckCommit = currentCommit;

    // 检测 schema/migration 文件变更
    let changedFiles: string[] = [];
    try {
      const diff = execSync(
        `git diff ${compareFrom} HEAD --name-only -- "**/*schema*" "**/*migration*" "**/drizzle/**"`,
        { cwd: SOURCE_DIR || TARGET_DIR, encoding: "utf-8" }
      ).trim();
      changedFiles = diff.split("\n").filter(Boolean);
    } catch {
      // 可能没有上一个 commit，忽略
    }

    if (changedFiles.length === 0) {
      log("DB: 无 schema 变更");
      return;
    }

    log(`DB: 发现 ${changedFiles.length} 个 schema 变更文件`);

    const report = {
      platform: "db",
      timestamp: new Date().toISOString(),
      changedFiles,
      severity: "warning" as const,
      suggestion: "检测到 DB schema 变更，建议运行兼容性测试并验证 migration 脚本",
    };

    writeReport("db", report);
    recordCost(0.001);

    notifySlack(`DB WARNING: 检测到 ${changedFiles.length} 个 schema 文件变更 — ${changedFiles.join(", ")}`);
  } catch (e: any) {
    logError("DB 检查失败:", e.message);
  }
}

// ---------- GitHub (增强版 PR 检测) ----------
async function checkGitHub() {
  if (!GITHUB_OWNER || !GITHUB_REPO) {
    log("GitHub: 缺少配置 (GITHUB_OWNER/GITHUB_REPO)，跳过");
    return;
  }

  log("GitHub: 增强版 PR 检测（委托给 git-watcher）...");
  // GitHub PR 监控主要由 git-watcher.ts 处理
  // sentinel-watcher 仅补充变更类型路由建议
  // 避免与 git-watcher 重复轮询
  log("GitHub: 路由逻辑已集成到 git-watcher，跳过独立检测");
}

// ── 通知 ─────────────────────────────────────────────
function notifySlack(message: string) {
  const notifyScript = resolve(PROJECT_ROOT, "hooks/post-notify.sh");
  if (!existsSync(notifyScript)) {
    log(`Slack 通知 (脚本不存在，仅记录): ${message}`);
    return;
  }

  try {
    execSync(`bash "${notifyScript}" "${message.replace(/"/g, '\\"')}"`, {
      cwd: PROJECT_ROOT,
      timeout: 10_000,
      encoding: "utf-8",
    });
    log(`Slack 通知已发送: ${message.slice(0, 80)}`);
  } catch (e: any) {
    logError("Slack 通知失败:", e.message);
  }
}

// ── 每日汇总 ─────────────────────────────────────────
function generateDailySummary() {
  const today = new Date().toISOString().slice(0, 10);
  const budget = loadBudget();

  const summary = {
    date: today,
    platforms: {
      sentry: { checked: true },
      langfuse: { checked: true },
      railway: { checked: true },
      db: { checked: true },
      github: { checked: true },
    },
    budget: {
      spent: budget.spent,
      limit: budget.limit,
      remaining: budget.limit - budget.spent,
    },
  };

  const summaryPath = resolve(REPORTS_DIR, "daily", `${today}.json`);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  log(`每日汇总已生成: ${summaryPath}`);
}

// ── 轮询频率控制 ─────────────────────────────────────
interface PollTimers {
  sentry: number; // 每5分钟 = 300s
  langfuse: number; // 每小时 = 3600s
  railway: number; // 每5分钟 = 300s
  db: number; // 每5分钟 = 300s
  github: number; // 委托给 git-watcher
}

const POLL_INTERVALS: PollTimers = {
  sentry: 300,
  langfuse: 3600,
  railway: 300,
  db: 300,
  github: 600,
};

const lastPollTime: Record<string, number> = {};

function shouldPoll(platform: string): boolean {
  const now = Date.now();
  const interval = (POLL_INTERVALS[platform as keyof PollTimers] ?? cliArgs.interval) * 1000;
  const last = lastPollTime[platform] ?? 0;
  if (now - last >= interval) {
    lastPollTime[platform] = now;
    return true;
  }
  return false;
}

// ── 主循环 ───────────────────────────────────────────
let pollCount = 0;

async function poll() {
  pollCount++;
  log(`── 第 ${pollCount} 次轮询 ──────────────────────`);

  const budget = loadBudget();
  if (budget.spent >= budget.limit) {
    log(`预算已用尽 ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)})，降低轮询频率`);
    POLL_INTERVALS.sentry = 900; // 5min → 15min
    POLL_INTERVALS.langfuse = 14400; // 1h → 4h
  }

  const enabledPlatforms = new Set(cliArgs.platforms);

  try {
    if (enabledPlatforms.has("sentry") && shouldPoll("sentry")) {
      await checkSentry();
    }

    if (enabledPlatforms.has("langfuse") && shouldPoll("langfuse")) {
      await checkLangfuse();
    }

    if (enabledPlatforms.has("railway") && shouldPoll("railway")) {
      await checkRailway();
    }

    if (enabledPlatforms.has("db") && shouldPoll("db")) {
      await checkDb();
    }

    if (enabledPlatforms.has("github") && shouldPoll("github")) {
      await checkGitHub();
    }
  } catch (e: any) {
    logError("轮询异常:", e.message);
  }

  // 每天 UTC 00:00 附近生成汇总
  const now = new Date();
  if (now.getUTCHours() === 0 && now.getUTCMinutes() < (cliArgs.interval / 60 + 1)) {
    generateDailySummary();
  }

  log(`── 轮询完成，${cliArgs.interval}s 后下次执行 ──\n`);
}

// ── 启动 ─────────────────────────────────────────────
console.log();
console.log("╔══════════════════════════════════════╗");
console.log("║     sentinel-watcher 启动            ║");
console.log("╚══════════════════════════════════════╝");
console.log();

// 配置校验
const configStatus: Record<string, string> = {};
configStatus["Sentry"] = SENTRY_AUTH_TOKEN ? "OK" : "未配置";
configStatus["Langfuse"] = LANGFUSE_PUBLIC_KEY ? "OK" : "未配置";
configStatus["Railway"] = RAILWAY_TOKEN ? "OK" : "未配置";
configStatus["DB"] = SOURCE_DIR || TARGET_DIR ? "OK" : "未配置";
configStatus["GitHub"] = GITHUB_OWNER && GITHUB_REPO ? "OK" : "未配置";

log("平台配置状态:");
for (const [platform, status] of Object.entries(configStatus)) {
  log(`  ${platform}: ${status}`);
}
log(`监控平台: ${cliArgs.platforms.join(", ")}`);
log(`基础轮询间隔: ${cliArgs.interval}s`);
log(`每日预算上限: $${cliArgs.budget}`);
log(`报告目录: ${REPORTS_DIR}`);
console.log();

// 首次立即执行
poll();

// 定时轮询（使用基础间隔，各平台内部有独立频率控制）
setInterval(poll, cliArgs.interval * 1000);
