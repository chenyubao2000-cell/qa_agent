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
/qa-from-branch                                           # interactive: list 7 branches (paginated), user picks
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
     ├─ Step 1: GraphQL fetch 5 recent branches → AskUserQuestion → user picks
     ├─ Step 2: (skip if no branch) Detect local vs remote + ask diff strategy
     ├─ Step 3: (skip if no branch) Get changelist + raw diff → changeSummary
     └─ Step 4: Read source code (local filesystem or GitHub Contents API)
     |
Phase 1.5: (optional) Fetch Linear Issue Context
     ├─ Step 1: Parse issue keys/URLs from arguments
     ├─ Step 2: mcp__linear__get_issue → extract pageUrl, feature, description
     └─ Step 3: Merge issue-derived modules + pageUrls into matching inputs
     |
Phase 2: Match Changelist + Issues → Existing Specs
     ├─ Step 1: Build slug→spec + POM selector index
     ├─ Step 2: Pass 1 keyword candidates → Pass 2 import chain verification (POM/handoff selector vs rawDiff)
     ├─ Step 2.5: Confirm maybe-affected specs with user
     ├─ Step 3: Determine strategy (selective / selective+generate / generate / skip)
     └─ Step 4: (skip if no branch) Change Impact Analysis — detect assertion_outdated in matched specs
          ├─ All matched → "selective" (run existing only)
          ├─ Partial match → "selective+generate"
          └─ No match → "generate"
     |
Phase 3: Conditional Generation (only for unmatchedModules)
     ├─ Step 1: Infer page URLs from source + issues
     ├─ Step 2: CDP targeted exploration
     ├─ Step 3: e2e-orchestrator generates specs (with dedup + changelist + issueContexts)
     ├─ Step 3.5: Verification Gate (V1-V5) + POM Merge + Excel Export
     └─ Step 4: /qa-fix-tests --skip-baseline verifies generated specs
     |
Phase 4: Execute Tests
     ├─ matchedSpecs + newSpecs → test-executor (selective)
     └─ Output report JSON
     |
Phase 5: Report
     ├─ report-analyzer analyzes (3-category: 🔴 regression / 🟡 assertion_outdated / ⚪ pre_existing)
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
  --local                 → forceLocal = true (use local git for diff + source reading)
  
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
  forceLocal: boolean      # default false
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
  ── IMPORTANT: Use ONLY the single GraphQL query below to fetch the branch list. ──
  ── Do NOT make additional REST API calls (gh api repos/.../branches/xxx) for individual branches. ──

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

  allBranches = first 5 branches from GraphQL results (do NOT filter out main/master).

  Present to user via AskUserQuestion:
    "请选择要分析的分支："
    Options (4 options, AskUserQuestion max):
      - allBranches[0..2] (first 3 branches, label: branch name, description: "(date) commit message")
      - "不使用分支" — description: "跳过 diff，仅用 issue + SOURCE_PROJECT_DIR 驱动"

    ── AskUserQuestion always provides a built-in "Other" for custom text input (replaces old "手动输入") ──
    ── So user sees: 3 branches + "不使用分支" + "Other" = 5 choices total ──

  If user picks "Other":
    → Treat input as branch name (manual input)
    → Validate branch exists:
        Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/branches/$userInput" --jq '.name'
    → If not found → error and stop
    → selectedBranch = userInput

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

### Step 2 — Detect Diff Source (local vs remote) + Choose Diff Strategy

```
If selectedBranch is null (branch-less mode):
  changelist = []
  changeSummary = ""
  Skip to Step 4.

── Detect: can we use local git? ──
── useLocalGit 仅当以下条件全部满足时启用，避免本地分析 vs 远程执行的版本割裂 ──

useLocalGit = false

# 前提条件：PREVIEW_URL 指向 localhost 或用户显式传了 --local
isLocalTarget = PREVIEW_URL matches /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/
canUseLocal = forceLocal || isLocalTarget

If canUseLocal AND SOURCE_PROJECT_DIR is set and exists:
  Bash: git -C "$SOURCE_PROJECT_DIR" rev-parse --is-inside-work-tree 2>/dev/null
  If exit code == 0 (is a git repo):
    Bash: git -C "$SOURCE_PROJECT_DIR" branch --show-current
    → localBranch

    If localBranch == selectedBranch:
      useLocalGit = true
      diffSource = "local"
    Else:
      diffSource = "remote"
  Else:
    diffSource = "remote"
Else:
  diffSource = "remote"
  If forceLocal AND NOT isLocalTarget:
    Log WARNING: "--local 已指定，但 PREVIEW_URL ({PREVIEW_URL}) 不是 localhost。本地代码分析与远程测试环境可能不一致。"

── Choose diff strategy ──

AskUserQuestion:
  "请选择变更对比方式：{if useLocalGit: '（本地模式：使用本地 git diff，含未 push 改动）'}"
  Options:
    "完整分支差异（vs main）" — 对比分支与 main 的全部差异，适合多 commit 分支
    "最新提交" — 只看最后一个 commit 的改动，适合单次提交后快速验证
    {if useLocalGit: "本地未提交改动" — 对比工作区与 HEAD 的差异（含 unstaged + staged），适合本地开发自测}

→ diffStrategy = "compare" | "latest-commit" | "local-uncommitted"
  Note: "local-uncommitted" 仅当 useLocalGit = true 时可选
```

