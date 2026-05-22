/* eslint-disable no-console */
/**
 * Tool-probe pre-flight validator.
 *
 * Runs ALL format/consistency checks the runner CANNOT do on its own:
 *  - zod schema (each case + array min(1))
 *  - case-name uniqueness within batch
 *  - case.tool ∈ config.tools (cross-reference)
 *  - kebab-case name convention
 *  - tokenOverride sanity: if any case sets it, config.authEnvVar must be non-null
 *  - extra-case empty-input warning (input={} → must declare expect="tool_error" OR carry the
 *    sentinel "requires manual input fill" judgeFocus, otherwise it's almost certainly a bug)
 *
 * Usage:
 *   bun scripts/tool-probe/validate-cases.ts --config <abs-path-to-config.json>
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — validation failed (errors printed to stderr as JSON)
 *   2 — I/O / argv error
 *
 * Called by:
 *   - /qa-tool-probe Phase 3 (BEFORE patching source files)
 *   - tool-probe-orchestrator agent (gate before Edit)
 */
import { readFileSync } from "node:fs";
import { configSchema } from "./case-schema";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MANUAL_FILL_HINT = "requires manual input fill";

interface ValidationIssue {
  level: "error" | "warning";
  path: string;
  code: string;
  message: string;
}

function parseArgs(): { config: string } {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = args[i + 1] ?? "";
  }
  if (!out.config) {
    console.error("Usage: bun validate-cases.ts --config <abs-path>");
    process.exit(2);
  }
  return { config: out.config };
}

function validate(rawConfig: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. Schema parse
  const parsed = configSchema.safeParse(rawConfig);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push({
        level: "error",
        path: e.path.join("."),
        code: "schema",
        message: e.message,
      });
    }
    return issues; // hard stop — subsequent checks assume schema is valid
  }
  const cfg = parsed.data;

  // 2. Case name uniqueness
  const seen = new Map<string, number>();
  cfg.cases.forEach((c, i) => {
    const prior = seen.get(c.name);
    if (prior !== undefined) {
      issues.push({
        level: "error",
        path: `cases[${i}].name`,
        code: "duplicate-name",
        message: `case name "${c.name}" already used at cases[${prior}]`,
      });
    } else {
      seen.set(c.name, i);
    }
  });

  // 3. Kebab-case naming convention
  cfg.cases.forEach((c, i) => {
    if (!NAME_PATTERN.test(c.name)) {
      issues.push({
        level: "warning",
        path: `cases[${i}].name`,
        code: "non-kebab-case",
        message: `case name "${c.name}" should be lowercase kebab-case (a-z, 0-9, hyphens)`,
      });
    }
  });

  // 4. case.tool ∈ config.tools
  const toolKeys = new Set(Object.keys(cfg.tools));
  cfg.cases.forEach((c, i) => {
    if (!toolKeys.has(c.tool)) {
      issues.push({
        level: "error",
        path: `cases[${i}].tool`,
        code: "unknown-tool",
        message: `case references tool "${c.tool}" not declared in config.tools (known: ${[...toolKeys].join(", ") || "<none>"})`,
      });
    }
  });

  // 5. tokenOverride sanity (only meaningful for vercel-ai tools)
  cfg.cases.forEach((c, i) => {
    if (c.tokenOverride === undefined) return;
    const entry = cfg.tools[c.tool];
    if (!entry) return; // already flagged by check 4
    if (entry.kind === "mcp-http") {
      issues.push({
        level: "warning",
        path: `cases[${i}].tokenOverride`,
        code: "token-override-not-supported-for-mcp",
        message: `case "${c.name}" sets tokenOverride but tool "${c.tool}" is kind=mcp-http; auth is bound at MCP-client connect time (entry.authTokenEnv) and tokenOverride will be ignored. Declare a separate tool entry with a different authTokenEnv to test alt-auth scenarios.`,
      });
    }
  });
  const anyVercelOverride = cfg.cases.some((c) => {
    if (c.tokenOverride === undefined) return false;
    const entry = cfg.tools[c.tool];
    return entry?.kind === "vercel-ai";
  });
  if (anyVercelOverride && !cfg.authEnvVar) {
    issues.push({
      level: "error",
      path: "authEnvVar",
      code: "missing-auth-env-var",
      message: "one or more vercel-ai cases set tokenOverride but config.authEnvVar is null/missing — overrides would be silently ignored by runner.ts",
    });
  }

  // 5b. vercel-ai tools require loggerModule (runner monkey-patches it)
  const hasVercel = Object.values(cfg.tools).some((e) => e.kind === "vercel-ai");
  if (hasVercel && !cfg.loggerModule) {
    issues.push({
      level: "error",
      path: "loggerModule",
      code: "missing-logger-module",
      message: "config contains kind=vercel-ai tools but loggerModule is null/missing — runner cannot capture probe events",
    });
  }

  // 5c. mcp-http auth env vars should resolve at runtime (best-effort warning)
  for (const [name, entry] of Object.entries(cfg.tools)) {
    if (entry.kind !== "mcp-http") continue;
    if (entry.authTokenEnv && !process.env[entry.authTokenEnv]) {
      issues.push({
        level: "warning",
        path: `tools.${name}.authTokenEnv`,
        code: "mcp-auth-env-unset",
        message: `tool "${name}" expects env var ${entry.authTokenEnv} but it is unset at validation time. runner will hard-fail if it is still unset at execution time.`,
      });
    }
  }

  // 6. Empty-input sanity for extra-case
  cfg.cases.forEach((c, i) => {
    const allEmpty = c.steps.every((s) => Object.keys(s.input).length === 0);
    if (!allEmpty) return;
    const expectsError = c.expect === "tool_error";
    const hasManualHint = (c.judgeFocus ?? "").includes(MANUAL_FILL_HINT);
    if (!expectsError && !hasManualHint) {
      issues.push({
        level: "error",
        path: `cases[${i}].steps`,
        code: "empty-input-no-intent",
        message: `case "${c.name}" has empty input across all steps but expect="ok" and no "${MANUAL_FILL_HINT}" hint in judgeFocus — almost certainly a generation bug. Either fill the input, set expect="tool_error", or add the manual-fill hint explicitly.`,
      });
    }
  });

  // 7. expectErrorCode set only when expect="tool_error"
  cfg.cases.forEach((c, i) => {
    if (c.expectErrorCode && c.expect !== "tool_error") {
      issues.push({
        level: "warning",
        path: `cases[${i}]`,
        code: "error-code-without-error-expect",
        message: `case "${c.name}" sets expectErrorCode="${c.expectErrorCode}" but expect="ok" — error code will be ignored by judge`,
      });
    }
  });

  return issues;
}

function main(): void {
  const { config: configPath } = parseArgs();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (e) {
    console.error(
      JSON.stringify(
        { ok: false, fatal: `cannot read/parse config: ${e instanceof Error ? e.message : String(e)}` },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const issues = validate(raw);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  const report = {
    ok: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(errors.length === 0 ? 0 : 1);
}

main();

// Export for direct programmatic use (e.g. unit tests).
export { validate };
export type { ValidationIssue };
