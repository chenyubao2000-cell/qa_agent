---
description: Run QA tests driven by a GitHub branch's code changes vs main — match existing specs or generate new ones, optionally report to Linear
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit, mcp__linear__create_comment, mcp__linear__get_issue, mcp__linear__search_issues, mcp__linear__update_issue, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__evaluate_script, mcp__chrome-devtools__click, mcp__chrome-devtools__hover, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__press_key, mcp__chrome-devtools__fill
---

You are a branch-driven QA executor. Given a GitHub branch, analyze its diff vs main, match or generate E2E tests for affected modules, execute them, and optionally report results to Linear issues.

**Core difference from other commands**:
- `/qa-from-issue`: driven by Linear issue description
- `/qa-explore`: driven by live page exploration
- `/qa-from-branch`: driven by **code changes in a branch** — identifies what changed, finds or creates tests for affected areas. Optionally enriched by Linear issue context.

```
/qa-from-branch [branch-name] [issue-key|url ...] [--source <source-code-dir>]

Examples:
/qa-from-branch                                           # interactive: list 5 branches, user picks
/qa-from-branch feature/chat-redesign                     # explicit branch name, no issues
/qa-from-branch feature/chat-redesign STE-42              # branch + single issue
/qa-from-branch feature/xyz STE-42 STE-43                 # branch + multiple issues
/qa-from-branch feature/xyz https://linear.app/team/issue/STE-42/title  # branch + Linear URL
/qa-from-branch feature/xyz STE-42 https://linear.app/team/issue/STE-43  # mixed keys + URLs
/qa-from-branch STE-42                                    # no branch (interactive pick) + issue
```

## Pipeline Overview

```
/qa-from-branch [branch] [issues...] [--source dir]
     |
Phase 0: Load project context (.env → config)
     |
Phase 1: Branch Selection + Diff Extraction
     ├─ Step 1: List 7 recent branches (incl. main) + "手动输入" + "不使用分支" → user picks
     ├─ Step 2: (skip if no branch) Ask diff strategy: "完整分支差异" vs "仅最新提交"
     ├─ Step 3: (skip if no branch) Get changelist + raw diff → summarize as changeSummary
     └─ Step 4: Read remote source code via GitHub Contents API
     |
Phase 1.5: (optional) Fetch Linear Issue Context
     ├─ Step 1: Parse issue keys/URLs from arguments
     ├─ Step 2: mcp__linear__get_issue for each → extract pageUrl, feature, description
     └─ Step 3: Merge issue-derived modules + pageUrls into matching inputs
     |
Phase 2: Match Changelist + Issues → Existing Specs
     ├─ Step 1: Scan existing specs, build slug→spec mapping
     ├─ Step 2: Extract module keywords from changelist + issues, match specs
     └─ Step 3: Determine strategy + report to user
          ├─ All matched → "selective" (run existing only)
          ├─ Partial match → "selective+generate"
          └─ No match → "generate"
     |
Phase 3: Conditional Generation (only for unmatchedModules)
     ├─ Step 1: CDP targeted exploration (infer page URLs from source + issues)
     ├─ Step 2: e2e-orchestrator generates specs (with changelist + changeSummary + issueContexts)
     └─ Step 3: qa-fix-tests verifies generated specs
     |
Phase 4: Execute Tests
     ├─ matchedSpecs + newSpecs → test-executor (selective)
     └─ Output report JSON
     |
Phase 5: Report
     ├─ report-analyzer analyzes (with changeSummary for change attribution)
     ├─ Display results to user
     └─ If issues provided → ask user before commenting on Linear issues
```

---

## Phase 0: Load Context + Initialize Workspace

### Step 1 — Read .env + Build projectContext

```
Read(".env")
```

Extract: `QA_WORKSPACE_DIR`, `PREVIEW_URL`, `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`, `APP_LANGUAGES`, `I18N_MESSAGES_DIR`, `TARGET_GITHUB_OWNER`, `TARGET_GITHUB_REPO`, `SOURCE_PROJECT_DIR`, `LINEAR_*`.

### Step 2 — Read Tech Stack

```
Read("$SOURCE_PROJECT_DIR/CLAUDE.md")  # tech stack (if SOURCE_PROJECT_DIR exists)
```

### Step 3 — Initialize Workspace

Execute `.claude/references/phase-0-workspace-init.md` Steps 2a–2f (skip-if-exists).

