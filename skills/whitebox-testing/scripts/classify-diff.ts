#!/usr/bin/env bun
/**
 * classify-diff.ts
 *
 * 确定性 diff 分类器：给定 git BASE..HEAD，将变更的 .ts/.tsx 文件分为
 * Mode A（Vitest 直接断言）或 Mode B（Tool/Sub-agent/MCP 插桩），
 * 并提取每个文件的变更函数名和新增分支，供 Phase 4 直接使用。
 *
 * 用法:
 *   bun classify-diff.ts --source <dir> --base <sha> --head <sha> [--out <file.json>] [--paths <a.ts,b.ts>]
 *
 * --paths 把 --name-only 扫描限定到指定文件/目录（逗号分隔），不传则扫描整个 BASE..HEAD 范围。
 * 用于"单文件/单工具直测"场景：--base 传空树 hash（git hash-object -t tree /dev/null）、
 * --head 传目标分支、--paths 传目标文件，等效于把该文件的全部现有内容当作"新增"来分析，
 * 不需要真的有一次 git 提交把它引入。
 */

import { execFileSync } from "child_process";
import { writeFileSync } from "fs";

// ── CLI 参数解析 ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get = (flag: string): string | null => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] ?? null : null;
};

const sourceDir = get("--source") ?? process.cwd();
const base = get("--base");
const head = get("--head") ?? "HEAD";
const outFile = get("--out");
const pathsFilter = get("--paths")?.split(",").map(s => s.trim()).filter(Boolean) ?? [];

