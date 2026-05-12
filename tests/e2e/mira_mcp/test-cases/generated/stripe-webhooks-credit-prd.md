<!-- PRD-hash: d9d559e60aaf27be014424d783ca16ec811d1f73f25d857471af93dcf4711e00 | PRD-module: REQ-004 + REQ-006 + REQ-008 (Stripe Webhooks + Credit Lifecycle) | feature-slug: stripe-webhooks-credit -->

# Stripe Webhook 处理与 Credit 生命周期 — 测试用例

> **PRD 来源**：`/Users/stephen/Documents/stripe_integration_phase1_prd_final.md`（V1.3, 2026-04-21）
> **覆盖范围**：REQ-004（Webhook 处理与 Credit 发放）、REQ-006（月度续费与 Credit 重置）、REQ-008（扣款失败处理）
> **测试环境**：Stripe 沙箱（Test Mode）+ Mira Phase 1（沙箱阶段）
> **执行方式标记**：
> - `ui-observable` — E2E 层可在 UI 上验证用户可见结果（如 Credit 余额、past_due 横幅）
> - `webhook-simulation` — 需要 Stripe CLI 触发事件或 Stripe Test Mode Dashboard 模拟事件
> - `backend-only` — 仅可通过 DB / API / 后端日志验证，UI 不可见
> **执行层标记**：
> - `E2E` — Playwright 在 UI 层观测
> - `Integration` — API/DB 校验（接收 Stripe webhook → 校验 Credit Ledger 与 user 表状态）
> - `Unit` — Webhook handler 单元测试（签名校验、幂等去重、event 路由）

---

## 概览

本文档为 REQ-004 / REQ-006 / REQ-008 三个需求生成测试用例，按照 6 大设计方法系统化推导。每条用例标记 **执行层（E2E / Integration / Unit）** 和 **可观测范围（ui-observable / webhook-simulation / backend-only）**。

由于这三个需求大多是服务端 webhook 流程，**E2E 层只能验证用户可见结果**（Credit 余额数字、past_due 警告横幅、订阅状态展示）。**所有"事件触发"动作都需要通过 Stripe CLI（如 `stripe trigger checkout.session.completed`）或 Stripe Test Mode Dashboard 模拟**，无法纯 UI 触发。

---

## Method 1: Equivalence Partitioning（等价类划分）

### 输入域分析

#### REQ-004：Webhook 事件类型（输入域 #1）

| 等价类 | 类型 | 描述 | 代表事件 |
|--------|------|------|----------|
| EC1.1 | 有效 | 受支持的事件类型 | `checkout.session.completed` / `invoice.paid` / `invoice.payment_failed` / `customer.subscription.updated` / `customer.subscription.deleted` |
| EC1.2 | 无效 | 不受支持的事件类型 | `payment_intent.succeeded`（不在白名单内） |
| EC1.3 | 无效 | 事件签名无效 | 任意事件类型 + 错误签名 |

#### REQ-004：订阅档位（输入域 #2）

| 等价类 | 类型 | 描述 |
|--------|------|------|
| EC2.1 | 有效 | Starter（重置到满额） |
| EC2.2 | 有效 | Individual（重置到满额） |
| EC2.3 | 有效 | Team（重置到 满额 × 席位数） |
| EC2.4 | 无效 | 未知档位（如 "Enterprise" — 一期不支持自助） |

#### REQ-008：订阅扣款状态（输入域 #3）

| 等价类 | 类型 | 描述 |
|--------|------|------|
| EC3.1 | 有效 | 扣款成功 → 状态 active |
| EC3.2 | 有效 | 扣款失败 → 状态 past_due |
| EC3.3 | 有效 | 经 Smart Retries 后扣款成功 → 状态从 past_due 回到 active |
| EC3.4 | 有效 | Smart Retries 全部失败 → 订阅取消（移交 REQ-009） |

### 用例（来自 EC 分析）

**TC-PRD-WHK-001**: 接收受支持的 `checkout.session.completed` Webhook → Credit 按档位发放（Starter）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 沙箱用户已登录 Mira 主界面；该用户当前无活跃订阅；通过 UI 进入定价页并完成 Starter 档位 Checkout（沙箱测试卡 4242）；保留 Stripe 返回的 customer_id / subscription_id
- **操作步骤:** 1. 通过 Stripe CLI 或 Test Mode Dashboard 触发针对该 customer 的 `checkout.session.completed` 事件 2. 在 Mira 主界面或 Settings → Subscription 区域查看 Credit 余额和当前计划
- **预期结果:** 后端日志记录 `credit_granted` 事件（INFO 级别），字段包含 user_id / tier=Starter / event_id；Mira UI 显示当前计划为 "Starter"，Credit 余额变为 Starter 档位满额；time_to_credit < 30s
- **测试数据:** tier=Starter; customer_id={Stripe 沙箱 customer_id}; webhook event_id={随机 UUID}
- **执行层:** E2E（ui-observable: Credit 余额数字、当前计划标签）+ Integration（验证 Credit Ledger 表的 reset 记录）

**TC-PRD-WHK-002**: 接收受支持的 `checkout.session.completed` Webhook → Credit 按档位发放（Individual）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 沙箱用户无活跃订阅；通过 UI 完成 Individual 档位 Checkout
- **操作步骤:** 1. Stripe CLI 触发 `checkout.session.completed` 2. 查看 Mira UI Credit 余额
- **预期结果:** Mira UI 显示当前计划为 "Individual"；Credit 余额 = Individual 档位满额；后端日志记录 credit_granted、tier=Individual
- **测试数据:** tier=Individual
- **执行层:** E2E + Integration

**TC-PRD-WHK-003**: 接收受支持的 `checkout.session.completed` Webhook → Credit 按档位发放（Team，含席位数）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 沙箱用户无活跃订阅；通过 UI 完成 Team 档位 Checkout，席位数选择 3
- **操作步骤:** 1. Stripe CLI 触发 `checkout.session.completed` 2. 查看 Mira UI Credit 余额与席位数
- **预期结果:** Mira UI 显示当前计划 "Team（3 席）"；Credit 余额 = TBD × 3；后端日志记录 tier=Team / seats=3
- **测试数据:** tier=Team; seats=3
- **执行层:** E2E + Integration

**TC-PRD-WHK-004**: 接收不受支持的 Webhook 事件类型（如 `payment_intent.succeeded`） → 系统忽略
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Mira 已正常上线 Webhook endpoint；用户已订阅 Starter
- **操作步骤:** 1. Stripe CLI 触发不在监听清单的事件（`stripe trigger payment_intent.succeeded`） 2. 检查 Mira Credit 余额与日志
- **预期结果:** Webhook endpoint 返回 200 但不执行业务逻辑；Credit 余额无变化；日志可记录 INFO `webhook_received` 但不应有 `credit_granted` 等动作日志
- **测试数据:** event_type=payment_intent.succeeded
- **执行层:** Integration / Unit（webhook-simulation；UI 无可见变化）

