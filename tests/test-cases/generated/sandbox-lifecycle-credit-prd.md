<!-- PRD-hash: 5FFB25A0543E13F52ECCDF89AA52C595EA628CD45B7865D01D3B728FB3838B78 | PRD-module: 沙箱生命周期管理与Credit计费 | feature-slug: sandbox-lifecycle-credit -->

# 测试用例：沙箱生命周期管理与 Credit 计费

**来源**: PRD V1.8 — 沙箱生命周期管理与 Credit 计费  
**覆盖需求**: REQ-001（沙箱生命周期管理）、REQ-002（成本计算与持久化）、REQ-003（Credit 纳入任务体系）  
**用例 ID 前缀**: TC-PRD-SLC-{NNN}  
**生成日期**: 2026-04-03

---

## Method 1: Equivalence Partitioning

### 等价类划分分析

#### REQ-001 沙箱工具调用触发条件

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|-----------|-----|----------|-----|
| 工具类型 | 沙箱工具（sb_file_create / sb_file_rewrite / sb_file_edit / sb_file_delete / sb_command_execute） | V1 | 非沙箱工具（search / people_search / company_search 等） | I1 |
| 沙箱初始状态（首次工具调用） | 沙箱不存在（null） | V2 | 沙箱已处于 running 状态 | V3 |
| 沙箱初始状态（后续工具调用） | 沙箱处于 paused 状态 | V4 | 沙箱处于 running 状态 | V5 |
| 任务状态（触发 pause） | COMPLETED / WAITING_FOR_USER / FAILED / INTERRUPTED | V6 | 任务处于 RUNNING 状态 | I2 |
| 当前是否有沙箱（pause 时） | 沙箱存在且为 running | V7 | 沙箱不存在（任务全程无沙箱工具调用） | V8 |

#### REQ-002 running_seconds 计算

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|-----------|-----|----------|-----|
| running_seconds 值 | 正整数（如 30、180、600） | V9 | 0（无运行时长） | V10 |
| 单次任务内 resume/pause 次数 | 单次（1次 resume → 1次 pause） | V11 | 多次（多次 resume → pause 循环） | V12 |

#### REQ-003 Credit 累积

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|-----------|-----|----------|-----|
| credit_raw 值 | < 1.0 的正浮点（如 0.2、0.8） | V13 | >= 1.0 的浮点（如 1.0、3.312） | V14 |
| session_sandbox_pending_credit 累积后是否跨越整数 | 累积后 >= 1（进位） | V15 | 累积后 < 1（不进位） | V16 |
| Session 结束时 pending_credit | > 0（需强制清算） | V17 | = 0（无需清算） | V18 |

### 有效等价类用例

**TC-PRD-SLC-001**: 首次沙箱工具调用时自动创建沙箱
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 任务已创建并启动；沙箱不存在（null）；用户未发起过任何沙箱工具调用
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面 `{PREVIEW_URL}/tasks`
  2. 通过 `mcp__chrome-devtools__fill` 在消息输入框输入触发沙箱的指令（如"帮我创建一个候选人名单文件"）
  3. 通过 `mcp__chrome-devtools__click` 点击发送按钮
  4. 通过 `mcp__chrome-devtools__wait_for` 等待 Agent 开始执行（工具调用气泡出现）
  5. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId
  6. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 验证 sandboxId 非空
  7. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证存在记录且 resumeAt 非空
  8. 等待任务完成后，再次查询 sandbox_run → 验证 pauseAt 非空、runningSeconds > 0
- **预期结果:**
  - chats.sandboxId 非空（沙箱已创建）
  - sandbox_run 表有记录：resumeAt 非空，pauseAt 非空（已暂停），runningSeconds = ceil((pauseAt - resumeAt)/1000)
  - costUsd = runningSeconds × 0.000046

**TC-PRD-SLC-002**: Paused 状态沙箱被工具调用自动恢复
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 任务存在且已有历史沙箱记录；沙箱当前处于 paused 状态（上一轮任务结束后）；用户在新一轮对话中发送消息触发 Agent 运行
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入已完成任务的详情页
  2. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 确认上一轮 pauseAt 非空（沙箱已 paused）
  3. 通过 `mcp__chrome-devtools__fill` 在消息输入框输入"继续执行下一步"
  4. 通过 `mcp__chrome-devtools__click` 点击发送按钮
  5. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用气泡出现
  6. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证新记录的 resumeAt 非空（沙箱已 resume）
  7. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成
  8. 再次查询 sandbox_run → 验证新记录的 pauseAt 非空、runningSeconds > 0
- **预期结果:**
  - 新的 sandbox_run 记录：resumeAt > 上一轮 pauseAt（沙箱从 paused 恢复）
  - sandboxId 与上一轮相同（复用沙箱实例）
  - runningSeconds = ceil((pauseAt - resumeAt)/1000)

**TC-PRD-SLC-003**: 非沙箱工具调用不触发沙箱创建
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 任务已创建；沙箱不存在；Agent 仅使用 search / people_search 等非沙箱工具
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面 `{PREVIEW_URL}/tasks`
  2. 通过 `mcp__chrome-devtools__fill` 在消息输入框输入纯搜索指令（如"搜索近期融资的科技公司"）
  3. 通过 `mcp__chrome-devtools__click` 点击发送按钮
  4. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成（COMPLETED 状态）
  5. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId
  6. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 验证 sandboxId 为空
  7. 执行 SQL: `SELECT COUNT(*) FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证为 0
  8. 执行 SQL: `SELECT COUNT(*) FROM mira_usage WHERE "taskId" = '{taskId}' AND type = 'sandbox'` → 验证为 0
- **预期结果:**
  - chats.sandboxId 为 NULL
  - sandbox_run 表无该 taskId 的记录
  - mira_usage 表无 type='sandbox' 的该 taskId 记录

**TC-PRD-SLC-004**: 已处于 running 的沙箱工具调用无需额外操作
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 任务运行中；沙箱当前已处于 running 状态（本轮首次工具调用后）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入需要多次沙箱工具调用的指令（如"创建候选人文件并执行数据处理脚本"）
  3. 通过 `mcp__chrome-devtools__click` 点击发送按钮
  4. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成
  5. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  6. 执行 SQL: `SELECT COUNT(*) FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证本轮仅一条 sandbox_run 记录（未重复 create/resume）
  7. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证 runningSeconds 为连续时长（无中断）
- **预期结果:**
  - 本轮仅生成 1 条 sandbox_run 记录
  - runningSeconds 为连续计算的总时长，无中间暂停

**TC-PRD-SLC-005**: 单次任务 running_seconds 正确计算（正整数）
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 任务已完成，沙箱经历了一次完整的 create → running → pause 周期；已知 resume_ts 和 pause_ts
- **操作步骤:**
  1. 创建任务并触发 Agent 执行沙箱工具调用（同 TC-001 步骤 1-5）
  2. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成（COMPLETED 状态）
  3. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'`
  4. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}'`
  5. 验证: runningSeconds = CEIL(EXTRACT(EPOCH FROM ("pauseAt" - "resumeAt")))
  6. 验证: costUsd = runningSeconds × 0.000046
  7. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  8. 验证: mira_usage.costSettled = sandbox_run.costUsd
  9. 执行 SQL: `SELECT * FROM mira_usage_meter WHERE "usageId" = '{mira_usage.id}'`
  10. 验证: quantity = sandbox_run.runningSeconds, meterName = 'sandbox_running_seconds'
  11. 执行 SQL: `SELECT * FROM mira_credit WHERE "usageId" = '{mira_usage.id}'`
  12. 执行 SQL: `SELECT "creditsPerUnit" FROM credit_rate WHERE currency = 'USD' AND "effectiveAt" <= NOW() AND ("expireAt" IS NULL OR "expireAt" > NOW()) ORDER BY "effectiveAt" DESC LIMIT 1`
  13. 验证: mira_credit.rawCreditAmount = mira_usage.costSettled × credit_rate.creditsPerUnit
- **预期结果:**
  - sandbox_run.runningSeconds = CEIL((pauseAt - resumeAt) / 1000)
  - sandbox_run.costUsd = runningSeconds × 0.000046
  - mira_usage.costSettled = sandbox_run.costUsd，type = 'sandbox'，pricingSource = 'e2b'
  - mira_usage_meter.quantity = runningSeconds，meterName = 'sandbox_running_seconds'，unit = 'second'
  - mira_credit.rawCreditAmount = costSettled × creditsPerUnit

**TC-PRD-SLC-006**: credit_raw < 1 时不在单次任务展示 Credit 变化
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户 session 中第 1 个任务完成，running 约 30s（costUsd 较小）；mira_credit_ledger 中该 session 无前置记录
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用（同 TC-001 步骤 1-5），等待 COMPLETED
  2. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}'`
  3. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  4. 执行 SQL: `SELECT * FROM mira_credit WHERE "usageId" = '{mira_usage.id}'`
  5. 执行 SQL: `SELECT "creditsPerUnit" FROM credit_rate WHERE currency = 'USD' AND "effectiveAt" <= NOW() AND ("expireAt" IS NULL OR "expireAt" > NOW()) ORDER BY "effectiveAt" DESC LIMIT 1`
  6. 验证: rawCreditAmount = costSettled × creditsPerUnit < 1.0
  7. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  8. 验证 carry 机制: 若 sumRaw + carryBefore < 1.0，则 amount = 0，carryAfter = sumRaw + carryBefore
- **预期结果:**
  - mira_credit.rawCreditAmount < 1.0
  - mira_credit_ledger.amount = 0（未扣减整数 Credit）或 amount = -floor(sumRaw + carryBefore)
  - carryAfter = (sumRaw + carryBefore) - floor(sumRaw + carryBefore)

**TC-PRD-SLC-007**: credit_raw 累积超过 1 时向任务 Credit 进位
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 前置任务已产生 carry 余量（如 carryAfter = 0.2）；当前任务完成后 rawCreditAmount 使累积超过 1.0
- **操作步骤:**
  1. 创建第 1 个任务并触发沙箱工具（运行约 30s），等待 COMPLETED
  2. 执行 SQL: `SELECT "carryAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId_1}' ORDER BY "createdAt" DESC LIMIT 1` → 记录 carryAfter_1
  3. 创建第 2 个任务并触发沙箱工具（运行更长时间），等待 COMPLETED
  4. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId_2}' ORDER BY "createdAt" DESC LIMIT 1`
  5. 验证: carryBefore = carryAfter_1（上一轮的 carry 传递）
  6. 验证: amount = -floor(sumRaw + carryBefore)，其中 floor(sumRaw + carryBefore) >= 1
  7. 验证: carryAfter = (sumRaw + carryBefore) - floor(sumRaw + carryBefore)
- **预期结果:**
  - mira_credit_ledger.carryBefore = 上一轮 carryAfter
  - amount = -floor(sumRaw + carryBefore)，绝对值 >= 1（进位发生）
  - carryAfter < 1.0
  - balanceAfter = balanceBefore + amount

