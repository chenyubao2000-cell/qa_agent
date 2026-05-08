# Test Cases · task-completed · cross-area integration flows

> Source: CDP exploration cross-area flows (orchestrator-generated)
> Areas involved: share-dialog × followup-suggestions × topbar
> Generated: 2026-04-28
> Fixture: shareUrl (gives a completed task with active share, perfect for both areas)

## Method 1: Equivalence Partitioning

N/A — 整合用例不再做单点等价划分，归并各 area 已覆盖的有效类。

## Method 2: Boundary Value Analysis

N/A — 流程级，无边界。

## Method 3: Cause-Effect Graph

完成态任务 + 已分享 → 用户在同一页面内，先看到 follow-ups，再打开 share dialog 复制链接，最后回到对话流继续追问。

## Method 4: State Transition Testing

S0(浏览) ──share2──▶ S2(dialog) ──Close──▶ S0 ──follow-up click──▶ S0'(new user message)
S0 ──ellipsis──▶ S3(menu) ──Esc──▶ S0

- TC-CDP-FLOWS-001：share dialog → close → follow-up
- TC-CDP-FLOWS-002：ellipsis 菜单 → Esc → 返回浏览态后仍可点击 follow-up

## Method 5: Scenario Method

场景：研究员完成一个市场研究任务后，先把 share 链接发给同事，再继续追问 AI 让其细化某一点
- 覆盖 TC-CDP-FLOWS-001

场景：用户先查看任务详情面板（创建时间 / 消耗积分），关闭后继续追问
- 覆盖 TC-CDP-FLOWS-003

## Method 6: Error Guessing

- 在 share dialog 打开期间点击 follow-up：dialog 应当拦截外层点击，不会立即提交 follow-up。TC-CDP-FLOWS-001 流程顺序保证 dialog 先关闭。

## Merged Test Case List

**TC-CDP-FLOWS-001**: 打开 share 对话框 → 复制链接 → 关闭 → 点击 follow-up → log 内新增 user-message
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** 已登录 + fixture shareUrl 已成功创建（保证一个完成态、可分享、有 follow-up suggestion 的任务）
- **操作步骤:** 1) 从 shareUrl 反推 taskId 并 page.goto(/task/{taskId})；2) 等待 chatbot.completed；3) 点击 share2 → dialog 出现；4) 点击 chatbot.copyLink；5) 验证 navigator.clipboard 含 /share/.+token=；6) 关闭 dialog（Close 按钮）；7) 等待 dialog 消失；8) 等待 follow-up 区域可见，记录 [role='log'] 中 user-message 数 N；9) 点击第一个 follow-up；10) 等待 user-message 数变为 N+1
- **预期结果:** dialog 流程完成且不影响后续 follow-up 提交；clipboard 含 share URL；点击 follow-up 后 log 多一条 user message。
- **测试数据:** 动态读取

**TC-CDP-FLOWS-002**: 打开 ellipsis 菜单 → 按 Esc 关闭 → 后续 follow-up 仍可点击
- **优先级:** P3
- **测试类型:** 状态迁移
- **前置条件:** 同 001
- **操作步骤:** 1) 进入完成态任务；2) 点击 ellipsis；3) 等待 menu 可见；4) page.keyboard.press("Escape")；5) 等待 menu 隐藏；6) 等待 follow-up 区域；7) 点击第一个 follow-up；8) 验证 user-message 数 +1
- **预期结果:** 菜单顺利关闭后，follow-up 仍能正常点击并 auto-submit。
- **测试数据:** 无

**TC-CDP-FLOWS-003**: ellipsis → 任务详情 popover 显示 → 关闭 popover 后 share 按钮仍可重新打开 dialog
- **优先级:** P3
- **测试类型:** 状态迁移
- **前置条件:** 同 001
- **操作步骤:** 1) 进入任务详情；2) 点击 ellipsis → 点击 chatbot.taskDetails；3) 等待 popover 显示 chatbot.creditsConsumed；4) 在 popover 内点击 X 关闭按钮（若不存在则按 Escape）；5) 等待 popover 隐藏；6) 点击 share2 按钮；7) 等待 share dialog 出现
- **预期结果:** popover 关闭后 share dialog 仍能正常打开（两套 UI 互不干扰）。
- **测试数据:** 无
