<!-- PRD-hash: f7d0aa6ee8441a9189e74a5566a038395effaf8e283c0a011a3db5c2d96dc790 | PRD-module: Voice Input — REQ-001 / REQ-002 / REQ-003 | feature-slug: voice-input -->

# Voice Input 测试用例（PRD 驱动）

> 源 PRD：`d:/work/项目文件/mira/voice input/prd.md`
> 覆盖范围：REQ-001（流式录音+草稿编辑）、REQ-002（非流式录制兜底 A2-2）、REQ-003（语言自动识别）
> 设计稿状态：A1 / A2 / A2-2 / A3 / B1 / D1 / D2a / D2b

---

## Method 1: Equivalence Partitioning（等价类划分）

将语音输入按"录音路径 × 输入条件"划分等价类：

| EC-ID | 类型 | 维度 | 描述 |
|-------|------|------|------|
| EC-V1 | 有效 | 录音时长 | 30-300 字常见范围（约 8-90 秒） |
| EC-V2 | 有效 | 入口场景 | task_creation 入口 |
| EC-V3 | 有效 | 入口场景 | strategy_creation 入口（含 task context 徽标） |
| EC-V4 | 有效 | STT 路径 | 流式分支（A2） |
| EC-V5 | 有效 | STT 路径 | 非流式分支（A2-2） |
| EC-V6 | 有效 | 全局语言 | STT 支持的语言（en / zh） |
| EC-I1 | 无效 | 录音时长 | < 0.5 秒（误触） |
| EC-I2 | 无效 | 权限 | getUserMedia 拒绝 |
| EC-I3 | 无效 | STT 连接 | 启动 ≤3s 未收到首 partial |
| EC-I4 | 无效 | STT 收尾 | 停止 ≤5s（流式）/ ≤8s（非流式）未返回 final |
| EC-I5 | 无效 | 语言 | Mira 全局语言不在 STT 支持列表 |

→ 用例从 EC-V1/V2/V3/V4/V5/V6 与 EC-I1/I2/I3/I4/I5 派生（见 Merged List）。

---

## Method 2: Boundary Value Analysis（边界值分析）

| BV-ID | 维度 | 边界点 |
|-------|------|--------|
| BV-1 | 录音时长 | 0.49s / 0.5s / 0.51s（empty_state 触发边界） |
| BV-2 | 长录音上限 | 599s / 600s / 600.1s（自动停止） |
| BV-3 | 长录音提示 | 539s（8:59）/ 540s（9:00 展示提示） |
| BV-4 | 流式连接超时 | 2.9s / 3.0s / 3.1s（stt_connect_failure 触发边界） |
| BV-5 | 流式 finalize 超时 | 4.9s / 5.0s / 5.1s（stt_finalize_failure 触发边界） |
| BV-6 | 非流式 finalize 超时 | 7.9s / 8.0s / 8.1s（A2-2 stt_finalize_failure 触发边界） |
| BV-7 | network_unstable 阈值 | 2.9s / 3.0s / 3.1s（断流降级） |
| BV-8 | D1 toast 自动消失 | 4.9s / 5.0s / 5.1s（自动关闭） |

→ 用例覆盖见 Merged List。

---

## Method 3: Cause-Effect Graph / Decision Table（因果图 / 判定表）

**判定表：录制启动分支决策**

| 条件 | C1 | C2 | C3 | C4 |
|------|----|----|----|----|
| 浏览器麦克风权限 | 授权 | 授权 | 拒绝 | 授权 |
| STT 引擎支持 partial | 是 | 否 | - | 是 |
| 服务端 voice_streaming_enabled | true | true / false | - | false |
| **动作** | 进入 A2 流式 | 进入 A2-2 非流式 | 进入 D1 toast，不录音 | 进入 A2-2 非流式 |

**判定表：D2 区分**

| 条件 | C1 | C2 |
|------|----|----|
| 错误时机 | 录制启动 ≤3s 未收到首个 partial | 用户停止后 ≤5s（流式）/ ≤8s（非流式）未返回 final |
| **动作** | D2a toast「Can't reach voice service」+ Retry pill | D2b toast「Recognition failed」+ Retry pill |

