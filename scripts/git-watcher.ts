import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
config({ path: resolve(PROJECT_ROOT, ".env") });

// ── 单实例锁 ────────────────────────────────────────
const LOCK_FILE = resolve(PROJECT_ROOT, ".git-watcher.pid");

function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    const oldPid = Number(readFileSync(LOCK_FILE, "utf-8").trim());
    if (oldPid && isProcessAlive(oldPid)) {
      console.error(`[git-watcher] another instance is already running (pid ${oldPid}), exiting.`);
      process.exit(0);
    }
    console.log(`[git-watcher] stale lock found (pid ${oldPid}), taking over.`);
  }
  writeFileSync(LOCK_FILE, String(process.pid));
}

function releaseLock() {
  try {
    const content = readFileSync(LOCK_FILE, "utf-8").trim();
    if (Number(content) === process.pid) unlinkSync(LOCK_FILE);
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
process.on("SIGINT", () => { releaseLock(); process.exit(0); });
process.on("SIGTERM", () => { releaseLock(); process.exit(0); });

const TARGET_DIR = process.env.TARGET_PROJECT_DIR ?? "";
const TARGET_BRANCH = process.env.TARGET_BRANCH ?? "main";
const OWNER = process.env.GITHUB_OWNER ?? "";
const REPO = process.env.GITHUB_REPO ?? "";
const INTERVAL = Number(process.env.WATCHER_INTERVAL ?? 20) * 1000;

interface PRInfo {
  number: number;
  title: string;
  body: string;
  headRefName: string;
  headRefOid: string;
  updatedAt: string;
}

interface PRState {
  headRefOid: string;
  updatedAt: string;
  title: string;
  body: string;
}

const STATE_FILE = resolve(PROJECT_ROOT, ".pr-state.json");

function loadState(): Record<number, PRState> {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveState() {
  writeFileSync(STATE_FILE, JSON.stringify(knownPRs, null, 2));
}

const knownPRs: Record<number, PRState> = loadState();

function run(cmd: string, cwd?: string, retries = 3): string {
  for (let i = 0; i < retries; i++) {
    try {
      return execSync(cmd, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
    } catch (e: any) {
      if (i < retries - 1 && e.message?.includes("EOF")) {
        continue;
      }
      throw e;
    }
  }
  return "";
}

function extractLinearIssues(text: string): string[] {
  return [...new Set(
    [...text.matchAll(/[A-Z]{2,10}-\d+/g)].map((m) => m[0])
  )];
}

function triggerCommand(command: string, args: string = ""): boolean {
  const cmd = `claude -p "${`${command} ${args}`.trim()}"`;
  console.log(`  → trigger: ${cmd}`);
  try {
    execSync(cmd, { cwd: PROJECT_ROOT, stdio: "inherit", timeout: 14_400_000 });
    return true;
  } catch (e: any) {
    console.error(`  → command failed:`, e.message);
    return false;
  }
}

interface ReportResult {
  passed: boolean;
  content: string;
}

function parseReport(): ReportResult {
  const summaryPath = resolve(TARGET_DIR, "tests/reports/combined/summary.md");
  if (existsSync(summaryPath)) {
    const content = readFileSync(summaryPath, "utf-8");
    // "## 失败用例" 段落后紧跟 "无失败用例" → 通过，否则失败
    const passed = content.includes("无失败用例");
    return { passed, content };
  }
  return { passed: false, content: "报告文件未生成" };
}

function commentOnPRs(prNumbers: number[], cmdSuccess: boolean) {
  const report = parseReport();
  // 命令本身崩溃 OR 报告解析出失败 → 失败
  const passed = cmdSuccess && report.passed;
  const status = passed ? "✅ 通过" : "❌ 失败";
  const body = `## QA 自动化测试结果\n\n**结果：${status}**\n\n<details>\n<summary>详情</summary>\n\n${report.content}\n\n</details>`;

  for (const prNum of prNumbers) {
    try {
      run(`gh pr comment ${prNum} --repo ${OWNER}/${REPO} --body ${JSON.stringify(body)}`);
      console.log(`  → commented on PR #${prNum}: ${status}`);
    } catch (e: any) {
      console.error(`  → failed to comment on PR #${prNum}:`, e.message);
    }
  }
}

function check() {
  const now = new Date().toLocaleTimeString();
  try {
    const raw = run(
      `gh pr list --repo ${OWNER}/${REPO} --state open --json number,title,body,headRefName,headRefOid,updatedAt --limit 10`
    );
    const prs: PRInfo[] = JSON.parse(raw);
    if (prs.length === 0) {
      console.log(`[${now}] no open PRs`);
      return;
    }

    const newPrs: PRInfo[] = [];
    const codePushed: PRInfo[] = [];
    const infoUpdated: PRInfo[] = [];

    for (const pr of prs) {
      const prev = knownPRs[pr.number];
      if (!prev) {
        newPrs.push(pr);
      } else if (prev.headRefOid !== pr.headRefOid) {
        codePushed.push(pr);
      } else if (prev.updatedAt !== pr.updatedAt) {
        infoUpdated.push(pr);
      }
    }

    const hasChanges = newPrs.length > 0 || codePushed.length > 0 || infoUpdated.length > 0;
    if (!hasChanges) {
      console.log(`[${now}] ${prs.length} open PRs, no changes`);
      // 更新状态（PR 可能被关闭/新增）
      syncState(prs);
      return;
    }

    // 新 PR / code push：拉代码 + 收集所有 issue 后统一触发一次
    if (newPrs.length > 0 || codePushed.length > 0) {
      try {
        run(`git fetch origin ${TARGET_BRANCH} --quiet`, TARGET_DIR);
        run(`git pull origin ${TARGET_BRANCH} --quiet`, TARGET_DIR);
      } catch (e: any) {
        console.error(`[${now}] git pull failed:`, e.message);
      }

      // 收集所有变更 PR 的 Linear issue（去重）
      const allIssues: Set<string> = new Set();
      const affectedPRs = [...newPrs, ...codePushed];
      for (const pr of affectedPRs) {
        const type = newPrs.includes(pr) ? "🆕 NEW PR" : "📦 CODE PUSHED";
        console.log(`[${now}] ${type} #${pr.number}: ${pr.title}`);
        for (const issue of extractLinearIssues(pr.body ?? "")) {
          allIssues.add(issue);
        }
      }

      // 统一触发一次，收集结果
      let passed: boolean;
      if (allIssues.size > 0) {
        const issueList = [...allIssues].join(" ");
        console.log(`  → Linear issues collected: ${issueList}`);
        passed = triggerCommand("/qa-from-issue", issueList);
      } else {
        console.log(`  → no Linear issues found, running qa-run-all`);
        passed = triggerCommand("/qa-run-all");
      }

      // 给所有相关 PR 添加评论
      commentOnPRs(affectedPRs.map((p) => p.number), passed);
    }

    // info update → 仅记录，不触发测试（避免评论→updatedAt→再触发的死循环）
    if (infoUpdated.length > 0) {
      for (const pr of infoUpdated) {
        console.log(`[${now}] 💬 INFO UPDATED PR #${pr.number}: ${pr.title} (skip, no code change)`);
      }
    }

    // 评论会更新 PR 的 updatedAt，必须重新获取最新状态，否则下次轮询会误判为 info update
    const freshRaw = run(
      `gh pr list --repo ${OWNER}/${REPO} --state open --json number,title,body,headRefName,headRefOid,updatedAt --limit 10`
    );
    syncState(JSON.parse(freshRaw));
  } catch (err: any) {
    console.error(`[${now}] error:`, err.message);
  }
}

function syncState(prs: PRInfo[]) {
  // 清除已关闭的 PR
  const openIds = new Set(prs.map((p) => p.number));
  for (const id of Object.keys(knownPRs)) {
    if (!openIds.has(Number(id))) delete knownPRs[Number(id)];
  }
  // 更新所有 PR 状态
  for (const pr of prs) {
    knownPRs[pr.number] = {
      headRefOid: pr.headRefOid,
      updatedAt: pr.updatedAt,
      title: pr.title,
      body: pr.body,
    };
  }
  saveState();
}

// ── 启动 ─────────────────────────────────────────
console.log(`[git-watcher] started`);
console.log(`[git-watcher] repo: ${OWNER}/${REPO} (${TARGET_BRANCH})`);
console.log(`[git-watcher] interval: ${INTERVAL / 1000}s`);
console.log(`[git-watcher] target: ${TARGET_DIR}`);
console.log();

check();
setInterval(check, INTERVAL);
