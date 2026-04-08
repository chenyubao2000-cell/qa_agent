/**
 * git-watcher — PR 变更监控守护进程
 *
 * 定时轮询 GitHub 仓库的 open PR 列表，检测三类变更：
 *   1. 🆕 新 PR      → checkout PR 分支 + 触发 QA 流水线
 *   2. 📦 代码推送    → checkout PR 分支 + 触发 QA 流水线
 *   3. 💬 信息更新    → 仅记录，不触发（避免评论→updatedAt→再触发的死循环）
 *
 * 触发规则：
 *   - PR title/body 中包含 Linear issue key → /qa-from-issue（CDP 探查 + 生成用例 + 测试）
 *   - 否则 → /qa-run（跑已有测试）
 *   - 测试完成后自动在 PR 上评论结构化报告（同一 commit 不重复评论）
 *
 * CDP 支持：启动时生成 headless MCP 配置（chrome-devtools --headless），
 * 通过 claude -p --mcp-config 传入，使 /qa-from-issue 的 CDP 探查在后台正常工作。
 *
 * 启动方式：npx tsx scripts/git-watcher.ts
 * 单实例保护：通过 .git-watcher.pid 文件锁实现
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
config({ path: resolve(PROJECT_ROOT, ".env") });

// ── 日志工具 ──────────────────────────────────────────
const TAG = "[git-watcher]";

function log(...args: unknown[]) {
  const ts = new Date().toLocaleTimeString();
  console.log(`${TAG} [${ts}]`, ...args);
}

function logError(...args: unknown[]) {
  const ts = new Date().toLocaleTimeString();
  console.error(`${TAG} [${ts}] ❌`, ...args);
}

// ── 单实例锁 ──────────────────────────────────────────
// 通过 pid 文件保证同一时间只有一个 watcher 实例运行
const LOCK_FILE = resolve(PROJECT_ROOT, ".git-watcher.pid");

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

// ── 子进程清理 ──────────────────────────────────────
// 退出时杀掉本进程派生的整棵进程树，防止 claude/playwright 变僵尸
function cleanupChildren() {
  try {
    if (process.platform === "win32") {
      // wmic 查出以本进程为父的所有子进程 PID，逐个 taskkill /T 杀子树
      const wmicOut = execSync(
        `wmic process where (ParentProcessId=${process.pid}) get ProcessId`,
        { encoding: "utf-8", timeout: 10_000 }
      );
      const childPids = wmicOut.match(/\d+/g)?.map(Number) ?? [];
      for (const pid of childPids) {
        try {
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", timeout: 10_000 });
        } catch {}
      }
      if (childPids.length > 0) log(`已清理 ${childPids.length} 个子进程`);
    } else {
      execSync(`pkill -P ${process.pid}`, { stdio: "ignore", timeout: 5_000 });
      log("子进程树已清理");
    }
  } catch {
    // 可能没有子进程，忽略
  }
}

/** 通过 kill(pid, 0) 检测进程是否存活（不发送信号） */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

acquireLock();
process.on("exit", () => { cleanupChildren(); releaseLock(); });
process.on("SIGINT", () => { cleanupChildren(); releaseLock(); process.exit(0); });
process.on("SIGTERM", () => { cleanupChildren(); releaseLock(); process.exit(0); });

// ── 配置 ──────────────────────────────────────────────
const TARGET_DIR = process.env.QA_WORKSPACE_DIR ?? "";
const TARGET_BRANCH = process.env.TARGET_BRANCH ?? "main";
const OWNER = process.env.GITHUB_OWNER ?? "";
const REPO = process.env.GITHUB_REPO ?? "";
const INTERVAL = Number(process.env.WATCHER_INTERVAL ?? 20) * 1000;
const PREVIEW_URL = process.env.PREVIEW_URL ?? "";

/** 评论标记，用于去重：同一 commit 不重复评论 */
const COMMENT_MARKER = "<!-- qa-bot-report -->";