**TC-PRD-SLC-008**: Session 结束时 pending_credit 向上取整强制清算
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 前置任务产生了 carryAfter > 0（如 0.3）；用户关闭 session
- **操作步骤:**
  1. 创建任务并触发沙箱工具，等待 COMPLETED
  2. 执行 SQL: `SELECT "carryAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 确认 carryAfter > 0
  3. 通过 `mcp__chrome-devtools__click` 点击"结束 Session"按钮（或关闭页面触发 session 结束）
  4. 执行 SQL: `SELECT * FROM mira_credit_ledger WHERE "userId" = '{userId}' ORDER BY "createdAt" DESC LIMIT 1` → 检查清算记录
  5. 验证: 清算记录的 amount 包含对 carryAfter 的向上取整
- **预期结果:**
  - Session 结束后 mira_credit_ledger 新增清算记录
  - carryAfter > 0 被向上取整纳入 amount 扣减
  - 最终 carryAfter = 0（清算完毕）

### 无效等价类用例

**TC-PRD-SLC-009**: RUNNING 状态任务不触发沙箱 pause
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 任务处于 RUNNING 状态；沙箱已创建并处于 running
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用（同 TC-001 步骤 1-5）
  2. 在 Agent 执行工具调用期间（任务仍为 RUNNING 状态），立即执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  3. 验证: pauseAt IS NULL（沙箱仍在运行，未被 pause）
  4. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成
  5. 再次查询 sandbox_run → 验证 pauseAt 非空（任务结束后才 pause）
- **预期结果:**
  - 任务 RUNNING 期间 sandbox_run.pauseAt IS NULL（沙箱持续运行）
  - 任务结束后 sandbox_run.pauseAt 非空（状态变更才触发 pause）

---

## Method 2: Boundary Value Analysis

### 边界值分析

#### REQ-002 running_seconds 边界

**Step 1**: running_seconds 的边界：最小值 0（无运行），实际最小有效值 1 秒，大值无明确上限（实际受任务时长限制）。

**Step 2**: 关键边界点：
- 0 秒：沙箱从未 running（合法边界，credit_raw = 0）
- 1 秒：最短有效运行时长
- 毫秒级精度：如 0.4 秒取整为 1 秒；0.5 秒取整为 1 秒（向上取整）

#### REQ-003 Credit 累积边界

**Step 1**: pending_credit 的进位边界在整数处（1.0、2.0、3.0…）

**Step 2**: 关键边界点：
- pending_credit = 0.999... → 不进位
- pending_credit = 1.000 → 进位，increment = 1
- pending_credit = 1.001 → 进位 1，剩余 0.001

**TC-PRD-SLC-010**: running_seconds = 0 时 Credit 正常写入为 0
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 任务完成但全程无沙箱工具调用（running_seconds = 0）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入纯搜索指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待任务 COMPLETED
  5. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  6. 执行 SQL: `SELECT COUNT(*) FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证为 0
  7. 执行 SQL: `SELECT COUNT(*) FROM mira_usage WHERE "taskId" = '{taskId}' AND type = 'sandbox'` → 验证为 0
- **预期结果:**
  - sandbox_run 表无记录
  - mira_usage 表无 type='sandbox' 记录
  - 系统正常完成，不报错

**TC-PRD-SLC-011**: running_seconds = 1 时最小计费单位验证
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 任务完成，沙箱实际运行恰好 1 秒（resume_ts 到 pause_ts 差值 = 1000ms）
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用，等待 COMPLETED（需运行时间极短的指令）
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 执行 SQL: `SELECT "runningSeconds", "costUsd" FROM sandbox_run WHERE "taskId" = '{taskId}'`
  4. 验证: runningSeconds >= 1（最小计费单位）
  5. 验证: costUsd = runningSeconds × 0.000046
  6. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  7. 执行 SQL: `SELECT * FROM mira_usage_meter WHERE "usageId" = '{mira_usage.id}'`
  8. 验证: mira_usage_meter.quantity = runningSeconds
- **预期结果:**
  - sandbox_run.runningSeconds >= 1
  - costUsd = runningSeconds × 0.000046（如 1 × 0.000046 = 0.000046）
  - mira_usage_meter.quantity = runningSeconds，无精度丢失

**TC-PRD-SLC-012**: 毫秒级 running_seconds 向上取整至秒
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 任务完成，沙箱实际运行时间为非整数秒（如 30.4 秒 = 30400ms）
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用，等待 COMPLETED
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 执行 SQL: `SELECT "resumeAt", "pauseAt", "runningSeconds" FROM sandbox_run WHERE "taskId" = '{taskId}'`
  4. 计算实际差值: EXTRACT(EPOCH FROM ("pauseAt" - "resumeAt"))
  5. 验证: runningSeconds = CEIL(实际差值秒数)（向上取整）
- **预期结果:**
  - 若实际差值为 30.4s，runningSeconds = 31（向上取整）
  - costUsd 基于取整后的 31s 计算

**TC-PRD-SLC-013**: pending_credit 恰好等于 1.0 时触发进位
- **优先级:** P0
- **测试类型:** 边界值分析
- **前置条件:** mira_credit_ledger 中前置 carryAfter = 0.0；当前任务的 rawCreditAmount 恰好 = 1.0
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用，等待 COMPLETED
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}'`
  4. 执行 SQL: `SELECT * FROM mira_credit WHERE "usageId" = '{mira_usage.id}'`
  5. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  6. 验证: 当 sumRaw + carryBefore = 1.0 时，amount = -1，carryAfter = 0.0
- **预期结果:**
  - mira_credit_ledger.amount = -floor(1.0) = -1
  - mira_credit_ledger.carryAfter = 0.0（进位后无余数）

**TC-PRD-SLC-014**: pending_credit = 0.999 时不触发进位
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** mira_credit_ledger 前置 carryAfter 累积值使 sumRaw + carryBefore = 0.999
- **操作步骤:**
  1. 通过多个小任务累积 carry 接近但不到 1.0
  2. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  3. 验证: 当 sumRaw + carryBefore = 0.999 时，amount = 0，carryAfter = 0.999
- **预期结果:**
  - mira_credit_ledger.amount = -floor(0.999) = 0（不扣减）
  - mira_credit_ledger.carryAfter = 0.999

**TC-PRD-SLC-015**: 多次 resume/pause 时长累加验证
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 同一任务内发生多次 resume/pause 循环（如需 HITL 确认场景）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入需要确认的指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待第 1 轮工具完成（WAITING_FOR_USER）
  5. 通过 `mcp__chrome-devtools__fill` 输入"确认，继续"
  6. 通过 `mcp__chrome-devtools__click` 点击发送
  7. 通过 `mcp__chrome-devtools__wait_for` 等待任务 COMPLETED
  8. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  9. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC`
  10. 验证: 存在多条 sandbox_run 记录，每条有独立的 resumeAt/pauseAt
  11. 验证: 各段 runningSeconds 之和 = 总 running 时长
  12. 执行 SQL: `SELECT SUM("runningSeconds") as total FROM sandbox_run WHERE "taskId" = '{taskId}'`
- **预期结果:**
  - sandbox_run 有多条记录，每条 resumeAt < pauseAt
  - SUM(runningSeconds) = 各段时长总和
  - 各段 costUsd 分别按各自 runningSeconds × 0.000046 计算

---

## Method 3: Cause-Effect Graph / Decision Table

### 因果图分析

**原因（输入条件）**：
- C1: 工具是否为沙箱工具类型
- C2: 沙箱当前状态（不存在 / paused / running）
- C3: 任务结束状态（COMPLETED / WAITING_FOR_USER / FAILED / INTERRUPTED / RUNNING）

**效果（输出结果）**：
- E1: 创建新沙箱（Sandbox.create）
- E2: 恢复沙箱（sandbox.connect/resume）
- E3: 不做任何沙箱操作
- E4: 执行 pause 并计算 Credit
- E5: 执行 pause 但不触发 session 清算

**决策表**：

| 规则 | C1(沙箱工具) | C2(沙箱状态) | C3(任务状态) | E1(创建) | E2(恢复) | E3(无操作) | E4(pause+Credit) | E5(pause不清算) |
|------|------------|------------|------------|---------|---------|----------|----------------|----------------|
| R1 | Y | 不存在 | RUNNING | Y | N | N | N | N |
| R2 | Y | paused | RUNNING | N | Y | N | N | N |
| R3 | Y | running | RUNNING | N | N | Y | N | N |
| R4 | N | 任意 | RUNNING | N | N | Y | N | N |
| R5 | - | running | COMPLETED | N | N | N | Y | N |
| R6 | - | running | WAITING_FOR_USER | N | N | N | N | Y |
| R7 | - | running | FAILED | N | N | N | N | Y |
| R8 | - | running | INTERRUPTED | N | N | N | N | Y |
| R9 | - | 不存在/paused | 任意终止 | N | N | Y | N | N |

**TC-PRD-SLC-016**: 沙箱不存在时首次沙箱工具调用触发 create（R1）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 任务处于 RUNNING 状态；沙箱不存在；Agent 即将调用 sb_file_create
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入触发 sb_file_create 的指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用气泡出现
  5. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  6. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 验证 sandboxId 非空
  7. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证 resumeAt 非空（create + 开始 running）
- **预期结果:**
  - chats.sandboxId 非空
  - sandbox_run 有记录，resumeAt 非空
  - 沙箱通过 Sandbox.create({ lifecycle: { onTimeout: 'pause' } }) 创建

**TC-PRD-SLC-017**: 沙箱处于 paused 时沙箱工具调用触发 resume（R2）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 任务处于 RUNNING 状态；沙箱处于 paused 状态；Agent 调用 sb_command_execute
- **操作步骤:**
  1. 确保前置任务已完成（沙箱已 paused）
  2. 通过 `mcp__chrome-devtools__fill` 在消息输入框输入"执行命令脚本"
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用气泡出现
  5. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  6. 验证: 新记录的 resumeAt 非空（sandbox.connect/resume 已调用）
- **预期结果:**
  - 新的 sandbox_run 记录：resumeAt 非空
  - sandboxId 与前一轮相同

**TC-PRD-SLC-018**: 非沙箱工具调用不影响沙箱状态（R4）
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 任务处于 RUNNING 状态；沙箱处于 paused 状态；Agent 调用 search 工具
- **操作步骤:**
  1. 确保沙箱处于 paused（前置任务已完成）
  2. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 记录当前 sandbox_run 数量
  3. 通过 `mcp__chrome-devtools__fill` 输入纯搜索指令
  4. 通过 `mcp__chrome-devtools__click` 点击发送
  5. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成
  6. 再次执行 SQL: `SELECT COUNT(*) FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证记录数不变
- **预期结果:**
  - sandbox_run 记录数不变（无新的 resume/create）
  - 沙箱保持 paused 状态

