<!-- PRD-hash: 807dd865943f4c3a6b55833b19ea5eb446ae8a7270d3f0dd9ed859eaf3e327b0 | PRD-module: Email Canvas V3 — 功能需求 (REQ-0/1/2/4/5/6) | feature-slug: email-canvas-v3 -->
<!-- source: prd | prd-file: docs/prd-email-canvas-V3.0-final.md | generated: 2026-05-20 -->

# Email Canvas V3 测试用例（PRD 驱动）

> 覆盖 PRD 功能需求 6 个核心模块：REQ-0（Host 内置工具）、REQ-1（起草新邮件）、REQ-2（起草邮件回复）、REQ-4（Canvas state 持久化）、REQ-5（容器校验与发送条件）、REQ-6（发送前二次确认）。
>
> REQ-3 已在 V3.0 删除（邮件正文复制），本文档不为其生成用例。

---

## Method 1: Equivalence Partitioning

> 将每个输入域划分为有效与无效等价类。一个用例可覆盖多个有效类，但只覆盖一个无效类。

**适用维度**

| 输入域 | 有效等价类 | 无效等价类 |
|--------|------------|------------|
| `to` 收件人邮箱格式 | 单个合法邮箱、多个合法邮箱 | 缺少 `@`、缺少域名、空数组、格式非法字符 |
| `subject` 主题长度 | 1–100 字符 | 空字符串、长度 > 100、纯空白 |
| `body` 正文 | 任意非空文本 | 空字符串、仅空白字符 |
| 邮箱 connector 状态 | 已连接 Gmail、已连接 Outlook、已连接两者 | 未连接任何邮箱 |
| 用户对当前 draft 的修改路径 | 对话改（走 create 新建）、Canvas UI 字段编辑（走 backend 直写） | 在终态 draft 上继续编辑 |

**用例**：见 Merged Test Case List 中 TC-EC-001、TC-EC-007、TC-EC-009、TC-EC-013、TC-EC-022。

---

## Method 2: Boundary Value Analysis

> 取边界、边界减一、边界加一。

**边界点**

| 字段 | 下边界 | 上边界 |
|------|--------|--------|
| `subject` 长度 | 0 / 1 字符 | 99 / 100 / 101 字符 |
| `to`/`cc`/`bcc` 数组长度 | 0 / 1 个邮箱 | 49 / 50 / 51 个邮箱 |
| `to` 字段 chip 行数 | 0 / 1 chip | 2 行内全部可见 / 超出折叠为 +N More |
| Confirm 工具等待时间 | < 30s | > 30s（保持等待不超时） |
| 草稿创建重试次数 | 0 / 1 次 | 2 / 3 次后提示手动 |

**用例**：TC-EC-002、TC-EC-014、TC-EC-015、TC-EC-018、TC-EC-019、TC-EC-026。

---

## Method 3: Cause-Effect Graph / Decision Table

> 多条件组合下的发送按钮状态、Confirm 触发条件。

**条件**（C）

- C1：To 字段格式合法且非空
- C2：Subject 非空且 ≤ 100 字符
- C3：Body 非空（去空格后）
- C4：（回复场景）thread_id 或 reply_to_message_id 存在
- C5：连接器（Gmail/Outlook）已连接

**效应**（E）

- E1：发送按钮可点击
- E2：发送按钮置灰
- E3：点击发送 → 调用 Confirm 工具
- E4：对应字段标红

**决策表**（截选）

| 用例 | C1 | C2 | C3 | C4 | C5 | 效应 |
|------|----|----|----|----|----|------|
| TC-EC-010 | T | T | T | T | T | E1, E3（点击后） |
| TC-EC-011 | F | T | T | - | T | E2, E4(To) |
| TC-EC-012 | T | F | T | - | T | E2, E4(Subject) |
| TC-EC-016 | T | T | F | - | T | E2, E4(Body) |
| TC-EC-017 | T | T | T | F | T | E2，且提示「未关联原邮件」 |
| TC-EC-008 | - | - | - | - | F | LLM 不调 `create_email_draft_content`，对话引导连接 |

