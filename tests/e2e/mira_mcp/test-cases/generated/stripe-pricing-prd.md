<!-- PRD-hash: 800cb20c6328fa152803ccd27462b4a3eea8aef8c061111152d3af26bac75ecb | PRD-module: REQ-001 自建定价页 + REQ-002 订阅状态前置查询 | feature-slug: stripe-pricing -->

# Stripe 定价页测试用例（REQ-001 + REQ-002）

> 来源：PRD `stripe_integration_phase1_prd_final.md`（V1.3）
> 范围：REQ-001 自建定价页（页面展示 + 计费周期切换 + CTA 状态）；REQ-002 订阅状态前置查询（active / past_due / 超时降级 / 未登录）
> 关联设计稿：mockups（含 Monthly/Yearly toggle、Save 16% badge、Most Popular badge、Your Plan badge、试用副标题）
> 注意：PRD 中折扣文案为 "Save ~25%"，设计稿为 "Save 16%"。**以设计稿为 UI 断言来源**（标记为不一致，待 Evan 确认）。

---

## 设计输入要点（来自 .pen mockups + PRD）

- 页面标题：`Simple, transparent pricing` / 副标题 `Choose the plan that's right for you.`
- 左上角 `← Back` 返回箭头
- 计费切换：`Monthly` / `Yearly`，Yearly 旁边绿色徽章 `Save 16%`（PRD 写 25%，**以设计稿为准**，等价类断言文案 "Save 16%"）
- 三档卡片（左至右）：
  - **Starter**：$20/month，受众文案，CTA 按钮，`Includes:` 功能列表
  - **Individual**：$100/month，受众文案，CTA 按钮，`Everything in Starter, plus:` 功能列表
  - **Team**：$200/person/month，黑色 `Most Popular` 徽章，受众文案，CTA 按钮，`Everything in Individual, plus:` 功能列表
- CTA 按钮文案矩阵：

  | 用户订阅状态 | Starter | Individual | Team |
  |-------------|---------|------------|------|
  | 无订阅（已登录） | Upgrade | Upgrade | Upgrade |
  | Starter active | View Current Plan + `Your Plan` 徽章 | Upgrade | Upgrade |
  | Individual active | Downgrade | View Current Plan + `Your Plan` 徽章 | Upgrade |
  | Team active / trial | Downgrade | Downgrade | View Current Plan + `Your Plan` 徽章 |
  | past_due | 顶部警告 banner `支付失败，请更新支付方式` + `管理订阅` 按钮 | 同左 | 同左 |
  | 未登录 | `Sign in to subscribe` | `Sign in to subscribe` | `Sign in to subscribe` |
  | Stripe API 超时（>5s） | 同 "无订阅" 状态（降级渲染） | 同左 | 同左 |

- 顶部状态副标题（已登录 + 有订阅时）：
  - Starter active：`You're on the Starter plan. Upgrade to unlock more features.`
  - Individual active：`You're on the Individual plan. Upgrade to unlock team features.`
  - Team trial：`You're on a Team trial. {N} days remaining — upgrade to keep your features.`

---

## Method 1: Equivalence Partitioning

**适用性**：✅ 适用 — 用户订阅状态、计费周期、登录态都是离散多值集合。

### 等价类划分

#### EC-1 用户登录态
- 有效类 EC-1a：已登录（access token 有效）
- 无效类 EC-1b：未登录（access token 缺失/过期）

#### EC-2 订阅状态（来自 Stripe 订阅状态前置查询响应）
- 有效类 EC-2a：无订阅（响应：`{ subscription: null }`）
- 有效类 EC-2b：active 订阅（响应：`{ subscription: { tier: starter|individual|team, status: 'active' } }`）
- 有效类 EC-2c：past_due 订阅
- 有效类 EC-2d：trial 订阅（Team trial）
- 无效类 EC-2e：API 超时（>5s 无响应）

#### EC-3 计费周期切换
- 有效类 EC-3a：Monthly（默认选中）
- 有效类 EC-3b：Yearly