**TC-PRD-WHK-005**: Webhook 签名验证失败 → 返回 400，不处理事件
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Mira Webhook endpoint 已配置 signing_secret；准备一个手工构造的 webhook payload
- **操作步骤:** 1. 使用 curl 或 httpie 直接 POST 到 Mira Webhook endpoint，header `Stripe-Signature` 为伪造或缺失 2. 检查 HTTP 响应、Mira UI Credit 余额和日志
- **预期结果:** HTTP 400 返回；后端日志记录 ERROR `webhook_signature_failed`，字段包含 ip / raw_payload_hash；Credit 无任何变更
- **测试数据:** Stripe-Signature: invalid 或缺失
- **执行层:** Integration / Unit（backend-only）

---

## Method 2: Boundary Value Analysis（边界值分析）

### 边界点识别

| 输入域 | 下界 | 标称 | 上界 |
|--------|------|------|------|
| Webhook event_id 重复次数 | 1（首次）| 2（首次重传） | 3（多次重传） |
| time_to_credit（支付到 Credit 到账延迟，目标 <30s） | 0s | 30s | 60s（告警阈值） |
| Smart Retries 次数 | 0 | 1-3 | 4（最后一次） |
| Team 席位数 | 1（最小） | 3（典型） | 100+（极端） |
| Stripe 重试时间窗（webhook 写库失败后） | 0min | 中段 | 3 天（最长重试窗口） |

### 用例

**TC-PRD-WHK-006**: 同一 `event_id` 第二次重传 → 幂等保护，不重复发放 Credit
- **优先级:** P0
- **测试类型:** 边界值分析
- **前置条件:** 已通过 Stripe CLI 触发一次 `checkout.session.completed` 并验证 Credit 已发放成功；记下该 event 的 `event_id`
- **操作步骤:** 1. 使用 Stripe CLI 重发同一事件（`stripe events resend {event_id}`） 2. 查看 Mira Credit 余额、后端日志
- **预期结果:** Webhook endpoint 返回 200；Credit 余额不变（保持上次发放后的满额）；后端日志记录 WARN `webhook_duplicate`，字段含 event_id
- **测试数据:** event_id 重复次数 = 2
- **执行层:** E2E（ui-observable: Credit 余额无变化）+ Integration

**TC-PRD-WHK-007**: 同一 `event_id` 第三次以上重传 → 持续幂等，余额仍不变
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 已经过 TC-006 的两次发送
- **操作步骤:** 1. 同一 event 第 3 次重发 2. 查看 Credit 余额
- **预期结果:** 余额仍不变；日志继续记录 WARN `webhook_duplicate`；endpoint 返回 200
- **测试数据:** event_id 重复次数 = 3
- **执行层:** Integration

**TC-PRD-WHK-008**: time_to_credit < 30 秒（性能目标边界）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 沙箱测试用户无订阅；通过 UI 走完整 Starter 订阅流程
- **操作步骤:** 1. 在 Stripe 托管页输入测试卡 4242 → 提交支付 → 跳转回 Mira 成功页 2. 在 Mira 主界面或 Settings 实时观察 Credit 余额，直到非零 3. 记录从"支付按钮点击"到"Credit 余额可见"的时间
- **预期结果:** 时间差 < 30 秒；后端日志中 `webhook_received` 与 `credit_granted` 时间差也应 < 30s
- **测试数据:** 测量目标 <30s（与 PRD 数据指标 `time_to_credit` target=<30 秒 一致）
- **执行层:** E2E（ui-observable: 余额变化时间）+ Integration（日志时间戳对比）

**TC-PRD-WHK-009**: time_to_credit 接近 60 秒告警阈值
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 模拟后端处理慢（在沙箱中通常 10s 内完成；本用例为防御性观察）
- **操作步骤:** 1. 触发一次完整 checkout 流程，记录 time_to_credit 2. 检查告警系统是否在超过 60s 时触发 P2 告警 `credit_grant_delay`
- **预期结果:** 正常情况下 < 30s；如某次超过 60s，告警系统应触发 P2 告警通知 oncall
- **测试数据:** 告警阈值边界 = 60s
- **执行层:** Integration（backend-only：告警系统）

**TC-PRD-WHK-010**: 续费 Credit 重置 — 余额从 50 不应变成 50+TBD（边界对比"reset vs grant"）
- **优先级:** P0
- **测试类型:** 边界值分析
- **前置条件:** 沙箱用户已订阅 Starter 一个月，本月已消耗一部分 Credit，UI 显示余额为 50
- **操作步骤:** 1. 通过 Stripe CLI / Test Mode Dashboard 模拟下个账期 `invoice.paid` 事件 2. 在 Mira UI 查看 Credit 余额
- **预期结果:** Credit 余额 = Starter 档位满额（与上月起始相同），**不是 50 + 满额**；后端日志记录 `credit_reset`，字段 old_balance=50 / new_balance=满额
- **测试数据:** old_balance=50; expected_new_balance=Starter 满额
- **执行层:** E2E（ui-observable: 余额数字）+ Integration

**TC-PRD-WHK-011**: Team 席位数 = 1（最小席位）→ Credit 重置为 TBD × 1
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 沙箱用户已订阅 Team，席位数 = 1
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid` 2. 查看 Credit 余额
- **预期结果:** 余额 = Team 满额 × 1（即一档单价对应的额度）
- **测试数据:** seats=1
- **执行层:** E2E + Integration

**TC-PRD-WHK-012**: Team 席位数极端值（如 100）→ Credit 按比例重置
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 沙箱手工创建一个 Team 订阅，席位数 = 100
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid` 2. 查看 Credit 余额
- **预期结果:** 余额 = TBD × 100；DB 字段无溢出；UI 数字格式正确（含千位分隔符）
- **测试数据:** seats=100
- **执行层:** Integration（UI 大数字 ui-observable）

**TC-PRD-WHK-013**: Stripe 写库失败后于 3 天内自动重试成功
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 模拟 Credit Ledger 写入失败（DB 临时不可用 → 故意制造一次 500 响应）
- **操作步骤:** 1. Mira 后端故意让首次写入失败，返回 500 2. Stripe 在数小时～3 天内自动重试同一事件 3. 后续 Mira 后端恢复正常 → 写入成功
- **预期结果:** 首次返回 500；后续重试中 Mira 写入成功 → Credit 正常发放；后端日志显示首次 ERROR、后续 INFO `credit_granted`；用户无重复 Credit
- **测试数据:** 重试窗口边界 = 3 天
- **执行层:** Integration（backend-only：DB 状态、日志）

