# Test Cases · task-completed · share-dialog area

> Source: CDP exploration (area = share-dialog)
> Component: TaskShareDialog (`features/task/components/task-share-dialog.tsx`) — has TWO states:
>   State A: 未创建分享 → "创建分享链接" 按钮（chatbot.createShareLink）
>   State B: 已创建分享 → 显示 share URL + "复制链接" + "移除分享" 按钮
> Note: existing share-branch.test.ts covers /share/{taskId}?token=... public page; this spec only
>       targets the dialog UI on /task/{taskId} (not the public share page).
> Generated: 2026-04-28
> Fixture: shareUrl (already creates a share so dialog comes up in State B; if not used, taskWithCodeUrl + UI flow covers State A)

## Method 1: Equivalence Partitioning

| 等价类 | 描述 |
|--------|------|
| 有效类 1 | 点击 share2 按钮 → dialog 打开（任意状态） |
| 有效类 2 | State A: createShareLink 按钮可点击 → 进入 State B |
| 有效类 3 | State B: 含 share URL + copyLink + removeShare |
| 无效类 N/A | 未登录 → 按钮不可见（layer 已处理） |

## Method 2: Boundary Value Analysis

| 边界 | 描述 |
|------|------|
| URL 是否含 /share/ + token | TC-CDP-SHARE-002 |
| copyLink 点击后 isCopied 状态切换为 "已复制 / Copied"（短暂） | TC-CDP-SHARE-003 |
| removeShare 后 dialog 退回 State A | TC-CDP-SHARE-005 @failing（destructive） |

## Method 3: Cause-Effect Graph

| 因 | 果 |
|----|----|
| 完成态任务详情 + 点击 lucide-share2 | dialog role=dialog 打开，title=chatbot.shareChat |
| dialog 打开 + 当前无 active share | 显示 createShareLink 按钮（State A） |
| dialog 打开 + 当前有 active share | 显示 shareUrl + copyLink + removeShare（State B） |
| 点击 copyLink | navigator.clipboard 写入 URL；按钮短暂显示 chatbot.copied |
| 点击 removeShare | DELETE 后端 + dialog 退回 State A |
| 点击 Close 按钮 | dialog 关闭 |

## Method 4: State Transition Testing

S0(浏览) ──share2 click──▶ S2-A(no share) ──createShareLink──▶ S2-B(active)
                                            ▲
                                            │ removeShare (destructive)
                                            │
                          S0  ◀──Close──── S2-(any)

- TC-CDP-SHARE-001: S0 → S2 转换
- TC-CDP-SHARE-004: S2 → S0 转换（Close）
- TC-CDP-SHARE-005: S2-B → S2-A（destructive, @failing）

## Method 5: Scenario Method

场景 1：用户希望复制公共分享链接发给同事
- 步骤：fixture 已生成 shareUrl → 进入 task 详情页 → 点击 share2 → dialog 应已是 State B（含 URL）→ 点击 复制链接 → 验证剪贴板含 URL
- 覆盖：TC-CDP-SHARE-003

场景 2：用户首次给一个新建任务创建分享
- 步骤：建立一个新任务（taskWithCodeUrl 来源）→ 点击 share2 → dialog 是 State A → 点击"创建分享链接"→ 应进入 State B → 含 shareUrl
- 在 fixture 复用 shareUrl 的前提下，State A 在测试集中难以保证。本期 SHARE-002 通过"打开 dialog 并确认存在 URL"统一覆盖（不区分 State A/B 入口）

## Method 6: Error Guessing

- 剪贴板权限被拒绝时 → useCopyToClipboard 应抛错 + capture 事件失败。N/A（permission 注入需要 context init）。
- 双击 createShareLink → 应当有防重复（isCreating 状态）。N/A（速度难以稳定测）。

## Merged Test Case List

**TC-CDP-SHARE-001**: 点击 share2 按钮打开"分享会话"对话框 [smoke]
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 已登录 + fixture shareUrl 已成功创建（保证当前 task 处于完成态）。也可使用 taskWithCodeUrl，与 share-branch.test.ts 互不重叠。
- **操作步骤:** 1) 进入任务详情页（从 shareUrl 反推 taskId 或直接使用 taskWithCodeUrl）；2) 等待 chatbot.completed 标识；3) 点击 button:has(svg.lucide-share2)；4) 等待 [role='dialog'] 可见
- **预期结果:** dialog 打开；标题文本与 chatbot.shareChat 一致（"分享会话" / "Share chat" / "Partager la conversation"）。
- **测试数据:** 无

**TC-CDP-SHARE-002**: dialog 含 share URL（State B）或 createShareLink 按钮（State A）
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 同 001
- **操作步骤:** 1) 打开分享对话框；2) 检查 dialog 中是否存在 chatbot.copyLink 按钮；3) 若存在 → State B：dialog 中应展示一段 https://.../share/.../?token=... 文本；4) 若不存在 → State A：dialog 中应展示 chatbot.createShareLink 按钮，点击进入 State B 后再做 step 3
- **预期结果:** dialog 最终展示一段含 /share/ 与 token= 的 URL。
- **测试数据:** 无

**TC-CDP-SHARE-003**: 点击"复制链接"将 URL 写入剪贴板，按钮显示 Copied
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 同 001 + dialog 处于 State B（fixture shareUrl 已有 active share）
- **操作步骤:** 1) 打开分享对话框；2) 读取 dialog 中 share URL 文本 expectedUrl；3) 点击 chatbot.copyLink 按钮；4) page.evaluate 读取 navigator.clipboard.readText()；5) 等待按钮文本 / aria 显示 chatbot.copied
- **预期结果:** clipboard 文本等于 expectedUrl；按钮在短时间内显示 chatbot.copied（"已复制" / "Copied" / "Copié"）。
- **测试数据:** 动态读取 expectedUrl
- **附注:** 浏览器需要授予 clipboard 权限。Playwright 通过 context.grantPermissions(["clipboard-read", "clipboard-write"]) 注入。

**TC-CDP-SHARE-004**: 点击 Close 关闭 dialog
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** 同 001
- **操作步骤:** 1) 打开分享对话框；2) 点击 dialog 内 aria-label="Close" 按钮（或 svg.lucide-x）；3) 等待 dialog 隐藏
- **预期结果:** dialog role=dialog 不再可见。
- **测试数据:** 无

**TC-CDP-SHARE-005**: 点击"移除分享" → 链接失效，dialog 退回 State A（destructive）
- **优先级:** P3
- **测试类型:** 状态迁移
- **前置条件:** 同 001 + dialog 处于 State B
- **操作步骤:** 1) 打开分享对话框；2) 验证 chatbot.copyLink 按钮可见；3) 点击 chatbot.removeShare 按钮；4) 等待 chatbot.removing → 完成；5) 验证 dialog 现在显示 chatbot.createShareLink（State A）；teardown：再次点击 chatbot.createShareLink 重新创建 share，避免影响后续 share-branch 测试
- **预期结果:** removeShare 完成后，dialog 退回 State A；createShareLink 按钮重新可见。
- **测试数据:** 无
- **标签:** @failing（destructive，会破坏 fixture shareUrl 的有效性，默认跳过；teardown 仅尽力恢复）
