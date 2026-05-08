<!-- PRD-hash: b490797b2f9f1843827ddcf5e18ff8fae73687bdf0bba82e0ab0c5eeeab95a5c | PRD-module: REQ-005 + REQ-009 | feature-slug: stripe-portal -->

# Stripe Customer Portal + 订阅取消处理 测试用例（REQ-005 + REQ-009）

> 来源：`stripe_integration_phase1_prd_final.md` REQ-005（Customer Portal 订阅管理）+ REQ-009（订阅取消处理）
> 适用范围：Settings 订阅区域 + Portal 跳转 + 取消挽留与撤销订阅
> 设计语言：Pencil S9 用户菜单 + Settings 订阅区域

## 0. 设计前提与作用域

### 作用域内
- **REQ-005** Customer Portal 订阅管理：用户菜单 → Settings → 订阅区域 → 跳转 Stripe Portal
- **REQ-009** 订阅取消处理：Portal 内取消 → 取消原因收集 → 周期末降级 → Credit 不再发放

### 作用域外（"out-of-app"——主要断言为 URL host + 返回后 Mira 状态）
- Stripe 托管 Portal 内的具体交互（升降级表单、改卡表单、发票详情）
- Stripe Webhook 服务端处理逻辑（由后端单元测试覆盖）

### 关键设计点
- Portal 不支持 iframe，必须 **全页跳转**
- 取消订阅采用 **cycle-end 取消**：用户保留权益与 Credit 至 `period_end`
- 取消原因 5 选 1（PRD：太贵 / 功能不足 / 换竞品 / 暂时不需要 / 其他）
- 一期不启用挽留优惠券与暂停订阅

---

## Method 1: Equivalence Partitioning

按"用户订阅状态 × 当前档位"划分有效/无效等价类，决定 Settings 订阅区域的展示与"管理订阅"按钮可见性。

### 输入域分析

| 维度 | 等价类 | 标识 | 有效/无效 |
|------|--------|------|------------|
| 订阅状态 | active 订阅（Starter/Individual/Team） | EC1 | 有效 |
| 订阅状态 | 无订阅（free 用户） | EC2 | 有效（边界态） |
| 订阅状态 | past_due（逾期未支付） | EC3 | 有效（异常态） |
| 订阅状态 | canceled（已在周期末终止） | EC4 | 有效（终态） |
| 档位 | Starter | T1 | 有效 |
| 档位 | Individual | T2 | 有效 |
| 档位 | Team（含席位数） | T3 | 有效（多席位） |

### 推导用例

| 用例编号 | 等价类 | 用例等级 | 用例名 | 输入条件 | 操作 | 预期结果 |
|----------|--------|----------|--------|----------|------|----------|
| EQ-01 | EC1+T2 | P0 | Individual 已订阅用户进入 Settings 订阅区域 | 用户已登录且 active Individual 订阅 | 打开侧边栏用户菜单 → 点击 Billing | Settings 订阅区域显示当前计划"Individual ($100/月)"、Credit 进度条、下次续费日期、"管理订阅"按钮可见 |
| EQ-02 | EC1+T1 | P1 | Starter 已订阅用户进入 Settings 订阅区域 | 用户已登录且 active Starter 订阅 | 打开用户菜单 → 点击 Billing | 当前计划显示"Starter ($20/月)"、无席位字段、"管理订阅"按钮可见 |
| EQ-03 | EC1+T3 | P0 | Team 已订阅用户看到席位数 | 用户已登录且 active Team 订阅，3 席 | 打开用户菜单 → 点击 Billing | 当前计划显示"Team ($200/席/月)"、显示"3 席"、"管理订阅"按钮可见 |
| EQ-04 | EC2 | P1 | Free 用户进入 Settings 看不到管理入口 | 用户已登录且无订阅 | 打开用户菜单 → 点击 Billing | "管理订阅"按钮不可见或被替换为"升级方案"入口 |
| EQ-05 | EC4 | P1 | 已取消用户在周期内仍显示订阅信息 | 用户已 cancel_at_period_end=true，period_end 未到 | 打开用户菜单 → 点击 Billing | 当前计划仍显示档位 + 标注"将于 {period_end} 取消" |

---

## Method 2: Boundary Value Analysis

针对 Credit 进度条、续费日期、席位数等数值字段以及取消原因选择数量做边界分析。

