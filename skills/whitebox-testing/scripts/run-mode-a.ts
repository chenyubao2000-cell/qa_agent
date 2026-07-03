#!/usr/bin/env bun
/**
 * run-mode-a.ts
 *
 * Consolidates the Mode A (Vitest) execution steps that used to be inline
 * shell/PowerShell in qa-whitebox.md Phase 6:
 *   1. generate a whitebox-only vitest.whitebox.config.ts (include scoped to
 *      $WHITEBOX_DIR, coverage.include scoped to the diffed source files)
 *   2. resolve the vitest binary through mira's bun-linked node_modules
 *      (vitest isn't on PATH; a naive relative path points at a stale .bun
 *      cache variant)
 *   3. run it with coverage, capture output to a log file
 *   4. print branches.pct as reference info (not a pass/fail gate)
 *   5. classify known failure signatures with actionable hints
 *
 * Usage:
 *   bun run-mode-a.ts --source-dir <mira-root> --whitebox-dir <dir> \
 *     --source-files <lib/a.ts,lib/b.ts> [--app-dir apps/mira-work]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── CLI 参数解析 ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get = (flag: string): string | null => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] ?? null : null;
};

const sourceFilesRaw = get("--source-files");
const appDir = get("--app-dir") ?? "apps/mira-work";
const extraAliasFile = get("--extra-alias-file");

if (!get("--source-dir") || !get("--whitebox-dir") || !sourceFilesRaw) {
  console.error("Usage: bun run-mode-a.ts --source-dir <dir> --whitebox-dir <dir> --source-files <a.ts,b.ts> [--app-dir apps/mira-work] [--extra-alias-file <json>]");
  process.exit(2);
}
// Resolve to absolute immediately: vitest runs with cwd=miraWork, so a relative
// --config path would otherwise get re-resolved against miraWork instead of the
// caller's cwd (same class of bug fixed in runner.ts for --config/--report).
const sourceDir = path.resolve(get("--source-dir")!);
const whiteboxDir = path.resolve(get("--whitebox-dir")!);

const miraWork = path.join(sourceDir, appDir);
const sourceFiles = sourceFilesRaw.split(",").map(s => s.trim()).filter(Boolean);
if (sourceFiles.length === 0) {
  console.error("❌ --source-files 不能为空（应为 classification.json modeA[].file 去掉 app-dir 前缀后的列表）");
  process.exit(2);
}

// ── 1. 必需的 stub 文件存在性检查（提前失败，报错比 vitest 原生报错更直接） ──────

const REQUIRED_STUBS = [
  "test/stubs/server-only.ts",
  "test/stubs/sentry-stub.ts",
  "test/stubs/empty-stub.ts",
  "test/stubs/langfuse-stub.ts",
  "test/stubs/mira-workspace-stub.ts",
];
const missingStubs = REQUIRED_STUBS.filter(s => !existsSync(path.join(miraWork, s)));
if (missingStubs.length > 0) {
  console.error(`❌ 缺少必需的 stub 文件（${miraWork} 下）: ${missingStubs.join(", ")}`);
  process.exit(1);
}

// ── 1b. 自动发现裸第三方 import，逐个 alias 到其在 miraWork 里的真实绝对路径 ──────
//
// 根因：测试文件物理上在 qa_agent 仓库（whiteboxDir），被测源码在 miraWork（另一个仓库）。
// vi.mock("bullmq", ...) / vi.mock("ai", ...) 这类调用要求"mock 调用处"和"真实 import 处"
// 解析到同一个 module id 才能生效——但两处物理上在两棵不同的目录树里，各自按自己所在目录
// 向上找 node_modules，很容易解析到不同的物理路径（或一边根本解析不到），导致 vi.mock 静默
// 不生效，真实模块被原样加载，几行之后表现成一个无关的断言失败（例如 bullmq/ai 都实测踩过）。
//
// 已经对 @mira/*、server-only、@sentry/*、@opentelemetry/*、@langfuse/tracing 用
// resolve.alias 精确重定向解决了这个问题——alias 按字面 specifier 全局重写，不依赖
// "从哪个目录 import"，天然让两处解析到同一个 id。这里把同一个机制通用化：扫描本次
// --source-files 的真实源码，找出所有裸（非相对、非 tsconfig @/、非上面已覆盖）的第三方
// import，自动加一条指向其在 miraWork 内真实绝对路径的 pass-through alias，而不必每出现
//一个新的第三方包就手工编辑这份脚本的硬编码列表。
//
// 只做 pass-through（指向真实实现）——如果某个具体 case 需要可控行为（mock 返回值），
// 用 --extra-alias-file 传一份 { "<specifier>": "<绝对 stub 路径>" } 覆盖，覆盖优先于
// 自动探测（同一个 specifier 出现在两处时，取 --extra-alias-file 的值）。

const HARDCODED_ALIAS_SPECIFIERS = new Set([
  "@", "server-only", "@sentry/nextjs", "@sentry/node",
  "@opentelemetry/api", "@opentelemetry/core", "@opentelemetry/sdk-trace-base",
  "@langfuse/tracing",
]);

function isBareThirdPartySpecifier(spec: string): boolean {
  if (spec.startsWith(".") || spec.startsWith("/")) return false; // 相对路径，不需要 alias
  if (spec.startsWith("node:")) return false; // Node 内置模块
  if (spec.startsWith("@mira/")) return false; // 已有正则 alias 兜底
  if (spec.startsWith("@/")) return false; // tsconfig 路径 alias，不是第三方包，已有 { find: "@", ... } 覆盖
  if (HARDCODED_ALIAS_SPECIFIERS.has(spec)) return false;
  return true;
}

function extractBareImports(fileContent: string): Set<string> {
  const specs = new Set<string>();
  const patterns = [
    /import\s+(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g, // 动态 import
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of fileContent.matchAll(re)) {
      const spec = m[1];
      if (spec && isBareThirdPartySpecifier(spec)) specs.add(spec);
    }
  }
  return specs;
}

const discoveredSpecifiers = new Set<string>();
for (const f of sourceFiles) {
  const abs = path.join(miraWork, f);
  if (!existsSync(abs)) continue;
  for (const spec of extractBareImports(readFileSync(abs, "utf-8"))) discoveredSpecifiers.add(spec);
}

let extraAliasMap: Record<string, string> = {};
if (extraAliasFile) {
  if (!existsSync(extraAliasFile)) {
    console.error(`❌ --extra-alias-file 指定的文件不存在: ${extraAliasFile}`);
    process.exit(2);
  }
  try {
    extraAliasMap = JSON.parse(readFileSync(extraAliasFile, "utf-8"));
  } catch (e) {
    console.error(`❌ --extra-alias-file 不是合法 JSON: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
}

const autoAliasEntries: Array<{ find: string; replacement: string }> = [];
for (const spec of discoveredSpecifiers) {
  if (spec in extraAliasMap) continue; // 显式覆盖优先，跳过自动探测
  try {
    // Bun.resolveSync 按真实 Node/Bun 解析算法从 miraWork 出发查找，得到的是这个包在
    // miraWork 依赖树里的真实入口文件绝对路径——和源码里 import 时会解析到的路径完全一致。
    const resolved = Bun.resolveSync(spec, miraWork);
    autoAliasEntries.push({ find: spec, replacement: resolved });
  } catch {
    // 解析不到（可能是可选 peer dep、类型 only import 等），跳过，不阻断整个脚本；
    // 真正需要它的用例会在 vitest 运行时报出清晰的 "Cannot find module" 而不是静默错误。
    console.log(`⚠ 自动 alias 探测：无法从 ${miraWork} 解析 "${spec}"，跳过（若确实需要，用 --extra-alias-file 手动指定）`);
  }
}
if (autoAliasEntries.length > 0) {
  console.log(`✓ 自动发现并 alias 了 ${autoAliasEntries.length} 个裸第三方 import: ${autoAliasEntries.map(e => e.find).join(", ")}`);
}
const extraAliasEntries = Object.entries(extraAliasMap).map(([find, replacement]) => ({ find, replacement }));

// ── 2. 生成 vitest.whitebox.config.ts ─────────────────────────────────────────

mkdirSync(whiteboxDir, { recursive: true });
const configPath = path.join(whiteboxDir, "vitest.whitebox.config.ts");
const whiteboxDirAbs = path.resolve(whiteboxDir).replace(/\\/g, "/");
const coverageDirAbs = path.join(whiteboxDirAbs, "coverage").replace(/\\/g, "/");

const configContent = `import path from "node:path";
import { defineConfig } from "vitest/config";
const MIRA_WORK = process.cwd();
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    globals: false,
    environment: "node",
    include: ["${whiteboxDirAbs}/vitest/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json-summary"],
      reportsDirectory: "${coverageDirAbs}",
      // 只统计本次 Mode A 实际生成测试所覆盖的源文件，不是整个 mira-work
      include: [${sourceFiles.map(f => `"${f.replace(/\\/g, "/")}"`).join(", ")}],
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: MIRA_WORK },
      { find: "server-only", replacement: path.join(MIRA_WORK, "test/stubs/server-only.ts") },
      { find: "@sentry/nextjs", replacement: path.join(MIRA_WORK, "test/stubs/sentry-stub.ts") },
      { find: "@sentry/node", replacement: path.join(MIRA_WORK, "test/stubs/sentry-stub.ts") },
      { find: "@opentelemetry/api", replacement: path.join(MIRA_WORK, "test/stubs/empty-stub.ts") },
      { find: "@opentelemetry/core", replacement: path.join(MIRA_WORK, "test/stubs/empty-stub.ts") },
      { find: "@opentelemetry/sdk-trace-base", replacement: path.join(MIRA_WORK, "test/stubs/empty-stub.ts") },
      { find: "@langfuse/tracing", replacement: path.join(MIRA_WORK, "test/stubs/langfuse-stub.ts") },
${[...extraAliasEntries, ...autoAliasEntries].map(e => `      { find: ${JSON.stringify(e.find)}, replacement: ${JSON.stringify(e.replacement.replace(/\\/g, "/"))} },`).join("\n")}
      // 更具体的 @mira/* 子路径需要真实实现/不同 mock 时，加一条排在下面这条正则之前的 alias
      // （vitest/rollup 的 alias 数组按顺序匹配、命中即停）——上面自动探测/--extra-alias-file
      // 生成的条目已经排在这条正则之前，同样遵循这条规则。
      { find: /^@mira\\/.*/, replacement: path.join(MIRA_WORK, "test/stubs/mira-workspace-stub.ts") },
    ],
  },
});
`;
writeFileSync(configPath, configContent, "utf-8");
console.log(`✓ 生成 ${configPath}`);

// ── 3. 解析 vitest 二进制路径 ──────────────────────────────────────────────────
//
// vitest 不在 PATH；bun 在 node_modules 里用 junction(Windows)/symlink(POSIX) 链接到
// 真实安装位置，硬编码相对路径会指向失效的 .bun 缓存变体。

function resolveVitestBin(root: string): string {
  const linkPath = path.join(root, "node_modules", "vitest");
  let target: string | null = null;
  try {
    target = readlinkSync(linkPath);
  } catch {
    // Node 的 readlinkSync 在部分 Windows 场景下对 junction 支持不一致，兜底用 PowerShell 读取
    // reparse point 的 Target（只读，不写任何文件）。
    const ps = spawnSync("powershell", ["-NoProfile", "-Command", `(Get-Item "${linkPath}" -Force).Target`], { encoding: "utf-8" });
    target = ps.stdout?.trim() || null;
  }
  if (!target) throw new Error(`无法解析 ${linkPath} 的链接目标，vitest 可能未安装或不是 junction/symlink`);
  target = target.replace(/^\\\\\?\\/, ""); // 去掉 Windows 长路径前缀 \\?\
  const resolved = path.isAbsolute(target) ? target : path.resolve(path.dirname(linkPath), target);
  const bin = path.join(resolved, "dist", "cli.js");
  if (!existsSync(bin)) throw new Error(`解析出的 vitest 路径不存在: ${bin}（link target: ${target}）`);
  return bin;
}

let vitestBin: string;
try {
  vitestBin = resolveVitestBin(sourceDir);
  console.log(`✓ vitest binary: ${vitestBin}`);
} catch (e) {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

// ── 4. 执行 vitest ────────────────────────────────────────────────────────────

const logPath = path.join(whiteboxDir, "vitest-run.log");
console.log(`🚀 bun ${vitestBin} run --config ${configPath} --coverage --reporter=verbose`);
const result = spawnSync("bun", [vitestBin, "run", "--config", configPath, "--coverage", "--reporter=verbose"], {
  cwd: miraWork,
  encoding: "utf-8",
});
const output = (result.stdout ?? "") + (result.stderr ?? "");
writeFileSync(logPath, output, "utf-8");
console.log(output);
console.log(`\n✓ 日志已写入 ${logPath}`);

// ── 5. 覆盖率参考信息（不做 pass/fail 判断，判断依据是 Phase 4b 的 addedBranches 检查） ──

const summaryPath = path.join(coverageDirAbs, "coverage-summary.json");
if (existsSync(summaryPath)) {
  try {
    const summary = JSON.parse(readFileSync(summaryPath, "utf-8")) as { total?: { branches?: { pct?: number } } };
    const pct = summary.total?.branches?.pct;
    if (pct !== undefined) console.log(`[覆盖率参考] Branches: ${pct}%（整文件参考值，含历史代码，不做 pass/fail 判断）`);
  } catch { /* best-effort */ }
}

// ── 6. 已知失败信号分类 ────────────────────────────────────────────────────────

const KNOWN_FAILURES: Array<{ pattern: RegExp; hint: string }> = [
  {
    pattern: /Cannot find module '@mira\//,
    hint: "确认 /^@mira\\/.*/ regex alias 配置正确，以及 test/stubs/mira-workspace-stub.ts 存在且导出了所需符号",
  },
  {
    pattern: /z\.object is not a function/,
    hint: "@mira/* stub 未覆盖某个 workspace 包所需的具体导出。不要在测试文件里加 vi.mock(\"@mira/package-name\", ...) 去补——" +
      "这个 specifier 已经被正则 alias 到了同一个物理 stub 文件，vi.mock 只是在同一个 module id 上再包一层，" +
      "会和其他测试文件对同一 specifier 的 mock 互相覆盖。正确做法：直接编辑 test/stubs/mira-workspace-stub.ts 补上缺失的导出。",
  },
  {
    pattern: /Cannot find module from ['"]?\.bun\//,
    hint: "bun .bun 缓存内 peer dep 断裂，无法在 plain bun 中解析；需要在 mira 原生 bun test 环境中运行",
  },
  {
    pattern: /Cannot find package ['"][^'"]+['"]|Cannot find module ['"][^'"]+['"]/,
    hint: "某个裸第三方 import 在 miraWork 里解析不到（可能是 mira 自身 node_modules 缺依赖/未 hoist，" +
      "不是 whitebox 脚本的问题；也可能是本次自动 alias 探测时就已经跳过并打印过警告的那个 specifier）。" +
      "先看上面 Step 1b 是否有'⚠ 自动 alias 探测：无法解析'的同名 specifier；若有，先确认 mira 自身该依赖是否真的装了" +
      "（cd 到 sourceDir 跑一次真实 import 验证），whitebox 脚本无法、也不应该凭空补出一个不存在的依赖。",
  },
];
for (const { pattern, hint } of KNOWN_FAILURES) {
  if (pattern.test(output)) console.log(`\n⚠ 已知错误信号 (${pattern}): ${hint}`);
}

process.exit(result.status ?? 1);
