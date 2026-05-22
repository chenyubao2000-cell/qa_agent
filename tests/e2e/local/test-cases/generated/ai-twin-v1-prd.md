<!-- PRD-hash: dc8a71937289c5c38b6247c20d0ba0cdd1477e2607bf7d45902b32cecc51a1fa | PRD-module: AI Twin V1 (Lite, REQ-001 ~ REQ-006) | feature-slug: ai-twin-v1 -->

# AI Twin V1（Lite 分支）· 测试用例

> 覆盖范围：REQ-001 ~ REQ-006（U1 分身配置页 / U1 三状态模式 / U2 首次见面 / 后续对话身份渲染 / U9.2 用户菜单 AI Twin section / sourcing_agent system prompt 注入与缓存）。

模块编号约定：
- REQ-001 → MOD = `TWIN-FORM`
- REQ-002 → MOD = `TWIN-MODE`
- REQ-003 → MOD = `TWIN-U2`
- REQ-004 → MOD = `TWIN-RENDER`
- REQ-005 → MOD = `TWIN-MENU`
- REQ-006 → MOD = `TWIN-SYS`

---

## Method 1: Equivalence Partitioning

按字段对输入域做等价类划分（每个无效类单独覆盖、多个有效类可在一条用例中组合）。

### REQ-001 · nameField（AI Twin name）

| 等价类 | 类型 | 代表值 | 说明 |
|--------|------|--------|------|
| EC-N-V1 | 有效 | "Aria" | 仅字母 + 长度 1~20 |
| EC-N-V2 | 有效 | "My Twin 01" | 含空格 + 数字 + 字母 |
| EC-N-V3 | 有效 | （空提交） | 触发系统自动落 `Aria` 默认值 |
| EC-N-I1 | 无效 | "AriaAriaAriaAriaAriaX" (21字符) | 超出长度上限 |
| EC-N-I2 | 无效 | "Mira_Helper" | 含品牌黑名单子串 `mira`（不区分大小写） |
| EC-N-I3 | 无效 | "OpenAI Bot" | 含品牌黑名单子串 `openai` |
| EC-N-I4 | 无效 | "Twin-2025" | 含非法字符（`-` 不在 `[A-Za-z0-9 ]`） |
| EC-N-I5 | 无效 | "Aria 🚀" | 含 emoji / 控制符 |

### REQ-001 · avatarField（自定义上传）

| 等价类 | 类型 | 代表值 | 说明 |
|--------|------|--------|------|
| EC-A-V1 | 有效 | 1.2MB JPG 800×800 | 大小 < 2MB / MIME 合法 |
| EC-A-V2 | 有效 | 1.8MB PNG 1024×1024 | 上限附近 |
| EC-A-I1 | 无效 | 2.4MB JPG | 超过 2MB 上限 |
| EC-A-I2 | 无效 | gif / svg / bmp | MIME 不在 [JPG, PNG, WebP] |

### REQ-001 · personalityField

4 个枚举（default / professional / friendly / concise），每个值都是一个有效等价类。

### REQ-002 · mode（onboarding / migration / edit）

3 个状态枚举，每个都是有效类；任何非法 mode 参数应被服务端兜底回 onboarding。

### REQ-006 · profile 注入分支

- 有效类 EC-P-V1：personality=default → Segment 2 不含 tone 行
- 有效类 EC-P-V2：personality≠default → Segment 2 末尾追加 ` When responding, lean toward a {personality} tone.`

---

## Method 2: Boundary Value Analysis

围绕长度上下界、文件大小上界、上传分辨率、超时时长进行边界值取样（lower-1 / lower / lower+1 / nominal / upper-1 / upper / upper+1）。

| 边界对象 | 下界-1 | 下界 | 下界+1 | 上界-1 | 上界 | 上界+1 |
|----------|--------|------|--------|--------|------|--------|
| name 长度 | 0（空） | 1 | 2 | 19 | 20 | 21 |
| avatar 大小（MB） | 0（空文件） | 0.01 | — | 1.99 | 2.00 | 2.01 |
| U1 提交响应（ms） | — | — | — | 999 | 1000 | 3001（≥3s 触发 spinner）/ 8001（≥8s 触发 Try again） |
| U2 打招呼渲染（ms） | — | — | — | 1499 | 1500 | 1501（触发 ThinkingIndicator） |
| LRU TTL | — | — | — | 29min59s | 30min | 30min01s（应 miss） |

> 这些边界既覆盖字段校验，也覆盖性能阈值与缓存行为，分别在不同 TC 中体现。

---

## Method 3: Cause-Effect Graph / Decision Table

### REQ-002 · 模式分流决策表（profile 状态 × 注册时间 × 用户动作）

| 编号 | profile 存在 | 注册时间 ≥ V1 上线日 | 用户动作 | mode | hero/CTA |
|------|--------------|-----------------------|----------|------|----------|
| D1 | 否 | 是 | 任意登录 | onboarding | Create your AI Twin / Continue（桌面）/ Create Aria and Start（移动） |
| D2 | 否 | 否 | 任意登录 | migration | Old friend, Meet your NEW partner / 同 onboarding CTA |
| D3 | 是 | — | 普通登录 | （不路由 U1） | 进入工作区 |
| D4 | 是 | — | U9.2 点击 settings 图标 | edit | Edit your AI Twin / Save changes |

### REQ-001 · 字段联合校验决策表

| 编号 | name 合法 | avatar 合法 | personality 已选 | CTA 状态 | 提交结果 |
|------|-----------|-------------|--------------------|----------|-----------|
| F1 | ✅ | ✅ | ✅ | 可点 | 成功写入 profile |
| F2 | ❌ (任一规则) | ✅ | ✅ | disabled + inline error | 拒绝 |
| F3 | ✅ | ❌ (size/mime) | ✅ | 字段错误 + CTA 可点（保留旧 preset 兜底） | 拒绝并强制重选 |
| F4 | ✅ (空提交) | ✅ | ✅ | 可点 | 成功，name 自动写入 "Aria" |

### REQ-005 · 主弹层 + 子弹层 hover/click 展开矩阵

| 编号 | 触发对象 | 触发方式 | 子弹层 settingsSubPop |
|------|-----------|-----------|------------------------|
| M1 | mSetting | hover 0.3s | 展开 |
| M2 | mSetting | click | 展开 |
| M3 | mLang / mTheme | hover/click | 不应展开 settingsSubPop |
| M4 | 弹层外区域 | click outside | 关闭主弹层 + 子弹层 |

---

## Method 4: State Transition Testing

### REQ-002 · 用户分身配置生命周期状态机

```
[未登录]
  → 登录成功
[profile 缺失 / 老用户]      → 强制 → [U1 mode=migration] → 提交合规 → [U2 first_meet]
[profile 缺失 / 新用户]      → 强制 → [U1 mode=onboarding] → 提交合规 → [U2 first_meet]
[U2 first_meet]              → 提交首个 query / 点 followUps → [U6 任务执行]
[U6 任务执行 / 工作区]        → 点 sidebarUser → settings 图标 → [U1 mode=edit]
[U1 mode=edit]               → Save changes → toast → 回到触发页
[U1 mode=edit]               → Cancel → 直接返回（无挽留）
[U1 mode=onboarding/migration] → Exit/X → 挽留 dialog → 离开 → 下次登录回 U1
```

### REQ-006 · LRU + cache 命中状态机

