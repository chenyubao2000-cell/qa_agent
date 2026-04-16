#!/usr/bin/env bun
/**
 * Coverage Gap Detector
 *
 * Compares changed files (git diff) against coverage data to find
 * source files that lack test coverage.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, basename, dirname, extname } from "path";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return {
    base: args.base ?? "origin/main",
    head: args.head ?? "HEAD",
    threshold: Number(args.threshold ?? 80),
    output: args.output ?? "gaps.json",
  };
}

const config = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const EXCLUDE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.config\.[jt]sx?$/,
  /\.d\.ts$/,
  /[\\/]__tests__[\\/]/,
  /[\\/]tests?[\\/]/,
  /[\\/]e2e[\\/]/,
  /[\\/]fixtures?[\\/]/,
  /[\\/]mocks?[\\/]/,
];

function isSourceFile(file: string): boolean {
  const ext = extname(file);
  if (!SOURCE_EXTS.has(ext)) return false;
  return !EXCLUDE_PATTERNS.some((p) => p.test(file));
}

// Possible test file locations for a source file
function possibleTestFiles(file: string): string[] {
  const dir = dirname(file);
  const ext = extname(file);
  const name = basename(file, ext);
  return [
    `${dir}/${name}.test${ext}`,
    `${dir}/${name}.spec${ext}`,
    `${dir}/__tests__/${name}.test${ext}`,
    `${dir}/__tests__/${name}.spec${ext}`,
  ];
}

interface Gap {
  file: string;
  reason: "no_test_file" | "low_coverage";
  coverage: number | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Get changed files via git diff
  const proc = Bun.spawn(
    ["git", "diff", "--name-only", "--diff-filter=ACM", `${config.base}...${config.head}`],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  const changedFiles = stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  // 2. Filter to source files
  const sourceFiles = changedFiles.filter(isSourceFile);

  // 3. Try to load coverage-summary.json
  let coverageData: Record<string, { lines?: { pct: number } }> | null = null;
  const coveragePath = resolve("coverage/coverage-summary.json");
  if (existsSync(coveragePath)) {
    try {
      coverageData = JSON.parse(readFileSync(coveragePath, "utf8"));
    } catch {
      // coverage file malformed — treat as missing
    }
  }

  // 4. Detect gaps
  const gaps: Gap[] = [];

  for (const file of sourceFiles) {
    const absFile = resolve(file);

    // Check coverage data first
    if (coverageData) {
      const entry =
        coverageData[absFile] ??
        coverageData[file] ??
        coverageData[`./${file}`];

      if (entry) {
        const pct = entry.lines?.pct ?? 0;
        if (pct < config.threshold) {
          gaps.push({ file, reason: "low_coverage", coverage: pct });
        }
        continue; // file found in coverage — already assessed
      }
    }

    // No coverage entry — check if a test file exists at all
    const hasTest = possibleTestFiles(file).some((tf) => existsSync(tf));
    if (!hasTest) {
      gaps.push({ file, reason: "no_test_file", coverage: null });
    }
  }

  // 5. Write output
  const result = { gaps };
  writeFileSync(config.output, JSON.stringify(result, null, 2));

  console.log(`Coverage gap detection complete: ${gaps.length} gap(s) found in ${sourceFiles.length} source file(s).`);
  if (gaps.length > 0) {
    for (const g of gaps) {
      const detail = g.reason === "low_coverage" ? `coverage ${g.coverage}%` : g.reason;
      console.log(`  - ${g.file} (${detail})`);
    }
  }
}

main().catch((err) => {
  console.error("Coverage gap detection failed:", err);
  process.exit(1);
});
