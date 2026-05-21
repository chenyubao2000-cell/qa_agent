// Chain probe — for each of the 3 remaining tools, fire a real happy-path call
// and dump the response shape so we can write accurate specs.
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { writeFileSync, mkdirSync } from "node:fs";

const slug = process.env.MCP_SERVER_NAME ?? "cts-mcp";
const outDir = `test-cases/mcp/${slug}`;
mkdirSync(outDir, { recursive: true });

const transport = new StreamableHTTPClientTransport(
  new URL(process.env.MCP_SERVER_URL),
  { requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` } } }
);
const client = new Client({ name: "probe-chain", version: "0" }, { capabilities: {} });
await client.connect(transport);

async function probe(name, args) {
  console.log(`\n========== ${name}(${JSON.stringify(args).slice(0, 80)}) ==========`);
  try {
    const r = await client.callTool({ name, arguments: args });
    const fname = `${outDir}/discovery-${name.replace(/^cts_/, "")}.json`;
    writeFileSync(fname, JSON.stringify(r, null, 2), "utf8");
    console.log(`saved → ${fname}`);

    // Print first text payload
    if (r.content?.[0]?.text) {
      const text = r.content[0].text;
      console.log("--- text payload (first 600 chars) ---");
      console.log(text.slice(0, 600));
    }
    if (r.isError) console.log("(isError flag set)");
    return r;
  } catch (e) {
    console.log("FAILED:", e?.message ?? e);
    return null;
  }
}

// 1. search → should return at least one candidate
const search = await probe("cts_search_candidates", { keyword: "工程师", limit: 1 });

// Try to extract a candidate_id from the search result
let candidateId = null;
try {
  const text = search?.content?.[0]?.text ?? "";
  for (const line of text.split(/\r?\n/)) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.type === "data" && parsed?.data?.items?.[0]?.candidate_id) {
        candidateId = parsed.data.items[0].candidate_id;
        break;
      }
    } catch { /* skip non-JSON */ }
  }
} catch {}
console.log(`\n[chain] candidate_id discovered: ${candidateId}`);

if (candidateId) {
  await probe("cts_get_candidate_detail", { candidate_id: candidateId });
  await probe("cts_get_candidate_contact_info", { candidate_id: candidateId });
} else {
  console.log("[chain] no candidate_id; trying detail with bogus id (negative path)");
  await probe("cts_get_candidate_detail", { candidate_id: "nonexistent_123" });
}

// Also probe error path: empty search params (PRD says CTS_BAD_REQUEST)
await probe("cts_search_candidates", {});

await client.close();
console.log("\n[chain] done.");