### Step 4 — Parse Arguments

```
Parse $ARGUMENTS:
  --source <dir>          → sourceOverride (optional, overrides SOURCE_PROJECT_DIR)
  
  Remaining tokens — classify each:
    1. Looks like a branch name (contains '/' or matches known branch): → explicitBranch
    2. Linear URL (contains 'linear.app/'):
       → extract issue key from URL path → add to issueInputs[]
    3. Issue key (matches pattern like "XXX-123"):
       → add to issueInputs[]
    4. Ambiguous token:
       → If first ambiguous token and no branch yet → treat as branch name
       → Otherwise → treat as issue key

Result:
  explicitBranch: string | null
  issueInputs: string[]   # issue keys extracted from keys/URLs (may be empty)
  sourceOverride: string | null
```

---

## Phase 1: Branch Selection + Diff Extraction

### Step 1 — List and Select Branch

```
If explicitBranch is provided:
  If explicitBranch == "--no-branch":
    selectedBranch = null  (branch-less mode)
  Else:
    selectedBranch = explicitBranch
    Validate branch exists:
      Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/branches/$selectedBranch" --jq '.name'
    If not found → error and stop

Else (interactive mode):
  Fetch 10 most recently updated branches (INCLUDING main/master):

  Bash: GH_TOKEN=$GITHUB_TOKEN gh api graphql -f query='{
    repository(owner: "$OWNER", name: "$REPO") {
      refs(refPrefix: "refs/heads/", orderBy: {field: TAG_COMMIT_DATE, direction: DESC}, first: 10) {
        nodes {
          name
          target {
            ... on Commit {
              committedDate
              messageHeadline
            }
          }
        }
      }
    }
  }'

  Take first 7 branches (do NOT filter out main/master).

  Present to user via AskUserQuestion:
    "请选择要分析的分支："
    Options (up to 4 per AskUserQuestion, split into pages if needed):
      1. main (2026-04-06) — latest commit message
      2. feature/xxx (2026-04-05) — commit message
      3. fix/yyy (2026-04-04) — commit message
      ...
      ── special options (always present) ──
      "手动输入" — 用户自己输入分支名
      "不使用分支" — 跳过 diff，仅用 issue + SOURCE_PROJECT_DIR 驱动

  If user picks "手动输入":
    → AskUserQuestion: "请输入分支名："
    → selectedBranch = user input
    → Validate branch exists

  If user picks "不使用分支":
    → selectedBranch = null  (branch-less mode)
    → If issueInputs is empty:
        → Error: "不使用分支模式需要至少提供一个 Linear issue。请重新运行并传入 issue key 或 URL。"
        → STOP

  Otherwise:
    selectedBranch = user's choice
```

> **Branch-less mode**: When `selectedBranch = null`, Phase 1 Steps 2-3 (diff extraction) are skipped entirely.
> Phase 2 matching relies solely on issue-derived module keywords (from Phase 1.5) + SOURCE_PROJECT_DIR source code scanning.
> `changelist` and `changeSummary` are empty; Phase 5 report omits branch/diff fields.

### Step 2 — Choose Diff Strategy

```
If selectedBranch is null (branch-less mode):
  changelist = []
  changeSummary = ""
  Skip to Step 4.

AskUserQuestion:
  "请选择变更对比方式："
  Options:
    "完整分支差异（vs main）" — 对比分支与 main 的全部差异，适合多 commit 分支
    "最新提交（vs 当前分支）" — 只看最后一个 commit 相对分支前一状态的改动，适合单次提交后快速验证

→ diffStrategy = "compare" | "latest-commit"
```

### Step 3 — Get Changelist + Raw Diff + Generate changeSummary