### Step 3 — Get Changelist + Raw Diff + Generate changeSummary

```
If selectedBranch is null (branch-less mode):
  changeSummary = ""
  Skip to Step 4.

── Strategy A: 完整分支差异 (diffStrategy == "compare") ──

If useLocalGit:
  # Local: compare current branch vs main (includes unpushed commits)
  Bash: git -C "$SOURCE_PROJECT_DIR" diff main...HEAD --stat --numstat
  → parse into changelist [{filename, status, additions, deletions}]

  Bash: git -C "$SOURCE_PROJECT_DIR" log main..HEAD --oneline
  → commitCount, commitMessages

  Bash: git -C "$SOURCE_PROJECT_DIR" diff main...HEAD | head -c 80000
  → rawDiff

  Report to user:
    "📂 本地分支 {selectedBranch} vs main（含未 push 改动）:
     提交数: {commitCount} 个
     变更文件: {changelist.length} 个
     {if rawDiff was truncated: '⚠️ diff 过大，已截断至 80KB'}"

Else:
  # Remote: GitHub Compare API
  Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/compare/main...$selectedBranch" \
    --jq '{
      ahead_by: .ahead_by,
      commits: [.commits[] | {sha: .sha[:7], message: .commit.message}],
      files: [.files[] | {filename: .filename, status: .status, additions: .additions, deletions: .deletions}]
    }'
  → compareResult (JSON)

  changelist = compareResult.files
  commitCount = compareResult.ahead_by
  commitMessages = compareResult.commits[].message

  Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/compare/main...$selectedBranch" \
    -H "Accept: application/vnd.github.diff" | head -c 80000
  → rawDiff

  Report to user:
    "🌐 远程分支 {selectedBranch} vs main:
     提交数: {commitCount} 个
     变更文件: {changelist.length} 个
     {if rawDiff was truncated: '⚠️ diff 过大，已截断至 80KB'}"

── Strategy B: 最新提交 (diffStrategy == "latest-commit") ──

If useLocalGit:
  # Local: diff HEAD vs HEAD~1
  Bash: git -C "$SOURCE_PROJECT_DIR" diff HEAD~1 --stat --numstat
  → parse into changelist

  Bash: git -C "$SOURCE_PROJECT_DIR" log -1 --format="%H %s"
  → latestCommitSha, latestCommitMessage

  Bash: git -C "$SOURCE_PROJECT_DIR" diff HEAD~1 | head -c 50000
  → rawDiff

  Report to user:
    "📂 本地最新提交: {latestCommitSha[:7]}
     提交信息: {latestCommitMessage}
     变更文件: {changelist.length} 个"

Else:
  # Remote: GitHub Commits API
  Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/branches/$selectedBranch" \
    --jq '.commit.sha'
  → latestCommitSha

  Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/commits/$latestCommitSha" \
    --jq '.files[] | {filename: .filename, status: .status, additions: .additions, deletions: .deletions}'
  → changelist

  Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/commits/$latestCommitSha" \
    --jq '.commit.message'
  → latestCommitMessage

  Bash: GH_TOKEN=$GITHUB_TOKEN gh api "repos/$OWNER/$REPO/commits/$latestCommitSha" \
    -H "Accept: application/vnd.github.diff" | head -c 50000
  → rawDiff

  Report to user:
    "🌐 远程最新提交: {latestCommitSha[:7]}
     提交信息: {latestCommitMessage}
     变更文件: {changelist.length} 个"

── Strategy C: 本地未提交改动 (diffStrategy == "local-uncommitted") ──

# Always local — compare working tree vs HEAD (staged + unstaged)
Bash: git -C "$SOURCE_PROJECT_DIR" diff HEAD --stat --numstat
→ parse into changelist

Bash: git -C "$SOURCE_PROJECT_DIR" diff HEAD | head -c 50000
→ rawDiff

Report to user:
  "📂 本地未提交改动（工作区 vs HEAD）:
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

### Step 4 — Read Source Code (remote default, local when useLocalGit)

> **Strategy**: Default reads from GitHub Contents API (remote), ensuring source and diff are from the same branch version.
> When `useLocalGit = true` (localhost target or `--local` flag), reads from local filesystem (faster, includes unpushed changes).

```
# Filter changelist to UI-related source files only
sourceFiles = changelist
  .filter(f => /\.(tsx|ts|vue|jsx)$/.test(f.filename))
  .filter(f => !f.filename.includes('node_modules/'))
  .filter(f => !f.filename.endsWith('.d.ts'))
  .filter(f => !f.filename.includes('.test.') && !f.filename.includes('.spec.'))
  .filter(f => f.status !== 'removed')  # skip deleted files