**用例**：TC-EC-008、TC-EC-010、TC-EC-011、TC-EC-012、TC-EC-016、TC-EC-017。

---

## Method 4: State Transition Testing

> Canvas / draft 的状态机：`pending` → `executed` / `execution_failed` / `execution_aborted`；以及"对话改 = 新建 draft + 旧 draft 切终态"的双路径。

**状态机要点**

- pending → executed：用户在 Canvas 点击发送 → Confirm panel 确认 → send 成功
- pending → execution_aborted（手动取消）：用户点击 Canvas 取消按钮
- pending → execution_aborted（对话改）：用户在对话发起重写意图 → LLM 调 create 生成新 draft_id，旧 draft 由 Host 自动切终态
- executed → 只读 ribbon：折叠为 Inline ribbon，点击升级到只读 Canvas
- 终态切回：会话切换后切回，Canvas 按 draft_id 自动重新挂载

**用例**：TC-EC-003、TC-EC-020、TC-EC-021、TC-EC-022、TC-EC-024、TC-EC-025。

---

## Method 5: Scenario Method

> 主流程 + 备选流程组合。

**基本流程**

- BF-1：起草新邮件 → Canvas 渲染 → 用户在 Canvas 内编辑 → 发送按钮 → Confirm panel → 确认 → 发送成功 → 只读 ribbon
- BF-2：起草邮件回复 → 线程检索 → 拉取原文 → Canvas 渲染回复草稿 → Confirm → 发送

**备选流程**

- AF-1：意图模糊（追问收件人）
- AF-2：对话重写（旧 draft 切终态、新 draft expanded）
- AF-3：Canvas 取消按钮（切 execution_aborted、ribbon 显示已取消）
- AF-4：Confirm panel 用户点击拒绝
- AF-5：多 draft 顺序起草（A 完成后接续 B）
- AF-6：跨会话切换后切回（Canvas 自动重挂载）
- AF-7：网络断开（离线横幅）
- AF-8：邮箱授权过期（重新授权后不自动重试）

**用例**：TC-EC-004、TC-EC-005、TC-EC-006、TC-EC-023、TC-EC-024、TC-EC-025、TC-EC-029、TC-EC-030、TC-EC-031。

---

## Method 6: Error Guessing

> 经验性的异常猜测：跨设备并发、Confirm 工具失败、Confirm 等待期间字段被改、线程 ID 丢失、连续 5xx、网络断开、Composio 误调用。

**风险猜测**

- ER-1：用户授权 Token 在草稿创建过程中刚好失效
- ER-2：Confirm 工具调用失败（Mira Host HITL 层异常） → **不允许降级**，send 类 Composio 不调用
- ER-3：Confirm panel 展示期间，用户在 Canvas 修改 Subject/Body → panel 应失效，要求重新点发送
- ER-4：thread_id 在 Canvas 渲染后丢失（数据层异常）→ 发送按钮置灰
- ER-5：连续 3 次草稿创建 5xx → 对话提示手动重试，Canvas 不展开
- ER-6：跨设备并发 Canvas UI 同时编辑同字段 → 后写覆盖先写，订阅推送两端最终一致
- ER-7：误调用 Composio CREATE_DRAFT 类 action → 验证 Composio 调用计数 = 0、用户邮箱草稿箱不出现 draft 对象

**用例**：TC-EC-027、TC-EC-028、TC-EC-032、TC-EC-033、TC-EC-034、TC-EC-035、TC-EC-036。

---

## Merged Test Case List

> 合并去重后的最终用例清单。每个 TC 一行一格，对应 handoff JSON 一个 entry，1:1 映射。

### REQ-0：Mira Host 内置邮件草稿创建工具