**TC-PRD-SLC-019**: 任务 COMPLETED 触发 pause 并写入 Credit（R5）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 任务正在 RUNNING；沙箱处于 running 状态；Agent 完成所有工具调用，任务即将标记为 COMPLETED
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用（同 TC-001 步骤 1-5），等待 COMPLETED
  2. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  3. 验证: pauseAt 非空，runningSeconds > 0，costUsd > 0
  4. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  5. 验证: status = 'completed'，costSettled = sandbox_run.costUsd
  6. 执行 SQL: `SELECT * FROM mira_credit WHERE "usageId" = '{mira_usage.id}'`
  7. 执行 SQL: `SELECT * FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  8. 验证: ledger 记录存在，amount 和 carryAfter 按公式正确计算
- **预期结果:**
  - sandbox_run.pauseAt 非空（pause 已执行）
  - mira_usage 记录：type='sandbox'，status='completed'
  - mira_credit 记录：rawCreditAmount = costSettled × creditsPerUnit
  - mira_credit_ledger 记录：idempotencyKey 格式正确

**TC-PRD-SLC-020**: 任务 WAITING_FOR_USER 触发 pause 但不清算（R6）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 任务正在 RUNNING；沙箱处于 running；Agent 需要用户输入，任务即将进入 WAITING_FOR_USER
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入需要确认的指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待 WAITING_FOR_USER 状态
  5. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  6. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  7. 验证: pauseAt 非空（pause 已执行），runningSeconds > 0
  8. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  9. 验证: mira_usage 记录存在，costSettled = sandbox_run.costUsd
- **预期结果:**
  - sandbox_run.pauseAt 非空（WAITING_FOR_USER 触发 pause）
  - mira_usage 记录写入（增量成本记录）
  - 用户继续发消息后下一轮会生成新的 sandbox_run 记录

**TC-PRD-SLC-021**: 任务 FAILED 触发 pause 按实际时长写入不清算（R7）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 任务正在 RUNNING；沙箱处于 running；Agent 执行中发生系统异常，任务即将标记为 FAILED
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用，任务因异常变为 FAILED
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  4. 验证: pauseAt 非空，runningSeconds > 0（按实际运行时长写入）
  5. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  6. 验证: mira_usage 记录存在，costSettled = sandbox_run.costUsd
- **预期结果:**
  - sandbox_run.pauseAt 非空（FAILED 也触发 pause）
  - costUsd 按实际 runningSeconds 计算
  - mira_usage 记录写入（部分成本记录）

**TC-PRD-SLC-022**: 任务 INTERRUPTED 触发 pause 按实际时长写入不清算（R8）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 任务正在 RUNNING；沙箱处于 running；用户主动中断任务
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用
  2. 在 Agent 执行过程中，通过 `mcp__chrome-devtools__click` 点击"停止"按钮
  3. 通过 `mcp__chrome-devtools__wait_for` 等待任务变为 INTERRUPTED
  4. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  5. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  6. 验证: pauseAt 非空，runningSeconds > 0
  7. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  8. 验证: mira_usage 记录存在
- **预期结果:**
  - sandbox_run.pauseAt 非空（INTERRUPTED 触发 pause）
  - costUsd 按实际 runningSeconds 计算
  - mira_usage 记录写入

**TC-PRD-SLC-023**: 沙箱不存在时任务终止不触发 pause（R9）
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 任务全程无沙箱工具调用，沙箱不存在；任务状态变更为 COMPLETED
- **操作步骤:**
  1. 创建纯搜索任务（同 TC-003 步骤 1-5），等待 COMPLETED
  2. 执行 SQL: `SELECT COUNT(*) FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证为 0
  3. 执行 SQL: `SELECT COUNT(*) FROM mira_usage WHERE "taskId" = '{taskId}' AND type = 'sandbox'` → 验证为 0
- **预期结果:**
  - sandbox_run 无记录（沙箱不存在，无 pause）
  - mira_usage 无 type='sandbox' 记录
  - 无异常错误

---

## Method 4: State Transition Testing

### 状态迁移分析

**Step 1 - 识别所有状态**：
- 状态 S0: 沙箱不存在（null）
- 状态 S1: 沙箱 running
- 状态 S2: 沙箱 paused
- （补充）任务状态：RUNNING / COMPLETED / WAITING_FOR_USER / FAILED / INTERRUPTED

**Step 2 - 识别迁移事件**：
- E1: Agent 首次调用沙箱工具 → S0 → S1 (create)
- E2: Agent 调用沙箱工具（沙箱已 paused） → S2 → S1 (resume)
- E3: 任务状态变为终止状态（COMPLETED/FAILED/INTERRUPTED/WAITING_FOR_USER） → S1 → S2 (pause)
- E4: 非沙箱工具调用 → 状态不变
- E5: 任务终止但沙箱不存在 → S0 → S0（无操作）

**Step 3 - 状态迁移表**：

| 当前状态 | 触发事件 | 目标状态 | 是否有效 |
|---------|---------|---------|---------|
| S0（不存在） | E1（首次沙箱工具调用） | S1（running） | 是 |
| S0（不存在） | E3（任务终止） | S0（不变） | 是（无操作） |
| S1（running） | E2（沙箱工具调用） | S1（running） | 是（已 running 无需操作） |
| S1（running） | E3（任务 COMPLETED） | S2（paused） | 是 |
| S1（running） | E3（任务 WAITING_FOR_USER） | S2（paused） | 是 |
| S1（running） | E3（任务 FAILED） | S2（paused） | 是 |
| S1（running） | E3（任务 INTERRUPTED） | S2（paused） | 是 |
| S2（paused） | E2（后续沙箱工具调用） | S1（running） | 是 |
| S2（paused） | E4（非沙箱工具调用） | S2（不变） | 是（无操作） |
| S2（paused） | E3（任务终止） | S2（不变） | 是（已 paused 无需操作） |

**TC-PRD-SLC-024**: 完整生命周期：创建 → Running → Paused（COMPLETED）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 任务已创建并启动；沙箱不存在
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入沙箱工具触发指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用气泡出现（S0→S1 create）
  5. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  6. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 验证非空（S1 状态）
  7. 通过 `mcp__chrome-devtools__wait_for` 等待任务 COMPLETED（S1→S2 pause）
  8. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证 resumeAt 和 pauseAt 均非空
  9. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  10. 执行 SQL: `SELECT * FROM mira_credit WHERE "usageId" = '{mira_usage.id}'`
- **预期结果:**
  - 完整状态路径 S0→S1→S2
  - sandbox_run: resumeAt 非空（create），pauseAt 非空（pause），runningSeconds > 0
  - mira_usage: type='sandbox'，status='completed'
  - mira_credit: rawCreditAmount = costSettled × creditsPerUnit

**TC-PRD-SLC-025**: 多轮对话生命周期：Paused → Running → Paused（跨轮）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 第 1 轮任务已完成，沙箱处于 paused（S2）；用户发起第 2 轮对话
- **操作步骤:**
  1. 执行 TC-024 完成第 1 轮（沙箱 S2）
  2. 通过 `mcp__chrome-devtools__fill` 输入第 2 轮指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待第 2 轮完成
  5. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC`
  6. 验证: 存在 2+ 条记录，第 2 条 resumeAt > 第 1 条 pauseAt（跨轮间隙不计费）
  7. 验证: 各条记录 sandboxId 相同（复用沙箱）
- **预期结果:**
  - sandbox_run 有多条记录
  - 第 2 轮 resumeAt > 第 1 轮 pauseAt（S2→S1 resume）
  - 跨轮间隙（两次 pause 之间）不产生 sandbox_run 记录
  - sandboxId 一致

**TC-PRD-SLC-026**: WAITING_FOR_USER 后 Resume 再次计时
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 任务因 WAITING_FOR_USER 触发 pause（S1→S2）；沙箱文件系统完整保留
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入需要确认的指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待 WAITING_FOR_USER
  5. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  6. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 pauseAt 非空（第 1 轮 pause）
  7. 通过 `mcp__chrome-devtools__fill` 输入"确认，继续"
  8. 通过 `mcp__chrome-devtools__click` 点击发送
  9. 通过 `mcp__chrome-devtools__wait_for` 等待 COMPLETED
  10. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC`
  11. 验证: 第 2 条记录的 resumeAt > 第 1 条 pauseAt，且 pauseAt 非空
  12. 验证: 两段 runningSeconds 分别独立计算
- **预期结果:**
  - WAITING 期间（S2 状态）无 sandbox_run 活跃记录
  - 第 2 轮从新 resumeAt 开始计时
  - 两段 runningSeconds 分别记录并累加

**TC-PRD-SLC-027**: 非法迁移：Running 状态任务中途不自动 pause（单轮内连续工具调用）
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 任务处于 RUNNING；沙箱处于 running（S1）；Agent 正在执行多个工具调用
- **操作步骤:**
  1. 创建任务触发多个沙箱工具调用（同 TC-004 步骤 1-5）
  2. 执行 SQL: `SELECT COUNT(*) FROM sandbox_run WHERE "taskId" = '{taskId}'`
  3. 验证: 本轮仅 1 条 sandbox_run 记录（工具调用间隙沙箱不 pause）
  4. 验证: 该记录的 pauseAt IS NULL 或仅在任务结束后非空
- **预期结果:**
  - 单轮内仅 1 条 sandbox_run 记录
  - runningSeconds 为连续时长

**TC-PRD-SLC-028**: 断线重连后若任务非 RUNNING 立即 pause
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户刷新页面或断线重连；任务实际状态为非 RUNNING（如已 COMPLETED），但沙箱仍处于 running（S1）
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用
  2. 通过 `mcp__chrome-devtools__navigate_page` 模拟页面刷新/重连
  3. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  4. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' AND "pauseAt" IS NULL` → 检查是否有未关闭的 running 记录
  5. 等待系统检测并执行补偿 pause
  6. 再次查询: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 pauseAt 非空
- **预期结果:**
  - 系统检测到异常状态后立即执行 pause
  - sandbox_run.pauseAt 补充写入
  - runningSeconds 正确计算，无空转计费

---

## Method 5: Scenario Method

### 场景法分析

**基本流（Basic Flow）**：
用户发起寻访任务 → Agent 调用沙箱工具执行文件创建 → 沙箱自动创建并运行 → Agent 完成任务 → 沙箱 pause → running_seconds 写入 DB → credit_raw 计算 → session pending 累积 → （多任务后）Credit 进位显示

**备选流**：
- AF1: 任务全程无沙箱工具调用（纯搜索任务）
- AF2: 任务中途 WAITING_FOR_USER（多轮对话）
- AF3: 任务异常 FAILED（沙箱 pause，不清算）
- AF4: 用户主动中断（INTERRUPTED）
- AF5: Resume 失败（重试三次后返回错误）
- AF6: 沙箱被 E2B 平台异常回收（重建流程）
- AF7: Pause 失败（记录 WARN，继续执行）
- AF8: 多个任务累积 Credit 跨越整数边界