→ 用例覆盖见 Merged List。

---

## Method 4: State Transition Testing（状态迁移）

**状态机：A1 → A2/A2-2 → A3 → 提交**

```
A1 (default)
  │ click voice-btn (流式分支)
  ├──> A2 (recording) ──stop──> A3 (draft) ──submit──> 提交完成
  │
  │ click voice-btn (非流式分支)
  └──> A2-2 (recording-nostream)
         │ click ✓ ──> Recognizing… ──> A3 (draft)
         │ click × ──> A1 (default)
         │ permission_denied 中途撤销 ──> D1

A3 (draft)
  │ click voice-btn → 追加录音 → 返回 A2 / A2-2 → 转写追加到 input 末尾
```

迁移点覆盖：A1→A2、A1→A2-2、A2→A3、A2-2→A3、A2-2→A1（×取消）、A3→A2（追加）、A2→D1/D2a/D2b、A2-2→D1/D2b。

→ 用例覆盖见 Merged List。

---

## Method 5: Scenario Method（场景法）

**基本流（Happy Path）：**
- SC-BF-1：task_creation + 流式录音 30-300 字 → 草稿编辑 → 提交
- SC-BF-2：strategy_creation + 流式录音追加描述 → 草稿编辑 → 提交（含 task context 徽标）
- SC-BF-3：task_creation + 非流式录音（A2-2）→ ✓ 确认 → 转写回填 → 草稿编辑 → 提交

**备选流（Alternative Flows）：**
- SC-AF-1：录音中切换浏览器 tab（录音持续）
- SC-AF-2：录音中关闭页面（录音关闭并丢弃）
- SC-AF-3：A3 状态下追加录音（转写追加到末尾，不覆盖）
- SC-AF-4：长录音 600s 自动停止 + 9:00 提示
- SC-AF-5：非流式 A2-2 中点击 × 取消
- SC-AF-6：非流式 A2-2 录制中点击 + 附件（与录音并存）
- SC-AF-7：异常路径 D1（权限拒绝）
- SC-AF-8：异常路径 D2a（stt_connect_failure，流式启动 3s 未首 partial）
- SC-AF-9：异常路径 D2b（stt_finalize_failure）
- SC-AF-10：network_unstable（断流 > 3s 自动降级 + 恢复 toast）
- SC-AF-11：A2-2 录制中系统层撤销麦克风权限
- SC-AF-12：STT 不支持当前 Mira 全局语言 → 回退 English
- SC-AF-13：中英混说

→ 用例覆盖见 Merged List。

---

## Method 6: Error Guessing（错误猜测）

基于经验易出问题点：
- 误触：点击立即停止（< 0.5s）不应调用 STT、不应修改 input
- 录音中点击 submit-btn 应被禁用
- 转写文本与 input 已有内容冲突 → 追加，不覆盖
- 9:00 / 10:00 长录音提示文案是否正确展示
- D2a/D2b toast 内 Retry pill 在用户操作或 fallback 完成前是否常驻
- D1 toast 5s 自动消失或手动关
- a22Pill 在 Recognizing… 期间 ✓ 是否变为 disabled
- 追加录音应继续走相同分支（流式/非流式），不能切换路径
- 非流式上传阶段网络中断应自动重试，而非进入 D2

→ 用例覆盖见 Merged List。

---

## Merged Test Case List

> 命名规范：TC-VI-XXX（VI = Voice Input）。所有用例文本为简体中文。

### A. REQ-001 流式录音 + 草稿编辑（task_creation / strategy_creation）

