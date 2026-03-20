---
name: linear-bug-report
description: Formats failed test cases and reports them to Linear. Supports creating new issues and appending comments. Activated when the task involves "report bugs" or "Linear Issues".
---

# Linear Bug Reporting Specification

## Trigger Condition

Called by the report-analyzer agent after discovering failed test cases and passing deduplication/routing checks.

## Two Reporting Modes

| Mode | Trigger Condition | Action |
|------|---------|------|
| **Create** | Failed test case has no corresponding Open issue | `createIssue` to create a new issue |
| **Comment** | Failed test case has a corresponding Open issue, or originates from the original issue of /qa-from-issue | `add_issue_comment` to append a comment |

## Issue Creation Specification (Create Mode)

### Title Format
`[Auto] {Test Case Name} — {Error Summary (≤50 chars)}`

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
## Problem Description
{Error message summary}

## Steps to Reproduce
{Test steps, from the When section of the test case}

## Expected Result
{The Then section of the test case}

## Actual Result
{Actual error message / assertion failure details}

## Environment Info
- Preview URL: {PREVIEW_URL}
- Execution Time: {ISO timestamp}
- Test Type: {e2e / unit}
- Test File: {spec file path}

## Attachments
{Failure screenshot path (E2E) or error stack trace (Unit)}
```

## Comment Specification (Comment Mode)

### Comment Template

```markdown
## 🔴 Automated Test Failure

**Test Case**: {Test case name}
**Error**: {Error message}
**Screenshot**: {Screenshot path or "None"}
**Spec**: {Spec file path}
**Execution Time**: {ISO timestamp}
```

Multiple failures are merged into a single comment, separated by `---`.

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
