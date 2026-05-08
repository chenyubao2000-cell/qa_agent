<!-- PRD-hash: 83334758661c3e5f6adb9f925d0ee5f0ff5828f465d642200bdc19a4a1d3865d | PRD-module: REQ-007 Credit 耗尽处理 + REQ-010 Credit 余额页面常驻展示 | feature-slug: stripe-credit-display -->

# Stripe 集成 Phase 1 — Credit 余额展示与耗尽处理（REQ-007 + REQ-010）

> **来源**: PRD `stripe_integration_phase1_prd_final.md` V1.3
> **范围**: 仅覆盖 REQ-007（Credit 耗尽处理）和 REQ-010（Credit 余额页面常驻展示）
> **测试范围**: 100% UI E2E，不涉及 Stripe 交互
> **设计参考**: 设计稿 S7（Credit Balance）、S8（Credit Detail Modal）

---

## 用户故事

**US-CDP-DISPLAY** (REQ-010)：作为已订阅用户，我需要在主界面常驻看到当前 Credit 余额、用量进度条和重置日期，以便随时了解剩余额度，避免在任务执行中突然耗尽而中断工作。

**US-CDP-EXHAUST** (REQ-007)：作为 Credit 已用完的用户，当我尝试发起任务时，系统需要阻止任务执行并以模态弹窗形式提示"本月 Credits 已用完"以及下次重置日期，并提供升级入口，以便我清楚知道下一步如何操作（等待重置或立即升级）。

---

## 验收标准（Acceptance Criteria）

### REQ-010：Credit 余额页面常驻展示
- AC-010-1：已订阅用户进入主页 → 顶部 header 右侧常驻显示 "{N} Credits" 徽章 + 金币图标
- AC-010-2：免费用户进入主页 → 底部条显示 "Free plan · {N} Credits remaining" + Upgrade plan 按钮
- AC-010-3：点击 Credit 徽章 → 打开 "Credit Balance" 模态弹窗
- AC-010-4：模态显示大数字（剩余额度）、副标题、"Resets {date}"、交易历史表
- AC-010-5：交易表按时间倒序展示，扣减为负数（红色），充值为正数（绿色），含运行余额
- AC-010-6：模态有 "Close" 和 "Upgrade plan" 按钮
- AC-010-7：点击 "Upgrade plan" 跳转定价页（REQ-001）
- AC-010-8：点击 "Close" / 模态外区域 / Esc → 关闭模态
- AC-010-9：余额低于 20% 月度配额 → 进度条变警告色 + 显示 "Credits running low" 标签/Tooltip
- AC-010-10：消耗 Credit 任务完成后 → 余额实时更新（或下次页面导航后更新）
- AC-010-11：重置日期格式与用户语言一致（en：Resets May 1 / zh：5 月 1 日重置）
- AC-010-12：模态需符合无障碍要求（focus trap、aria-label）

### REQ-007：Credit 耗尽处理
- AC-007-1：余额 < 任务成本时 → 触发 credits_exhausted 模态弹窗
- AC-007-2：弹窗 en 文案 "Your credits have been used up this month. Credits will reset on {resetDate}." / zh "本月 Credits 已用完，将于 {resetDate} 重置。"
- AC-007-3：弹窗 CTA 按钮 "Upgrade for more credits" / "升级获取更多 Credits"
- AC-007-4：点击 CTA → 跳转定价页（REQ-001）
- AC-007-5：用户可关闭弹窗 → 任务未执行，回到聊天输入框
- AC-007-6：{resetDate} 占位符替换为本地存储的 period_end 实际日期
- AC-007-7：取消订阅但仍在保留期内：余额 > 0 可继续使用；余额 = 0 看到耗尽弹窗
- AC-007-8：免费用户尝试付费功能 → 跳转升级流（REQ-001）而非仅展示耗尽弹窗
- AC-007-9：弹窗需符合无障碍要求（focus trap、aria-label）

---

## Method 1: Equivalence Partitioning

将 Credit 余额按业务规则划分为以下等价类：