```
[启动 session] → DB 读 profile → [LRU(hit)]   ←┐
[每次 LLM 调用] → 拼 Seg1+Seg2 → cache(hit/miss)│
[U1 mode=edit 提交]            → invalidate LRU → 下一轮 [LRU(miss) → 重建]
[30 分钟空闲]                  → LRU 过期 → 下一轮重建
```

### REQ-004 · 已渲染消息 vs 新消息身份状态切换

- 已渲染 assistant 消息保留生成时的 twin_profile 快照（编辑 profile 后不重写正文）
- 新消息使用新 profile
- 历史 Task Record 中老消息渲染层贴最新 profile

---

## Method 5: Scenario Method

围绕 §测试策略中列出的 7 大核心场景，将基本流（happy path）与备选流（异常/分支）合并成端到端业务场景。

| 场景编号 | 名称 | 涉及 REQ | 基本流 → 备选流 |
|----------|------|----------|-------------------|
| SC-1 | 新用户全流程 onboarding 激活 | REQ-001/002/003/004 | 注册 → U1 onboarding → 三字段填默认 → CTA Continue → U2 见面 → 点 followUps[0] → 进入 U6 → assistant 消息身份一致 |
| SC-2 | 老用户回填 migration | REQ-001/002/004 | 老账号登录 → 强制 U1 migration → 自定义 name + Friendly + 上传 avatar → Save → U2 → 已有 Task Record 中旧消息渲染当前 profile |
| SC-3 | 编辑分身（U9.2 → U1 edit） | REQ-001/002/004/005 | 在 U6 → sidebarUser → AI Twin section settings 图标 → U1 edit → 改 name 为 "Aria 2" → Save changes → toast → 跳回 U6 → 新消息使用新身份 |
| SC-4 | onboarding 挽留 → 重试 | REQ-002 | onboarding → 点 Exit → 挽留 dialog → 留下 → 完成提交 |
| SC-5 | 异常路径 · 各类字段拒绝 | REQ-001 | 用户依次触发 name_too_long / name_blocked_brand / name_invalid_chars / avatar_upload_too_large / avatar_upload_failed / network_timeout_on_submit |
| SC-6 | 品牌一致性 · 系统级公告不被分身覆盖 | REQ-004 | 用户进入 U6 收到分身回复 + 系统级 "Mira Support" 公告，二者头像/名字独立 |
| SC-7 | Sourcing_agent 缓存验证（后端可观测） | REQ-006 | 同用户连续 5 轮对话 → segment1/2 命中；编辑 personality 后下一轮 segment2 miss → 再下一轮命中 |

---

## Method 6: Error Guessing

经验性补充“容易遗漏”的异常用例：

| 编号 | 猜想 | 关联 REQ |
|------|------|----------|
| EG-1 | 用户在 onboarding U1 输入到一半关闭浏览器后重登 → 应仍走 U1 同 mode，本地草稿不持久 | REQ-001 / REQ-002 |
| EG-2 | 用户上传 avatar 但未点 CTA 就刷新 → R2 资源 GC 标记 | REQ-001 |
| EG-3 | 用户在 edit U1 改了字段后点 Cancel → 不应写入 profile | REQ-001 / REQ-002 |
| EG-4 | 注册时未采集 first_name → U2 msgContent.1 渲染 "Hey there 👋" | REQ-003 |
| EG-5 | profile_load_failure (U2 加载读不到 profile) → 兜底 name="Aria", avatar=preset_m1, personality=default | REQ-003 |
| EG-6 | 已渲染消息中 avatar 突然 404 → 静默回退 preset_m1 | REQ-004 |
| EG-7 | profile.twin_name 数据库读到 null → 渲染兜底 "Aria" | REQ-004 |
| EG-8 | 用户没自定义头像默认是 Mira logo → 应以**圆角矩形**渲染（与 preset 圆形/pill 形对比） | REQ-004 |
| EG-9 | 系统级公告/客服消息保持 "Mira Support" 身份 | REQ-004 |
| EG-10 | 用户菜单 settingsSubPop hover 离开后未及时收起 → 检查关闭时机 | REQ-005 |
| EG-11 | 多 tab 并发同 user_id，一个 tab 改了 personality → 另一 tab 下一轮 LLM 调用 LRU 失效广播是否生效 | REQ-006 |
| EG-12 | profile_load_db_timeout > 500ms → fallback 使用 default profile | REQ-006 |
| EG-13 | 移动端断点 390 下 hero 字号、CTA 形态、bottomBar 是否正确切换 | REQ-001 / REQ-002 |
| EG-14 | edit 模式 CTA 在无变更时 opacity 0.4 不可点 | REQ-002 |
| EG-15 | U2 followUps 全部不点 + 自由输入 → list/followUps 隐藏，进入正常 sourcing 对话 | REQ-003 |
| EG-16 | U9.2 Sign out 触发登出 | REQ-005 |

---

## Merged Test Case List

> 去重 + 合并后的最终用例列表。每个 TC 来自单一最先产出它的设计方法。Excel 导出以此节为准。

### REQ-001 · U1 分身配置页 · 三字段表单

**TC-PRD-TWIN-FORM-001**: U1 onboarding 页面骨架与默认值正确渲染
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 新用户已注册并完成邮箱验证；user_twin_profile 为空；注册时间 ≥ V1 上线日
- **操作步骤:** 1) 登录系统 2) 浏览器路由跳到 `/ai-twin/create?mode=onboarding`
- **预期结果:** formCard 单卡居中（桌面 640 宽），自上而下依次显示 avatarField（currentAvatar 64×64 + "Aria / Your AI Twin" + Change 按钮）、nameField（placeholder "Aria"）、personalityField（4 行 row：Default/Professional/Friendly/Concise，Default 选中），桌面右下 floatBtn "Continue"
- **测试数据:** mode=onboarding

**TC-PRD-TWIN-FORM-002**: 三字段全用默认值一键提交成功
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) 不修改任何字段 2) 点击 CTA "Continue"
- **预期结果:** user_twin_profile 写入 `{ twin_name: "Aria", twin_avatar_source: "preset_m1", twin_personality: "default" }`；路由跳转 `/task/new?first_meet=true`
- **测试数据:** dataType=identity.name dataVariant=valid（空提交→默认）

**TC-PRD-TWIN-FORM-003**: 自定义 name + Professional + 自定义上传 avatar 提交成功
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) name 字段填 "My Twin 01" 2) 点 Change → Upload your own → 选择 1.2MB JPG 3) 点 personalityField "Professional" row 4) 点 CTA
- **预期结果:** user_twin_profile.twin_name="My Twin 01"；twin_avatar_source="custom" 且 URL 指向 R2 私有 bucket（命名 `twin-avatar/{user_id}/{ts}.jpg`）；twin_personality="professional"
- **测试数据:** name=有效组合（字母+数字+空格）；avatar=1.2MB JPG 800×800

**TC-PRD-TWIN-FORM-004**: name 边界值 20 字符提交成功
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) name 字段填 "AriaAriaAriaAriaAria"（恰好 20 字符） 2) 点 CTA
- **预期结果:** 提交成功，profile.twin_name 保存完整 20 字符
- **测试数据:** name="AriaAriaAriaAriaAria"（20 chars）