```
If selectedBranch is null (branch-less mode):
  changeSummary = ""
  Skip to Step 4.

── Strategy A: 完整分支差异 (diffStrategy == "compare") ──

# Get full diff of branch vs main (all commits merged)
Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/compare/main...$selectedBranch" \
  --jq '{
    ahead_by: .ahead_by,
    commits: [.commits[] | {sha: .sha[:7], message: .commit.message}],
    files: [.files[] | {filename: .filename, status: .status, additions: .additions, deletions: .deletions}]
  }'
→ compareResult (JSON)

changelist = compareResult.files (all changed file paths across the branch)
commitCount = compareResult.ahead_by
commitMessages = compareResult.commits[].message

# Get raw diff for changeSummary generation
Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/compare/main...$selectedBranch" \
  -H "Accept: application/vnd.github.diff" | head -c 80000

rawDiff = captured output

Report to user:
  "分支 {selectedBranch} vs main:
   提交数: {commitCount} 个
   变更文件: {changelist.length} 个
   {if rawDiff was truncated: '⚠️ diff 过大，已截断至 80KB'}"

── Strategy B: 仅最新提交 (diffStrategy == "latest-commit") ──

# Get the latest commit SHA on the branch
Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/branches/$selectedBranch" \
  --jq '.commit.sha'
→ latestCommitSha

# Get the commit details (files changed in this commit vs its parent)
Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/commits/$latestCommitSha" \
  --jq '.files[] | {filename: .filename, status: .status, additions: .additions, deletions: .deletions}'

changelist = [list of changed files in the latest commit only]

# Also get commit message for context
Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/commits/$latestCommitSha" \
  --jq '.commit.message'
→ latestCommitMessage

# Get raw diff
Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/commits/$latestCommitSha" \
  -H "Accept: application/vnd.github.diff" | head -c 50000

rawDiff = captured output

Report to user:
  "分支 {selectedBranch} 最新提交: {latestCommitSha[:7]}
   提交信息: {latestCommitMessage}
   变更文件: {changelist.length} 个"

── Common: Generate changeSummary from rawDiff ──
```

Analyze rawDiff directly (no external AI call needed — the command executor IS Claude):

```
For each changed area in the diff, produce:
  - 改动描述（一句话）
  - 涉及文件和行号范围
  - 改动类型（新功能 / bug修复 / 重构 / 配置变更 / 测试）
  - 影响的页面/组件（如果能推断）

Format as changeSummary string.
```

### Step 4 — Read Remote Source Code via GitHub Contents API

> **Why remote**: diff 来自 GitHub，源码也从 GitHub 读，保证两者在同一分支、同一版本，不依赖本地是否 checkout 了对应分支。

```
# Filter changelist to UI-related source files only
sourceFiles = changelist
  .filter(f => /\.(tsx|ts|vue|jsx)$/.test(f.filename))
  .filter(f => !f.filename.includes('node_modules/'))
  .filter(f => !f.filename.endsWith('.d.ts'))
  .filter(f => !f.filename.includes('.test.') && !f.filename.includes('.spec.'))
  .filter(f => f.status !== 'removed')  # skip deleted files

# Read at most 10 key files (avoid excessive API calls)
filesToRead = sourceFiles.slice(0, 10)

For each file in filesToRead:
  Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/contents/{file.filename}?ref=$selectedBranch" \
    --jq '.content' | base64 -d | head -c 20000

  # Understand: route definitions, component names, exported functions,
  #             API endpoints, data-testid, aria-label, i18n keys

sourceContext = {
  hasTestIds: (any file contains data-testid),
  routeSegments: [extracted route paths],
  componentNames: [extracted component names],
  apiEndpoints: [extracted API paths]
}

If selectedBranch is null (branch-less mode):
  # No branch to read from, fall back to local if available
  If SOURCE_PROJECT_DIR is set and exists:
    Read local source files from changelist (same filter logic)
  Else:
    sourceContext = null
    Log: "Branch-less mode + no SOURCE_PROJECT_DIR, skipping source code reading"
```

> **Rate limit**: GitHub Contents API has a rate limit of 5000 req/hour for authenticated requests. Reading 10 files per run is well within budget. If `sourceFiles` exceeds 10, prioritize: route files (page.tsx) > components > API/services.

---

## Phase 1.5: Fetch Linear Issue Context (optional, only when issueInputs is non-empty)

> **Purpose**: When issues are provided, fetch their details from Linear to enrich the matching and generation phases. Issue descriptions provide explicit pageUrls, feature names, and business context that the git diff alone may not reveal.

### Step 1 — Resolve Issue Keys

```
Same parsing logic as /qa-from-issue and /qa-verify-fix:

For each input in issueInputs:
  - Linear URL (contains "linear.app/") → extract issue key from path
  - Issue key (e.g. "STE-42") → use directly
  - UUID → use directly

resolvedIssueKeys = deduplicated list of issue keys/IDs
```

### Step 2 — Fetch Issue Details

