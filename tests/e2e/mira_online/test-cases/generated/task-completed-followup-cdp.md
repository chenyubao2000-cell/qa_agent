# Test Cases · task-completed · followup-suggestions area

> Source: CDP exploration (page-baseline-task-completed.json, area = followup-suggestions)
> Target page: /task/{taskId} (completed task, owner-bound)
> Component: SuggestedFollowUps (`mira-work/components/ai-elements/suggested-follow-ups.tsx`)
> Generated: 2026-04-28
> Fixture: taskWithToolChainUrl (creates a 6-file deliverable task; AI typically produces follow-up suggestions afterwards)

## Method 1: Equivalence Partitioning

| 等价类 | 描述 | 代表用例 |
|--------|------|---------|
| 有效类 1 | "推荐追问" header 显示状态 | TC-CDP-FOLLOWUP-001 |
| 有效类 2 | 点击有效追问按钮提交一条新用户消息 | TC-CDP-FOLLOWUP-003 |
| 无效类 N/A | 不存在 follow-up 时 panel 不渲染 | 由 AnimatePresence 保证，组件层不可在 e2e 触发 |

## Method 2: Boundary Value Analysis

| 边界 | 描述 |
|------|------|
| count = 0 | 无 follow-up 时整个区域不渲染（component 行为，e2e 难以稳定触发） |
| count ≥ 1 | TC-CDP-FOLLOWUP-002 — 至少一个按钮含 lucide-arrow-right |
| count = N（多个） | TC-CDP-FOLLOWUP-002 取 .first()/.count() 验证 |

## Method 3: Cause-Effect Graph / Decision Table

| 因 | 因 | 果 |
|----|----|----|
| 任务已完成（chatbot.completed 显示） | + AI 已产出 suggestions | "推荐追问" header 可见 + N 个按钮可见 |
| 任务已完成 | + AI 未产出 suggestions（少见） | 区域不渲染（AnimatePresence exit） |
| 点击 follow-up button | textarea 不被 fill | log 直接新增一条 user-message（auto-submit） |

## Method 4: State Transition Testing

S0(完成态浏览) → click follow-up → S0' (log 内多一条 user-message)
- 触发：用户在浏览模式下点击任一 follow-up 按钮
- 副作用：textarea 不会被预填；form 直接提交；log 立即新增一条与按钮文本相同的 user-message
- TC-CDP-FOLLOWUP-003、TC-CDP-FOLLOWUP-004 覆盖

## Method 5: Scenario Method

场景：用户读完 AI 报告后想让 AI 补充信息，直接点击底部"推荐追问"
- 步骤：进入完成态任务 → 点击第一个 follow-up → 等待 user message 出现
- 覆盖：TC-CDP-FOLLOWUP-003

## Method 6: Error Guessing

- 网络抖动时点击 follow-up → 应当不会重复提交（按钮短暂禁用）。本期无法稳定模拟，暂列 N/A。
- 已有任务被取消/中止后点击 → 行为不确定。N/A（exploration 未覆盖）。

## Merged Test Case List

**TC-CDP-FOLLOWUP-001**: 已完成任务详情页可见"推荐追问"区域 header + 至少一个 follow-up 按钮 [smoke]
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 已登录 + 通过 fixture taskWithToolChainUrl 创建一个完成态任务（产出 6 个文件 + AI 通常会附带 suggestions）
- **操作步骤:** 1) 通过 fixture 拿到 taskWithToolChainUrl；2) 直接 page.goto(taskWithToolChainUrl)；3) 等待 chatbot.completed 状态出现；4) 等待 SuggestedFollowUps 区域渲染（"推荐追问" 文本 / Suggested follow-ups / Suggestions de suivi）
- **预期结果:** "推荐追问" header 可见；至少存在 1 个 follow-up 按钮；按钮可点击。
- **测试数据:** 无

**TC-CDP-FOLLOWUP-002**: 每个 follow-up 按钮包含 lucide-arrow-right 图标
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 同 001
- **操作步骤:** 1) 进入完成态任务页；2) 等待 follow-up 区域可见；3) 统计 main 区域内 button:has(svg.lucide-arrow-right) 的数量；4) 比对总数 ≥ 1
- **预期结果:** 每个 follow-up button 内嵌 lucide-arrow-right SVG；count ≥ 1。
- **测试数据:** 无

**TC-CDP-FOLLOWUP-003**: 点击 follow-up 按钮自动提交，log 内新增一条 user-message [smoke]
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 同 001
- **操作步骤:** 1) 进入完成态任务页；2) 等待 follow-up 区域可见；3) 记录点击前 [role='log'] 内 user-message 数量 N；4) 读取第一个 follow-up 的文本 text；5) 点击该按钮；6) 等待 [role='log'] 内 user-message 数量变为 N+1
- **预期结果:** log 内多出一条 user-message，其文本包含 step 4 读到的 text；textarea 保持空（不被预填）。
- **测试数据:** 无（动态读取按钮文本）

**TC-CDP-FOLLOWUP-004**: 点击 follow-up 后 textarea 不被 fill（auto-submit 直接走 form）
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** 同 001
- **操作步骤:** 1) 进入完成态任务页；2) 等待 follow-up 区域可见；3) 验证 main textarea 当前为空；4) 点击第一个 follow-up；5) 立即（≤1s）再次读取 main textarea 的 value
- **预期结果:** textarea 在点击前后均为空字符串（行为是直接 submit，不经过 textarea fill 路径）。
- **测试数据:** 无
