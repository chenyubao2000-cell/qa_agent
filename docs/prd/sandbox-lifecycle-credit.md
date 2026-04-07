PRD：沙箱生命周期管理与 Credit 计费


文档状态：finalized 负责人：Evan  作者：AI 代拟 创建日期：2026-03-23 目标上线：待规划 版本：V1.6

文档信息

基本信息

字段

值

product_name

Mira

product_type

AI Agent product

owner

Evan

author

AI 代拟

created_date

2026-03-23

target_launch

待规划

version

V1.6

status

finalized

变更记录

version

section

change

reason

date

author

V1.0

全部

初始版本

基于 E2B 实际成本结构，建立沙箱生命周期管理与 Credit 计费规则

2026-03-23

Evan

V1.1

核心假设、REQ-001~005、设计方案、REQ-004扩展

基于 E2B 官方文档修正假设，新增并行引用计数、running_seconds 持久化、complete 工具任务结束信号、Task 级 Credit 累积（Method B）、沙箱销毁用户通知

Team Review 发现的 Fatal/Severe 问题修复；E2B 文档核实 pause/resume 行为

2026-03-23

Evan

V1.2

背景、REQ-002、REQ-003（删除）、REQ-004、REQ-005、Anti-Scope

架构澄清：E2B 存储成本实为固定 2GiB 内存开销，与 CPU 成本合并为 $0.000037/s；删除 REQ-003（独立存储成本）；用户文件存储在 R2，暂不计费，不纳入 Credit

产研对齐后架构修正

2026-03-23

Evan

V1.3

REQ-001、流程图、REQ-004（重写）、Anti-Scope

沙箱按需创建（不再预创建 paused 状态，首次工具调用才 create）；删除 24h/72h 自动销毁；新增 R2 存储配额管理（2GB/月，超限参考 Manus 方案）

产品决策：降低生命周期复杂度；当前无计费体系，以存储配额替代时间自动清理

2026-03-23

Evan

V1.4

REQ-004 文件保留策略

30 天到期改为软删除归档（Soft Archive）：从 R2 删除文件数据释放配额，DB 保留元数据记录；用户可见"已归档"状态；提供基于重跑任务的恢复引导；预留冷存储扩展位

避免硬删除导致用户数据永久丢失，提升用户信任感

2026-03-23

Evan

V1.5

REQ-004 文件存储策略

移除 30 天保留期限制，改为无时间限制（文件与任务绑定长期保留，参考 Manus 实际架构）；移除 Soft Archive / 恢复机制 / 分级方案；仅保留 80% 提醒 + 达到上限阻断的配额管理核心逻辑

调研确认 Manus 7/21 天为 VM 回收周期非文件删除；当前阶段无计费体系，存储策略简化为配额上限控制

2026-03-23

Evan

V1.5

全部

finalized

全面检查通过，状态提升为 finalized；移除内部流程元数据章节

2026-03-23

Evan

V1.6

REQ-002 成本参数、REQ-003 Session 级累积策略

1. 内存规格从 2 GiB 改为 4 GiB，综合单价从 $0.000037/s 更新为 $0.000046/s，重新计算示例数字；2. 还原 Session 级累积算法代码块与示例表（REQ-003）

内存规格校正；Session 级累积算法内容误删还原

2026-03-24

Evan

V1.7

REQ-001 沙箱状态转换规则

将 complete 工具调用信号替换为任务状态驱动机制；明确 COMPLETED / WAITING_FOR_USER / FAILED / INTERRUPTED 四种任务状态均触发 pause；保留引用计数机制用于工具执行间隙的自动挂起；新增"任务状态 → 沙箱动作映射"表

统一以任务状态作为沙箱生命周期控制入口，消除 complete 工具调用作为信号的架构耦合

2026-03-27

Evan

V1.8

REQ-001 生命周期模型简化

明确"任务"定义为单轮对话（用户一次输入 → Mira 一次完整回答）；删除并行引用计数机制（工具调用间隙不再自动 pause）；保留沙箱工具列表作为 create/resume 触发条件；pause 时机改为纯任务状态驱动

单轮任务时长短、成本低，引用计数优化收益有限；create/resume 触发逻辑不变

2026-03-27

Evan

概述

一句话摘要

