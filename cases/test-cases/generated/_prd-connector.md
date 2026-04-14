# Connector 功能 PRD（从 Pencil 设计稿提取）

> 来源：connector_0409-fancy.pen
> 提取时间：2026-04-14

## S1 — Connectors 列表页

**页面路径**：侧边栏用户菜单 → Connectors

**UI 元素**：
- 面包屑：Connectors
- 返回箭头：返回首页
- 5 个 connector 行：图标 + 名称 + 描述 + 工具数 + Switch 开关 + chevron
- 左下角用户菜单：Connectors / Language / Theme / Log out

**交互规则**：
- Switch 开关：connector 级别启用/禁用，与 S3 输入框菜单双向同步
- 点击行（非 Switch）→ 进入 S2 详情页
- 状态：默认全部 ON / 部分禁用(灰色) / 错误(红色边框)

**Connector 列表**：
| 名称 | 描述 | 工具数 |
|------|------|--------|
| CI CTS | Candidates & jobs | 5 tools |
| CI CRM | Clients & leads | 4 tools |
| CI AI-Calling | Screening & notifications | 3 tools |
| DingTalk | Schedule & to-dos | 4 tools |
| CI Mail | Enterprise mailbox | 4 tools |

**移动端**：
- 375px 宽度，列表布局不变
- 返回箭头 + 标题 Connectors

## S2 — Connector 详情页

**页面路径**：S1 → 点击某个 connector 行

**UI 元素**：
- 面包屑：Connectors > CI CTS
- 返回：回到 S1
- 标题右侧 Switch：connector 级别开关
- 工具列表行：图标 + 名称 + 描述 + Approval/Auto badge + Switch
- Legend 说明 Auto/Approval 含义

**交互规则**：
- 标题右侧 Switch 关闭 → 联动所有工具关闭
- 单个工具 Switch 控制单个工具的启用/禁用
- Approval badge（橙色）：需要人工审批
- Auto badge：自动执行

**CI CTS 工具列表示例**：
| 工具名 | 模式 | 默认状态 |
|--------|------|----------|
| Search candidates | Auto | ON |
| Create candidate | Approval | ON |
| Update candidate | — | OFF |
| Search jobs | Auto | ON |
| Create job | Approval | OFF |

## S3 — 输入框 Add Menu

**触发方式**：对话输入框左侧 "+" 按钮

**UI 元素**：
- 弹出菜单包含：Upload file / Connectors
- Connectors 展开后显示 5 个 connector + Switch 开关
- 底部 "Manage connectors" 链接 → 跳转 S1

**交互规则**：
- 点击 "+" 弹出 Add Menu
- Connectors 展开 → 5 个 connector + Switch 开关
- Switch 与 S1 双向同步
- 点击外部 / Esc 关闭菜单

## S5 — HITL Email（Human-in-the-Loop 邮件审批）

**触发方式**：Agent 自动触发邮件发送，暂停执行等待用户审批

**UI 元素**：
- 卡片标题：Draft Email
- 右上角 badge：CI Mail
- 邮件预览字段：To / Subject / Body（可展开）
- 操作按钮：Cancel / Send（或 Approve / Reject）
- 确认后卡片折叠为单行摘要

**交互规则**：
- Agent 自动触发，暂停执行
- 卡片显示 Approval needed + CI Mail badge
- 点击卡片 → 编辑（无需 Edit 按钮）
- Approve → 执行发送 / Reject → 跳过
- 确认后卡片折叠为单行摘要
- 超时 30min 发通知，卡片保持可操作

**移动端**：
- 点击卡片进入编辑
- 按钮纵向堆叠：Send > Cancel
- 字段完整显示 To / Subject / Body

## S8 — HITL DingTalk（日历事件审批）

**触发方式**：Agent 创建日历事件，等待用户确认

**UI 元素**：
- 卡片标题：Calendar Event
- 右上角 badge：CI DingTalk
- 事件字段：Summary / Time / Organizer / Attendees / Description
- 操作按钮：Cancel / Create

**交互规则**：
- 右上角 MCP 名称不同（DingTalk vs Mail）
- 按钮文案不同：Create / Created
- 不支持编辑（只读预览）
- 其他逻辑与 S5 保持一致

## S9 — HITL 外呼（Outreach Campaign）

**触发方式**：Agent 创建外呼任务，等待用户确认

**UI 元素**：
- 卡片标题：Outreach Campaign
- 右上角 badge：CI AI-Calling
- 字段：Campaign / Scenario / Candidates（含文件下载）/ Schedule
- 操作按钮：Cancel / Launch

**交互规则**：
- 文件有下载按钮，点击触发浏览器下载
- 其他逻辑与 S5/S8 保持一致

## S10 — MCP Tool 执行面板