```
For each key in resolvedIssueKeys:
  mcp__linear__get_issue(id: key)

  Extract from issue title + description:
    - issueKey: the issue identifier
    - pageUrl: URL mentioned in description (navigation target)
    - feature: module/feature name from title (kebab-case slug)
    - description: issue description text (business context)
    - priority: issue priority
    - status: current issue status

issueContexts = list of { issueKey, pageUrl, feature, description, priority, status }
```

### Step 3 — Derive Additional Module Keywords + Page URLs

```
For each issueContext:
  - Extract module keywords from feature name (same heuristics as Phase 2 Step 2):
    e.g. "Task Sidebar Drag" → "task-sidebar"
  - Collect explicit pageUrls from issue descriptions

issueModuleKeywords = deduplicated list of module keywords derived from issues
issuePageUrls = deduplicated list of pageUrls extracted from issue descriptions

These are merged into Phase 2 matching (alongside git diff keywords) and Phase 3 exploration (alongside source-inferred URLs).
```

Report to user (appended to Phase 1 report):
```
📋 关联 Linear Issues: {resolvedIssueKeys.length} 个
  {for each: - issueKey: title (status)}
  额外模块关键词: {issueModuleKeywords}
  额外页面 URL: {issuePageUrls}
```

---

## Phase 2: Match Changelist + Issues → Existing Specs

### Step 1 — Build slug→spec Mapping

```
Scan existing specs:
  Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/*.test.ts")

For each spec file:
  - Extract slug from filename: "task-cdp.test.ts" → "task"
  - Extract full slug: "task-sidebar-cdp.test.ts" → "task-sidebar"
  - Store: specMap entries

Scan existing POMs:
  Glob("$QA_WORKSPACE_DIR/tests/e2e/pages/*.page.ts")

For each POM:
  - Extract slug: "task.page.ts" → "task"
  - Store: pomMap entries
```

### Step 2 — Extract Module Keywords from Changelist + Issues, then Match

```
For each changed file in changelist:
  Extract module keywords using these heuristics:
  
  1. Route segment:
     "src/app/(dashboard)/task/[id]/page.tsx" → "task"
     "src/app/(auth)/sign-in/page.tsx" → "sign-in"
  
  2. Component name (PascalCase → kebab-case):
     "src/components/TaskSidebar.tsx" → "task-sidebar"
     "src/components/SignInForm.tsx" → "sign-in"
  
  3. API/service module:
     "src/api/canvas.ts" → "canvas"
     "src/services/talent-list.ts" → "talent-list"
  
  4. Skip non-UI files (no test impact):
     - package.json, tsconfig.json, .env, README.md
     - Files under: node_modules/, .github/, docs/ (unless PRD)
     - Pure type definition files (.d.ts)

  Match each keyword against specMap (contains/starts-with):
    "task" → matches: task-cdp.test.ts, task-sidebar-cdp.test.ts, task-file-preview-cdp.test.ts, ...
    "sign-in" → matches: sign-in-cdp.test.ts
    "canvas" → matches: canvas-download-prd.test.ts, canvas-preview-prd.test.ts

Merge issueModuleKeywords (from Phase 1.5) into the keyword pool:
  allModuleKeywords = deduplicate(changelistKeywords + issueModuleKeywords)

Match each keyword against specMap (same logic as above).

Produce:
  matchedSpecs = deduplicated list of matched spec file paths
  unmatchedModules = list of module keywords with no matching spec
```

### Step 3 — Determine Strategy + Report

```
If matchedSpecs is non-empty AND unmatchedModules is empty:
  strategy = "selective"
  
If matchedSpecs is non-empty AND unmatchedModules is non-empty:
  strategy = "selective+generate"
  
If matchedSpecs is empty AND unmatchedModules is non-empty:
  strategy = "generate"
  
If matchedSpecs is empty AND unmatchedModules is empty:
  strategy = "skip" (all changes are non-UI, no tests needed)
```

Report to user:
```
📊 分支分析结果: {selectedBranch}

变更文件: {changelist.length} 个
匹配已有 spec: {matchedSpecs.length} 个
  {for each: - spec filename}
未覆盖模块: {unmatchedModules.length} 个
  {for each: - module keyword}

执行策略: {strategy}
```

If strategy is "skip":
  → Tell user: "所有变更文件均为非 UI 文件（配置/类型/文档），无需执行 E2E 测试。"
  → STOP pipeline