**TC-PRD-TWIN-FORM-005**: name 长度 21 字符被拒绝
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) name 字段填 "AriaAriaAriaAriaAriaX"（21 字符） 2) 观察校验提示
- **预期结果:** name 字段下方 inline error "Name must be 1-20 characters" / "名字限 1-20 字符"；CTA disabled；profile 不写入
- **测试数据:** name="AriaAriaAriaAriaAriaX"（21 chars）

**TC-PRD-TWIN-FORM-006**: name 含品牌黑名单 mira 被拒绝
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) name 字段填 "Mira_Helper" 2) 观察校验提示
- **预期结果:** inline error "Name can't include other AI brand names" / "名字不能包含其他 AI 品牌名"；CTA disabled
- **测试数据:** name="Mira_Helper"

> **PRD-hash 更新说明 (V1.6-lite, 2026-05-21)**：源码 validator 校验顺序为 长度 → 字符集 → 品牌黑名单，因此 `Mira_Helper`（含下划线）会先命中 `nameInvalidChars`。新增 **TC-PRD-TWIN-FORM-006b** 用 `MiraHelper` 测试品牌阻断路径，与 TC-006 互补；详见 spec 文件。

**TC-PRD-TWIN-FORM-006b**: name 含纯品牌子串 mira（无下划线）触发品牌黑名单
- **优先级:** P0
- **测试类型:** 等价类划分（补充用例）
- **前置条件:** 用户在 edit U1（已配置用户唯一可达模式）
- **操作步骤:** 1) name 字段填 "MiraHelper" 2) 观察校验提示
- **预期结果:** inline error twin.errors.nameBlockedBrand；CTA disabled
- **测试数据:** name="MiraHelper"

**TC-PRD-TWIN-FORM-007**: name 含品牌黑名单 openai/chatgpt/claude/anthropic 任意子串被拒绝
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) 分别在 name 字段尝试 "OpenAI Bot" / "ChatGPT2" / "ClaudeBro" / "AnthropicX" 2) 观察校验
- **预期结果:** 每个值均触发 name_blocked_brand inline error；CTA disabled
- **测试数据:** name ∈ {"OpenAI Bot","ChatGPT2","ClaudeBro","AnthropicX"}

**TC-PRD-TWIN-FORM-008**: name 含非法字符（破折号等）被拒绝
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) name 字段填 "Twin-2025" 2) 观察校验
- **预期结果:** inline error "Only letters, numbers and spaces" / "仅支持字母、数字和空格"
- **测试数据:** name="Twin-2025"

**TC-PRD-TWIN-FORM-009**: name 含 emoji/控制符被拒绝
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) name 字段填 "Aria 🚀" 2) 观察校验
- **预期结果:** inline error name_invalid_chars
- **测试数据:** name="Aria 🚀"

**TC-PRD-TWIN-FORM-010**: avatar 上传大小 1.99MB 边界值成功
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户在 onboarding U1，点开 Change 弹层
- **操作步骤:** 1) 点 "Upload your own" 2) 选择 1.99MB PNG 1024×1024 3) 客户端裁剪到 1:1
- **预期结果:** 上传成功；服务端压缩到 256×256；currentAvatar 实时更新；弹层自动关闭
- **测试数据:** file.image 1.99MB PNG

**TC-PRD-TWIN-FORM-011**: avatar 上传 2.4MB 超过上限被拒绝
- **优先级:** P0
- **测试类型:** 边界值分析
- **前置条件:** 用户在 onboarding U1，点开 Change 弹层
- **操作步骤:** 1) 点 "Upload your own" 2) 选择 2.4MB JPG
- **预期结果:** inline error "Image must be ≤ 2MB" / "图片不超过 2MB"；preview 不更新
- **测试数据:** file.image 2.4MB JPG（oversized）

**TC-PRD-TWIN-FORM-012**: avatar MIME 非法（gif/svg/bmp）被拒绝
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户在 onboarding U1，点开 Change 弹层
- **操作步骤:** 1) 选择 1MB gif（或 svg、bmp） 2) 观察校验
- **预期结果:** 上传被拒绝；提示 MIME 不在 JPG/PNG/WebP 白名单
- **测试数据:** file.image gif/svg/bmp（invalid MIME）

**TC-PRD-TWIN-FORM-013**: avatar 上传 R2 5xx/超时回滚到上一状态
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户在 onboarding U1；mock R2 服务返回 5xx 或超时
- **操作步骤:** 1) Upload your own → 选择 1.2MB JPG 2) 等待上传响应
- **预期结果:** toast "Upload failed · Retry" / "上传失败 · 请重试"；currentAvatar 回滚到上一状态（preset_m1 默认）
- **测试数据:** R2 mock 5xx

**TC-PRD-TWIN-FORM-014**: U1 提交超过 8s 显示 Try again 不丢表单
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 用户在 onboarding U1，三字段已合规填写；mock 后端提交响应延迟 > 8s
- **操作步骤:** 1) 点 CTA "Continue" 2) 等待响应
- **预期结果:** CTA spinner 在 > 3s 时显示，> 8s 时切换为 "Try again" / "重试"；表单字段值保留；点 Try again 重新发请求
- **测试数据:** network_timeout_on_submit

**TC-PRD-TWIN-FORM-015**: avatarField 实时回显 currentAvatar / currentLbl
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) 在 nameField 输入 "Lumi" 2) 点 Change → 选预设 m3 → 确认 3) 观察 avatarCurrentRow
- **预期结果:** currentAvatar 切换为 m3 图片；currentLbl 显示 "Lumi"；hint "Your AI Twin" / "你的 AI 分身" 保持
- **测试数据:** name="Lumi"; avatar=preset_m3

**TC-PRD-TWIN-FORM-016**: 选择 personality 4 档单选互斥
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) 依次点击 Default / Professional / Friendly / Concise 四个 row
- **预期结果:** 每次仅有 1 个 row 处于选中态（stroke foreground 1.5px），其余 3 个为未选（stroke border 1px）；最终落值为最后选中的 row
- **测试数据:** personality ∈ {default, professional, friendly, concise}

**TC-PRD-TWIN-FORM-017**: avatar 上传但未点 CTA 后刷新 → 资源 48h 内 GC
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户在 onboarding U1，已成功上传 1.2MB JPG，CTA 尚未点击
- **操作步骤:** 1) 刷新浏览器 2) 查询 R2 GC 标记日志 3) 等待 48h 再查询
- **预期结果:** 上传完成时 R2 对象被打上 GC 标记；48h 内若未关联 profile，资源被清除
- **测试数据:** 上传未关联

**TC-PRD-TWIN-FORM-018**: U1 草稿不持久 - 关闭浏览器再登录回到原 mode 同字段空白
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户在 onboarding U1，已输入 name="Lumi" 但未提交
- **操作步骤:** 1) 关闭浏览器 2) 重新登录
- **预期结果:** 仍路由到 onboarding U1；nameField 为 placeholder "Aria"（无草稿恢复）；avatar=preset_m1，personality=default
- **测试数据:** 草稿不持久化

### REQ-002 · U1 状态模式分流

**TC-PRD-TWIN-MODE-001**: onboarding 模式 hero/CTA 桌面文案矩阵（EN）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 新用户登录后被服务端路由到 `/ai-twin/create?mode=onboarding`，UI 语言=英文，断点=桌面 1280
- **操作步骤:** 1) 加载 U1 页面 2) 比对 hero/sub/CTA 文案
- **预期结果:** hero_title="Create your AI Twin"；hero_sub="It takes initiative, gets sharper with your action, Take 30 seconds to set it up."；右下 floatBtn CTA="Continue"；右上 exitBtn 显示 "Exit"
- **测试数据:** mode=onboarding, locale=en, viewport=desktop