---

## Method 3: Cause-Effect Graph / Decision Table（因果图/判定表）

### 因果分析（REQ-004 webhook 处理路由）

**输入条件（Causes）**：
- C1：Webhook 签名校验通过
- C2：event_type 在监听白名单内
- C3：用户标识能在 Mira DB 中找到
- C4：event_id 此前未处理过（幂等）
- C5：Credit Ledger 写入成功

**输出动作（Effects）**：
- E1：HTTP 返回 200
- E2：Credit 发放/重置（依事件类型）
- E3：HTTP 返回 400（签名失败）
- E4：HTTP 返回 500（DB 失败 → 触发 Stripe 重试）
- E5：日志告警（INFO/WARN/ERROR）

### 判定表

| Rule | C1 签名 | C2 白名单 | C3 用户存在 | C4 首次 | C5 写库 OK | 动作 |
|------|--------|----------|-----------|--------|-----------|------|
| R1 | ✓ | ✓ | ✓ | ✓ | ✓ | E1 + E2 + INFO 日志（happy path） |
| R2 | ✗ | — | — | — | — | E3 + ERROR 日志（不处理） |
| R3 | ✓ | ✗ | — | — | — | E1（200）+ INFO（接收）但无业务动作 |
| R4 | ✓ | ✓ | ✗ | — | — | E1 + ERROR `user_mapping_failed` + 不发 Credit |
| R5 | ✓ | ✓ | ✓ | ✗ | — | E1 + WARN `webhook_duplicate` + 不重发 Credit |
| R6 | ✓ | ✓ | ✓ | ✓ | ✗ | E4（500）+ ERROR + 等待 Stripe 重试 |

### 用例（来自判定表）

**TC-PRD-WHK-014**: R1 - Happy Path（签名通过 + 白名单 + 用户存在 + 首次 + 写库成功）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 沙箱用户已通过 UI 完成 Starter Checkout
- **操作步骤:** 1. Stripe CLI 触发 `checkout.session.completed` 2. 校验 HTTP 响应、Credit 余额、日志
- **预期结果:** HTTP 200；Credit 发放为 Starter 满额；INFO 级 `credit_granted` 日志；UI 显示对应余额
- **测试数据:** 标准沙箱事件
- **执行层:** E2E + Integration（ui-observable + backend-only）

**TC-PRD-WHK-015**: R3 - 签名通过但事件类型不在白名单
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 同 TC-PRD-WHK-004
- **操作步骤:** 1. Stripe CLI 触发不在监听清单的事件（如 `customer.created`） 2. 检查响应与日志
- **预期结果:** HTTP 200；不发放 Credit；只有 INFO `webhook_received`，无 `credit_granted`
- **测试数据:** event_type=customer.created
- **执行层:** Integration（backend-only / webhook-simulation）

**TC-PRD-WHK-016**: R4 - 用户 ID 映射失败（Stripe customer_id 在 Mira DB 找不到）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 在 Stripe 沙箱手工创建 customer 但不通过 Mira 注册流程；该 customer_id 不在 Mira user 表中
- **操作步骤:** 1. Stripe CLI 针对该 customer 触发 `checkout.session.completed` 2. 检查 Mira 日志、Credit 表
- **预期结果:** Webhook endpoint 返回 200（避免 Stripe 一直重试）；后端日志 ERROR `user_mapping_failed` 含 customer_id；Credit Ledger 无新记录；告警系统应能触发人工排查告警
- **测试数据:** customer_id={未注册到 Mira 的 customer}
- **执行层:** Integration / Unit（backend-only）

**TC-PRD-WHK-017**: R6 - DB 写入失败 → 返回 500，Stripe 重试
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 模拟 Credit Ledger DB 不可用（在测试环境中通过故障注入或断开 DB 连接）
- **操作步骤:** 1. Stripe CLI 触发 `checkout.session.completed` 2. 检查 HTTP 响应、日志、Stripe Dashboard 中事件状态
- **预期结果:** HTTP 500；后端日志 ERROR；Stripe Dashboard 中事件状态显示 "Failed - will retry"；之后 DB 恢复后 Stripe 自动重试 → Credit 最终成功发放
- **测试数据:** 故障注入：DB 连接拒绝
- **执行层:** Integration（backend-only）

---

## Method 4: State Transition Testing（状态迁移）

### 状态机定义

**用户订阅状态机**：

```
[no_subscription] --(checkout.session.completed)--> [active]
[active]  --(invoice.paid)--> [active] (Credit 重置)
[active]  --(invoice.payment_failed)--> [past_due]
[past_due] --(invoice.paid - Smart Retries 成功)--> [active]
[past_due] --(customer.subscription.deleted - Smart Retries 全部失败)--> [canceled]
[active]  --(customer.subscription.deleted)--> [canceled]
[canceled] --(checkout.session.completed - 重新订阅)--> [active]
```

**Credit 余额状态机（在 active 状态下）**：

```
[full_balance] --(任务消耗)--> [partial_balance]
[partial_balance] --(任务消耗到 0)--> [zero_balance] (REQ-007 拦截，不在本文档范围)
[partial_balance] --(invoice.paid)--> [full_balance] (重置，REQ-006)
[full_balance] --(invoice.paid)--> [full_balance] (重置后还是满额)
```

### 用例

**TC-PRD-WHK-018**: 状态迁移 [no_subscription] → [active]（首次订阅）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 沙箱用户无订阅
- **操作步骤:** 1. UI 完成 Starter Checkout 2. Stripe CLI 触发 `checkout.session.completed` 3. 查看 Settings → Subscription 区域
- **预期结果:** 状态从 no_subscription → active；UI 显示当前计划为 Starter；Credit 余额为满额；下次续费日期可见
- **测试数据:** tier=Starter
- **执行层:** E2E（ui-observable）+ Integration