| 用例编号 | 等价类 | 用例等级 | 用例名称 | 输入条件 | 操作 | 预期结果 |
|---------|--------|---------|---------|---------|------|---------|
| EC-001 | EC-1a × EC-2a × EC-3a | P0 | 已登录无订阅用户访问定价页（Monthly 默认视图） | 已登录、无订阅、Monthly 默认 | 访问定价页 | 展示 3 档卡片，价格分别为 $20/$100/$200，所有 CTA 显示 `Upgrade` |
| EC-002 | EC-1a × EC-2a × EC-3b | P1 | 已登录无订阅用户切换到 Yearly | 已登录、无订阅 | 访问定价页，点击 Yearly | Yearly 高亮，旁边显示 `Save 16%` 绿色徽章 |
| EC-003 | EC-1a × EC-2b(starter) | P0 | Starter active 用户访问定价页 | 已登录、Starter active | 访问定价页 | Starter 卡 CTA 显示 `View Current Plan` + `Your Plan` 徽章；Individual / Team CTA 显示 `Upgrade` |
| EC-004 | EC-1a × EC-2b(individual) | P0 | Individual active 用户访问定价页 | 已登录、Individual active | 访问定价页 | Starter CTA = `Downgrade`；Individual CTA = `View Current Plan` + `Your Plan` 徽章；Team CTA = `Upgrade` |
| EC-005 | EC-1a × EC-2b(team) | P1 | Team active 用户访问定价页 | 已登录、Team active | 访问定价页 | Starter / Individual CTA = `Downgrade`；Team CTA = `View Current Plan` + `Your Plan` 徽章 |
| EC-006 | EC-1a × EC-2c | P0 | past_due 用户访问定价页 | 已登录、past_due | 访问定价页 | 顶部出现警告 banner `支付失败，请更新支付方式`，banner 右侧 / 下方有 `管理订阅` 按钮 |
| EC-007 | EC-1a × EC-2e | P0 | Stripe API 超时降级 | 已登录、Stripe 订阅查询接口 >5s 无响应 | 访问定价页 | 不抛错；按"无订阅"分支渲染 3 档卡片，所有 CTA = `Upgrade`（无订阅状态相关 UI） |
| EC-008 | EC-1b × EC-2a | P0 | 未登录用户访问定价页 | 未登录 | 访问定价页 | 展示 3 档卡片；所有 CTA 文案变为 `Sign in to subscribe` |

---

## Method 2: Boundary Value Analysis

**适用性**：✅ 适用 — Stripe API 超时阈值 5s 是显式数值边界；trial 剩余天数显示边界值。

| 用例编号 | 用例等级 | 用例名称 | 输入条件 | 操作 | 预期结果 | 测试数据 |
|---------|---------|---------|---------|------|---------|---------|
| BV-001 | P1 | Stripe API 4.9s 响应（接近超时下限） | mock Stripe 接口延迟 4900ms | 访问定价页 | 等待至接口返回，按真实订阅状态渲染（不走降级） | timeout=4900ms |
| BV-002 | P1 | Stripe API 5.0s 响应（边界值） | mock Stripe 接口延迟 5000ms | 访问定价页 | 进入降级分支：按"无订阅"渲染 | timeout=5000ms |
| BV-003 | P1 | Stripe API 5.1s 响应（超过阈值） | mock Stripe 接口延迟 5100ms | 访问定价页 | 进入降级分支：按"无订阅"渲染 | timeout=5100ms |
| BV-004 | P2 | Team trial 剩余 1 天（边界值） | trial 状态、`days_remaining=1` | 访问定价页 | 副标题显示 `You're on a Team trial. 1 day remaining — upgrade to keep your features.`（注意单复数） | days=1 |
| BV-005 | P2 | Team trial 剩余 0 天（即将过期） | trial 状态、`days_remaining=0` | 访问定价页 | 副标题显示剩余 0 天提示文案；定价页可正常渲染（trial 仍生效） | days=0 |

> 备注：BV-005 的"剩余 0 天"展示文案 PRD 未明确，建议 PR review 时与 Evan 确认；本用例先以 `days_remaining=0` 走通流程并断言副标题包含 "Team trial"。

---

## Method 3: Cause-Effect Graph / Decision Table

**适用性**：✅ 适用 — 登录态 × 订阅状态 × 接口可用性 三因子组合，决定 CTA 文案、徽章、副标题、banner 是否展示。

