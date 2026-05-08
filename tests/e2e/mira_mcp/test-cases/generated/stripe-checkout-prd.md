<!-- PRD-hash: 24c2f236e60b8b23d710f2a568f87bc8fc9d9b089cde2a6742d58fb038dfe1a3 | PRD-module: REQ-003 Checkout Session (Hosted) 收款 | feature-slug: stripe-checkout -->

# Stripe Checkout Session (Hosted) 收款 — 测试用例

**来源 PRD**: stripe_integration_phase1_prd_final.md（V1.3）
**覆盖需求**: REQ-003 — Checkout Session (Hosted) 收款
**适用环境**: Stripe 沙箱环境（Test Mode）
**生成模式**: PRD（requirements document mode）

---

## 需求概要

REQ-003 用户故事：作为选择了 Starter / Individual / Team 的用户，当我点击订阅按钮，系统创建 Checkout Session 并跳转到 Stripe 托管支付页完成付款（沙箱环境）。

**核心流程**：
1. 用户在定价页点击 CTA 按钮（Upgrade）
2. 前端展示 Toast "Redirecting to secure checkout..."（1.5 秒）
3. 后端实时校验（防重复订阅 + 合法性）
4. 校验通过 → 创建 Checkout Session → 跳转到 Stripe 托管页（host: `checkout.stripe.com`）
5. Stripe 处理支付（SCA / Tax / 卡号输入均由 Stripe 处理，不在 Mira 范围内）
6. 支付成功 → 跳回 Mira 成功页；支付取消 → 跳回 Mira 定价页

**Stripe 配置（沙箱）**：3 个 Product × 3 个 Price（Starter $20 / Individual $100 / Team $200/seat）

**关键约束**：
- 移动端响应式自适配（由 Stripe 托管页负责）
- Stripe Test Mode 测试卡：`4242 4242 4242 4242`，任意未来过期日，任意 CVC，任意邮编
- 跳转兜底：Toast 5 秒后仍未跳转 → 展示"点击此处手动跳转"链接

---

## 等价类划分

### 输入维度 1：选择的档位（Plan）

| 等价类 ID | 类型 | 取值 | 备注 |
|-----------|------|------|------|
| EC-PLAN-V1 | 有效 | Starter ($20/月) | priceId 映射到 Starter Price |
| EC-PLAN-V2 | 有效 | Individual ($100/月) | priceId 映射到 Individual Price |
| EC-PLAN-V3 | 有效 | Team ($200/seat × N) | 含动态 seats 参数 |
| EC-PLAN-I1 | 无效 | 缺失 priceId / 篡改的 priceId | 后端应拒绝 |

### 输入维度 2：用户当前订阅状态

| 等价类 ID | 类型 | 取值 | 备注 |
|-----------|------|------|------|
| EC-SUB-V1 | 有效 | 无订阅（首次付费） | 允许创建 Session |
| EC-SUB-I1 | 无效 | 已有 active 订阅 | 后端拦截，跳转管理页 |
| EC-SUB-I2 | 无效 | past_due 订阅 | 后端按已订阅处理 |

### 输入维度 3：Stripe 支付结果（沙箱）

| 等价类 ID | 类型 | 取值 |
|-----------|------|------|
| EC-PAY-V1 | 有效 | 支付成功（4242 测试卡） |
| EC-PAY-V2 | 有效（用户主动） | 支付取消 |
| EC-PAY-I1 | 无效 | 支付失败（卡被拒）— 由 Stripe 处理，超出 Mira 范围 |

---

## Method 1: Equivalence Partitioning

针对"档位选择 × 订阅状态"两个输入维度划分等价类，覆盖每个有效类至少一个用例、每个无效类一个用例。