**TC-VI-001**: task_creation 流式录音录制 30-300 字 → 草稿落框 → 提交（核心 Happy Path）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录；浏览器麦克风权限已授权；当前位于 task_creation 入口页（A1 default 态）；STT 引擎支持 partial 且 voice_streaming_enabled=true
- **操作步骤:** 1) 点击 input 框右下角左侧的 voice-btn（outline 圆形，mic 图标）；2) 验证 voice-btn 变为黑色 primary timer-wave pill（高 32px、可动波形条）；3) 口述约 60 字测试文本，持续约 15 秒；4) 验证 input 文本区流式接收 partial 转写实时显示；5) 点击 timer-wave pill 停止录音；6) 验证收到 final transcript；7) 验证转写文本作为草稿落入 input、光标置于文本末尾；8) 验证 timer-wave pill 还原为 outline 圆形 voice-btn、arrow-up submit-btn enabled；9) 在 input 中编辑或追加文字；10) 点击 arrow-up submit-btn 提交
- **预期结果:** 转写文本以草稿形式落入 input；submit-btn 在草稿态保持 enabled；点击 voice-btn 至 final 草稿落框总耗时 P95 ≤ 5 秒（不含口述时间）；流程中不出现 Credit 提示与 first-run modal；提交后进入正常 task_creation 业务流
- **测试数据:** scene=task_creation；duration≈15s；text="为某外企招聘 Senior Java 工程师，5 年以上微服务经验"

**TC-VI-002**: strategy_creation 流式录音追加描述（含 task context 徽标）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录；存在一个已创建的寻访任务；当前位于该任务的 strategy_creation 入口页；浏览器麦克风权限已授权
- **操作步骤:** 1) 验证 input 框上方显示 task context 徽标"Refining strategy · {role} · {location}"（git-branch 图标）；2) 点击 voice-btn；3) 口述 10-50 字策略追加描述；4) 停止录音；5) 验证 transcript 草稿落框；6) 编辑后点击 submit-btn 提交
- **预期结果:** task context 徽标正确反映当前任务的 role 与 location；草稿落框流程与 TC-VI-001 一致；提交后合并到原任务
- **测试数据:** scene=strategy_creation；duration≈12s

**TC-VI-003**: A3 草稿态追加录音（多段语音追加到 input 末尾）
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 已完成一次流式录音，input 处于 A3 草稿态，已有转写文本"内容A"
- **操作步骤:** 1) 在 A3 状态下再次点击 voice-btn；2) 口述"内容B"约 5 秒；3) 停止录音；4) 验证转写"内容B"追加到 input 末尾
- **预期结果:** input 文本为"内容A + 内容B"，不覆盖；光标重新置于文本末尾；voice-btn 还原 outline
- **测试数据:** prefix="内容A"；append="内容B"

**TC-VI-004**: 设计稿视觉对照：A1 默认态双按钮布局（voice-btn outline + submit-btn primary）
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 当前位于 task_creation A1 default 态；浏览器麦克风权限未触发
- **操作步骤:** 1) 截图 input 框右下角；2) 测量两个按钮尺寸与 gap
- **预期结果:** 右下角并列两个 32×32 圆形按钮（gap 8px）；左侧 voice-btn 为白底 + outline + mic 图标；右侧 submit-btn 为 primary 填色 + arrow-up 图标（disabled 状态，input 为空）；submit-btn 始终位于最右侧
- **测试数据:** 视觉 baseline

**TC-VI-005**: 设计稿视觉对照：A2 timer-wave pill 录制态
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 已点击 voice-btn 进入流式录制态
- **操作步骤:** 1) 截图 input 框右下角；2) 验证 voice-btn 变形
- **预期结果:** voice-btn 替换为黑色 primary pill（pill 圆角、高 32px），pill 内显示动效波形条；submit-btn 在录制中 disabled；input 文本区不再显示 placeholder
- **测试数据:** 视觉 baseline

**TC-VI-006**: 设计稿视觉对照：A3 草稿态 voice-btn 还原 outline + 光标置末
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 已完成一次流式录音，input 草稿落框
- **操作步骤:** 1) 检查 voice-btn 视觉；2) 检查 input 内光标位置；3) 检查 submit-btn 状态
- **预期结果:** voice-btn 为 outline 圆形（mic 图标）；input 内光标置于文本末尾且可见；submit-btn enabled（primary 填色 + arrow-up 图标）
- **测试数据:** 视觉 baseline