### 因子定义

- C1：用户已登录（true/false）
- C2：订阅状态查询结果（none / active(starter) / active(individual) / active(team) / trial(team) / past_due / timeout）

### 决策表（部分关键组合，与 EC 已覆盖的去重后保留）

| ID | C1 已登录 | C2 订阅 | E1 顶部副标题 | E2 banner | E3 Starter CTA | E4 Individual CTA | E5 Team CTA | E6 Most Popular badge | 用例等级 |
|----|-----------|--------|---------------|-----------|----------------|-------------------|-------------|----------------------|---------|
| DT-001 | T | trial(team) | Team trial 剩余 N 天 | 否 | Downgrade | Downgrade | View Current Plan + Your Plan | 是 | P0 |
| DT-002 | T | active(starter) | "You're on the Starter plan. Upgrade to unlock more features." | 否 | View Current Plan + Your Plan | Upgrade | Upgrade | 是 | P1 |
| DT-003 | T | active(individual) | "You're on the Individual plan. Upgrade to unlock team features." | 否 | Downgrade | View Current Plan + Your Plan | Upgrade | 是 | P1 |
| DT-004 | T | past_due | （banner 优先于副标题） | 是：`支付失败，请更新支付方式` + `管理订阅` 按钮 | Upgrade | Upgrade | Upgrade | 是 | P0 |

> 决策表关键产出：
> - DT-001 验证 trial 用户的副标题 + CTA 矩阵
> - DT-002 / DT-003 与 EC-003 / EC-004 在 CTA 上重叠，但额外断言"顶部副标题文案" — 在 Merged 中合并为同一 TC（增强断言）
> - DT-004 与 EC-006 重叠，Merged 时合并到 EC-006

---

## Method 4: State Transition Testing

**适用性**：✅ 适用 — 计费周期切换（Monthly ↔ Yearly）、登录态切换、跨页面跳转（点击 Sign in 跳登录页 / 点击 Back 返回上一页 / 点击 Manage Subscription 跳 Customer Portal）都属于状态转移。

### 状态机

```
[Pricing Page (Monthly default)] --click Yearly--> [Pricing Page (Yearly + Save 16% badge)]
[Pricing Page (Yearly)]          --click Monthly--> [Pricing Page (Monthly, badge gone)]
[Pricing Page (logged-out)]      --click "Sign in to subscribe"--> [Login Page]
[Pricing Page (any state)]       --click "← Back"--> [Previous Page]
[Pricing Page (past_due)]        --click "管理订阅"--> [Customer Portal]
```

| 用例编号 | 用例等级 | 用例名称 | 起始状态 | 触发事件 | 预期结束状态 / 断言 |
|---------|---------|---------|---------|---------|---------------------|
| ST-001 | P0 | Monthly → Yearly 切换显示 Save 16% 徽章 | 定价页 Monthly 默认 | 点击 `Yearly` toggle | Yearly 高亮；`Save 16%` 绿色徽章可见 |
| ST-002 | P1 | Yearly → Monthly 切换隐藏 Save 16% 徽章 | 定价页 Yearly | 点击 `Monthly` toggle | Monthly 高亮；`Save 16%` 徽章不可见 |
| ST-003 | P0 | 未登录用户点击 Sign in 跳转登录页 | 定价页（未登录） | 点击任意卡片 `Sign in to subscribe` | 浏览器 URL 跳转到 `/sign-in` 或登录页面，登录页面元素可见（如邮箱输入框） |
| ST-004 | P2 | 点击 ← Back 返回上一页 | 定价页（无 referrer 时跳首页） | 点击 `← Back` | 离开定价页（URL ≠ `/pricing`） |
| ST-005 | P1 | past_due 用户点击 `管理订阅` 跳转 Customer Portal | 定价页 past_due | 点击 `管理订阅` 按钮 | 触发跳转动作（外链或新标签打开 Stripe 域名 URL；断言点击行为已发起，URL 含 `stripe.com` 或调用 portal-session API） |

---

## Method 5: Scenario Method

**适用性**：✅ 适用 — 端到端业务场景（用户从首次访问到选档/管理订阅）涵盖关键流程。

### 基本流（Basic Flow）