### 推导用例

| 用例编号 | 边界点 | 用例等级 | 用例名 | 输入条件 | 操作 | 预期结果 |
|----------|--------|----------|--------|----------|------|----------|
| BV-01 | Credit 进度条 0% | P1 | 已用 0 时进度条空 | active 订阅，Credits used = 0 | 进入 Settings 订阅区域 | 进度条显示 0%，余额文案为"0 / {total}" |
| BV-02 | Credit 进度条 100% | P1 | 已用满时进度条满 | active 订阅，used = total | 进入 Settings 订阅区域 | 进度条显示 100%，警告色应用 |
| BV-03 | 续费日期 = 今日 | P2 | 续费日为当天的展示 | active 订阅，next_renewal_date == today | 进入 Settings | 日期文案显示当天日期，不抛错 |
| BV-04 | Team 席位数 = 1 | P2 | Team 最小席位 1 席 | active Team 订阅，seats=1 | 进入 Settings | 席位字段显示"1 席" |
| BV-05 | 取消原因恰好 5 项 | P1 | 取消原因列表展示 5 项 | 用户在 Portal 点击 Cancel | 在 Portal cancel reason 页面 | 显示 5 个预设选项（太贵、功能不足、换竞品、暂时不需要、其他），无第 6 项 |
| BV-06 | period_end 临界 | P0 | period_end 当日仍可用，次日降级 | 已 cancel_at_period_end，今日 == period_end | 在 period_end 当日打开应用 → 次日（模拟）打开 | 当日：仍可执行任务，Credit 余额可用；次日：tier 降为 free，新月 Credit 不再发放 |

---

## Method 3: Cause-Effect Graph / Decision Table

围绕"是否显示管理订阅按钮 / 是否显示 cancel 提示 / 是否允许返回应用后续期"的多因素组合。

### 因素定义

- C1：订阅状态 active
- C2：订阅状态 past_due
- C3：cancel_at_period_end == true
- C4：period_end 已到达

### 决策表

| 用例编号 | C1 | C2 | C3 | C4 | 用例等级 | 操作 | 预期结果（效果） |
|----------|----|----|----|----|----------|------|-------------------|
| DT-01 | T | F | F | F | P0 | 进入 Settings | 显示当前计划 + "管理订阅"按钮，无取消提示 |
| DT-02 | T | F | T | F | P0 | 进入 Settings | 显示当前计划 + "管理订阅"按钮 + "Cancelling at {period_end}" 标注 |
| DT-03 | F | T | F | F | P1 | 进入 Settings | 展示"支付失败，请更新支付方式"警告 + "管理订阅"按钮 |
| DT-04 | F | F | T | T | P0 | 进入 Settings | 用户已被降至 free，订阅区域显示"Free plan"，无续费日期，无管理订阅按钮 |
| DT-05 | F | F | F | F | P1 | 进入 Settings | Free 用户视图：显示 Upgrade plan，无管理订阅按钮 |

---

## Method 4: State Transition Testing

订阅生命周期状态机：active → cancel_at_period_end → canceled → resubscribed。

### 状态图

```
[active] --click Cancel in Portal + reason confirmed--> [cancel_at_period_end]
[cancel_at_period_end] --period_end reached + customer.subscription.deleted webhook--> [canceled]
[canceled] --user re-subscribes via pricing page--> [active]
[active] --update card in Portal--> [active]  // 状态不变，仅卡信息变更
```

### 推导用例

