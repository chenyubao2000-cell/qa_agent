#!/bin/bash
# QA Watcher — 本地常驻轮询，监控 Railway 部署成功后自动触发 E2E 测试
#
# 用法：
#   bash scripts/ci/watcher.sh                  # 默认 3 分钟轮询
#   bash scripts/ci/watcher.sh --interval 300   # 5 分钟轮询
#   bash scripts/ci/watcher.sh --once           # 只检查一次（调试用）
#
# 流程：
#   轮询 GitHub Deployments API → 发现新的 success 部署
#   → 通过 sha 反查 PR → 分析 diff → 搜索 Linear 关联 bug
#   → CDP 探查受影响页面 → 生成/更新用例 → 跑 E2E → 上报 Linear
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INTERVAL=180
ONCE=false
LOG_DIR="$PLUGIN_DIR/logs"

while [[ $# -gt 0 ]]; do
  case $1 in
    --interval) INTERVAL="$2"; shift 2 ;;
    --once) ONCE=true; shift ;;
    *) shift ;;
  esac
done

mkdir -p "$LOG_DIR"

# 加载环境变量（export 到子进程）
set -a
source "$PLUGIN_DIR/scripts/setup/load-env.sh"
set +a

DEPLOY_ENV="${DEPLOY_ENVIRONMENT:-Mira / test}"

echo "=========================================="
echo "  QA Watcher 启动"
echo "  仓库: ${GITHUB_OWNER}/${GITHUB_REPO}"
echo "  监控环境: ${DEPLOY_ENV}"
echo "  Preview: ${PREVIEW_URL}"
echo "  轮询间隔: ${INTERVAL}s"
echo "=========================================="

