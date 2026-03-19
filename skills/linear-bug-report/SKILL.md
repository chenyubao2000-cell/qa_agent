---
name: linear-bug-report
description: 将测试失败用例格式化并上报到 Linear。支持新建 issue 和追加评论。当任务涉及"上报 Bug"、"Linear Issue"时激活。
---

# Linear Bug 上报规范

## 触发条件

由 report-analyzer agent 在发现失败用例且去重/分流检查通过后调用。

## 两种上报模式

| 模式 | 触发条件 | 操作 |
|------|---------|------|
| **新建** | 失败用例无对应 Open issue | `createIssue` 创建新 issue |
| **评论** | 失败用例有对应 Open issue，或来源于 /qa-from-issue 的原始 issue | `add_issue_comment` 追加评论 |

## Issue 创建规范（新建模式）

### 标题格式
`[自动] {测试用例名} — {错误摘要（≤50字）}`

### 优先级映射
| 用例优先级 | Linear Priority |
|-----------|-----------------|
| P0        | Urgent (1)      |
| P1        | High (2)        |
| P2        | Medium (3)      |
| 无标注     | Low (4)         |

### 标签
- `auto-generated`（标识自动创建）
- `e2e` 或 `unit`（测试类型）
- `{功能模块名}`（来自用例分组）

### 描述模板

```markdown
## 问题描述
{错误信息摘要}

## 复现步骤
{测试步骤，来自测试用例的 When 部分}

## 期望结果
{用例的 Then 部分}

## 实际结果
{实际错误信息 / 断言失败详情}

## 环境信息
- Preview URL: {PREVIEW_URL}
- 执行时间: {ISO timestamp}
- 测试类型: {e2e / unit}
- 测试文件: {spec file path}

## 附件
{失败截图路径（E2E）或错误堆栈（Unit）}
```

## 评论规范（评论模式）

### 评论模板

```markdown
## 🔴 自动化测试失败

**用例**: {测试用例名}
**错误**: {错误信息}
**截图**: {截图路径 or "无"}
**Spec**: {spec 文件路径}
**执行时间**: {ISO timestamp}
```

多条失败合并为一条评论，用 `---` 分隔。

## 去重逻辑

> **去重由 report-analyzer agent 统一负责。** 本 Skill 仅定义格式规范，不重复执行去重检查。
> report-analyzer 在调用 bug-reporter 前已完成去重，每条传入的用例都已标记 action（create/comment）。

去重规则（由 report-analyzer 执行）：
1. 搜索标题包含 `[自动] {测试用例名}` 的 Issue
2. 状态为 Open / In Progress → 追加评论
3. 状态为 Done / Cancelled → 回归 Bug，重新创建
4. 不存在 → 正常创建

## API 调用

通过 Linear MCP server：
- 新建：`createIssue`（projectId + teamId 来自 .env）
- 评论：`add_issue_comment`（issueId + body）
