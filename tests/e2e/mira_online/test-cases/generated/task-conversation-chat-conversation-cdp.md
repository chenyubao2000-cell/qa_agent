# 测试用例：Task Conversation (File Upload + Send + AI Tools + Workspace)

<!-- source: cdp | baseline: test-cases/generated/page-baseline-task-conversation.json | area: chat-conversation | generated: 2026-03-24T00:00:00Z -->

**页面 URL**: `https://www.mira.day/task`
**探查 area**: `chat-conversation` (chat-input + file-upload + chat-response + workspace-panel)
**探查状态**: S0（空会话）→ S1（文件已附加）→ S2（消息发送中/AI思考）→ S3（工具卡片展示）→ S5（工作区面板打开）
**需要登录**: 是

---

## Method 1: Equivalence Partitioning（等价类划分）

### US-CONV-01：文件上传 — 文件类型分区

| 分区 | 输入 | 预期结果 |
|------|------|----------|
| 支持的文档类型 | sample.pdf / sample.txt / sample.md | 文件名显示在附件区，Submit 启用 |
| 支持的图片类型 | sample.jpg / sample.png / sample.gif | 文件名显示在附件区，Submit 启用 |
| 支持的 Office 类型 | sample.docx / sample.xlsx / sample.pptx | 文件名显示在附件区，Submit 启用 |
| 不支持的类型 | sample.exe / sample.zip | 文件被拒绝或提示不支持 |

**TC-CDP-CONV-001** [P0] 附加支持格式文件后 Submit 按钮变为可点击
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：1. 点击"添加照片或文件"按钮触发隐藏文件输入；2. 使用 setInputFiles 上传 sample.pdf
- 预期：附件区显示文件名，Submit 按钮变为可点击状态（S1）

**TC-CDP-CONV-002** [P1] 同时附加多个文件时均显示在附件区
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：1. 通过隐藏 file input 同时上传 sample.pdf 和 sample.txt
- 预期：两个文件名均显示在附件区，Submit 按钮启用

---

### US-CONV-02：消息发送 — 输入内容分区

| 分区 | 操作 | 预期结果 |
|------|------|----------|
| 纯文本消息 | 输入文字 + 点击 Submit | 导航至 /task/{id}，用户消息可见 |
| 仅文件（无文本） | 上传文件 + 点击 Submit | 导航至 /task/{id}，文件附件按钮可见 |
| 文本 + 文件 | 输入文字 + 上传文件 + Submit | 导航至 /task/{id}，文字和文件均显示 |
| 空输入 | 不输入文字也不上传文件 | Submit 按钮保持禁用 |

**TC-CDP-CONV-003** [P0] 仅上传文件（无文字）点击 Submit 后导航至任务详情
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：1. 上传 sample.txt；2. 点击 Submit
- 预期：URL 变为 /task/{taskId}，聊天日志中出现文件按钮（S2）

**TC-CDP-CONV-004** [P1] 未附加任何内容时 Submit 按钮保持禁用（已有 TC-CDP-TASK-002 覆盖基础用例，本用例专注空输入场景）
- 前置条件：已登录，位于 /task 空会话页面（S0），未输入文字，未上传文件
- 步骤：确认输入框为空且无附件
- 预期：Submit 按钮为禁用状态

---

## Method 2: Boundary Value Analysis（边界值分析）

### BVA-1：文件上传 — 文件数量边界

| 边界 | 操作 | 预期结果 |
|------|------|----------|
| 单个文件（最小） | 上传 1 个文件 | 正常显示，Submit 启用 |
| 多个文件（multiple=true） | 上传 2-3 个文件 | 均正常显示，Submit 启用 |

**TC-CDP-CONV-005** [P1] 附加单个文件后文件名完整显示
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：1. 上传 sample.pdf；2. 观察附件显示区域
- 预期：显示 "{filename} {type} | {size}" 格式的文件信息，出现"Remove attachment"按钮

### BVA-2：场景建议 — 按钮数量