**TC-PRD-WHK-019**: 状态迁移 [active] → [active]（续费 + Credit 重置）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户已订阅 Starter，本月已消耗 30 Credits，UI 显示余额为 (满额-30)
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid` 模拟下个账期续费 2. 查看 Credit 余额 + 周期结束时间
- **预期结果:** 状态保持 active；Credit 余额重置为满额（不累加）；下次续费日期更新为再下一个月份；后端日志 INFO `credit_reset` 含 old_balance=(满额-30) 和 new_balance=满额
- **测试数据:** 跨账期模拟
- **执行层:** E2E（ui-observable: 余额、续费日期） + Integration

**TC-PRD-WHK-020**: 状态迁移 [active] → [past_due]（扣款失败）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 沙箱用户已订阅 Individual，绑定一张已知会失败的测试卡（如 4000 0000 0000 0341 - Charge succeeded then disputed/failed scenario，或使用 Stripe Test Cards 中标记 "Renewal fail"）
- **操作步骤:** 1. Stripe CLI 触发 `invoice.payment_failed`（或在沙箱模拟续费扣款失败） 2. 在 Mira UI 定价页和 Settings 区域查看
- **预期结果:** 状态从 active → past_due；定价页展示警告"支付失败，请更新支付方式" + "管理订阅"按钮（参见 REQ-002 表格）；用户仍可使用产品（Phase 1 不做功能降级）；后端日志记录 past_due 标记 + 通知发送
- **测试数据:** 测试卡：续费失败模式
- **执行层:** E2E（ui-observable: 警告横幅）+ Integration

**TC-PRD-WHK-021**: past_due 用户仍可正常使用产品（Phase 1 不做功能降级）
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 当前用户处于 past_due 状态（可手工通过 Stripe Test Mode 设定）
- **操作步骤:** 1. 在 Mira 主界面发起一项常规任务（消耗少量 Credit） 2. 检查任务能否正常执行 3. 查看 Credit 余额是否被消耗
- **预期结果:** 任务正常执行；Credit 余额按消耗扣减；不出现"无权限"或"功能锁定"提示；过期支付提示横幅仍持续显示
- **测试数据:** 任务类型：默认 AI 任务
- **执行层:** E2E（ui-observable）

**TC-PRD-WHK-022**: 状态迁移 [past_due] → [active]（Smart Retries 成功）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户当前 past_due
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid`（模拟 Smart Retries 中某次成功） 2. 查看 Mira UI 警告横幅是否消失、状态是否回到 active
- **预期结果:** 状态回到 active；past_due 警告横幅清除；Credit 重置为满额；下次续费日期更新；后端日志记录状态变迁
- **测试数据:** 模拟 Smart Retries 第 2 次重试成功
- **执行层:** E2E（ui-observable: 警告横幅消失） + Integration

**TC-PRD-WHK-023**: past_due 状态下用户主动更新支付方式 → 触发立即重试 → 回到 active
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户 past_due，准备一张可成功的测试卡（4242）
- **操作步骤:** 1. 在 Settings → Subscription 中点击"管理订阅"跳转 Customer Portal 2. 在 Portal 中更新支付方式为 4242 3. Stripe 自动触发立即扣款 → 成功 4. 返回 Mira 查看状态
- **预期结果:** 状态回到 active；警告横幅清除；Credit 余额恢复为满额；后端记录 invoice.paid 事件
- **测试数据:** 替换卡号 4242
- **执行层:** E2E（ui-observable: Portal 跳转 + 状态恢复）+ Integration

**TC-PRD-WHK-024**: 状态迁移 [past_due] → [canceled]（Smart Retries 全部失败 → REQ-009 territory）
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** 用户在 past_due，所有重试都失败
- **操作步骤:** 1. 模拟 Stripe Smart Retries 4 次全部失败（沙箱可手动 Dashboard 触发或等待） 2. Stripe 触发 `customer.subscription.deleted` 3. 查看 Mira 状态
- **预期结果:** 订阅状态变为 canceled；UI 不再显示 past_due 横幅；Credit 余额保留至当前周期末（参考 REQ-009）；本用例只验证从 past_due 到 canceled 的迁移路径，详细 REQ-009 取消处理由独立文档覆盖
- **测试数据:** 跨用例引用 REQ-009
- **执行层:** Integration（cross-ref REQ-009）

---

## Method 5: Scenario Method（场景法）

### 基本流（Basic Flow）：付费 → 使用 → 续费 → 扣款失败 → 自动重试成功

```
[A 用户登录] → [B 选 Starter 订阅] → [C 完成 Stripe Checkout] →
[D 收到 checkout.session.completed → Credit 发放] → [E 用户使用一段时间] →
[F 月度续费] → [G 收到 invoice.paid → Credit 重置] → [H 一次扣款失败] →
[I past_due + 通知] → [J Smart Retries 成功] → [K 状态恢复 active]
```

### 替代流（Alternative Flows）

- **AF1**：B 之后跳过 → 用户取消 Checkout 不付款（不在本文档范围，归 REQ-003）
- **AF2**：D 之后 Stripe 重发同一 event → 幂等保护
- **AF3**：F 之后 → 续费扣款失败 → past_due
- **AF4**：F 之后 → DB 写库失败 → Stripe 自动重试 3 天
- **AF5**：J 之后 → Smart Retries 全部失败 → 订阅取消（REQ-009）

### 场景用例

**TC-PRD-WHK-025**: 完整端到端场景 — 首次订阅 → 续费 → 扣款失败 → 恢复
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 全新沙箱用户；Stripe 沙箱与 Mira 后端配置完整；Stripe CLI 可用
- **操作步骤:**
  1. 用户在 Mira 登录后访问定价页，选择 Starter，完成 Stripe Checkout（用 4242 卡）
  2. Stripe CLI 触发 `checkout.session.completed`，检查 Credit 余额变满
  3. 在 Mira 内消耗一些 Credit（执行任务）
  4. Stripe CLI 触发 `invoice.paid`，模拟下月续费，检查 Credit 重置
  5. Stripe CLI 触发 `invoice.payment_failed`，检查状态变 past_due，警告横幅出现
  6. Stripe CLI 触发 `invoice.paid` 模拟 Smart Retries 第 2 次成功，检查状态回到 active 且警告横幅消失
- **预期结果:** 整条链路在 UI 与后端日志中各阶段一致：Credit 余额变化、订阅状态切换、警告横幅出现/消失全部正确
- **测试数据:** 沙箱用户全流程
- **执行层:** E2E + Integration（ui-observable 全程）

**TC-PRD-WHK-026**: 场景 - 扣款失败但用户主动更新卡片立即恢复
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户已订阅 Individual，使用一张续费时会失败的测试卡
- **操作步骤:**
  1. Stripe CLI 触发 `invoice.payment_failed`，确认进入 past_due
  2. 用户从 Mira Settings → Subscription 跳转 Customer Portal
  3. 在 Portal 中将支付方式更新为可成功的 4242 卡
  4. Stripe 自动触发立即扣款 → 触发 `invoice.paid`
  5. 返回 Mira 查看状态
- **预期结果:** past_due 横幅消失；状态变回 active；Credit 重置为满额；用户感受到恢复路径完整
- **测试数据:** 卡 4242
- **执行层:** E2E + Integration

