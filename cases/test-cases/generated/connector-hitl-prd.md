<!-- PRD-hash: connector-hitl-s5s8s9 | PRD-module: S5 HITL Email + S8 HITL DingTalk + S9 HITL Outreach | feature-slug: connector-hitl -->

# Connector HITL 审批卡片测试用例 (PRD)

> 来源：connector_0409-fancy.pen — S5/S8/S9
> Tags: @prd @connector-hitl

---

## Method 1: Equivalence Partitioning

### HITL 审批操作等价类

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|----------|-----|----------|-----|
| 审批操作 | Approve/Send（确认执行） | V1 | — | — |
| | Cancel/Reject（拒绝执行） | V2 | — | — |
| 卡片类型 | Email（S5）Draft Email | V3 | — | — |
| | DingTalk（S8）Calendar Event | V4 | — | — |
| | Outreach（S9）Outreach Campaign | V5 | — | — |
| 卡片字段完整性 | 所有必填字段显示 | V6 | 缺少关键字段 | I1 |

**TC-PRD-HITL-001**: HITL Email 卡片正确显示 Draft Email 内容
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Agent 自动触发邮件发送，HITL Email 审批卡片已显示
- **操作步骤:** 1. 观察卡片标题 2. 检查右上角 badge 3. 检查邮件字段 To / Subject / Body
- **预期结果:** 卡片标题为 "Draft Email"，右上角显示 "CI Mail" badge，To/Subject/Body 字段完整显示

**TC-PRD-HITL-002**: HITL DingTalk 卡片正确显示 Calendar Event 内容
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Agent 创建日历事件，HITL DingTalk 审批卡片已显示
- **操作步骤:** 1. 观察卡片标题 2. 检查右上角 badge 3. 检查事件字段 Summary / Time / Organizer / Attendees / Description
- **预期结果:** 卡片标题为 "Calendar Event"，右上角显示 "CI DingTalk" badge，所有事件字段完整显示

**TC-PRD-HITL-003**: HITL Outreach 卡片正确显示 Campaign 内容
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Agent 创建外呼任务，HITL Outreach 审批卡片已显示
- **操作步骤:** 1. 观察卡片标题 2. 检查右上角 badge 3. 检查字段 Campaign / Scenario / Candidates / Schedule
- **预期结果:** 卡片标题为 "Outreach Campaign"，右上角显示 "CI AI-Calling" badge，所有字段完整显示

---

## Method 2: Boundary Value Analysis

### 超时边界

**TC-PRD-HITL-004**: HITL 卡片在 30 分钟未操作后发送通知但仍可操作
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** HITL 审批卡片已显示
- **操作步骤:** 1. 等待超过 30 分钟不操作 2. 观察是否收到通知 3. 尝试点击 Approve/Send 按钮
- **预期结果:** 超时后发送通知提醒，卡片仍保持可操作状态，可以正常点击按钮

---

## Method 3: Cause-Effect Graph / Decision Table

### 审批操作决策表

因素：C1=点击Approve/Send, C2=点击Cancel/Reject
效果：E1=执行操作并折叠卡片, E2=跳过操作并折叠卡片

| 规则 | C1 (Approve) | C2 (Cancel) | E1 (执行) | E2 (跳过) |
|------|:--:|:--:|:--:|:--:|
| R1 | Y | N | Y | N |
| R2 | N | Y | N | Y |

**TC-PRD-HITL-005**: Email 卡片点击 Send 后执行发送并折叠
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** HITL Email 审批卡片已显示，字段内容正确
- **操作步骤:** 1. 点击 "Send" 按钮
- **预期结果:** 邮件执行发送，卡片折叠为单行摘要

**TC-PRD-HITL-006**: Email 卡片点击 Cancel 后跳过发送并折叠
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** HITL Email 审批卡片已显示
- **操作步骤:** 1. 点击 "Cancel" 按钮
- **预期结果:** 邮件不发送，卡片折叠为单行摘要

**TC-PRD-HITL-007**: DingTalk 卡片点击 Create 后创建事件并折叠
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** HITL DingTalk 审批卡片已显示
- **操作步骤:** 1. 点击 "Create" 按钮
- **预期结果:** 日历事件创建成功，卡片折叠为单行摘要，按钮文案变为 "Created"

**TC-PRD-HITL-008**: DingTalk 卡片点击 Cancel 后不创建事件
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** HITL DingTalk 审批卡片已显示
- **操作步骤:** 1. 点击 "Cancel" 按钮
- **预期结果:** 日历事件不创建，卡片折叠为单行摘要

**TC-PRD-HITL-009**: Outreach 卡片点击 Launch 后启动外呼并折叠
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** HITL Outreach 审批卡片已显示
- **操作步骤:** 1. 点击 "Launch" 按钮
- **预期结果:** 外呼任务启动，卡片折叠为单行摘要