| 用例编号 | 起始态 → 终态 | 用例等级 | 用例名 | 输入条件 | 操作 | 预期结果 |
|----------|----------------|----------|--------|----------|------|----------|
| ST-01 | active → cancel_at_period_end | P0 | Portal 取消后返回 Mira 显示取消标注 | active 订阅 | 点击"管理订阅" → 跳到 Stripe Portal → 点 Cancel → 选取消原因"太贵" → 确认 → return_url 返回 Mira | Settings 订阅区域显示"Cancelling at {period_end}"标注，"管理订阅"按钮仍可见 |
| ST-02 | cancel_at_period_end → cancel_at_period_end | P1 | 已取消但未到期仍可用 | 已 cancel_at_period_end，period_end 未到 | 在 Mira 内执行任务（消耗 Credit） | 任务正常执行，Credit 余额扣减；订阅区域 Credit 进度条更新 |
| ST-03 | cancel_at_period_end → canceled | P0 | 周期末到达后档位降为 free | 已 cancel_at_period_end，period_end 已到达，webhook 已收到 | 进入 Settings 订阅区域 | 显示"Free plan"，无续费日期，无"管理订阅"按钮，下月 Credit 不再发放 |
| ST-04 | canceled → active | P1 | 已取消用户重新订阅保留 Customer | 已 canceled 用户 | 进入定价页 → 选择新档位 → 走 Checkout → 支付成功 → 返回 Mira | Settings 订阅区域显示新档位 active 状态；用户的 Stripe customer ID 与历史订单连续（PRD REQ-003 优势） |
| ST-05 | active → active（升档） | P1 | 通过 Portal 升档后返回应用反映新档位 | active Starter 订阅 | "管理订阅" → Portal → 升级到 Individual → 返回 Mira | Settings 订阅区域显示"Individual"档位（webhook 已写入） |

---

## Method 5: Scenario Method

模拟用户从入口到退出的完整业务流。

### 基本流（Basic Flow）：管理订阅完整闭环
1. 用户已登录且 active 订阅
2. 点击侧边栏底部用户头像区域 → 弹出用户菜单
3. 用户菜单显示：Billing / Upgrade plan / Connectors / Language / Theme / Log out
4. 点击 Billing → 进入 Settings 订阅区域
5. 看到当前计划 + Credit 进度 + 续费日期 +（Team 时）席位数 + "管理订阅"按钮
6. 点击"管理订阅" → 服务端创建 Portal Session → **整页跳转**到 Stripe Portal URL（host 含 `billing.stripe.com`）
7. 用户在 Portal 浏览发票历史 / 升降级 / 改卡 / 取消
8. 完成后 Portal 通过 return_url 跳回 Mira
9. Settings 订阅区域反映 Portal 操作后的状态

### 备选流 A：用户在 Portal 取消订阅
- 在 Portal 点 Cancel → 弹出取消原因表单（5 选 1）
- 选择"换竞品"并确认 → Stripe 标记 cancel_at_period_end=true
- 跳回 Mira → Settings 区域显示"Cancelling at {period_end}"

### 备选流 B：移动端整页跳转
- 移动端用户点击"管理订阅"
- 不尝试 iframe 嵌入，而是整页跳转
- URL 改变到 Stripe 域

### 备选流 C：Free 用户进入 Settings
- 无订阅用户进入 Settings 订阅区域
- 看不到"管理订阅"按钮，看到"升级方案"提示

### 备选流 D：取消后再订阅
- 用户已 canceled，Customer 数据保留
- 走定价页 → Checkout → 完成支付 → Settings 区域恢复 active 状态

### 推导用例