**TC-CDP-CONV-006** [P1] 空会话页面显示 4 个场景建议按钮（已有 TC-CDP-TASK-015 覆盖，补充场景建议点击行为）
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：点击第一个场景建议按钮
- 预期：自动提交，URL 导航至 /task/{taskId}

---

## Method 3: Cause-Effect Graph（因果图）

### CE-1：文件附加操作

| 原因 | 效果 |
|------|------|
| 点击"添加照片或文件"触发 file input | 系统打开文件选择框（浏览器原生行为）|
| 选择文件完成 | 附件区出现，显示文件名，Submit 启用 |
| 点击"Remove attachment" | 附件消失，如无文字输入则 Submit 禁用 |

**TC-CDP-CONV-007** [P1] 点击"Remove attachment"后文件被移除且 Submit 重新禁用
- 前置条件：已登录，位于 /task 空会话页面（S0），已上传一个文件（S1 状态），输入框无文字
- 步骤：1. 上传 sample.pdf（进入 S1）；2. 点击"Remove attachment"按钮
- 预期：附件区消失，Submit 按钮回到禁用状态（回到 S0）

### CE-2：工具卡片点击

| 原因 | 效果 |
|------|------|
| AI 响应生成工具卡片（S3） | 聊天日志中出现 div[role=button] 工具卡 |
| 点击工具卡 | 工作区面板打开（S5）|
| 点击工作区面板 X 关闭 | 工作区面板关闭，回到 S3 |

**TC-CDP-CONV-008** [P1] 发送消息后聊天日志显示 AI 标签和思考中状态
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：1. 在输入框输入"帮我找10个测试工程师"；2. 点击 Submit
- 预期：URL 变为 /task/{taskId}，聊天日志中出现"Mira"标签，出现"思考中..."指示（S2）

**TC-CDP-CONV-009** [P1] 用户消息发送后显示在聊天日志中并带复制按钮
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：1. 输入短文本消息"测试"；2. 点击 Submit；3. 等待 URL 导航完成
- 预期：聊天日志中可见用户消息文字，出现"复制"按钮

---

## Method 4: State Transition Testing（状态转换测试）

### 状态机：S0 → S1 → S0（文件附加与移除）

| 初始状态 | 操作 | 目标状态 | 预期 |
|---------|------|---------|------|
| S0（空会话） | 上传文件 | S1（文件已附加） | 附件区出现，Submit 启用 |
| S1（文件已附加） | 点击 Remove | S0（空会话） | 附件消失，Submit 禁用 |
| S0（空会话） | 点击 Submit（禁用状态） | S0 | 无响应，保持 S0 |

**TC-CDP-CONV-010** [P0] 文件附加与移除的完整状态流转（S0→S1→S0）
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：1. 上传 sample.pdf → 确认进入 S1；2. 点击"Remove attachment" → 确认回到 S0
- 预期：全程状态转换正确：S0 有文件→S1，S1 移除→S0，两状态下 Submit 按钮状态符合预期

### 状态机：S0 → S2 → S3 → S5 → S3（完整会话流）

| 初始状态 | 操作 | 目标状态 | 预期 |
|---------|------|---------|------|
| S0 | 输入消息 + Submit | S2（AI 思考中） | URL 变为 /task/{id}，显示思考中... |
| S2 | AI 开始响应工具 | S3（工具卡片） | 出现 div[role=button] 工具卡片 |
| S3 | 点击工具卡 | S5（工作区面板） | 工作区面板打开，标题"Mira 的工作区" |
| S5 | 点击 X 关闭 | S3 | 工作区面板关闭 |

**TC-CDP-CONV-011** [P0] 点击工具卡片打开工作区面板（S3→S5）
- 前置条件：已登录，位于一个已有工具卡片的任务详情页（URL: /task/{taskId}）。前置操作：通过已有任务导航。
- 步骤：1. 导航至侧边栏第一个任务；2. 等待聊天日志加载；3. 找到第一个工具卡（div[role=button].rounded-xl.border）；4. 点击工具卡
- 预期：工作区面板显示，标题包含"工作区"文字（workspace.title）