猎头顾问使用 Mira 执行寻访任务时，每次沙箱开启都会产生按秒计费的运行成本，若全程运行将大幅推高单任务成本。本期通过"按需唤醒"策略（任务开始时沙箱挂起，工具调用时自动恢复，任务结束时回到挂起）最小化运行成本；同时将沙箱运行成本纳入 V0.2.4 已有的 Credit 计费体系，使任务成本账目完整可查。用户文件存储在 R2，暂不计入 Credit。

背景

业务背景：Mira 使用 E2B Code Interpreter 提供每任务独立沙箱（per-task sandbox）。沙箱是执行文件创建、命令运行、代码执行等工具的运行环境，是 sourcing 工作流的基础设施。

当前现状：沙箱在任务期间持续运行，无论是否有工具在实际执行，均产生按秒计费的成本。E2B Default 规格综合单价为 $0.000046/s（2 vCPU CPU 成本 + 固定 4 GiB 内存开销，两项合计），均在 running 期间计费、paused 后立即停止。用户的文件存储在 Cloudflare R2，不在 E2B 内，暂不计入 Credit。当前沙箱成本未纳入 V0.2.4 的 Credit 体系，导致成本账目不完整。

关键痛点：猎头顾问使用 Mira 执行一次寻访任务，任务实际等待 AI 思考、等待用户反馈的时间可能远超沙箱真实执行时间。若全程运行沙箱，将产生大量"空转"成本，直接损害单位任务经济性，且成本无法向用户或内部透明展示。

核心问题：缺少沙箱生命周期管理策略以控制运行成本，且沙箱成本游离于 Credit 体系之外，任务成本账目存在系统性缺口。

目标

通过挂起/恢复策略，将沙箱运行成本限制在真正有工具执行的时间段内，消除空转计费

将沙箱运行成本（CPU + 内存，合并计算）纳入 Credit 计算公式，使任务 Credit 完整覆盖计算成本

为后续成本优化、定价决策和按用量计费提供准确的沙箱成本数据基础

R2 用户文件存储暂不计费，作为 Mira 平台的免费能力提供

核心假设

V1.1 注：以下假设已通过 E2B 官方文档（e2b.dev/docs/sandbox/persistence、e2b.dev/docs/billing）核实，不再是未验证假设，已提升为已确认事实。

[已确认] E2B pause 后计费立即停止

来源：E2B Billing FAQ — "No. You only pay while a sandbox is actively running. Once a sandbox is paused, killed or times out, billing stops immediately."  影响：pause 策略可有效消除空转计费，PRD 所有成本节省预测基于此事实成立。

[已确认] 沙箱存储在挂起期间完全保留

来源：E2B Persistence 文档 — "When you pause a sandbox, both the sandbox's filesystem and memory state will be saved. This includes all the files in the sandbox's filesystem and all the running processes, loaded variables, data, etc."  影响：pause 不会清空文件系统，resume 后工具可直接访问之前创建的文件；无需重新挂载 R2（修正原假设 #3）。

[已确认] Resume 延迟约 1 秒

来源：E2B Persistence 文档 — "Resuming a sandbox takes approximately 1 second"  影响：1 秒延迟对用户体验影响轻微（修正原假设 #1 中的"P95 < 500ms"目标，实际基准为约 1s）；设计方案中灰色区间定义为 > 1s 则展示等待提示。

[已确认] Paused 沙箱 E2B 永久保留

来源：E2B Persistence 文档 — "Paused sandboxes are kept indefinitely — there is no automatic deletion or time-to-live limit"  影响：沙箱 24h/72h 自动销毁是 Mira 产品层面的策略（控制存储成本），而非 E2B 平台行为。

[待验证] 任务中沙箱实际运行时间显著低于任务总时长

验证：上线后统计每任务沙箱 running_seconds / task_total_seconds 比值；若比值 > 80%，挂起策略的收益有限，需重新评估。若不成立：挂起策略的成本节省价值降低，但 Credit 计费完整性仍然成立。

不做的事（Anti-Scope）

item

exclusion_reason

向用户展示沙箱成本明细

本期聚焦成本计算与 Credit 集成，用户只看任务总 Credit，不拆分沙箱子项；明细展示待商业化阶段结合账单页统一设计

跨任务沙箱复用

V1 per-task 模型已验证能隔离环境，复用引入状态污染风险；沙箱复用是独立优化方向，当前成本节省由挂起策略覆盖

R2 用户文件存储计费