// ── Headless MCP 配置 ────────────────────────────────
// 生成一份临时 MCP 配置，chrome-devtools 以 --headless 模式启动
// 这样 claude -p 调 /qa-from-issue 时 CDP 探查可以在后台正常工作
const HEADLESS_MCP_FILE = resolve(PROJECT_ROOT, ".mcp-headless.json");

function setupHeadlessMcp() {
  // 读取用户原有 MCP 配置作为基础
  const userMcpPath = resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".claude", "mcp.json");
  let mcpConfig: Record<string, any> = { mcpServers: {} };
  try {
    mcpConfig = JSON.parse(readFileSync(userMcpPath, "utf-8"));
  } catch {}

  // 覆盖 chrome-devtools，添加 --headless 参数
  mcpConfig.mcpServers = mcpConfig.mcpServers ?? {};
  mcpConfig.mcpServers["chrome-devtools"] = {
    command: "npx",
    args: ["-y", "chrome-devtools-mcp@latest", "--headless"],
  };

  writeFileSync(HEADLESS_MCP_FILE, JSON.stringify(mcpConfig, null, 2));
  log(`headless MCP 配置已生成: ${HEADLESS_MCP_FILE}`);
}

function cleanupHeadlessMcp() {
  try { unlinkSync(HEADLESS_MCP_FILE); } catch {}
}

setupHeadlessMcp();
process.on("exit", cleanupHeadlessMcp);

/** GitHub PR 元信息（gh pr list 返回） */
interface PRInfo {
  number: number;
  title: string;
  body: string;
  headRefName: string;
  /** 最新 commit SHA，用于检测代码推送 */
  headRefOid: string;
  /** PR 最后更新时间，用于检测信息变更 */
  updatedAt: string;
}

/** 本地持久化的 PR 快照，用于与最新状态做 diff */
interface PRState {
  headRefOid: string;
  updatedAt: string;
  title: string;
  body: string;
}

// ── 状态持久化 ────────────────────────────────────────
// PR 状态存储在 .pr-state.json，跨轮询周期保留，重启后也能续上
const STATE_FILE = resolve(PROJECT_ROOT, ".pr-state.json");

function loadState(): Record<number, PRState> {
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    const count = Object.keys(state).length;
    log(`加载历史状态: ${count} 个已知 PR`);
    return state;
  } catch {
    log("无历史状态文件，首次启动");
    return {};
  }
}

function saveState() {
  writeFileSync(STATE_FILE, JSON.stringify(knownPRs, null, 2));
}

const knownPRs: Record<number, PRState> = loadState();

// ── 命令执行工具 ──────────────────────────────────────
const TRANSIENT_ERRORS = ["EOF", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "Fetch failed", "fetch failed", "socket hang up"];

function isTransientError(msg: string): boolean {
  return TRANSIENT_ERRORS.some((e) => msg.includes(e));
}

function sleepSync(ms: number) {
  execSync(`ping -n ${Math.ceil(ms / 1000) + 1} 127.0.0.1 >nul`, { stdio: "ignore" });
}