| 用例编号 | 用例等级 | 用例名 | 涉及等价类 | 输入条件 | 操作 | 预期结果 |
|---------|---------|-------|-----------|---------|------|---------|
| TC-EC-001 | P0 | 无订阅用户点击 Starter Upgrade 跳转 Stripe | EC-PLAN-V1 + EC-SUB-V1 | 已登录、无 active 订阅 | 进入定价页 → 点击 Starter 卡片的 Upgrade | Toast 出现；URL host 在 5 秒内变为 `checkout.stripe.com` |
| TC-EC-002 | P0 | 无订阅用户点击 Individual Upgrade 跳转 Stripe | EC-PLAN-V2 + EC-SUB-V1 | 已登录、无 active 订阅 | 进入定价页 → 点击 Individual 卡片的 Upgrade | Toast 出现；跳转到 `checkout.stripe.com`；Stripe 页显示金额 $100 |
| TC-EC-003 | P0 | 无订阅用户点击 Team Upgrade 跳转 Stripe（含 seats） | EC-PLAN-V3 + EC-SUB-V1 | 已登录、无 active 订阅、Team 卡片含席位选择控件 | 进入定价页 → 选择 N 个席位 → 点击 Team 卡片 Upgrade | Toast 出现；跳转到 `checkout.stripe.com`；Stripe 页显示金额 $200 × N |
| TC-EC-004 | P0 | 已有 active 订阅用户点击 Upgrade 被拦截 | EC-SUB-I1 | 已登录、已有 active 订阅 | 进入定价页（如可见 Upgrade）→ 点击 Upgrade | 不跳转 Stripe；停留在 Mira 域名；展示已订阅错误信息或跳转管理页（URL 不含 `checkout.stripe.com`） |

---

## Method 2: Boundary Value Analysis

针对"等待时间"维度（PRD 等待体验方案明确：跳转 1-3 秒，5 秒兜底）做边界覆盖。Toast 持续时间 1.5 秒也是显式数值。

| 用例编号 | 用例等级 | 用例名 | 边界点 | 输入条件 | 操作 | 预期结果 |
|---------|---------|-------|-------|---------|------|---------|
| TC-BV-001 | P1 | Toast 显示时长约 1.5 秒后消失 | t = 1.5s | 已登录、无订阅 | 点击 Upgrade，监测 Toast 元素生命周期 | Toast 在 1.0-2.5 秒区间内消失（容忍 ±0.5s 抖动），消失前内容为"Redirecting to secure checkout..." |
| TC-BV-002 | P0 | 跳转在 5 秒内完成（正常网络） | t < 5s | 已登录、无订阅、网络正常 | 点击 Upgrade → 监测 URL 变化 | URL host 在 5 秒内变为 `checkout.stripe.com`；不出现"点击此处手动跳转"链接 |
| TC-BV-003 | P1 | Toast 5 秒后仍未跳转，展示手动跳转链接 | t ≥ 5s | 已登录、无订阅、模拟网络延迟（拦截 Session 创建请求 6s） | 点击 Upgrade → 等待 5+ 秒 | Toast 已结束；页面出现"Click here to continue manually"（en）/"点击此处手动跳转"（zh）链接 |
| TC-BV-004 | P2 | 手动跳转链接可点击且能跳转 | t = 5s+ | 接 TC-BV-003 状态 | 点击"Click here to continue manually"链接 | URL 跳转到 `checkout.stripe.com`，Stripe 托管页正常加载 |

---

## Method 3: Cause-Effect Graph / Decision Table

输入条件（Causes）：
- C1：用户已登录
- C2：用户无 active 订阅
- C3：所选 priceId 合法（已在 Stripe 注册）
- C4：网络/Stripe API 可用

效果（Effects）：
- E1：展示 Toast
- E2：跳转 `checkout.stripe.com`
- E3：拦截并跳转管理页
- E4：展示错误并停留定价页
- E5：展示手动跳转链接

| 决策 ID | C1 已登录 | C2 无订阅 | C3 priceId 合法 | C4 网络可用 | 期望效果 |
|---------|----------|----------|----------------|------------|---------|
| D-001 | ✓ | ✓ | ✓ | ✓ | E1 + E2（happy path） |
| D-002 | ✓ | ✗（已订阅） | ✓ | ✓ | E3（管理页）|
| D-003 | ✓ | ✓ | ✓ | ✗（创建 Session 慢） | E1 + E5（兜底链接） |
| D-004 | ✗ | — | — | — | 跳登录（不在 REQ-003 范围，引用 REQ-001 边界）|

