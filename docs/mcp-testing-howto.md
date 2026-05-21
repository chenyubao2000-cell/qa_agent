# MCP 测试快速上手

给一个新的 MCP（比如 `foo-mcp`）加自动化测试，5 分钟看完，跟着抄即可。

> 这是**操作手册**。想理解架构 / 决策动机 → [docs/mcp-test-design.md](./mcp-test-design.md)
> 想看可视化流程图 → 浏览器打开 [docs/qa-mcp-test-flow.html](./qa-mcp-test-flow.html)

---

## 0. 前提

测一个 MCP 需要 3 样东西：

| 项 | 说明 | 必需？ |
|---|---|:---:|
| **PRD 文档** | 描述这个 MCP 暴露哪些工具、参数、行为规则 | ✅ |
| **Server URL** | 被测 MCP 的 Streamable HTTP endpoint | ✅（在线模式） |
| **Bearer Token** | 鉴权，从研发或 SSO 拿 | ✅（在线模式） |

PRD 缺一项也能跑（offline 模式生成 spec 骨架，等 server 就绪再实跑）。

---

## 1. 30 秒上手（fast path，推荐）

### Step 1 — 改 `.env` 4 个变量

```bash
# ── MCP under test（用于 /qa-mcp-test）────────────────────────
MCP_SERVER_NAME=foo-mcp                              # ← slug，决定测试目录名
MCP_SERVER_URL=https://foo-mcp.example.com/mcp       # ← server endpoint
MCP_AUTH_TOKEN=eyJ0eXAi...                           # ← Bearer token
MCP_TRANSPORT=http                                   # V1.0 仅 http
MCP_PRD_PATH=docs/Foo MCP V1.0 - PRD Final.md        # ← PRD 路径
```

### Step 2 — 跑流水线

```powershell
/qa-mcp-test
```

完事。Claude 会自动：

1. 探活 server（`tools/list` + capabilities）→ 存 [test-cases/mcp/foo-mcp/discovery.json](test-cases/mcp/)
2. 解 PRD → 抽 expected schema + 行为规则 + 场景
3. Schema diff（PRD vs server）→ [tests/mcp/foo-mcp/reports/schema-diff.report.md](tests/mcp/)
4. 生成用例（按 12 维测试矩阵 + P0/P1）：
   - [test-cases/mcp/foo-mcp/cases.md](test-cases/mcp/) — 中文用例文档
   - [test-cases/mcp/foo-mcp/excel/cases.xlsx](test-cases/mcp/) — Excel
   - [test-cases/mcp/foo-mcp/handoff.json](test-cases/mcp/) — 中间产物
5. 渲染 vitest spec → `tests/mcp/foo-mcp/*.test.ts`（每个工具一个）
6. 执行 → 报告：[tests/mcp/foo-mcp/reports/results.json](tests/mcp/) + `foo-mcp-summary.md`

### Step 3 — 看结果

```powershell
# 看人类摘要
cat tests/mcp/foo-mcp/reports/foo-mcp-summary.md

# 看 schema diff
cat tests/mcp/foo-mcp/reports/schema-diff.report.md
```

---

## 2. 二次执行（spec 已生成时）

PRD 没改、只想验证 server 当前状态，**不需要重跑 `/qa-mcp-test`**，直接：

```powershell
# 全量在线跑
npx vitest run --config tests/mcp/vitest.config.ts

# 只跑某个工具
npx vitest run --config tests/mcp/vitest.config.ts tests/mcp/foo-mcp/foo-search.test.ts

# 离线模式（spec 全 skip，验证不会因离线挂掉）
$env:MCP_OFFLINE=1; npx vitest run --config tests/mcp/vitest.config.ts; Remove-Item Env:MCP_OFFLINE
```

辅助脚本：

```powershell
# 重新探活 server（覆盖 discovery.json）
node scripts/probe-mcp.mjs

# 探活并对某个工具做无参 happy-path 调用
node scripts/probe-mcp.mjs --tool foo_search

# 重生 schema diff 报告（不重生 spec）
npx tsx tests/mcp/foo-mcp/build-schema-diff.ts
```

---

## 3. `/qa-mcp-test` 全部参数

```
/qa-mcp-test [--prd <path>] [--server <name|url>] [--scope L1|L2|all]
             [--exec|--no-exec] [--report-linear]
```

| Flag | 默认 | 说明 |
|------|---|---|
| `--prd <path>` | `MCP_PRD_PATH` | PRD 文档路径 |
| `--server <name\|url>` | `MCP_SERVER_NAME` / `MCP_SERVER_URL` | 被测对象 |
| `--scope` | `all` | `L1` 仅协议、`L2` 仅行为 |
| `--exec` / `--no-exec` | `--exec` | 生成后是否立刻跑 |
| `--report-linear` | off | 失败追加 Linear（默认关，自审） |

---

## 4. 测试目录结构（生成出来长这样）