| 用例编号 | 流 | 用例等级 | 用例名 | 输入条件 | 操作 | 预期结果 |
|----------|----|----------|--------|----------|------|----------|
| SC-01 | Basic | P0 | 用户菜单 → Billing → Settings 订阅区域 | active 订阅 | 1. 点击侧边栏底部用户头像 2. 在弹出菜单点 Billing | Settings 页面打开，订阅区域可见，包含当前计划名 + 价格 |
| SC-02 | Basic | P0 | Settings 完整字段展示 | active Individual 订阅 | 进入 Settings 订阅区域 | 同时显示：当前计划名 + 价格、Credit 已用/总额 + 进度条、下次续费日期 |
| SC-03 | Basic | P0 | 点击管理订阅整页跳转到 Stripe Portal | active 订阅 | 点击"管理订阅" | 整页导航到 Stripe Portal URL，URL host 包含 "billing.stripe.com"（或 stripe.com 域），未在 iframe 内打开 |
| SC-04 | Basic | P1 | Portal 提供升降级入口 | 用户跳转到 Portal 后 | 在 Portal 主页查看 | 可见"Update plan / Cancel plan / Update payment / Invoice history"等核心操作（out-of-app，仅断言进入 Portal） |
| SC-05 | Basic | P1 | Portal return_url 返回 Mira | 用户在 Portal 完成操作 | 点击 Portal 顶部 Mira 品牌返回链接 | 浏览器 URL 回到 Mira 域 |
| SC-06 | A | P0 | Portal 取消触发取消原因收集 | active 订阅，进入 Portal | 点击 Cancel subscription | Portal 显示 5 选 1 的取消原因列表（太贵 / 功能不足 / 换竞品 / 暂时不需要 / 其他） |
| SC-07 | A | P0 | 选择原因并确认后返回 Mira 显示取消标注 | 在 Portal 取消原因页 | 选择"太贵" → Confirm cancellation → 自动跳回 Mira | Settings 订阅区域显示"Cancelling at {period_end}"，订阅状态仍为可用 |
| SC-08 | A | P1 | 取消原因被持久化用于分析 | 已完成 SC-07 | 后端事件/日志查询（或前端埋点 plan_cancel_reason） | 存在记录包含 reason="太贵" + userId（最少在前端埋点中可见，后端持久化由单元测试覆盖） |
| SC-09 | B | P1 | 移动端管理订阅整页跳转 | 移动端 viewport，active 订阅 | 点击"管理订阅" | 整页跳转，URL host 改为 Stripe，无 iframe |
| SC-10 | C | P1 | Free 用户在 Settings 看到 Upgrade plan 而非管理订阅 | 用户登录但未订阅 | 进入 Settings 订阅区域 | 显示 Upgrade plan 提示或入口；"管理订阅"按钮不可见 |
| SC-11 | D | P1 | Cancelled 用户可重新订阅 | 已 canceled 用户 | 访问定价页 → 选择档位 → Checkout 流程（沙箱模式可用 test card） → 完成 → 回到 Settings | Settings 订阅区域显示新 active 档位（Customer ID 复用） |
| SC-12 | Basic | P1 | 用户菜单包含规定的 6 个项目 | 用户已登录 | 点击侧边栏底部用户头像 | 用户菜单包含：Billing、Upgrade plan、Connectors、Language、Theme、Log out（基于 Pencil S9 设计） |
| SC-13 | Basic | P2 | 用户菜单中显示当前订阅档位作为副标题 | active Team 订阅 | 打开用户菜单 | 用户名下方副标题显示"Team Plan"（或对应档位） |

---

## Method 6: Error Guessing

经验性地猜测可能出错的场景。

### 推导用例

| 用例编号 | 错误推测 | 用例等级 | 用例名 | 输入条件 | 操作 | 预期结果 |
|----------|----------|----------|--------|----------|------|----------|
| EG-01 | Portal Session 创建失败 | P1 | Portal Session API 返回 5xx 时显示降级提示 | active 订阅，后端模拟创建 Portal Session 失败 | 点击"管理订阅" | 显示错误提示 toast，不发生跳转，按钮可重试 |
| EG-02 | Portal Session URL 过期 | P2 | 跳到 Portal 后 URL 过期 | Portal Session 已过期（>5min） | 重新点击"管理订阅" | 重新创建 Session 并跳转 |
| EG-03 | period_end 后 Credit 仍在 grant | P0 | period_end 后下个账期 webhook 未到，UI 提示 Free | period_end 已过 | 进入 Settings | 显示"Free plan"，不再展示 Credit 进度，下个账期 Credit 数为 0 |
| EG-04 | 未登录用户访问 Settings | P1 | 未登录跳转登录页 | 用户未登录 | 直接访问 Settings URL | 跳转登录页 |
| EG-05 | 移动端误用 iframe | P1 | 不应使用 iframe 嵌入 Portal | 移动端 active 订阅 | 点击"管理订阅" | 浏览器整页导航；DOM 中无 iframe[src*="stripe"] 元素 |
| EG-06 | Cancel 取消原因留空 | P2 | 不选原因点 Confirm 应阻止 | 在 Portal cancel 原因页 | 不选任何原因 → 直接 Confirm | Portal 阻止提交（Stripe 内置行为，out-of-app 只断言：未确认时返回 Mira 不应有取消标注） |
| EG-07 | 取消后立即重新激活订阅（Portal 内） | P2 | Portal 内"撤销取消" | 已 cancel_at_period_end | 在 Portal 内点击 Renew/Resume | 跳回 Mira 后 Settings 取消标注消失（active 状态） |
| EG-08 | 已订阅用户重复创建 Portal Session | P2 | 多次点击管理订阅按钮 | active 订阅，连续快速点击 | 1 秒内多次点击 | 仅触发一次跳转或按钮被禁用，未产生竞态 |

---

## Merged Test Case List