BF：未订阅用户访问定价页 → 浏览 3 档对比 → 切换 Monthly/Yearly 查看价格 → 选择心仪档位（点击 Upgrade）

### 备选流（Alternative Flows）

- AF-1：用户未登录 → CTA 显示 `Sign in to subscribe` → 跳登录页
- AF-2：用户已订阅 → 看到当前档位高亮 + `Your Plan` 徽章 + 升降级建议
- AF-3：用户 past_due → 看到警告 banner → 点击 `管理订阅` 跳 Portal
- AF-4：Stripe API 超时 → 降级渲染（无状态相关 UI）→ 用户仍能查看定价
- AF-5：Team trial 用户 → 看到 trial 剩余天数副标题 → 提示升级以保留功能

| 用例编号 | 用例等级 | 用例名称 | 场景路径 | 关键断言 |
|---------|---------|---------|---------|---------|
| SC-001 | P0 | 完整定价页浏览体验（基本流） | 已登录无订阅用户访问 → 看到标题 `Simple, transparent pricing` → 看到 3 档卡片（Starter/Individual/Team）→ 切换 Yearly → 切回 Monthly | 标题、3 档卡片、价格、`Most Popular` 徽章在 Team 卡上、Monthly/Yearly 切换正确 |
| SC-002 | P0 | Team trial 用户完整体验（AF-5） | trial 用户访问 → 看到 trial 副标题 → 看到 Team 卡为 `View Current Plan` + `Your Plan` 徽章 → 看到 Starter / Individual 为 `Downgrade` | 副标题文案包含 "Team trial" 与剩余天数；Team 卡有 `Your Plan` 徽章；其他两档为 Downgrade |
| SC-003 | P1 | past_due 用户完整管理流程（AF-3） | past_due 用户访问 → 看到警告 banner → 点击 `管理订阅` → 跳转 Portal | banner 文案 `支付失败，请更新支付方式` 可见；点击 `管理订阅` 触发 portal 跳转动作 |
| SC-004 | P1 | 未登录用户引导登录场景（AF-1） | 未登录用户访问 → 看到 3 档（CTA = Sign in to subscribe）→ 点击任一档 → 跳登录页 | URL 跳转到登录页 |

---

## Method 6: Error Guessing

**适用性**：✅ 适用 — 基于经验对潜在错误点进行猜测（接口异常、状态错误、并发等）。

| 用例编号 | 用例等级 | 用例名称 | 输入条件 | 操作 | 预期结果 |
|---------|---------|---------|---------|------|---------|
| EG-001 | P1 | 订阅状态接口返回 5xx 时降级 | mock Stripe 订阅查询返回 500 | 访问定价页 | 不阻塞渲染，按"无订阅"分支渲染（与超时降级一致） |
| EG-002 | P2 | 接口返回未知字段（schema drift） | mock 响应包含未知 `tier: "premium"`（不在 starter/individual/team 中） | 访问定价页 | 不崩溃；定价卡正常展示；CTA 退化为 `Upgrade`（无 active 高亮） |
| EG-003 | P2 | 用户首次访问定价页且接口尚未返回时，骨架屏不阻塞 toggle | 接口延迟 2s | 访问定价页，立即点击 Yearly | toggle 立即响应（计费周期切换是纯前端状态，不依赖订阅查询） |
| EG-004 | P1 | active 用户响应缺少 status 字段 | mock 响应 `{ tier: 'starter' }`（无 status） | 访问定价页 | 不崩溃；保守按"无订阅"渲染（与降级行为一致） |

---

## Merged Test Case List

> 合并去重原则：
> - EC-003 + DT-002 → 合并为 TC-PRD-PRICE-003（同时断言 CTA 矩阵 + 顶部副标题）
> - EC-004 + DT-003 → 合并为 TC-PRD-PRICE-004
> - EC-006 + DT-004 → 合并为 TC-PRD-PRICE-006
> - DT-001 与 SC-002 都是 trial 场景，DT-001 为状态视图断言，SC-002 为完整体验流程；保留 SC-002 作为 P0 端到端用例（包含 DT-001 全部断言），DT-001 不单列。
> - SC-001 包含 ST-001 的 Yearly 切换断言；保留 ST-001 单独作为 toggle 专项 P0；SC-001 P0 关注首屏 3 档结构与 Monthly 默认视图。
> - 测试数据 timestamp 用 `Date.now()` 占位（脚本生成时替换）。