**TC-EC-001**: 调用 create_email_draft_content 创建新邮件草稿成功返回 draft_id 和 state
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已连接 Gmail；LLM 工具池已加载 Mira Host 内置工具
- **操作步骤:** 1) 用户在对话中说「帮我给 sarah@example.com 发封邮件，主题是职位邀约，正文说明职位详情」 2) Mira 调用 create_email_draft_content 传入 {to, subject, body} 3) 等待 Canvas 渲染
- **预期结果:** create 返回 {draft_id, state, connector}，state 含传入的三字段；Canvas 接收到 entityRef 事件并 expanded 渲染；Canvas inline card header 渲染 Gmail 图标 + 「Gmail」type_label
- **测试数据:** to=["sarah@example.com"], subject="职位邀约", body="..."

**TC-EC-002**: subject 长度边界 100/101 字符
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户已连接邮箱；Canvas 未渲染
- **操作步骤:** 1) 准备 subject 长度=100 字符的入参，调用 create，断言成功 2) 准备 subject 长度=101 字符的入参，调用 create，断言失败 3) 准备 subject 长度=99 字符的入参，调用 create，断言成功
- **预期结果:** subject=100 与 99 均通过工具层校验生成 draft；subject=101 返回 schema validation error 且不创建 draft
- **测试数据:** subject 长度 99 / 100 / 101

**TC-EC-003**: 对话驱动修改 → 新建 draft + 旧 draft 自动切 execution_aborted 终态
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户已连接 Gmail；已存在活跃 draft_id=d1（pending 态）
- **操作步骤:** 1) 用户在对话说「把主题改成职位邀约 V2」 2) Mira 读取 d1 最新 state，调用 create_email_draft_content 传入新字段 3) 等待 Canvas 切换
- **预期结果:** 返回 draft_id=d2 ≠ d1；d1 自动切到 execution_aborted 终态；Canvas 把 d1 折叠为 Inline ribbon「已取消」，并渲染 d2 expanded 卡片
- **测试数据:** d1.subject="旧主题"; new subject="职位邀约 V2"

**TC-EC-007**: to 字段含非法邮箱 "abc@" → schema validation error
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户已连接 Gmail；已存在活跃 draft_id=d1
- **操作步骤:** 1) LLM 调 create 传入 to=["abc@"] 2) 等待工具返回
- **预期结果:** 返回 schema validation error；不生成新 draft；d1 保持 pending 态（不切终态）
- **测试数据:** to=["abc@"]

**TC-EC-008**: 用户未连接任何邮箱时 LLM 不应调用 create_email_draft_content（异常路径双重保险）
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 用户未绑定任何邮箱 connector（Gmail / Outlook 均未连接）
- **操作步骤:** 1) 用户在对话中说「帮我给 sarah@example.com 发邮件」 2) 观察 LLM 是否调用 create；3) 模拟 LLM 误调，断言工具层拒绝
- **预期结果:** LLM 不调用 create_email_draft_content，对话引导用户先连接 Gmail / Outlook；若 LLM 误调，工具层返回 no_connector_authorized 错误，draft 不创建
- **测试数据:** 无 connector

**TC-EC-009**: connector 来源解析正确（回复 Outlook 邮件时 connector.name="Outlook"）
- **优先级:** P2
- **测试类型:** 等价类划分
- **前置条件:** 用户已连接 Gmail + Outlook；原始线程为 Outlook message
- **操作步骤:** 1) LLM 调 create_email_draft_content 携带 reply_to_message_id（Outlook 来源） 2) 等待 output
- **预期结果:** output.connector.name="Outlook" 且 logo 指向 Outlook 图标；Canvas header 渲染 Outlook 图标 + 「Outlook」type_label
- **测试数据:** reply_to_message_id="outlook-msg-xxx"

**TC-EC-036**: 调用 create_email_draft_content 不污染 Composio 草稿箱
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已连接 Gmail；监控 Composio MCP 调用计数；监控用户 Gmail 草稿箱
- **操作步骤:** 1) LLM 主动调 create_email_draft_content 创建 1 封 draft 2) 验证 Composio MCP 调用计数 3) 查询 Gmail 草稿箱是否新增 draft 对象
- **预期结果:** Composio MCP 工具池调用计数 = 0；用户 Gmail / Outlook 草稿箱不出现新 draft（人工核查或邮箱 API 查询）
- **测试数据:** 无