**TC-PRD-WHK-027**: 场景 - 续费时 Mira 后端短暂不可用，Stripe 在 3 天内重试成功
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户活跃订阅，进入续费窗口
- **操作步骤:**
  1. 在续费 Webhook 到达时，Mira 后端处于不可用状态（模拟）
  2. Stripe 自动重试，几分钟后 Mira 后端恢复
  3. 第二次或第三次重试中处理成功
- **预期结果:** 最终 Credit 重置成功；用户在用户侧无感知；后端日志可看到首次 ERROR + 后续 INFO `credit_reset`；Stripe Dashboard 显示事件最终状态为 Succeeded
- **测试数据:** 模拟后端短暂故障
- **执行层:** Integration（backend-only / webhook-simulation）

**TC-PRD-WHK-028**: 场景 - 同一 event 被 Stripe 在数小时内重发，幂等保护持续生效
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 已在 TC-PRD-WHK-014 完成首次发放
- **操作步骤:**
  1. 在 1 小时后用 Stripe CLI 重发同一 event
  2. 在 6 小时后再次重发
  3. 在 24 小时后再次重发
  4. 检查 Credit 余额与日志
- **预期结果:** 各次重发都返回 200；余额始终保持满额（不累加）；日志依次记录 WARN `webhook_duplicate`
- **测试数据:** event_id 重复 4 次
- **执行层:** Integration

---

## Method 6: Error Guessing（错误猜测）

凭经验推测可能出错的边角场景。

**TC-PRD-WHK-029**: Webhook 端点同时收到大量并发事件 → 不丢、不重复发放
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 准备 10 个不同 customer 的事件
- **操作步骤:** 1. 通过脚本同时（并发）发送 10 个不同 event_id 的 `checkout.session.completed` 2. 等待几秒后检查每个用户的 Credit
- **预期结果:** 10 个用户各自收到正确档位 Credit；无串号；无重复发放；后端日志包含 10 条 `credit_granted`
- **测试数据:** 并发数=10
- **执行层:** Integration（backend-only）

**TC-PRD-WHK-030**: Webhook payload 中 metadata 字段缺失（如 tier 信息） → 优雅降级或拒绝
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 手工构造一个 `checkout.session.completed` payload，缺少 plan/tier 关键 metadata
- **操作步骤:** 1. 通过 Stripe CLI 或 mock POST 发送残缺 payload 2. 检查响应、日志、Credit 表
- **预期结果:** 后端能识别字段缺失 → 返回 400 或 200 但不发 Credit；ERROR 日志清晰标识 missing field；不污染 Credit Ledger
- **测试数据:** payload 删除 metadata.tier
- **执行层:** Integration / Unit

**TC-PRD-WHK-031**: 同一 customer 在短时间内连续创建多个 Checkout Session（重复订阅尝试） → 防重保障
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户首次订阅成功后，仍处于支付页未关闭，同时尝试再次发起订阅
- **操作步骤:** 1. 第一次 Checkout 成功 → 收到 `checkout.session.completed` 2. 用户再次发起 Checkout（如果 REQ-002 拦截失效） 3. 第二个 Checkout 也成功 → 又收到一个 `checkout.session.completed`
- **预期结果:** 第二次 Webhook 应被识别为重复订阅 → 不再次发 Credit（依赖业务幂等：以 customer_id + 当前周期为去重键，不仅依赖 event_id），后端记录 WARN `duplicate_subscription_attempt`
- **测试数据:** 同 customer_id 的两个不同 event_id
- **执行层:** Integration（注：本场景部分依赖 REQ-002 的前端校验，但 webhook 处理也应有第二道防线）

**TC-PRD-WHK-032**: Webhook 事件时间戳异常（如严重未来时间）→ 系统接受但记录告警
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 构造一个 timestamp 为 +24h 的 webhook payload（沙箱环境通常时间正常，本用例为防御性）
- **操作步骤:** 1. 发送 timestamp 异常的事件 2. 检查 Mira 行为
- **预期结果:** 处理逻辑不受时间戳影响（业务逻辑用 event_id 而非 timestamp 做幂等）；时间戳偏差过大可记录 WARN
- **测试数据:** event.created = now + 24h
- **执行层:** Unit / Integration

**TC-PRD-WHK-033**: past_due 用户在通知发送阶段邮箱无效 → 系统不崩溃
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 沙箱用户邮箱故意设为无效格式或不可送达
- **操作步骤:** 1. Stripe CLI 触发 `invoice.payment_failed` 2. 检查 Mira 行为
- **预期结果:** Mira 内部 past_due 标记仍生效；邮件送达失败被独立处理（日志 ERROR），不影响主流程；Stripe Revenue Recovery 邮件由 Stripe 直接发送，不受 Mira 邮件失败影响
- **测试数据:** email=invalid-no-at-symbol
- **执行层:** Integration

**TC-PRD-WHK-034**: customer.subscription.updated 事件 — 档位升降级 → Credit 按新档位重置
- **优先级:** P1
- **测试类型:** 错误猜测（也可归场景法，但容易被遗漏）
- **前置条件:** 用户从 Starter 升级到 Individual（通过 Customer Portal）
- **操作步骤:** 1. 用户在 Portal 完成升级 2. Stripe 触发 `customer.subscription.updated` 3. 在 Mira UI 检查计划名 + Credit
- **预期结果:** 当前计划展示 "Individual"；Credit 按 Individual 满额重置；下次续费日期不变（升降级不重新计费日期）；后端日志记录档位变更
- **测试数据:** old_tier=Starter, new_tier=Individual
- **执行层:** E2E（ui-observable: 计划标签）+ Integration

---

## Method N/A 说明

无方法被标记为 N/A — 6 大方法均产出至少 2 条用例。

---

## Merged Test Case List

> 经过去重与合并后的最终用例清单。同一用例出现在多个方法中时，以**最先产出的方法**作为"测试类型"标签。
> 共 **34** 条用例：覆盖 REQ-004 / REQ-006 / REQ-008。

### 等价类划分（5）