**TC-PRD-TWIN-MODE-002**: onboarding 模式 hero/CTA 桌面文案矩阵（ZH）
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** UI 语言=中文，断点=桌面，mode=onboarding
- **操作步骤:** 1) 加载 U1 2) 比对中文文案
- **预期结果:** hero_title="创建你的 AI 分身"；hero_sub="它会主动出手、随你的行动越用越准，花 30 秒先设置一下。"；CTA="继续"
- **测试数据:** mode=onboarding, locale=zh

**TC-PRD-TWIN-MODE-003**: migration 模式 hero/CTA 桌面文案矩阵（EN）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 老用户（注册时间 < V1 上线日）登录，profile 缺失；locale=en，viewport=desktop
- **操作步骤:** 1) 登录 2) 加载 `/ai-twin/create?mode=migration`
- **预期结果:** hero_title="Old friend, Meet your NEW partner"；hero_sub="We've upgraded Mira into your own AI Twin, Take 30 seconds to set it up."；CTA="Continue"；exitBtn="Exit"
- **测试数据:** mode=migration, locale=en

**TC-PRD-TWIN-MODE-004**: migration 模式 hero/CTA 桌面文案矩阵（ZH）
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 老用户登录，profile 缺失；locale=zh
- **操作步骤:** 1) 加载 U1 migration
- **预期结果:** hero_title="老朋友，来见见你的新伙伴"；hero_sub="我们把 Mira 升级成了你自己的 AI 分身，花 30 秒先设置一下。"；CTA="继续"
- **测试数据:** mode=migration, locale=zh

**TC-PRD-TWIN-MODE-005**: edit 模式 hero/CTA 文案矩阵（EN）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 已有 profile 的用户，从 U9.2 settings 图标进入；locale=en
- **操作步骤:** 1) 加载 `/ai-twin/create?mode=edit`
- **预期结果:** hero_title="Edit your AI Twin"；hero_sub="Tweak the name, personality, or avatar of your AI Twin anytime."；CTA="Save changes"；exit 控件为 "Cancel"
- **测试数据:** mode=edit, locale=en

**TC-PRD-TWIN-MODE-006**: edit 模式 hero/CTA 文案矩阵（ZH）
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 已有 profile 用户；locale=zh
- **操作步骤:** 1) 加载 U1 edit
- **预期结果:** hero_title="编辑你的 AI 分身"；hero_sub="随时调整你分身的名字、个性或头像。"；CTA="保存修改"；Cancel="取消"
- **测试数据:** mode=edit, locale=zh

**TC-PRD-TWIN-MODE-007**: 移动端 onboarding CTA 文案与底栏渲染
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 移动端 viewport 390，mode=onboarding
- **操作步骤:** 1) 加载 U1 2) 观察底部 bottomBar
- **预期结果:** 底部 bottomBar 固定显示，CTA 全宽，文案="Create Aria and Start" / "创建 Aria 并开始"；topBar 右上为 X 图标
- **测试数据:** viewport=mobile-390, mode=onboarding

**TC-PRD-TWIN-MODE-008**: 移动端 migration CTA 文案
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** viewport=mobile, mode=migration
- **操作步骤:** 1) 加载 U1
- **预期结果:** bottomBar CTA="Create Aria and Start" / "创建 Aria 并开始"
- **测试数据:** viewport=mobile, mode=migration

**TC-PRD-TWIN-MODE-009**: 移动端 edit CTA 内联渲染（无 bottomBar）
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** viewport=mobile, mode=edit
- **操作步骤:** 1) 加载 U1 edit
- **预期结果:** CTA "Save changes" 内联在 formCard 末尾，不出现独立 bottomBar
- **测试数据:** viewport=mobile, mode=edit

**TC-PRD-TWIN-MODE-010**: onboarding 点 Exit 触发挽留 dialog
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户在 onboarding U1
- **操作步骤:** 1) 点击 topBar 右上 "Exit"
- **预期结果:** 弹出 dialog，文案="You haven't finished setting up your Twin. Leave anyway?" / "你还没完成分身配置，确定离开？"；含「确认离开」「继续设置」两个按钮
- **测试数据:** mode=onboarding

**TC-PRD-TWIN-MODE-011**: onboarding 挽留后确认离开 - 下次登录仍回 onboarding
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户在 onboarding U1 触发了挽留 dialog
- **操作步骤:** 1) 在 dialog 点「确认离开」 2) 退出登录 3) 重新登录
- **预期结果:** 服务端检测 profile 仍为空 + 注册 ≥ V1 → 强制路由回 `/ai-twin/create?mode=onboarding`
- **测试数据:** mode=onboarding

**TC-PRD-TWIN-MODE-012**: migration 点 Exit 也走挽留 dialog
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户在 migration U1
- **操作步骤:** 1) 点 Exit
- **预期结果:** 同样弹挽留 dialog；离开后下次登录仍强制回 migration
- **测试数据:** mode=migration

**TC-PRD-TWIN-MODE-013**: edit 模式 Cancel 直接返回不弹挽留
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 已有 profile 用户，从 U6 触发 U1 edit
- **操作步骤:** 1) 修改 name 但未保存 2) 点 "Cancel"
- **预期结果:** 直接跳回触发页（U6），不弹挽留 dialog；profile 不变；不触发 toast
- **测试数据:** mode=edit

**TC-PRD-TWIN-MODE-014**: edit 模式无变更时 CTA opacity 0.4 不可点
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 已有 profile 用户进入 U1 edit
- **操作步骤:** 1) 不修改任何字段 2) 观察 CTA "Save changes" 的状态
- **预期结果:** CTA 透明度 0.4，hover 无反馈，点击无效；name 或 avatar 或 personality 任一变更后 CTA 恢复可点
- **测试数据:** mode=edit, no field changed

**TC-PRD-TWIN-MODE-015**: edit 提交成功 - 跳回触发页 + edit_saved_toast
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户从 U6 进入 edit，已合规修改至少一个字段
- **操作步骤:** 1) 点 CTA "Save changes"
- **预期结果:** profile 写库；路由跳回 referrer（U6）；toast 显示 "Twin updated" / "分身已更新"
- **测试数据:** mode=edit, 修改 name 为 "Aria 2"

**TC-PRD-TWIN-MODE-016**: 已配置用户普通登录 不路由 U1
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** profile 已存在的用户
- **操作步骤:** 1) 正常登录
- **预期结果:** 不进入 `/ai-twin/create`，直接进入工作区（任务列表 / 既有任务）
- **测试数据:** profile.exists=true

**TC-PRD-TWIN-MODE-017**: profile 写入成功但路由跳转失败 客户端重试一次
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 提交合规；mock 路由跳转失败一次
- **操作步骤:** 1) 点 CTA 2) 观察重试逻辑
- **预期结果:** 客户端自动重试 1 次跳转；仍失败则展示 toast "Saved · Tap to continue"，点 toast 继续跳转
- **测试数据:** mock route fail once

