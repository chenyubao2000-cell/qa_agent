---
description: "启动质量守卫：监控Sentry/Langfuse/Railway/DB，异常时自动触发测试和告警"
allowed-tools: Agent, Bash, Read, Write, Grep, Glob, WebFetch
---

You are a quality sentinel operator. Start the multi-platform monitoring system.

```
/qa-sentinel [--platforms sentry,langfuse,railway,db] [--interval 5m] [--budget 5]
     |
Phase 0: 校验各平台 API Key，验证连接
     |
Phase 1: 加载历史基线数据
     |
Phase 2: 启动 sentinel-agent 监控循环
     |
Phase 3: 异常响应（升级模型 + 生成测试 + 通知）
```

## Phase 0: 环境校验

```
Read(".env")
```

提取各平台凭证并验证连接：

| 变量 | 平台 | 用途 |
|------|------|------|
| `SENTRY_AUTH_TOKEN` | Sentry | API 认证 |
| `SENTRY_ORG` | Sentry | 组织 slug |
| `SENTRY_PROJECT` | Sentry | 项目 slug |
| `LANGFUSE_PUBLIC_KEY` | Langfuse | API 公钥 |
| `LANGFUSE_SECRET_KEY` | Langfuse | API 私钥 |
| `LANGFUSE_HOST` | Langfuse | API 地址（默认 https://cloud.langfuse.com）|
| `RAILWAY_TOKEN` | Railway | API token |
| `QA_WORKSPACE_DIR` | 通用 | 测试工作目录 |
| `SOURCE_PROJECT_DIR` | 通用 | 源码目录 |
| `GITHUB_OWNER` | GitHub | 仓库 owner |
| `GITHUB_REPO` | GitHub | 仓库名 |

连接验证：
- Sentry: `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" https://sentry.io/api/0/` → 期望 200
- Langfuse: `curl -s -o /dev/null -w "%{http_code}" -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" "$LANGFUSE_HOST/api/public/health"` → 期望 200
- Railway: `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $RAILWAY_TOKEN" https://backboard.railway.app/graphql/v2` → 期望 200

对未配置的平台输出 WARNING 并从监控列表中排除。至少需要一个平台可用才能继续。

**Parse parameters from $ARGUMENTS** (supports both flags and natural language):

| Input | Parsed as |
|-------|-----------|
| `--platforms sentry,langfuse` | platforms = ["sentry", "langfuse"] |
| `只监控 sentry` | platforms = ["sentry"] |
| `全部平台` / `all` | platforms = ["sentry", "langfuse", "railway", "db", "github"] |
| `--interval 5m` / `--interval 300` | interval = 300s |
| `每10分钟` | interval = 600s |
| `--budget 3` | budget = $3/day |

默认值：
- platforms: 所有已配置的平台
- interval: 300s（5分钟）
- budget: $5/day

## Phase 1: 加载历史基线

```
Read("sentinel-reports/baseline.json")
```

如果基线文件不存在：
1. 首次运行，执行各平台数据采集建立基线
2. Langfuse: 查询最近24小时的 trace 统计，计算 avgScore/errorRate/latencyP95/tokenCost 作为基线
3. 写入 `sentinel-reports/baseline.json`

如果基线文件已存在且超过7天：
- 输出 WARNING: "基线数据已过期，建议用 --refresh-baseline 刷新"

## Phase 2: 启动 sentinel-agent

Launch sentinel-agent (haiku):

```
You are sentinel-agent. First read .claude/agents/sentinel-agent.md to understand your full responsibilities.

Input:
- platforms: {parsed platform list}
- interval: {parsed interval in seconds}
- budget: {parsed daily budget}
- projectContext:
    targetProjectDir: "$QA_WORKSPACE_DIR"
    sourceProjectDir: "$SOURCE_PROJECT_DIR"
- baseline: {loaded baseline data}

Execute monitoring loop per .claude/agents/sentinel-agent.md.
```

或者直接启动守护进程：

```bash
npx tsx scripts/sentinel-watcher.ts --platforms {platforms} --interval {interval} --budget {budget}
```

> **选择策略**：
> - 前台交互模式（用户在 Claude Code 中）→ 启动 sentinel-agent，实时输出监控状态
> - 后台守护模式（长期运行）→ 启动 sentinel-watcher.ts 守护进程

## Phase 3: 异常响应

sentinel-agent 检测到异常后的响应流程：

### Critical 级别
1. 立即通知：调用 `hooks/post-notify.sh` 发送 Slack 消息
2. 创建 Linear Issue：
   ```
   Launch bug-reporter (sonnet):
   - severity: critical
   - title: "[Sentinel] {platform}: {issue summary}"
   - description: {detailed report from sentinel-agent}
   ```
3. 触发回归测试：
   ```
   Launch test-executor (haiku):
   - mode: "smoke"
   - specFiles: {related specs based on affected code}
   ```

### Warning 级别
1. 生成回归测试建议：写入 `sentinel-reports/{platform}/`
2. Slack 通知（非紧急频道）
3. 纳入每日汇总报告

### Info 级别
1. 记录日志
2. 纳入每日汇总报告

## 输出

监控启动后持续输出状态：
```
[sentinel] Sentry: 0 new issues (last 5min)
[sentinel] Langfuse: score=0.87 errorRate=1.2% latencyP95=2.8s — OK
[sentinel] Railway: no new deployments
[sentinel] DB: no schema changes
[sentinel] Budget: $0.45 / $5.00 (9%)
```

异常时升级输出：
```
[sentinel] CRITICAL Sentry: TypeError in TaskCard.tsx:42 — no test coverage
[sentinel] → Creating Linear Issue...
[sentinel] → Triggering regression test for task-sidebar...
[sentinel] → Slack notification sent
```