```
tests/mcp/
├── _lib/                                   ← 跨 MCP 共享，不用动
│   ├── mcp-client.ts                       MCP client 封装（fromEnv / parseToolResult / stripVolatile）
│   └── schema-diff.ts                      PRD vs server diff 工具
├── _setup.ts                               vitest 全局 setup（dotenv + MCP_OFFLINE 处理）
├── vitest.config.ts                        slug-aware 配置
└── foo-mcp/                                ← 每个 MCP 一个目录
    ├── _lib/
    │   └── fixtures.ts                     MCP 专属夹具（known-good id 缓存 / quota 探测）
    ├── foo-search.test.ts                  per-tool spec
    ├── foo-detail.test.ts
    ├── build-schema-diff.ts                schema diff 报告生成器
    └── reports/
        ├── results.json                    vitest JSON 报告
        ├── schema-diff.report.md           PRD vs server diff
        └── foo-mcp-summary.md              汇总（人类读）

test-cases/mcp/foo-mcp/
├── cases.md                                用例文档
├── excel/cases.xlsx                        Excel 用例
├── handoff.json                            generator → spec 中间产物
└── discovery.json                          server 探活快照
```

---

## 5. FAQ / 常见坑

### Q1：Token 过期了（401 错误）

```
[mcp-test] Missing MCP_SERVER_URL or MCP_AUTH_TOKEN in .env.
If your token expired (401), update .env and rerun.
```

到 SSO 重新拿 token，更新 `.env` 的 `MCP_AUTH_TOKEN`，重跑即可。V1.0 不做自动 refresh（V1.1 计划）。

### Q2：测试服有 quota 限制（calls=N/day），频繁跑会被限流

cts-mcp 的 search 工具就有这问题（10 calls/day）。生成器会自动加 quota 探测 + 条件 skip：

- `fixtures.ts` 里的 `probeSearchQuota()` 先试一次轻量 search
- 探测到 `XXX_DAILY_QUOTA_EXCEEDED` 错误码 → 标记 quota 用尽
- 依赖该工具的用例自动 `ctx.skip()`，等次日 quota 重置

如果新 MCP 也有 quota，仿照 [tests/mcp/cts-mcp/_lib/fixtures.ts](../tests/mcp/cts-mcp/_lib/fixtures.ts) 在生成的 fixtures 里加同样的探测。

### Q3：403 用例（有 token 但无权限）暂时测不了

V1.0 留 `it.skip()` 加 `// TODO: requires test account with restricted scope` 注释。等运维给你一个"有 token 无权限"的测试账号，把 skip 去掉即可。

### Q4：Server 还没部署好怎么提前生成 spec？

```powershell
# 离线生成（不连 server，所有 spec 用 it.skip 标记）
/qa-mcp-test --no-exec
```

或运行时加 `MCP_OFFLINE=1`：

```powershell
$env:MCP_OFFLINE=1; npx vitest run --config tests/mcp/vitest.config.ts
```

server 就绪后去掉 env 变量正常跑。

### Q5：vitest 跑出 `Cannot read properties of undefined (reading 'config')`

vitest 4.x + `pool: "forks"` + `fileParallelism: false` 的已知 bug —— 已在配置里改成 `pool: "threads"` + `poolOptions.threads.singleThread: true`，**不要改回去**。

### Q6：怎么测 stdio transport 的 MCP（走 `mcp-remote`）

V1.0 不支持，只能 HTTP 直连。stdio 测试列在 design doc §10 已知限制里，按需扩展 `tests/mcp/_lib/mcp-client.ts` 加 stdio transport。

### Q7：生成的 spec 跑出来有些用例失败，是 server bug 还是测试 bug？

先看失败用例的标签：

- `[P0][L1]` 失败 → 大概率是 PRD vs server schema 不一致，看 schema-diff.report.md
- `[P0][L2] happy path` 失败 → 测试数据不对 / token 过期 / server 真有 bug
- `[P1][L2] 边界` 失败 → server 边界行为可能跟 PRD 不一致

不存在的 ID 返回 `INTERNAL Error` 这种情况，cts-mcp 已发现是 server 端 NPE（应返 NOT_FOUND）—— 把这类情况记到 [tests/mcp/{slug}/reports/{slug}-summary.md](tests/mcp/) "已知发现" 段。

---

## 6. 加新 MCP 的 checklist

- [ ] PRD 文档放进 `docs/`
- [ ] `.env` 4 个变量已配（NAME / URL / TOKEN / PRD_PATH）
- [ ] 跑 `/qa-mcp-test` → 看 Phase 0~4 全过
- [ ] 检查 `cases.md` 用例是否合理（人类 review）
- [ ] 检查 schema diff（critical 项跟 PRD owner 同步）
- [ ] 检查测试结果（P0 100% / P1 ≥ 80%）
- [ ] 把 server 端发现的 bug 提 Linear
- [ ] commit

---

## 7. 想测但 `/qa-mcp-test` 不够用？

PRD 缺失、PRD 格式特殊、有非常规自定义场景 → 手动 fallback：

1. 跑 `node scripts/probe-mcp.mjs` 拿 discovery.json
2. 参考 [tests/mcp/cts-mcp/](../tests/mcp/cts-mcp/) 手写 `*.test.ts`
3. import 已有 `_lib/mcp-client.ts`，不用重新造轮子
4. `npx vitest run --config tests/mcp/vitest.config.ts` 验证

详细模板：[skills/mcp-test-generator/references/vitest-template.md](../skills/mcp-test-generator/references/vitest-template.md)