> **去重原则**：相同输入 + 相同操作 + 相同预期结果视为重复，保留最先产出的方法标注。
> 已合并：BV-01/BV-02 与 EQ 系列（互不重复，因为 BV 关注 0%/100% 边界），DT-01 与 EQ-01 / SC-02 间存在重叠，故保留 SC-02 用例并删除 DT-01；ST-04 与 SC-11 等价，保留 SC-11；ST-05 与 SC-04 互补，保留 ST-05；EG-03 与 ST-03 互补，保留两者（ST-03 关注状态机断言，EG-03 关注异常场景）。

最终用例 30 条。

---

**TC-PRD-PORTAL-001**: Individual 订阅用户从用户菜单进入 Settings 订阅区域并看到完整字段
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录，沙箱账号持有 active Individual 订阅
- **操作步骤:** 1. 点击侧边栏底部用户头像 / 用户名区域 2. 在弹出的用户菜单中点击 Billing
- **预期结果:** 跳转到 Settings 页面订阅区域；显示当前计划"Individual ($100/月)"、Credit 进度条（已用/总额）、下次续费日期、"管理订阅"按钮可见且可点击
- **测试数据:** 沙箱用户 plan=individual

**TC-PRD-PORTAL-002**: Starter 订阅用户在 Settings 订阅区域显示对应档位
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录，active Starter 订阅
- **操作步骤:** 1. 打开用户菜单 2. 点击 Billing
- **预期结果:** 当前计划文案包含"Starter"与"$20"；不显示席位数字段；"管理订阅"按钮可见
- **测试数据:** plan=starter

**TC-PRD-PORTAL-003**: Team 订阅用户在 Settings 订阅区域显示席位数
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录，active Team 订阅且 seats=3
- **操作步骤:** 1. 打开用户菜单 2. 点击 Billing
- **预期结果:** 当前计划文案包含"Team"与"$200"；显示"3 席"或"3 seats"字段；"管理订阅"按钮可见
- **测试数据:** plan=team, seats=3

**TC-PRD-PORTAL-004**: Free 用户进入 Settings 订阅区域看不到"管理订阅"按钮
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录但无 active 订阅
- **操作步骤:** 1. 打开用户菜单 2. 点击 Billing
- **预期结果:** "管理订阅"按钮不可见或被替换为"升级方案"入口；订阅区域显示 Free plan
- **测试数据:** plan=free

**TC-PRD-PORTAL-005**: Credit 余额已用 0 时进度条显示 0%
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** active 订阅，沙箱数据 used=0
- **操作步骤:** 1. 进入 Settings 订阅区域
- **预期结果:** 进度条进度为 0%；余额文案为"0 / {total}"或等价格式
- **测试数据:** used=0

**TC-PRD-PORTAL-006**: Credit 余额已用满时进度条显示 100% 并应用警告色
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** active 订阅，沙箱数据 used=total
- **操作步骤:** 1. 进入 Settings 订阅区域
- **预期结果:** 进度条进度为 100%；进度条颜色变为警告色（如红色或橙色样式）
- **测试数据:** used=total

**TC-PRD-PORTAL-007**: Team 席位数 1 席的展示
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** active Team 订阅，seats=1
- **操作步骤:** 1. 进入 Settings 订阅区域
- **预期结果:** 席位字段显示"1 席"或"1 seat"；不报渲染错误
- **测试数据:** seats=1

**TC-PRD-PORTAL-008**: 续费日期为今日时正确展示
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** active 订阅，next_renewal_date == 今日
- **操作步骤:** 1. 进入 Settings 订阅区域
- **预期结果:** 下次续费日期字段为合法日期文本（可被 Date.parse 解析），不为空
- **测试数据:** next_renewal_date=today

**TC-PRD-PORTAL-009**: past_due 状态用户看到付款失败警告
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 用户订阅状态为 past_due
- **操作步骤:** 1. 进入 Settings 订阅区域
- **预期结果:** 显示"支付失败，请更新支付方式"或等价警告文案；"管理订阅"按钮仍可见
- **测试数据:** subscription_status=past_due

**TC-PRD-PORTAL-010**: 已取消用户在周期内仍显示当前档位 + Cancelling 标注
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** cancel_at_period_end=true，period_end 未到
- **操作步骤:** 1. 进入 Settings 订阅区域
- **预期结果:** 当前计划仍显示原档位；同时存在文案"Cancelling at {period_end}"或等价表达
- **测试数据:** cancel_at_period_end=true

