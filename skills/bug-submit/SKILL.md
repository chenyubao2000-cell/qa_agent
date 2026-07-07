---
name: Bug Submit
description: 将用户描述的 bug 读代码验证后提交到 Linear（Mira 项目）。当用户描述一个 bug 现象、报告一个问题、说"这里有个 bug"、"XX 页面坏了"时触发。
version: 1.0.0
allowed_tools: [Read, Grep, Glob, Bash, mcp__claude_ai_Linear__list_issues, mcp__claude_ai_Linear__get_issue, mcp__claude_ai_Linear__save_comment, mcp__claude_ai_Linear__list_users, mcp__claude_ai_Linear__list_projects, mcp__claude_ai_Linear__list_issue_statuses, mcp__claude_ai_Linear__list_issue_labels, mcp__claude_ai_Linear__save_issue, mcp__postgres__query]
---

# Bug Submit Skill

把用户口头描述的 bug，经过**代码验证**后提交为 Linear Issue。

---

## 固定参数

- **代码库路径**：读取项目根目录 `.env` 中的 `SOURCE_PROJECT_DIR`（当前值 `D:\code\mira`）。`Read`/`Grep`/`Glob` 不做 shell 变量展开，所以每次触发本 skill 时先 Read `.env` 拿到这一行的**字面值**，后续所有代码验证都用这个解析出来的绝对路径，不要在工具参数里直接写 `$SOURCE_PROJECT_DIR` 字符串
- **Linear 团队默认值**：Mira（key: MIRA，ID: `84768569-a7a8-47ca-8361-68635bbafbf4`）——实际提交时以 Step 5/6 解析出的**项目所属团队**为准，不要硬编码成这个默认值
- **Issue 状态**：Todo
- **Issue Label**：Bug
- **Issue 优先级**：Medium（save_issue 的 priority 传 3）

## 状态缓存

跨对话缓存的信息存在 `skills/bug-submit/state/last-context.json`（不提交到 git），结构：

```json
{
  "projectLink": "https://linear.app/mira-agents/project/...",
  "projectName": "...",
  "frontendOwner": { "name": "...", "linearUserId": "..." },
  "backendOwner": { "name": "...", "linearUserId": "..." },
  "updatedAt": "2026-07-07T..."
}
```

**每次触发本 skill，第一步先尝试 Read 这个文件**（不存在则视为空缓存，不要报错）：
- 文件存在 → 提示用户"上次提交到 [projectName]，前端负责人 [frontendOwner.name]，后端负责人 [backendOwner.name]，本次继续用这个配置吗？"，用户确认后作为本轮缓存使用
- 文件不存在 → 等用户描述 bug 时按下面流程正常询问

---

## 提交流程

### 1. 解析输入

从用户描述中提取 Bug 现象，然后按以下规则确定项目链接和分配人员：

**项目链接**
- 用户本次提供了链接 → 使用新链接，并视为切换了项目，重新询问分配人员
- 用户未提供 → 使用 `state/last-context.json` 里缓存的上次链接，直接继续
- 没有任何缓存 → 追问用户

**分配人员**
- 切换了项目链接 → 重新询问该项目的**前端负责人**和**后端负责人**各一名，确认后保存
- 项目链接未变 → 使用缓存的前/后端人员，无需询问
- 没有任何缓存 → 追问用户

只有 Bug 现象是每次必须由用户提供的内容。

### 2. 读代码验证 + 排查相似 Bug

> ⚠️ **强制要求：必须先读代码，从代码层面确认 bug 真实存在，才能提交。禁止仅凭用户描述的现象直接提交。**

> 💡 **能手动复现的，必须实际验证**：如果 bug 涉及接口调用、数据查询等可直接执行的操作，不要仅靠读代码推断——用 curl / fetch 实际调一下，把真实的响应结果贴进 issue。这样可以精确定位问题（比如哪个字段值重复、哪个入参触发异常），也能帮助排查根因。

> 🗄️ **涉及数据库的 bug，必须查库验证**：如果 bug 与数据库数据状态有关（如字段值异常、记录缺失、写入错误、数据不一致等），必须用 `mcp__postgres__query` 直接查询数据库，把真实的 SQL 结果贴进 issue。禁止仅凭代码推断数据库状态。

在解析出的代码库路径（`.env` 的 `SOURCE_PROJECT_DIR`）中找到相关页面/组件的代码，仔细阅读逻辑：
- **能从代码中确认问题**：继续提交，且代码分析部分必须包含：①具体文件路径+行号 ②有问题的代码片段原文 ③根因链说明；同时判定本次 bug 的**修复层级**（前端 / 后端 / 前后端都要改），供 Step 8 分配时使用
- **无法从代码确认**（找不到相关代码、逻辑正常、无法复现路径）：明确告知用户"从代码中无法确认该问题存在"，并说明原因，询问是否仍要提交
- **代码逻辑正常但产品设计有争议**：说明代码当前行为，让用户判断是否属于 bug