| 类别 | 范围 | 期望系统行为 |
|------|------|-------------|
| 充足余额（valid 1） | balance >= 任务成本 且 >= 20% 配额 | 任务可执行，进度条正常色，常驻徽章正常显示 |
| 低余额警告（valid 2 / boundary 边缘） | 0 < balance < 20% 配额 | 任务可执行，进度条警告色 + "Credits running low" 提示 |
| 耗尽（invalid 1） | balance = 0 或 balance < 任务成本 | 任务被阻止，credits_exhausted 弹窗出现 |
| 取消保留期（特殊有效类） | 订阅 status=canceled 且 balance > 0 且当前周期未结束 | 可继续使用，无升级 CTA（或升级 CTA 跳转定价页用于复订） |
| 免费用户付费功能（特殊无效类） | tier=free 触发付费功能 | 跳转升级流（REQ-001），不显示耗尽弹窗 |

**TC-PRD-CDP-001**: 充足余额已订阅用户 — Credit 徽章常驻显示
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已使用预置已订阅账号登录，余额充足（>= 50% 配额）
- **操作步骤:** 1) 导航到主页 / 2) 观察顶部 header 右侧
- **预期结果:** 顶部 header 右侧常驻显示金币图标 + "{N} Credits" 徽章；徽章可见且可点击
- **测试数据:** 已订阅有效账号

**TC-PRD-CDP-002**: 免费用户 — 底部条显示 Credits remaining 与 Upgrade 入口
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户为免费档位（tier=free），有可用 Credit 余额
- **操作步骤:** 1) 导航到主页 / 2) 观察页面底部条
- **预期结果:** 底部条显示 "Free plan · {N} Credits remaining" 文案 + "Upgrade plan" 按钮
- **测试数据:** 免费用户账号

**TC-PRD-CDP-003**: 余额耗尽用户发起任务 — 触发 credits_exhausted 弹窗
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已订阅且当前 Credit 余额 = 0（或 < 任务成本）
- **操作步骤:** 1) 进入聊天输入区 / 2) 输入任意 prompt 并提交
- **预期结果:** 任务未发起执行，credits_exhausted 模态弹窗出现，包含文案与 Upgrade CTA；输入框保持原状态
- **测试数据:** balance=0 测试账号

**TC-PRD-CDP-004**: 已取消订阅但保留期内 Credit > 0 — 可继续使用
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户订阅 status=canceled，period_end 未到，balance > 0
- **操作步骤:** 1) 进入聊天输入区 / 2) 输入 prompt 并提交
- **预期结果:** 任务正常发起执行，未弹出 credits_exhausted 模态
- **测试数据:** canceled+balance>0 测试账号

---

## Method 2: Boundary Value Analysis

针对"余额 < 20% 触发警告色"以及"余额 < 任务成本触发耗尽弹窗"两个边界规则。

假设月度配额 monthlyQuota=120，则 20% 阈值 = 24。

| 边界点 | 余额值 | 期望行为 |
|--------|--------|---------|
| 阈值 - 1 | 23 | 进度条警告色 + "Credits running low" |
| 阈值 | 24 | 进度条警告色 + "Credits running low"（含等号取决于规则，此处取 < 严格小于则正常色；若 <= 则警告色） |
| 阈值 + 1 | 25 | 进度条正常色 |
| 耗尽下界 | 0 | 任何任务都触发 credits_exhausted |
| 耗尽下界 + 1 | 1（且任务成本 = 5） | 余额 < 任务成本 → 触发 credits_exhausted |
| 耗尽下界 + 任务成本 | 5（任务成本 = 5） | 余额 = 任务成本，任务可执行 |

**TC-PRD-CDP-005**: 边界 — 余额恰好低于 20% 配额阈值（balance=23/120）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已订阅，monthlyQuota=120，当前 balance=23（低于 20% 阈值 24）
- **操作步骤:** 1) 导航到主页 / 2) 点击 Credit 徽章查看模态
- **预期结果:** 进度条变为警告色（red/amber）；徽章/进度条附近显示 "Credits running low" 标签或 Tooltip
- **测试数据:** balance=23, monthlyQuota=120

**TC-PRD-CDP-006**: 边界 — 余额恰好高于 20% 阈值（balance=25/120）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已订阅，monthlyQuota=120，当前 balance=25（高于 20% 阈值）
- **操作步骤:** 1) 导航到主页 / 2) 点击 Credit 徽章查看模态
- **预期结果:** 进度条为正常色（非警告色）；不显示 "Credits running low"
- **测试数据:** balance=25, monthlyQuota=120

