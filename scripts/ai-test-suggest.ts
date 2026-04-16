#!/usr/bin/env bun
/**
 * AI Test Suggestion Generator
 *
 * Reads coverage gap data, fetches diffs for each gap file,
 * and calls Claude API to generate test suggestions.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, basename, extname } from "path";

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
    gaps: args.gaps ?? "",
    style: args.style ?? "",
    base: args.base ?? "origin/main",
    head: args.head ?? "HEAD",
    output: args.output ?? "suggestions.md",
  };
}

const config = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Gap {
  file: string;
  reason: "no_test_file" | "low_coverage";
  coverage: number | null;
}

interface GapsData {
  gaps: Gap[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getFileDiff(file: string): Promise<string> {
  const proc = Bun.spawn(
    ["git", "diff", `${config.base}...${config.head}`, "--", file],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return stdout.trim();
}

function findExistingTests(file: string): string | null {
  const dir = dirname(file);
  const ext = extname(file);
  const name = basename(file, ext);

  const candidates = [
    `${dir}/${name}.test${ext}`,
    `${dir}/${name}.spec${ext}`,
    `${dir}/__tests__/${name}.test${ext}`,
    `${dir}/__tests__/${name}.spec${ext}`,
  ];

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (existsSync(resolved)) {
      try {
        return readFileSync(resolved, "utf8");
      } catch {
        // unreadable
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Parse gaps
  let gapsData: GapsData;
  try {
    gapsData = JSON.parse(config.gaps);
  } catch {
    // Try reading as a file path
    if (existsSync(config.gaps)) {
      gapsData = JSON.parse(readFileSync(config.gaps, "utf8"));
    } else {
      console.error("Could not parse --gaps as JSON or file path.");
      process.exit(1);
    }
  }

  if (!gapsData.gaps || gapsData.gaps.length === 0) {
    writeFileSync(config.output, "No coverage gaps detected. All changed files have adequate test coverage.");
    console.log("No gaps to process.");
    return;
  }

  // 2. Collect diffs and existing tests for each gap
  const fileContexts: Array<{
    gap: Gap;
    diff: string;
    existingTest: string | null;
  }> = [];

  for (const gap of gapsData.gaps) {
    const diff = await getFileDiff(gap.file);
    const existingTest = findExistingTests(gap.file);
    fileContexts.push({ gap, diff, existingTest });
  }

  // 3. Load style guide if provided
  let styleContent = "";
  if (config.style) {
    if (existsSync(config.style)) {
      styleContent = readFileSync(config.style, "utf8");
    } else {
      styleContent = config.style;
    }
  }

  // 4. Build prompt and call Claude API
  const client = new Anthropic();

  const systemPrompt = `You are a senior test engineer. Analyze code changes and generate actionable test suggestions in Markdown format.

Rules:
- For each file, suggest specific test cases with descriptive names
- Include code snippets showing the test structure (describe/it blocks)
- Prioritize edge cases and error paths
- Match the project's existing test style if examples are provided
- Be concise — focus on what to test and why, not boilerplate
${styleContent ? `\nProject testing style guide:\n${styleContent}` : ""}`;

  const fileDescriptions = fileContexts
    .map(({ gap, diff, existingTest }) => {
      let section = `### ${gap.file}\n**Reason:** ${gap.reason === "low_coverage" ? `Low coverage (${gap.coverage}%)` : "No test file found"}\n`;
      if (diff) {
        section += `\n**Diff:**\n\`\`\`diff\n${diff}\n\`\`\`\n`;
      }
      if (existingTest) {
        section += `\n**Existing test file (for style reference):**\n\`\`\`typescript\n${existingTest.slice(0, 2000)}\n\`\`\`\n`;
      }
      return section;
    })
    .join("\n---\n\n");

  const userPrompt = `Generate test suggestions for the following ${fileContexts.length} file(s) with coverage gaps:\n\n${fileDescriptions}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  // 5. Extract text and write output
  const suggestions = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  writeFileSync(config.output, suggestions);
  console.log(`Test suggestions written to ${config.output} (${gapsData.gaps.length} file(s) analyzed).`);
}

main().catch((err) => {
  console.error("AI test suggestion generation failed:", err);
  process.exit(1);
});