**TC-PRD-HITL-010**: Outreach 卡片点击 Cancel 后不启动外呼
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** HITL Outreach 审批卡片已显示
- **操作步骤:** 1. 点击 "Cancel" 按钮
- **预期结果:** 外呼任务不启动，卡片折叠为单行摘要

---

## Method 4: State Transition Testing

### HITL 卡片状态机

状态：S0=待审批（展开）, S1=已确认（折叠）, S2=已拒绝（折叠）

| 当前状态 | 事件 | 下一状态 |
|---------|------|---------|
| 待审批 | Approve/Send/Create/Launch | 已确认（折叠） |
| 待审批 | Cancel/Reject | 已拒绝（折叠） |
| 已确认 | — | 终态，不可逆 |
| 已拒绝 | — | 终态，不可逆 |

**TC-PRD-HITL-011**: 审批后卡片不可再操作
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** HITL 卡片已被 Approve/Send
- **操作步骤:** 1. 确认卡片已折叠为摘要 2. 尝试点击折叠后的卡片
- **预期结果:** 卡片保持折叠状态，无 Approve/Cancel 按钮，不可再次操作

**TC-PRD-HITL-012**: 拒绝后卡片不可再操作
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** HITL 卡片已被 Cancel/Reject
- **操作步骤:** 1. 确认卡片已折叠为摘要 2. 尝试点击折叠后的卡片
- **预期结果:** 卡片保持折叠状态，不可再次操作

---

## Method 5: Scenario Method

### 完整 HITL 审批流程

**TC-PRD-HITL-013**: Email HITL 完整审批流程 — 查看 + 编辑 + 发送
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** Agent 触发邮件发送，HITL Email 审批卡片已显示
- **操作步骤:** 1. 确认卡片显示 "Approval needed" 和 CI Mail badge 2. 查看 To/Subject/Body 字段 3. 点击卡片进入编辑模式 4. 修改 Subject 字段 5. 点击 "Send"
- **预期结果:** 邮件以修改后的内容发送，卡片折叠为单行摘要

**TC-PRD-HITL-014**: Outreach HITL 文件下载流程
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** HITL Outreach 审批卡片已显示，Candidates 字段包含下载文件
- **操作步骤:** 1. 查看 Candidates 字段 2. 点击文件下载按钮 3. 确认浏览器触发下载
- **预期结果:** 文件成功下载到本地

---

## Method 6: Error Guessing

**TC-PRD-HITL-015**: DingTalk 卡片为只读 — 不支持编辑字段
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** HITL DingTalk 审批卡片已显示
- **操作步骤:** 1. 尝试点击 Summary/Time/Description 字段 2. 尝试双击字段内容
- **预期结果:** 字段为只读状态，不可编辑

**TC-PRD-HITL-016**: 三种 HITL 卡片 badge 显示正确区分
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 分别触发 Email/DingTalk/Outreach 三种 HITL 审批
- **操作步骤:** 1. 查看 Email 卡片 badge 2. 查看 DingTalk 卡片 badge 3. 查看 Outreach 卡片 badge
- **预期结果:** Email → "CI Mail"，DingTalk → "CI DingTalk"，Outreach → "CI AI-Calling"

**TC-PRD-HITL-017**: 移动端 Email 卡片按钮纵向堆叠
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 移动端视口（375px），HITL Email 审批卡片已显示
- **操作步骤:** 1. 查看按钮布局
- **预期结果:** Send 和 Cancel 按钮纵向堆叠（Send 在上），字段完整显示 To/Subject/Body

---

## Merged Test Case List

**TC-PRD-HITL-001**: HITL Email 卡片正确显示 Draft Email 内容
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Agent 自动触发邮件发送，HITL Email 审批卡片已显示
- **操作步骤:** 1. 观察卡片标题 2. 检查右上角 badge 3. 检查邮件字段 To / Subject / Body
- **预期结果:** 卡片标题为 "Draft Email"，右上角显示 "CI Mail" badge，To/Subject/Body 字段完整显示

**TC-PRD-HITL-002**: HITL DingTalk 卡片正确显示 Calendar Event 内容
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Agent 创建日历事件，HITL DingTalk 审批卡片已显示
- **操作步骤:** 1. 观察卡片标题 2. 检查右上角 badge 3. 检查事件字段 Summary / Time / Organizer / Attendees / Description
- **预期结果:** 卡片标题为 "Calendar Event"，右上角显示 "CI DingTalk" badge，所有事件字段完整显示

**TC-PRD-HITL-003**: HITL Outreach 卡片正确显示 Campaign 内容
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Agent 创建外呼任务，HITL Outreach 审批卡片已显示
- **操作步骤:** 1. 观察卡片标题 2. 检查右上角 badge 3. 检查字段 Campaign / Scenario / Candidates / Schedule
- **预期结果:** 卡片标题为 "Outreach Campaign"，右上角显示 "CI AI-Calling" badge，所有字段完整显示