**TC-PRD-TWIN-MODE-018**: 服务端强制路由 - 已有 profile 用户访问 `/ai-twin/create?mode=onboarding` 应被拦截
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** profile 已存在
- **操作步骤:** 1) 浏览器地址栏手动输入 `/ai-twin/create?mode=onboarding` 2) 回车
- **预期结果:** 服务端检测 profile 已存在 → 重定向回工作区或当前页（不允许重新走 onboarding）
- **测试数据:** URL 强制访问

### REQ-003 · U2 首次见面

**TC-PRD-TWIN-U2-001**: U1 提交后跳 U2 渲染完整打招呼消息
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户 first_name="Evan"；onboarding U1 已三字段填默认值并提交成功
- **操作步骤:** 1) 提交 U1 2) 等待路由 `/task/new?first_meet=true` 3) 观察 U2 chatBody
- **预期结果:** TaskHeader 显示 "First meeting · Aria"；chatBody 自动渲染 1 条 assistant 消息：aiHd（avatar=preset_m1，name="Aria"）+ msgContent.1="Hey Evan 👋" + msgContent.2 三条能力自述 + msgContent.3 训练引导 + list 4 条训练建议 row + complete 标记 + followUps 3 条；inputArea 聚焦，placeholder="Or just tell me what you want to do..." / "或者直接告诉我你想做什么..."
- **测试数据:** first_name=Evan, twin_name=Aria, personality=default

**TC-PRD-TWIN-U2-002**: greeting_name 取 users.first_name
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** users.first_name="Evan"
- **操作步骤:** 1) 完成 U1 提交，进入 U2
- **预期结果:** msgContent.1 文本="Hey Evan 👋" / "嗨 Evan 👋"
- **测试数据:** first_name=Evan

**TC-PRD-TWIN-U2-003**: greeting_name 兜底 "there"（first_name 缺失）
- **优先级:** P0
- **测试类型:** 错误猜测
- **前置条件:** 用户注册时未采集 first_name（数据库 first_name=null）
- **操作步骤:** 1) 完成 U1，进入 U2
- **预期结果:** msgContent.1="Hey there 👋" / "嗨 there 👋"
- **测试数据:** first_name=null

**TC-PRD-TWIN-U2-004**: U2 msgContent.2 三条能力自述完整渲染（EN）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** locale=en, 完成 U1 进入 U2
- **操作步骤:** 1) 比对 msgContent.2 内容
- **预期结果:** 包含 "I am your AI Twin, Aria, here in your Workspace 24/7" + 三条以 "—" 开头的能力点：
  1) "Handle the everyday work around sourcing — open JDs, read résumés, organize candidate sheets, pull company background."
  2) "Search and surface talent for you — find candidates by role, skill, target company, location, or any criteria your client cares about."
  3) "Drive your browser through the Mira Extension — open LinkedIn / job-board profiles, capture info, send messages, leave a trail."
- **测试数据:** locale=en

**TC-PRD-TWIN-U2-005**: U2 msgContent.2 三条能力自述完整渲染（ZH）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** locale=zh
- **操作步骤:** 1) 比对 msgContent.2 中文
- **预期结果:** 包含 "我是你的 AI 分身 Aria，24/7 待在你的 Workspace 里" 及三条中文能力点
- **测试数据:** locale=zh

**TC-PRD-TWIN-U2-006**: U2 list 4 条训练建议 row 渲染
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 完成 U1 进入 U2
- **操作步骤:** 1) 观察 list 区
- **预期结果:** list 区有 4 条训练建议 row（complete 标记位于 list 之后）
- **测试数据:** list count=4

**TC-PRD-TWIN-U2-007**: U2 followUps 3 条典型任务渲染（EN）
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** locale=en, 完成 U1 进入 U2
- **操作步骤:** 1) 观察 followUps 区
- **预期结果:** 显示 3 条 followUps：
  1) "Write a weekly hiring market analysis report"
  2) "Parse attached resumes and extract candidates' core skills"
  3) "Find 5 senior frontend engineer candidates on LinkedIn"
- **测试数据:** locale=en

**TC-PRD-TWIN-U2-008**: U2 followUps 3 条典型任务渲染（ZH）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** locale=zh, 完成 U1 进入 U2
- **操作步骤:** 1) 观察 followUps 区
- **预期结果:** 显示 "写一份本周的招聘市场分析报告" / "解析附件中的简历，提取候选人的核心技能" / "在 LinkedIn 上帮我找 5 位资深前端工程师"
- **测试数据:** locale=zh

**TC-PRD-TWIN-U2-009**: 点击 followUps 任一条 - 文案写入输入框并自动发送
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** U2 已渲染 followUps 3 条
- **操作步骤:** 1) 点击 followUps[0] "Write a weekly hiring market analysis report" 2) 观察输入框与请求
- **预期结果:** 输入框内容=被点条目文案；自动触发发送（user 消息上屏）；URL 去掉 `?first_meet=true`；进入正常 task_creation → strategy_creation 流
- **测试数据:** click followUps[0]

**TC-PRD-TWIN-U2-010**: U2 直接输入并发送进入正常流
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** U2 已渲染
- **操作步骤:** 1) 在 inputArea 输入 "Help me prepare for a client meeting" 2) 发送
- **预期结果:** user 消息上屏，URL 去掉 `?first_meet=true`，进入 task 流；list 与 followUps 条目隐藏
- **测试数据:** user query

**TC-PRD-TWIN-U2-011**: profile_load_failure - U2 读不到 profile 兜底默认值
- **优先级:** P0
- **测试类型:** 错误猜测
- **前置条件:** U1 提交成功，但 U2 加载时 profile 读取失败
- **操作步骤:** 1) 等待 U2 渲染
- **预期结果:** aiHd 使用兜底 name="Aria"、avatar=preset_m1、personality=default；后台埋点 alert 触发
- **测试数据:** profile_load_failure

**TC-PRD-TWIN-U2-012**: greeting_render_lag > 1.5s 显示 ThinkingIndicator
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** mock greeting 渲染延迟 > 1.5s
- **操作步骤:** 1) 进入 U2 2) 观察 chatBody
- **预期结果:** 显示 Mira/ThinkingIndicator，文案 "{name} is preparing to meet you..." / "{name} 正在准备跟你打招呼..."；避免空白 chatBody
- **测试数据:** mock render lag=1700ms

**TC-PRD-TWIN-U2-013**: U2 刷新 - 打招呼消息不重发
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 已进入 U2 且 chatBody 已渲染招呼消息
- **操作步骤:** 1) 浏览器刷新
- **预期结果:** chatBody 历史消息保留（招呼快照）；URL `?first_meet=true` 失效；不再自动重发招呼
- **测试数据:** refresh U2

**TC-PRD-TWIN-U2-014**: U2 返回 U1 修改 name 后回 U2 - avatar/name 实时同步但 msgContent 不重生成
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** U2 已渲染（name="Aria"）
- **操作步骤:** 1) 退回 U1 mode=edit 2) 改 name 为 "Lumi" 保存 3) 回到 U2
- **预期结果:** 已渲染消息的 aiHd avatar/name 实时更新为新值；msgContent / list / followUps 文案保持首次招呼快照（不重新生成）
- **测试数据:** name: Aria → Lumi

**TC-PRD-TWIN-U2-015**: U2 inputArea placeholder 文案正确
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 完成 U1 进入 U2
- **操作步骤:** 1) 观察 inputArea placeholder
- **预期结果:** placeholder="Or just tell me what you want to do..."（en）/ "或者直接告诉我你想做什么..."（zh）
- **测试数据:** locale 切换

