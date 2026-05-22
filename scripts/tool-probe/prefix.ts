/* eslint-disable no-console */
/**
 * Prefix derivation — single source of truth for both Phase 1 branches.
 *
 * Rule: longest common leading underscore/hyphen-segment prefix across tool names.
 *   - ["github_search", "github_lookup"] → "github"
 *   - ["cts_search_candidates"]           → "cts" (single tool → first segment)
 *   - ["foo", "bar"]                      → "foo" (no common, fallback to first[0..4])
 *
 * Imported by: scripts/tool-probe/mcp-discover.ts
 * CLI usage (vercel-ai Phase 1b): `bun scripts/tool-probe/prefix.ts <name1>,<name2>,...`
 */

export function derivePrefix(toolNames: string[]): string {
  if (toolNames.length === 0) return "tool";
  const split = toolNames.map((n) => n.split(/[_-]/).filter(Boolean));
  const first = split[0]!;
  const common: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const seg = first[i]!;
    if (split.every((parts) => parts[i] === seg)) common.push(seg);
    else break;
  }
  // For single tool, just the first segment is the natural prefix.
  if (toolNames.length === 1) return common[0] ?? toolNames[0]!.slice(0, 4);
  if (common.length === 0) return (toolNames[0] ?? "tool").slice(0, 4);
  return common.join("_");
}

// CLI: `bun prefix.ts <name1>,<name2>,...` → prints the prefix on stdout
if (import.meta.main) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: bun prefix.ts <name1>,<name2>,...");
    process.exit(2);
  }
  const names = arg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) {
    console.error("at least one tool name required");
    process.exit(2);
  }
  process.stdout.write(derivePrefix(names) + "\n");
}