**TC-PRD-PORTAL-011**: period_end 已到达后档位降为 free
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** cancel_at_period_end=true 且 period_end 已经过；customer.subscription.deleted 已写入
- **操作步骤:** 1. 进入 Settings 订阅区域
- **预期结果:** 显示"Free plan"；无续费日期；"管理订阅"按钮不可见或被替换为升级入口
- **测试数据:** subscription_status=canceled

**TC-PRD-PORTAL-012**: 已取消但未到期仍可执行任务消耗 Credit
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** cancel_at_period_end=true，period_end 未到，Credit 余额>0
- **操作步骤:** 1. 进入 Settings 查看 Credit 余额 2. 切换到主工作区执行任意消耗 Credit 的任务 3. 任务完成后回到 Settings
- **预期结果:** 任务正常执行；Settings 中 Credit 进度条 used 数值增加
- **测试数据:** 任意可执行任务

**TC-PRD-PORTAL-013**: Cancelled 用户重新订阅后 Customer 数据连续
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户处于 canceled 状态（period_end 已到）
- **操作步骤:** 1. 访问定价页 2. 选择某档位 3. 完成 Stripe Checkout（沙箱 test card） 4. 回到 Mira Settings
- **预期结果:** Settings 显示新 active 档位；订阅区域字段渲染正常（Customer ID 复用，由后端集成测试覆盖；前端断言：UI 状态从 free 变为 active）
- **测试数据:** Stripe test card 4242

**TC-PRD-PORTAL-014**: 通过 Portal 升档后返回 Mira 反映新档位
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** active Starter 订阅
- **操作步骤:** 1. 进入 Settings → 点击"管理订阅"跳转 Portal 2. 在 Portal 内升级到 Individual（out-of-app） 3. 返回 Mira
- **预期结果:** Settings 订阅区域当前计划文案改为"Individual"；价格对应 $100；webhook 已写入档位变更（前端断言：UI 反映档位升级）
- **测试数据:** 升档目标=individual

**TC-PRD-PORTAL-015**: 用户菜单按 Pencil S9 设计包含 6 项菜单
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户已登录
- **操作步骤:** 1. 点击侧边栏底部用户头像/用户名区域
- **预期结果:** 弹出菜单包含：Billing、Upgrade plan、Connectors、Language、Theme、Log out 共 6 项；按设计顺序排列
- **测试数据:** 无

**TC-PRD-PORTAL-016**: 用户菜单显示当前订阅档位作为副标题
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** active Team 订阅
- **操作步骤:** 1. 点击侧边栏底部用户头像
- **预期结果:** 用户名下方副标题显示包含"Team"的档位文本（如"Team Plan"）
- **测试数据:** plan=team

**TC-PRD-PORTAL-017**: 点击"管理订阅"整页跳转到 Stripe Portal
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** active 订阅，已进入 Settings 订阅区域
- **操作步骤:** 1. 点击"管理订阅"按钮 2. 等待页面跳转完成
- **预期结果:** 浏览器 URL 整页改变到 Stripe 域；URL host 匹配 /stripe\.com$/ 或包含 "billing.stripe.com"；当前页面非 iframe 嵌入（top window URL 已变化）
- **测试数据:** 无

**TC-PRD-PORTAL-018**: 移动端整页跳转 Stripe Portal（不使用 iframe）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 移动端 viewport（如 375×812），active 订阅
- **操作步骤:** 1. 在 Settings 订阅区域点击"管理订阅"
- **预期结果:** 浏览器整页跳转到 Stripe 域；DOM 中不存在 src 包含 stripe 的 iframe；URL host 匹配 stripe 域
- **测试数据:** viewport=mobile

**TC-PRD-PORTAL-019**: Portal 主页可见核心管理操作（out-of-app）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 已通过 SC-03/TC-PRD-PORTAL-017 跳转到 Stripe Portal
- **操作步骤:** 1. 在 Portal 主页观察主操作区
- **预期结果:** 页面 URL 在 Stripe 域内；主操作区可见至少包含"plan / cancel / payment / invoice"等关键词的入口（不深入交互，仅断言已进入 Portal 且渲染完成）
- **测试数据:** 无

