# Test Cases · task-completed · credits-button area

> Source: CDP exploration (area = credits-button)
> Component: CreditsPill (`components/layout/credits-pill.tsx`) — only rendered on `/task` (NEW page),
>            NOT on `/task/{taskId}` (detail page header).
> i18n key: billing.creditsBadge = "{count} Credits" (zh/en/fr identical format).
> Anomaly: chenyubao2000 测试账号 balance 为 -57184（exploration 观察）。疑似计费 bug，需要产品确认是否为已知问题。
>          TC-003 标记 @failing 不阻塞测试套件，仅用于追踪。
> Generated: 2026-04-28

## Method 1: Equivalence Partitioning

| 等价类 | 描述 |
|--------|------|
| 有效类 1 | /task NEW 页面 CreditsPill 可见 + 文本匹配 /-?\d+\s*Credits/ |
| 有效类 2 | /task/{taskId} 详情页 CreditsPill **不渲染**（只显示 task header） |
| 无效类 N/A | 未登录 → 整个 layout 不渲染（auth 已处理） |

## Method 2: Boundary Value Analysis

| 边界 | 描述 |
|------|------|
| balance = 0 | 应显示 "0 Credits"（未订阅情形） |
| balance > 0 | 正常显示（多数场景） |
| balance < 0 | 异常情形（chenyubao2000 测试账号实际显示 -57184），TC-003 验证显示形态本身是稳健的 — 不论数值符号都能渲染 |

## Method 3: Cause-Effect Graph

| 因 | 果 |
|----|----|
| pathname = /task | TaskIndexContent 渲染 CreditsPill |
| pathname = /task/{taskId} | TaskHeader 渲染（不含 CreditsPill） |
| useBillingCredit 加载中 | 显示 Skeleton |
| useBillingCredit 完成 | 显示 billing.creditsBadge({ count }) |

## Method 4: State Transition Testing

S(loading) ──API success──▶ S(loaded, balance shown)
                      └──API error──▶ S(loaded, balance=0)

- 转换以加载完成为主场景，TC-001 / TC-002 覆盖。

## Method 5: Scenario Method

场景：用户进入新建任务页面，左上角看到剩余积分
- 步骤：page.goto('/task') → 等待 CreditsPill 加载完成 → 文本匹配
- 覆盖：TC-CDP-CREDITS-001

## Method 6: Error Guessing

- 余额为负 → 设计上不应发生，但实际会渲染（无校验）。TC-CDP-CREDITS-003 标记 @failing 追踪。
- API 超时 → fallback balance=0。N/A（不稳定）。

## Merged Test Case List

**TC-CDP-CREDITS-001**: /task NEW 页面可见 Credits Pill 且文本匹配 /-?\d+\s*Credits/ [smoke]
- **优先级:** P2
- **测试类型:** 等价类划分
- **前置条件:** 已登录
- **操作步骤:** 1) page.goto('/task')；2) 等待 dashboard.welcome 标题可见（页面已加载完成）；3) 在 main 区域内定位 button:has(svg.lucide-coins)（CreditsPill 含 Coins 图标）；4) 等待 button 文本不再是 Skeleton；5) 读取按钮文本 textContent
- **预期结果:** CreditsPill 按钮可见；文本匹配 /-?\d+\s*Credits/。
- **测试数据:** 无

**TC-CDP-CREDITS-002**: /task/{taskId} 任务详情页不渲染 Credits Pill（regression）
- **优先级:** P3
- **测试类型:** 因果图
- **前置条件:** 已登录 + 通过 fixture taskWithToolChainUrl 进入完成态任务详情页
- **操作步骤:** 1) 进入 taskWithToolChainUrl；2) 等待 chatbot.completed 标识；3) 在整个页面内查找 button:has(svg.lucide-coins) 且文本匹配 /Credits/
- **预期结果:** locator.count() === 0；详情页 header 无 Credits Pill。
- **测试数据:** 无

**TC-CDP-CREDITS-003**: chenyubao2000 测试账号显示负数 Credits（已知数据异常） @failing
- **优先级:** P3
- **测试类型:** 错误猜测
- **前置条件:** 已登录（chenyubao2000@163.com）
- **操作步骤:** 1) page.goto('/task')；2) 等待 CreditsPill 文本加载完成；3) 读取数字部分（剥离 " Credits" 后缀）
- **预期结果:** 当前数据状态下 balance < 0（约 -57184）。**注意:** 这是数据状态而非功能 bug 的断言；用例本身仅用于跟踪计费数据异常，待产品确认后调整或转为正常断言。如果数据已经被修复 / 重置 → 该测试会自然失败 → 应当移除 @failing 并将断言改为 ≥ 0。
- **测试数据:** 无
- **标签:** @failing（数据状态追踪，不阻塞 suite）
