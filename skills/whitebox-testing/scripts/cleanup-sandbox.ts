#!/usr/bin/env bun
/**
 * cleanup-sandbox.ts — 删除 Mode B 沙箱 worktree（Windows 长路径安全）。
 *
 * git config core.longpaths true 让 git 自身用扩展长路径删除深层 node_modules，
 * 已实测验证可行（504 字符路径下 remove 正常成功）。robocopy /MIR 兜底只在极端情况
 * 触发（如某些 git 版本不吃这个设置）。
 *
 * Usage:
 *   bun cleanup-sandbox.ts --source <mira-root> --sandbox <sandbox-abs-path>
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const get = (flag: string): string | null => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] ?? null : null;
};

const sourceDir = get("--source");
const sandboxDir = get("--sandbox");

if (!sourceDir || !sandboxDir) {
  console.error("Usage: bun cleanup-sandbox.ts --source <mira-root> --sandbox <sandbox-abs-path>");
  process.exit(2);
}

// 安全护栏：只允许清理位于 SOURCE_PROJECT_DIR/.qa-sandboxes/ 下的目录。
const expectedParent = path.join(path.resolve(sourceDir), ".qa-sandboxes");
const resolvedSandbox = path.resolve(sandboxDir);
if (!resolvedSandbox.startsWith(expectedParent + path.sep) && resolvedSandbox !== expectedParent) {
  console.error(`❌ 拒绝清理：${resolvedSandbox} 不在预期的沙箱目录 ${expectedParent} 内部`);
  process.exit(1);
}

function git(gitArgs: string[]): { ok: boolean; output: string } {
  const r = spawnSync("git", ["-C", sourceDir!, ...gitArgs], { encoding: "utf-8" });
  return { ok: r.status === 0, output: (r.stdout ?? "") + (r.stderr ?? "") };
}

if (!existsSync(resolvedSandbox)) {
  git(["worktree", "prune"]);
  console.log(`✓ ${resolvedSandbox} 不存在，无需清理`);
  process.exit(0);
}

if (process.platform === "win32" && git(["config", "--get", "core.longpaths"]).output.trim() !== "true") {
  git(["config", "core.longpaths", "true"]);
}

const removeResult = git(["worktree", "remove", "--force", resolvedSandbox]);
if (!removeResult.ok) console.log(`⚠ git worktree remove 返回非零: ${removeResult.output.trim()}`);

// robocopy /MIR 兜底：仅当 core.longpaths 仍不够用、目录还在时才触发。
if (existsSync(resolvedSandbox)) {
  console.log(`⚠ 目录仍然存在，走 robocopy 兜底清理: ${resolvedSandbox}`);
  if (process.platform === "win32") {
    const emptyDir = mkdtempSync(path.join(tmpdir(), "qa-sandbox-purge-"));
    try {
      const rc = spawnSync(
        "robocopy",
        [emptyDir, resolvedSandbox, "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS", "/NP"],
        { encoding: "utf-8" },
      );
      if ((rc.status ?? 0) >= 8) { // robocopy: 0-7 = success, ≥8 = real failure
        console.error(`❌ robocopy 清空失败 (exit ${rc.status}): ${resolvedSandbox}`);
        process.exit(1);
      }
      rmSync(resolvedSandbox, { recursive: true, force: true });
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  } else {
    spawnSync("rm", ["-rf", resolvedSandbox]);
  }
}

git(["worktree", "prune"]);

// 实地验证，不只信退出码。
if (existsSync(resolvedSandbox)) {
  console.error(`❌ 清理失败，${resolvedSandbox} 仍然存在，需要人工介入`);
  process.exit(1);
}
if (git(["worktree", "list"]).output.includes(resolvedSandbox)) {
  console.error(`❌ 清理失败，git worktree list 仍能看到 ${resolvedSandbox}`);
  process.exit(1);
}
console.log(`✓ 沙箱已彻底清理: ${resolvedSandbox}`);