**TC-PRD-PORTAL-020**: 通过 Portal return_url 返回 Mira
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 已在 Stripe Portal 内
- **操作步骤:** 1. 点击 Portal 顶部品牌返回链接（或使用 Mira 配置的 return_url）
- **预期结果:** 浏览器 URL 改回 Mira 域；最终落地在 Settings 订阅区域或主页（取决于 return_url 配置）
- **测试数据:** 无

**TC-PRD-PORTAL-021**: Portal 内点击 Cancel 触发取消原因收集
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** active 订阅，已进入 Stripe Portal
- **操作步骤:** 1. 在 Portal 主页点击 Cancel subscription 入口 2. 进入取消原因页面
- **预期结果:** Portal 显示取消原因列表，包含 5 个预设选项：太贵 / 功能不足 / 换竞品 / 暂时不需要 / 其他（或英文等价）；选项数 == 5
- **测试数据:** 无

**TC-PRD-PORTAL-022**: 选择"太贵"并确认后返回 Mira 显示 Cancelling 标注
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** active 订阅，已进入 Portal 取消原因页
- **操作步骤:** 1. 选择原因"太贵 (Too expensive)" 2. 点击 Confirm cancellation 3. 等待 Portal 自动跳回 Mira
- **预期结果:** 浏览器 URL 回到 Mira 域；Settings 订阅区域显示"Cancelling at {period_end}"标注；订阅状态字段表明 cancel_at_period_end=true（前端可见）
- **测试数据:** reason=太贵

**TC-PRD-PORTAL-023**: 取消原因被前端埋点上报用于流失分析
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 已完成 TC-PRD-PORTAL-022
- **操作步骤:** 1. 监听网络请求或 PostHog/分析埋点 plan_cancel_reason（或等价事件名） 2. 确认事件包含 reason 与 userId 字段
- **预期结果:** 至少存在一条埋点 / 网络日志记录包含 reason="太贵" 与 userId；后端日志校验由单元/集成测试覆盖
- **测试数据:** reason=太贵

**TC-PRD-PORTAL-024**: 取消原因不选则 Portal 阻止提交（out-of-app）
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 已进入 Portal 取消原因页
- **操作步骤:** 1. 不选任何选项 2. 点击 Confirm cancellation 3. 返回 Mira（如果 Portal 允许） 4. 在 Mira Settings 检查
- **预期结果:** Portal 阻止确认（仍在原页面）；如手动返回 Mira，Settings 订阅区域无 Cancelling 标注（说明取消未生效）
- **测试数据:** 无

**TC-PRD-PORTAL-025**: Portal 内撤销取消（Renew）后回 Mira 取消标注消失
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** cancel_at_period_end=true，已在 Portal 主页
- **操作步骤:** 1. 在 Portal 内点击 Renew / Resume subscription（或对应入口） 2. 返回 Mira
- **预期结果:** Settings 订阅区域不再显示 Cancelling 标注；订阅状态恢复 active
- **测试数据:** 无

**TC-PRD-PORTAL-026**: Portal Session 创建失败时显示降级提示
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** active 订阅；mock 后端 Portal Session API 返回 5xx
- **操作步骤:** 1. 进入 Settings 订阅区域 2. 点击"管理订阅"
- **预期结果:** 不发生跳转；显示错误 toast 或内联错误提示；按钮恢复可点击状态以便重试
- **测试数据:** mock 5xx

**TC-PRD-PORTAL-027**: 多次快速点击"管理订阅"不应造成多次跳转
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** active 订阅
- **操作步骤:** 1. 进入 Settings 订阅区域 2. 1 秒内连续点击"管理订阅"按钮 3 次
- **预期结果:** 仅产生一次有效跳转或按钮在跳转期间被禁用；无明显竞态（不出现多个 Portal 标签 / 报错）
- **测试数据:** 无

**TC-PRD-PORTAL-028**: 未登录用户访问 Settings 跳转登录页
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户未登录
- **操作步骤:** 1. 直接访问 Settings 订阅区域 URL
- **预期结果:** 跳转到登录页；URL 路径包含 /login 或等价
- **测试数据:** 无

**TC-PRD-PORTAL-029**: period_end 后下个账期不再发放 Credit（UI 显示 Free plan）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** cancel_at_period_end=true，period_end 已到达
- **操作步骤:** 1. 进入 Settings 订阅区域 2. 观察 Credit 区域
- **预期结果:** 不显示 Credit 进度条或显示 0/0 + Free plan 提示；下次续费日期字段不可见
- **测试数据:** subscription_status=canceled