If strategy involves "generate":
  → Ask user: "有 {unmatchedModules.length} 个模块没有已有用例，是否生成新的测试？"
    - Y → proceed to Phase 3
    - N → strategy = "selective" (run only matched, skip generation)

---

## Phase 3: Conditional Generation (only when strategy includes "generate")

> **Purpose**: Generate E2E tests for modules affected by the branch changes but not covered by existing specs.

### Step 1 — Infer Page URLs from Source + Issues

```
For each unmatched module:
  1. Check issuePageUrls (from Phase 1.5) — if an issue explicitly mentions a pageUrl
     matching this module, use it directly (highest confidence).
  
  2. Analyze changeSummary + sourceContext (from Phase 1 Step 4) to infer the affected page URL:
     - sourceContext.routeSegments → direct URL mapping
     - Component files in changelist → find which route imports them (via GitHub Contents API if needed)
     - API files → find which page calls them
  
  Example:
    unmatchedModule = "people-search"
    sourceContext.routeSegments includes "/people/search" (from page.tsx in changelist)
    inferred pageUrl = "{PREVIEW_URL}/people/search"
  
  Example (from issue):
    unmatchedModule = "talent-list"
    issueContext.pageUrl = "https://preview.example.com/talent/list"
    → use directly, no inference needed
```

### Step 2 — CDP Targeted Exploration

For each unmatched module that has an inferred page URL:

```
Launch CDP explorer subagent:

prompt:
You are a CDP page explorer. First read skills/cdp-explorer/SKILL.md.

Task: Targeted exploration for locator discovery.

Input:
- mode: "targeted"
- pageUrl: {inferred pageUrl}
- targetArea: {module keyword}
- authSetup: {true/false}
- testCredentials: {if authSetup}
- appLanguages: {APP_LANGUAGES or null}
- i18nMessagesDir: {if APP_LANGUAGES set}
- sourceProjectDir: {resolved source directory}
- previousSourceContext: {}

Focus on: discovering locators and page structure for the affected area.
Write a minimal baseline with locators found.

Return summary with baselineFile path and locators discovered.
```

### Step 3 — e2e-orchestrator Generates Specs

```
Launch e2e-orchestrator (sonnet):

prompt:
You are e2e-orchestrator. First read .claude/agents/e2e-orchestrator.md.

Input:
- source: "cdp"
- baselineFile: {from CDP exploration}
- projectContext:
    targetProjectDir: $QA_WORKSPACE_DIR
    sourceProjectDir: {resolved}
    baseURL: $PREVIEW_URL
    authSetup: {true/false}
    testCredentials: {if authSetup}
    existingTests: $QA_WORKSPACE_DIR/tests/e2e/testcases/generated/
    techStack: {from CLAUDE.md}
    appLanguages: {APP_LANGUAGES or null}
    i18nMessagesDir: {if set}
    changelist: {changelist from Phase 1}
    changeSummary: {changeSummary from Phase 1}
    issueContexts: {issueContexts from Phase 1.5, or [] if no issues}

BRANCH-DRIVEN MODE INSTRUCTIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Focus test case generation on areas affected by the changelist
2. Use changeSummary to understand WHAT changed and generate targeted assertions
3. If issueContexts is non-empty, use issue descriptions as additional context:
   - Issue descriptions clarify WHAT the feature/fix is about (business intent)
   - Issue pageUrls confirm which pages to target
   - Generate test cases that cover scenarios described in the issues
4. Prioritize: regression scenarios for modified logic > issue-described scenarios > new feature coverage > edge cases
5. Target: 5-10 test cases per module (focused, not exhaustive)

Return artifact paths.
```

### Step 4 — Verify Generated Specs

```
For each newly generated spec, run qa-fix-tests verification:
  Launch qa-fix-tests subagent to verify locators and fix if needed.
  
newSpecs = list of verified/fixed spec file paths
```

---

## Phase 4: Execute Tests

```
allSpecs = matchedSpecs + newSpecs (deduplicated)

If allSpecs is empty:
  → STOP: "没有可执行的测试用例"

Launch test-executor (sonnet):

prompt:
You are test-executor. First read .claude/agents/test-executor.md.

Input:
- mode: "selective"
- specFiles: {allSpecs}
- projectDir: "$QA_WORKSPACE_DIR"
- appLanguages: {APP_LANGUAGES or null}

Run ONLY the specified spec files.
Output report to: tests/reports/playwright-results.json
```