### REQ-1：起草新邮件

**TC-EC-004**: happy 起草新邮件完整链路（含 Confirm 确认 → 发送 → 只读 ribbon）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已连接 Gmail；Canvas 未渲染任何草稿
- **操作步骤:** 1) 在对话中说「帮我给 sarah@example.com 发封邮件，主题是职位邀约，正文说明职位详情」 2) Canvas 展开渲染草稿，验证三字段已填充 3) 点击 Canvas 发送按钮 4) Confirm panel 出现 5) 点击「确认」
- **预期结果:** Canvas 展开渲染；点击发送后 Confirm panel 展示收件人/主题/正文截断/风险提示；点击确认后调 send_email；邮件成功发出；Canvas 进入只读状态；对话历史中出现 Inline ribbon 展示已发送草稿
- **测试数据:** to=["sarah@example.com"], subject="职位邀约", body="..."

**TC-EC-005**: 意图模糊（未提供收件人）→ Mira 追问而不创建草稿
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户已连接 Gmail；Canvas 未展开
- **操作步骤:** 1) 用户说「帮我给某人发邮件」（未指定收件人） 2) 等待 Mira 响应
- **预期结果:** Mira 不调用 create_email_draft_content；Canvas 不展开；对话中出现追问收件人的提示「你想发给哪位候选人？」
- **测试数据:** prompt="帮我给某人发邮件"

**TC-EC-006**: 多 draft 顺序起草（A 完成后接续 B，隐式 ack）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户已连接 Gmail；Canvas 未渲染
- **操作步骤:** 1) 用户说「帮我给 A 发邀约邮件，再给 B 发面试反馈」 2) 验证 Mira 同一 turn 内调 write_todo + 调 create 创建 A 的草稿 3) 在 Canvas 编辑 A 并点击发送 → Confirm 确认 → A 发送成功 4) 验证 Mira 自动接续创建 B 的草稿，Canvas 切到 B
- **预期结果:** 同一 turn 内对话出现拆分确认；write_todo 工具被调用记录两项任务；create 被调用创建 A；A 进入终态后无需用户说「下一封」，Mira 自动 create B；任意时刻 UI 只渲染一个活跃 Canvas
- **测试数据:** A=alpha@x.com, B=beta@x.com

**TC-EC-022**: 收件人与发件人相同时允许自发送
- **优先级:** P2
- **测试类型:** 等价类划分
- **前置条件:** 用户已连接 Gmail（发件人 self@example.com）；Canvas 渲染草稿
- **操作步骤:** 1) 在 To 字段输入 self@example.com（与发件人相同） 2) 填好 Subject 与 Body 3) 点击发送 → Confirm → 确认
- **预期结果:** 不弹出警告；邮件成功发出；适用于测试场景
- **测试数据:** to=["self@example.com"]

**TC-EC-033**: 草稿创建临时 5xx 静默重试一次后成功
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已连接邮箱；意图明确
- **操作步骤:** 1) 模拟草稿创建接口第一次返回 5xx 2) 触发 create 调用 3) 等待自动重试
- **预期结果:** 系统静默重试至少 1 次；重试成功后 Canvas 正常展开渲染草稿；对话不出现错误提示（用户全程无感知）
- **测试数据:** 5xx 一次 → 200

**TC-EC-034**: 连续 3 次 5xx → 对话提示手动重试，Canvas 不展开
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已连接邮箱；意图明确
- **操作步骤:** 1) 模拟草稿创建接口连续 3 次返回 5xx 2) 触发 create 3) 等待重试耗尽
- **预期结果:** 对话中出现手动重试提示「邮件发送失败，请稍后重试」（界面消息表第 4 行）；Canvas 不展开
- **测试数据:** 5xx × 3