**TC-CDP-CONV-012** [P1] 点击工作区面板关闭按钮后面板消失（S5→S3）
- 前置条件：已登录，工作区面板已打开（S5）。前置操作：导航至任务详情 → 点击工具卡
- 步骤：1. 导航至任务详情页；2. 点击工具卡打开工作区面板；3. 点击工作区面板的关闭（X）按钮
- 预期：工作区面板消失，聊天日志仍然可见

---

## Method 5: Scenario Method（场景法）

### 场景一：完整文件上传 + 发送流程

**TC-CDP-CONV-013** [P0] 上传文件 + 输入文字 + 发送，验证聊天记录同时显示文件和文字
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：
  1. 上传 sample.pdf（进入 S1，附件区显示）
  2. 在输入框输入"请分析这份文件"
  3. 点击 Submit（确认已启用）
  4. 等待 URL 导航至 /task/{taskId}
  5. 在聊天日志中验证
- 预期：聊天日志中可见文件附件按钮和用户文字消息，Mira 标签出现

### 场景二：工作区面板详情查看

**TC-CDP-CONV-014** [P1] 工作区面板打开后显示工具执行详情
- 前置条件：已登录，任务详情页有已完成的工具卡片（需导航至已有任务）
- 步骤：
  1. 导航至侧边栏第一个已完成任务
  2. 找到工具卡片（完成状态 — 灰色边框）
  3. 点击工具卡片
- 预期：工作区面板打开，面板标题可见，显示工具相关内容（候选人卡片或文件结果等）

### 场景三：场景建议快速提交

**TC-CDP-CONV-015** [P1] 点击场景建议按钮直接触发任务创建
- 前置条件：已登录，位于 /task 空会话页面（S0），显示 4 个场景建议
- 步骤：1. 点击页面中任意一个场景建议按钮
- 预期：自动提交，URL 导航至 /task/{taskId}，聊天日志可见

---

## Method 6: Error Guessing（错误猜测）

**TC-CDP-CONV-016** [P1] 工作区面板打开后"添加照片或文件"按钮仍可访问
- 前置条件：已登录，工作区面板已打开（S5）
- 步骤：1. 导航至任务详情页；2. 点击工具卡打开工作区面板；3. 尝试在聊天输入区点击"添加照片或文件"
- 预期：聊天输入区的文件上传按钮仍可见且可交互（面板不遮挡输入区）

**TC-CDP-CONV-017** [P2] 工具卡片在"进行中"状态下显示有色边框
- 前置条件：已登录，任务处于 AI 执行中（S3）— 需在 AI 响应完成前快速捕获
- 步骤：1. 发送消息"帮我找候选人"；2. 等待出现工具卡片；3. 在 AI 完成前观察工具卡边框
- 预期：进行中的工具卡有彩色边框（purple/blue/orange），文字包含"正在"前缀

**TC-CDP-CONV-018** [P1] 聊天日志区域有 role=log 且 aria-live=polite 可访问性属性
- 前置条件：已登录，位于 /task 任意页面（有聊天日志）
- 步骤：1. 导航至任务详情页；2. 检查聊天日志区域的 ARIA 属性
- 预期：聊天日志容器具有 role="log" 和 aria-live="polite" 属性（无障碍合规）

**TC-CDP-CONV-019** [P2] "添加照片或文件"按钮 i18n 文本在中英文界面下正确显示
- 前置条件：已登录，位于 /task 空会话页面（S0）
- 步骤：通过 i18n fixture 验证"添加照片或文件"按钮文本
- 预期：按钮文本与 i18n.t('chatbot.addAttachments') 一致