**TC-PRD-CDP-007**: 边界 — 余额等于任务成本（balance=5, taskCost=5）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** balance=5；准备一个估算成本为 5 的任务模板
- **操作步骤:** 1) 进入聊天输入区 / 2) 提交估算成本 5 的任务
- **预期结果:** 任务正常发起执行（balance >= 成本），不触发 credits_exhausted
- **测试数据:** balance=5, taskCost=5

**TC-PRD-CDP-008**: 边界 — 余额比任务成本少 1（balance=4, taskCost=5）
- **优先级:** P0
- **测试类型:** 边界值分析
- **前置条件:** balance=4；任务模板成本估算为 5
- **操作步骤:** 1) 进入聊天输入区 / 2) 提交估算成本 5 的任务
- **预期结果:** 任务被拦截，credits_exhausted 弹窗出现
- **测试数据:** balance=4, taskCost=5

---

## Method 3: Cause-Effect Graph / Decision Table

针对"用户类型 × 余额状态 × 触发动作"的多因素组合：

| 用户档位 | 订阅状态 | 余额状态 | 动作 | 期望结果 |
|---------|---------|----------|------|---------|
| 已订阅 active | 充足 | balance >= cost | 提交任务 | 任务执行 |
| 已订阅 active | 耗尽 | balance < cost | 提交任务 | credits_exhausted 弹窗（含 Upgrade CTA） |
| 已订阅 canceled 保留期 | 余额 > 0 | balance >= cost | 提交任务 | 任务执行 |
| 已订阅 canceled 保留期 | 耗尽 | balance = 0 | 提交任务 | credits_exhausted 弹窗（CTA 跳转定价页用于复订） |
| 免费 free | 任意 | — | 触发付费功能 | 直接跳转升级流（REQ-001），不展示 credits_exhausted |
| 已订阅 active | 低警告 | 0 < balance < 20% | 浏览主页 | 进度条警告色 + "Credits running low" |

**TC-PRD-CDP-009**: 决策表 — 已订阅 + 充足余额 → 任务正常执行
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 已订阅 active 用户，balance >> taskCost
- **操作步骤:** 1) 提交一个低成本 prompt
- **预期结果:** 任务执行，不出现 credits_exhausted；提交后余额按消耗实时减少（或下次导航后减少）
- **测试数据:** active 账户, balance=120, taskCost~=5

**TC-PRD-CDP-010**: 决策表 — 已订阅 active + 耗尽 → 弹窗含 Upgrade for more credits CTA
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 已订阅 active 用户，balance=0
- **操作步骤:** 1) 提交一个 prompt / 2) 观察弹窗 / 3) 点击 "Upgrade for more credits"
- **预期结果:** credits_exhausted 弹窗显示 Upgrade CTA；点击后跳转 /pricing 路径（REQ-001 定价页）
- **测试数据:** active+balance=0

**TC-PRD-CDP-011**: 决策表 — 免费用户尝试付费功能 → 跳转升级流（不显示耗尽弹窗）
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 免费用户（tier=free）
- **操作步骤:** 1) 触发一个标记为付费档位的功能（如 People Data 批量 enrich）
- **预期结果:** 直接跳转升级流（/pricing 或同等 Upgrade Modal），不出现 credits_exhausted 弹窗
- **测试数据:** tier=free 账号

---

## Method 4: State Transition Testing

Credit 余额展示与弹窗状态机：

```
[Closed Badge] --click--> [Credit Balance Modal Open]
[Credit Balance Modal Open] --click Close--> [Closed Badge]
[Credit Balance Modal Open] --click outside--> [Closed Badge]
[Credit Balance Modal Open] --press Esc--> [Closed Badge]
[Credit Balance Modal Open] --click Upgrade plan--> [Pricing Page]

[Chat Input Idle] --submit & balance<cost--> [credits_exhausted Modal Open]
[credits_exhausted Modal Open] --click Close/×--> [Chat Input Idle]
[credits_exhausted Modal Open] --click Upgrade CTA--> [Pricing Page]
[Chat Input Idle] --submit & balance>=cost--> [Task Submitted]
```

