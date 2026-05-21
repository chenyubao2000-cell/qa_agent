// Shared fixtures for cts-mcp tests.
// Provides a known-good candidate_id, falling back to a stable static ID when the
// CTS test server's daily search quota is exhausted (real constraint observed:
// "calls=10/10 items=16/500" → CTS_DAILY_QUOTA_EXCEEDED).
import { McpClient, parseToolResult } from "../../_lib/mcp-client.js";

// Static fallback discovered via probe-cts-chain.mjs on 2026-05-08
// — a stable candidate that exists in the CTS test pool. If this id ever
// disappears, refresh by running scripts/probe-cts-chain.mjs.
const FALLBACK_CANDIDATE_ID = "fd1434e8-66c1-40bd-b05b-4f77c1ada7b8";

let cachedCandidateId: string | null = null;
let searchQuotaExhausted = false;

export interface QuotaState {
  exhausted: boolean;
  reason?: string;
}

/**
 * Find a real candidate_id, preferring a fresh search but falling back to a static
 * id when search quota is exhausted. Always returns a non-null id (assuming the
 * fallback id is still valid in the CTS test pool).
 */
export async function getKnownCandidateId(client: McpClient): Promise<string> {
  if (cachedCandidateId) return cachedCandidateId;

  try {
    const r = await client.callTool("cts_search_candidates", { keyword: "工程师", limit: 1 });
    const { data, isError } = parseToolResult(r);

    if (isError) {
      const err = data as { errorCode?: string } | null;
      if (err?.errorCode === "CTS_DAILY_QUOTA_EXCEEDED") {
        searchQuotaExhausted = true;
      }
    } else {
      const item = (data as { items?: Array<{ candidate_id?: string }> } | null)?.items?.[0];
      if (item?.candidate_id) {
        cachedCandidateId = item.candidate_id;
        return cachedCandidateId;
      }
    }
  } catch {
    // network or other transient — fall through to fallback
  }

  cachedCandidateId = FALLBACK_CANDIDATE_ID;
  return cachedCandidateId;
}

/**
 * Detect whether the CTS test server's daily search quota is currently exhausted.
 * Use in beforeAll to gate search-dependent tests via ctx.skip().
 */
export async function probeSearchQuota(client: McpClient): Promise<QuotaState> {
  if (searchQuotaExhausted) return { exhausted: true, reason: "cached" };

  try {
    const r = await client.callTool("cts_search_candidates", { keyword: "quota_probe_xyzabc_999", limit: 1 });
    const { data, isError } = parseToolResult(r);
    if (isError) {
      const err = data as { errorCode?: string; message?: string } | null;
      if (err?.errorCode === "CTS_DAILY_QUOTA_EXCEEDED") {
        searchQuotaExhausted = true;
        return { exhausted: true, reason: err.message ?? "CTS_DAILY_QUOTA_EXCEEDED" };
      }
    }
    return { exhausted: false };
  } catch (e) {
    return { exhausted: false, reason: `probe failed: ${(e as Error).message}` };
  }
}