filesToRead = sourceFiles.slice(0, 10)

If useLocalGit:
  # Local: read files directly from filesystem
  For each file in filesToRead:
    Read("$SOURCE_PROJECT_DIR/{file.filename}")   # first 500 lines is enough

Else:
  # Remote: GitHub Contents API
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

> **Note**: When `useLocalGit = true`, local reads have no API rate limit concerns. When remote, GitHub Contents API limit is 5000 req/hour — reading 10 files per run is well within budget. If `sourceFiles` exceeds 10, prioritize: route files (page.tsx) > components > API/services.

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

### Step 1 — Build slug→spec Mapping + Import Chain Index

```
Scan existing specs:
  Glob("$QA_WORKSPACE_DIR/tests/e2e/testcases/generated/*.test.ts")

For each spec file:
  - Extract slug from filename: "task-cdp.test.ts" → "task"
  - Extract full slug: "task-sidebar-cdp.test.ts" → "task-sidebar"
  - Read first 20 lines → extract import of POM file path
  - Store: specMap entries { slug, fullSlug, specPath, pomPath }

Scan existing POMs:
  Glob("$QA_WORKSPACE_DIR/tests/e2e/pages/*.page.ts")

For each POM:
  - Extract slug: "task.page.ts" → "task"
  - Read file → extract all selector strings (data-testid, aria-label, role patterns, CSS selectors)
  - Store: pomMap entries { slug, pomPath, selectors[] }

Build handoff path index (lazy — do NOT read file contents yet):
  Glob("$QA_WORKSPACE_DIR/test-cases/generated/playwright-handoff-*.json")

For each handoff:
  - Extract slug: "playwright-handoff-task-sidebar.json" → "task-sidebar"
  - Store: handoffIndex entries { slug, handoffPath }
  - Do NOT read JSON contents here (deferred to Pass 2 for matched candidates only)
```

### Step 2 — Extract Module Keywords, Match, then Verify via Import Chain

> **Two-pass matching**: Pass 1 (fast) uses filename keywords to produce candidates.
> Pass 2 (precise) reads POM selectors + changelist diff to verify actual relevance.

```
── Pass 1: Keyword-based candidate selection (same as before) ──

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
    "task" → candidates: task-cdp.test.ts, task-sidebar-cdp.test.ts, task-file-preview-cdp.test.ts, ...
    "sign-in" → candidates: sign-in-cdp.test.ts

Merge issueModuleKeywords (from Phase 1.5) into the keyword pool:
  allModuleKeywords = deduplicate(changelistKeywords + issueModuleKeywords)

Match each keyword against specMap (same logic as above).

candidateSpecs = deduplicated list of candidate spec file paths

── Pass 2: Import chain verification (precise) ──

For each candidate spec in candidateSpecs:
  1. Look up POM from specMap → pomPath
  2. Get POM selectors from pomMap[pomPath].selectors[]
     (data-testid values, aria-label values, role names, CSS selectors)
  3. Lazy-load handoff for this candidate (only now, not upfront):
     Look up handoffIndex by matching slug → handoffPath
     If found → Read JSON → extract uiElements[].selector → handoffSelectors[]
     If not found → handoffSelectors = []
  4. Merge: allSelectors = deduplicate(pomSelectors + handoffSelectors)
  5. For each selector in allSelectors:
     Search in rawDiff (from Phase 1 Step 3) for the selector string
     Example: selector = "sidebar-collapse" → grep rawDiff for "sidebar-collapse"
  6. Classify:
     - ANY selector found in rawDiff → "affected" (change directly touches tested elements)
     - NO selector found but keyword matched → "maybe-affected" (same module, unclear impact)

Produce:
  affectedSpecs = specs classified as "affected"    (will definitely run)
  maybeAffectedSpecs = specs classified as "maybe-affected" (ask user)
  unmatchedModules = module keywords with no matching spec at all
```