**TC-PRD-CDP-012**: 状态迁移 — 点击 Credit 徽章打开 Credit Balance 模态
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 已订阅用户在主页，header 显示 Credit 徽章
- **操作步骤:** 1) 点击 header Credit 徽章
- **预期结果:** Credit Balance 模态打开，显示标题 "Credit Balance"、副标题 "View your usage and manage credits."、剩余额度大数字、"Resets {date}"、交易表
- **测试数据:** 无

**TC-PRD-CDP-013**: 状态迁移 — 点击 Close 按钮关闭模态
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 点击模态底部 "Close" 按钮
- **预期结果:** 模态关闭；焦点返回到 Credit 徽章
- **测试数据:** 无

**TC-PRD-CDP-014**: 状态迁移 — 点击模态外部区域关闭模态
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 点击模态外的 backdrop / 遮罩层区域
- **预期结果:** 模态关闭
- **测试数据:** 无

**TC-PRD-CDP-015**: 状态迁移 — Upgrade plan 按钮跳转定价页
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 点击模态底部 "Upgrade plan" 黑色填充按钮
- **预期结果:** 页面跳转 /pricing；URL 路径包含 pricing；定价页（REQ-001）加载完成
- **测试数据:** 无

**TC-PRD-CDP-016**: 状态迁移 — credits_exhausted 弹窗可关闭返回输入框
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** balance=0；用户已提交任务并触发 credits_exhausted 弹窗
- **操作步骤:** 1) 点击弹窗右上角 × 或外部点击关闭弹窗
- **预期结果:** 弹窗关闭；任务未执行；用户回到聊天输入框，输入内容仍保留（或被清空，按实现）
- **测试数据:** balance=0

**TC-PRD-CDP-017**: 状态迁移 — credits_exhausted 弹窗 Upgrade CTA 跳转定价页
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** balance=0；credits_exhausted 弹窗已打开
- **操作步骤:** 1) 点击 "Upgrade for more credits" CTA
- **预期结果:** 页面跳转 /pricing
- **测试数据:** balance=0

---

## Method 5: Scenario Method

端到端真实业务流串联：

**TC-PRD-CDP-018**: 场景 — 已订阅用户查看完整 Credit 详情（徽章 → 模态 → 交易历史）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已订阅用户，存在历史交易记录（至少 1 条扣减 + 1 条月度充值）
- **操作步骤:** 1) 登录后导航到主页 / 2) 验证 header Credit 徽章 / 3) 点击徽章打开模态 / 4) 验证标题/副标题/大数字/重置日期 / 5) 验证交易表渲染（Date | Description | Credits | Balance 列） / 6) 验证扣减为负数+红色，充值为正数+绿色 / 7) 验证按时间倒序 / 8) 点击 Close 关闭模态
- **预期结果:** 全流程顺畅；交易表至少含 1 条带负 Credits 的扣减行 + 1 条带正 Credits 的充值行（如 "Apr 1 | Monthly credit top-up | +200 | 200"）；运行余额列单调正确
- **测试数据:** 含丰富历史的已订阅账号

**TC-PRD-CDP-019**: 场景 — 任务消耗 Credit 后余额实时更新
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已订阅用户，初始 balance 已知（B0）
- **操作步骤:** 1) 记录 header 徽章当前数字 B0 / 2) 提交一个明确成本 C 的任务并等待完成 / 3) 等待任务完成或刷新页面 / 4) 重新读取徽章数字 B1
- **预期结果:** B1 = B0 - C（或 B1 < B0），徽章数字实时反映消耗；进入 Credit Balance 模态后交易表新增对应扣减行
- **测试数据:** 已订阅账号 + 已知成本任务模板

**TC-PRD-CDP-020**: 场景 — 完整耗尽流程：发起任务 → 弹窗 → 升级跳转
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** balance=0 已订阅用户
- **操作步骤:** 1) 在聊天输入区输入 "测试 prompt" / 2) 点击发送 / 3) 验证 credits_exhausted 弹窗弹出并显示正确文案（含本地存储 period_end 替换的 resetDate）/ 4) 点击 "Upgrade for more credits" / 5) 验证跳转 /pricing
- **预期结果:** 弹窗文案与 PRD 完全一致；resetDate 是有效日期格式（不应为字面 "{resetDate}"）；点击 CTA 后落到 /pricing 页面
- **测试数据:** balance=0 + period_end=有效日期

