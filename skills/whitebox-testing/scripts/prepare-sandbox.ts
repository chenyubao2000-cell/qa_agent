#!/usr/bin/env bun
/**
 * prepare-sandbox.ts — Mode B 沙箱创建：git worktree + node_modules 模板复制。
 *
 * 之前是 qa-whitebox.md Phase 2 里 ~60 行 PowerShell，靠模型在对话里"抄"出来执行，
 * 和项目里其余确定性阶段（classify-diff.ts / run-mode-a.ts / cleanup-sandbox.ts）
 * 的"脚本执行、非 LLM"模式不一致。这里收成一个脚本，qa-whitebox.md 只留调用。
 *
 * 模板策略：node_modules 从模板整体复制，不用 junction/symlink 连到真实项目——
 * 沙箱和真实项目、和模板本身都不共享物理文件。模板只有 lockfile 变化时才重建。
 *
 * Usage:
 *   bun prepare-sandbox.ts --source <mira-root> --head <sha> --sandbox <sandbox-abs-path>
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (flag: string): string | null => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] ?? null : null;
};

const sourceDir = get("--source");
const head = get("--head");
const sandboxDir = get("--sandbox");

if (!sourceDir || !head || !sandboxDir) {
  console.error("Usage: bun prepare-sandbox.ts --source <mira-root> --head <sha> --sandbox <sandbox-abs-path>");
  process.exit(2);
}

const resolvedSource = path.resolve(sourceDir);
const resolvedSandbox = path.resolve(sandboxDir);

// 安全护栏：沙箱必须在 SOURCE_PROJECT_DIR/.qa-sandboxes/ 下（原因见 prd-driven-flow.md §五）。
const expectedParent = path.join(resolvedSource, ".qa-sandboxes");
if (!resolvedSandbox.startsWith(expectedParent + path.sep) && resolvedSandbox !== expectedParent) {
  console.error(`❌ 拒绝创建：${resolvedSandbox} 不在预期的沙箱目录 ${expectedParent} 内部`);
  process.exit(1);
}

function run(cmd: string, cmdArgs: string[], cwd?: string): { ok: boolean; output: string } {
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: "utf-8" });
  return { ok: r.status === 0, output: (r.stdout ?? "") + (r.stderr ?? "") };
}

function copyTree(src: string, dest: string): void {
  mkdirSync(path.dirname(dest), { recursive: true });
  if (process.platform === "win32") {
    // maxBuffer 拉大：默认 1MB 在大目录树上可能被 robocopy 的 stdout 打满，spawnSync 会杀掉
    // 子进程并把 status 设成 null——`(rc.status ?? 0) >= 8` 这种写法会把 null 誤判成 0（成功），
    // 静默漏拷；status === null 必须单独判定为失败，不能靠 ?? 兜底。
    const rc = spawnSync("robocopy", [src, dest, "/E", "/MT:8", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/NP"], {
      maxBuffer: 64 * 1024 * 1024,
    });
    if (rc.error) throw new Error(`robocopy 启动失败: ${src} → ${dest}: ${rc.error.message}`);
    if (rc.status === null) throw new Error(`robocopy 未正常退出（被信号终止或超过 maxBuffer）: ${src} → ${dest}`);
    if (rc.status >= 8) throw new Error(`robocopy 拷贝失败 (exit ${rc.status}): ${src} → ${dest}`);
  } else {
    cpSync(src, dest, { recursive: true });
  }
}

/** apps/* 和 packages/* 下每个含 node_modules 的包，相对 root 的路径。 */
function listPackageNodeModules(root: string): string[] {
  const rels: string[] = [];
  for (const group of ["apps", "packages"]) {
    const groupDir = path.join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.join(group, entry.name);
      if (existsSync(path.join(root, rel, "node_modules"))) rels.push(rel);
    }
  }
  return rels;
}

// ── 1. git worktree add ───────────────────────────────────────────────────────

if (existsSync(resolvedSandbox)) {
  console.error(`❌ ${resolvedSandbox} 已存在，请先用 cleanup-sandbox.ts 清理`);
  process.exit(1);
}
mkdirSync(expectedParent, { recursive: true });
const worktreeResult = run("git", ["-C", resolvedSource, "worktree", "add", "--detach", resolvedSandbox, head]);
if (!worktreeResult.ok) {
  console.error(`❌ git worktree add 失败: ${worktreeResult.output.trim()}`);
  process.exit(1);
}
console.log(`✓ 沙箱 worktree 已创建: ${resolvedSandbox}`);

// ── 2. node_modules 模板：只有 lockfile 变化时才重建 ───────────────────────────

const templateDir = path.join(resolvedSource, ".qa-sandbox-node-modules-template");
const lockfile = readdirSync(resolvedSource).find(f => f.startsWith("bun.lock"));
if (!lockfile) {
  console.error(`❌ ${resolvedSource} 下找不到 bun.lock*`);
  process.exit(1);
}
const lockHash = createHash("sha256").update(readFileSync(path.join(resolvedSource, lockfile))).digest("hex");
const markerPath = path.join(templateDir, ".lockfile-hash");
const currentMarker = existsSync(markerPath) ? readFileSync(markerPath, "utf-8").trim() : null;

if (currentMarker !== lockHash) {
  console.log("模板缺失或 lockfile 已变化，重建模板...");
  // 在真实项目根目录装一次依赖——安全：SOURCE_PROJECT_DIR 就是真实项目本身，装的也是它自己要用的依赖。
  const install = run("bun", ["install"], resolvedSource);
  if (!install.ok) {
    console.error(`❌ bun install 失败: ${install.output.trim()}`);
    process.exit(1);
  }
  rmSync(templateDir, { recursive: true, force: true });
  mkdirSync(templateDir, { recursive: true });
  for (const rel of listPackageNodeModules(resolvedSource)) {
    copyTree(path.join(resolvedSource, rel, "node_modules"), path.join(templateDir, rel, "node_modules"));
  }
  writeFileSync(markerPath, lockHash, "utf-8");
  console.log(`✓ 模板已重建: ${templateDir}`);
} else {
  console.log(`✓ 模板已是最新（lockfile 未变），复用 ${templateDir}，跳过 install`);
}

// ── 3. 把模板复制进本次沙箱（每次运行都做——纯本地磁盘拷贝，不联网、不跑 bun） ──────

for (const rel of listPackageNodeModules(templateDir)) {
  copyTree(path.join(templateDir, rel, "node_modules"), path.join(resolvedSandbox, rel, "node_modules"));
}
console.log("✓ node_modules 已从模板复制到沙箱（与真实项目、与模板本身都无共享物理文件）");
console.log("提示：沙箱内不要跑 bun install——依赖版本会跟模板脱节，且沙箱本来就要整个删除。");