**TC-PRD-SLC-029**: 完整正向场景：寻访任务从创建到 Credit 记录
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录，会话中无历史沙箱记录；session_sandbox_pending_credit 初始为 0
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面 `{PREVIEW_URL}/tasks`
  2. 通过 `mcp__chrome-devtools__fill` 输入寻访指令（如"寻访互联网行业 10 年经验技术负责人，创建候选人档案并执行初步匹配"）
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用气泡出现（沙箱 create）
  5. 通过 `mcp__chrome-devtools__wait_for` 等待任务 COMPLETED
  6. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  7. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 验证非空
  8. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}'`
  9. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  10. 执行 SQL: `SELECT * FROM mira_usage_meter WHERE "usageId" = '{mira_usage.id}' AND "meterName" = 'sandbox_running_seconds'`
  11. 执行 SQL: `SELECT * FROM mira_credit WHERE "usageId" = '{mira_usage.id}'`
  12. 执行 SQL: `SELECT "creditsPerUnit" FROM credit_rate WHERE currency = 'USD' AND "effectiveAt" <= NOW() AND ("expireAt" IS NULL OR "expireAt" > NOW()) ORDER BY "effectiveAt" DESC LIMIT 1`
  13. 执行 SQL: `SELECT * FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  14. 验证完整计费链: runningSeconds → costUsd → mira_usage.costSettled → rawCreditAmount → ledger.amount
- **预期结果:**
  - 沙箱创建（S0→S1）→ 任务完成 pause（S1→S2）
  - sandbox_run: runningSeconds = ceil((pauseAt - resumeAt)/1000)，costUsd = runningSeconds × 0.000046
  - mira_usage: type='sandbox'，costSettled = costUsd，pricingSource='e2b'
  - mira_usage_meter: meterName='sandbox_running_seconds'，quantity=runningSeconds，unit='second'
  - mira_credit: rawCreditAmount = costSettled × creditsPerUnit
  - mira_credit_ledger: amount = -floor(sumRaw + carryBefore)，carryAfter = (sumRaw + carryBefore) - floor(sumRaw + carryBefore)

**TC-PRD-SLC-030**: 纯搜索任务场景（无沙箱工具调用）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户发起仅需搜索的任务（如"搜索近期融资的公司"）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入纯搜索指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待任务 COMPLETED
  5. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  6. 执行 SQL: `SELECT COUNT(*) FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证为 0
  7. 执行 SQL: `SELECT COUNT(*) FROM mira_usage WHERE "taskId" = '{taskId}' AND type = 'sandbox'` → 验证为 0
- **预期结果:**
  - sandbox_run 无记录
  - mira_usage 无 type='sandbox' 记录
  - 任务 Credit 仅含 LLM 和工具费用，无沙箱项

**TC-PRD-SLC-031**: 多轮对话场景（WAITING_FOR_USER 跨轮计费）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户开始一个需要人工确认的任务（HITL 场景）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入任务页面
  2. 通过 `mcp__chrome-devtools__fill` 输入 HITL 指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待 WAITING_FOR_USER
  5. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  6. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC` → 第 1 轮记录：pauseAt 非空
  7. 通过 `mcp__chrome-devtools__fill` 输入"确认，请继续执行后续匹配步骤"
  8. 通过 `mcp__chrome-devtools__click` 点击发送
  9. 通过 `mcp__chrome-devtools__wait_for` 等待 COMPLETED
  10. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC`
  11. 验证: 两条记录，第 1 条 runningSeconds（第 1 轮），第 2 条 runningSeconds（第 2 轮）
  12. 执行 SQL: `SELECT SUM("runningSeconds") as total, SUM("costUsd") as "totalCost" FROM sandbox_run WHERE "taskId" = '{taskId}'`
  13. 验证: 总 runningSeconds = 各段之和
- **预期结果:**
  - 第 1 轮 sandbox_run: pauseAt 非空，runningSeconds 为第 1 轮时长
  - 等待期间无 sandbox_run 活跃记录
  - 第 2 轮 sandbox_run: resumeAt > 第 1 轮 pauseAt
  - 总 costUsd = SUM(各段 costUsd)

**TC-PRD-SLC-032**: 任务失败场景（FAILED 不触发 session 清算）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 任务正在运行，沙箱处于 running 状态（已运行 45s）；系统发生异常导致 Agent 报错
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用，任务因异常变为 FAILED
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}'`
  4. 验证: pauseAt 非空，runningSeconds > 0，costUsd > 0
  5. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
  6. 验证: mira_usage 记录存在（部分成本已写入）
- **预期结果:**
  - sandbox_run.pauseAt 非空（FAILED 触发 pause）
  - mira_usage 记录写入（部分成本）
  - 按实际 runningSeconds 计算 costUsd

**TC-PRD-SLC-033**: 用户中断场景（INTERRUPTED 后沙箱立即 pause）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 任务运行中，沙箱处于 running（已运行 20s）；用户点击停止按钮
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用
  2. 在 Agent 执行过程中，通过 `mcp__chrome-devtools__click` 点击"停止"按钮
  3. 通过 `mcp__chrome-devtools__wait_for` 等待 INTERRUPTED 状态
  4. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  5. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}'`
  6. 验证: pauseAt 非空，runningSeconds > 0
  7. 执行 SQL: `SELECT * FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'`
- **预期结果:**
  - sandbox_run.pauseAt 非空（立即 pause）
  - costUsd 按实际 runningSeconds 计算
  - mira_usage 记录写入

**TC-PRD-SLC-034**: 多任务累积 Credit 跨整数场景
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户在同一 session 中连续执行多个任务，每个 credit_raw 较小
- **操作步骤:**
  1. 创建并完成任务 1（沙箱工具调用，短时间运行），提取 taskId_1
  2. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount FROM mira_credit_ledger WHERE "taskId" = '{taskId_1}' ORDER BY "createdAt" DESC LIMIT 1`
  3. 记录 carryAfter_1
  4. 创建并完成任务 2，提取 taskId_2
  5. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount FROM mira_credit_ledger WHERE "taskId" = '{taskId_2}' ORDER BY "createdAt" DESC LIMIT 1`
  6. 验证: carryBefore_2 = carryAfter_1（carry 传递正确）
  7. 创建并完成任务 3（使累积超过整数边界），提取 taskId_3
  8. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId_3}' ORDER BY "createdAt" DESC LIMIT 1`
  9. 验证: amount = -floor(sumRaw + carryBefore)，|amount| >= 1（进位发生）
  10. 验证: carryAfter = (sumRaw + carryBefore) - floor(sumRaw + carryBefore)
- **预期结果:**
  - 任务 1-2: amount = 0 或极小（未进位），carry 逐步累积
  - 任务 3: amount 绝对值 >= 1（进位发生），carryAfter < 1.0
  - 全程 carry 传递正确：每条 carryBefore = 上一条 carryAfter

**TC-PRD-SLC-035**: Resume 失败重试场景（3次重试后返回错误）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 沙箱处于 paused 状态；E2B API 出现超时异常；Agent 调用沙箱工具触发 resume
- **操作步骤:**
  1. 确保沙箱处于 paused（前置任务已完成）
  2. 通过 `mcp__chrome-devtools__fill` 输入沙箱工具触发指令
  3. 通过 `mcp__chrome-devtools__click` 点击发送
  4. 通过 `mcp__chrome-devtools__wait_for` 等待错误提示出现
  5. 通过 `mcp__chrome-devtools__evaluate_script` 检查页面是否显示错误信息 "Something went wrong while preparing your workspace. Please try again."
  6. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  7. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 检查是否有 resume 失败记录
- **预期结果:**
  - 指数退避重试 3 次（间隔 1s/2s/4s）
  - 工具返回失败，任务不中断
  - 用户看到错误提示信息

---

## Method 6: Error Guessing

### 错误猜测分析

**Step 1 - 识别易错区域**：
1. **并发问题**: 同一用户多个 Tab 同时操作同一任务/沙箱
2. **时间戳精度**: 毫秒级时间戳在跨时区、服务器时钟偏移时的异常
3. **服务重启丢失状态**: 服务重启时内存中 resume_ts 丢失，无法计算 running_seconds
4. **Credit 浮点精度**: 多次累积浮点数运算可能引入精度误差
5. **E2B 平台异常**: 沙箱被 E2B 平台意外回收（超出预期的重置）
6. **Pause 失败无告警**: pause 失败仅记录 WARN 但继续执行，可能导致沙箱空转计费
7. **重复创建**: create 信号被重复发送，可能创建多个沙箱
8. **Session 结束时机**: 用户关闭浏览器 Tab 时 Session 结束信号是否可靠触发清算

**TC-PRD-SLC-036**: 服务重启后从 DB 恢复 running_seconds_total
- **优先级:** P0
- **测试类型:** 错误猜测
- **前置条件:** 任务正在运行（沙箱 running，已运行 60s）；resume_ts 已写入 DB；服务发生重启（模拟）
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' AND "pauseAt" IS NULL` → 确认有活跃的 running 记录
  4. 模拟服务重启（按环境操作）
  5. 服务恢复后执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  6. 验证: 服务恢复后 runningSeconds 从 DB 中 resumeAt 正确计算补偿
- **预期结果:**
  - 服务重启后 sandbox_run 数据完整（resume_ts 已持久化）
  - 不依赖内存状态
  - Credit 计算不丢失

**TC-PRD-SLC-037**: Pause 失败时 running_seconds 时间戳估算
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 任务状态变更为 COMPLETED；sandbox.pause() 调用失败（未记录 pause_ts）
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用，任务 COMPLETED 但 pause 失败
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1`
  4. 检查是否有 estimated 标记字段
  5. 验证: 系统以下一次状态变更时间估算 pauseAt
- **预期结果:**
  - sandbox_run 记录存在，pauseAt 为估算值
  - 数据标记为估算值（estimated flag）
  - costUsd 基于估算值计算，不报错

**TC-PRD-SLC-038**: 浮点精度误差下 Credit 累积不超额
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 连续多个小任务，每个 credit_raw 极小（如 0.01）
- **操作步骤:**
  1. 连续创建多个小任务，每个触发短时间沙箱工具调用
  2. 每个任务完成后执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount FROM mira_credit_ledger WHERE "taskId" = '{taskId_N}' ORDER BY "createdAt" DESC LIMIT 1`
  3. 验证: 每一步 carryBefore = 上一步 carryAfter（carry 链精确传递）
  4. 最终验证: 总 amount 绝对值之和 与 总 rawCreditAmount 之和的差异 < 1 Credit
- **预期结果:**
  - 浮点累积误差不导致 Credit 多计或少计超过 1 Credit
  - carry 链精确传递，无精度丢失