/** 执行 shell 命令，网络类错误无限重试（指数退避，上限 60s） */
function run(cmd: string, cwd?: string, maxRetries = Infinity): string {
  let attempt = 0;
  while (true) {
    try {
      return execSync(cmd, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
    } catch (e: any) {
      attempt++;
      if (attempt < maxRetries && isTransientError(e.message ?? "")) {
        const delay = Math.min(5_000 * Math.pow(2, attempt - 1), 60_000);
        log(`网络错误，${(delay / 1000).toFixed(0)}s 后重试 (${attempt}次): ${cmd.slice(0, 80)}`);
        sleepSync(delay);
        continue;
      }
      throw e;
    }
  }
}

// ── Linear issue 提取 ────────────────────────────────
// 从 PR title + body 中提取 Linear issue key（如 ENG-123）
// 排除常见技术缩写前缀，避免误匹配
const ISSUE_KEY_BLACKLIST = new Set([
  "HTTP", "UTF", "SHA", "ISO", "RFC", "TCP", "UDP", "API", "URL", "URI",
  "CSS", "HTML", "JSON", "XML", "SQL", "SSL", "TLS", "SSH", "DNS", "FTP",
]);

/** 从文本中提取所有 Linear issue key，去重并排除技术术语 */
function extractLinearIssues(text: string): string[] {
  return [...new Set(
    [...text.matchAll(/[A-Z]{2,10}-\d+/g)]
      .map((m) => m[0])
      .filter((key) => !ISSUE_KEY_BLACKLIST.has(key.split("-")[0]))
  )];
}

// ── PR 分支切换 ──────────────────────────────────────

/**
 * 用 git worktree 为 PR 创建全量代码副本。
 * - worktree 目录：PR 分支全量源码（QA 命令读源码用）
 * - 原 TARGET_DIR：不动，已生成的 spec/POM/用例安全
 */
function createWorktree(prNum: number, headBranch: string): string | null {
  const worktreePath = resolve(TARGET_DIR, `../.qa-worktree-pr`);
  log(`  创建 worktree: ${worktreePath} (分支: ${headBranch})...`);
  try {
    try { run(`git worktree remove "${worktreePath}" --force`, TARGET_DIR); } catch {}
    run("git fetch origin --quiet", TARGET_DIR);
    run(`git worktree add "${worktreePath}" origin/${headBranch}`, TARGET_DIR);
    log(`  ✅ worktree 创建成功（PR 全量代码）`);
    return worktreePath;
  } catch (e: any) {
    logError(`  worktree 创建失败: ${e.message}`);
    try { run(`git worktree remove "${worktreePath}" --force`, TARGET_DIR); } catch {}
    return null;
  }
}

function removeWorktree(worktreePath: string) {
  try {
    run(`git worktree remove "${worktreePath}" --force`, TARGET_DIR);
    log(`  worktree 已清理`);
  } catch {}
}

// ── PR 变更提取 ──────────────────────────────────────

interface ChangeInfo {
  /** 变更文件路径列表（去重） */
  files: string[];
  /** AI 生成的变更摘要（非原始 diff） */
  summary: string;
  /** PR 全量源码目录（worktree），通过 SOURCE_PROJECT_DIR 环境变量传给 QA 命令 */
  sourceDir?: string;
}

/** 获取多个 PR 的变更文件列表 + diff 摘要，传给 QA 流水线做精准测试 */
function getChanges(prNumbers: number[]): ChangeInfo {
  const files = new Set<string>();
  const diffs: string[] = [];

  for (const prNum of prNumbers) {
    log(`  获取 PR #${prNum} 变更文件...`);

    // 1. 获取文件列表
    try {
      // 优先使用 --json files，结构化输出更可靠
      // 返回结构: { "files": [{ "path": "...", "additions": N, "deletions": N }] }
      const raw = run(`gh pr view ${prNum} --repo ${OWNER}/${REPO} --json files --jq ".files[].path"`);
      if (raw) {
        for (const f of raw.split("\n").filter(Boolean)) {
          files.add(f);
        }
      }
    } catch {
      // fallback: gh pr diff --name-only（json files 在 draft PR 上可能失败）
      log(`  PR #${prNum} --json files 失败，降级到 diff --name-only`);
      try {
        const raw = run(`gh pr diff ${prNum} --repo ${OWNER}/${REPO} --name-only`);
        for (const f of raw.split("\n").filter(Boolean)) {
          files.add(f);
        }
      } catch (e: any) {
        logError(`  PR #${prNum} 变更文件获取失败:`, e.message);
      }
    }

    // 2. 获取原始 diff（用于后续 AI 摘要）
    try {
      const diff = run(`gh pr diff ${prNum} --repo ${OWNER}/${REPO}`);
      if (diff) {
        diffs.push(diff);
        log(`  PR #${prNum} diff 获取成功 (${diff.length} chars)`);
      }
    } catch (e: any) {
      logError(`  PR #${prNum} diff 获取失败:`, e.message);
    }
  }

  log(`  变更文件合计: ${files.size} 个`);

  // 3. 用 AI 将原始 diff 总结为结构化摘要
  const summary = diffs.length > 0 ? summarizeDiff(diffs.join("\n")) : "";
  return { files: [...files], summary };
}

/**
 * 调用 claude 将原始 diff 压缩为结构化摘要，包含：
 *   - 改动了哪几个点（功能/逻辑层面）
 *   - 每个改动涉及的文件和行号范围
 *   - 改动意图（修 bug / 加功能 / 重构 等）
 */
function summarizeDiff(rawDiff: string): string {
  log("  🤖 生成 diff 摘要...");
  const promptFile = resolve(PROJECT_ROOT, ".diff-summary-prompt.tmp");
  const prompt = `请用中文总结以下 git diff，输出结构化摘要。格式要求：

对每个改动点输出一条，包含：
- 改动描述（一句话说明改了什么）
- 涉及文件和行号范围
- 改动类型（新功能 / bug修复 / 重构 / 配置变更 / 测试）

示例格式：
1. 【新功能】Chat 组件新增语言切换下拉菜单
   文件: src/components/Chat.tsx L42-L68

2. 【bug修复】修复任务列表分页参数未传递的问题
   文件: src/api/tasks.ts L15, L23-L25

只输出摘要，不要输出其他内容。

---
${rawDiff}`;

  writeFileSync(promptFile, prompt);
  try {
    const summary = execSync(
      `type "${promptFile}" | claude -p --model claude-opus-4-6`,
      { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 60_000 }
    ).trim();
    log(`  摘要生成完成 (${summary.length} chars)`);
    return summary;
  } catch (e: any) {
    logError("  diff 摘要生成失败:", e.message);
    const fileLines = rawDiff.match(/^diff --git a\/(.+) b\//gm) ?? [];
    return fileLines.map((l) => `- ${l.replace("diff --git a/", "").replace(/ b\/.*/, "")}`).join("\n");
  } finally {
    try { unlinkSync(promptFile); } catch {}
  }
}

// ── QA 流水线触发 ────────────────────────────────────
/**
 * 调用 claude CLI 触发 QA slash command
 * 通过临时文件传递 prompt（避免 shell 转义问题）
 * @param changes 变更信息（文件列表 + 变更摘要）
 * @returns 命令是否执行成功
 */
function triggerCommand(command: string, args: string = "", changes?: ChangeInfo): boolean {
  // 清理上轮残留的报告文件，防止 parseReport 读到旧数据
  const oldSummary = resolve(TARGET_DIR, "tests/reports/combined/summary.md");
  try { if (existsSync(oldSummary)) unlinkSync(oldSummary); } catch {}

  let prompt = `${command} ${args}`.trim();
  // 标记由 git-watcher 触发，report-analyzer 据此跳过打开浏览器
  prompt += `\n\n_trigger: git-watcher_`;
  if (changes && changes.files.length > 0) {
    prompt += `\n\nChanged file list (changelist):\n${changes.files.map((f) => `- ${f}`).join("\n")}`;
  }
  if (changes?.summary) {
    prompt += `\n\nCode change summary (changeSummary):\n${changes.summary}`;
  }
  if (changes?.sourceDir) {
    prompt += `\n\nPR source directory (prSourceDir): ${changes.sourceDir}`;
  }
  const promptFile = resolve(PROJECT_ROOT, ".claude-prompt.tmp");
  writeFileSync(promptFile, prompt);
  // 用 type | claude -p 管道传入 prompt，--mcp-config 指定 headless MCP
  // worktree 路径通过环境变量 SOURCE_PROJECT_DIR 传递（在 execSync env 中覆盖）
  const cmd = `type "${promptFile}" | claude -p --mcp-config "${HEADLESS_MCP_FILE}"`;

  log(`▶ 触发命令: ${command} ${args}`.trim());
  if (changes?.files.length) {
    log(`  附带 changelist: ${changes.files.length} 个文件`);
  }
  if (changes?.summary) {
    log(`  附带变更摘要: ${changes.summary.length} chars`);
  }

  const RETRY_PATTERNS = ["Fetch failed", "fetch failed", "API 不可达", "连接失败", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EOF", "socket hang up"];
  const outputFile = resolve(PROJECT_ROOT, ".claude-output.tmp");

  let attempt = 0;
  while (true) {
    attempt++;
    const startTime = Date.now();
    try {
      // 通过 env 注入 SOURCE_PROJECT_DIR，QA 命令从 .env 读取源码目录
      const execEnv = { ...process.env };
      if (changes?.sourceDir) {
        execEnv.SOURCE_PROJECT_DIR = changes.sourceDir;
      }
      const output = execSync(cmd, { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 14_400_000, env: execEnv });
      process.stdout.write(output);
      writeFileSync(outputFile, output);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

      // 命令正常退出（exit code 0）即视为成功，不再检查输出内容
      // 之前检查输出中的网络关键词会误判（报告文本中可能包含 "EOF" 等词）
      log(`✅ 命令执行成功 (耗时 ${elapsed}s)`);
      try { unlinkSync(promptFile); } catch {}
      try { unlinkSync(outputFile); } catch {}
      return true;
    } catch (e: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const msg = e.message ?? "";
      if (isTransientError(msg)) {
        const delay = Math.min(30_000 * attempt, 120_000);
        log(`⚠ 命令网络异常 (耗时 ${elapsed}s)，${(delay / 1000).toFixed(0)}s 后重试 (第 ${attempt} 次)`);
        sleepSync(delay);
        writeFileSync(promptFile, prompt);
        continue;
      }
      logError(`命令执行失败 (耗时 ${elapsed}s):`, msg);
      try { unlinkSync(promptFile); } catch {}
      try { unlinkSync(outputFile); } catch {}
      return false;
    }
  }
}

// ── 报告解析 ─────────────────────────────────────────
interface ReportResult {
  passed: boolean;
  content: string;
}

/** 用模型判断测试报告是否全部通过 */
function parseReport(): ReportResult {
  const summaryPath = resolve(TARGET_DIR, "tests/reports/combined/summary.md");
  if (!existsSync(summaryPath)) {
    log("  报告文件未找到:", summaryPath);
    return { passed: false, content: "报告文件未生成" };
  }

  const content = readFileSync(summaryPath, "utf-8");
  const promptFile = resolve(PROJECT_ROOT, ".report-judge-prompt.tmp");
  const prompt = `你是测试报告分析器。阅读以下测试报告，判断 E2E 测试是否全部通过。

只输出一个 JSON 对象，不要输出其他内容：
{"passed": true/false, "failCount": 数字, "reason": "一句话说明"}

规则：
- 如果所有测试用例都通过（无失败、无错误），passed=true，failCount=0
- 如果有任何失败或错误的测试用例，passed=false，failCount=失败数量
- 如果无法判断，passed=false，failCount=-1

---
${content}`;

  writeFileSync(promptFile, prompt);
  try {
    const raw = execSync(
      `type "${promptFile}" | claude -p --model claude-sonnet-4-6`,
      { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 30_000 }
    ).trim();
    // 从输出中提取 JSON（模型可能包裹在 markdown code block 中）
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      log(`  报告解析: ${result.passed ? "全部通过" : `${result.failCount} 个失败`} — ${result.reason}`);
      return { passed: !!result.passed, content };
    }
    logError("  模型返回格式异常:", raw.slice(0, 200));
    return { passed: false, content };
  } catch (e: any) {
    logError("  报告解析失败:", e.message);
    return { passed: false, content };
  } finally {
    try { unlinkSync(promptFile); } catch {}
  }
}

// ── PR 评论 ─────────────────────────────────────────

/**
 * 将测试报告组装为结构化 PR 评论：
 *   - 隐藏标记（用于去重检测）
 *   - 标题行（✅/❌ + 状态）
 *   - 执行摘要表格（直接展示）
 *   - 失败用例（直接展示，仅失败时）
 *   - Linear 上报链接（直接展示）
 *   - 用例详情（折叠）
 */
function buildCommentBody(cmdSuccess: boolean, commitSha: string): string {
  const report = parseReport();
  const passed = cmdSuccess && report.passed;
  const icon = passed ? "✅" : "❌";
  const status = passed ? "通过" : "失败";
  const content = report.content;

  const summaryMatch = content.match(/## (?:执行摘要|Execution Summary)\s*\n([\s\S]*?)(?=\n## |$)/);
  const summaryTable = summaryMatch?.[1]?.trim() ?? "";

  const failMatch = content.match(/## (?:失败用例|Failed Test Cases)[\s\S]*?(?=\n## |$)/);
  const failSection = failMatch?.[0]?.trim() ?? "";

  const linearMatch = content.match(/## (?:Linear 上报|Linear Reporting)[\s\S]*?(?=\n## |$)/);
  const linearSection = linearMatch?.[0]?.trim() ?? "";

  // 隐藏标记嵌入 commit SHA，用于去重
  let body = `${COMMENT_MARKER}\n`;
  body += `<!-- commit: ${commitSha} -->\n`;
  body += `## ${icon} QA 自动化测试 — ${status}\n\n`;

  if (summaryTable) {
    body += `${summaryTable}\n\n`;
  }

  if (failSection && !passed) {
    body += `${failSection}\n\n`;
  }

  if (linearSection) {
    body += `${linearSection}\n\n`;
  }

  body += `<details>\n<summary>用例详情（点击展开）</summary>\n\n${content}\n\n</details>`;

  return body;
}

/**
 * 检查 PR 上是否已有针对该 commit 的评论（避免重启后重复评论）
 * 通过隐藏的 HTML 注释标记匹配
 */
function hasExistingComment(prNum: number, commitSha: string): boolean {
  const comments = run(
    `gh api repos/${OWNER}/${REPO}/issues/${prNum}/comments --jq ".[].body"`
  );
  return comments.includes(`<!-- commit: ${commitSha} -->`);
}

/** 给指定 PR 列表添加测试结果评论（同一 commit 不重复评论） */
function commentOnPRs(prs: PRInfo[], cmdSuccess: boolean) {
  // 报告文件不存在时跳过评论（命令失败、空文件夹无 spec、流水线未跑完等）
  const summaryPath = resolve(TARGET_DIR, "tests/reports/combined/summary.md");
  if (!existsSync(summaryPath)) {
    log("📝 无报告文件，跳过评论");
    return;
  }

  log(`📝 准备给 ${prs.length} 个 PR 发评论...`);

  for (const pr of prs) {
    // 去重检查：同一 commit 只评论一次
    if (hasExistingComment(pr.number, pr.headRefOid)) {
      log(`  ⏭ PR #${pr.number} 已有 commit ${pr.headRefOid.slice(0, 7)} 的评论，跳过`);
      continue;
    }

    const body = buildCommentBody(cmdSuccess, pr.headRefOid);
    const bodyFile = resolve(PROJECT_ROOT, `.pr-comment-body-${pr.number}.md`);
    writeFileSync(bodyFile, body);

    try {
      run(`gh pr comment ${pr.number} --repo ${OWNER}/${REPO} --body-file ${bodyFile}`);
      log(`  ✅ PR #${pr.number} 评论成功 (commit: ${pr.headRefOid.slice(0, 7)})`);
    } catch (e: any) {
      logError(`  PR #${pr.number} 评论失败:`, e.message);
    }

    try { unlinkSync(bodyFile); } catch {}
  }
}

// ── 主轮询 ───────────────────────────────────────────
let pollCount = 0;
/** 首次启动标记：首次只记录状态，不触发 QA */
let isFirstRun = Object.keys(knownPRs).length === 0;

/** 构建 gh pr list 命令（带 base branch 过滤） */
function ghPrListCmd(): string {
  return `gh pr list --repo ${OWNER}/${REPO} --base ${TARGET_BRANCH} --state open --json number,title,body,headRefName,headRefOid,updatedAt --limit 10`;
}

function check() {
  pollCount++;
  log(`── 第 ${pollCount} 次轮询 ──────────────────────`);

  try {
    // Step 1: 获取目标分支的 open PR（只监控 target 为 TARGET_BRANCH 的 PR）
    log(`查询 open PR 列表 (base: ${TARGET_BRANCH})...`);
    const raw = run(ghPrListCmd());
    const prs: PRInfo[] = JSON.parse(raw);

    if (prs.length === 0) {
      log("无 open PR，跳过");
      syncState(prs);
      return;
    }
    log(`发现 ${prs.length} 个 open PR (target: ${TARGET_BRANCH})`);

    // Step 2: 与上次状态做 diff，分类变更
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
      log(`${prs.length} 个 PR 无变化，等待下次轮询`);
      syncState(prs);
      return;
    }

    log(`变更检测: 新PR=${newPrs.length} 代码推送=${codePushed.length} 信息更新=${infoUpdated.length}`);

    // 首次启动：只记录状态，不触发 QA（避免一口气处理所有历史 PR）
    if (isFirstRun) {
      log("⚠ 首次启动，仅记录当前 PR 状态，不触发 QA");
      for (const pr of [...newPrs, ...codePushed]) {
        log(`  记录 PR #${pr.number}: ${pr.title} (${pr.headRefOid.slice(0, 7)})`);
      }
      isFirstRun = false;
      syncState(prs);
      return;
    }

    // Step 3: 新 PR 或代码推送 → 逐个 PR 独立处理
    // 每个 PR 单独 checkout → 测试 → 评论 → 恢复，避免混用不同 PR 的代码
    if (newPrs.length > 0 || codePushed.length > 0) {
      const affectedPRs = [...newPrs, ...codePushed];

      for (const pr of affectedPRs) {
        const type = newPrs.includes(pr) ? "🆕 新PR" : "📦 代码推送";
        log(`\n  ── 处理 ${type} #${pr.number}: ${pr.title} ──`);
        log(`  分支: ${pr.headRefName}, commit: ${pr.headRefOid.slice(0, 7)}`);

        // 状态在命令执行+评论完成后保存（非提前），确保崩溃后可重新触发
        // 3a. 从 title + body 提取 Linear issue key
        const searchText = `${pr.title}\n${pr.body ?? ""}`;
        const issues = extractLinearIssues(searchText);
        if (issues.length > 0) {
          log(`  关联 issue: ${issues.join(", ")}`);
        }

        // 3b. 获取该 PR 的变更文件 + diff 摘要
        const changes = getChanges([pr.number]);
        if (changes.files.length > 0) {
          log(`  变更文件预览: ${changes.files.slice(0, 5).join(", ")}${changes.files.length > 5 ? ` ... 共 ${changes.files.length} 个` : ""}`);
        }

        // 3c. 创建 worktree（PR 全量代码，不动原目录）
        const worktreePath = createWorktree(pr.number, pr.headRefName);
        if (worktreePath) {
          changes.sourceDir = worktreePath;
        } else {
          log("  ⚠ worktree 失败，降级使用原目录");
        }

        // 3d. 触发 QA 命令
        let passed: boolean;
        try {
          if (issues.length > 0) {
            const issueList = issues.join(" ");
            log(`  ▶ 触发 /qa-from-issue ${issueList}`);
            passed = triggerCommand("/qa-from-issue", issueList, changes);
          } else {
            log("  ▶ 触发 /qa-run");
            passed = triggerCommand("/qa-run", "", changes);
          }
        } finally {
          if (worktreePath) removeWorktree(worktreePath);
        }

        // 3e. 给该 PR 发评论（同一 commit 不重复）
        commentOnPRs([pr], passed!);

        // 3f. 命令执行+评论完成后才保存状态（崩溃时下次重启会重新触发该 PR）
        knownPRs[pr.number] = {
          headRefOid: pr.headRefOid,
          updatedAt: pr.updatedAt,
          title: pr.title,
          body: pr.body,
        };
        saveState();
        log(`  ── PR #${pr.number} 处理完成 ──\n`);
      }
    }

    // Step 4: 信息更新 → 仅记录（不触发测试，防止死循环）
    if (infoUpdated.length > 0) {
      for (const pr of infoUpdated) {
        log(`  💬 PR #${pr.number} 信息更新: ${pr.title} (跳过，无代码变更)`);
      }
    }

    // Step 5: 重新获取最新 PR 状态并持久化
    // 评论会更新 PR 的 updatedAt，必须刷新状态，否则下轮会误判为 info update
    log("刷新 PR 状态...");
    try {
      const freshRaw = run(ghPrListCmd());
      syncState(JSON.parse(freshRaw));
    } catch (e: any) {
      log(`刷新状态失败 (${e.message?.slice(0, 60)})，使用本轮数据`);
      syncState(prs);
    }
    log("── 本轮轮询完成 ──────────────────────\n");
  } catch (err: any) {
    logError("轮询异常:", err.message);
  }
}

// ── 状态同步 ─────────────────────────────────────────
/** 将最新 PR 列表同步到本地状态（清除已关闭的、更新现有的） */
function syncState(prs: PRInfo[]) {
  const openIds = new Set(prs.map((p) => p.number));

  // 清除已关闭的 PR
  const closedIds: number[] = [];
  for (const id of Object.keys(knownPRs)) {
    if (!openIds.has(Number(id))) {
      closedIds.push(Number(id));
      delete knownPRs[Number(id)];
    }
  }
  if (closedIds.length > 0) {
    log(`  清理已关闭 PR: ${closedIds.join(", ")}`);
  }

  // 更新所有 open PR 状态
  for (const pr of prs) {
    knownPRs[pr.number] = {
      headRefOid: pr.headRefOid,
      updatedAt: pr.updatedAt,
      title: pr.title,
      body: pr.body,
    };
  }
  saveState();
  log(`  状态已保存 (${prs.length} 个 PR)`);
}

// ── 启动 ─────────────────────────────────────────────
console.log();
console.log("╔══════════════════════════════════════╗");
console.log("║       git-watcher 启动               ║");
console.log("╚══════════════════════════════════════╝");
console.log();

// 配置校验
const missingConfig: string[] = [];
if (!OWNER) missingConfig.push("GITHUB_OWNER");
if (!REPO) missingConfig.push("GITHUB_REPO");
if (!TARGET_DIR) missingConfig.push("QA_WORKSPACE_DIR");

if (missingConfig.length > 0) {
  logError(`缺少必要配置: ${missingConfig.join(", ")}，请检查 .env 文件`);
  process.exit(1);
}

log(`仓库: ${OWNER}/${REPO}`);
log(`监控分支: ${TARGET_BRANCH}`);
log(`目标项目: ${TARGET_DIR}`);
log(`轮询间隔: ${INTERVAL / 1000}s`);
log(`状态文件: ${STATE_FILE}`);
if (isFirstRun) {
  log("📌 首次启动模式：本轮仅记录状态，不触发 QA");
}
console.log();

check();
setInterval(check, INTERVAL);