### B. REQ-001 异常处理

**TC-VI-007**: D1 permission_denied → 右上角 destructive toast「Microphone access blocked」
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 浏览器麦克风权限被拒绝（getUserMedia 返回 NotAllowedError）
- **操作步骤:** 1) 点击 voice-btn；2) 在浏览器原生 prompt 中点拒绝；3) 验证 toast；4) 等待 5 秒
- **预期结果:** 页面右上角出现 destructive toast「Microphone access blocked」+ close 按钮；toast 在 5 秒内自动消失或可手动关闭；voice-btn 不进入 timer-wave pill 态；input 内容不变
- **测试数据:** permission=denied

**TC-VI-008**: D2a stt_connect_failure（录制启动 ≤3s 未首 partial）→ 右上角 toast + Retry pill
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** mock STT WebSocket 握手失败或 3 秒内无首 partial 返回；浏览器麦克风权限已授权
- **操作步骤:** 1) 点击 voice-btn；2) 等待约 3 秒；3) 验证 toast 出现时机；4) 检查 timer-wave pill 是否还原；5) 点击 toast 内 Retry pill
- **预期结果:** 录制启动后 ≤3 秒内（不等用户停止）页面右上角出现 destructive toast「Can't reach voice service · Recording saved. No need to re-record.」+ 内嵌 Retry pill（替代 close）；timer-wave pill 自动还原为 voice-btn outline；本地保留 audio blob；点击 Retry 重新提交本地 audio blob（不重录）；fallback 至备用 STT；toast 在用户操作或 fallback 完成前常驻
- **测试数据:** mock=connect_failure

**TC-VI-009**: D2b stt_finalize_failure（停止后 ≤5s 未 final）→ 右上角 toast + Retry pill
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** mock STT 在用户停止录音后 5 秒内不返回 final transcript
- **操作步骤:** 1) 点击 voice-btn 开始录音；2) 口述约 5 秒；3) 点击 pill 停止；4) 等待约 5 秒
- **预期结果:** 停止后 ≤5 秒页面右上角出现 destructive toast「Recognition failed · Recording saved. No need to re-record.」+ 内嵌 Retry pill；本地保留 audio blob；点击 Retry 重新提交不重录；toast 在用户操作或 fallback 完成前常驻
- **测试数据:** mock=finalize_failure

**TC-VI-010**: network_unstable（流式断流 > 3s 自动降级，不进入 D2）
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 流式录音已建立 WebSocket；mock 网络中断 5 秒后恢复
- **操作步骤:** 1) 点击 voice-btn 开始录音；2) 口述持续约 15 秒；3) mock 在第 5 秒中断网络 5 秒；4) 网络恢复后继续录音；5) 停止
- **预期结果:** 系统自动降级为本地 buffer 录音 + 后台重连；网络恢复后一次性补转；用户侧仅一次性 toast"网络恢复中"；不视为 STT 失败、不进入 D2；最终 final transcript 包含全部录音内容
- **测试数据:** netDropMs=5000

**TC-VI-011**: 录音中切换浏览器 tab → 录音持续
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 流式录音进行中
- **操作步骤:** 1) 点击 voice-btn 开始录音并口述；2) 切换到其他浏览器 tab 持续 5 秒；3) 切回原 tab；4) 停止录音
- **预期结果:** 录音持续未中断；切回后 partial 仍在更新；停止后 final 包含切 tab 期间的内容
- **测试数据:** tabSwitchMs=5000

**TC-VI-012**: 录音中关闭页面 → 录音关闭并丢弃
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** 流式录音进行中
- **操作步骤:** 1) 点击 voice-btn 开始录音；2) 在录音中关闭浏览器 tab / 页面；3) 重新打开 task_creation 入口页
- **预期结果:** 录音关闭、内容丢弃；重新打开后 input 为空、A1 default 态；不留任何 transcript
- **测试数据:** action=close_page

