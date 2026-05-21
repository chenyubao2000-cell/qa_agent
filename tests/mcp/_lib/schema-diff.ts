// Schema diff utility — compares PRD expected schema vs server discovery output.
// Severity: critical / warn / info (see skills/mcp-test-generator/references/schema-diff-rules.md).
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export type Severity = "critical" | "warn" | "info";

export interface DiffEntry {
  severity: Severity;
  area: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ExpectedAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ExpectedTool {
  name: string;
  title?: string;
  inputProperties: Record<string, ExpectedField>;
  requiredFields: string[];
  annotations: ExpectedAnnotations;
}

export interface ExpectedField {
  type: "string" | "integer" | "boolean" | "array" | "object";
  itemType?: string;
  enum?: string[];
}

export interface DiffReport {
  critical: DiffEntry[];
  warn: DiffEntry[];
  info: DiffEntry[];
}

export function emptyReport(): DiffReport {
  return { critical: [], warn: [], info: [] };
}

export function buildToolDiff(expected: ExpectedTool, actual: Tool | undefined): DiffEntry[] {
  const entries: DiffEntry[] = [];
  if (!actual) {
    entries.push({
      severity: "critical",
      area: `tool:${expected.name}`,
      message: "PRD declares this tool but server does not expose it.",
    });
    return entries;
  }

  // Title
  if (expected.title && actual.annotations?.title !== expected.title) {
    entries.push({
      severity: "warn",
      area: `tool:${expected.name}.annotations.title`,
      message: "Title mismatch.",
      expected: expected.title,
      actual: actual.annotations?.title,
    });
  }

  // Annotations
  for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
    const want = expected.annotations[key];
    const got = (actual.annotations as Record<string, unknown> | undefined)?.[key];
    if (want !== undefined && want !== got) {
      entries.push({
        severity: "critical",
        area: `tool:${expected.name}.annotations.${key}`,
        message: `Annotation ${key} mismatch.`,
        expected: want,
        actual: got,
      });
    }
  }

  // Required fields
  const actualRequired = new Set<string>(((actual.inputSchema as { required?: string[] })?.required) ?? []);
  for (const f of expected.requiredFields) {
    if (!actualRequired.has(f)) {
      entries.push({
        severity: "critical",
        area: `tool:${expected.name}.required`,
        message: `Field expected required but server makes it optional.`,
        expected: f,
        actual: [...actualRequired],
      });
    }
  }
  for (const f of actualRequired) {
    if (!expected.requiredFields.includes(f)) {
      entries.push({
        severity: "warn",
        area: `tool:${expected.name}.required`,
        message: `Server requires field not declared required by PRD.`,
        actual: f,
      });
    }
  }

  // Field-level
  const actualProps = ((actual.inputSchema as { properties?: Record<string, { type?: string; items?: { type?: string }; enum?: string[] }> }).properties) ?? {};
  for (const [name, want] of Object.entries(expected.inputProperties)) {
    const got = actualProps[name];
    if (!got) {
      entries.push({
        severity: "critical",
        area: `tool:${expected.name}.${name}`,
        message: "Field declared in PRD not found on server.",
      });
      continue;
    }
    if (got.type !== want.type) {
      entries.push({
        severity: "critical",
        area: `tool:${expected.name}.${name}.type`,
        message: "Field type mismatch.",
        expected: want.type,
        actual: got.type,
      });
    }
    if (want.itemType && got.items?.type !== want.itemType) {
      entries.push({
        severity: "critical",
        area: `tool:${expected.name}.${name}.items.type`,
        message: "Array item type mismatch.",
        expected: want.itemType,
        actual: got.items?.type,
      });
    }
    if (want.enum) {
      const actualEnum = new Set(got.enum ?? []);
      const missing = want.enum.filter((v) => !actualEnum.has(v));
      const extra = (got.enum ?? []).filter((v) => !want.enum!.includes(v));
      if (missing.length || extra.length) {
        entries.push({
          severity: "warn",
          area: `tool:${expected.name}.${name}.enum`,
          message: "Enum values mismatch.",
          expected: want.enum,
          actual: got.enum,
        });
      }
    }
  }

  // Extra fields on server
  for (const fname of Object.keys(actualProps)) {
    if (!(fname in expected.inputProperties)) {
      entries.push({
        severity: "warn",
        area: `tool:${expected.name}.${fname}`,
        message: "Server exposes field not declared in PRD.",
        actual: fname,
      });
    }
  }

  return entries;
}

export function buildCapabilitiesDiff(
  expected: { listChanged?: boolean; logging?: boolean; completions?: boolean },
  actualCaps: Record<string, unknown> | undefined,
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const tools = (actualCaps?.tools as { listChanged?: boolean } | undefined) ?? undefined;
  if (expected.listChanged === true && tools?.listChanged !== true) {
    entries.push({
      severity: "warn",
      area: "capabilities.tools.listChanged",
      message: "PRD declares listChanged=true but server does not declare it.",
      expected: true,
      actual: tools?.listChanged,
    });
  }
  if (expected.logging === false && actualCaps?.logging !== undefined) {
    entries.push({
      severity: "warn",
      area: "capabilities.logging",
      message: "PRD says logging not enabled but server declares it.",
      expected: false,
      actual: actualCaps.logging,
    });
  }
  if (expected.completions === false && actualCaps?.completions !== undefined) {
    entries.push({
      severity: "warn",
      area: "capabilities.completions",
      message: "PRD says completions not enabled but server declares it.",
      expected: false,
      actual: actualCaps.completions,
    });
  }
  return entries;
}

export function aggregate(...lists: DiffEntry[][]): DiffReport {
  const r = emptyReport();
  for (const list of lists) {
    for (const e of list) {
      r[e.severity].push(e);
    }
  }
  return r;
}

export function renderMarkdown(report: DiffReport, ctx: {
  slug: string;
  prdPath: string;
  serverUrl: string;
  serverInfo?: { name?: string; version?: string };
  probedAt: string;
}): string {
  const lines: string[] = [];
  lines.push(`# Schema Diff Report — ${ctx.slug}`);
  lines.push("");
  lines.push(`- **Probed**: ${ctx.probedAt}`);
  lines.push(`- **PRD**: ${ctx.prdPath}`);
  lines.push(`- **Server**: ${ctx.serverUrl} (${ctx.serverInfo?.name ?? "?"} v${ctx.serverInfo?.version ?? "?"})`);
  lines.push("");
  lines.push("## 概览");
  lines.push("");
  lines.push("| 严重度 | 数量 |");
  lines.push("|-------|:---:|");
  lines.push(`| 🔴 Critical | ${report.critical.length} |`);
  lines.push(`| 🟡 Warn     | ${report.warn.length} |`);
  lines.push(`| 🔵 Info     | ${report.info.length} |`);
  lines.push("");

  for (const [sev, label] of [["critical", "🔴 Critical"], ["warn", "🟡 Warn"], ["info", "🔵 Info"]] as const) {
    const list = report[sev];
    if (list.length === 0) continue;
    lines.push(`## ${label}`);
    lines.push("");
    list.forEach((e, i) => {
      lines.push(`### ${i + 1}. ${e.area}`);
      lines.push(`- ${e.message}`);
      if (e.expected !== undefined) lines.push(`- **Expected**: \`${JSON.stringify(e.expected)}\``);
      if (e.actual !== undefined) lines.push(`- **Actual**: \`${JSON.stringify(e.actual)}\``);
      lines.push("");
    });
  }
  return lines.join("\n");
}