**只报用户能真实复现的 bug**：所有 bug 必须能通过正常的前端页面操作触发，不考虑"绕过前端直接调用后端接口"的场景。如果一个问题只有直接请求 API 才能复现，而正常用户操作不会触发，则忽略不提。

同时主动排查：**同页面或同类功能中是否存在相同根因的其他 bug**（如同一个组件缺陷影响多个 section，或同一个工具函数被多处错误使用）。

- **发现相似 bug**：合并为一个 issue，标题反映共同问题，描述按功能分块（Bug 1 / Bug 2），代码分析和修复方案统一写
- **未发现相似 bug**：按单个 bug 正常提交

详细的验证判断标准和示例见 `references/verification-checklist.md`。

### 3. 排重：检查项目下是否已有相似 Bug

用 `mcp__claude_ai_Linear__list_issues` 拉取当前项目下所有 issue 的**标题列表**，与本次 bug 现象做语义比对：

- **标题明显相似**（同页面 + 同现象关键词）→ 用 `mcp__claude_ai_Linear__get_issue` 获取该 issue 完整描述，仔细比对：
  - **完全重复**：不新建 issue，用 `mcp__claude_ai_Linear__save_comment` 在原 issue 下补充评论（贴上本次代码验证结果 / 复现细节 / 新发现），告知用户"已有相同 bug [PRE-xxx]，已补充评论"
  - **有新内容可补充**（不同触发路径、新的代码证据、影响范围更广）：同上，评论补充，不新建
  - **角度不同、根因不同**：视为独立 bug，继续走后续流程新建
- **无相似标题**：继续走后续流程新建

> 💡 排重用标题列表粗筛，只在标题相似时才拉完整内容，避免逐条读取所有 issue。

### 4 / 5 / 6. 并发获取元数据（三步无依赖，必须同时发起）

> ⚡ **步骤 4、5、6 彼此独立，必须在同一轮并行调用，不要顺序等待。**

- **步骤 4**：用 `mcp__claude_ai_Linear__list_users` 根据用户提供的姓名匹配 Linear 用户 ID。多个结果时列出让用户选。
- **步骤 5**：用 `mcp__claude_ai_Linear__list_projects` 找到与链接中 slug 匹配的项目，取其 ID 和**所属团队 ID**。
- **步骤 6**：用步骤 5 拿到的**项目所属团队 ID**（不一定是 Mira）调用 `mcp__claude_ai_Linear__list_issue_statuses` 获取该团队的 Todo 状态 ID；同时用 `mcp__claude_ai_Linear__list_issue_labels` 获取 Bug label ID。

> ⚠️ 步骤 6 的状态 ID 必须来自**项目所属团队**，不要硬编码成 Mira 团队——不同团队的状态 ID 不通用。

### 7. 整理 Issue 内容

**标题**：`【bug】[xxx] 具体现象`，其中 xxx 为具体的页面或功能名，如"候选人 Profile 页面"、"上传简历弹窗"、"保存按钮"等，尽量具体

> ⚠️ **描述中的 Bug 标题只写现象，不加任何优先级标注**（如"高优先级"、"中优先级"、"低优先级"）。Issue 优先级统一由字段控制，默认 Medium，描述里不重复标注。

单个 bug / 合并多个相似 bug 的描述模板见 `references/issue-templates.md`。

### 8. 提交 Issue

用 `mcp__claude_ai_Linear__save_issue` 提交：

| 参数 | 值 |
|------|-----|
| team | 从项目信息中获取所属团队 ID（不一定是 Mira） |
| state | Todo 状态 ID（从项目所属团队获取） |
| assignee | 根据 bug 修复层级：**前端 bug** → 前端负责人 ID；**后端 bug** → 后端负责人 ID；**前后端都要改** → 后端负责人 ID（后端通常更合适主责） |
| labels | Bug label ID |
| project | 从链接解析到的项目 ID |
| priority | 3（Medium） |

### 9. 提交后保存

提交成功后，将当前项目链接、项目名、前端负责人姓名和 Linear 用户 ID、后端负责人姓名和 Linear 用户 ID 写入 `skills/bug-submit/state/last-context.json`（整体覆盖写入，`updatedAt` 记录当前时间）。

---

## 跨窗口提醒

每次触发本 skill 时，先按上面「状态缓存」一节读取 `state/last-context.json`：
- 有 → 提示"上次提交到 [项目名]，前端负责人 [姓名]，后端负责人 [姓名]，本次继续用这个配置吗？"，用户确认后加载为当前缓存
- 无 → 等用户描述第一个 bug 时按流程询问

## Reference Files

- `references/issue-templates.md` — 单个 bug / 合并多个相似 bug 的 Issue 描述模板
- `references/verification-checklist.md` — 读代码验证、curl 实测、postgres 查库的强制要求和判断标准