| 用例编号 | 用例等级 | 用例名 | 决策 | 输入条件 | 操作 | 预期结果 |
|---------|---------|-------|------|---------|------|---------|
| TC-CE-001 | P0 | 全部条件成立时正确创建 Session 跳转 | D-001 | 登录、无订阅、Starter Price 已注册、网络正常 | 点击 Starter Upgrade | Toast 出现 → URL 变为 `checkout.stripe.com` |
| TC-CE-002 | P0 | 已有 active 订阅时拦截并跳转管理页 | D-002 | 登录、已有 active 订阅 | 进入定价页 → 点击任意 Upgrade（若可见）| 不跳转 Stripe；导航到管理页（Settings/Subscription 或 Customer Portal），展示明确的错误提示（无 toast） |
| TC-CE-003 | P1 | 网络慢时展示兜底手动跳转链接 | D-003 | 登录、无订阅、注入 6s 网络延迟 | 点击 Upgrade | Toast 出现 → 5s 内未跳转 → 出现"Click here to continue manually" |

---

## Method 4: State Transition Testing

状态机：
- S0：用户在定价页（idle）
- S1：点击后 Toast 显示中（pending-redirect）
- S2：服务端校验中（server-validating）
- S3：已跳转 Stripe（on-stripe）
- S4：手动兜底链接展示（manual-fallback）
- S5：被拦截，回到管理页（blocked-redirect）
- S6：从 Stripe 跳回 Mira 成功页（payment-success-return）
- S7：从 Stripe 跳回 Mira 定价页（payment-cancel-return）

合法迁移：
- S0 → S1（点击 Upgrade）
- S1 → S2（toast 仍展示，服务端校验异步）
- S2 → S3（校验通过，创建 Session 成功）
- S2 → S5（校验失败：已订阅）
- S1/S2 → S4（>5s 未跳转）
- S3 → S6（Stripe 支付成功）
- S3 → S7（Stripe 取消支付）

| 用例编号 | 用例等级 | 用例名 | 迁移路径 | 输入条件 | 操作 | 预期结果 |
|---------|---------|-------|---------|---------|------|---------|
| TC-ST-001 | P0 | 完整成功路径 S0→S1→S2→S3→S6 | S0→S1→S2→S3→S6 | 登录、无订阅 | 点击 Upgrade → 跳到 Stripe → 用 4242 测试卡完成支付 → 等跳回 | 最终 URL 跳回 Mira 域名（成功页）；URL host 不再是 `checkout.stripe.com` |
| TC-ST-002 | P0 | 取消支付路径 S0→S1→S3→S7 | S0→S1→S3→S7 | 登录、无订阅 | 点击 Upgrade → 跳到 Stripe → 在 Stripe 页点击返回/Back/关闭 | 最终 URL 跳回 Mira 定价页；用户仍可见 3 档定价；未创建订阅 |
| TC-ST-003 | P1 | 已订阅用户进入被拦截 S0→S5 | S0→S5 | 登录、已有 active 订阅 | 进入定价页（前置查询失败时）→ 点击 Upgrade（若可见） | 直接跳转管理页（Settings/Subscription 或 Portal），不进入 S1/S2/S3 |
| TC-ST-004 | P2 | 服务端校验慢触发 manual-fallback S0→S1→S2→S4 | S0→S1→S2→S4 | 登录、无订阅、注入网络延迟 | 点击 Upgrade → 等 5s+ | 进入 S4：兜底链接出现；点击链接后进入 S3 |

---

## Method 5: Scenario Method

### 基本流（Basic Flow）

BF-001：未订阅用户首次完成付费 — 进入定价页 → 选档位 → Toast → 跳转 Stripe → 用测试卡支付 → 跳回 Mira 成功页

### 备选流（Alternative Flows）