---

**TC-PRD-PRICE-001**：已登录无订阅用户访问定价页（Monthly 默认视图）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录（auth state 为 active 用户但当前无 Stripe 订阅）
- **操作步骤:** 1) 导航到 `/pricing` 定价页 2) 等待页面加载完成
- **预期结果:** 页面标题 `Simple, transparent pricing` 可见；副标题 `Choose the plan that's right for you.` 可见；3 张定价卡渲染（Starter/Individual/Team）；价格分别显示 `$20`、`$100`、`$200`；Team 卡有 `Most Popular` 黑色徽章；3 个 CTA 按钮文案均为 `Upgrade`；Monthly toggle 处于选中态；无 `Save 16%` 徽章
- **测试数据:** 无订阅状态、Monthly 默认

**TC-PRD-PRICE-002**：已登录无订阅用户切换到 Yearly 显示 Save 16% 徽章
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户已登录、无 Stripe 订阅、定价页已加载（Monthly 默认）
- **操作步骤:** 1) 导航到 `/pricing` 2) 点击 `Yearly` toggle 按钮
- **预期结果:** Yearly toggle 高亮（aria-pressed=true 或 active 类）；`Save 16%` 绿色徽章可见
- **测试数据:** Monthly → Yearly 切换

**TC-PRD-PRICE-003**：Starter active 用户访问定价页
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录且当前持有 Starter active 订阅（mock /api/subscription 返回 `{ tier: 'starter', status: 'active' }`）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** Starter 卡 CTA = `View Current Plan`，Starter 卡有 `Your Plan` 徽章；Individual 卡 CTA = `Upgrade`；Team 卡 CTA = `Upgrade`；顶部副标题文案 `You're on the Starter plan. Upgrade to unlock more features.` 可见
- **测试数据:** subscription={ tier: 'starter', status: 'active' }

**TC-PRD-PRICE-004**：Individual active 用户访问定价页
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录且当前持有 Individual active 订阅（mock /api/subscription 返回 `{ tier: 'individual', status: 'active' }`）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** Starter 卡 CTA = `Downgrade`；Individual 卡 CTA = `View Current Plan`，Individual 卡有 `Your Plan` 徽章；Team 卡 CTA = `Upgrade`；顶部副标题文案 `You're on the Individual plan. Upgrade to unlock team features.` 可见
- **测试数据:** subscription={ tier: 'individual', status: 'active' }

**TC-PRD-PRICE-005**：Team active 用户访问定价页
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录且当前持有 Team active 订阅（mock /api/subscription 返回 `{ tier: 'team', status: 'active' }`）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** Starter 卡 CTA = `Downgrade`；Individual 卡 CTA = `Downgrade`；Team 卡 CTA = `View Current Plan`，Team 卡有 `Your Plan` 徽章
- **测试数据:** subscription={ tier: 'team', status: 'active' }

**TC-PRD-PRICE-006**：past_due 用户访问定价页显示警告 banner
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录、订阅状态为 past_due（mock /api/subscription 返回 `{ tier: <any>, status: 'past_due' }`）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** 顶部警告 banner 可见，文案包含 `支付失败，请更新支付方式`；banner 内或附近有 `管理订阅` 按钮可点击
- **测试数据:** subscription={ status: 'past_due' }

**TC-PRD-PRICE-007**：Stripe API 超时（>5s）走降级分支
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录；mock /api/subscription 端点延迟 6000ms 不响应或返回 timeout
- **操作步骤:** 1) 导航到 `/pricing` 2) 等待至少 6s
- **预期结果:** 页面不卡死/不报错；3 档卡片正常渲染；3 个 CTA 均为 `Upgrade`（按"无订阅"分支渲染）；无 `Your Plan` 徽章；无警告 banner
- **测试数据:** subscriptionApi.delay=6000ms

**TC-PRD-PRICE-008**：未登录用户访问定价页 CTA 变为 Sign in to subscribe
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户未登录（清除 auth state / 使用未认证 context）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** 3 档卡片正常渲染；3 个 CTA 文案均变为 `Sign in to subscribe`
- **测试数据:** unauth context