**TC-PRD-WHK-001**: 接收受支持的 `checkout.session.completed` Webhook → Credit 按档位发放（Starter）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 沙箱用户已登录 Mira；该用户当前无活跃订阅；通过 UI 进入定价页并完成 Starter 档位 Checkout（沙箱测试卡 4242）
- **操作步骤:** 1. 通过 Stripe CLI 触发 `checkout.session.completed` 2. 在 Mira Settings → Subscription 区域查看 Credit 余额和当前计划
- **预期结果:** 后端日志 INFO `credit_granted`（含 user_id / tier=Starter / event_id）；UI 显示当前计划 "Starter"；Credit 余额 = Starter 满额；time_to_credit < 30s
- **测试数据:** tier=Starter
- **执行层:** E2E (ui-observable) + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-002**: 接收 `checkout.session.completed` → Credit 发放（Individual）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 沙箱用户无活跃订阅；通过 UI 完成 Individual 档位 Checkout
- **操作步骤:** 1. Stripe CLI 触发 `checkout.session.completed` 2. 查看 Mira UI Credit 余额
- **预期结果:** UI 显示计划 "Individual"；Credit = Individual 满额；后端日志记录 tier=Individual
- **测试数据:** tier=Individual
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-003**: 接收 `checkout.session.completed` → Credit 发放（Team，含席位数）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 沙箱用户无活跃订阅；通过 UI 完成 Team 档位 Checkout，席位数=3
- **操作步骤:** 1. Stripe CLI 触发 `checkout.session.completed` 2. 查看 Mira UI Credit 余额与席位数
- **预期结果:** UI 显示 "Team（3 席）"；Credit = TBD × 3；后端日志记录 tier=Team / seats=3
- **测试数据:** tier=Team; seats=3
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-004**: 不受支持的 Webhook 事件类型 → 忽略
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Mira Webhook endpoint 已上线；用户已订阅 Starter
- **操作步骤:** 1. Stripe CLI 触发不在白名单的事件（`stripe trigger payment_intent.succeeded`） 2. 检查 Credit 余额与日志
- **预期结果:** Webhook 返回 200；Credit 无变化；只有 INFO `webhook_received`，无 `credit_granted`
- **测试数据:** event_type=payment_intent.succeeded
- **执行层:** Integration / Unit
- **可观测范围:** webhook-simulation + backend-only

**TC-PRD-WHK-005**: Webhook 签名验证失败 → 返回 400
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Mira Webhook endpoint 配置 signing_secret
- **操作步骤:** 1. 直接 POST 到 Webhook endpoint，header `Stripe-Signature` 伪造或缺失 2. 检查响应、Credit、日志
- **预期结果:** HTTP 400；ERROR 日志 `webhook_signature_failed`（含 ip / raw_payload_hash）；Credit 无任何变更
- **测试数据:** Stripe-Signature: invalid
- **执行层:** Integration / Unit
- **可观测范围:** backend-only

### 边界值分析（8）

**TC-PRD-WHK-006**: 同一 `event_id` 第二次重传 → 幂等不重复发放
- **优先级:** P0
- **测试类型:** 边界值分析
- **前置条件:** 已通过 Stripe CLI 触发一次 `checkout.session.completed` 并记下 event_id
- **操作步骤:** 1. `stripe events resend {event_id}` 2. 查看 Credit 余额与后端日志
- **预期结果:** Webhook 返回 200；Credit 余额不变；WARN `webhook_duplicate`（含 event_id）
- **测试数据:** event_id 重复次数 = 2
- **执行层:** E2E (ui-observable: 余额无变化) + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-007**: 同一 `event_id` 第三次以上重传 → 持续幂等
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 已经过 TC-006 的两次发送
- **操作步骤:** 1. 同一 event 第 3 次重发 2. 查看余额
- **预期结果:** 余额仍不变；持续 WARN `webhook_duplicate`；返回 200
- **测试数据:** event_id 重复次数 = 3
- **执行层:** Integration
- **可观测范围:** webhook-simulation + backend-only

**TC-PRD-WHK-008**: time_to_credit < 30 秒（性能目标）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 沙箱用户无订阅
- **操作步骤:** 1. 在 Stripe 托管页输入 4242 提交支付 2. 在 Mira 主界面实时观察 Credit 余额 3. 记录"支付按钮点击 → Credit 余额可见"的时间差
- **预期结果:** 时间差 < 30 秒；后端 `webhook_received` 与 `credit_granted` 日志时间差也 < 30s
- **测试数据:** 测量目标 <30s
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + backend-only

**TC-PRD-WHK-009**: time_to_credit 接近 60 秒告警阈值
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 防御性观察沙箱日常表现
- **操作步骤:** 1. 多次触发完整 Checkout 流程，记录 time_to_credit 2. 检查告警系统是否在 >60s 触发 P2 告警
- **预期结果:** 正常 <30s；如某次 >60s，触发 P2 告警 `credit_grant_delay`
- **测试数据:** 告警阈值 = 60s
- **执行层:** Integration
- **可观测范围:** backend-only

