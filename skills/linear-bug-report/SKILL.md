---
name: linear-bug-report
description: Formats failed test cases and reports them to Linear. Supports creating new issues and appending comments. Activated when the task involves "report bugs" or "Linear Issues".
model: claude-haiku-4-5
---

# Linear Bug Reporting Specification

## Language

All issue titles, descriptions, and comments MUST be written in **Chinese (简体中文)**.

## Trigger Condition

Called by the report-analyzer agent after discovering failed test cases and passing deduplication/routing checks.

## Two Reporting Modes

| Mode | Trigger Condition | Action |
|------|---------|------|
| **Create** | Failed test case has no corresponding Open issue | `createIssue` to create a new issue |
| **Comment** | Failed test case has a corresponding Open issue, or originates from the original issue of /qa-from-issue | `add_issue_comment` to append a comment |

## Issue Creation Specification (Create Mode)

### Title Format
`[Auto] {测试用例名称} — {错误摘要(≤50字)}`

### Priority Mapping
| Test Case Priority | Linear Priority |
|-----------|-----------------|
| P0        | Urgent (1)      |
| P1        | High (2)        |
| P2        | Medium (3)      |
| Unmarked  | Low (4)         |

### Labels
- `auto-generated` (identifies auto-created issues)
- `e2e` or `unit` (test type)
- `{feature module name}` (from test case grouping)

### Description Template

```markdown
## 问题描述
{错误信息摘要}

## 复现步骤
{测试步骤，来自用例的 When 部分}

## 期望结果
{用例的 Then 部分}

## 实际结果
{实际错误信息 / 断言失败详情}

## 环境信息
- 预览地址: {PREVIEW_URL}
- 执行时间: {ISO timestamp}
- 测试类型: {e2e / unit}
- 测试文件: {spec file path}

## 附件
{失败截图路径（E2E）或错误堆栈（Unit）}
```

## Comment Specification (Comment Mode)

### Comment Template

```markdown
## 🔴 自动化测试失败

**测试用例**: {测试用例名称}
**错误**: {错误信息}
**截图**: {截图路径 或 "无"}
**Spec 文件**: {spec 文件路径}
**执行时间**: {ISO timestamp}
```

多个失败合并为一条评论，用 `---` 分隔。

## Deduplication Logic

> **Deduplication is handled centrally by the report-analyzer agent.** This Skill only defines formatting specifications and does not perform deduplication checks.
> The report-analyzer completes deduplication before calling bug-reporter; each incoming test case is already tagged with an action (create/comment).

Deduplication rules (executed by report-analyzer):
1. Search for issues with titles containing `[Auto] {Test Case Name}`
2. Status is Open / In Progress → append comment
3. Status is Done / Cancelled → regression bug, create a new issue
4. Does not exist → create normally

## API Calls

Via the Linear MCP server:
- Create: `createIssue` (projectId + teamId from .env)
- Comment: `add_issue_comment` (issueId + body)