---

## Phase 5: Report + Optional Linear Commenting

### Step 1 — Launch report-analyzer

```
Launch report-analyzer (sonnet):

prompt:
You are report-analyzer. First read .claude/agents/report-analyzer.md.

Input:
- reportFile: "playwright-results.json"
- changeSummary: {changeSummary from Phase 1}
- sourceProjectDir: {resolved}
- appLanguages: {APP_LANGUAGES or null}
- headless: false

Analyze test results. For each failure, attribute whether it's likely caused by the branch changes
(regression_likely) or pre-existing (pre_existing) using the changeSummary.

Return structured failure payload.
```

### Step 2 — Display Results to User

```
Parse report-analyzer results:

If all tests passed:
  Display:
  "✅ 全部通过

  | 项目 | 值 |
  |------|-----|
  | 分支 | {selectedBranch} |
  | 变更文件 | {changelist.length} 个 |
  | 执行用例 | {total} |
  | 全部通过 | ✅ {passed}/{total} |
  | 验证环境 | {PREVIEW_URL} |"

If any test failed:
  Display:
  "❌ 存在失败

  | 项目 | 值 |
  |------|-----|
  | 分支 | {selectedBranch} |
  | 变更文件 | {changelist.length} 个 |
  | 执行用例 | {total} |
  | 通过 | {passed}/{total} |
  | 失败 | {failed}/{total} |

  ### 失败用例
  | # | 用例 | 错误摘要 | 变更关联 |
  |---|------|----------|----------|
  | 1 | {test name} | {error} | 🔴 regression_likely / ⚪ pre_existing |"
```

### Step 3 — Optional Linear Commenting (only when issues were provided)

```
If issueContexts is empty (no issues provided):
  → Display: "结果仅输出到本地。如需汇报到 Linear，传入 issue key 或 URL"
  → STOP

If issueContexts is non-empty:
  → Ask user via AskUserQuestion:
    "是否将以下结果评论到 {issueContexts.length} 个 Linear issue？"
    List: {for each: issueKey — title}
    Options: Y — 评论 / N — 跳过

  If user confirms Y:
    For each issueContext in issueContexts:
      Build comment body based on verdict:
```

**When all tests passed:**

```markdown
## ✅ Branch QA 全部通过 — {selectedBranch}

| 项目 | 值 |
|------|-----|
| 分支 | `{selectedBranch}` |
| 变更文件 | {changelist.length} 个 |
| 执行用例 | {total} |
| 全部通过 | ✅ {passed}/{total} |
| 执行时间 | {timestamp} |
| 验证环境 | {PREVIEW_URL} |

### 变更摘要
{changeSummary}

所有关联测试均通过，未发现回归问题。
```

**When any test failed:**

```markdown
## ❌ Branch QA 存在失败 — {selectedBranch}

| 项目 | 值 |
|------|-----|
| 分支 | `{selectedBranch}` |
| 变更文件 | {changelist.length} 个 |
| 执行用例 | {total} |
| 通过 | {passed}/{total} |
| 失败 | {failed}/{total} |
| 执行时间 | {timestamp} |
| 验证环境 | {PREVIEW_URL} |

### 失败用例

| # | 用例 | 错误摘要 | 变更关联 |
|---|------|----------|----------|
{for each failure:}
| {n} | {test name} | {error message} | {🔴 regression_likely / ⚪ pre_existing} |

### 变更摘要
{changeSummary}

### 下一步
请检查标记为 🔴 的用例，这些失败可能由本分支变更引起。
```

```
For each issueContext:
  mcp__linear__create_comment(issueId: issueContext.issueKey, body: commentBody)
```

Do NOT update issue status (this is informational, not a bug report).

---

## Artifacts

| File | Description |
|------|-------------|
| `tests/reports/playwright-results.json` | Test execution report |
| `playwright-report/index.html` | HTML report (auto-opened) |
| `test-cases/generated/*.md` | Generated test cases (only when Phase 3 triggered) |
| `tests/e2e/testcases/generated/*-branch.test.ts` | Generated specs (only when Phase 3 triggered) |
| Linear issue comment(s) | Optional, only when issues provided and user confirms |