### REQ-004 · 后续对话稳定渲染分身头像 + 名字

**TC-PRD-TWIN-RENDER-001**: U6 Mira/Message/Assistant avatar+name 使用 twin_profile
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户 twin_name="Lumi", twin_avatar_source="custom"
- **操作步骤:** 1) 用户在 U6 发送 query 2) 等待 assistant 回复 3) 观察 Message/Assistant aiHd
- **预期结果:** aiHd avatar=user_twin_profile.twin_avatar_url；name="Lumi"，字体 Inter 14/600；horizontal gap 8
- **测试数据:** twin_name=Lumi, twin_avatar=custom

**TC-PRD-TWIN-RENDER-002**: Mira/Confirmation 卡片头像名字归属分身
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** Agent 触发 Confirmation 卡片（Make exception / Skip this one）
- **操作步骤:** 1) 触发任务到 Confirmation 节点 2) 观察卡片头部
- **预期结果:** Confirmation 卡片 aiHd 显示 twin avatar + twin name（不显示 "Mira"）
- **测试数据:** confirmation card

**TC-PRD-TWIN-RENDER-003**: Mira/Tool/Header 显示分身身份
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** Agent 调用 tool
- **操作步骤:** 1) 触发 tool 调用 2) 观察 Tool/Header
- **预期结果:** Tool/Header 左侧 avatar + name 使用分身身份
- **测试数据:** tool execution

**TC-PRD-TWIN-RENDER-004**: Mira/Reasoning 显示分身身份
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** Agent 进入 Reasoning 状态
- **操作步骤:** 1) 触发 Reasoning 2) 观察头部
- **预期结果:** Reasoning header 使用分身 avatar + name
- **测试数据:** reasoning state

**TC-PRD-TWIN-RENDER-005**: Mira/SuggestedFollowUps 头像名字归属分身
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** assistant 输出后附 SuggestedFollowUps
- **操作步骤:** 1) 观察 SuggestedFollowUps 卡片
- **预期结果:** 头像 + 名字使用 twin_profile（如有显示）
- **测试数据:** follow-ups

**TC-PRD-TWIN-RENDER-006**: Mira/TaskHeader U2 状态显示 "First meeting · {twin_name}"
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** twin_name="Lumi", 用户从 U1 提交进入 U2
- **操作步骤:** 1) 观察 TaskHeader
- **预期结果:** TaskHeader 文案="First meeting · Lumi"
- **测试数据:** state=U2 first_meet

**TC-PRD-TWIN-RENDER-007**: TaskHeader 进入任务后切换为任务标题
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** U2 提交首个 query
- **操作步骤:** 1) 提交 "Find 5 senior frontend engineers for client Acme" 2) 进入 task_creation
- **预期结果:** TaskHeader 从 "First meeting · Lumi" 切换为任务标题（如 "Founding ML Engineer · Acme"）
- **测试数据:** post-first-meet transition

**TC-PRD-TWIN-RENDER-008**: U6 inputArea placeholder 切换为 "Or keep asking {name}..."
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** twin_name="Lumi", 用户在 U6 任务执行态
- **操作步骤:** 1) 观察 inputArea placeholder
- **预期结果:** placeholder="Or keep asking Lumi..." / "或者继续问 Lumi..."
- **测试数据:** state=U6

**TC-PRD-TWIN-RENDER-009**: 历史 Task Record 老消息渲染层贴当前 twin_profile
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** V1 上线前已存在的老 Task Record，老消息原 "Mira" 身份；当前 user 已配置 twin_name="Lumi"
- **操作步骤:** 1) 打开老任务历史 2) 观察 assistant 老消息 aiHd
- **预期结果:** 老消息 aiHd avatar/name 替换为当前 twin_profile（不保留旧 Mira 兜底文字）；消息正文（msgContent）不动
- **测试数据:** legacy task record

**TC-PRD-TWIN-RENDER-010**: avatar_url_404 自动回退 preset_m1
- **优先级:** P0
- **测试类型:** 错误猜测
- **前置条件:** profile.twin_avatar_url 指向被误删的 R2 资源（返回 404）
- **操作步骤:** 1) 加载 U6 assistant 消息
- **预期结果:** image 加载失败时自动回退 preset_m1，不向用户暴露错误
- **测试数据:** mock 404 avatar

**TC-PRD-TWIN-RENDER-011**: name_field_corrupt 数据库读到 null 回退 "Aria"
- **优先级:** P0
- **测试类型:** 错误猜测
- **前置条件:** profile.twin_name 数据库异常返回 null
- **操作步骤:** 1) 加载任意 assistant 消息
- **预期结果:** name 槽位显示 "Aria"（默认兜底）
- **测试数据:** db null name

**TC-PRD-TWIN-RENDER-012**: 修改 profile 后 - 已渲染消息保持快照、新消息使用新身份
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户在 U6 已收到 2 条 assistant 消息（name="Aria"）
- **操作步骤:** 1) 通过 U9.2 进 U1 edit 2) 改 name 为 "Lumi" Save 3) 回到 U6 4) 继续发送一条新 user 消息 5) 等待 assistant 新消息
- **预期结果:** 已渲染的 2 条 assistant 消息 aiHd avatar/name 实时同步为 Lumi（V1 PRD §REQ-005 异常处理边界 "用户在对话进行中修改分身 - 已渲染消息保持当时快照；新消息使用新身份" 与 REQ-004 渲染规则"老 Task Record 同样按当前 twin_profile 渲染"对齐：前端渲染层一律读取当前 profile）；新消息使用新身份
- **测试数据:** edit profile during conversation

**TC-PRD-TWIN-RENDER-013**: 系统级公告 "Mira Support" 不被分身覆盖
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 系统下发一条公告/客服消息
- **操作步骤:** 1) 用户接收系统公告 2) 观察头部
- **预期结果:** 系统公告 aiHd 固定显示 name="Mira Support" + Mira 平台 logo（不使用分身身份），不与分身消息混淆
- **测试数据:** system announcement

**TC-PRD-TWIN-RENDER-014**: 默认 Mira logo 头像渲染为圆角矩形（与 preset 圆形 pill 形态对比）
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户未自定义头像（保留出厂 Mira logo 作为头像）
- **操作步骤:** 1) 观察 assistant 消息 aiHd
- **预期结果:** Mira logo 头像形态为**圆角矩形**；preset m1~m6 头像形态为**圆形 pill**；二者形态有视觉区分
- **测试数据:** default Mira logo

**TC-PRD-TWIN-RENDER-015**: Paused 状态 aPaused 徽标不被分身身份替换
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Agent 进入 Paused 状态等待用户确认
- **操作步骤:** 1) 观察 aPaused 徽标
- **预期结果:** 徽标固定 "Paused · Awaiting your confirmation" + stale 配色，不参与分身身份替换
- **测试数据:** paused state

### REQ-005 · U9.2 用户菜单弹层 AI Twin section

**TC-PRD-TWIN-MENU-001**: sidebarUser 弹层顶部 AI Twin section 渲染
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已配置 profile (twin_name="Lumi", avatar=custom)
- **操作步骤:** 1) 在任意页面点击侧边栏底部 sidebarUser 2) 等待 popover 展开
- **预期结果:** popover 280 宽 / radius-lg / shadow；顶部 section title="AI Twin"（Inter 10/600，letterSpacing 1，muted-foreground）；twinRow（secondary bg / radius-md / padding 8 / border）包含左侧 avatar 28px + name "Lumi"（Noto Serif SC 13/600）+ 右侧 settings 图标按钮
- **测试数据:** twin_name=Lumi