**TC-PRD-SLC-039**: 沙箱被 E2B 平台异常回收后重建
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 任务正在运行；沙箱被 E2B 平台异常回收（模拟 sandbox 不可访问）；R2 上任务文件完好
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 模拟沙箱被 E2B 异常回收
  4. 通过 `mcp__chrome-devtools__wait_for` 等待重建提示出现
  5. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 检查 sandboxId 是否变更（新沙箱）
  6. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC` → 检查是否有新的 sandbox_run 记录
- **预期结果:**
  - 新沙箱成功创建（sandboxId 可能变更）
  - 旧的 sandbox_run 记录保留（已有 costUsd 不丢失）
  - WARN 日志记录异常回收事件

**TC-PRD-SLC-040**: Pause 失败后沙箱可能空转计费的风险告警
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 任务状态变更为 COMPLETED；sandbox.pause() 调用失败
- **操作步骤:**
  1. 创建任务并触发沙箱工具调用，任务 COMPLETED 但 pause 失败
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  3. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' AND "pauseAt" IS NULL` → 检查是否有未关闭的 running 记录
  4. 等待 E2B onTimeout: 'pause' 安全兜底生效
  5. 再次查询: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 pauseAt 最终被填充
- **预期结果:**
  - WARN 日志明确记录 pause 失败
  - 系统不中断任务
  - E2B onTimeout: 'pause' 安全兜底机制最终触发
  - 不向用户显示 pause 失败错误

**TC-PRD-SLC-041**: 用户突然关闭浏览器时 Session 清算完整性
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** mira_credit_ledger 中存在 carryAfter > 0；用户不正常关闭浏览器
- **操作步骤:**
  1. 创建任务并完成，确认 mira_credit_ledger.carryAfter > 0
  2. 模拟浏览器强制关闭（通过 `mcp__chrome-devtools__close_page`）
  3. 等待服务端 session 超时检测
  4. 执行 SQL: `SELECT * FROM mira_credit_ledger WHERE "userId" = '{userId}' ORDER BY "createdAt" DESC LIMIT 1` → 检查清算记录
- **预期结果:**
  - 系统通过服务端 session 超时检测触发清算
  - carryAfter 被清算纳入 amount
  - Credit 记录完整，不因客户端异常关闭而丢失

**TC-PRD-SLC-042**: E2B 账单与本地计算差异超 5% 时告警
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 本地计算的 running_seconds_total = 1000s（cost = $0.046）；E2B 账单 API 显示 $0.048（差异约 4.3%）
- **操作步骤:**
  1. 执行 SQL: `SELECT SUM("costUsd") as "localTotal" FROM sandbox_run WHERE "taskId" = '{taskId}'` → 本地计算总成本
  2. 对比 E2B 账单 API 返回的成本
  3. 计算差异率: ABS(e2bCost - localTotal) / localTotal × 100%
  4. 若差异 > 5%，验证告警是否触发
- **预期结果:**
  - 差异 < 5% 时：不告警，仅记录监控日志
  - 差异 > 5% 时：触发告警通知
  - 以本地时间戳计算为准

---

## Merged Test Case List（合并后 16 条）

> 合并策略：将原 42 条用例按功能维度合并为 16 条，消除冗余的同时保证每条用例包含完整的 DB 6 表链 + E2B API 验证步骤。

### 通用约定（适用于所有用例）

**问题澄清表单处理**：每次通过 `mcp__chrome-devtools__click` 点击 Submit 发送任务指令后，Agent 可能触发"问题澄清"工具，页面出现澄清表单（包含类似"我注意到您的需求中存在一些需要明确的关键信息"的文字和一个提交按钮）。此时需要执行以下处理：

```
→ 通过 mcp__chrome-devtools__wait_for 同时等待 ["问题澄清", "需要明确", "关键信息", "工具调用", "sb_file", "COMPLETED"]
  ├─ 若命中"问题澄清/需要明确/关键信息" → 表单出现：
  │   1. 通过 mcp__chrome-devtools__take_snapshot 获取表单快照
  │   2. 通过 mcp__chrome-devtools__click 点击表单中的"提交"按钮
  │   3. 继续 wait_for 等待后续工具执行或任务完成
  └─ 若命中"工具调用/sb_file/COMPLETED" → 未触发澄清，正常继续
```

> 以下各用例操作步骤中的"等待工具调用气泡出现"或"等待任务完成"步骤，均隐含上述问题澄清表单处理逻辑，不再逐条重复。

**单轮任务完成判定标准**：以下三个条件**同时满足**时，判定当前单轮会话已完成，可立即进入 DB/E2B 验证步骤，无需继续等待页面：

```
条件 1: 页面出现"任务已完成"文字
条件 2: 页面出现"推荐追问"区域及 3 个追问问题按钮
条件 3: 流式输出已停止至少 10 秒（无新内容追加）
```

实现方式：
```
→ 通过 mcp__chrome-devtools__wait_for 等待 ["任务已完成"] timeout=180000
→ 命中后通过 mcp__chrome-devtools__wait_for 等待 ["推荐追问"] timeout=15000
→ 命中后等待 10 秒确认无新内容（流式输出停止）
→ 三条件全部满足 → 任务完成，立即进入 DB/E2B 验证
```

> 以下各用例中的"等待任务完成（COMPLETED 状态）"步骤均指上述三条件判定，不再逐条重复。

### Group 1: 沙箱生命周期（REQ-001）

**TC-PRD-SLC-001**: 完整正向生命周期：创建→连续工具执行→COMPLETED→pause + 全链计费验证
- **优先级:** P0
- **测试类型:** 场景法
- **合并来源:** 原 TC-001, 004, 005, 009, 016, 019, 024, 027, 029
- **前置条件:** 用户已登录；session 中无历史沙箱记录；沙箱不存在（null）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"提示出现
  4. 通过 `mcp__chrome-devtools__take_snapshot` 获取页面快照，确认页面加载完成
  5. 通过 `mcp__chrome-devtools__click` 点击输入框
  6. 通过 `mcp__chrome-devtools__type_text` 输入指令"寻访互联网行业 10 年经验技术负责人，创建候选人档案并执行初步匹配"（该指令会触发多次连续沙箱工具调用：sb_file_create + sb_command_execute）
  7. 通过 `mcp__chrome-devtools__take_snapshot` 获取页面快照，从 URL 提取新任务 uid 作为 taskId
  8. 通过 `mcp__chrome-devtools__click` 点击 Submit 发送按钮
  9. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用气泡出现（确认沙箱已 create，状态 S0→S1）
  10. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId：`window.location.pathname.split('/').pop()`
  11. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 验证 sandboxId 非空（沙箱已创建）
  12. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱在 E2B 平台状态为 running
  13. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成（COMPLETED 状态，状态 S1→S2 pause）
  14. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态变为 paused
  15. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC` → 验证：仅 1 条记录（连续工具调用不中断 pause），resumeAt 非空，pauseAt 非空，runningSeconds = CEIL((pauseAt - resumeAt) / 1000)，costUsd = runningSeconds × 0.000046
  16. 执行 SQL: `SELECT id, "costSettled", "vendorRequestId", status FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'` → 验证 costSettled = sandbox_run.costUsd，status = 'completed'
  17. 执行 SQL: `SELECT quantity, "meterName", cost FROM mira_usage_meter WHERE "usageId" = '{mira_usage.id}'` → 验证 meterName = 'sandbox_running_seconds'，quantity = runningSeconds
  18. 执行 SQL: `SELECT "rawCreditAmount", "creditsPerUnitSnapshot" FROM mira_credit WHERE "usageId" = '{mira_usage.id}'` → 验证 rawCreditAmount = costSettled × creditsPerUnitSnapshot
  19. 执行 SQL: `SELECT "creditsPerUnit" FROM credit_rate WHERE currency = 'USD' AND "effectiveAt" <= NOW() AND ("expireAt" IS NULL OR "expireAt" > NOW()) ORDER BY "effectiveAt" DESC LIMIT 1` → 记录当前汇率，验证与 creditsPerUnitSnapshot 一致
  20. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 amount = -floor(sumRaw + carryBefore)，carryAfter = (sumRaw + carryBefore) - floor(sumRaw + carryBefore)
- **预期结果:**
  - 完整状态路径 S0→S1→S2，E2B API 在各阶段确认状态正确
  - 单轮连续工具调用仅生成 1 条 sandbox_run 记录（running 期间不自动 pause）
  - 6 表计费链完整：sandbox_run.runningSeconds → costUsd → mira_usage.costSettled → mira_usage_meter.quantity → mira_credit.rawCreditAmount → mira_credit_ledger.amount
  - 各环节数据与公式严格一致

**TC-PRD-SLC-002**: 多轮 HITL 对话：WAITING→pause→resume→再次执行→COMPLETED（含多段计时累加）
- **优先级:** P0
- **测试类型:** 状态迁移
- **合并来源:** 原 TC-002, 015, 017, 020, 025, 026, 031
- **前置条件:** 用户已登录；任务需要人工确认（HITL 场景）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__take_snapshot` 获取页面快照
  5. 通过 `mcp__chrome-devtools__click` 点击输入框
  6. 通过 `mcp__chrome-devtools__type_text` 输入指令"创建候选人档案，完成后请先确认再执行匹配脚本"（该指令会触发沙箱工具调用并在中途等待用户确认）
  7. 通过 `mcp__chrome-devtools__take_snapshot` 获取新 uid
  8. 通过 `mcp__chrome-devtools__click` 点击 Submit
  9. 通过 `mcp__chrome-devtools__wait_for` 等待 WAITING_FOR_USER 状态（第 1 轮结束，沙箱 S1→S2 pause）
  10. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId
  11. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 记录 sandboxId
  12. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态为 paused（WAITING_FOR_USER 触发 pause，不触发 session 清算）
  13. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC` → 验证第 1 条记录：pauseAt 非空，runningSeconds = CEIL((pauseAt - resumeAt) / 1000)，costUsd = runningSeconds × 0.000046
  14. 执行 SQL: `SELECT id, "costSettled", "vendorRequestId", status FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run_1.id}' AND type = 'sandbox'` → 验证第 1 段增量 mira_usage 已写入，costSettled = costUsd
  15. 通过 `mcp__chrome-devtools__click` 点击输入框
  16. 通过 `mcp__chrome-devtools__type_text` 输入"确认，请继续执行后续匹配步骤"
  17. 通过 `mcp__chrome-devtools__click` 点击 Submit
  18. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态变为 running（S2→S1 resume）
  19. 通过 `mcp__chrome-devtools__wait_for` 等待任务 COMPLETED（第 2 轮结束，沙箱 S1→S2 pause）
  20. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态为 paused
  21. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC` → 验证：存在 2 条记录；第 2 条 resumeAt > 第 1 条 pauseAt（跨轮间隙不计费）；各条 sandboxId 相同（复用沙箱）
  22. 执行 SQL: `SELECT SUM("runningSeconds") as total, SUM("costUsd") as "totalCost" FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证各段 runningSeconds 之和 = 总运行时长
  23. 对第 2 段 sandbox_run 执行完整计费链验证：
      - 执行 SQL: `SELECT id, "costSettled", "vendorRequestId", status FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run_2.id}' AND type = 'sandbox'` → 验证 costSettled = sandbox_run_2.costUsd
      - 执行 SQL: `SELECT quantity, "meterName", cost FROM mira_usage_meter WHERE "usageId" = '{mira_usage_2.id}'` → 验证 quantity = sandbox_run_2.runningSeconds
      - 执行 SQL: `SELECT "rawCreditAmount", "creditsPerUnitSnapshot" FROM mira_credit WHERE "usageId" = '{mira_usage_2.id}'` → 验证 rawCreditAmount = costSettled × creditsPerUnitSnapshot
  24. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 amount = -floor(sumRaw + carryBefore)