if (!base) {
  console.error("Error: --base <sha> is required");
  process.exit(1);
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 直接用参数数组调用 git，不经过任何 shell 解释。
 *
 * 之前用 execSync 拼接命令字符串，Windows 上会经 cmd.exe 解释一遍——
 * cmd.exe 里 `^` 是转义符，导致 `--base <sha>^`（SKILL.md 示例里的写法）
 * 被静默吃掉，`<sha>^..<head>` 变成 `<sha>..<head>`，产出一个空 diff 却不报错。
 * execFileSync 直接 spawn 二进制、参数原样传给 git 自己解析，从根上不存在
 * shell 转义这个环节，也顺带消除了 base/head/file 里任何字符导致的注入风险。
 */
function git(gitArgs: string[]): string {
  return execFileSync("git", ["-C", sourceDir, ...gitArgs], { encoding: "utf-8" });
}

/** 判断一行是否是有意义的变更行（去掉注释/import/空行/纯类型） */
function isMeaningful(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return false;
  if (t.startsWith("import ") || t.startsWith("export type ") || t.startsWith("export interface ")) return false;
  if (/^[\w<>[\]|,\s]+$/.test(t)) return false; // 纯类型注解行
  return true;
}

/**
 * 粗粒度判断文件是否有任何可被 import 的导出符号。
 *
 * 用于识别纯 IIFE 启动脚本 / CLI-only 入口文件（如 bootstrap.ts）：这类文件即使被
 * parseFunctions() 识别出 addedBranches，也没有任何入口可以从测试文件里 import 进来
 * 驱动——方式 A 的"直接断言"和"驱动最近导出入口"两条路径（见 prd-driven-flow.md §四
 * "未导出目标的判定规则"）都无从谈起，从分类阶段起就该归 SKIP，不该进 TIER-1 强制生成。
 *
 * 保守判断：只要出现任意一种标准导出写法就算 true，宁可放过（交给下游按 §四 规则处理），
 * 不误伤"文件里其实有导出、只是被测的那个具体函数不巧不是其中之一"的情况——那种情况
 * 属于"exported 入口存在但要驱动的是别的函数"，不是"整个文件无入口"，不适用本判断。
 */
function hasExportableEntry(headContent: string): boolean {
  return /^export\s+(default\s+)?(async\s+)?(function|class|const|let|var)\b|^export\s*\{|^export\s+default\b|module\.exports\s*=|exports\.\w+\s*=/m.test(
    headContent,
  );
}

/** 判断一行是否是分支相关语句 */
function isBranchLine(line: string): boolean {
  const t = line.trim();
  return (
    /^if\s*\(/.test(t) ||
    /^}\s*else\s*(if\s*\(|\{)/.test(t) ||
    /^else\s*(if\s*\(|\{)/.test(t) ||
    /^switch\s*\(/.test(t) ||
    /^case\s+/.test(t) ||
    /^return\s+/.test(t) ||
    /^throw\s+/.test(t) ||
    t.includes(" ? ") ||       // 三元运算
    t.includes(" ?? ")         // nullish coalescing
  );
}

/**
 * 解析文件的 unified diff，返回按函数分组的新增分支信息。
 * 从 hunk header (@@ ... @@ funcName) 提取函数名，
 * 从 + 行提取有意义的分支语句。
 */
function parseFunctions(file: string): AddedFunction[] {
  let diff: string;
  try {
    diff = git(["diff", `${base}..${head}`, "--", file]);
  } catch {
    return [];
  }

  const lines = diff.split("\n");
  const funcMap = new Map<string, Set<string>>();
  let currentFunc = "(top-level)";

  for (const rawLine of lines) {
    // hunk header: @@ -a,b +c,d @@ optional function context
    if (rawLine.startsWith("@@")) {
      const match = rawLine.match(/^@@[^@]+@@\s*(.*)$/);
      const ctx = match?.[1]?.trim();
      if (ctx) {
        // 截取函数名：取第一个 '(' 前的最后一个词，或整行（最多 60 字符）
        const funcName = ctx.replace(/\s*\{?\s*$/, "").slice(0, 60);
        currentFunc = funcName || "(top-level)";
      }
      continue;
    }

    // 只处理新增行
    if (!rawLine.startsWith("+") || rawLine.startsWith("+++")) continue;

    const content = rawLine.slice(1); // 去掉前导 +
    if (!isMeaningful(content)) continue;
    if (!isBranchLine(content)) continue;

    if (!funcMap.has(currentFunc)) funcMap.set(currentFunc, new Set());
    funcMap.get(currentFunc)!.add(content.trim());
  }

  return Array.from(funcMap.entries())
    .filter(([, branches]) => branches.size > 0)
    .map(([name, branches]) => ({ name, addedBranches: Array.from(branches) }));
}

/** 获取文件中所有有意义的新增行（用于行数统计和 Mode A 判断） */
function getMeaningfulAddedLines(file: string): string[] {
  let diff: string;
  try {
    diff = git(["diff", `${base}..${head}`, "--", file]);
  } catch {
    return [];
  }
  return diff
    .split("\n")
    .filter(l => l.startsWith("+") && !l.startsWith("+++"))
    .map(l => l.slice(1).trim())
    .filter(isMeaningful);
}

/**
 * 读取 HEAD 版本的文件内容（用于 Mode B 分类）。
 *
 * Mode B 的判断逻辑是"当前文件是否是 Tool/Sub-agent/MCP"，
 * 而不是"diff 的 + 行里有没有关键词"。
 * 原因：改了 execute() 内部逻辑时，execute: 声明行本身不会出现在 + 行里，
 * 仅看 + 行会把这类变更错分为 Mode A。
 */
function getHeadContent(file: string): string {
  try {
    return git(["show", `${head}:${file}`]);
  } catch {
    return "";
  }
}

// ── 类型定义 ──────────────────────────────────────────────────────────────────

type ModeAType = "api-route" | "server-logic" | "reference-util" | "component" | "util";

interface AddedFunction {
  name: string;
  addedBranches: string[];
}

interface ModeAEntry {
  file: string;
  type: ModeAType;
  addedLineCount: number;
  functions: AddedFunction[];
  hasExportableEntry: boolean; // false = 整个文件无任何导出符号（纯 IIFE/CLI 脚本），Phase 4a 必须归 SKIP
}

interface ModeBEntry {
  file: string;
  addedLineCount: number;
  functions: AddedFunction[];
}

interface SkippedEntry {
  file: string;
  reason: string;
}

interface ClassifyResult {
  modeA: ModeAEntry[];
  modeB: { tools: ModeBEntry[]; mcp: ModeBEntry[] };
  skipped: SkippedEntry[];
}

function classifyModeAType(file: string): ModeAType {
  if (/app\/api\/.+\/route\.tsx?$/.test(file)) return "api-route";
  if (/lib\/server\//.test(file)) return "server-logic";
  if (/lib\/reference\//.test(file)) return "reference-util";
  if (/\.tsx$/.test(file) || /features\//.test(file)) return "component";
  return "util";
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

const changedFiles = git([
  "diff", `${base}..${head}`, "--name-only",
  ...(pathsFilter.length > 0 ? ["--", ...pathsFilter] : []),
])
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter(f => /\.(ts|tsx)$/.test(f))
  .filter(f => !/\.(test|spec)\.|__tests__|\.d\.ts|node_modules|\.next\/|dist\/|generated\//.test(f));

const result: ClassifyResult = {
  modeA: [],
  modeB: { tools: [], mcp: [] },
  skipped: [],
};

for (const file of changedFiles) {
  const addedLines = getMeaningfulAddedLines(file);

  if (addedLines.length === 0) {
    result.skipped.push({ file, reason: "仅改注释/import/空行/类型注解" });
    continue;
  }

  const functions = parseFunctions(file);

  // ── Mode B 判断：基于 HEAD 文件内容，而非 + 行 ────────────────────────────
  //
  // 关键原则：改了 execute() 内部逻辑时，execute: 声明行本身是上下文行（不带+），
  // 只看 + 行会把"修改工具执行逻辑"错分为 Mode A。
  // 正确做法：读 HEAD 文件内容，判断"这个文件当前是不是一个 Tool/MCP Server"。
  //
  // Sub-agent（sub-agent-factory.ts）：设计上就归 Mode A（server-logic），不是权衡后的退路。
  // 项目没有 DB/Redis/Langfuse/Sentry 等基础设施的隔离测试环境，Mode B 直调无从谈起；
  // 用 vi.mock('ai') mock 掉 generateText/streamText，可完整测试业务逻辑分支。
  //
  // MCP Client（import SDK 但不注册 server.tool）：归 Mode A。
  // 只有 MCP Server（调用 server.tool() 注册工具）才走 Mode B。

  const addedContent = addedLines.join("\n");
  const headContent = getHeadContent(file); // fetched once, reused by both Mode B checks + Mode A export check below

  // Mode B: Tool (vercel-ai execute)
  if (/lib\/ai\/tools\//.test(file) && !/__tests__/.test(file) && /execute\s*:/.test(headContent)) {
    result.modeB.tools.push({ file, addedLineCount: addedLines.length, functions });
    continue;
  }

  // Mode B: MCP Server（仅 server.tool() 注册工具的文件，即真正的 MCP Server）
  // MCP Client 文件（import SDK 但不调用 server.tool）→ 走 Mode A，用 vi.mock 覆盖
  if (/server\.tool\(/.test(headContent) || /server\.tool\(/.test(addedContent)) {
    result.modeB.mcp.push({ file, addedLineCount: addedLines.length, functions });
    continue;
  }

  // Mode A：以上都不满足
  result.modeA.push({
    file,
    type: classifyModeAType(file),
    addedLineCount: addedLines.length,
    functions,
    hasExportableEntry: hasExportableEntry(headContent),
  });
}

// ── 输出 ──────────────────────────────────────────────────────────────────────

const json = JSON.stringify(result, null, 2);
if (outFile) {
  writeFileSync(outFile, json, "utf-8");
  const modeBCount = result.modeB.tools.length + result.modeB.mcp.length;
  const noExportCount = result.modeA.filter(e => !e.hasExportableEntry).length;
  console.log(`分类完成 → ${outFile}`);
  console.log(`  Mode A: ${result.modeA.length} 个文件（其中 ${noExportCount} 个无导出符号，Phase 4a 应归 SKIP）| Mode B: ${modeBCount} 个文件 | 跳过: ${result.skipped.length} 个文件`);
} else {
  console.log(json);
}