### Step 2.5 — Confirm Maybe-Affected Specs

```
If maybeAffectedSpecs is non-empty:
  AskUserQuestion:
    "以下 spec 的模块名与变更文件匹配，但变更内容未直接涉及被测元素。是否执行？"
    List: {for each: - spec filename (keyword: xxx)}
    Options:
      "全部执行" — 安全起见全跑
      "跳过" — 只执行确认关联的 spec

  If user picks "全部执行":
    affectedSpecs = affectedSpecs + maybeAffectedSpecs
  // else: keep affectedSpecs as is

matchedSpecs = affectedSpecs
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
确认关联 spec: {affectedSpecs.length} 个
  {for each: - spec filename (matched selectors: xxx, yyy)}
模糊关联 spec: {maybeAffectedSpecs.length} 个 {user decision}
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

### Step 4 — Change Impact Analysis on Matched Specs (pre-execution assertion check)

> **Problem**: matched spec 是"代码变了才匹配上的"。代码变了，已有断言可能已过时。
> 如果不检查就直接执行，测试失败后 report-analyzer 只能标 regression_likely，
> 但无法区分"真回归"还是"断言该更新了"。
>
> **Goal**: 在执行前检测 rawDiff 是否直接修改了 handoff 里的断言目标（文案、状态、属性值），
> 提前标记哪些 spec 的断言可能需要更新，执行后可据此辅助判断。

```
If selectedBranch is null (branch-less mode):
  changeImpactHints = { assertionReviewSpecs: [] }
  Skip to Phase 3.
  // Branch-less mode has no rawDiff → no assertion impact to detect

For each spec in matchedSpecs:
  1. Read handoff JSON for this spec (from handoffMap built in Step 1)
  2. Extract all assertion targets:
     - Text assertions: exact strings in assertions[].expected (e.g., "Submit", "保存成功")
     - State assertions: expected states (e.g., "disabled", "visible", "checked")
     - Value assertions: expected values (e.g., placeholder text, default selections)
  3. Search rawDiff for each assertion target string:
     - Found in diff's REMOVED lines (- prefix) → "assertion_outdated"
       (the old value was removed, assertion likely needs updating)
     - Found in diff's ADDED lines (+ prefix) and NOT in removed → no issue
       (value was added/kept, assertion still valid)
  4. Classify spec:
     - Any assertion_outdated found → mark spec as "needs_assertion_review"
     - No assertion_outdated → mark as "assertions_likely_valid"

assertionReviewSpecs = matchedSpecs.filter(s => s.classification === "needs_assertion_review")

If assertionReviewSpecs is non-empty:
  Report to user (informational, does NOT block execution):
  ```
  ⚠️ 以下已有 spec 的断言可能受变更影响：
    {for each: - spec filename: "断言 '{oldValue}' 在 diff 中被移除"}
  这些 spec 仍会执行。若测试失败，失败原因可能是断言需更新（非真回归）。
  测试完成后可运行 /qa-fix-tests 自动修复。
  ```

// Store for Phase 5 report-analyzer to use
changeImpactHints = {
  assertionReviewSpecs: [{ specFile, outdatedAssertions: [{ tcId, field, oldValue }] }]
}
```

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

### Step 3 — e2e-orchestrator Generates Specs (with full cross-source dedup)

> **Important**: The orchestrator's Step 2 (dedup-cross-source.md) runs automatically inside the orchestrator.
> This ensures new branch-driven specs go through the full POM method overlap check against ALL existing specs
> (from qa-explore, qa-run-prd, qa-from-issue), not just the filename-keyword match from Phase 2.
> If an existing CDP/PRD spec already covers 70%+ of the same POM methods, the orchestrator will skip or append
> instead of creating a duplicate spec.

```
// Launch orchestrators (one per unmatched module, parallel if multiple)
orchestratorAgents = []

for module in unmatchedModules:
  orchestratorAgents.push(
    Launch e2e-orchestrator (sonnet) in background:

    prompt:
    You are e2e-orchestrator. First read .claude/agents/e2e-orchestrator.md.

    Input:
    - source: "branch"
    - baselineFile: {from CDP exploration for this module}
    - projectContext:
        targetProjectDir: $QA_WORKSPACE_DIR
        sourceProjectDir: {resolved source directory per priority: --source > SOURCE_PROJECT_DIR > QA_WORKSPACE_DIR}
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
    6. DEDUP IS MANDATORY: You MUST execute Step 2 (dedup-cross-source.md) before generating.
       Existing specs from other sources (CDP/PRD/issue) that cover the same POM methods
       must be detected. If overlap ≥ 70% → append missing cases to existing spec instead of
       creating a new branch-source spec. This prevents duplicate coverage across sources.

    Return artifact paths.
  )