**TC-EC-035**: 邮箱授权过期 → 对话提示重新授权，授权完成后不自动重试
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已连接 Gmail（即将过期）
- **操作步骤:** 1) 模拟 Token 在草稿创建过程中失效（返回 401） 2) 触发 create 3) 完成重新授权 4) 验证 Mira 是否自动重试
- **预期结果:** 对话提示「邮箱连接已断开，请重新授权」并弹出授权引导；Canvas 不展开；授权完成后 Mira 不自动重新创建草稿；对话中显示「邮箱已重新连接，请继续之前的操作」；用户需主动重新提请求
- **测试数据:** Token 401 → 重新授权

### REQ-2：起草邮件回复

**TC-EC-030**: happy 起草邮件回复完整链路（含线程检索 + 拉取原文 + Confirm 确认 + 发送）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已连接 Gmail；历史线程中存在唯一匹配 sarah@example.com 的邮件
- **操作步骤:** 1) 用户在对话中说「回复 Sarah 那封邮件，说我周四有时间面谈」 2) 验证 Mira 调用 GMAIL_FETCH_EMAILS / OUTLOOK_SEARCH_MESSAGES 检索线程 3) 验证调用 GMAIL_FETCH_MESSAGE_BY_THREAD_ID 拉取原文 4) Canvas 展开渲染回复草稿（携带正确 thread_id） 5) 点击发送 → Confirm → 确认
- **预期结果:** 检索定位单一线程；草稿携带正确 thread_id；Canvas 展开；点击发送→Confirm panel→确认→send_email 携带 thread_id 调用；回复成功并绑定原始线程；Canvas 只读；Inline ribbon 展示
- **测试数据:** target=sarah@example.com

**TC-EC-031**: 目标邮件不明确（命中多个候选） → 列出候选让用户选
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户已连接 Gmail；历史线程中存在 3 封匹配「Sarah」的邮件
- **操作步骤:** 1) 用户说「回复 Sarah 的邮件」 2) 等待 Mira 响应
- **预期结果:** Mira 在对话中展示 3 条候选线程列表（界面消息表第 1 行）；Canvas 不提前展开；用户确认后才拉原文 + 创建草稿
- **测试数据:** keyword="Sarah", 3 个匹配线程

**TC-EC-032**: 线程 ID 在 Canvas 渲染后丢失（数据层异常） → 发送按钮置灰
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** Canvas 已渲染回复草稿；模拟 thread_id 在渲染后丢失
- **操作步骤:** 1) 用户点击 Canvas 发送按钮 2) 观察按钮状态
- **预期结果:** 发送按钮保持置灰；Canvas 发送按钮下方展示「未关联到原邮件」提示；用户需重新检索原邮件后才能发送
- **测试数据:** thread_id=null

**TC-EC-017**: 回复时 thread_id / reply_to_message_id 缺失 → 发送按钮置灰
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** Canvas 已渲染回复草稿（thread_id 与 reply_to_message_id 均为 null）
- **操作步骤:** 1) 填好 To/Subject/Body 2) 点击发送按钮
- **预期结果:** 发送按钮保持置灰；提示「未关联原邮件」；Confirm panel 不弹出；send 类 Composio 不调用
- **测试数据:** thread_id=null, reply_to_message_id=null

### REQ-4：Canvas state 持久化与会话恢复

**TC-EC-020**: Canvas UI 字段编辑 → backend 直写同一 draft_id，Mira 下一轮基于最新 state 响应
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** Canvas 已渲染 draft_id=d1，Subject 当前值为「旧主题」
- **操作步骤:** 1) 用户在 Canvas 的 Subject 字段输入「新主题」并失焦 2) 在对话中提问「这封邮件的主题是什么？」 3) 等待 Mira 响应
- **预期结果:** d1 store 中 Subject="新主题"；不触发新 create；d1.draft_id 保持不变；Mira 下一轮对话响应中读取到的主题为「新主题」
- **测试数据:** 输入 "新主题"