- **预期结果:**
  - WAITING_FOR_USER 触发 pause（不清算 session），用户继续后 resume 生成新 sandbox_run 记录
  - 2 条 sandbox_run 记录，各段独立计时，跨轮间隙不计费
  - sandboxId 复用（同一沙箱实例）
  - 每段 sandbox_run 都有对应的 mira_usage + mira_usage_meter + mira_credit
  - mira_credit_ledger 的 sumRaw 包含该消息所有 credit 的汇总

**TC-PRD-SLC-003**: 纯搜索任务：无沙箱工具调用 = 无沙箱记录 = 无沙箱计费
- **优先级:** P1
- **测试类型:** 等价类划分
- **合并来源:** 原 TC-003, 010, 018, 023, 030
- **前置条件:** 用户已登录；Agent 仅使用 search / people_search 等非沙箱工具
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__take_snapshot` 获取页面快照
  5. 通过 `mcp__chrome-devtools__click` 点击输入框
  6. 通过 `mcp__chrome-devtools__type_text` 输入纯搜索指令"搜索近期融资的科技公司"
  7. 通过 `mcp__chrome-devtools__take_snapshot` 获取新 uid
  8. 通过 `mcp__chrome-devtools__click` 点击 Submit
  9. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成（COMPLETED 状态）
  10. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId
  11. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 验证 sandboxId 为 NULL（沙箱未创建）
  12. 执行 SQL: `SELECT COUNT(*) as cnt FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证 cnt = 0（无 sandbox_run 记录）
  13. 执行 SQL: `SELECT COUNT(*) as cnt FROM mira_usage WHERE "taskId" = '{taskId}' AND type = 'sandbox'` → 验证 cnt = 0（无沙箱类型的 mira_usage 记录）
  14. 执行 SQL: `SELECT COUNT(*) as cnt FROM mira_credit WHERE "usageId" IN (SELECT id FROM mira_usage WHERE "taskId" = '{taskId}' AND type = 'sandbox')` → 验证 cnt = 0
- **预期结果:**
  - chats.sandboxId 为 NULL
  - sandbox_run、mira_usage（type='sandbox'）、mira_credit 均无对应记录
  - 任务 Credit 仅含 LLM 和工具费用，无沙箱项
  - 系统正常完成，无异常报错

**TC-PRD-SLC-004**: 用户主动中断 INTERRUPTED → 立即 pause + 按实际时长计费
- **优先级:** P0
- **测试类型:** 场景法
- **合并来源:** 原 TC-022, 033
- **前置条件:** 任务运行中；沙箱处于 running 状态；用户手动点击停止按钮
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__take_snapshot` 获取页面快照
  5. 通过 `mcp__chrome-devtools__click` 点击输入框
  6. 通过 `mcp__chrome-devtools__type_text` 输入指令"创建候选人档案并执行完整的数据处理流程"（耗时较长的沙箱任务）
  7. 通过 `mcp__chrome-devtools__take_snapshot` 获取新 uid
  8. 通过 `mcp__chrome-devtools__click` 点击 Submit
  9. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用气泡出现（确认沙箱已创建，进入 running）
  10. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId
  11. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 记录 sandboxId
  12. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态为 running
  13. 通过 `mcp__chrome-devtools__click` 点击"停止"按钮（用户主动中断）
  14. 通过 `mcp__chrome-devtools__wait_for` 等待任务变为 INTERRUPTED 状态
  15. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态变为 paused（INTERRUPTED 立即触发 pause）
  16. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC` → 验证 pauseAt 非空，runningSeconds = CEIL((pauseAt - resumeAt) / 1000)，costUsd = runningSeconds × 0.000046
  17. 执行 SQL: `SELECT id, "costSettled", "vendorRequestId", status FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'` → 验证 costSettled = sandbox_run.costUsd，status = 'completed'
  18. 执行 SQL: `SELECT quantity, "meterName", cost FROM mira_usage_meter WHERE "usageId" = '{mira_usage.id}'` → 验证 meterName = 'sandbox_running_seconds'，quantity = runningSeconds
  19. 执行 SQL: `SELECT "rawCreditAmount", "creditsPerUnitSnapshot" FROM mira_credit WHERE "usageId" = '{mira_usage.id}'` → 验证 rawCreditAmount = costSettled × creditsPerUnitSnapshot
  20. 执行 SQL: `SELECT "creditsPerUnit" FROM credit_rate WHERE currency = 'USD' AND "effectiveAt" <= NOW() AND ("expireAt" IS NULL OR "expireAt" > NOW()) ORDER BY "effectiveAt" DESC LIMIT 1` → 记录当前汇率
  21. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 amount = -floor(sumRaw + carryBefore)
- **预期结果:**
  - INTERRUPTED 立即触发 pause，E2B API 确认沙箱状态 running→paused
  - costUsd 按实际 runningSeconds 计算（非预设时长）
  - 完整 6 表计费链写入，不因中断而丢失计费数据
  - 不触发 session 清算

**TC-PRD-SLC-005**: 任务异常 FAILED → pause + 按实际时长计费，不触发 session 清算
- **优先级:** P1
- **测试类型:** 场景法
- **合并来源:** 原 TC-021, 032
- **前置条件:** 任务运行中；沙箱处于 running；Agent 执行过程中发生系统异常导致 FAILED
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__take_snapshot` 获取页面快照
  5. 通过 `mcp__chrome-devtools__click` 点击输入框
  6. 通过 `mcp__chrome-devtools__type_text` 输入可能导致异常的指令（如触发边界条件的复杂沙箱操作）
  7. 通过 `mcp__chrome-devtools__take_snapshot` 获取新 uid
  8. 通过 `mcp__chrome-devtools__click` 点击 Submit
  9. 通过 `mcp__chrome-devtools__wait_for` 等待任务状态变为 FAILED
  10. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId
  11. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 记录 sandboxId
  12. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态为 paused（FAILED 触发 pause）
  13. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC` → 验证 pauseAt 非空，runningSeconds > 0，costUsd = runningSeconds × 0.000046
  14. 执行 SQL: `SELECT id, "costSettled", "vendorRequestId", status FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'` → 验证 costSettled = sandbox_run.costUsd
  15. 执行 SQL: `SELECT quantity, "meterName", cost FROM mira_usage_meter WHERE "usageId" = '{mira_usage.id}'` → 验证 quantity = runningSeconds
  16. 执行 SQL: `SELECT "rawCreditAmount", "creditsPerUnitSnapshot" FROM mira_credit WHERE "usageId" = '{mira_usage.id}'` → 验证 rawCreditAmount = costSettled × creditsPerUnitSnapshot
  17. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 ledger 记录存在，amount = -floor(sumRaw + carryBefore)
- **预期结果:**
  - FAILED 触发 pause，按实际 runningSeconds 计费
  - 完整 6 表计费链写入（部分成本记录）
  - 不触发 session 清算

**TC-PRD-SLC-006**: 断线重连：任务已非 RUNNING 但沙箱仍 running → 补偿 pause
- **优先级:** P1
- **测试类型:** 状态迁移
- **合并来源:** 原 TC-028
- **前置条件:** 任务实际状态为非 RUNNING（如已 COMPLETED），但因网络中断等原因沙箱未收到 pause 指令，仍处于 running 状态
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__click` 点击输入框
  5. 通过 `mcp__chrome-devtools__type_text` 输入沙箱工具触发指令
  6. 通过 `mcp__chrome-devtools__click` 点击 Submit
  7. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用开始
  8. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId
  9. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 记录 sandboxId
  10. 通过 `mcp__chrome-devtools__navigate_page` 模拟页面刷新/断线重连
  11. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' AND "pauseAt" IS NULL` → 检查是否有未关闭的 running 记录
  12. 等待系统检测并执行补偿 pause（系统应在重连时发现异常并触发 pause）
  13. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 pauseAt 已补充写入
  14. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态为 paused
  15. 验证 runningSeconds = CEIL((pauseAt - resumeAt) / 1000)，costUsd = runningSeconds × 0.000046
  16. 执行 SQL: `SELECT id, "costSettled", "vendorRequestId", status FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'` → 验证计费链完整写入
- **预期结果:**
  - 系统检测到异常状态后执行补偿 pause
  - sandbox_run.pauseAt 补充写入，runningSeconds 正确计算，无空转计费
  - E2B API 确认沙箱已 paused
  - 计费链完整写入

### Group 2: 计费计算精度（REQ-002）

**TC-PRD-SLC-007**: 计时精度：毫秒向上取整至整秒 + 最小计费单位（1秒）验证
- **优先级:** P1
- **测试类型:** 边界值分析
- **合并来源:** 原 TC-011, 012
- **前置条件:** 任务已完成，沙箱运行时长可能为非整数秒（如 30.4s = 30400ms）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__take_snapshot` 获取页面快照
  5. 通过 `mcp__chrome-devtools__click` 点击输入框
  6. 通过 `mcp__chrome-devtools__type_text` 输入极短时间沙箱指令（如"创建一个空文件 test.txt"）
  7. 通过 `mcp__chrome-devtools__take_snapshot` 获取新 uid
  8. 通过 `mcp__chrome-devtools__click` 点击 Submit
  9. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成（COMPLETED）
  10. 通过 `mcp__chrome-devtools__evaluate_script` 从页面 URL 提取 taskId
  11. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 验证 sandboxId 非空
  12. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}'` → 验证：
      - runningSeconds >= 1（最小计费单位 1 秒）
      - runningSeconds = CEIL(EXTRACT(EPOCH FROM ("pauseAt" - "resumeAt")))（毫秒向上取整至整秒）
      - costUsd = runningSeconds × 0.000046
  13. 执行 SQL: `SELECT id, "costSettled", "vendorRequestId", status FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'` → 验证 costSettled = costUsd
  14. 执行 SQL: `SELECT quantity, "meterName", cost FROM mira_usage_meter WHERE "usageId" = '{mira_usage.id}'` → 验证 quantity = runningSeconds（整数，无精度丢失），meterName = 'sandbox_running_seconds'
  15. 执行 SQL: `SELECT "rawCreditAmount", "creditsPerUnitSnapshot" FROM mira_credit WHERE "usageId" = '{mira_usage.id}'` → 验证 rawCreditAmount = costSettled × creditsPerUnitSnapshot
  16. 执行 SQL: `SELECT "creditsPerUnit" FROM credit_rate WHERE currency = 'USD' AND "effectiveAt" <= NOW() AND ("expireAt" IS NULL OR "expireAt" > NOW()) ORDER BY "effectiveAt" DESC LIMIT 1` → 记录当前汇率
  17. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态为 paused