**TC-PRD-WHK-010**: 续费 Credit 重置 — 余额从 50 不应变成 50+TBD（reset vs grant）
- **优先级:** P0
- **测试类型:** 边界值分析
- **前置条件:** 沙箱用户已订阅 Starter，本月已消耗，UI 显示余额为 50
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid` 模拟下个账期续费 2. 在 Mira UI 查看 Credit 余额
- **预期结果:** Credit = Starter 满额（**不是 50 + 满额**）；后端日志 INFO `credit_reset` 含 old_balance=50 / new_balance=满额
- **测试数据:** old_balance=50
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-011**: Team 席位数 = 1（最小）→ Credit 重置为 TBD × 1
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 沙箱用户已订阅 Team，席位数 = 1
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid` 2. 查看余额
- **预期结果:** 余额 = Team 满额 × 1
- **测试数据:** seats=1
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-012**: Team 席位数极端值（100）→ Credit 按比例重置
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 沙箱手工创建 Team 订阅，席位数 = 100
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid` 2. 查看余额
- **预期结果:** 余额 = TBD × 100；DB 字段无溢出；UI 数字格式正确（含千位分隔符）
- **测试数据:** seats=100
- **执行层:** Integration（UI 可观测大数字格式）
- **可观测范围:** ui-observable + backend-only

**TC-PRD-WHK-013**: Stripe 写库失败后 3 天内自动重试成功
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 模拟 Credit Ledger 写入失败（DB 不可用 → 制造 500）
- **操作步骤:** 1. Mira 让首次写入失败返回 500 2. Stripe 数小时～3 天内自动重试 3. Mira 恢复后写入成功
- **预期结果:** 首次 500；后续重试中写入成功 → Credit 正常发放；日志展示首次 ERROR + 后续 INFO `credit_granted`；用户无重复 Credit
- **测试数据:** 重试窗口边界 = 3 天
- **执行层:** Integration
- **可观测范围:** backend-only

### 因果图（4）

**TC-PRD-WHK-014**: R1 - Happy Path（签名 + 白名单 + 用户存在 + 首次 + 写库 OK）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 沙箱用户已通过 UI 完成 Starter Checkout
- **操作步骤:** 1. Stripe CLI 触发 `checkout.session.completed` 2. 校验 HTTP 响应、Credit 余额、日志
- **预期结果:** HTTP 200；Credit = Starter 满额；INFO `credit_granted`；UI 余额对应
- **测试数据:** 标准沙箱事件
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + backend-only

**TC-PRD-WHK-015**: R3 - 签名通过但事件不在白名单
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 同 WHK-004
- **操作步骤:** 1. Stripe CLI 触发 `customer.created`（不在白名单） 2. 检查响应与日志
- **预期结果:** HTTP 200；不发放 Credit；只有 INFO `webhook_received`
- **测试数据:** event_type=customer.created
- **执行层:** Integration
- **可观测范围:** backend-only

**TC-PRD-WHK-016**: R4 - 用户 ID 映射失败
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** Stripe 沙箱手工创建 customer 但不通过 Mira 注册
- **操作步骤:** 1. Stripe CLI 针对该 customer 触发 `checkout.session.completed` 2. 检查 Mira 日志、Credit 表
- **预期结果:** Webhook 返回 200；ERROR `user_mapping_failed` 含 customer_id；Credit Ledger 无新记录；告警系统应触发人工排查
- **测试数据:** customer_id={未注册到 Mira}
- **执行层:** Integration / Unit
- **可观测范围:** backend-only

**TC-PRD-WHK-017**: R6 - DB 写入失败 → 返回 500，Stripe 重试
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 故障注入：DB 临时不可用
- **操作步骤:** 1. Stripe CLI 触发 `checkout.session.completed` 2. 检查响应、日志、Stripe Dashboard 事件状态
- **预期结果:** HTTP 500；ERROR 日志；Stripe Dashboard 显示 "Failed - will retry"；DB 恢复后 Stripe 重试成功 → Credit 最终发放
- **测试数据:** 故障注入
- **执行层:** Integration
- **可观测范围:** backend-only

### 状态迁移（7）

**TC-PRD-WHK-018**: 状态迁移 [no_subscription] → [active]（首次订阅）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 沙箱用户无订阅
- **操作步骤:** 1. UI 完成 Starter Checkout 2. Stripe CLI 触发 `checkout.session.completed` 3. 查看 Settings → Subscription 区域
- **预期结果:** 状态从 no_subscription → active；UI 显示当前计划 Starter；Credit 满额；下次续费日期可见
- **测试数据:** tier=Starter
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-019**: 状态迁移 [active] → [active]（续费 + Credit 重置）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户已订阅 Starter，本月已消耗 30 Credits
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid` 模拟下个账期 2. 查看 Credit 余额 + 周期结束时间
- **预期结果:** 状态保持 active；Credit 重置为满额；下次续费日期更新；后端日志 INFO `credit_reset` old_balance=(满额-30) / new_balance=满额
- **测试数据:** 跨账期模拟
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-020**: 状态迁移 [active] → [past_due]（扣款失败）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户已订阅 Individual，绑定续费失败的测试卡
- **操作步骤:** 1. Stripe CLI 触发 `invoice.payment_failed` 2. 在 Mira UI 定价页和 Settings 区域查看
- **预期结果:** 状态变 past_due；定价页显示警告"支付失败，请更新支付方式" + "管理订阅"按钮；用户仍可使用产品；后端日志记录 past_due 标记 + 通知发送
- **测试数据:** 测试卡：续费失败模式
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-021**: past_due 用户仍可正常使用产品（Phase 1 不做功能降级）
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 当前用户处于 past_due
- **操作步骤:** 1. 在 Mira 主界面发起一项常规任务 2. 检查任务能否正常执行 3. 查看 Credit 余额是否被消耗
- **预期结果:** 任务正常执行；Credit 按消耗扣减；不出现"无权限"提示；过期支付横幅持续显示
- **测试数据:** 任务类型：默认 AI 任务
- **执行层:** E2E
- **可观测范围:** ui-observable

**TC-PRD-WHK-022**: 状态迁移 [past_due] → [active]（Smart Retries 成功）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户当前 past_due
- **操作步骤:** 1. Stripe CLI 触发 `invoice.paid` 模拟 Smart Retries 成功 2. 查看 Mira UI 警告横幅、状态
- **预期结果:** 状态回到 active；past_due 警告横幅清除；Credit 重置满额；下次续费日期更新；日志记录状态变迁
- **测试数据:** 模拟 Smart Retries 第 2 次重试成功
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-023**: past_due 用户主动更新支付方式 → 立即重试 → 回 active
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户 past_due，准备 4242 卡
- **操作步骤:** 1. Settings → Subscription 跳转 Customer Portal 2. 在 Portal 中更新支付方式为 4242 3. Stripe 自动立即扣款 → 成功 4. 返回 Mira 查看
- **预期结果:** 状态回到 active；警告横幅清除；Credit 恢复满额；后端记录 invoice.paid
- **测试数据:** 替换卡号 4242
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-024**: 状态迁移 [past_due] → [canceled]（Smart Retries 全部失败 → REQ-009）
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** 用户 past_due，所有重试都失败
- **操作步骤:** 1. 模拟 Smart Retries 4 次全部失败 2. Stripe 触发 `customer.subscription.deleted` 3. 查看 Mira 状态
- **预期结果:** 状态变 canceled；UI 不再显示 past_due 横幅；Credit 保留至当前周期末（参考 REQ-009，本用例只验证迁移路径）
- **测试数据:** 跨用例引用 REQ-009
- **执行层:** Integration
- **可观测范围:** webhook-simulation + backend-only

### 场景法（4）

**TC-PRD-WHK-025**: 完整端到端场景 — 首次订阅 → 续费 → 扣款失败 → 恢复
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 全新沙箱用户；Stripe 沙箱与 Mira 后端配置完整；Stripe CLI 可用
- **操作步骤:** 1. 用户登录后选 Starter，完成 Stripe Checkout（4242 卡） 2. Stripe CLI 触发 `checkout.session.completed`，检查 Credit 满额 3. 在 Mira 内消耗 Credit 4. 触发 `invoice.paid` 模拟下月续费，检查 Credit 重置 5. 触发 `invoice.payment_failed`，检查 past_due 与警告横幅 6. 触发 `invoice.paid` 模拟 Smart Retries 成功，检查恢复 active
- **预期结果:** 整条链路在 UI 与后端日志各阶段一致
- **测试数据:** 沙箱全流程
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-026**: 场景 - 扣款失败但用户主动更新卡片立即恢复
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户已订阅 Individual，使用续费失败卡
- **操作步骤:** 1. Stripe CLI 触发 `invoice.payment_failed`，确认 past_due 2. 跳转 Customer Portal 更新支付方式为 4242 3. Stripe 自动立即扣款 → 触发 `invoice.paid` 4. 返回 Mira 查看
- **预期结果:** past_due 横幅消失；状态变 active；Credit 重置满额
- **测试数据:** 卡 4242
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