**TC-PRD-CDP-021**: 场景 — 免费用户底部条 Upgrade 按钮跳转升级流
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 免费用户（tier=free）
- **操作步骤:** 1) 导航到主页 / 2) 观察底部条 / 3) 点击 "Upgrade plan" 按钮
- **预期结果:** 跳转 /pricing 定价页（REQ-001）
- **测试数据:** tier=free 账号

---

## Method 6: Error Guessing

经验性预判：

**TC-PRD-CDP-022**: 错误猜测 — Credit Balance 模态打开后 focus trap 工作正常
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 反复按 Tab 键
- **预期结果:** 焦点循环停留在模态内可聚焦元素（Close、Upgrade plan、可能的滚动表区域），不会逃逸到背景页面
- **测试数据:** 无

**TC-PRD-CDP-023**: 错误猜测 — credits_exhausted 弹窗 aria-label / 角色正确
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** balance=0 触发 credits_exhausted 弹窗
- **操作步骤:** 1) 通过开发者工具/无障碍树检查弹窗 DOM
- **预期结果:** 弹窗具有 role="dialog" 或 role="alertdialog"；含 aria-modal="true"；含 aria-label 或 aria-labelledby 指向标题文本；CTA 按钮有可访问名
- **测试数据:** 无

**TC-PRD-CDP-024**: 错误猜测 — 重置日期占位符未被替换（{resetDate} 字符串）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 触发 credits_exhausted 弹窗或打开 Credit Balance 模态
- **操作步骤:** 1) 读取弹窗/模态文本
- **预期结果:** 文本中不应出现字面字符串 "{resetDate}" 或 "{date}"；应被替换为有效日期格式（en：May 1 / 2026 / zh：5 月 1 日）
- **测试数据:** 无

**TC-PRD-CDP-025**: 错误猜测 — Esc 键关闭模态
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 按下 Esc 键
- **预期结果:** 模态关闭
- **测试数据:** 无

**TC-PRD-CDP-026**: 错误猜测 — 点击徽章短时间内多次 / 双击不应打开多重模态
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Credit 徽章可见
- **操作步骤:** 1) 在 200ms 内连续点击徽章 2-3 次
- **预期结果:** 仅出现 1 个 Credit Balance 模态，不会叠加多个对话框
- **测试数据:** 无

**TC-PRD-CDP-027**: 错误猜测 — 当前语言为 en 时，文案使用英文版（不出现中文混杂）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 浏览器/用户语言为英文（en）
- **操作步骤:** 1) 触发 credits_exhausted 弹窗 / 2) 打开 Credit Balance 模态
- **预期结果:** 弹窗文案严格为 "Your credits have been used up this month. Credits will reset on {resetDate}."；CTA 为 "Upgrade for more credits"；模态标题 "Credit Balance"；副标题 "View your usage and manage credits."；不出现中文字符
- **测试数据:** locale=en

**TC-PRD-CDP-028**: 错误猜测 — 交易表为空时（首月新订阅）展示空状态而非崩溃
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 全新订阅用户，无任何历史交易（仅首次充值记录）
- **操作步骤:** 1) 打开 Credit Balance 模态
- **预期结果:** 模态正常打开；交易表至少展示首次充值记录或空状态提示，不出现 JS 错误 / 白屏 / 表格渲染异常
- **测试数据:** 全新订阅账号

---

## Merged Test Case List

> 共 28 条测试用例，覆盖 REQ-007 + REQ-010；涵盖 6 种设计方法。
>
> 优先级分布：P0 = 9 条（32%），P1 = 11 条（39%），P2 = 8 条（29%）。

**TC-PRD-CDP-001**: 充足余额已订阅用户 — Credit 徽章常驻显示
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已使用预置已订阅账号登录，余额充足（>= 50% 配额）
- **操作步骤:** 1) 导航到主页 2) 观察顶部 header 右侧
- **预期结果:** 顶部 header 右侧常驻显示金币图标 + "{N} Credits" 徽章；徽章可见且可点击

**TC-PRD-CDP-002**: 免费用户 — 底部条显示 Credits remaining 与 Upgrade 入口
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户为免费档位（tier=free），有可用 Credit 余额
- **操作步骤:** 1) 导航到主页 2) 观察页面底部条
- **预期结果:** 底部条显示 "Free plan · {N} Credits remaining" 文案 + "Upgrade plan" 按钮