- **预期结果:**
  - runningSeconds = CEIL((pauseAt - resumeAt) / 1000)，最小值为 1
  - 若实际差值为 30.4s 则 runningSeconds = 31（向上取整）
  - costUsd 基于取整后的整秒计算
  - mira_usage_meter.quantity 无精度丢失

### Group 3: Credit 累积体系（REQ-003）

**TC-PRD-SLC-008**: 多任务 Credit 累积完整场景：<1不进位 → 跨整数进位 → Session 结束清算
- **优先级:** P0
- **测试类型:** 场景法
- **合并来源:** 原 TC-006, 007, 008, 013, 014, 034
- **前置条件:** 用户已登录；session 中无历史沙箱记录；将在同一 session 中连续执行 3+ 个任务
- **操作步骤:**
  **--- 任务 1：短时间运行（credit_raw < 1，不进位） ---**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__click` 点击输入框
  5. 通过 `mcp__chrome-devtools__type_text` 输入短时间沙箱指令（如"创建一个空文件 task1.txt"，运行约 5-10s）
  6. 通过 `mcp__chrome-devtools__click` 点击 Submit
  7. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成
  8. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId_1
  9. 执行 SQL: `SELECT id, "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId_1}'` → 记录 costUsd_1
  10. 执行 SQL: `SELECT "rawCreditAmount" FROM mira_credit WHERE "usageId" = '{sandbox_run_1.usageId}'` → 记录 rawCreditAmount_1
  11. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId_1}' ORDER BY "createdAt" DESC LIMIT 1` → 验证：若 sumRaw + carryBefore < 1.0，则 amount = 0（不进位），carryAfter = sumRaw + carryBefore → 记录 carryAfter_1
  **--- 任务 2：中等时间运行（累积可能跨整数边界） ---**
  12. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  13. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  14. 通过 `mcp__chrome-devtools__click` 点击输入框
  15. 通过 `mcp__chrome-devtools__type_text` 输入中等时间沙箱指令（如"创建候选人档案并运行数据处理脚本"，运行更长时间）
  16. 通过 `mcp__chrome-devtools__click` 点击 Submit
  17. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成
  18. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId_2
  19. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId_2}' ORDER BY "createdAt" DESC LIMIT 1` → 验证：carryBefore = carryAfter_1（carry 链传递正确），amount = -floor(sumRaw + carryBefore)，carryAfter = (sumRaw + carryBefore) - floor(sumRaw + carryBefore) → 记录 carryAfter_2
  **--- 任务 3：使累积跨越整数边界（验证进位） ---**
  20. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  21. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  22. 通过 `mcp__chrome-devtools__click` 点击输入框
  23. 通过 `mcp__chrome-devtools__type_text` 输入较长时间沙箱指令（如"寻访互联网行业技术负责人，创建候选人档案并执行完整匹配"）
  24. 通过 `mcp__chrome-devtools__click` 点击 Submit
  25. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成
  26. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId_3
  27. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId_3}' ORDER BY "createdAt" DESC LIMIT 1` → 验证：carryBefore = carryAfter_2，amount = -floor(sumRaw + carryBefore)（若跨整数则 |amount| >= 1），carryAfter < 1.0
  **--- Session 结束清算 ---**
  28. 执行 SQL: `SELECT "carryAfter" FROM mira_credit_ledger WHERE "taskId" = '{taskId_3}' ORDER BY "createdAt" DESC LIMIT 1` → 确认 carryAfter > 0
  29. 通过 `mcp__chrome-devtools__click` 点击"结束 Session"按钮（或关闭页面触发 session 结束）
  30. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "userId" = '{userId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证清算记录存在，carryAfter 被向上取整纳入 amount 扣减，最终 carryAfter = 0
- **预期结果:**
  - 任务 1：credit_raw < 1，amount = 0，carry 保留余数
  - 任务 2：carry 链传递正确（carryBefore = 上一条 carryAfter）
  - 任务 3：跨整数边界进位，|amount| >= 1
  - Session 结束：carryAfter 被清算（ceil），最终 carryAfter = 0
  - 全程 carry 链连续性正确：每条 carryBefore = 上一条 carryAfter

### Group 4: 异常与错误（Error Guessing）

**TC-PRD-SLC-009**: Resume 失败指数退避重试（1s/2s/4s）后返回错误
- **优先级:** P1
- **测试类型:** 错误猜测
- **合并来源:** 原 TC-035
- **前置条件:** 沙箱处于 paused 状态；E2B API 出现超时/不可达异常（需模拟网络异常）
- **操作步骤:**
  1. 确保前置任务已完成（沙箱 paused）
  2. 通过 `mcp__chrome-devtools__navigate_page` 进入任务详情页 `{PREVIEW_URL}/task/{taskId}`
  3. 通过 `mcp__chrome-devtools__take_snapshot` 获取页面快照
  4. 【手动/模拟】通过网络层工具（如 iptables / Charles Proxy）阻断 E2B API 访问，模拟 resume 失败
  5. 通过 `mcp__chrome-devtools__click` 点击输入框
  6. 通过 `mcp__chrome-devtools__type_text` 输入沙箱工具触发指令"继续执行数据处理"
  7. 通过 `mcp__chrome-devtools__click` 点击 Submit
  8. 通过 `mcp__chrome-devtools__wait_for` 等待错误提示出现
  9. 通过 `mcp__chrome-devtools__evaluate_script` 检查页面是否显示错误信息"Something went wrong while preparing your workspace. Please try again."
  10. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  11. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 检查是否有 resume 失败记录（resumeAt 可能为空或 pauseAt 立即回填）
  12. 【手动/模拟】恢复 E2B API 网络访问
- **预期结果:**
  - 指数退避重试 3 次（间隔约 1s/2s/4s）
  - 重试全部失败后，工具返回错误，用户看到友好错误提示
  - 任务不因 resume 失败而崩溃
  - sandbox_run 无遗留的"open"记录（pauseAt IS NULL）

**TC-PRD-SLC-010**: Pause 失败：时间戳估算 + E2B onTimeout 兜底
- **优先级:** P1
- **测试类型:** 错误猜测
- **合并来源:** 原 TC-037, 040
- **前置条件:** 任务状态变更为 COMPLETED 或其他终止状态；sandbox.pause() 调用失败（E2B API 超时/异常）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__click` 点击输入框
  5. 通过 `mcp__chrome-devtools__type_text` 输入沙箱工具触发指令
  6. 通过 `mcp__chrome-devtools__click` 点击 Submit
  7. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用开始
  8. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  9. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 记录 sandboxId
  10. 【手动/模拟】在任务即将完成时阻断 E2B pause API，使 sandbox.pause() 失败
  11. 通过 `mcp__chrome-devtools__wait_for` 等待任务完成（COMPLETED）
  12. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' AND "pauseAt" IS NULL` → 检查是否有未关闭的 running 记录
  13. 若存在未关闭记录：等待 E2B onTimeout: 'pause' 安全兜底机制生效（Sandbox.create 时设置的 lifecycle 参数）
  14. 再次执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 pauseAt 最终被填充（可能为估算值）
  15. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱最终为 paused
  16. 执行 SQL: `SELECT id, "costSettled" FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'` → 验证计费链最终写入
  17. 【手动/模拟】恢复 E2B API 网络访问
- **预期结果:**
  - pause 失败时系统记录 WARN 日志，不向用户显示错误
  - pauseAt 以下一次状态变更时间估算写入
  - E2B onTimeout: 'pause' 安全兜底最终触发
  - costUsd 基于估算 pauseAt 计算，计费链最终完整

**TC-PRD-SLC-011**: 服务重启后从 DB 恢复 running_seconds_total
- **优先级:** P0
- **测试类型:** 错误猜测
- **合并来源:** 原 TC-036
- **前置条件:** 任务正在运行（沙箱 running，已运行 60s+）；resume_ts 已写入 DB（sandbox_run.resumeAt 非空）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__click` 点击输入框
  5. 通过 `mcp__chrome-devtools__type_text` 输入耗时较长的沙箱指令
  6. 通过 `mcp__chrome-devtools__click` 点击 Submit
  7. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用开始
  8. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  9. 执行 SQL: `SELECT * FROM sandbox_run WHERE "taskId" = '{taskId}' AND "pauseAt" IS NULL` → 验证有活跃的 running 记录（resumeAt 非空，pauseAt IS NULL）
  10. 【手动/模拟】触发服务重启（如重启应用服务进程）
  11. 等待服务恢复
  12. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证：resumeAt 仍然完整（已持久化到 DB），服务恢复后能从 DB 中 resumeAt 正确计算 runningSeconds
  13. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 记录 sandboxId
  14. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 验证沙箱状态（可能已被 onTimeout 回收为 paused，或仍在 running）
  15. 等待任务最终完成或超时
  16. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd", "usageId" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "resumeAt" ASC` → 验证最终 pauseAt 非空，runningSeconds 正确
  17. 执行 SQL: `SELECT id, "costSettled" FROM mira_usage WHERE "vendorRequestId" = '{sandbox_run.id}' AND type = 'sandbox'` → 验证计费数据完整写入
- **预期结果:**
  - 服务重启后 sandbox_run.resumeAt 数据完整（不依赖内存状态）
  - 恢复后能正确计算 runningSeconds = CEIL((pauseAt - resumeAt) / 1000)
  - Credit 计算不丢失，计费链完整

**TC-PRD-SLC-012**: E2B 异常回收后沙箱重建
- **优先级:** P1
- **测试类型:** 错误猜测
- **合并来源:** 原 TC-039
- **前置条件:** 任务运行中；沙箱被 E2B 平台异常回收（如超出 E2B 平台预期的超时）
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 通过 `mcp__chrome-devtools__click` 点击"新建任务"
  3. 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
  4. 通过 `mcp__chrome-devtools__click` 点击输入框
  5. 通过 `mcp__chrome-devtools__type_text` 输入沙箱工具触发指令
  6. 通过 `mcp__chrome-devtools__click` 点击 Submit
  7. 通过 `mcp__chrome-devtools__wait_for` 等待工具调用开始
  8. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  9. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 记录旧 sandboxId (oldSandboxId)
  10. 【手动/模拟】通过 E2B 管理后台或 API 手动终止/回收沙箱实例
  11. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{oldSandboxId}"` → 验证旧沙箱返回 404/not found
  12. 等待系统检测到沙箱不可达并触发重建
  13. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 检查 sandboxId 是否变更为新值 (newSandboxId)
  14. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{newSandboxId}"` → 验证新沙箱在 E2B 平台存在
  15. 执行 SQL: `SELECT id, "resumeAt", "pauseAt", "runningSeconds", "costUsd" FROM sandbox_run WHERE "taskId" = '{taskId}' ORDER BY "createdAt" ASC` → 验证旧 sandbox_run 记录保留（已有 costUsd 不丢失），新 sandbox_run 记录已创建
