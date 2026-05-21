// Vitest global setup — loads .env once before any test runs.
// Set MCP_OFFLINE=1 to skip env validation (offline / MCP not yet deployed scenario).
// In offline mode, every describe.skipIf in specs causes all tests to skip.
import "dotenv/config";

const offline = process.env.MCP_OFFLINE === "1";

if (!offline && (!process.env.MCP_SERVER_URL || !process.env.MCP_AUTH_TOKEN)) {
  throw new Error(
    "[mcp-test] Missing MCP_SERVER_URL or MCP_AUTH_TOKEN in .env. " +
      "If your token expired (401), update .env and rerun. " +
      "If MCP server is not yet deployed, set MCP_OFFLINE=1 to skip all tests.",
  );
}

if (offline) {
  console.warn("[mcp-test] MCP_OFFLINE=1 — all describe blocks will skip via describe.skipIf.");
}