run_cycle() {
  local TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
  echo ""
  echo "[$TIMESTAMP] 🔍 检查新的成功部署 ..."

  # ── Step 1: 检查新的成功部署 ──
  NEW_DEPLOYS=$(bash "$SCRIPT_DIR/check-deployments.sh" 2>/dev/null || echo "[]")
  DEPLOY_COUNT=$(echo "$NEW_DEPLOYS" | python -c "
import sys,json
try:
    data = json.load(sys.stdin)
    print(len(data) if isinstance(data, list) else 0)
except:
    print(0)
")

  if [ "$DEPLOY_COUNT" -eq 0 ]; then
    echo "[$TIMESTAMP] 💤 无新部署，继续等待"
    return 0
  fi

  echo "[$TIMESTAMP] 🚀 发现 ${DEPLOY_COUNT} 个新部署"

  # ── Step 2: 拉取最新代码 ──
  echo "[$TIMESTAMP] 📥 拉取最新代码 ..."
  if [ -d "$TARGET_PROJECT_DIR/.git" ]; then
    cd "$TARGET_PROJECT_DIR"
    git clean -fd test-results/ playwright-report/ 2>/dev/null || true
    git checkout -- . 2>/dev/null || true
    git fetch origin "$TARGET_BRANCH"
    git checkout "$TARGET_BRANCH" 2>/dev/null || true
    git pull origin "$TARGET_BRANCH" || {
      echo "[$TIMESTAMP]   ⚠️  git pull 失败，尝试 reset"
      git reset --hard "origin/$TARGET_BRANCH"
    }
    cd "$PLUGIN_DIR"
  fi

  # ── Step 3: 逐个处理部署 ──
  echo "$NEW_DEPLOYS" | python -c "
import sys,json
for d in json.load(sys.stdin):
    print(f\"{d['deployment_id']}|{d['sha']}|{d['pr_number']}|{d['pr_title']}\")
" | while IFS='|' read DEPLOY_ID SHA PR_NUM PR_TITLE; do
    local DEPLOY_LOG="$LOG_DIR/deploy-${DEPLOY_ID}-$(date +%Y%m%d-%H%M%S).log"
    echo "[$TIMESTAMP] ─── Deploy #${DEPLOY_ID} (sha: ${SHA:0:7}) ───"

    # 3a. 如果有关联 PR，分析 diff
    CHANGED_FILES=""
    AFFECTED_PAGES="[]"
    IMPACT_SUMMARY="无关联 PR"

    if [ "$PR_NUM" -gt 0 ] 2>/dev/null; then
      echo "[$TIMESTAMP]   关联 PR: #${PR_NUM} — ${PR_TITLE}"
      IMPACT=$(bash "$SCRIPT_DIR/analyze-pr-impact.sh" "$PR_NUM" 2>/dev/null || echo '{"skip_test":false,"summary":"分析失败","changed_files":[],"affected_pages":[]}')
      SKIP=$(echo "$IMPACT" | python -c "import sys,json; print(json.load(sys.stdin).get('skip_test', False))")
      IMPACT_SUMMARY=$(echo "$IMPACT" | python -c "import sys,json; print(json.load(sys.stdin).get('summary', ''))")
      AFFECTED_PAGES=$(echo "$IMPACT" | python -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('affected_pages', [])))")
      CHANGED_FILES=$(echo "$IMPACT" | python -c "import sys,json; print('\n'.join(json.load(sys.stdin).get('changed_files', [])))")

      echo "[$TIMESTAMP]   影响范围: $IMPACT_SUMMARY"

      if [ "$SKIP" = "True" ]; then
        echo "[$TIMESTAMP]   ⏭️  纯文档/测试改动，跳过"
        bash "$SCRIPT_DIR/update-state.sh" --deploy "$DEPLOY_ID"
        continue
      fi
    else
      echo "[$TIMESTAMP]   无关联 PR，将执行全量回归测试"
    fi

    # 3b. 调用 Claude Code 执行完整流水线
    echo "[$TIMESTAMP]   🤖 触发 Claude Code 流水线 ..."

    PROMPT=$(cat <<PROMPT_EOF
你是 QA 自动化助手，正在处理 CI Watcher 触发的部署后 E2E 测试任务。
全程无人值守，不要等待用户输入，遇到选择题自动选择最合理的选项。

---

## Phase 0: 加载项目上下文

### Step 1 — 读取本项目 .env
Read(".env")
提取 TARGET_PROJECT_DIR、PREVIEW_URL。

### Step 2 — 读取目标项目配置
Read("\$TARGET_PROJECT_DIR/CLAUDE.md")
Read("\$TARGET_PROJECT_DIR/.env")
Read("\$TARGET_PROJECT_DIR/playwright.config.ts")
提取 techStack、baseURL、authSetup、testCredentials、existingTests 缓存为 projectContext。

---

## Phase 1: 部署上下文

- 部署 ID: ${DEPLOY_ID}
- Commit SHA: ${SHA}
- 部署环境: ${DEPLOY_ENV}
- Preview URL: ${PREVIEW_URL}
- 关联 PR: #${PR_NUM} — ${PR_TITLE}
- 受影响页面: ${AFFECTED_PAGES}

### 变更文件
${CHANGED_FILES:-（无关联 PR，跳过 diff 分析，执行全量回归）}

---

## Phase 2: 搜索 Linear 关联 Bug

用 mcp__linear__search_issues 搜索与本次部署相关的 open/backlog issue：
1. 用 PR title 关键词搜索（如果有关联 PR）
2. 用受影响页面名搜索
3. 过滤状态为 Open / Backlog / In Progress 的 issue

将找到的 issue 记录为 relatedIssues 列表，提取每个 issue 的：
- issueId, title, pageUrl, reproSteps, expectedBehavior, actualBehavior, priority

如果没有找到相关 issue，relatedIssues 为空数组，继续后续步骤。

---

## Phase 3: CDP 探查受影响页面

### 如果有关联 PR（有 affected pages）：
对每个受影响的页面：
1. 将页面名映射为 PREVIEW_URL 下的完整路径（参考源码路由结构）
2. mcp__chrome-devtools__navigate_page 导航到目标页面
3. 等待页面加载完成
4. mcp__chrome-devtools__evaluate_script 提取 DOM 结构（data-testid、交互元素、aria-label、role）
5. mcp__chrome-devtools__take_snapshot 获取 DOM 快照
6. mcp__chrome-devtools__take_screenshot 获取截图

### 如果无关联 PR（全量回归）：
跳过 CDP 探查，直接进入 Phase 4。

---

## Phase 4: 生成/更新测试 + 执行

### 有关联 PR 的情况：
读取 agents/e2e-orchestrator.md，传入 source: "pr"，按优先级处理：
1. 有 relatedIssues → 按模式 C (issue) 逐个处理
2. 有 CDP 结果但无 issue → 按模式 B (cdp) 为新功能生成用例
3. 受影响页面已有 spec → 不重新生成，仅执行回归
执行范围：新生成的 spec + 受影响页面的已有 spec

### 无关联 PR 的情况（全量回归）：
直接执行所有已有 spec：
cd \$TARGET_PROJECT_DIR && npx playwright test tests/e2e/generated/ --reporter=json

---

## Phase 5: 报告 + 上报 Linear

### 5.1 处理 relatedIssues 对应的 spec 结果
- 通过 → mcp__linear__update_issue 追加评论：部署 ${DEPLOY_ID} 后测试通过
- 失败 → 保持 issue 状态，追加评论：部署后仍然失败 + 错误信息

### 5.2 处理其他 spec 的新增失败
读取 agents/report-analyzer.md 和 agents/bug-reporter.md：
1. 提取失败用例 + 截图路径
2. mcp__linear__search_issues 去重（搜索 "[自动] {test case name}"）
3. 未报告的 → mcp__linear__create_issue，title 注明部署 ${DEPLOY_ID}，description 注明 PR #${PR_NUM}

### 5.3 生成执行摘要
写入 logs/deploy-${DEPLOY_ID}-summary.md
PROMPT_EOF
)

    claude -p "$PROMPT" \
      --allowedTools "Agent,Bash,Read,Write,Edit,Glob,Grep,mcp__linear__create_issue,mcp__linear__search_issues,mcp__linear__list_issues,mcp__linear__get_issue,mcp__linear__update_issue,mcp__chrome-devtools__list_pages,mcp__chrome-devtools__take_snapshot,mcp__chrome-devtools__take_screenshot,mcp__chrome-devtools__evaluate_script,mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__click,mcp__chrome-devtools__fill,mcp__chrome-devtools__wait_for" \
      2>&1 | tee "$DEPLOY_LOG" || {
        echo "[$TIMESTAMP]   ⚠️  Claude Code 执行异常，查看日志: $DEPLOY_LOG"
      }

    echo "[$TIMESTAMP]   ✅ Deploy #${DEPLOY_ID} 处理完成"

    # 3c. 更新状态
    bash "$SCRIPT_DIR/update-state.sh" --deploy "$DEPLOY_ID"
    [ "$PR_NUM" -gt 0 ] 2>/dev/null && bash "$SCRIPT_DIR/update-state.sh" --pr "$PR_NUM"
  done

  echo "[$TIMESTAMP] ✅ 本轮处理完成"
}

# 主循环
if [ "$ONCE" = true ]; then
  run_cycle
else
  while true; do
    run_cycle || echo "⚠️  本轮执行出错，继续下一轮"
    echo "💤 等待 ${INTERVAL}s ..."
    sleep "$INTERVAL"
  done
fi