**TC-VI-013**: 转写文本与 input 已有内容冲突 → 追加不覆盖
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已在 input 框手动键入"前置文字"；浏览器麦克风权限已授权
- **操作步骤:** 1) input 中保留"前置文字"；2) 点击 voice-btn；3) 口述约 5 秒"补充内容"；4) 停止
- **预期结果:** 转写文本追加到"前置文字"末尾，input 显示"前置文字 + 补充内容"；不覆盖原内容
- **测试数据:** prefix="前置文字"

**TC-VI-014**: 边界值：录音时长 < 0.5 秒 → 误触不调用 STT
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 浏览器麦克风权限已授权
- **操作步骤:** 1) 点击 voice-btn；2) 在 0.4 秒内立即再次点击 pill 停止；3) 检查 input 与 voice-btn 状态
- **预期结果:** 不调用 STT；input 框内容不变；voice-btn 还原为 outline；无 final 落入
- **测试数据:** durationMs=400

**TC-VI-015**: 边界值：长录音 600 秒自动停止
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 浏览器麦克风权限已授权；mock 持续音频源
- **操作步骤:** 1) 点击 voice-btn 开始录音；2) 等待至 600 秒
- **预期结果:** 600 秒到达后自动停止并接收 final transcript；草稿落框；timer-wave pill 还原为 outline；user 无需手动停止
- **测试数据:** durationMs=600000

**TC-VI-016**: 边界值：录音超过 9:00 → 展示 09:00 / 10:00 提示
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 浏览器麦克风权限已授权
- **操作步骤:** 1) 点击 voice-btn 开始录音；2) 持续录音超过 9:00 即 540 秒
- **预期结果:** 录音超过 9:00 时展示 "09:00 / 10:00" 长录音上限提示；提示视觉不强制中断录音；到 10:00 自动停止
- **测试数据:** durationMs=545000

**TC-VI-017**: 边界值：stt_connect_failure 触发边界（2.9s / 3.0s / 3.1s）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** mock STT 首 partial 在指定延迟到达
- **操作步骤:** 分三个子用例：a) mock 2.9s 收到首 partial → 不触发 D2a；b) mock 3.0s 收到首 partial → 不触发 D2a；c) mock 3.1s 收到首 partial → 触发 D2a
- **预期结果:** ≤3 秒到达的 partial 不触发 D2a，进入正常流式；> 3 秒触发 D2a toast
- **测试数据:** firstPartialDelayMs ∈ {2900, 3000, 3100}

**TC-VI-018**: 录音中 submit-btn 应 disabled
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 流式录音进行中
- **操作步骤:** 1) 点击 voice-btn 开始录音；2) 在录制态下尝试点击 submit-btn
- **预期结果:** submit-btn 在录制中 disabled，点击无任何响应；录音继续

### C. REQ-002 非流式录制兜底（A2-2 · recording-nostream）

**TC-VI-019**: A2-2 非流式录制完整流程 → ✓ 确认 → 一次性回填 → 草稿编辑 → 提交（核心 Happy Path）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录；浏览器麦克风权限已授权；mock STT 能力矩阵返回"不支持 partial" 或服务端 voice_streaming_enabled=false；当前位于 task_creation A1 default 态
- **操作步骤:** 1) 点击 voice-btn；2) 验证整个 input 与右下角双按钮一起变形为 a22Pill（全宽 pill，rounded-2xl、white background、warm shadow blur 20）；3) 验证 a22Pill 上段 wave-row：左侧 fill 波形动效 + 右侧 Geist Mono 计时器 "0:NN" 13px；4) 验证 a22Pill 下段 footer：左侧 + 附件 32×32 outline 圆形 + 右侧 × 取消 + ✓ 确认 双 32×32 muted 圆形按钮（gap 8px）；5) 口述约 15 秒，验证全程不显示任何转写文字（包括 partial 与 final）；6) 计时器持续累计，波形随音量波动；7) 点击 footer 右侧 ✓ 确认按钮；8) 验证 a22Pill 内文字临时替换为"Recognizing… / 识别中…"，计时器停止累计，✓ 按钮变为 disabled；9) 等待 STT 一次性返回 final（≤8 秒）；10) 验证 transcript 一次性回填 input、光标置末；11) 验证 a22Pill 还原为标准 input，voice-btn outline + submit-btn enabled；12) 编辑后点击 submit-btn
- **预期结果:** a22Pill 视觉与设计稿一致；录制全程无 partial 文字；点 ✓ → 上传 → final 回填总耗时 P95 ≤ 6 秒；草稿态视觉与 REQ-001 共用 A3
- **测试数据:** scene=task_creation；mock=nostream；duration≈15s

