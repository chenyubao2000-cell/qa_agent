# Test Cases · task-completed · rename-inline area

> Source: CDP exploration (area = rename-inline)
> Component: TaskHeader → pen-line button → RenameTaskDialog (`features/task/components/rename-task-dialog.tsx`)
> Note: CDP baseline labelled this "inline edit", but **source code reveals it opens a Dialog** (`<RenameTaskDialog>`).
>       Test cases are written against the actual Dialog behavior. The "save" path is destructive
>       (writes title via PATCH /api/task) — covered with @failing tag, see TC-004.
> Generated: 2026-04-28
> Fixture: taskWithToolChainUrl

## Method 1: Equivalence Partitioning

| 等价类 | 描述 |
|--------|------|
| 有效类 1 | task title 默认隐藏 pen-line 按钮（md+ hover 才显示），mobile 端始终可见 |
| 有效类 2 | 点击 pen-line → Dialog 打开，input 预填当前 title |
| 无效类 1 | input 为空 / 仅空白时 Save 按钮禁用 |

## Method 2: Boundary Value Analysis

| 边界 | 描述 |
|------|------|
| input 为空 | TC-CDP-RENAME-003（cancel 不写后端） |
| input = 当前 title | Save 按钮可点击，但提交后 dialog 仍关闭（无效改名 - 由后端处理） |
| input = 新 title | TC-CDP-RENAME-004（destructive，@failing） |

## Method 3: Cause-Effect Graph

| 因 | 果 |
|----|----|
| 鼠标 hover task title (md+) | pen-line 按钮可见 |
| 点击 pen-line | Dialog 打开 + input 预填 + autofocus |
| input.trim() === "" | Save 按钮禁用 |
| input.trim() !== "" + 点击 Save | PATCH /api/task → dialog 关闭 → 顶栏 + sidebar 标题更新 |
| 点击 Cancel / Esc / outside | Dialog 关闭，title 不变 |

## Method 4: State Transition Testing

S0(浏览) ──pen-line click──▶ S1(rename dialog open) ──Cancel/Esc──▶ S0
                                                  └──Save (valid)──▶ S0'(title updated, written to backend)

- 状态：S0 浏览态 / S1 rename dialog
- 转换 1：S0 → S1（点击 pen-line）：TC-CDP-RENAME-002
- 转换 2：S1 → S0（取消）：TC-CDP-RENAME-003
- 转换 3：S1 → S0'（保存）：TC-CDP-RENAME-004 @failing（destructive）

## Method 5: Scenario Method

场景：用户为已完成的任务取一个更具描述性的名称
- 步骤：进入任务详情页 → hover title → pen-line 出现 → 点击 → 输入新 title → Save → 验证 sidebar/topbar 更新
- 覆盖：TC-CDP-RENAME-004 @failing（destructive，需 teardown 恢复 title）

## Method 6: Error Guessing

- 输入超长 title（> maxLength）→ 应当被拦截或截断。组件层处理，e2e 跳过（依赖后端校验细节）。
- 网络中断时 Save → toast 错误。本期 N/A（不稳定）。

## Merged Test Case List

**TC-CDP-RENAME-001**: 浏览态下 pen-line 按钮通过 hover 显示（md+ 屏幕） [smoke]
- **优先级:** P2
- **测试类型:** 等价类划分
- **前置条件:** 已登录 + 通过 fixture taskWithToolChainUrl 进入一个完成态任务详情页
- **操作步骤:** 1) 进入任务详情页；2) 等待 task title 可见；3) hover task title 容器；4) 验证容器内 button:has(svg.lucide-pen-line) 出现
- **预期结果:** pen-line 按钮在 hover 后可见。
- **测试数据:** 无

**TC-CDP-RENAME-002**: 点击 pen-line 打开 RenameTaskDialog 且 input 预填当前 title
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 同 001
- **操作步骤:** 1) 进入任务详情页；2) hover title；3) 点击 pen-line 按钮；4) 等待 [role='dialog'] 可见；5) 读取 dialog 内 input 的 value
- **预期结果:** Dialog 打开（标题为 chatbot.editTitle = "编辑标题" / "Edit Title" / "Modifier le titre"）；input.value 等于当前 task title。
- **测试数据:** 无

**TC-CDP-RENAME-003**: 点击 Cancel / 按 Esc 关闭 dialog 且不写后端
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 同 001
- **操作步骤:** 1) 打开 RenameTaskDialog；2) 在 input 中追加 " - draft"；3) 点击 Cancel 按钮（chatbot.cancel）；4) 等待 dialog 关闭；5) 重新读取 topbar title
- **预期结果:** Dialog 关闭；topbar title 与编辑前一致（未发生改名）。
- **测试数据:** input 后缀 " - draft"

**TC-CDP-RENAME-004**: 输入新 title + Save → 顶栏 + sidebar 都更新（destructive，包含 teardown 恢复）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 同 001
- **操作步骤:** 1) 进入任务详情；2) 记录原 title = oldTitle；3) 打开 RenameTaskDialog；4) 清空 input 并填入 `Renamed-${Date.now()}`；5) 点击 Save；6) 等待 dialog 关闭；7) 验证 topbar 显示新 title；8) 验证 sidebar 中对应 task 项也显示新 title；teardown：再次打开 RenameTaskDialog 把 title 改回 oldTitle
- **预期结果:** Dialog 关闭后，topbar + sidebar 均显示新 title。teardown 后恢复原值。
- **测试数据:** newTitle = `Renamed-${Date.now()}`
- **标签:** @failing（destructive，写后端，未稳定时跳过）
