/**
 * Tool-probe schema — single source of truth for case + tool entry + full config.
 *
 * Imported by:
 *   - scripts/tool-probe/runner.ts (parses incoming config.json)
 *   - scripts/tool-probe/validate-cases.ts (pre-flight validator)
 *   - skills/tool-probe-case-generator/SKILL.md (case ideation contract — referenced, not imported)
 *
 * If you change this file, ALL consumers must be re-checked in lockstep.
 */
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Case schema (per-case unit a test exercises)
// ─────────────────────────────────────────────────────────────────────────────

export const stepSchema = z.object({
  input: z.record(z.string(), z.unknown()),
});

export const caseSchema = z.object({
  name: z.string(),                                 // unique slug, kebab-case
  tool: z.string(),                                 // must match a key in config.tools
  description: z.string(),                          // one-line Chinese description
  steps: z.array(stepSchema).min(1),                // >= 1 step; usually 1
  expect: z.enum(["ok", "tool_error"]),             // gross outcome the runner expects
  expectErrorCode: z.string().nullable().optional(),// when expect="tool_error"
  judgeFocus: z.string().optional(),                // hint for claude -p judge
  tokenOverride: z.union([z.string(), z.null()]).optional(), // per-case auth override
  acceptPartialAsPass: z.boolean().optional(),      // judge ⚠️ partial counts as pass
});

export const casesArraySchema = z.array(caseSchema).min(1);

// ─────────────────────────────────────────────────────────────────────────────
// Tool entry schema (one per testable tool, declared in config.tools)
//
// Discriminated by `kind`. Two kinds supported in v1:
//   - "vercel-ai" : in-process Vercel AI SDK tool (default for backward compat)
//   - "mcp-http"  : remote MCP server reached over StreamableHTTP transport
//
// Backward compat: legacy configs without `kind` are auto-tagged "vercel-ai"
// via the preprocess step below.
// ─────────────────────────────────────────────────────────────────────────────

const vercelToolEntrySchema = z.object({
  kind: z.literal("vercel-ai"),
  module: z.string(),                  // absolute path to tool .ts file
  factory: z.string(),                 // export name of factory function
  descriptionExport: z.string(),       // export name of description constant
});

const mcpHttpToolEntrySchema = z.object({
  kind: z.literal("mcp-http"),
  serverUrl: z.string(),               // MCP server URL (StreamableHTTP)
  toolName: z.string().optional(),     // remote tool name if differs from config.tools key
  authTokenEnv: z.string().nullable().optional(), // env var holding Bearer token; null = no auth
});

export const toolEntrySchema = z.preprocess(
  (v) => {
    if (v && typeof v === "object" && !("kind" in (v as Record<string, unknown>))) {
      return { kind: "vercel-ai", ...(v as Record<string, unknown>) };
    }
    return v;
  },
  z.discriminatedUnion("kind", [vercelToolEntrySchema, mcpHttpToolEntrySchema]),
);

// ─────────────────────────────────────────────────────────────────────────────
// Full config schema
// ─────────────────────────────────────────────────────────────────────────────

export const configSchema = z.object({
  runId: z.string(),
  sourceProjectDir: z.string(),                     // chdir target (used only for vercel-ai kind)
  loggerModule: z.string().nullable().optional(),   // logger absolute path; null when ONLY mcp-http tools present
  tools: z.record(z.string(), toolEntrySchema),
  authEnvVar: z.string().nullable().optional(),     // legacy per-run auth env var (vercel-ai only)
  debugEnvVar: z.string(),                          // e.g. "GH_TOOL_DEBUG"
  eventPrefix: z.string(),                          // e.g. "gh-debug"
  cases: casesArraySchema,
  evidenceOutPath: z.string(),
});

export type TestCase = z.infer<typeof caseSchema>;
export type TestStep = z.infer<typeof stepSchema>;
export type ToolEntry = z.infer<typeof toolEntrySchema>;
export type Config = z.infer<typeof configSchema>;