**TC-PRD-CDP-003**: 余额耗尽用户发起任务 — 触发 credits_exhausted 弹窗
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已订阅且当前 Credit 余额 = 0（或 < 任务成本）
- **操作步骤:** 1) 进入聊天输入区 2) 输入任意 prompt 并提交
- **预期结果:** 任务未发起执行，credits_exhausted 模态弹窗出现，包含文案与 Upgrade CTA；输入框保持原状态

**TC-PRD-CDP-004**: 已取消订阅但保留期内 Credit > 0 — 可继续使用
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户订阅 status=canceled，period_end 未到，balance > 0
- **操作步骤:** 1) 进入聊天输入区 2) 输入 prompt 并提交
- **预期结果:** 任务正常发起执行，未弹出 credits_exhausted 模态

**TC-PRD-CDP-005**: 边界 — 余额恰好低于 20% 配额阈值（balance=23/120）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已订阅，monthlyQuota=120，当前 balance=23（低于 20% 阈值 24）
- **操作步骤:** 1) 导航到主页 2) 点击 Credit 徽章查看模态
- **预期结果:** 进度条变为警告色（red/amber）；徽章/进度条附近显示 "Credits running low" 标签或 Tooltip

**TC-PRD-CDP-006**: 边界 — 余额恰好高于 20% 阈值（balance=25/120）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已订阅，monthlyQuota=120，当前 balance=25（高于 20% 阈值）
- **操作步骤:** 1) 导航到主页 2) 点击 Credit 徽章查看模态
- **预期结果:** 进度条为正常色（非警告色）；不显示 "Credits running low"

**TC-PRD-CDP-007**: 边界 — 余额等于任务成本（balance=5, taskCost=5）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** balance=5；准备一个估算成本为 5 的任务模板
- **操作步骤:** 1) 进入聊天输入区 2) 提交估算成本 5 的任务
- **预期结果:** 任务正常发起执行（balance >= 成本），不触发 credits_exhausted

**TC-PRD-CDP-008**: 边界 — 余额比任务成本少 1（balance=4, taskCost=5）
- **优先级:** P0
- **测试类型:** 边界值分析
- **前置条件:** balance=4；任务模板成本估算为 5
- **操作步骤:** 1) 进入聊天输入区 2) 提交估算成本 5 的任务
- **预期结果:** 任务被拦截，credits_exhausted 弹窗出现

**TC-PRD-CDP-009**: 决策表 — 已订阅 + 充足余额 → 任务正常执行
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 已订阅 active 用户，balance >> taskCost
- **操作步骤:** 1) 提交一个低成本 prompt
- **预期结果:** 任务执行，不出现 credits_exhausted；提交后余额按消耗实时减少（或下次导航后减少）

**TC-PRD-CDP-010**: 决策表 — 已订阅 active + 耗尽 → 弹窗含 Upgrade for more credits CTA
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 已订阅 active 用户，balance=0
- **操作步骤:** 1) 提交一个 prompt 2) 观察弹窗 3) 点击 "Upgrade for more credits"
- **预期结果:** credits_exhausted 弹窗显示 Upgrade CTA；点击后跳转 /pricing 路径（REQ-001 定价页）

**TC-PRD-CDP-011**: 决策表 — 免费用户尝试付费功能 → 跳转升级流（不显示耗尽弹窗）
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 免费用户（tier=free）
- **操作步骤:** 1) 触发一个标记为付费档位的功能（如 People Data 批量 enrich）
- **预期结果:** 直接跳转升级流（/pricing 或同等 Upgrade Modal），不出现 credits_exhausted 弹窗

**TC-PRD-CDP-012**: 状态迁移 — 点击 Credit 徽章打开 Credit Balance 模态
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 已订阅用户在主页，header 显示 Credit 徽章
- **操作步骤:** 1) 点击 header Credit 徽章
- **预期结果:** Credit Balance 模态打开，显示标题 "Credit Balance"、副标题 "View your usage and manage credits."、剩余额度大数字、"Resets {date}"、交易表

**TC-PRD-CDP-013**: 状态迁移 — 点击 Close 按钮关闭模态
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 点击模态底部 "Close" 按钮
- **预期结果:** 模态关闭；焦点返回到 Credit 徽章

**TC-PRD-CDP-014**: 状态迁移 — 点击模态外部区域关闭模态
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 点击模态外的 backdrop / 遮罩层区域
- **预期结果:** 模态关闭