**TC-CDP-CONV-020** [P1] 工作区面板标题 i18n 文本正确
- 前置条件：已登录，工作区面板已打开（S5）
- 步骤：1. 导航至任务详情；2. 点击工具卡；3. 检查面板标题文本
- 预期：面板标题文本与 i18n.t('workspace.title') 一致（"Mira 的工作区"）

---

## Merged Test Case List

| TC ID | 标题 | 优先级 | 场景类型 | 覆盖方法 |
|-------|------|--------|---------|---------|
| **TC-CDP-CONV-001** | 附加支持格式文件后 Submit 按钮变为可点击 | P0 | 正向 | Method 1 |
| **TC-CDP-CONV-002** | 同时附加多个文件时均显示在附件区 | P1 | 正向 | Method 1 |
| **TC-CDP-CONV-003** | 仅上传文件（无文字）点击 Submit 后导航至任务详情 | P0 | 正向 | Method 1 |
| **TC-CDP-CONV-004** | 未附加任何内容时 Submit 按钮保持禁用 | P1 | 负向 | Method 1 |
| **TC-CDP-CONV-005** | 附加单个文件后文件名和 Remove 按钮显示 | P1 | 正向 | Method 2 |
| **TC-CDP-CONV-006** | 点击场景建议按钮自动提交并导航至任务详情 | P1 | 正向 | Method 2 |
| **TC-CDP-CONV-007** | 点击 Remove attachment 后文件被移除且 Submit 重新禁用 | P1 | 正向 | Method 3 |
| **TC-CDP-CONV-008** | 发送消息后聊天日志显示 AI 标签和思考中状态 | P1 | 正向 | Method 3 |
| **TC-CDP-CONV-009** | 用户消息发送后显示在聊天日志中并带复制按钮 | P1 | 正向 | Method 3 |
| **TC-CDP-CONV-010** | 文件附加与移除的完整状态流转（S0→S1→S0） | P0 | 正向 | Method 4 |
| **TC-CDP-CONV-011** | 点击工具卡片打开工作区面板（S3→S5） | P0 | 正向 | Method 4 |
| **TC-CDP-CONV-012** | 点击工作区面板关闭按钮后面板消失（S5→S3） | P1 | 正向 | Method 4 |
| **TC-CDP-CONV-013** | 上传文件 + 输入文字 + 发送，验证聊天记录同时显示 | P0 | 正向 | Method 5 |
| **TC-CDP-CONV-014** | 工作区面板打开后显示工具执行详情 | P1 | 正向 | Method 5 |
| **TC-CDP-CONV-015** | 点击场景建议按钮直接触发任务创建 | P1 | 正向 | Method 5 |
| **TC-CDP-CONV-016** | 工作区面板打开后文件上传按钮仍可访问 | P1 | 负向 | Method 6 |
| **TC-CDP-CONV-017** | 工具卡片在"进行中"状态下显示有色边框 | P2 | 正向 | Method 6 |
| **TC-CDP-CONV-018** | 聊天日志区域有 role=log aria-live=polite 可访问性属性 | P1 | 正向 | Method 6 |
| **TC-CDP-CONV-019** | 添加照片或文件按钮 i18n 文本正确 | P2 | 正向 | Method 6 |
| **TC-CDP-CONV-020** | 工作区面板标题 i18n 文本正确 | P1 | 正向 | Method 6 |

**优先级分布**: P0 = 5 (25%), P1 = 12 (60%), P2 = 3 (15%) — 符合 P0:P1:P2 = 15~20%:40~50%:30~40% 规范

**跳过（已有覆盖）**:
- TC-CDP-TASK-001 (输入非空文本 Submit 启用) — 已在 task-cdp.test.ts 覆盖
- TC-CDP-TASK-002 (空输入 Submit 禁用) — 已在 task-cdp.test.ts 覆盖（TC-CDP-CONV-004 为补充：验证无附件场景）
- TC-CDP-TASK-016 (场景建议点击) — 已在 task-cdp.test.ts 覆盖（TC-CDP-CONV-006/015 侧重于文件附加 + 场景建议的新角度）
