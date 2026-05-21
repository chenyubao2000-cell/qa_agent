// Auto schema-diff generator for cts-mcp.
// Hand-curated PRD-expected schemas + discovery.json → uses schema-diff.ts utility → writes report.
//
// Usage: npx tsx tests/mcp/cts-mcp/build-schema-diff.ts
import { readFileSync, writeFileSync } from "node:fs";
import "dotenv/config";
import {
  buildToolDiff,
  buildCapabilitiesDiff,
  aggregate,
  renderMarkdown,
  type ExpectedTool,
} from "../_lib/schema-diff.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const slug = process.env.MCP_SERVER_NAME ?? "cts-mcp";
const discoveryPath = `test-cases/mcp/${slug}/discovery.json`;
const reportPath = `tests/mcp/${slug}/reports/schema-diff.report.md`;

interface Discovery {
  probedAt: string;
  serverInfo: { name?: string; version?: string };
  capabilities: Record<string, unknown>;
  instructions: string;
  tools: Tool[];
}

const discovery: Discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));

// ────── PRD-expected schemas (hand-curated from docs/CTS MCP V1.0 - PRD Final.md) ──────

const expected: ExpectedTool[] = [
  {
    name: "cts_search_candidates",
    title: "Talent Search",
    inputProperties: {
      // PRD §4.1 — note PRD says single string for these but server is array (critical diff)
      keyword: { type: "string" },
      semantic_query: { type: "string" },
      name: { type: "string" },
      phone: { type: "string" },
      company_name: { type: "string" },
      school_name: { type: "string" },
      job_title: { type: "string" },
      work_content: { type: "string" },
      location: { type: "string" },         // PRD says string
      education: { type: "string" },        // PRD says string
      school_type: { type: "string" },      // PRD says string
      work_experience: { type: "string" },  // PRD says string
      industry: { type: "string" },         // PRD says string
      job_category: { type: "string" },     // PRD says string
      gender: { type: "string", enum: ["男", "女"] },
      age_min: { type: "integer" },
      age_max: { type: "integer" },
      job_status: { type: "string" },
      // PRD §4.1: ["近7天","近30天","近90天"]
      active_within: { type: "string", enum: ["近7天", "近30天", "近90天"] },
      sort_by: { type: "string", enum: ["default", "active_first", "update_first"] },
      // PRD §4.1: limit max 100 (server is 200 — critical diff)
      limit: { type: "integer" },
      cursor: { type: "string" },
    },
    requiredFields: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "cts_get_candidate_detail",
    title: "Talent Resume Detail",
    inputProperties: {
      candidate_id: { type: "string" },
    },
    requiredFields: ["candidate_id"],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "cts_get_candidate_contact_info",
    title: "Talent Contact Info",
    inputProperties: {
      candidate_id: { type: "string" },
    },
    requiredFields: ["candidate_id"],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "cts_get_cts_schema",
    title: "Data Dictionary",
    inputProperties: {
      // PRD §4.2 — single schema_type, server has schema_types[] (critical diff)
      schema_type: { type: "string" },
    },
    requiredFields: [],
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
];

// ────── Capabilities expectations from PRD §1.3.2 / §2.6 ──────
const expectedCaps = {
  listChanged: true,    // PRD: tools.listChanged: true
  logging: false,       // PRD §2.6: NOT enabled
  completions: false,   // PRD §2.6: NOT enabled
};

// ────── Run diff ──────

const toolDiffs = expected.map((e) =>
  buildToolDiff(e, discovery.tools.find((t) => t.name === e.name))
);
const capsDiff = buildCapabilitiesDiff(expectedCaps, discovery.capabilities);
const report = aggregate(...toolDiffs, capsDiff);

const md = renderMarkdown(report, {
  slug,
  prdPath: process.env.MCP_PRD_PATH ?? "docs/CTS MCP V1.0 - PRD Final.md",
  serverUrl: process.env.MCP_SERVER_URL ?? "(unset)",
  serverInfo: discovery.serverInfo,
  probedAt: discovery.probedAt,
});

writeFileSync(reportPath, md, "utf8");

const total = report.critical.length + report.warn.length + report.info.length;
console.log(
  `[schema-diff] ${total} entries (` +
  `${report.critical.length} critical / ${report.warn.length} warn / ${report.info.length} info) → ${reportPath}`
);

if (report.critical.length > 0) {
  console.log("\nCritical entries:");
  for (const c of report.critical) {
    console.log(`  - ${c.area}: ${c.message}`);
  }
}
