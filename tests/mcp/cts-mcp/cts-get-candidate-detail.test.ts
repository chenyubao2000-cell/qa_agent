// cts_get_candidate_detail — L1 + L2 tests (8 cases: P0×6 + P1×2)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpClient, parseToolResult, stripVolatile } from "../_lib/mcp-client.js";
import { getKnownCandidateId } from "./_lib/fixtures.js";

const TOOL = "cts_get_candidate_detail";

interface DetailData {
  candidate_id: string;
  name?: string;
  has_phone?: boolean;
  has_email?: boolean;
  education_history?: unknown[];
  work_history?: unknown[];
}

const OFFLINE = process.env.MCP_OFFLINE === "1";

describe.skipIf(OFFLINE)(`${TOOL} [L1+L2]`, () => {
  let client: McpClient;
  let knownId: string | null = null;

  beforeAll(async () => {
    client = await McpClient.fromEnv();
    knownId = await getKnownCandidateId(client);
  });
  afterAll(async () => { await client.close(); });

  // ────────────────────── L1: Schema 合规 ──────────────────────

  it("[P0][L1] tools/list 中存在 cts_get_candidate_detail", async () => {
    const tools = await client.listTools();
    expect(tools.find((t) => t.name === TOOL)).toBeDefined();
  });

  it("[P0][L1] annotations 与 PRD §1.3.1 一致", async () => {
    const tools = await client.listTools();
    const t = tools.find((x) => x.name === TOOL)!;
    expect(t.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("[P0][L1] inputSchema candidate_id 为 required", async () => {
    const tools = await client.listTools();
    const t = tools.find((x) => x.name === TOOL)!;
    const required = (t.inputSchema as { required?: string[] }).required ?? [];
    expect(required).toContain("candidate_id");
  });

  // ────────────────────── L2: Happy path ──────────────────────

  it("[P0][L2] 用已知 candidate_id 取详情 → 返回完整简历", async () => {
    if (!knownId) {
      throw new Error("getKnownCandidateId returned null — search fixture upstream broken");
    }
    const r = await client.callTool(TOOL, { candidate_id: knownId });
    const { data, isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const d = data as DetailData;
    expect(d.candidate_id).toBe(knownId);
    expect(d).toHaveProperty("name");
    expect(d).toHaveProperty("has_phone");
    expect(d).toHaveProperty("has_email");
  });

  it("[P1][L2] 详情含 education_history / work_history 数组（PRD §4.x 详情新增字段）", async () => {
    if (!knownId) return;
    const r = await client.callTool(TOOL, { candidate_id: knownId });
    const { data } = parseToolResult(r);
    const d = data as DetailData;
    // 至少其中一个数组应该存在（不是所有候选都有完整简历）
    const hasEducationOrWork =
      Array.isArray(d.education_history) || Array.isArray(d.work_history);
    expect(hasEducationOrWork).toBe(true);
  });

  // ────────────────────── L2: 负面 / 边界 ──────────────────────

  it("[P0][L2] 缺 candidate_id → 应被拒绝（schema validation）", async () => {
    let rejected = false;
    try {
      const r = await client.callTool(TOOL, {});
      if (r.isError) rejected = true;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it("[P1][L2] candidate_id 不存在 → 应返错（PRD 未规范，至少 isError 标记）", async () => {
    const r = await client.callTool(TOOL, { candidate_id: "nonexistent_xxxxx_99999" });
    expect(r.isError).toBe(true);
  });

  // ────────────────────── L2: 鉴权 ──────────────────────

  it("[P0][L2] 鉴权：无 token → 应被拒绝", async () => {
    let c: McpClient | null = null;
    let failed = false;
    try {
      c = await McpClient.fromEnv({ noAuth: true });
      const r = await c.callTool(TOOL, { candidate_id: knownId ?? "any" });
      if (r.isError) failed = true;
    } catch {
      failed = true;
    } finally {
      try { await c?.close(); } catch { /* noop */ }
    }
    expect(failed).toBe(true);
  });

  // ────────────────────── L2: 幂等性 ──────────────────────

  it("[P0][L2] 幂等：同 candidate_id 取 2 次结果一致", async () => {
    if (!knownId) return;
    const args = { candidate_id: knownId };
    const a = parseToolResult(await client.callTool(TOOL, args)).data;
    const b = parseToolResult(await client.callTool(TOOL, args)).data;
    expect(stripVolatile(a)).toEqual(stripVolatile(b));
  });
});