**TC-PRD-WHK-027**: 场景 - 续费时 Mira 后端短暂不可用，Stripe 在 3 天内重试成功
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户活跃订阅，进入续费窗口
- **操作步骤:** 1. 在续费 Webhook 到达时，Mira 后端处于不可用 2. Stripe 自动重试 3. 几分钟后 Mira 恢复，第二次或第三次重试成功
- **预期结果:** 最终 Credit 重置成功；用户无感知；后端日志可看到首次 ERROR + 后续 INFO `credit_reset`；Stripe Dashboard 事件 Succeeded
- **测试数据:** 模拟后端短暂故障
- **执行层:** Integration
- **可观测范围:** webhook-simulation + backend-only

**TC-PRD-WHK-028**: 场景 - 同一 event 在数小时内被多次重发，幂等保护持续生效
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 已通过 WHK-014 完成首次发放
- **操作步骤:** 1. 1 小时后 Stripe CLI 重发 2. 6 小时后再次重发 3. 24 小时后再次重发 4. 检查余额与日志
- **预期结果:** 各次返回 200；余额始终满额；日志依次 WARN `webhook_duplicate`
- **测试数据:** event_id 重复 4 次
- **执行层:** Integration
- **可观测范围:** webhook-simulation + backend-only

### 错误猜测（6）

**TC-PRD-WHK-029**: Webhook 端点同时收到大量并发事件 → 不丢、不重复
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 准备 10 个不同 customer 的事件
- **操作步骤:** 1. 脚本同时（并发）发送 10 个不同 event_id 的 `checkout.session.completed` 2. 等待几秒后检查每个用户的 Credit
- **预期结果:** 10 个用户各自收到正确档位 Credit；无串号；无重复发放；日志包含 10 条 `credit_granted`
- **测试数据:** 并发数=10
- **执行层:** Integration
- **可观测范围:** backend-only

**TC-PRD-WHK-030**: Webhook payload 关键 metadata 字段缺失 → 优雅降级或拒绝
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 手工构造 `checkout.session.completed` payload，缺 plan/tier metadata
- **操作步骤:** 1. Stripe CLI 或 mock POST 发送残缺 payload 2. 检查响应、日志、Credit 表
- **预期结果:** 后端识别字段缺失 → 返回 400 或 200 但不发 Credit；ERROR 日志清晰标识 missing field；不污染 Credit Ledger
- **测试数据:** payload 删除 metadata.tier
- **执行层:** Integration / Unit
- **可观测范围:** backend-only

**TC-PRD-WHK-031**: 同一 customer 短时间内连续创建多个 Checkout Session → 防重保障
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户首次订阅成功后，又一次发起 Checkout
- **操作步骤:** 1. 第一次 Checkout 成功 → 收到 `checkout.session.completed` 2. 用户再次发起 Checkout（如果 REQ-002 拦截失效） 3. 第二个 Checkout 成功 → 又收到 `checkout.session.completed`
- **预期结果:** 第二次 Webhook 应被识别为重复订阅 → 不再次发 Credit（依赖业务幂等：以 customer_id + 当前周期为去重键）；记录 WARN `duplicate_subscription_attempt`
- **测试数据:** 同 customer_id 的两个不同 event_id
- **执行层:** Integration
- **可观测范围:** backend-only

**TC-PRD-WHK-032**: Webhook 事件时间戳异常（严重未来时间）→ 系统接受但记录告警
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 构造 timestamp 为 +24h 的 webhook payload
- **操作步骤:** 1. 发送时间戳异常事件 2. 检查 Mira 行为
- **预期结果:** 处理逻辑不受时间戳影响（业务逻辑用 event_id 而非 timestamp 做幂等）；时间戳偏差过大可记录 WARN
- **测试数据:** event.created = now + 24h
- **执行层:** Unit / Integration
- **可观测范围:** backend-only

**TC-PRD-WHK-033**: past_due 用户邮箱无效 → 系统不崩溃
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 沙箱用户邮箱故意无效
- **操作步骤:** 1. Stripe CLI 触发 `invoice.payment_failed` 2. 检查 Mira 行为
- **预期结果:** 内部 past_due 标记仍生效；邮件送达失败被独立处理（ERROR 日志），不影响主流程；Stripe Revenue Recovery 邮件由 Stripe 直接发送
- **测试数据:** email=invalid-no-at-symbol
- **执行层:** Integration
- **可观测范围:** backend-only

**TC-PRD-WHK-034**: customer.subscription.updated 档位升级 → Credit 按新档位重置
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户从 Starter 升级到 Individual（通过 Customer Portal）
- **操作步骤:** 1. 用户在 Portal 完成升级 2. Stripe 触发 `customer.subscription.updated` 3. Mira UI 检查计划名 + Credit
- **预期结果:** 当前计划展示 "Individual"；Credit 按 Individual 满额重置；下次续费日期不变（升降级不重新计费日期）；日志记录档位变更
- **测试数据:** old_tier=Starter, new_tier=Individual
- **执行层:** E2E + Integration
- **可观测范围:** ui-observable + webhook-simulation

---

## 优先级与执行层统计

| 优先级 | 数量 | 占比 |
|--------|------|------|
| P0 | 12 | 35% |
| P1 | 14 | 41% |
| P2 | 8 | 24% |

| 执行层 | 数量 |
|--------|------|
| 仅 E2E (ui-observable) | 1 (TC-021) |
| E2E + Integration（全链路） | 13 |
| Integration（仅后端/webhook-simulation） | 17 |
| Integration / Unit（混合可由 Unit 替代） | 3 |

| 可观测范围 | 数量 | 备注 |
|------------|------|------|
| 含 ui-observable | 14 | 这些是 Playwright E2E 可见的部分 |
| webhook-simulation | 17 | 必须有 Stripe CLI / Test Mode 触发能力 |
| 仅 backend-only | 11 | 由日志/DB/告警系统验证，不入 Playwright spec |

---

## 注意事项与执行约束

1. **沙箱环境前置**：所有用例都依赖 Stripe Test Mode 的 customer / subscription / event 模拟能力，需要 Stripe CLI 在执行机上配置好；
2. **前端 E2E 边界**：Playwright 不能"触发" webhook，只能在 webhook 已被触发后断言 UI 结果。`webhook-simulation` 部分需要测试框架在测试 fixture 内调用 `stripe trigger ...` 或通过 Mira 的内部"模拟 webhook"测试 endpoint；
3. **time_to_credit 验证**：建议结合 PostHog / 后端日志双验证，UI 等待用 `expect.poll(...)` + 30s 超时；
4. **跨需求引用**：TC-024 涉及 REQ-009（订阅取消），仅做边界状态校验，详细取消流程在 REQ-009 文档中单独覆盖；
5. **TBD Credit 数值**：所有用例中 "TBD 满额" 在沙箱定下具体数值后须替换为实际数字，并复用为断言基线。