用户持久化文件存于 Cloudflare R2，成本极低（$0.015/GB/月），暂作为平台免费能力提供，不纳入 Credit；后续可在订阅档位中以存储配额差异化体现

功能需求

功能范围

id

feature

priority

description

acceptance_criteria

REQ-001

沙箱生命周期管理（任务状态驱动）

P0

"任务"= 单轮对话（用户一次输入 → Mira 一次完整回答）；首次沙箱工具调用时 create，后续沙箱工具调用时若 paused 则 resume；单轮内沙箱持续运行不在工具调用间隙挂起；任务状态变为 COMPLETED / WAITING_FOR_USER / FAILED / INTERRUPTED 时沙箱 pause

有沙箱工具调用时沙箱成功 create 或 resume；任务结束/暂停/中止后沙箱进入 paused；无沙箱工具调用的任务不创建沙箱

REQ-002

沙箱运行成本计算与持久化

P0

按实际 running 时长（秒）× 综合单价（$0.000046/s = CPU $0.000028 + 内存存储 $0.000018，均为 running 期间计费）；每次 pause 时立即写入 DB；转换为 Credit 纳入任务 Credit 体系

给定已知的 running_seconds，计算结果与公式一致；服务重启后 running_seconds_total 可从 DB 恢复

REQ-003

沙箱 Credit 纳入任务 Credit 体系（含 Task 级累积）

P0

扩展 V0.2.4 Credit 存储结构，新增 step/task/session 三粒度沙箱 Credit 字段；采用 Task 级累积策略（Method B），仅在跨越整数边界时才向用户账户记 Credit，防止 10x 取整膨胀

单任务 credit_raw = 0.2 不展示；多任务累积到 1.0 时展示 +1；Task 结束时强制清算

需求详述

REQ-001：沙箱生命周期管理

用户故事：作为猎头顾问，当我使用 Mira 执行寻访任务时，我需要沙箱仅在单轮任务执行期间计费，任务结束、暂停或中止后自动停止计费。

"任务"定义：单轮对话——用户一次输入 → Mira 一次完整回答。单轮内沙箱持续运行、持续计费；跨轮之间沙箱 paused 不计费。

前置条件：

任务已创建，Agent 主循环已启动

E2B SDK 支持 Sandbox.create() / sandbox.pause() / sandbox.connect() 接口

设计原则（V1.8）：

create / resume 触发：沙箱工具调用时（不变）。未调用沙箱工具的任务不创建沙箱。

pause 触发：任务状态变化时（COMPLETED / WAITING_FOR_USER / FAILED / INTERRUPTED）。

删除：引用计数机制——单轮内不在工具调用间隙挂起，沙箱从首次工具调用起持续 running 至任务状态变化。

沙箱状态转换规则

触发事件

当前状态

目标状态

说明

Agent 首次调用沙箱工具

不存在

running

create 沙箱，记录 create_ts；设置 lifecycle: { onTimeout: 'pause' } 安全兜底

任务状态 → COMPLETED

running

paused

pause，计算 Credit，更新 session_pending_credit

任务状态 → WAITING_FOR_USER

running

paused

pause；用户继续发送消息后新一轮 resume

任务状态 → FAILED

running

paused

pause，按实际 running_seconds 写入 Credit

任务状态 → INTERRUPTED

running

paused

pause，按实际 running_seconds 写入 Credit

沙箱工具列表（触发 create / resume 的工具）

工具名称

说明

sb_file_create

在沙箱内创建文件

sb_file_rewrite

重写沙箱内文件

sb_file_edit

编辑沙箱内文件

sb_file_delete

删除沙箱内文件

sb_command_execute

在沙箱内执行命令

其他待补充

……

非沙箱工具（search、people_search、company_search 等）调用时不触发 create / resume。

任务状态 → 沙箱动作映射

任务状态

触发场景

沙箱动作

Credit 处理

COMPLETED

任务正常完成

pause（若 running）

计算并写入 sandbox_run_credit_raw_total；更新 session_pending_credit

WAITING_FOR_USER

等待用户输入（HITL）

pause（若 running）

不结算；用户继续后新一轮 resume 重新计时

FAILED

Agent 报错或系统异常

pause（若 running）

按实际 running_seconds 写入；不触发 session 清算

INTERRUPTED

用户主动中断任务

pause（若 running）

按实际 running_seconds 写入；不触发 session 清算

伪代码

