// Generic probe: connect to MCP server (driven by .env), list tools, save full discovery.
// Output: test-cases/mcp/${MCP_SERVER_NAME}/discovery.json
//
// Optional: --tool <name> to also do one no-arg happy-path call against that tool
//           (for sanity-checking auth + JSON-RPC roundtrip). Saves to discovery-{tool}.json.
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { argv } from "node:process";

const url = process.env.MCP_SERVER_URL;
const token = process.env.MCP_AUTH_TOKEN;
const slug = process.env.MCP_SERVER_NAME ?? "mcp-under-test";

if (!url || !token) {
  console.error("[probe] Missing MCP_SERVER_URL or MCP_AUTH_TOKEN in .env");
  process.exit(1);
}

const toolFlag = argv.indexOf("--tool");
const probeToolName = toolFlag >= 0 ? argv[toolFlag + 1] : null;

const outDir = `test-cases/mcp/${slug}`;
console.log(`[probe] slug=${slug}`);
console.log(`[probe] connecting to ${url}`);

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

const client = new Client(
  { name: "qa-platform-mcp-probe", version: "0.1.0" },
  { capabilities: {} }
);

try {
  await client.connect(transport);
  console.log("[probe] connected ok");

  const serverInfo = client.getServerVersion();
  const capabilities = client.getServerCapabilities();
  const instructions = client.getInstructions();
  console.log("[probe] serverInfo:", JSON.stringify(serverInfo));
  console.log("[probe] capabilities:", JSON.stringify(capabilities));
  console.log("[probe] instructions length:", instructions?.length ?? 0);

  const { tools } = await client.listTools();
  console.log(`[probe] tools count: ${tools.length}`);
  for (const t of tools) console.log(`  - ${t.name}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    `${outDir}/discovery.json`,
    JSON.stringify(
      { probedAt: new Date().toISOString(), serverInfo, capabilities, instructions, tools },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\n[probe] discovery saved to ${outDir}/discovery.json`);

  if (probeToolName) {
    const tool = tools.find((t) => t.name === probeToolName);
    if (!tool) {
      console.warn(`[probe] tool ${probeToolName} not found, skipping happy-path probe.`);
    } else {
      console.log(`\n[probe] trying ${probeToolName} with no args (sanity check)...`);
      try {
        const r = await client.callTool({ name: probeToolName, arguments: {} });
        const fname = `${outDir}/discovery-${probeToolName}-noargs.json`;
        writeFileSync(fname, JSON.stringify(r, null, 2), "utf8");
        console.log(`[probe] sample saved to ${fname}`);
      } catch (e) {
        console.log("[probe] sample call FAILED:", e?.message ?? e);
      }
    }
  }

  await client.close();
  console.log("\n[probe] DONE.");
} catch (err) {
  console.error("[probe] FATAL:", err?.message ?? err);
  console.error("[probe] full:", JSON.stringify(err, Object.getOwnPropertyNames(err ?? {})).slice(0, 1000));
  process.exit(3);
}