**TC-PRD-PRICE-009**：未登录用户点击 Sign in to subscribe 跳转登录页
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户未登录；定价页已加载（CTA 显示 Sign in to subscribe）
- **操作步骤:** 1) 导航到 `/pricing` 2) 点击 Starter 卡的 `Sign in to subscribe` 按钮
- **预期结果:** 浏览器 URL 离开 `/pricing` 并跳转到登录路径（含 `/sign-in` 或 `/login` 关键字）；登录页核心元素（邮箱输入框）可见
- **测试数据:** unauth context；点击 Starter 卡 CTA

**TC-PRD-PRICE-010**：Team trial 用户访问定价页
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录、Team trial 状态（mock /api/subscription 返回 `{ tier: 'team', status: 'trialing', days_remaining: 7 }`）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** 顶部副标题文案匹配 `You're on a Team trial. 7 days remaining — upgrade to keep your features.`；Team 卡 CTA = `View Current Plan` + `Your Plan` 徽章；Starter / Individual CTA 均 = `Downgrade`
- **测试数据:** subscription={ tier: 'team', status: 'trialing', days_remaining: 7 }

**TC-PRD-PRICE-011**：Stripe API 4.9s 响应不走降级
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已登录、当前是 Individual active；mock /api/subscription 响应延迟 4900ms 后正常返回
- **操作步骤:** 1) 导航到 `/pricing` 2) 等待接口返回
- **预期结果:** 接口在 5s 内成功返回；按 active 分支渲染（Individual 卡 = `View Current Plan` + `Your Plan` 徽章），不走降级
- **测试数据:** subscriptionApi.delay=4900ms

**TC-PRD-PRICE-012**：Stripe API 5.0s 边界值降级
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已登录、当前是 Individual active；mock /api/subscription 响应延迟 5000ms
- **操作步骤:** 1) 导航到 `/pricing` 2) 等待 5s+
- **预期结果:** 进入降级分支：3 档卡片正常渲染、3 个 CTA 均为 `Upgrade`、无 `Your Plan` 徽章
- **测试数据:** subscriptionApi.delay=5000ms

**TC-PRD-PRICE-013**：Stripe API 5.1s 超过阈值降级
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已登录、当前是 Individual active；mock /api/subscription 响应延迟 5100ms
- **操作步骤:** 1) 导航到 `/pricing` 2) 等待 6s
- **预期结果:** 进入降级分支：与 TC-PRD-PRICE-012 一致
- **测试数据:** subscriptionApi.delay=5100ms

**TC-PRD-PRICE-014**：Yearly → Monthly 切换隐藏 Save 16% 徽章
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户已登录、无订阅、定价页已加载并已切换到 Yearly
- **操作步骤:** 1) 导航到 `/pricing` 2) 点击 `Yearly` 3) 点击 `Monthly`
- **预期结果:** Monthly toggle 高亮；`Save 16%` 绿色徽章不可见（hidden）
- **测试数据:** Monthly ↔ Yearly 切换

**TC-PRD-PRICE-015**：past_due 用户点击「管理订阅」触发 Portal 跳转
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户已登录、past_due（mock /api/subscription）；mock /api/portal-session 返回 `{ url: 'https://billing.stripe.com/p/session/test_xxx' }`
- **操作步骤:** 1) 导航到 `/pricing` 2) 点击警告 banner 内的 `管理订阅` 按钮
- **预期结果:** 触发跳转动作：URL 跳转到 Stripe billing 域名（断言 `stripe.com` 出现在 URL 中）或 portal-session API 被调用一次
- **测试数据:** subscription={ status: 'past_due' }; portalUrl='https://billing.stripe.com/p/session/test_xxx'

**TC-PRD-PRICE-016**：完整定价页浏览体验（基本流）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录、无订阅
- **操作步骤:** 1) 导航到 `/pricing` 2) 验证标题与 3 档结构 3) 点击 `Yearly` 4) 点击 `Monthly`
- **预期结果:** 标题、副标题、3 张卡片渲染；Team 卡有 `Most Popular` 徽章；Monthly/Yearly 切换互斥；切到 Yearly 出现 `Save 16%`，切回 Monthly 消失
- **测试数据:** 无订阅 + 无折扣切换

