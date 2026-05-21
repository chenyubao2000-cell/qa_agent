// cts_search_candidates — L1 + L2 tests (15 cases)
// Per design doc / cases.md (M2).
//
// CONSTRAINT: CTS test server has a daily search quota (calls=10, items=500/day).
// Once exhausted, all search calls return CTS_DAILY_QUOTA_EXCEEDED. We detect this
// in beforeAll and skip search-dependent tests with a clear reason.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpClient, parseToolResult, stripVolatile } from "../_lib/mcp-client.js";
import { probeSearchQuota } from "./_lib/fixtures.js";

const TOOL = "cts_search_candidates";

let quotaExhausted = false;
let quotaReason = "";

interface SearchItem {
  candidate_id: string;
  name?: string;
  has_phone?: boolean;
  has_email?: boolean;
}
interface SearchData {
  items: SearchItem[];
  total?: number;
  next_cursor?: string | null;
}

const OFFLINE = process.env.MCP_OFFLINE === "1";

describe.skipIf(OFFLINE)(`${TOOL} [L1+L2]`, () => {
  let client: McpClient;

  beforeAll(async () => {
    client = await McpClient.fromEnv();
    const q = await probeSearchQuota(client);
    if (q.exhausted) {
      quotaExhausted = true;
      quotaReason = q.reason ?? "CTS_DAILY_QUOTA_EXCEEDED";
      console.warn(`[search] daily quota exhausted: ${quotaReason} — search-dependent tests will skip until 00:00 Beijing time.`);
    }
  });
  afterAll(async () => { await client.close(); });

  // ────────────────────── L1: Schema 合规 ──────────────────────

  it("[P0][L1] tools/list 中存在 cts_search_candidates", async () => {
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

  it("[P0][L1] inputSchema 含 keyword / semantic_query / location / limit / cursor 等核心参数", async () => {
    const tools = await client.listTools();
    const t = tools.find((x) => x.name === TOOL)!;
    const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(["keyword", "semantic_query", "location", "education", "limit", "cursor"])
    );
  });

  // ────────────────────── L2: Happy paths（3 模式） ──────────────────────

  it("[P0][L2] keyword 模式：keyword='工程师' → items 非空且每条含 candidate_id", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const r = await client.callTool(TOOL, { keyword: "工程师", limit: 3 });
    const { data, isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const sd = data as SearchData;
    expect(sd.items.length).toBeGreaterThan(0);
    expect(sd.items[0].candidate_id).toBeTruthy();
    expect(typeof sd.items[0].has_phone).toBe("boolean");
    expect(typeof sd.items[0].has_email).toBe("boolean");
  });

  it("[P0][L2] semantic 模式：semantic_query=JD描述 → items 非空（软断言）", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const r = await client.callTool(TOOL, {
      semantic_query: "找做后端开发熟悉分布式系统的资深工程师",
      limit: 3,
    });
    const { data, isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const sd = data as SearchData;
    expect(sd.items.length).toBeGreaterThan(0);
  });

  it("[P0][L2] hybrid 模式：keyword + semantic_query 同时传 → items 非空", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const r = await client.callTool(TOOL, {
      keyword: "Java",
      semantic_query: "后端服务端开发",
      limit: 3,
    });
    const { data, isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const sd = data as SearchData;
    expect(sd.items.length).toBeGreaterThan(0);
  });

  // ────────────────────── L2: 边界 / 负面 ──────────────────────

  it("[P0][L2] 空参数 → CTS_BAD_REQUEST（PRD 强制规则 #7）", async () => {
    const r = await client.callTool(TOOL, {});
    const { data, isError } = parseToolResult(r);
    expect(isError).toBe(true);
    const errBody = data as { errorCode?: string; message?: string };
    expect(errBody.errorCode).toBe("CTS_BAD_REQUEST");
    expect(errBody.message).toMatch(/at least one|filter parameter/i);
  });

  it("[P1][L2] limit=200（max）应允许 — items 数 ≤ 200", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const r = await client.callTool(TOOL, { keyword: "工程师", limit: 200 });
    const { data, isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const sd = data as SearchData;
    expect(sd.items.length).toBeLessThanOrEqual(200);
  });

  it("[P1][L2] limit=201（超过 max）→ 应被拒绝", async () => {
    let rejected = false;
    try {
      const r = await client.callTool(TOOL, { keyword: "工程师", limit: 201 });
      if (r.isError) rejected = true;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it("[P1][L2] gender='X' 非法枚举值 → 应被拒绝", async () => {
    let rejected = false;
    try {
      const r = await client.callTool(TOOL, { keyword: "工程师", gender: "X" });
      if (r.isError) rejected = true;
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it("[P1][L2] 不存在的 keyword='zzzznonexistent_xyz123' → items 为空 + total=0", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const r = await client.callTool(TOOL, { keyword: "zzzznonexistent_xyz123", limit: 1 });
    const { data, isError } = parseToolResult(r);
    expect(isError).toBeFalsy();
    const sd = data as SearchData;
    expect(sd.items.length).toBe(0);
    if (sd.total !== undefined) expect(sd.total).toBe(0);
  });

  // ────────────────────── L2: 鉴权 ──────────────────────

  it("[P0][L2] 鉴权：无 token → 应被拒绝", async () => {
    let c: McpClient | null = null;
    let failed = false;
    try {
      c = await McpClient.fromEnv({ noAuth: true });
      const r = await c.callTool(TOOL, { keyword: "工程师" });
      if (r.isError) failed = true;
    } catch {
      failed = true;
    } finally {
      try { await c?.close(); } catch { /* noop */ }
    }
    expect(failed).toBe(true);
  });

  // ────────────────────── L2: 幂等性 ──────────────────────

  it("[P0][L2] 幂等：同 keyword 查 2 次 items 顺序一致（剥除 trace_id / quota）", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const args = { keyword: "工程师", limit: 3, sort_by: "default" };
    const a = parseToolResult(await client.callTool(TOOL, args)).data;
    const b = parseToolResult(await client.callTool(TOOL, args)).data;
    expect(stripVolatile(a)).toEqual(stripVolatile(b));
  });

  // ────────────────────── L2: 工具特有 ──────────────────────

  it("[P1][L2] meta 含 total / next_cursor — total ≥ items.length", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const r = await client.callTool(TOOL, { keyword: "工程师", limit: 2 });
    const { data } = parseToolResult(r);
    const sd = data as SearchData;
    if (sd.total !== undefined) {
      expect(sd.total).toBeGreaterThanOrEqual(sd.items.length);
    }
    expect("next_cursor" in sd).toBe(true);
  });

  it("[P1][L2] 分页：limit=1 + 翻 next_cursor → 第二页 items 与第一页不重复", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const a = parseToolResult(await client.callTool(TOOL, { keyword: "工程师", limit: 1 })).data as SearchData;
    expect(a.items.length).toBe(1);
    if (!a.next_cursor) {
      // 数据集只有 1 条 — 跳过翻页校验
      return;
    }
    const b = parseToolResult(
      await client.callTool(TOOL, { keyword: "工程师", limit: 1, cursor: a.next_cursor })
    ).data as SearchData;
    expect(b.items.length).toBeGreaterThan(0);
    expect(b.items[0].candidate_id).not.toBe(a.items[0].candidate_id);
  });

  // ────────────────────── L2: 字段返回保证 ──────────────────────

  it("[P1][L2] 返回 item 含 PRD §4.1 必有字段：candidate_id / name / has_phone / has_email", async (ctx) => {
    if (quotaExhausted) return ctx.skip();
    const r = await client.callTool(TOOL, { keyword: "工程师", limit: 1 });
    const { data } = parseToolResult(r);
    const sd = data as SearchData;
    expect(sd.items.length).toBeGreaterThan(0);
    const it0 = sd.items[0];
    expect(it0).toHaveProperty("candidate_id");
    expect(it0).toHaveProperty("name");
    expect(it0).toHaveProperty("has_phone");
    expect(it0).toHaveProperty("has_email");
  });
});