- AF-001：从基本流第 4 步分支 — 用户在 Stripe 取消支付，跳回定价页
- AF-002：从基本流第 1 步分支 — 用户已有订阅，进入即被引导到管理页
- AF-003：从基本流第 3 步分支 — 跳转超 5s，出现兜底链接
- AF-004：从基本流第 4 步分支 — 移动端视口下完整跑通基本流（Stripe 托管页响应式）
- AF-005：基本流第 2 步异常 — 快速双击 Upgrade 按钮，仅创建一个 Session（幂等）

| 用例编号 | 用例等级 | 用例名 | 场景 | 输入条件 | 操作 | 预期结果 |
|---------|---------|-------|------|---------|------|---------|
| TC-SC-001 | P0 | 基本流完整跑通：从定价页到支付成功 | BF-001 | 登录、无订阅、Stripe 沙箱启用 | 进入定价页 → 点击 Individual Upgrade → 跳转 Stripe → 输入 `4242 4242 4242 4242` / 任意未来日期 / 任意 CVC / 任意邮编 → 提交支付 → 等待跳回 | 1) Toast 出现并消失 2) URL 跳转 `checkout.stripe.com` 3) Stripe 页显示金额 $100 4) 支付完成后 URL 跳回 Mira 域名（成功页或路径含 `success`/`payment-success`） |
| TC-SC-002 | P0 | AF-001：用户在 Stripe 主动取消支付 | BF-001→AF-001 | 登录、无订阅 | 进入定价页 → 点击 Starter Upgrade → 跳转 Stripe → 在 Stripe 页面点击取消/返回 | URL 跳回 Mira 定价页；定价页 3 档仍可见；用户仍未创建订阅 |
| TC-SC-003 | P1 | AF-002：已订阅用户被前置拦截 | AF-002 | 登录、已有 active 订阅 | 直接访问定价页 URL | 1) 当前档位高亮 2) Upgrade 按钮被替换为"管理订阅" 或 3) 点击 Upgrade（若仍可见）后立即跳转管理页，不进入 Stripe |
| TC-SC-004 | P1 | AF-003：跳转超时显示兜底链接 | BF-001→AF-003 | 登录、无订阅、网络延迟 6s | 点击 Upgrade → 监测 5s 后页面 | 出现"Click here to continue manually" 链接；点击后能正常跳转 Stripe |
| TC-SC-005 | P1 | AF-004：移动端视口完整跑通基本流 | BF-001 + 移动视口 | 视口设置为 375×812（iPhone 13） | 模拟移动视口 → 进入定价页 → 点击 Starter Upgrade → 跳转 Stripe → 检查 Stripe 页是否在移动视口正常渲染 | Stripe 托管页在移动视口下渲染正常（无横向滚动、表单字段可见可输入）；卡号输入框尺寸适配 |
| TC-SC-006 | P0 | AF-005：快速双击 Upgrade 仅创建一个 Session | BF-001→AF-005 | 登录、无订阅 | 进入定价页 → 在 200ms 内对 Starter Upgrade 双击 | 仅发生一次 Toast；仅一次跳转 Stripe；Stripe 页 session_id 唯一（或前端能拦截重复点击）；不出现重复 Session |

---

## Method 6: Error Guessing

基于经验猜测的潜在缺陷与极端场景：