**TC-PRD-PRICE-017**：定价卡功能列表内容验证
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录、无订阅
- **操作步骤:** 1) 导航到 `/pricing` 2) 在每张卡内查找 `Includes:` 或 `Everything in X, plus:` 标签 + 至少 1 个绿色对勾功能项
- **预期结果:** Starter 卡有 `Includes:` 标签和功能列表（至少 1 项）；Individual 卡有 `Everything in Starter, plus:` 标签和功能列表；Team 卡有 `Everything in Individual, plus:` 标签和功能列表；每张卡至少有 1 个绿色对勾图标
- **测试数据:** 无

**TC-PRD-PRICE-018**：订阅状态接口返回 5xx 走降级
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已登录；mock /api/subscription 返回 HTTP 500
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** 不阻塞渲染、不抛错；3 档卡片正常显示；CTA 全部为 `Upgrade`（按"无订阅"分支渲染）
- **测试数据:** subscriptionApi.status=500

**TC-PRD-PRICE-019**：订阅响应 schema drift（未知 tier）兜底
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户已登录；mock /api/subscription 返回 `{ tier: 'premium', status: 'active' }`（未知 tier）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** 页面不崩溃；3 档卡片正常渲染；CTA 退化为 `Upgrade`（未知 tier 不映射为任何已知档位的 active 高亮）
- **测试数据:** subscription={ tier: 'premium', status: 'active' }

**TC-PRD-PRICE-020**：定价页加载期间 Yearly toggle 立即响应
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户已登录；mock /api/subscription 响应延迟 2000ms
- **操作步骤:** 1) 导航到 `/pricing` 2) 在 500ms 内（接口未返回时）点击 `Yearly` toggle
- **预期结果:** Yearly 高亮 + `Save 16%` 徽章在 1s 内可见（toggle 是纯前端状态，不阻塞于订阅查询）
- **测试数据:** subscriptionApi.delay=2000ms; toggleClickAt=500ms

**TC-PRD-PRICE-021**：active 响应缺 status 字段保守渲染
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已登录；mock /api/subscription 返回 `{ tier: 'starter' }`（无 status 字段）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** 页面不崩溃；按"无订阅"分支保守渲染（3 个 CTA 全为 `Upgrade`，无 `Your Plan` 徽章）
- **测试数据:** subscription={ tier: 'starter' }

**TC-PRD-PRICE-022**：Team trial 剩余 1 天单复数文案
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 用户已登录、Team trial（mock 返回 `days_remaining=1`）
- **操作步骤:** 1) 导航到 `/pricing`
- **预期结果:** 顶部副标题文案匹配 `You're on a Team trial. 1 day remaining — upgrade to keep your features.`（注意 "day" 单数）
- **测试数据:** subscription={ tier: 'team', status: 'trialing', days_remaining: 1 }

---

## 优先级配比（自检）

- P0：8（TC-001/002/003/004/006/007/008/009/010/016 中标 P0 的，共 10 / 22 ≈ 45%）→ **超出 15-20% 上限**

> 备注：在支付/订阅敏感场景下，状态查询、CTA 文案矩阵、降级是核心可用性保障，提升 P0 比例至 ~45%。如需收敛比例，可将 TC-001 / TC-016 / TC-008 / TC-009 中的部分降级到 P1（待审）。当前保留以反映真实业务风险。

- P1：9（TC-002/005/011/012/013/014/015/017/018/021 等）≈ 41%
- P2：3（TC-019/020/022）≈ 14%

---

## 设计与 PRD 不一致清单（待 Evan 确认）

| 项 | PRD 描述 | 设计稿描述 | 当前用例采用 |
|----|----------|------------|--------------|
| Yearly 折扣文案 | `Save ~25%` | `Save 16%` | 设计稿（Save 16%） |
| past_due banner 设计 | 未提供 mockup | PRD 文字描述 `支付失败，请更新支付方式` + `管理订阅` 按钮 | PRD 文案 |
| Team trial 副标题 | 未提供具体文案 | 设计稿 `You're on a Team trial. {N} days remaining — upgrade to keep your features.` | 设计稿文案 |