- **预期结果:**
  - E2B API 确认旧沙箱不存在（404）
  - 新沙箱创建成功（sandboxId 变更）
  - 旧 sandbox_run 记录及其计费数据保留
  - WARN 日志记录异常回收事件

**TC-PRD-SLC-013**: 浮点精度误差：连续多任务累积不超额
- **优先级:** P2
- **测试类型:** 错误猜测
- **合并来源:** 原 TC-038
- **前置条件:** 连续多个小任务（10+），每个 credit_raw 极小（如 0.01 级别）
- **操作步骤:**
  1. 连续创建 10+ 个短时间沙箱任务（每个运行约 5s），每个任务按照标准 UI 操作流程：
     - 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
     - 通过 `mcp__chrome-devtools__click` 点击"新建任务"
     - 通过 `mcp__chrome-devtools__wait_for` 等待"我能为你做什么"
     - 通过 `mcp__chrome-devtools__click` 点击输入框
     - 通过 `mcp__chrome-devtools__type_text` 输入短时间沙箱指令
     - 通过 `mcp__chrome-devtools__click` 点击 Submit
     - 通过 `mcp__chrome-devtools__wait_for` 等待 COMPLETED
  2. 每个任务完成后执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount FROM mira_credit_ledger WHERE "taskId" = '{taskId_N}' ORDER BY "createdAt" DESC LIMIT 1` → 验证 carryBefore = 上一任务 carryAfter（carry 链精确传递）
  3. 最终执行 SQL: `SELECT SUM(ABS(amount)) as "totalDeducted" FROM mira_credit_ledger WHERE "userId" = '{userId}' AND "createdAt" >= '{sessionStartTime}'`
  4. 执行 SQL: `SELECT SUM("rawCreditAmount") as "totalRaw" FROM mira_credit WHERE "taskId" IN ('{taskId_1}', '{taskId_2}', ..., '{taskId_N}')`
  5. 验证：|totalDeducted - FLOOR(totalRaw)| <= 1（浮点累积误差不超过 1 Credit）
- **预期结果:**
  - carry 链精确传递，无精度丢失
  - 浮点累积误差不导致 Credit 多计或少计超过 1 Credit
  - 总 amount 绝对值之和与总 rawCreditAmount 之和的差异 < 1 Credit

**TC-PRD-SLC-014**: 浏览器异常关闭时 Session 清算完整性
- **优先级:** P2
- **测试类型:** 错误猜测
- **合并来源:** 原 TC-041
- **前置条件:** mira_credit_ledger 中存在 carryAfter > 0；用户将强制关闭浏览器
- **操作步骤:**
  1. 先完成一个沙箱任务，确认 carryAfter > 0
  2. 通过 `mcp__chrome-devtools__evaluate_script` 提取 userId 和最近一条 ledger 的 carryAfter
  3. 执行 SQL: `SELECT "carryAfter" FROM mira_credit_ledger WHERE "userId" = '{userId}' ORDER BY "createdAt" DESC LIMIT 1` → 确认 carryAfter > 0
  4. 通过 `mcp__chrome-devtools__close_page` 模拟浏览器强制关闭
  5. 等待服务端 session 超时检测触发（通常需等待 session timeout 周期）
  6. 执行 SQL: `SELECT "sumRaw", "carryBefore", "carryAfter", amount, "balanceAfter" FROM mira_credit_ledger WHERE "userId" = '{userId}' ORDER BY "createdAt" DESC LIMIT 1` → 验证清算记录存在
  7. 验证：carryAfter 被向上取整纳入 amount 扣减，最终 carryAfter = 0（清算完毕）
- **预期结果:**
  - 服务端通过 session 超时检测触发清算
  - carryAfter 被清算（ceil），Credit 记录完整
  - 不因客户端异常关闭而丢失积分清算

**TC-PRD-SLC-015**: E2B 账单与本地计算对账差异告警
- **优先级:** P2
- **测试类型:** 错误猜测
- **合并来源:** 原 TC-042
- **前置条件:** 本地已有 sandbox_run 计费记录；E2B 账单 API 可访问
- **操作步骤:**
  1. 完成一个沙箱任务，通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  2. 执行 SQL: `SELECT "sandboxId" FROM chats WHERE id = '{taskId}'` → 记录 sandboxId
  3. 执行 SQL: `SELECT SUM("costUsd") as "localTotal" FROM sandbox_run WHERE "taskId" = '{taskId}'` → 记录本地计算总成本
  4. 调用 E2B API: `Bash: source .env && curl -s -H "X-API-Key: $E2B_API_KEY" "https://api.e2b.dev/sandboxes/{sandboxId}"` → 获取 E2B 侧的沙箱使用记录
  5. 计算差异率: ABS(e2bCost - localTotal) / localTotal × 100%
  6. 验证：差异 < 5% 时仅记录监控日志，差异 > 5% 时触发告警通知
- **预期结果:**
  - 差异 < 5%：不告警，仅记录监控日志
  - 差异 > 5%：触发告警通知
  - 以本地时间戳计算为准（本地计费为权威数据源）

**TC-PRD-SLC-016**: 幂等性验证：同一 sandbox_run.id 不产生重复 mira_usage
- **优先级:** P1
- **测试类型:** 错误猜测
- **合并来源:** 新增（原 42 条中缺失的幂等性验证）
- **前置条件:** 已有完成的沙箱任务，sandbox_run 和 mira_usage 记录已存在
- **操作步骤:**
  1. 通过 `mcp__chrome-devtools__navigate_page` 进入 `{PREVIEW_URL}/task`
  2. 完成一个沙箱任务（按照 TC-001 步骤 2-10）
  3. 通过 `mcp__chrome-devtools__evaluate_script` 提取 taskId
  4. 执行 SQL: `SELECT id FROM sandbox_run WHERE "taskId" = '{taskId}'` → 记录 sandbox_run.id
  5. 执行 SQL: `SELECT COUNT(*) as cnt FROM mira_usage WHERE "sourceProvider" = 'e2b' AND "vendorRequestId" = '{sandbox_run.id}'` → 验证 cnt = 1（唯一约束保证仅 1 条）
  6. 执行 SQL: `SELECT COUNT(*) as cnt FROM mira_usage WHERE "taskId" = '{taskId}' AND type = 'sandbox'` → 验证 cnt = sandbox_run 记录数（1:1 对应）
  7. 执行 SQL: `SELECT u.id, u."vendorRequestId", sr.id as "sandboxRunId" FROM mira_usage u JOIN sandbox_run sr ON u."vendorRequestId" = sr.id WHERE sr."taskId" = '{taskId}' AND u.type = 'sandbox'` → 验证 JOIN 结果行数 = sandbox_run 记录数（无重复）
  8. 验证数据库约束: `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'mira_usage' AND constraint_type = 'UNIQUE'` → 确认存在 UNIQUE(sourceProvider, vendorRequestId) 约束
- **预期结果:**
  - 每个 sandbox_run.id 在 mira_usage 中仅对应 1 条记录
  - UNIQUE(sourceProvider, vendorRequestId) 约束存在且有效
  - 重复调用会被数据库 UNIQUE 约束拦截（error code 23505）

---

## 优先级分布统计

| 优先级 | 数量 | 用例 ID | 占比 |
|-------|------|---------|------|
| P0 | 5 | 001, 002, 004, 008, 011 | 31.3% |
| P1 | 8 | 003, 005, 006, 007, 009, 010, 012, 016 | 50.0% |
| P2 | 3 | 013, 014, 015 | 18.7% |
| **合计** | **16** | | **100%** |

> 注：P0 占比 31.3%，覆盖核心正向流程（001）、多轮对话（002）、用户中断（004）、Credit 累积全链（008）和服务重启恢复（011）。本需求涉及核心计费和金融安全级功能，P0 保持较高占比属于有意识的保守策略。

## 需求追溯矩阵

| TC ID | 覆盖需求 | 合并来源（原 TC） | 关键验证点 |
|-------|---------|-----------------|----------|
| TC-PRD-SLC-001 | REQ-001, REQ-002, REQ-003 | 001, 004, 005, 009, 016, 019, 024, 027, 029 | 完整正向生命周期 S0→S1→S2 + 连续工具调用不中断 + 6 表全链计费验证 |
| TC-PRD-SLC-002 | REQ-001, REQ-002, REQ-003 | 002, 015, 017, 020, 025, 026, 031 | 多轮 HITL 对话 + WAITING pause 不清算 + resume 复用 + 多段计时累加 |
| TC-PRD-SLC-003 | REQ-001 | 003, 010, 018, 023, 030 | 纯搜索无沙箱 = 无记录 = 无计费 |
| TC-PRD-SLC-004 | REQ-001, REQ-002 | 022, 033 | INTERRUPTED 立即 pause + 按实际时长计费 |
| TC-PRD-SLC-005 | REQ-001, REQ-002 | 021, 032 | FAILED pause + 按实际时长计费，不触发 session 清算 |
| TC-PRD-SLC-006 | REQ-001 | 028 | 断线重连补偿 pause |
| TC-PRD-SLC-007 | REQ-002 | 011, 012 | 毫秒向上取整 + 最小计费 1s |
| TC-PRD-SLC-008 | REQ-003 | 006, 007, 008, 013, 014, 034 | <1不进位→跨整数进位→Session 清算全流程 |
| TC-PRD-SLC-009 | REQ-001 | 035 | Resume 失败指数退避重试 |
| TC-PRD-SLC-010 | REQ-001, REQ-002 | 037, 040 | Pause 失败估算 + E2B onTimeout 兜底 |
| TC-PRD-SLC-011 | REQ-002 | 036 | 服务重启后 DB 恢复 |
| TC-PRD-SLC-012 | REQ-001 | 039 | E2B 异常回收后沙箱重建 |
| TC-PRD-SLC-013 | REQ-003 | 038 | 浮点精度累积误差 < 1 Credit |
| TC-PRD-SLC-014 | REQ-003 | 041 | 浏览器异常关闭 Session 清算 |
| TC-PRD-SLC-015 | REQ-002 | 042 | E2B 账单对账差异告警 |
| TC-PRD-SLC-016 | REQ-002 | 新增 | UNIQUE(sourceProvider, vendorRequestId) 幂等性 |