**TC-PRD-CDP-015**: 状态迁移 — Upgrade plan 按钮跳转定价页
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 点击模态底部 "Upgrade plan" 黑色填充按钮
- **预期结果:** 页面跳转 /pricing；URL 路径包含 pricing；定价页（REQ-001）加载完成

**TC-PRD-CDP-016**: 状态迁移 — credits_exhausted 弹窗可关闭返回输入框
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** balance=0；用户已提交任务并触发 credits_exhausted 弹窗
- **操作步骤:** 1) 点击弹窗右上角 × 或外部点击关闭弹窗
- **预期结果:** 弹窗关闭；任务未执行；用户回到聊天输入框

**TC-PRD-CDP-017**: 状态迁移 — credits_exhausted 弹窗 Upgrade CTA 跳转定价页
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** balance=0；credits_exhausted 弹窗已打开
- **操作步骤:** 1) 点击 "Upgrade for more credits" CTA
- **预期结果:** 页面跳转 /pricing

**TC-PRD-CDP-018**: 场景 — 已订阅用户查看完整 Credit 详情（徽章 → 模态 → 交易历史）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已订阅用户，存在历史交易记录（至少 1 条扣减 + 1 条月度充值）
- **操作步骤:** 1) 登录后导航到主页 2) 验证 header Credit 徽章 3) 点击徽章打开模态 4) 验证标题/副标题/大数字/重置日期 5) 验证交易表渲染（Date | Description | Credits | Balance 列） 6) 验证扣减为负数+红色，充值为正数+绿色 7) 验证按时间倒序 8) 点击 Close 关闭模态
- **预期结果:** 全流程顺畅；交易表至少含 1 条带负 Credits 的扣减行 + 1 条带正 Credits 的充值行；运行余额列单调正确

**TC-PRD-CDP-019**: 场景 — 任务消耗 Credit 后余额实时更新
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已订阅用户，初始 balance 已知（B0）
- **操作步骤:** 1) 记录 header 徽章当前数字 B0 2) 提交一个明确成本 C 的任务并等待完成 3) 等待任务完成或刷新页面 4) 重新读取徽章数字 B1
- **预期结果:** B1 = B0 - C（或 B1 < B0），徽章数字实时反映消耗；进入 Credit Balance 模态后交易表新增对应扣减行

**TC-PRD-CDP-020**: 场景 — 完整耗尽流程：发起任务 → 弹窗 → 升级跳转
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** balance=0 已订阅用户
- **操作步骤:** 1) 在聊天输入区输入 "测试 prompt" 2) 点击发送 3) 验证 credits_exhausted 弹窗弹出并显示正确文案（含本地存储 period_end 替换的 resetDate）4) 点击 "Upgrade for more credits" 5) 验证跳转 /pricing
- **预期结果:** 弹窗文案与 PRD 完全一致；resetDate 是有效日期格式（不应为字面 "{resetDate}"）；点击 CTA 后落到 /pricing 页面

**TC-PRD-CDP-021**: 场景 — 免费用户底部条 Upgrade 按钮跳转升级流
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 免费用户（tier=free）
- **操作步骤:** 1) 导航到主页 2) 观察底部条 3) 点击 "Upgrade plan" 按钮
- **预期结果:** 跳转 /pricing 定价页（REQ-001）

**TC-PRD-CDP-022**: 错误猜测 — Credit Balance 模态打开后 focus trap 工作正常
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 反复按 Tab 键
- **预期结果:** 焦点循环停留在模态内可聚焦元素，不会逃逸到背景页面

**TC-PRD-CDP-023**: 错误猜测 — credits_exhausted 弹窗 aria-label / 角色正确
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** balance=0 触发 credits_exhausted 弹窗
- **操作步骤:** 1) 通过开发者工具/无障碍树检查弹窗 DOM
- **预期结果:** 弹窗具有 role="dialog" 或 role="alertdialog"；含 aria-modal="true"；含 aria-label 或 aria-labelledby；CTA 按钮有可访问名

**TC-PRD-CDP-024**: 错误猜测 — 重置日期占位符未被替换（{resetDate} 字符串）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 触发 credits_exhausted 弹窗或打开 Credit Balance 模态
- **操作步骤:** 1) 读取弹窗/模态文本
- **预期结果:** 文本中不应出现字面字符串 "{resetDate}" 或 "{date}"；应被替换为有效日期格式