// 沙箱工具调用时触发（create / resume）
onSandboxToolCall():
  if sandbox == null:
    sandbox = Sandbox.create({ lifecycle: { onTimeout: 'pause' } })
    record_create_ts_to_db()
  elif sandbox.state == paused:
    sandbox.connect()  // resume
    record_resume_ts_to_db()
  // 已 running 则直接执行，无需操作

// 任务状态变化时触发（pause）
onTaskStatusChange(newStatus):
  if newStatus in [COMPLETED, WAITING_FOR_USER, FAILED, INTERRUPTED]:
    if sandbox != null and sandbox.state == running:
      sandbox.pause()
      record_running_seconds_to_db()
    if newStatus == COMPLETED:
      calculate_and_write_sandbox_credit()   // 计算 credit_raw，更新 session_pending
    elif newStatus in [FAILED, INTERRUPTED]:
      write_partial_sandbox_credit()         // 按实际时长写入，不触发 session 清算

异常处理

场景

处理方式

用户可见错误文案

resume 失败（E2B API 超时，重试 3 次后，间隔指数退避 1s/2s/4s）

返回工具执行失败，任务不中断，写入 ERROR 日志；在工具气泡展示明确错误状态

"Something went wrong while preparing your workspace. Please try again."

pause 失败

记录 WARN 日志，继续执行；后续沙箱状态以实际为准，不强制中断

无用户提示（pause 失败不影响工具执行结果）

resume 后工具执行超时

工具执行超时处理规则沿用现有策略；pause 在超时结束后执行

沿用现有工具超时错误文案

沙箱已被 E2B 平台异常回收

重新创建沙箱（asyncInitSandbox 重建流程），文件系统从空白重建（R2 任务文件不受影响）；写入 WARN 日志

"Preparing your workspace, this may take a moment..."

用语原则（与沙箱状态反馈 PRD 保持一致）：

面向用户的所有提示使用 "workspace"（工作区），绝不在界面暴露 "sandbox / E2B / container" 等技术术语

重试中文案："Preparing your workspace, this may take a moment..."

最终失败文案："Something went wrong while preparing your workspace. Please try again."

中文界面对应："正在准备工作区…" / "工作区准备失败，请重试"

边界情况

场景

处理方式

任务全程无沙箱工具调用

沙箱创建后无工具调用，running_seconds = 任务时长；Credit 正常计算（沙箱已 running，时长计费）

用户多轮对话，中间穿插长时间等待

每轮结束（WAITING_FOR_USER / COMPLETED）均 pause；下一轮开始（RUNNING）时 resume；跨轮间隙不计费

流恢复（用户刷新/断线重连）

检查任务当前状态；若任务为非 RUNNING 状态但沙箱仍 running，立即 pause

REQ-002：成本计算与持久化

用户故事：作为 Mira 系统，当任务中有沙箱工具被执行时，我需要精确记录沙箱实际运行时长并换算为 Credit，以便任务成本账目完整准确。

成本参数（E2B Default 方案，V1.2 更新）

成本项

单价

说明

CPU（2 vCPU）

$0.000028/s

running 期间计费，paused 后立即停止

内存存储（固定 4 GiB）

$0.0000045/GiB/s × 4 = $0.000018/s

running 期间计费，paused 后立即停止；非用户文件存储

综合单价

$0.000046/s

两项合并，统一按 running 时长计算

溢价率

1.2

与 V0.2.4 Credit 体系一致

换算率

100

$1 = 100 Credits，与 V0.2.4 一致

架构说明：E2B 的"存储成本"对应的是沙箱内固定分配的 4 GiB 内存，不是用户上传/生成的文件。用户文件存储在 Cloudflare R2，暂不计费。

计算公式

沙箱运行成本（$）= running_seconds × $0.000046
沙箱运行 Credit = running_seconds × $0.000046 × 1.2 × 100

示例

场景

运行时长（秒）

运行成本（$）

运行 Credit（raw）

短任务（文件操作 30s）

30

$0.00138

0.166

中等任务（数据处理 3min）

180

$0.00828

0.994

长任务（复杂脚本 10min）

600

$0.02760

3.312

Task 级累积后展示整数值，不在此处取整（见 REQ-003）。

计时规则

running_seconds 以沙箱 resume 时间戳开始，pause 时间戳结束

若一次任务内多次 resume/pause，所有 running 时段的时长累加

时间戳精度：毫秒，存储时向上取整至秒

running_seconds 持久化（防止服务重启丢失）

