import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["D:/code/qa_agent/tests/whitebox/demo-mcp/vitest/**/*.test.ts"],
  },
});