**TC-EC-021**: 会话切换后切回 → Canvas 自动按 draft_id 重新挂载
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户已在会话 A 中打开 draft_001（pending 态），Canvas 已渲染
- **操作步骤:** 1) 用户切换到会话 B 2) 切回会话 A
- **预期结果:** Canvas 自动重新挂载 draft_001；展示切走前的最新 state；用户无需手动重新打开草稿
- **测试数据:** draft_001 pending 态

**TC-EC-024**: 终态 draft（executed）切回会话后点击 ribbon → 只读升级
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** 用户已发送 draft_002（executed 态），对话历史中以 ribbon 折叠
- **操作步骤:** 1) 用户切换会话 2) 切回 3) 点击 ribbon
- **预期结果:** Canvas 升级到 Side Panel / Fullscreen Modal 只读展开 draft_002 内容（全字段可见但禁止编辑）
- **测试数据:** draft_002 executed 态

**TC-EC-027**: 网络断开 → Canvas 顶部出现离线横幅
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Canvas 已渲染草稿，网络正常
- **操作步骤:** 1) 模拟设备网络断开 2) 用户在 Canvas 的 To 字段编辑收件人 3) 模拟网络恢复
- **预期结果:** Canvas 顶部出现离线横幅「当前已离线，更改未保存，请检查网络连接」；网络恢复后 Canvas 尝试补传编辑内容
- **测试数据:** network=offline

**TC-EC-028**: 草稿已被删除 → Canvas 展示空状态 + 错误提示
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Canvas 已渲染 draft_001；模拟 draft_001 在后端被删除
- **操作步骤:** 1) 模拟 draft_001 后端删除 2) 用户在 Canvas 内编辑任意字段并提交
- **预期结果:** Canvas 展示空状态并提示草稿不存在；对话中提示用户可在对话里重新发起以生成新 draft
- **测试数据:** draft_001 deleted

**TC-EC-029**: Canvas unmount 前强制提交未写入编辑（标签页关闭）
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** Canvas 已渲染草稿；用户在 Body 字段输入了新内容（尚未提交）
- **操作步骤:** 1) 用户在 Body 字段输入新内容（不失焦） 2) 用户关闭当前浏览器标签页 3) 重新打开草稿
- **预期结果:** 在标签页关闭前未提交的 Body 编辑被强制写入 draft store；重新打开草稿时可见该内容
- **测试数据:** body="未失焦的草稿内容"

### REQ-5：Canvas 容器校验与发送条件

**TC-EC-010**: 三字段全部合法 → 发送按钮可点击
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** Canvas 已渲染草稿
- **操作步骤:** 1) 填写 To = a@b.com、Subject = "X"、Body = "Y" 2) 观察发送按钮状态
- **预期结果:** 发送按钮处于可点击状态（非置灰）；点击后触发 Confirm panel
- **测试数据:** to=["a@b.com"], subject="X", body="Y"

**TC-EC-011**: To 字段为空 → 发送按钮置灰 + To 字段标红
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** Canvas 已渲染草稿
- **操作步骤:** 1) Subject 和 Body 已填，To 字段保持空 2) 观察发送按钮和 To 字段
- **预期结果:** 发送按钮置灰；To 字段显示标红状态；点击发送区域不会调用 Confirm
- **测试数据:** to=[]

**TC-EC-012**: Subject 为空 → 发送按钮置灰 + Subject 字段标红
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** Canvas 已渲染草稿
- **操作步骤:** 1) To 和 Body 已填，Subject 保持空 2) 观察按钮和字段
- **预期结果:** 发送按钮置灰；Subject 字段标红；界面消息「请填写收件人、主题和正文」可见
- **测试数据:** subject=""

**TC-EC-013**: To 字段含格式非法邮箱（"abc@"） → chip 红框 + 发送按钮置灰
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Canvas 已渲染草稿
- **操作步骤:** 1) 在 To 字段输入「abc@」 2) 敲下 Enter / Tab / 分号 / 逗号或将焦点移出 3) 观察 chip 和按钮
- **预期结果:** 非法字符串封装为 chip 并红框高亮；界面消息「邮箱格式不正确」可见；发送按钮置灰；chip 可点击重新编辑
- **测试数据:** to="abc@"