每次 pause 事件触发时，将本段 running 时长增量立即写入数据库（step 级 sandbox_run_seconds 字段），而非仅保存在内存中：

每次 pause 时：
  segment_seconds = pause_timestamp - resume_timestamp  // 本段时长
  db.write(task_id, step_id, sandbox_run_seconds += segment_seconds)
  db.write(task_id, running_seconds_total += segment_seconds)

服务重启后，从数据库恢复 running_seconds_total，不依赖内存状态

resume 时间戳同样在 resume 事件时立即写入 DB，确保服务重启后可从断点恢复计算

异常处理

场景

处理方式

pause 时间戳缺失（pause 失败未记录）

以下一次状态变更时间估算；记录 WARN 日志，标记数据为估算值

E2B 账单 API 数据与本地计算不一致

以本地时间戳计算为准（更实时）；定期与 E2B 账单对账，差异 > 5% 时告警

REQ-003：沙箱 Credit 纳入任务 Credit 体系

用户故事：作为 Mira 系统，当任务结束时，我需要将沙箱运行成本合并进任务总 Credit，以便任务成本账目完整，不产生成本盲区。

V0.2.4 Credit 体系扩展（V1.2 精简）

在现有 Message / Task 三粒度存储中新增以下字段：

粒度

新增字段

说明

Message 级

sandbox_run_credit_raw_total（浮点数）、sandbox_running_seconds

任务级汇总；原始浮点，不单独取整

Task 级

session_sandbox_pending_credit（浮点数）、session_sandbox_credited_int（整数）

Session 级累积机制，见下方说明

移除字段：sandbox_storage_credit_raw、sandbox_storage_cost_usd（V1.2 删除，E2B 内存成本已合并入运行单价；R2 用户文件存储暂不计费）

Task 级 Credit 累积策略（Method B）

沙箱运行成本通常极小（单次任务 < 1 Credit），若每个任务单独取整会导致 10x+ 的 Credit 膨胀（如实际 0.1 Credit 被取整为 1）。采用 Task 级累积策略：

算法：
  任务 N 完成，credit_raw = sandbox_run_credit_raw_total  // 仅运行成本，无独立存储项

  session_sandbox_pending_credit += credit_raw

  increment = floor(session_sandbox_pending_credit)
  if increment >= 1:
    task_credit_total += increment
    session_sandbox_pending_credit -= increment
    session_sandbox_credited_int += increment

  // Session 结束时（用户关闭会话）：
  if session_sandbox_pending_credit > 0:
    task_credit_total += ceil(session_sandbox_pending_credit)  // 向上取整，清算剩余
    session_sandbox_pending_credit = 0

示例

任务

credit_raw

pending_credit

展示 Credit 变化

Session 1

0.2

0.2

+0（不满 1）

Session 2

0.8

1.0

+1（进位，pending 归 0）

Session 3

0.3

0.3

+0

Task 结束

—

0.3

+1（向上取整清算）

汇总公式（任务级展示值）

task_credit_displayed = ceil(llm_credit + tool_credit) + sandbox_session_increment
// 其中 sandbox_session_increment 为本任务从 session 累积中分配的整数 Credit

展示不变：任务详情中展示的 Credit 为上式合计后的整数值，不拆分子项。展示位置和交互逻辑沿用 V0.2.4 REQ-003。

写入时机

字段

写入时机

sandbox_run_credit_raw（step 级）

每次 pause 时，计算本段 running 时长并写入

sandbox_run_credit_raw_total（task 级）

complete 工具调用时，汇总所有 step 的 raw 值写入

session_sandbox_pending_credit

每个任务 complete 后更新；session 结束时清算

异常处理

场景

处理方式

沙箱从未 resume（running_seconds = 0）

sandbox_run_credit_raw = 0，正常写入，不报错

存储成本采样失败

sandbox_storage_credit = 0，写入 WARN 日志；不影响任务 Credit 总量的其他项

参考资料

source

E2B Pricing（e2b.dev/pricing）：综合单价 $0.000046/s（CPU $0.000028 + 内存存储 $0.000018（4 GiB），均为 running 期间计费）

V0.2.4 Credit PRD（credit_prd_final.md）— Credit 计算公式、分级存储结构

decisions.md — 2026-03-08 技术栈选型（E2B per-task 沙箱、R2 mount）

decisions.md — 2026-03-14 Sandbox 状态反馈方案收缩

