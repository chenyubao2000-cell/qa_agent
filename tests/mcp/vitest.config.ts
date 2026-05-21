import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Per-MCP report folder, derived from MCP_SERVER_NAME.
// For cts-mcp this resolves to tests/mcp/cts-mcp/reports/results.json.
const slug = process.env.MCP_SERVER_NAME ?? "cts-mcp";

export default defineConfig({
  root: __dirname,
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    setupFiles: [resolve(__dirname, "_setup.ts")],
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ["default", "json"],
    outputFile: {
      json: resolve(__dirname, `${slug}/reports/results.json`),
    },
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