**TC-EC-014**: 粘贴含多个地址的文本 → 按分隔符自动拆为多个 chip
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Canvas 已渲染草稿，To 字段为空
- **操作步骤:** 1) 粘贴文本「a@b.com, c@d.com; e@f.com」到 To 字段 2) 观察 chip
- **预期结果:** 自动按分隔符拆为 3 个 chip，全部为合法邮箱、无红框；不残留未封装文本
- **测试数据:** paste="a@b.com, c@d.com; e@f.com"

**TC-EC-015**: 收件人数量上限 50 / 第 51 个被阻断
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** Canvas 已渲染草稿，To 字段为空
- **操作步骤:** 1) 向 To 字段添加 49 个合法邮箱（断言通过） 2) 添加第 50 个（断言通过 + 提示出现） 3) 尝试添加第 51 个
- **预期结果:** 第 49/50 个邮箱可成功添加；第 50 个时界面消息「最多 50 个收件人」可见；第 51 个输入被阻断
- **测试数据:** 邮箱数 49 / 50 / 51

**TC-EC-016**: Body 字段为空或仅含空格 → 发送按钮置灰 + Body 字段标红
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** Canvas 已渲染草稿
- **操作步骤:** 1) To 和 Subject 已填，Body 输入「   」（仅空格） 2) 观察按钮和字段
- **预期结果:** 发送按钮置灰；Body 字段显示标红状态；纯空格等同于空
- **测试数据:** body="   "

**TC-EC-018**: Subject 长度上限 100 / 第 101 个字符被阻断
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** Canvas 已渲染草稿
- **操作步骤:** 1) 在 Subject 字段输入 100 个字符 2) 尝试继续输入第 101 个字符 3) 观察字段内容和提示
- **预期结果:** 第 100 个字符接受；第 101 个字符被阻断（字段不增长）；界面消息「主题最多 100 个字符」可见；已有内容不丢失
- **测试数据:** subject 长度=100 → 尝试 101

**TC-EC-019**: To 字段 15 个 chip 超过 2 行容量 → +N More 折叠 + 点击展开
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Canvas 已渲染草稿；To 字段含 15 个 chip
- **操作步骤:** 1) 字段失焦后观察 chip 展示 2) 点击 +M More 按钮 3) 点击「收起」
- **预期结果:** 默认展示前 N 行能放下的 chip + 「+M More」按钮（N=2, M=剩余数量）；点击 More 字段展开完整列表；再次点击「收起」回到 2 行折叠态
- **测试数据:** chip count=15

**TC-EC-023**: 取消按钮 → draft 切 execution_aborted + Canvas 折叠 ribbon 显示「已取消」
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** Canvas 编辑态，pending 态 draft
- **操作步骤:** 1) 用户点击 Canvas 取消按钮 2) 验证 draft state 与 Canvas 形态 3) 用户后续重新提邮件请求
- **预期结果:** 当前 draft 切 execution_aborted 终态，draft_id 失效；Canvas 折叠为 Inline ribbon「已取消」；点击 ribbon 升级到 Side Panel 仅展示只读历史，无编辑入口；用户后续重提请求时 LLM 调 create 生成全新 draft_id，不复用旧
- **测试数据:** 无

**TC-EC-025**: To/Cc 同一邮箱出现 → 发送时按 To>Cc>Bcc 去重保留 To
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Canvas 已渲染草稿，同一邮箱 a@b.com 同时出现在 To 和 Cc 字段
- **操作步骤:** 1) 配置 to=[a@b.com], cc=[a@b.com] 2) 填好其他字段 3) 点击发送 → Confirm → 确认
- **预期结果:** 发送时自动去重：a@b.com 保留在 To，从 Cc 中移除；邮件正常发出
- **测试数据:** to=[a@b.com], cc=[a@b.com]