**TC-PRD-TWIN-MENU-002**: 点击 settings 图标跳 `/ai-twin/create?mode=edit`
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** sidebarUser 弹层已展开
- **操作步骤:** 1) 点击 twinRow 右侧 settings 图标
- **预期结果:** 路由跳转 `/ai-twin/create?mode=edit`；U1 加载 edit 模式（hero/CTA 按 mode=edit 文案矩阵渲染）
- **测试数据:** click settings icon

**TC-PRD-TWIN-MENU-003**: 点击整行 twinRow 也触发 edit
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** sidebarUser 弹层已展开
- **操作步骤:** 1) 点击 twinRow 行内空白区域（非 settings 图标）
- **预期结果:** 同样跳转 `/ai-twin/create?mode=edit`
- **测试数据:** click twinRow

**TC-PRD-TWIN-MENU-004**: 主弹层 3 项 chevron - Settings / Language / Theme
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** sidebarUser 弹层已展开
- **操作步骤:** 1) 观察主弹层 menu items
- **预期结果:** 主弹层共 3 个 chevron-right 行：
  1) mSetting (icon `settings`, label "Settings")
  2) mLang (icon `languages`, label "Language")
  3) mTheme (icon `sun`, label "Theme")
  每行 padding [8,10], radius-sm, 字体 Inter 13/normal
- **测试数据:** menu items count=3

**TC-PRD-TWIN-MENU-005**: hover mSetting 展开 settingsSubPop 子弹层
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** sidebarUser 弹层已展开
- **操作步骤:** 1) 鼠标 hover mSetting 行 2) 等待 200~300ms
- **预期结果:** 右侧出现 settingsSubPop（宽 220，radius-lg / shadow），包含 3 项：
  1) subSkill (icon `sparkles`, label "Skills")
  2) subConn (icon `unplug`, label "Connectors")
  3) subChrome (icon `globe` + 右侧 `square-arrow-out-up-right`, label "Chrome Extension")
- **测试数据:** hover mSetting

**TC-PRD-TWIN-MENU-006**: click mSetting 也能展开 settingsSubPop
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** sidebarUser 弹层已展开
- **操作步骤:** 1) 直接点击 mSetting 行（非 hover）
- **预期结果:** settingsSubPop 展开，与 hover 行为一致
- **测试数据:** click mSetting

**TC-PRD-TWIN-MENU-007**: subChrome 点击新标签打开 Chrome Web Store
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** settingsSubPop 已展开
- **操作步骤:** 1) 点击 subChrome
- **预期结果:** 浏览器新开 tab，url 指向 Chrome Web Store 扩展页
- **测试数据:** click subChrome

**TC-PRD-TWIN-MENU-008**: subSkill / subConn 跳转既有 Skills / Connectors 页
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** settingsSubPop 已展开
- **操作步骤:** 1) 分别点 subSkill 与 subConn
- **预期结果:** 各自跳转 Skills 设置页 / Connectors 设置页（既有路由）
- **测试数据:** click subSkill / subConn

**TC-PRD-TWIN-MENU-009**: 鼠标离开 mSetting 子弹层及时收起
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** settingsSubPop 已通过 hover 展开
- **操作步骤:** 1) 鼠标移出 mSetting 与 settingsSubPop 共同覆盖区域 2) 等待 300~500ms
- **预期结果:** settingsSubPop 自动收起；不出现卡住或闪烁
- **测试数据:** hover-out

**TC-PRD-TWIN-MENU-010**: footer items - Docs / Blog / Sign out 行为
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** sidebarUser 弹层已展开
- **操作步骤:** 1) 观察 footer 3 项 2) 分别点击 Docs / Blog / Sign out
- **预期结果:** mDocs (icon book-open + 外链) 新标签打开文档；mBlog (icon newspaper + 外链) 新标签打开博客；m6 (icon log-out, label "Sign out") 触发登出
- **测试数据:** click footer items

**TC-PRD-TWIN-MENU-011**: 点击弹层外区域关闭主弹层和子弹层
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** sidebarUser 弹层 + settingsSubPop 同时展开
- **操作步骤:** 1) 点击弹层外的空白页面区域
- **预期结果:** 主弹层 + 子弹层均关闭
- **测试数据:** click outside

**TC-PRD-TWIN-MENU-012**: edit 保存成功后跳回触发页（非 U2）
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户从 U6 → sidebarUser → settings 图标进入 U1 edit
- **操作步骤:** 1) 修改 name 后 Save changes
- **预期结果:** 跳回 U6（触发页），不是跳回 U2；显示 toast="Twin updated" / "分身已更新"
- **测试数据:** referrer=U6

**TC-PRD-TWIN-MENU-013**: profile_unset 兜底 - 显示 "Set up your Twin" CTA
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 老用户 profile 缺失（理论上 REQ-002 强制不会出现，但服务端容错）
- **操作步骤:** 1) 打开 sidebarUser 弹层
- **预期结果:** twinRow 区域显示 "Set up your Twin" CTA；点击跳 U1（mode=migration / onboarding）
- **测试数据:** profile=null

**TC-PRD-TWIN-MENU-014**: avatar_image_404 弹层内回退 preset_m1
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** profile.twin_avatar_url 返回 404
- **操作步骤:** 1) 打开弹层
- **预期结果:** twinRow 头像回退 preset_m1，不影响弹层其他 item 渲染
- **测试数据:** 404 avatar in menu

### REQ-006 · sourcing_agent system prompt 注入与缓存（后端可观测）

> 说明：REQ-006 属于工程实现 REQ，无前端 UI 表现。以下用例需要**后端日志观测**（`prompt_cache_read_input_tokens` / `cache_creation_input_tokens` / `segment1_hit_rate` / `segment2_hit_rate`）支持；标记为 P1/P2 优先级，低于纯 UI REQ。

**TC-PRD-TWIN-SYS-001**: System prompt 由 2 个 text block 组成且各打 cache_control
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 用户已配置 profile；后端日志可观测
- **操作步骤:** 1) 用户在 U6 触发任意一次 sourcing_agent 调用 2) 抓取 Anthropic Messages API 请求 body
- **预期结果:** request.system 数组长度=2；index 0 为 PLATFORM_SOURCING_PROMPT（带 cache_control: {type:"ephemeral"}）；index 1 为 buildTwinSegment(profile)（带 cache_control: {type:"ephemeral"}）；段序固定（身份 → personality）
- **测试数据:** 抓取 LLM 请求 body（需要后端日志观测）

**TC-PRD-TWIN-SYS-002**: default personality 时 Segment 2 不含 tone 行
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** twin_personality="default"
- **操作步骤:** 1) 触发 LLM 调用 2) 读 system[1].text
- **预期结果:** Segment 2 文本=身份段 ("Your name in this conversation is {twin_name}. You are the user's own AI Twin on Mira. Do not refer to yourself as ...")；**不**包含 "When responding, lean toward a ... tone." 行
- **测试数据:** personality=default（需要后端日志观测）