**TC-PRD-HITL-004**: HITL 卡片在 30 分钟未操作后发送通知但仍可操作
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** HITL 审批卡片已显示
- **操作步骤:** 1. 等待超过 30 分钟不操作 2. 观察是否收到通知 3. 尝试点击 Approve/Send 按钮
- **预期结果:** 超时后发送通知提醒，卡片仍保持可操作状态

**TC-PRD-HITL-005**: Email 卡片点击 Send 后执行发送并折叠
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** HITL Email 审批卡片已显示，字段内容正确
- **操作步骤:** 1. 点击 "Send" 按钮
- **预期结果:** 邮件执行发送，卡片折叠为单行摘要

**TC-PRD-HITL-006**: Email 卡片点击 Cancel 后跳过发送并折叠
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** HITL Email 审批卡片已显示
- **操作步骤:** 1. 点击 "Cancel" 按钮
- **预期结果:** 邮件不发送，卡片折叠为单行摘要

**TC-PRD-HITL-007**: DingTalk 卡片点击 Create 后创建事件并折叠
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** HITL DingTalk 审批卡片已显示
- **操作步骤:** 1. 点击 "Create" 按钮
- **预期结果:** 日历事件创建成功，卡片折叠为单行摘要，按钮文案变为 "Created"

**TC-PRD-HITL-008**: DingTalk 卡片点击 Cancel 后不创建事件
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** HITL DingTalk 审批卡片已显示
- **操作步骤:** 1. 点击 "Cancel" 按钮
- **预期结果:** 日历事件不创建，卡片折叠为单行摘要

**TC-PRD-HITL-009**: Outreach 卡片点击 Launch 后启动外呼并折叠
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** HITL Outreach 审批卡片已显示
- **操作步骤:** 1. 点击 "Launch" 按钮
- **预期结果:** 外呼任务启动，卡片折叠为单行摘要

**TC-PRD-HITL-010**: Outreach 卡片点击 Cancel 后不启动外呼
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** HITL Outreach 审批卡片已显示
- **操作步骤:** 1. 点击 "Cancel" 按钮
- **预期结果:** 外呼任务不启动，卡片折叠为单行摘要

**TC-PRD-HITL-011**: 审批后卡片不可再操作
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** HITL 卡片已被 Approve/Send
- **操作步骤:** 1. 确认卡片已折叠为摘要 2. 尝试点击折叠后的卡片
- **预期结果:** 卡片保持折叠状态，无 Approve/Cancel 按钮，不可再次操作

**TC-PRD-HITL-012**: 拒绝后卡片不可再操作
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** HITL 卡片已被 Cancel/Reject
- **操作步骤:** 1. 确认卡片已折叠为摘要 2. 尝试点击折叠后的卡片
- **预期结果:** 卡片保持折叠状态，不可再次操作

**TC-PRD-HITL-013**: Email HITL 完整审批流程 — 查看 + 编辑 + 发送
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** Agent 触发邮件发送，HITL Email 审批卡片已显示
- **操作步骤:** 1. 确认卡片显示 "Approval needed" 和 CI Mail badge 2. 查看 To/Subject/Body 字段 3. 点击卡片进入编辑模式 4. 修改 Subject 字段 5. 点击 "Send"
- **预期结果:** 邮件以修改后的内容发送，卡片折叠为单行摘要

**TC-PRD-HITL-014**: Outreach HITL 文件下载流程
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** HITL Outreach 审批卡片已显示，Candidates 字段包含下载文件
- **操作步骤:** 1. 查看 Candidates 字段 2. 点击文件下载按钮 3. 确认浏览器触发下载
- **预期结果:** 文件成功下载到本地

**TC-PRD-HITL-015**: DingTalk 卡片为只读 — 不支持编辑字段
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** HITL DingTalk 审批卡片已显示
- **操作步骤:** 1. 尝试点击 Summary/Time/Description 字段 2. 尝试双击字段内容
- **预期结果:** 字段为只读状态，不可编辑

**TC-PRD-HITL-016**: 三种 HITL 卡片 badge 显示正确区分
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 分别触发 Email/DingTalk/Outreach 三种 HITL 审批
- **操作步骤:** 1. 查看 Email 卡片 badge 2. 查看 DingTalk 卡片 badge 3. 查看 Outreach 卡片 badge
- **预期结果:** Email → "CI Mail"，DingTalk → "CI DingTalk"，Outreach → "CI AI-Calling"

**TC-PRD-HITL-017**: 移动端 Email 卡片按钮纵向堆叠
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 移动端视口（375px），HITL Email 审批卡片已显示
- **操作步骤:** 1. 查看按钮布局
- **预期结果:** Send 和 Cancel 按钮纵向堆叠（Send 在上），字段完整显示 To/Subject/Body
