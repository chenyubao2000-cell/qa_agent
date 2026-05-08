# Test Cases · task-completed · message-copy area

> Source: CDP exploration (area = message-copy)
> Component: MessageItem → MessageActions (only on user messages, not AI messages)
> Source: `features/task/components/message-item.tsx` lines 280-291
> Note: 复制按钮通过 hover (md+) 显隐：md:opacity-0, md:group-hover:opacity-100; 移动端始终可见
> Generated: 2026-04-28
> Fixture: taskWithToolChainUrl

## Method 1: Equivalence Partitioning

| 等价类 | 描述 |
|--------|------|
| 有效类 1 | user message 上有 lucide-copy 按钮（hover 后可见） |
| 有效类 2 | 点击复制 → 剪贴板含 user 消息文本 |
| 无效类 1 | AI message 上 **没有** 复制按钮 — 通过 message-item.tsx else 分支验证 |

## Method 2: Boundary Value Analysis

N/A — 单按钮无数量边界。

## Method 3: Cause-Effect Graph

| 因 | 果 |
|----|----|
| user message 渲染 + md+ + hover | copy button opacity:1 |
| 点击 copy | useCopyToClipboard.copy(text) → clipboard 写入；isCopied 短暂 true → 图标切换到 Check |

## Method 4: State Transition Testing

N/A — 简单的"点击 → clipboard 副作用"，无明显状态机。

## Method 5: Scenario Method

场景：用户想再次发送相似的 prompt，先复制旧 user message
- 步骤：进入完成态任务 → hover 第一条 user message → 点击 复制 → 验证 clipboard 文本与 message 内容一致
- 覆盖：TC-CDP-MSGCOPY-002

## Method 6: Error Guessing

- 同一段消息含富文本/换行/表情 → clipboard 应保留完整字符串。组件直接使用 cleanTextContent，理论上保留。
- AI message 上是否也有复制按钮？源码 `else` 分支 (message.role !== "user") **未渲染** MessageActions。TC-CDP-MSGCOPY-003 验证此 negative 行为。

## Merged Test Case List

**TC-CDP-MSGCOPY-001**: user message 上 hover 后显示 lucide-copy 复制按钮 [smoke]
- **优先级:** P3
- **测试类型:** 等价类划分
- **前置条件:** 已登录 + 通过 fixture taskWithToolChainUrl 进入完成态任务（含 ≥1 条 user message）
- **操作步骤:** 1) 进入任务详情页；2) 等待 [role='log'] .is-user 至少 1 条可见；3) hover 第一条 user message；4) 验证该 message 内 button:has(svg.lucide-copy) 可见
- **预期结果:** hover 后复制按钮可见（aria-label 或 tooltip 与 chatbot.copy 一致）。
- **测试数据:** 无

**TC-CDP-MSGCOPY-002**: 点击复制按钮将 user message 文本写入剪贴板
- **优先级:** P3
- **测试类型:** 场景法
- **前置条件:** 同 001
- **操作步骤:** 1) 进入任务详情页；2) 等待 user message 可见；3) 读取第一条 user message 的文本 expectedText；4) hover + 点击该 message 上的 copy button；5) 通过 page.evaluate 读 navigator.clipboard.readText()
- **预期结果:** clipboard 文本与 expectedText 完全相等（已 trim）。
- **测试数据:** 动态读取 expectedText

**TC-CDP-MSGCOPY-003**: AI assistant message 上不渲染复制按钮（regression / negative）
- **优先级:** P3
- **测试类型:** 错误猜测
- **前置条件:** 同 001 + AI 已产出至少 1 条 assistant message（is-assistant）
- **操作步骤:** 1) 进入任务详情页；2) 等待 [role='log'] :not(.is-user) 至少 1 条；3) 取第一条 assistant message；4) 在该 message 容器内查找 button:has(svg.lucide-copy)
- **预期结果:** assistant message 内不存在 lucide-copy 按钮（locator.count() === 0）。
- **测试数据:** 无