**TC-VI-020**: A2-2 非流式录制点 × 取消 → 丢弃 audio + 计时回 A1
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 已进入 A2-2 录制态约 10 秒
- **操作步骤:** 1) 录制中点击 footer 右侧 × 取消按钮；2) 检查界面与 STT 调用
- **预期结果:** 直接丢弃本地 audio blob、清零计时器；不调用 STT；input 还原为 A1 default 态（hero 文案 + placeholder + voice-btn outline + submit-btn disabled）；不写入任何 transcript；不弹任何 toast
- **测试数据:** mock=nostream

**TC-VI-021**: A2-2 录制中点击 + 附件 → 附件与录音并存
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 已进入 A2-2 录制态
- **操作步骤:** 1) 录制中点击 footer 左侧 + 附件按钮；2) 在弹出的附件选择器中选择 1 个文件；3) 验证 a22Pill 状态；4) 继续录音 5 秒；5) 点 ✓ 确认
- **预期结果:** 触发既有附件上传流程；附件上传与录音并发、不打断 a22Pill 计时与波形；附件落入 input 上方既有附件区，与 audio blob 解耦；最终 transcript 回填 input 后附件仍然存在
- **测试数据:** mock=nostream；attachment="test.pdf"

**TC-VI-022**: A2-2 stt_finalize_failure（点✓后 ≤8s 未 final）→ 右上角 toast + Retry pill
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 已进入 A2-2 录制态；mock STT 在用户点 ✓ 后 8 秒内不返回 final
- **操作步骤:** 1) 录制约 5 秒；2) 点击 ✓ 确认；3) 等待 8 秒；4) 验证 toast 与 Retry pill
- **预期结果:** 点 ✓ 后 ≤8 秒未返回 final 时弹 destructive toast「Recognition failed · Recording saved.」+ 内嵌 Retry pill；本地保留 audio blob；点 Retry 重新提交不重录；toast 常驻直到用户操作或 fallback 完成
- **测试数据:** mock=nostream_finalize_failure；timeoutMs=8000

**TC-VI-023**: A2-2 边界值：非流式 finalize 超时边界（7.9s / 8.0s / 8.1s）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** mock STT 在点 ✓ 后指定延迟返回 final
- **操作步骤:** 分三个子用例：a) 7.9s 返回 → 不触发 D2b；b) 8.0s 返回 → 不触发 D2b；c) 8.1s 返回 → 触发 D2b
- **预期结果:** ≤8 秒到达的 final 不触发 D2b；>8 秒触发 D2b toast
- **测试数据:** finalDelayMs ∈ {7900, 8000, 8100}

**TC-VI-024**: A2-2 边界值：empty_state 录制 < 0.5s 点 ✓ → 不调用 STT
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 已进入 A2-2 录制态
- **操作步骤:** 1) 进入 A2-2；2) 在 0.4 秒内点击 ✓ 确认
- **预期结果:** 不调用 STT、不修改 input、a22Pill 还原为 A1 default 态；不写入 transcript
- **测试数据:** durationMs=400；action=confirm

**TC-VI-025**: A2-2 边界值：empty_state 录制 < 0.5s 点 × → 丢弃回 A1
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 已进入 A2-2 录制态
- **操作步骤:** 1) 进入 A2-2；2) 在 0.4 秒内点击 × 取消
- **预期结果:** 丢弃 audio、清零计时、回 A1 default 态；不弹任何提示
- **测试数据:** durationMs=400；action=cancel