| 用例编号 | 用例等级 | 用例名 | 错误猜测点 | 输入条件 | 操作 | 预期结果 |
|---------|---------|-------|-----------|---------|------|---------|
| TC-EG-001 | P1 | Upgrade 按钮在 Toast 期间应禁用避免重复点击 | 防抖/防重 | 登录、无订阅 | 点击 Upgrade → Toast 显示中再点击一次 | 第二次点击不再触发新的 Toast 或新的 Session 创建（按钮 disabled / 点击被忽略） |
| TC-EG-002 | P1 | 跳回 Mira 成功页的 URL 包含合法的 session_id | URL 完整性 | 完成 TC-SC-001 | 检查跳回 Mira 成功页时的 URL | URL 含 query 参数 `session_id`（或类似标识）且非空，符合 Stripe `cs_test_...` 格式 |
| TC-EG-003 | P2 | 用户在 Stripe 支付页强行返回浏览器历史不破坏定价页 | 浏览器导航 | 完成 TC-SC-001 中跳到 Stripe 后 | 在 Stripe 页按浏览器后退键 | 跳回 Mira 定价页或 Stripe 内部页；Mira 定价页若回到不应展示异常错误，不应崩溃 |
| TC-EG-004 | P2 | 在 Toast 期间快速切换标签页/失焦不影响跳转 | 焦点丢失 | 登录、无订阅 | 点击 Upgrade → 立即切到其他 Tab → 等待跳转 | 回到原 Tab 时 URL 已变为 `checkout.stripe.com` 或保持成功跳转状态；不出现 toast 残留或卡死 |
| TC-EG-005 | P2 | 从 Stripe 取消后再次点击 Upgrade 仍可创建新 Session | 状态复用 | 完成 TC-SC-002（取消）后 | 在定价页再次点击 Starter Upgrade | 正常创建新的 Checkout Session 跳转 Stripe（不复用已取消的 Session） |
| TC-EG-006 | P1 | Team 档位 seats 数量为 1 时也能正确创建 Session | 边界 seats | 登录、无订阅 | 选择 Team 1 个 seat → 点击 Upgrade | 跳转 Stripe；Stripe 页金额 = $200 × 1 = $200 |

---

## Merged Test Case List

经过 6 种设计方法生成与去重合并，最终用例清单如下（每条用例与 handoff JSON 1:1 对应）。

> **去重原则**：同输入 + 同操作 + 同预期 = 同一用例。`TC-EC-001`、`TC-CE-001`、`TC-ST-001` 涉及同一 happy path；保留 `TC-CSO-001`（合并版）。`TC-EC-004` 与 `TC-CE-002` / `TC-ST-003` 描述同一阻断场景，合并为 `TC-CSO-005`。

> **out-of-app 标记**：所有跳转 Stripe 之后的页面交互（信用卡输入、Stripe 内部 UI 等）均标记为 out-of-app；断言仅限 URL host (`checkout.stripe.com`) 和回跳后的 Mira 路径。

---

**TC-CSO-001**: 无订阅用户点击 Starter Upgrade 触发 Toast 并跳转 Stripe
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录；用户无 active 订阅；定价页 Starter 卡片可见且 Upgrade 按钮可点击
- **操作步骤:** 1) 通过 UI 进入定价页 (POM: pricingPage.goto) 2) 点击 Starter 卡片的 Upgrade 按钮 (POM: pricingPage.clickStarterUpgrade) 3) 等待 toast 出现并消失 4) 等待 URL 变化
- **预期结果:** Toast "Redirecting to secure checkout..." 出现并在 ~1.5s 内消失；5 秒内 page.url() 的 host 变为 `checkout.stripe.com`
- **测试数据:** plan=Starter, expectedHost=checkout.stripe.com

**TC-CSO-002**: 无订阅用户点击 Individual Upgrade 触发 Toast 并跳转 Stripe（验证金额 $100）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录；用户无 active 订阅；定价页 Individual 卡片可见
- **操作步骤:** 1) 进入定价页 2) 点击 Individual 卡片的 Upgrade 按钮 3) 等待跳转完成 4) 在 Stripe 托管页定位金额展示元素（out-of-app，仅做 URL 断言）
- **预期结果:** URL host = `checkout.stripe.com`；URL 路径包含合法 session 标识（如 `/c/pay/cs_test_...`）
- **测试数据:** plan=Individual, expectedAmount=100

**TC-CSO-003**: 无订阅用户点击 Team Upgrade 触发 Toast 并跳转 Stripe（含 seats 参数）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录；用户无 active 订阅；定价页 Team 卡片可见且包含 seat 选择控件
- **操作步骤:** 1) 进入定价页 2) 在 Team 卡片选择 seat 数 (POM: pricingPage.setTeamSeats(N)) 3) 点击 Team Upgrade 4) 等待跳转
- **预期结果:** URL host = `checkout.stripe.com`；URL 含合法 session 标识；（可选）Stripe 页 metadata 包含 seats=N（仅当后端把 seats 写入 Session metadata 时可观察到，作为加分项）
- **测试数据:** plan=Team, seats=3, expectedAmount=600