// Wait for ALL orchestrators to complete
results = await all(orchestratorAgents)
```

### Step 3.5 — Verification Gate + POM Merge + Excel Export (mandatory post-generation)

> **Consistent with qa-explore and qa-run-prd**: all three commands run the same post-generation checks.

```
// ══ MANDATORY VERIFICATION GATE ══
// Execute `.claude/references/verification-gate-v1-v5.md` (Steps V1-V5) for EACH orchestrator result.
// Pipeline STOPS if any check fails — do NOT proceed to Step 4.
//
// On failure:
//   - Delete INCOMPLETE artifacts from the failed orchestrator (spec, POM, handoff for that module)
//   - Keep artifacts from other orchestrators that passed verification
//   - Report detailed error: module, V step, reason, deleted files, suggested action

// ── POM Fragment Merge (when multiple orchestrators generated for the same page) ──
Execute `.claude/references/pom-merge.md`

// Collect all verified artifacts
allNewSpecs = results.flatMap(r => r.specs + r.modified_specs)
allPageObjects = results.flatMap(r => r.page_objects)

// ── Excel Export (optional but consistent with other commands) ──
// Branch QA is primarily quick feedback, but Excel ensures test case documentation completeness.
If allNewSpecs is non-empty:
  Execute `.claude/references/excel-export-gate.md` (with `{name}` = `branch-{selectedBranch}`)
```

### Step 4 — Verify Generated Specs via /qa-fix-tests

> **Consistent with qa-explore and qa-run-prd**: delegate to /qa-fix-tests with --skip-baseline.

```
If allNewSpecs is empty:
  // All modules were deduped (existing specs cover them) → nothing to fix
  newSpecs = []
  Skip to Phase 4.

// Delegate to qa-fix-tests: CDP verify + fix locators/assertions + single-file verify
Execute /qa-fix-tests with arguments: --skip-baseline --source {resolved sourceProjectDir} {allNewSpecs joined by space}
// --skip-baseline: skip baseline execution (specs are brand new, go straight to fix)
// --source: pass the SAME source directory used by orchestrator (critical for remote branch mode)
// spec paths: explicit list of newly generated specs only

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
- changeImpactHints: {changeImpactHints from Phase 2 Step 4}

Analyze test results. For each failure, attribute cause using THREE categories:
1. **regression_likely** — failure caused by branch changes breaking existing behavior (真回归)
2. **assertion_outdated** — failure matches changeImpactHints.assertionReviewSpecs
   (branch intentionally changed the value, test assertion needs updating, not a bug)
3. **pre_existing** — failure unrelated to branch changes

Use changeImpactHints to distinguish category 1 vs 2:
- If the failed test's spec + tcId appears in changeImpactHints.assertionReviewSpecs
  AND the error message contains the outdatedAssertion's oldValue
  → classify as "assertion_outdated" (🟡), not "regression_likely" (🔴)

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
  | 1 | {test name} | {error} | 🔴 regression_likely / 🟡 assertion_outdated / ⚪ pre_existing |

  {if any assertion_outdated:}
  > 🟡 标记为 assertion_outdated 的用例：分支变更了被测内容（如文案、状态），测试断言需更新。
  > 这不是 bug，运行 `/qa-fix-tests {specFiles}` 可自动修复断言并同步 handoff + .md。"
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
| {n} | {test name} | {error message} | {🔴 regression_likely / 🟡 assertion_outdated / ⚪ pre_existing} |

### 变更摘要
{changeSummary}

### 下一步
- 🔴 regression_likely — 请检查，这些失败可能由本分支变更引起
- 🟡 assertion_outdated — 分支有意修改了被测内容，测试断言需更新（非 bug），运行 `/qa-fix-tests` 自动修复
- ⚪ pre_existing — 与本分支无关的已有问题
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
| `test-cases/generated/{slug}-branch.md` | Generated test cases (only when Phase 3 triggered) |
| `test-cases/generated/playwright-handoff-{slug}.json` | Handoff JSON (only when Phase 3 triggered) |
| `test-cases/excel/{slug}-branch.xlsx` | Excel test cases (only when Phase 3 triggered) |
| `tests/e2e/pages/{slug}.page.ts` | Page Object (only when Phase 3 triggered) |
| `tests/e2e/testcases/generated/{slug}-branch.test.ts` | Generated specs — source: "branch" (only when Phase 3 triggered) |
| Linear issue comment(s) | Optional, only when issues provided and user confirms |