**TC-VI-026**: A2-2 permission_revoked_mid_session：录制中系统层撤销权限
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 已进入 A2-2 录制态约 5 秒
- **操作步骤:** 1) 在系统层（操作系统设置）撤销当前域名的麦克风权限；2) 等待响应
- **预期结果:** 录音中断；a22Pill 自动停止计时；本地保留已录 audio blob；进入 D1 视觉态并附加额外提示"麦克风权限被撤销，请恢复后重试"
- **测试数据:** mock=revoke_mid_session

**TC-VI-027**: A2-2 设计稿视觉对照：a22Pill 全宽波形 pill（rounded-2xl + warm shadow）
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 已进入 A2-2 录制态
- **操作步骤:** 1) 截图整个 input 区域；2) 验证 a22Pill 全宽布局；3) 测量圆角与阴影
- **预期结果:** a22Pill 占据原 input 全宽；圆角为 rounded-2xl；white background + warm shadow blur 20；上下两段布局正确（wave-row / footer）；计时器为 Geist Mono 13px、显示"0:NN"
- **测试数据:** 视觉 baseline

**TC-VI-028**: A2-2 设计稿视觉对照：footer 三按钮（× / ✓ / +）布局
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 已进入 A2-2 录制态
- **操作步骤:** 1) 截图 a22Pill 下段 footer；2) 检查按钮尺寸、对齐、gap
- **预期结果:** footer 左侧为 + 附件按钮（32×32 outline 圆形）；右侧为 × 取消 + ✓ 确认双 32×32 muted 圆形按钮（gap 8px）；Recognizing… 期间 ✓ 变为 disabled、× 保持可点
- **测试数据:** 视觉 baseline

**TC-VI-029**: A2-2 追加录音仍走非流式路径
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 已完成一次 A2-2 录制并回填到 A3 草稿态
- **操作步骤:** 1) 在 A3 状态下再次点击 voice-btn；2) 验证是否进入 A2-2 还是 A2；3) 录约 5 秒；4) 点 ✓ 确认
- **预期结果:** 追加录音仍进入 A2-2（非流式），不切换到 A2 流式路径；新转写追加到 input 末尾不覆盖
- **测试数据:** mock=nostream；append=true

**TC-VI-030**: A2-2 网络不稳定（上传阶段中断）→ 自动重试 ≤3 次，不进 D2
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 已进入 A2-2 录制态约 5 秒并点 ✓；mock 上传 audio blob 阶段网络中断
- **操作步骤:** 1) 录约 5 秒；2) 点 ✓；3) mock 上传过程中断网 3 秒；4) 网络恢复
- **预期结果:** 系统自动重试上传 ≤3 次；用户侧仅一次性 toast"网络恢复中"；不进入 D2；最终成功上传并 final 回填 input
- **测试数据:** mock=nostream_upload_unstable

**TC-VI-031**: A2-2 录制中切换 tab / 关闭页面
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** 已进入 A2-2 录制态
- **操作步骤:** 分两个子用例：a) 切换 tab 5 秒后返回；b) 关闭页面后重新打开
- **预期结果:** a) 录音持续，返回后波形与计时器继续；b) 录音关闭、丢弃、a22Pill 不残留；重新打开为 A1 default 态
- **测试数据:** action ∈ {tab_switch, close_page}

**TC-VI-032**: A2-2 长录音 600s 自动停止
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 已进入 A2-2 录制态；mock 持续音频源
- **操作步骤:** 1) 进入 A2-2 后持续录音至 600 秒；2) 等待自动停止
- **预期结果:** 600 秒到达后自动停止并触发 STT 上传 + final 回填；a22Pill 还原为 A3；超过 9:00 展示 "09:00 / 10:00" 提示
- **测试数据:** durationMs=600000

**TC-VI-033**: A2-2 转写文本与 input 已有内容冲突 → 追加不覆盖
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户已在 input 手动键入"前置文字"
- **操作步骤:** 1) 点击 voice-btn 进入 A2-2；2) 录约 5 秒；3) 点 ✓
- **预期结果:** 回填的 transcript 追加到"前置文字"末尾，不覆盖
- **测试数据:** prefix="前置文字"；mock=nostream

