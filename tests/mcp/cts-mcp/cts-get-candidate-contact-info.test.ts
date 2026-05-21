// cts_get_candidate_contact_info — L1 + L2 tests (8 cases: P0×7 + Skip×1)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpClient, parseToolResult, stripVolatile } from "../_lib/mcp-client.js";
import { getKnownCandidateId } from "./_lib/fixtures.js";

const TOOL = "cts_get_candidate_contact_info";

interface ContactData {
  phone?: string | null;
  email?: string | null;
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

  it("[P0][L1] tools/list 中存在 cts_get_candidate_contact_info", async () => {
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

  it("[P0][L2] 已知 candidate_id 取联系方式 → 返回 phone / email 字段", async () => {
    if (!knownId) {
      throw new Error("getKnownCandidateId returned null");
    }
    const r = await client.callTool(TOOL, { candidate_id: knownId });
    const { data, isError } = parseToolResult(r);
    // PRD: 有权限明文返回；无权限 403。当前测试帐号假设有权限。
    expect(isError).toBeFalsy();
    const c = data as ContactData;
    // phone / email 至少一个字段存在（值可能为 null）
    expect("phone" in c || "email" in c).toBe(true);
  });

  // ────────────────────── L2: 负面 ──────────────────────

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

  it("[P0][L2] candidate_id 不存在 → 应返错", async () => {
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

  // ────────────────────── L2: 403 待补 ──────────────────────

  it.skip("[P0][L2] 鉴权：有 token 但无 contact 访问权限 → 403（PRD §2.4）", () => {
    // TODO(C): 待运维提供"有 token 但无 contact 数据访问权限"的测试账号；
    //          contact_info 是鉴权敏感最强的工具，必须独立账号测试。
  });
});
