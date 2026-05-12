# Test Cases · task-completed · more-menu area

> Source: CDP exploration (area = more-menu)
> Component: TaskHeader → ellipsis button → DropdownMenu (single item: "任务详情") + Popover
> Source: `features/task/components/task-header.tsx` lines 179-230
> Generated: 2026-04-28
> Fixture: taskWithToolChainUrl (or any completed task)

## Method 1: Equivalence Partitioning

| 等价类 | 描述 |
|--------|------|
| 有效类 1 | 点击 ellipsis → menu role=menu 出现，含一项 chatbot.taskDetails |
| 有效类 2 | 点击"任务详情" → Popover 打开，展示 taskTitle / creditsConsumed / createdTime |

## Method 2: Boundary Value Analysis

N/A — menu 仅 1 项，无数量边界。

## Method 3: Cause-Effect Graph / Decision Table

| 因 | 果 |
|----|----|
| 完成态任务 + 点击 ellipsis | DropdownMenu 显示 1 个 menuitem chatbot.taskDetails |
| 点击 chatbot.taskDetails | 触发 setTimeout 300ms 后 popoverOpen=true → Popover 显示详情 |
| Popover 内点击 X 按钮 / 点击外部 | Popover 关闭 |

## Method 4: State Transition Testing

S0(浏览) ──ellipsis click──▶ S3(menu) ──taskDetails click──▶ S3'(popover open) ──X / outside──▶ S0

- TC-CDP-MORE-001: S0 → S3
- TC-CDP-MORE-002: S3 → S3' → 验证 popover 内容

## Method 5: Scenario Method

场景：用户想查看一个已完成任务的"消耗积分"
- 步骤：进入完成态任务 → 点击 ellipsis → 点击 chatbot.taskDetails → 验证 popover 显示 chatbot.creditsConsumed 标签 + 数值
- 覆盖：TC-CDP-MORE-002

## Method 6: Error Guessing

- 网络错误时 popover 中 creditsConsumed 显示 "-"。已被组件 catch 处理。N/A（不易稳定模拟）。

## Merged Test Case List

**TC-CDP-MORE-001**: 点击 ellipsis 按钮打开包含"任务详情"的菜单 [smoke]
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** 已登录 + 通过 fixture taskWithToolChainUrl 进入完成态任务详情页
- **操作步骤:** 1) 进入任务详情页；2) 等待 chatbot.completed 标识；3) 点击顶栏 button:has(svg.lucide-ellipsis)；4) 等待 [role='menu'] 可见
- **预期结果:** menu 可见，且仅包含一个 menuitem，文本与 chatbot.taskDetails 一致（"任务详情" / "Task details" / "Détails de la tâche"）。
- **测试数据:** 无

**TC-CDP-MORE-002**: 点击"任务详情"打开 Popover 展示 title / creditsConsumed / createdTime
- **优先级:** P2
- **测试类型:** 因果图
- **前置条件:** 同 001
- **操作步骤:** 1) 打开 ellipsis 菜单；2) 点击 chatbot.taskDetails menuitem；3) 等待 Popover 出现（[role='dialog'] 或 popover content，标题为 chatbot.taskDetails）；4) 验证 popover 内含 chatbot.taskTitle 标签 + chatbot.creditsConsumed 标签 + chatbot.createdTime 标签；5) 验证 chatbot.creditsConsumed 对应的数值不为空 / 不是 NaN
- **预期结果:** Popover 显示 3 个字段；creditsConsumed 数值为整数字符串（可能含 "-" 异常值，但不为空）；createdTime 可被 Date.parse 解析。
- **测试数据:** 无