**TC-PRD-TWIN-SYS-003**: 非 default personality 时 Segment 2 末尾追加 tone 行
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** twin_personality ∈ {professional, friendly, concise}
- **操作步骤:** 1) 触发 LLM 调用 2) 读 system[1].text
- **预期结果:** Segment 2 文本末尾包含 ` When responding, lean toward a {personality} tone.`（personality 与 profile 一致）
- **测试数据:** personality=professional|friendly|concise（需要后端日志观测）

**TC-PRD-TWIN-SYS-004**: 工具描述不掺 twin_name
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** profile 已配置
- **操作步骤:** 1) 抓取 Anthropic 请求 body 2) 检查 tools 数组
- **预期结果:** tools 段始终为平台级，**不**含 twin_name / personality 等 per-user 字段
- **测试数据:** （需要后端日志观测）

**TC-PRD-TWIN-SYS-005**: 同用户连续 5 轮对话 Segment 1 + Segment 2 命中
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户已配置 profile；5 分钟内连续对话
- **操作步骤:** 1) 第 1 轮触发（cache miss build）2) 第 2~5 轮连续触发
- **预期结果:** 第 2~5 轮日志：cache_read_input_tokens > 0；segment1_hit_rate=100%；segment2_hit_rate=100%
- **测试数据:** consecutive 5 turns（需要后端日志观测）

**TC-PRD-TWIN-SYS-006**: 不同用户并发对话 Segment 1 共享缓存
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 2~3 个不同 user 同时触发 sourcing_agent
- **操作步骤:** 1) 并发 3 个不同 user_id 的对话 2) 抓取日志
- **预期结果:** 所有用户的 Segment 1 共享同一 cache entry（命中率高）；Segment 2 各自独立（不同 entry，但本用户后续可命中自己的 Segment 2）
- **测试数据:** 3 users 并发（需要后端日志观测）

**TC-PRD-TWIN-SYS-007**: U1 edit 提交后 LRU 失效 - 下一轮 Segment 2 miss 再下一轮命中
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户已对话过 N 轮，Segment 2 命中稳定
- **操作步骤:** 1) U9.2 进 U1 edit 2) 改 personality 为 "friendly" Save 3) 立刻在 U6 发送下一轮 query（轮次 N+1）4) 再发送 1 轮（轮次 N+2）
- **预期结果:** N+1 轮：LRU miss → 重新查库 + 重建 Segment 2 → Anthropic 端 Segment 2 cache miss + 新建缓存；N+2 轮：Segment 2 cache hit
- **测试数据:** edit personality（需要后端日志观测）

**TC-PRD-TWIN-SYS-008**: 同用户 5 分钟无操作后回来 全部 miss 重建
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 用户已对话过且 Anthropic ephemeral cache TTL 5 分钟
- **操作步骤:** 1) 用户暂停操作 > 5 分钟 2) 再发送一轮 query
- **预期结果:** Segment 1 和 Segment 2 均 cache miss → 重建；下一轮命中
- **测试数据:** idle > 5min（需要后端日志观测）

**TC-PRD-TWIN-SYS-009**: 部署更新 PLATFORM_SOURCING_PROMPT - 全员 cache miss
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** 部署一次包含 PLATFORM_SOURCING_PROMPT 变更的 release
- **操作步骤:** 1) 部署后立即用 N 个用户各触发一次 query
- **预期结果:** Segment 1 全员 miss（前缀变了）；连带 Segment 2 也 miss；下一轮起命中
- **测试数据:** prompt change release（需要后端日志观测）

**TC-PRD-TWIN-SYS-010**: profile session 启动一次性加载 + LRU TTL 30 分钟
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** session 启动
- **操作步骤:** 1) 启动 session 时观察一次 `SELECT * FROM user_twin_profile` 2) 连续 30 分钟内多次 LLM 调用 3) 等待 30min01s 后再调用
- **预期结果:** session 启动只查库 1 次（profile 挂 session + LRU）；30 分钟内不再查库；30 分钟后 LRU 过期，下一轮调用触发重新查库 1 次
- **测试数据:** TTL boundary（需要后端日志观测）

**TC-PRD-TWIN-SYS-011**: 禁止每次 LLM 调用前查库 - 性能反模式守卫
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户已对话过
- **操作步骤:** 1) 监控 30 分钟内连续 10 轮 LLM 调用对应的数据库 query 数 2) 检查 user_twin_profile 表查询次数
- **预期结果:** 30 分钟内仅 1 次 SELECT user_twin_profile（session 启动）；10 轮 LLM 调用均使用 session/LRU 缓存
- **测试数据:** DB query count（需要后端日志观测）

**TC-PRD-TWIN-SYS-012**: profile_load_db_timeout 500ms 降级 default profile
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** mock 数据库 query 延迟 > 500ms
- **操作步骤:** 1) session 启动加载 profile 2) 观察日志
- **预期结果:** 500ms 超时 → fallback 使用 default profile（name="Aria"，avatar=preset_m1，personality=default）；告警日志触发
- **测试数据:** db_timeout=600ms

**TC-PRD-TWIN-SYS-013**: prompt_cache_hit_rate 监控告警 - segment1_hit_rate < 90% 24h 触发 warn
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 监控系统接入 segment1_hit_rate 7 日滚动窗口
- **操作步骤:** 1) mock 24h 内 segment1_hit_rate 平均 88% 2) 观察告警
- **预期结果:** 触发 warn 告警；提示排查 PLATFORM_SOURCING_PROMPT / tools 顺序 / model 参数变更
- **测试数据:** segment1_hit_rate=88%

**TC-PRD-TWIN-SYS-014**: profile_lru_miss_on_request 连续 > 5 次 warn 告警
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 同一 user_id 连续 5 次以上请求 LRU miss
- **操作步骤:** 1) mock LRU 容量极小或失效事件过于激进 2) 同用户连续 6 次发起请求
- **预期结果:** 触发 profile_lru_miss_on_request warn 告警
- **测试数据:** LRU 反复 miss

**TC-PRD-TWIN-SYS-015**: 多 tab 并发同 user_id - 一个 tab 改 profile 其他 tab 失效
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** 同 user 开 2 个浏览器 tab
- **操作步骤:** 1) Tab A 进 U1 edit 改 personality 为 "concise" 保存 2) Tab B 立刻发送 query
- **预期结果:** LRU 失效事件广播给所有 session；Tab B 下一轮 LLM 调用 Segment 2 miss → 重建（含新 personality tone 行）
- **测试数据:** multi-tab broadcast（需要后端日志观测）

---

## 用例统计

| 模块 | 用例数 | 优先级分布 |
|------|--------|------------|
| REQ-001 TWIN-FORM | 19 | P0: 6 / P1: 11 / P2: 2 |
| REQ-002 TWIN-MODE | 18 | P0: 7 / P1: 8 / P2: 3 |
| REQ-003 TWIN-U2 | 15 | P0: 5 / P1: 9 / P2: 1 |
| REQ-004 TWIN-RENDER | 15 | P0: 6 / P1: 5 / P2: 4 |
| REQ-005 TWIN-MENU | 14 | P0: 4 / P1: 7 / P2: 3 |
| REQ-006 TWIN-SYS | 15 | P1: 9 / P2: 6 |
| **合计** | **96** | **P0: 28 (29%) / P1: 49 (51%) / P2: 19 (20%)** |

> 比例符合 P0 15-30% / P1 40-50% / P2 25-35% 的指导值；P0 偏向核心 happy path + 强校验 + 身份一致性 + 路由分流。