**TC-CSO-004**: Team seats=1 时金额正确（边界）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已登录；用户无 active 订阅；Team 卡片可见且支持 seat=1
- **操作步骤:** 1) 进入定价页 2) Team 卡片设置 seat=1 3) 点击 Team Upgrade 4) 等待跳转
- **预期结果:** URL host = `checkout.stripe.com`；session 创建成功；金额对应 $200 × 1（如可观察）
- **测试数据:** plan=Team, seats=1

**TC-CSO-005**: 已有 active 订阅用户点击 Upgrade 被服务端拦截并跳转管理页
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户已登录；用户已有 active 订阅
- **操作步骤:** 1) 进入定价页 2) 若 Upgrade 按钮可见则点击；否则验证 Upgrade 已被替换为"管理订阅" 3) 监测 URL 变化
- **预期结果:** URL host 始终保持在 Mira 域名（不出现 `checkout.stripe.com`）；用户被引导至管理页（路径包含 `settings`/`subscription`/`portal` 任一）；展示明确错误信息或当前订阅信息（无 redirect_notice toast）
- **测试数据:** existingSubscription=active

**TC-CSO-006**: Stripe Test Mode 用 4242 测试卡完成支付，跳回 Mira 成功页
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录；用户无 active 订阅；Stripe 沙箱启用；具备测试卡 4242
- **操作步骤:** 1) 进入定价页 2) 点击 Individual Upgrade 3) 等待跳转到 `checkout.stripe.com` 4) 在 Stripe 托管页输入 `4242 4242 4242 4242` / 任意未来过期日 / 任意 CVC / 任意邮编（out-of-app） 5) 提交支付 6) 等待跳回 Mira
- **预期结果:** 最终 URL host 回到 Mira 域名；路径包含 `success` 或 `payment-success` 或类似标识；URL query 含 session_id 形如 `cs_test_*`
- **测试数据:** card=4242424242424242, expiry=any-future, cvc=any, zip=any

**TC-CSO-007**: 用户在 Stripe 主动取消支付，跳回 Mira 定价页且未创建订阅
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户已登录；用户无 active 订阅
- **操作步骤:** 1) 进入定价页 2) 点击 Starter Upgrade 3) 等待跳转到 Stripe 4) 在 Stripe 托管页点击返回/取消（out-of-app） 5) 等待跳回 Mira
- **预期结果:** 最终 URL 跳回 Mira 定价页（路径含 `pricing`）；3 档定价仍可见；用户订阅状态保持"无订阅"（在定价页不展示"管理订阅"按钮）
- **测试数据:** plan=Starter, action=cancel

**TC-CSO-008**: 跳转超过 5 秒展示"点击此处手动跳转"链接
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已登录；用户无 active 订阅；可注入网络延迟（路由拦截 Session 创建请求 6 秒）
- **操作步骤:** 1) 进入定价页 2) 注入 6 秒延迟到 Checkout Session 创建请求 3) 点击 Starter Upgrade 4) 等待 5+ 秒
- **预期结果:** Toast 已结束；页面出现 "Click here to continue manually"（或 zh "点击此处手动跳转"）链接；URL 仍在 Mira 域名
- **测试数据:** networkDelay=6000ms

**TC-CSO-009**: 手动跳转链接可点击并跳转到 Stripe
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 处于 TC-CSO-008 的状态（兜底链接已展示）
- **操作步骤:** 1) 在兜底链接出现后点击它 2) 等待跳转
- **预期结果:** URL host 变为 `checkout.stripe.com`；Stripe 托管页正常加载
- **测试数据:** 无