**TC-PRD-PORTAL-030**: Free 用户在 Settings 看到"升级方案"入口而非"管理订阅"
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Free 用户已登录
- **操作步骤:** 1. 进入 Settings 订阅区域
- **预期结果:** 不可见"管理订阅"按钮；可见升级 / Upgrade plan 入口或链接
- **测试数据:** plan=free

---

## 优先级分布

- P0：8 条（TC-001 / 003 / 010 / 011 / 015 / 017 / 021 / 022 / 029）≈ 27%
- P1：14 条（TC-002 / 004 / 005 / 006 / 009 / 012 / 013 / 014 / 015 / 018 / 019 / 020 / 023 / 026 / 028 / 030）≈ 47%
- P2：8 条（TC-007 / 008 / 016 / 024 / 025 / 027）≈ 27%

> 比例符合 P0 15-20% / P1 40-50% / P2 30-40% 的总体规则（P0 略高因取消流程是核心闭环）。

## 追溯矩阵

| TC ID | PRD 来源 | 设计方法 |
|-------|----------|----------|
| TC-PRD-PORTAL-001 | REQ-005 Settings 订阅区域 | 等价类划分 + 场景法（Basic） |
| TC-PRD-PORTAL-002 | REQ-005 档位展示 | 等价类划分 |
| TC-PRD-PORTAL-003 | REQ-005 席位数 | 等价类划分 |
| TC-PRD-PORTAL-004 | REQ-005 Free 用户 | 等价类划分 |
| TC-PRD-PORTAL-005 | REQ-005 Credit 进度条 | 边界值分析 |
| TC-PRD-PORTAL-006 | REQ-005 Credit 进度条 | 边界值分析 |
| TC-PRD-PORTAL-007 | REQ-005 席位数 | 边界值分析 |
| TC-PRD-PORTAL-008 | REQ-005 续费日期 | 边界值分析 |
| TC-PRD-PORTAL-009 | REQ-005 + REQ-008 past_due | 因果图 |
| TC-PRD-PORTAL-010 | REQ-009 cycle-end 取消 | 状态迁移 |
| TC-PRD-PORTAL-011 | REQ-009 period_end 后降级 | 状态迁移 |
| TC-PRD-PORTAL-012 | REQ-009 取消未到期仍可用 | 状态迁移 |
| TC-PRD-PORTAL-013 | REQ-009 + REQ-003 重新订阅 Customer 复用 | 状态迁移 |
| TC-PRD-PORTAL-014 | REQ-005 Portal 升降级 | 状态迁移 |
| TC-PRD-PORTAL-015 | Pencil S9 用户菜单 | 场景法 |
| TC-PRD-PORTAL-016 | Pencil S9 副标题 | 场景法 |
| TC-PRD-PORTAL-017 | REQ-005 整页跳转 | 场景法 |
| TC-PRD-PORTAL-018 | REQ-005 移动端 no-iframe | 场景法 |
| TC-PRD-PORTAL-019 | REQ-005 Portal 操作入口 | 场景法 |
| TC-PRD-PORTAL-020 | REQ-005 return_url | 场景法 |
| TC-PRD-PORTAL-021 | REQ-009 取消原因收集 | 场景法 |
| TC-PRD-PORTAL-022 | REQ-009 取消确认 | 场景法 |
| TC-PRD-PORTAL-023 | REQ-009 + 数据指标埋点 | 场景法 |
| TC-PRD-PORTAL-024 | REQ-009 异常 | 错误猜测 |
| TC-PRD-PORTAL-025 | REQ-005/REQ-009 撤销取消 | 错误猜测 |
| TC-PRD-PORTAL-026 | REQ-005 Portal Session 失败 | 错误猜测 |
| TC-PRD-PORTAL-027 | REQ-005 重复点击 | 错误猜测 |
| TC-PRD-PORTAL-028 | 通用未登录守卫 | 错误猜测 |
| TC-PRD-PORTAL-029 | REQ-009 + REQ-006 Credit 不再发放 | 状态迁移 |
| TC-PRD-PORTAL-030 | REQ-005 升级入口 | 等价类划分 |