**TC-PRD-CDP-025**: 错误猜测 — Esc 键关闭模态
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Credit Balance 模态已打开
- **操作步骤:** 1) 按下 Esc 键
- **预期结果:** 模态关闭

**TC-PRD-CDP-026**: 错误猜测 — 点击徽章短时间内多次 / 双击不应打开多重模态
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Credit 徽章可见
- **操作步骤:** 1) 在 200ms 内连续点击徽章 2-3 次
- **预期结果:** 仅出现 1 个 Credit Balance 模态，不会叠加多个对话框

**TC-PRD-CDP-027**: 错误猜测 — 当前语言为 en 时，文案使用英文版（不出现中文混杂）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 浏览器/用户语言为英文（en）
- **操作步骤:** 1) 触发 credits_exhausted 弹窗 2) 打开 Credit Balance 模态
- **预期结果:** 弹窗文案严格为 "Your credits have been used up this month. Credits will reset on {resetDate}."；CTA 为 "Upgrade for more credits"；模态标题 "Credit Balance"；副标题 "View your usage and manage credits."

**TC-PRD-CDP-028**: 错误猜测 — 交易表为空时（首月新订阅）展示空状态而非崩溃
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 全新订阅用户，无任何历史交易（仅首次充值记录）
- **操作步骤:** 1) 打开 Credit Balance 模态
- **预期结果:** 模态正常打开；交易表至少展示首次充值记录或空状态提示，不出现 JS 错误

---

## 可追溯性矩阵

| TC ID | 关联 AC | 设计方法 | 优先级 |
|-------|--------|---------|--------|
| TC-PRD-CDP-001 | AC-010-1 | 等价类划分 | P0 |
| TC-PRD-CDP-002 | AC-010-2 | 等价类划分 | P1 |
| TC-PRD-CDP-003 | AC-007-1 | 等价类划分 | P0 |
| TC-PRD-CDP-004 | AC-007-7 | 等价类划分 | P1 |
| TC-PRD-CDP-005 | AC-010-9 | 边界值分析 | P1 |
| TC-PRD-CDP-006 | AC-010-9 | 边界值分析 | P1 |
| TC-PRD-CDP-007 | AC-007-1 | 边界值分析 | P1 |
| TC-PRD-CDP-008 | AC-007-1 | 边界值分析 | P0 |
| TC-PRD-CDP-009 | AC-007-1 (反例) | 因果图 | P0 |
| TC-PRD-CDP-010 | AC-007-2/3/4 | 因果图 | P0 |
| TC-PRD-CDP-011 | AC-007-8 | 因果图 | P1 |
| TC-PRD-CDP-012 | AC-010-3/4 | 状态迁移 | P0 |
| TC-PRD-CDP-013 | AC-010-6/8 | 状态迁移 | P1 |
| TC-PRD-CDP-014 | AC-010-8 | 状态迁移 | P2 |
| TC-PRD-CDP-015 | AC-010-7 | 状态迁移 | P0 |
| TC-PRD-CDP-016 | AC-007-5 | 状态迁移 | P1 |
| TC-PRD-CDP-017 | AC-007-3/4 | 状态迁移 | P0 |
| TC-PRD-CDP-018 | AC-010-3/4/5/6 | 场景法 | P0 |
| TC-PRD-CDP-019 | AC-010-10 | 场景法 | P0 |
| TC-PRD-CDP-020 | AC-007-1/2/3/4/6 | 场景法 | P0 |
| TC-PRD-CDP-021 | AC-010-2 | 场景法 | P1 |
| TC-PRD-CDP-022 | AC-010-12 | 错误猜测 | P2 |
| TC-PRD-CDP-023 | AC-007-9 | 错误猜测 | P2 |
| TC-PRD-CDP-024 | AC-007-6 | 错误猜测 | P1 |
| TC-PRD-CDP-025 | AC-010-8 | 错误猜测 | P2 |
| TC-PRD-CDP-026 | AC-010-3 | 错误猜测 | P2 |
| TC-PRD-CDP-027 | AC-007-2 / AC-010-11 | 错误猜测 | P1 |
| TC-PRD-CDP-028 | AC-010-5 | 错误猜测 | P2 |