**TC-CSO-010**: 移动端视口（375×812）完整跑通基本流到 Stripe 跳转
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 浏览器视口设置为 375×812；用户已登录；用户无 active 订阅
- **操作步骤:** 1) 设置视口 375×812 2) 进入定价页 3) 滚动到 Starter 卡片（如需要） 4) 点击 Starter Upgrade 5) 等待跳转 6) 在 Stripe 托管页验证页面无横向溢出（out-of-app，仅做 viewport-level 截图与基本可见性检查）
- **预期结果:** 定价页移动响应式正常（卡片/按钮可点击且不被裁切）；URL host = `checkout.stripe.com`；Stripe 托管页在移动视口下基础元素（卡号输入、提交按钮）可见
- **测试数据:** viewport=375x812, plan=Starter

**TC-CSO-011**: 快速双击 Upgrade 按钮仅创建一个 Checkout Session（幂等）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录；用户无 active 订阅
- **操作步骤:** 1) 进入定价页 2) 在 200ms 内对 Starter Upgrade 触发两次点击 3) 监听网络请求中创建 Session 的 endpoint 调用次数 4) 等待跳转
- **预期结果:** 仅触发 1 次创建 Session 请求（或 2 次但仅 1 次返回成功 Session）；最终仅出现 1 次 Toast；最终仅 1 次跳转 Stripe；URL session_id 唯一
- **测试数据:** rapidClickIntervalMs=100

**TC-CSO-012**: Toast 持续约 1.5 秒后自动消失
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已登录；用户无 active 订阅；网络正常
- **操作步骤:** 1) 进入定价页 2) 点击 Starter Upgrade 3) 在点击瞬间记录时间戳 t0 4) 监测 Toast 元素在 DOM 中存在的时长
- **预期结果:** Toast 文案为 "Redirecting to secure checkout..."；Toast 在 t0+1.0s 至 t0+2.5s 区间内消失（容忍 ±0.5s 网络抖动）
- **测试数据:** expectedToastMs=1500, toleranceMs=500

**TC-CSO-013**: Toast 期间 Upgrade 按钮被禁用，避免重复触发
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已登录；用户无 active 订阅
- **操作步骤:** 1) 进入定价页 2) 点击 Starter Upgrade 3) 在 Toast 显示期间（点击后 0-1.5s 内）再次尝试点击 Upgrade 按钮 4) 监听 Session 创建请求次数
- **预期结果:** Toast 仅出现一次；第二次点击不触发新的 Session 创建请求；按钮在 Toast 期间为 disabled 或视觉上明显抑制状态
- **测试数据:** secondClickDelayMs=500

**TC-CSO-014**: Stripe 跳回 Mira 成功页 URL 含合法 session_id 参数
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 完成 TC-CSO-006（已成功支付并跳回）
- **操作步骤:** 1) 完成 TC-CSO-006 的支付流程 2) 在跳回成功页时解析 URL 参数
- **预期结果:** URL query 参数包含 session_id（或 checkout_session_id 等同义键）；值符合 Stripe 沙箱格式 `cs_test_[A-Za-z0-9]+`，长度 >= 20 字符
- **测试数据:** sessionIdRegex=^cs_test_[A-Za-z0-9]+$

**TC-CSO-015**: 取消支付后再次点击 Upgrade 仍能正常创建新 Session
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户已登录；用户无 active 订阅；刚完成 TC-CSO-007（取消跳回定价页）
- **操作步骤:** 1) 在取消跳回的定价页再次点击 Starter Upgrade 2) 等待跳转
- **预期结果:** Toast 再次出现并跳转 `checkout.stripe.com`；新 session_id 与之前不同（或至少能再次成功跳转，不出现"已存在 Session"等错误）
- **测试数据:** plan=Starter

---

## 数据指标 / 跟踪点（参考用，不直接断言）

PRD 列出的前端埋点在测试运行中可作为辅助验证（不要求每条测试都校验，但 happy path 至少观察一次）：
- `pricing_page_view`：进入定价页时上报
- `plan_selected`：点击 Upgrade 时上报，含 plan / billing_period
- `payment_redirect`：跳转 Stripe 时上报，含 plan / session_id

---

## 设计方法 N/A 说明

本 REQ-003 用例集中应用了全部 6 种设计方法，均产出实际用例。无 N/A。