**触发方式**：Agent 执行 MCP 工具时显示

**UI 元素**：
- 右侧 Workspace Panel
- Panel 标题：工具名称（如 voice_get_scenario_variables）
- Result 区域：JSON 格式执行结果
- 底部状态：Real time 指示器

**交互规则**：
- 工具执行时自动打开右侧面板
- 实时显示执行结果
- 完成后保持可查看

## S11 — 登录页（mina.run Login / Authing SSO）

**页面路径**：/sign-in 或 mina.run

**UI 元素**：
- Logo + "Sign in or Sign up" 标题
- 副标题：Start your next sourcing
- Continue with Google / Continue with Microsoft 按钮
- OR 分隔线
- 邮箱输入框 + Continue 按钮
- 右上角语言切换（EN）

**交互规则**：
- Continue with Google / Microsoft → OAuth
- 输入邮箱 + Continue：
  - 普通邮箱 → 验证码/密码流程
  - 科锐邮箱（@careerintlinc.com）→ S12 企业识别
- OAuth 成功 → 页面刷新进入首页（无需验证邮箱和邀请码）
- 科锐用户自动激活 connector

## S12 — 企业邮箱识别

**触发方式**：S11 检测到科锐邮箱后缀自动跳转

**UI 元素**：
- 标题：Enterprise account
- 副标题：Sign in with your organization credentials
- 邮箱显示（只读）+ 右侧 Edit 文字按钮
- 提示卡片：CareerInt enterprise account detected
- Continue with Authing 按钮
- Back to Login 链接

**交互规则**：
- 邮箱显示只读 + 右侧 Edit → 返回 S11
- Continue with Authing → Authing SSO 登录
- Back to Login → 返回 S11（清空）
- 统一入口：mira.day 和 mina.run 均进入 S12
- 点击按钮跳转 Authing 认证

## S14 — Admin 企业列表

**页面路径**：Admin 侧边栏 → Enterprise Auth

**UI 元素**：
- Admin 侧边栏：Dashboard / Waitlist / Invitation Codes / Scenario Cards / Admins / Enterprise Auth（高亮）
- 面包屑：Admin / Enterprises
- 企业列表行：名称 + 后缀数量 + chevron
- Add Enterprise 按钮（右上角）
- 底部 "Back to App" 链接

**交互规则**：
- 点击企业行 → 进入 S15 详情
- Add Enterprise → S14-2 弹窗
- V1 不提供删除企业功能

**企业列表示例**：
| 企业名称 | 邮箱后缀数 |
|----------|-----------|
| 科锐国际 | 3 个邮箱后缀 |
| 华为 | 2 个邮箱后缀 |
| 字节跳动 | 1 个邮箱后缀 |

### S14-2 — Add Enterprise 弹窗

**UI 元素**：
- Dialog 标题：Add Enterprise
- 描述：Add a new enterprise for SSO authentication.
- Enterprise Name 输入框 + 示例提示（e.g. 科锐国际, 华为）
- Cancel / Add 按钮

**交互规则**：
- 名称为空时 Add 按钮禁用
- 校验：名称非空、不重复
- Cancel / 点击遮罩 / Esc → 关闭
- 成功后 S14 列表自动刷新

## S15 — Admin 企业详情

**页面路径**：S14 → 点击某个企业行

**UI 元素**：
- 面包屑：Admin / Enterprises / 科锐国际
- 标题：科锐国际
- 描述：Manage email domain suffixes for enterprise SSO authentication.
- 邮箱后缀表格：邮箱后缀 | 描述 | 操作（编辑/删除）
- Add Suffix 按钮（右上角）

**交互规则**：
- 编辑（铅笔图标）→ inline edit 或编辑弹窗
- 删除（垃圾桶图标）→ 二次确认弹窗
- Add Suffix → S15-2 弹窗
- 面包屑 Enterprises → 返回 S14

**邮箱后缀表格示例**：
| 邮箱后缀 | 描述 | 操作 |
|----------|------|------|
| @careerintlinc.com | 科锐国际主域名 | 编辑 / 删除 |
| @careerint.com | 科锐地区备用域名 | 编辑 / 删除 |
| @careerintgroup.cn | 科锐集团中国区域 | 编辑 / 删除 |

### S15-2 — Add Email Suffix 弹窗

**UI 元素**：
- Dialog 标题：Add Email Suffix
- 描述：Add a new email domain suffix for SSO authentication.
- Email Suffix 输入框 + 格式提示（e.g. @careerintlinc.com）
- Description 输入框（可选）+ 示例提示
- Cancel / Add 按钮

**交互规则**：
- 后缀为空时 Add 按钮禁用
- 校验：@ 开头、有效域名、不重复
- 成功后 S15 表格自动刷新