**TC-EC-026**: 发送中按钮禁用 / 发送成功后 Canvas 整体只读
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Canvas 草稿各字段校验通过
- **操作步骤:** 1) 点击发送 → Confirm 确认 2) 在请求返回前观察按钮 3) 请求返回成功后观察 Canvas
- **预期结果:** 发送中按钮 loading 且禁用，防止重复点击；发送成功后 Canvas 进入只读模式；所有字段不可编辑；发送按钮消失或变为已发送状态
- **测试数据:** 无

### REQ-6：发送前二次确认

**TC-EC-037**: Confirm panel 弹出展示收件人/主题/正文截断与风险提示
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** Canvas 草稿通过容器校验（To / Subject / Body 均有效），用户已授权
- **操作步骤:** 1) 用户点击 Canvas 发送按钮 2) 等待 Confirm 工具调用 3) 观察 panel
- **预期结果:** Mira 调用 Confirm 工具；对话中出现 Confirm panel，显示收件人、主题、正文截断及风险提示文案（界面消息表第 1/2/3 行）；「拒绝 / 确认」两个按钮可点击
- **测试数据:** 无

**TC-EC-038**: Confirm panel 点击「拒绝」 → 取消发送，Canvas 保持当前状态
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** Confirm panel 已展示，草稿内容未被修改
- **操作步骤:** 1) 用户点击 panel 内「拒绝」按钮 2) 验证后续状态
- **预期结果:** Mira 不调用 send_email；对话中出现「已取消发送」；Canvas 保持当前状态不变，所有字段保留；Mira 不主动发出继续编辑提示，也不调用 create_email_draft_content；等待用户主动重新提出要求
- **测试数据:** 无

**TC-EC-039**: Confirm 工具调用失败（Mira Host HITL 层异常） → 不允许降级
- **优先级:** P0
- **测试类型:** 错误猜测
- **前置条件:** Canvas 草稿通过容器校验；模拟 Mira Host HITL 层异常（Confirm 工具调用返回错误）
- **操作步骤:** 1) 用户点击发送按钮 2) Confirm 工具调用失败 3) 监控 send 类 Composio action 调用计数 4) 观察 Canvas 状态
- **预期结果:** 对话中显示「二次确认服务暂不可用，邮件未发送，请稍后重试」；send 类 Composio action（GMAIL_SEND_EMAIL 等）不被调用（计数 = 0）；Canvas 保持 expanded 编辑态；用户可重新点击发送按钮触发新一轮 Confirm
- **测试数据:** Confirm 工具 mock error

**TC-EC-040**: Confirm panel 等待期间 Canvas 字段被修改 → panel 失效
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Confirm panel 已展示
- **操作步骤:** 1) panel 创建后，用户在 Canvas 的 Subject 字段输入新内容 2) 观察 panel 状态
- **预期结果:** Confirm panel 自动关闭或失效；对话中提示「邮件内容已修改，请重新点击发送」；Canvas 保持可编辑状态，用户需重新点击发送按钮
- **测试数据:** Subject 在 panel 等待期间被改

**TC-EC-041**: 容器校验未通过时点击发送 → Confirm 不被触发
- **优先级:** P2
- **测试类型:** 因果图
- **前置条件:** Canvas 草稿 To / Subject 已填，Body 为空（REQ-5 校验未通过）
- **操作步骤:** 1) 用户尝试点击发送按钮 2) 观察 Confirm panel 是否出现
- **预期结果:** 发送按钮处于置灰状态，Mira 不调用 Confirm 工具；Confirm panel 不出现
- **测试数据:** body=""

**TC-EC-042**: Confirm panel 用户切换会话再切回 → panel 仍可见
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** Confirm panel 已展示，草稿内容未被修改
- **操作步骤:** 1) 用户切换到另一个会话 2) 切回当前会话 3) 观察 panel
- **预期结果:** Confirm panel 仍可见（未被关闭）；「拒绝 / 确认」按钮仍可点击
- **测试数据:** 无