### D. REQ-003 语言自动识别

**TC-VI-034**: STT 识别语言跟随 Mira 全局语言（en）
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户已在左下角头像菜单将 Mira 全局语言设为 English；浏览器麦克风权限已授权；STT 供应商支持 en
- **操作步骤:** 1) 进入 task_creation；2) 点击 voice-btn 开始流式录音；3) 用英文口述约 10 秒；4) 停止；5) 验证 voice_record_started 事件中 mira_locale=en、stt_language=en
- **预期结果:** STT 以 English 识别并返回 final transcript；不在 voice-btn 旁出现语言代码标签；不弹出独立语言选择 UI
- **测试数据:** mira_locale=en；speakLang=en

**TC-VI-035**: STT 识别语言跟随 Mira 全局语言（zh）
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Mira 全局语言设为 中文；STT 供应商支持 zh
- **操作步骤:** 1) 点击 voice-btn 录音；2) 用中文口述约 10 秒；3) 停止
- **预期结果:** STT 以 中文 识别；voice_record_started 事件 stt_language=zh
- **测试数据:** mira_locale=zh；speakLang=zh

**TC-VI-036**: language_not_supported_by_stt → 回退到 English
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** Mira 全局语言被设为一种 STT 供应商不支持的语言（mock 能力矩阵）
- **操作步骤:** 1) 点击 voice-btn 录音；2) 口述约 10 秒；3) 停止；4) 检查 STT 调用语言与后端日志
- **预期结果:** STT 调用回退到 English；voice_transcript_finalized 事件 language_detected=en；后台日志记录 mira_locale ≠ stt_language 用于评估
- **测试数据:** mira_locale=unsupported

**TC-VI-037**: 中英混说语言识别
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** Mira 全局语言设为中文或英文；STT 供应商支持混说
- **操作步骤:** 1) 点击 voice-btn 录音；2) 口述中英混合内容，如"招聘 Senior Java 工程师 with 5 years experience"；3) 停止
- **预期结果:** STT 支持混合语言识别，final transcript 包含中文与英文片段，不丢失任意一种
- **测试数据:** speakLang=mixed

### E. 综合（错误猜测 / 边界）

**TC-VI-038**: 设计稿视觉对照：D1 toast 文案与自动消失
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 触发 permission_denied
- **操作步骤:** 1) 触发 D1；2) 测量 toast 显示时长；3) 验证 close 按钮可点
- **预期结果:** toast 文案为「Microphone access blocked」；含 close 按钮；5 秒自动消失，或点击 close 立即消失；位置为页面右上角
- **测试数据:** type=D1

**TC-VI-039**: 设计稿视觉对照：D2 toast 内嵌 Retry pill（替代 close）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 触发 D2a 或 D2b
- **操作步骤:** 1) 触发 D2a；2) 检查 toast 内是否有 Retry pill 而非 close；3) 等待 10 秒
- **预期结果:** D2a / D2b toast 内嵌 Retry pill；无 close 按钮；toast 在用户操作或 fallback 完成前常驻不自动消失
- **测试数据:** type=D2a 或 D2b

**TC-VI-040**: Retry pill 点击重新提交本地 audio blob（不重录）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** D2b toast 已显示；本地 audio blob 仍保留
- **操作步骤:** 1) 点击 toast 内 Retry pill；2) 验证是否要求用户重录；3) 检查 STT 调用
- **预期结果:** Retry 直接使用本地保留的 audio blob 重新提交 STT，不要求用户重录；成功则 final 回填 input 进入 A3 草稿态；失败则 toast 持续
- **测试数据:** blobRetained=true

---

## 优先级分布统计

- P0：7 个（TC-VI-001, 002, 007, 008, 009, 019, 020, 022）→ 约 18%（核心闭环 + 关键异常 + 关键设计稿）
- P1：18 个 → 约 45%
- P2：15 个 → 约 37%
- 合计：40 个用例
