<!-- PRD-hash: connector-list-s1s2s3 | PRD-module: S1 Connectors列表 + S2详情 + S3 Add Menu | feature-slug: connector-list -->

# Connector 列表与详情页测试用例 (PRD)

> 来源：connector_0409-fancy.pen — S1/S2/S3
> Tags: @prd @connector-list

---

## Method 1: Equivalence Partitioning

### Connector Switch 状态等价类

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|----------|-----|----------|-----|
| Connector 级别 Switch | ON（已启用） | V1 | — | — |
| | OFF（已禁用） | V2 | — | — |
| 工具级别 Switch | ON（单工具启用） | V3 | — | — |
| | OFF（单工具禁用） | V4 | — | — |
| Connector 级别关闭时工具状态 | 所有工具联动关闭 | V5 | — | — |

**TC-PRD-CL-001**: Connector 列表显示 5 个 connector 及其基本信息
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录，通过侧边栏用户菜单进入 Connectors 页面
- **操作步骤:** 1. 点击侧边栏用户菜单 2. 点击 Connectors 菜单项 3. 观察页面内容
- **预期结果:** 显示面包屑"Connectors"，列表包含 5 个 connector 行，每行显示图标、名称、描述、工具数和 Switch 开关
- **测试数据:** 5 个 connector: CI CTS(5 tools), CI CRM(4 tools), CI AI-Calling(3 tools), DingTalk(4 tools), CI Mail(4 tools)

**TC-PRD-CL-002**: 启用状态的 Connector Switch 显示 ON
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户在 Connectors 列表页，connector 为启用状态
- **操作步骤:** 1. 观察 connector 行的 Switch 开关状态
- **预期结果:** Switch 显示为 ON 状态（V1）
- **测试数据:** V1

**TC-PRD-CL-003**: 禁用 Connector Switch 后该行显示灰色禁用样式
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户在 Connectors 列表页，connector 为启用状态
- **操作步骤:** 1. 点击某个 connector 的 Switch 开关使其变为 OFF
- **预期结果:** 该 connector 行显示灰色禁用样式，Switch 变为 OFF（V2）
- **测试数据:** V2

---

## Method 2: Boundary Value Analysis

### Connector 工具数量边界

**TC-PRD-CL-004**: 工具数为 3（最少）的 connector 正确显示
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 用户在 Connectors 列表页
- **操作步骤:** 1. 找到 CI AI-Calling connector 行 2. 检查工具数显示
- **预期结果:** 显示 "3 tools"

**TC-PRD-CL-005**: 工具数为 5（最多）的 connector 正确显示
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 用户在 Connectors 列表页
- **操作步骤:** 1. 找到 CI CTS connector 行 2. 检查工具数显示
- **预期结果:** 显示 "5 tools"

---

## Method 3: Cause-Effect Graph / Decision Table

### S2 详情页 — Connector Switch 与 Tool Switch 联动

因素：C1=Connector级别Switch ON, C2=单个工具Switch ON
效果：E1=工具可用, E2=工具不可用, E3=所有工具联动关闭

| 规则 | C1 (Connector ON) | C2 (Tool ON) | E1 (工具可用) | E2 (工具不可用) | E3 (联动关闭) |
|------|:--:|:--:|:--:|:--:|:--:|
| R1 | Y | Y | Y | N | N |
| R2 | Y | N | N | Y | N |
| R3 | N | — | N | N | Y |

**TC-PRD-CL-006**: Connector ON + Tool ON → 工具可用
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户在 connector 详情页（S2），connector 级别 Switch 为 ON
- **操作步骤:** 1. 确认 connector 级别 Switch 为 ON 2. 确认某个工具 Switch 为 ON 3. 观察工具状态
- **预期结果:** 该工具行显示为启用状态，Switch 为 ON

**TC-PRD-CL-007**: Connector ON + Tool OFF → 单个工具禁用
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 用户在 connector 详情页（S2），connector 级别 Switch 为 ON
- **操作步骤:** 1. 确认 connector 级别 Switch 为 ON 2. 关闭某个工具的 Switch 3. 观察工具状态
- **预期结果:** 该工具行显示为禁用状态，其他工具不受影响

**TC-PRD-CL-008**: Connector OFF → 所有工具联动关闭
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户在 connector 详情页（S2），connector 级别 Switch 为 ON，部分工具为 ON
- **操作步骤:** 1. 关闭 connector 级别 Switch 2. 观察所有工具状态
- **预期结果:** 所有工具 Switch 联动关闭，显示为禁用状态

---

## Method 4: State Transition Testing

### Connector Switch 状态转换

状态：S0=ON, S1=OFF
事件：Toggle Switch

| 当前状态 | 事件 | 下一状态 | 有效 |
|---------|------|---------|:----:|
| ON | Toggle OFF | OFF | Yes |
| OFF | Toggle ON | ON | Yes |

**TC-PRD-CL-009**: Connector 从 ON 切换到 OFF
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户在 Connectors 列表页，某 connector 为 ON 状态
- **操作步骤:** 1. 点击 connector Switch 使其变为 OFF
- **预期结果:** Switch 变为 OFF，connector 显示灰色禁用样式

**TC-PRD-CL-010**: Connector 从 OFF 切换回 ON
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户在 Connectors 列表页，某 connector 为 OFF 状态
- **操作步骤:** 1. 点击 connector Switch 使其变为 ON
- **预期结果:** Switch 变为 ON，connector 恢复正常显示

---

## Method 5: Scenario Method

### 基本流程与备选流程

基本流: 进入列表页 → 点击 connector 行 → 进入详情页 → 查看工具列表 → 操作工具 Switch → 返回列表
备选流1: 从输入框 Add Menu 操作 connector Switch
备选流2: 在详情页关闭 connector 级别 Switch
备选流3: 通过 Add Menu 底部"Manage connectors"跳转列表页

**TC-PRD-CL-011**: 完整流程 — 从列表进入详情并操作工具 Switch
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录，在 Connectors 列表页
- **操作步骤:** 1. 点击 CI CTS 行（非 Switch 区域）2. 进入详情页 3. 确认面包屑显示 "Connectors > CI CTS" 4. 查看工具列表 5. 确认 Search candidates 显示 Auto badge，Create candidate 显示 Approval badge 6. 关闭 Update candidate 工具 Switch 7. 确认 Update candidate 变为 OFF 8. 点击返回箭头返回列表
- **预期结果:** 详情页正确展示所有工具及其 badge，工具 Switch 操作成功，返回列表后页面正常

**TC-PRD-CL-012**: S1 与 S3 双向同步 — 列表页切换 Switch 后 Add Menu 同步
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录，在对话页面
- **操作步骤:** 1. 点击输入框 "+" 按钮打开 Add Menu 2. 展开 Connectors 列表 3. 记录某 connector 的 Switch 状态 4. 点击 "Manage connectors" 进入 S1 列表页 5. 切换该 connector 的 Switch 6. 返回对话页 7. 再次打开 Add Menu 查看该 connector Switch 状态
- **预期结果:** S1 列表页的 Switch 变更在 S3 Add Menu 中同步显示

**TC-PRD-CL-013**: Add Menu 打开与关闭
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户在对话页面
- **操作步骤:** 1. 点击输入框左侧 "+" 按钮 2. 确认弹出菜单包含 "Upload file" 和 "Connectors" 3. 展开 Connectors 查看 5 个 connector 4. 点击外部区域
- **预期结果:** 菜单弹出后正确显示内容，点击外部后菜单关闭

**TC-PRD-CL-014**: Add Menu 按 Esc 关闭
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** 用户在对话页面，Add Menu 已打开
- **操作步骤:** 1. 按 Esc 键
- **预期结果:** Add Menu 关闭

---

## Method 6: Error Guessing

**TC-PRD-CL-015**: 快速连续切换 Switch — 防抖验证
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户在 Connectors 列表页
- **操作步骤:** 1. 快速连续点击同一 connector 的 Switch 3 次
- **预期结果:** 最终状态与点击次数奇偶性一致（3次=反转1次），不产生重复请求或错误状态

**TC-PRD-CL-016**: Connector 详情页 Approval/Auto badge 正确区分
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户在 CI CTS connector 详情页
- **操作步骤:** 1. 检查各工具的 badge 类型
- **预期结果:** Search candidates 和 Search jobs 显示 Auto badge，Create candidate 和 Create job 显示 Approval badge（橙色），Update candidate 无 badge

**TC-PRD-CL-017**: 详情页返回导航正确
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户在 connector 详情页
- **操作步骤:** 1. 点击面包屑中的 "Connectors" 2. 观察页面
- **预期结果:** 返回 S1 Connectors 列表页，列表内容完整

---

## Merged Test Case List

**TC-PRD-CL-001**: Connector 列表显示 5 个 connector 及其基本信息
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户已登录，通过侧边栏用户菜单进入 Connectors 页面
- **操作步骤:** 1. 点击侧边栏用户菜单 2. 点击 Connectors 菜单项 3. 观察页面内容
- **预期结果:** 显示面包屑"Connectors"，列表包含 5 个 connector 行，每行显示图标、名称、描述、工具数和 Switch 开关
- **测试数据:** 5 个 connector: CI CTS(5 tools), CI CRM(4 tools), CI AI-Calling(3 tools), DingTalk(4 tools), CI Mail(4 tools)

**TC-PRD-CL-002**: 启用状态的 Connector Switch 显示 ON
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户在 Connectors 列表页，connector 为启用状态
- **操作步骤:** 1. 观察 connector 行的 Switch 开关状态
- **预期结果:** Switch 显示为 ON 状态

**TC-PRD-CL-003**: 禁用 Connector Switch 后该行显示灰色禁用样式
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** 用户在 Connectors 列表页，connector 为启用状态
- **操作步骤:** 1. 点击某个 connector 的 Switch 开关使其变为 OFF
- **预期结果:** 该 connector 行显示灰色禁用样式，Switch 变为 OFF

**TC-PRD-CL-004**: 工具数为 3（最少）的 connector 正确显示
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 用户在 Connectors 列表页
- **操作步骤:** 1. 找到 CI AI-Calling connector 行 2. 检查工具数显示
- **预期结果:** 显示 "3 tools"

**TC-PRD-CL-005**: 工具数为 5（最多）的 connector 正确显示
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** 用户在 Connectors 列表页
- **操作步骤:** 1. 找到 CI CTS connector 行 2. 检查工具数显示
- **预期结果:** 显示 "5 tools"

**TC-PRD-CL-006**: Connector ON + Tool ON → 工具可用
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户在 connector 详情页（S2），connector 级别 Switch 为 ON
- **操作步骤:** 1. 确认 connector 级别 Switch 为 ON 2. 确认某个工具 Switch 为 ON 3. 观察工具状态
- **预期结果:** 该工具行显示为启用状态，Switch 为 ON

**TC-PRD-CL-007**: Connector ON + Tool OFF → 单个工具禁用
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 用户在 connector 详情页（S2），connector 级别 Switch 为 ON
- **操作步骤:** 1. 确认 connector 级别 Switch 为 ON 2. 关闭某个工具的 Switch 3. 观察工具状态
- **预期结果:** 该工具行显示为禁用状态，其他工具不受影响

**TC-PRD-CL-008**: Connector OFF → 所有工具联动关闭
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户在 connector 详情页（S2），connector 级别 Switch 为 ON，部分工具为 ON
- **操作步骤:** 1. 关闭 connector 级别 Switch 2. 观察所有工具状态
- **预期结果:** 所有工具 Switch 联动关闭，显示为禁用状态

**TC-PRD-CL-009**: Connector 从 ON 切换到 OFF
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户在 Connectors 列表页，某 connector 为 ON 状态
- **操作步骤:** 1. 点击 connector Switch 使其变为 OFF
- **预期结果:** Switch 变为 OFF，connector 显示灰色禁用样式

**TC-PRD-CL-010**: Connector 从 OFF 切换回 ON
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户在 Connectors 列表页，某 connector 为 OFF 状态
- **操作步骤:** 1. 点击 connector Switch 使其变为 ON
- **预期结果:** Switch 变为 ON，connector 恢复正常显示

**TC-PRD-CL-011**: 完整流程 — 从列表进入详情并操作工具 Switch
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录，在 Connectors 列表页
- **操作步骤:** 1. 点击 CI CTS 行（非 Switch 区域）2. 进入详情页 3. 确认面包屑显示 "Connectors > CI CTS" 4. 查看工具列表 5. 确认 Search candidates 显示 Auto badge 6. 确认 Create candidate 显示 Approval badge 7. 关闭 Update candidate 工具 Switch 8. 点击返回箭头返回列表
- **预期结果:** 详情页正确展示所有工具及其 badge，工具 Switch 操作成功，返回列表后页面正常

**TC-PRD-CL-012**: S1 与 S3 双向同步 — 列表页切换 Switch 后 Add Menu 同步
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户已登录，在对话页面
- **操作步骤:** 1. 点击输入框 "+" 按钮打开 Add Menu 2. 展开 Connectors 列表 3. 记录某 connector 的 Switch 状态 4. 点击 "Manage connectors" 进入 S1 列表页 5. 切换该 connector 的 Switch 6. 返回对话页 7. 再次打开 Add Menu 查看该 connector Switch 状态
- **预期结果:** S1 列表页的 Switch 变更在 S3 Add Menu 中同步显示

**TC-PRD-CL-013**: Add Menu 打开与关闭
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户在对话页面
- **操作步骤:** 1. 点击输入框左侧 "+" 按钮 2. 确认弹出菜单包含 "Upload file" 和 "Connectors" 3. 展开 Connectors 查看 5 个 connector 4. 点击外部区域
- **预期结果:** 菜单弹出后正确显示内容，点击外部后菜单关闭

**TC-PRD-CL-014**: Add Menu 按 Esc 关闭
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** 用户在对话页面，Add Menu 已打开
- **操作步骤:** 1. 按 Esc 键
- **预期结果:** Add Menu 关闭

**TC-PRD-CL-015**: 快速连续切换 Switch — 防抖验证
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户在 Connectors 列表页
- **操作步骤:** 1. 快速连续点击同一 connector 的 Switch 3 次
- **预期结果:** 最终状态与点击次数奇偶性一致（3次=反转1次），不产生重复请求或错误状态

**TC-PRD-CL-016**: Connector 详情页 Approval/Auto badge 正确区分
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户在 CI CTS connector 详情页
- **操作步骤:** 1. 检查各工具的 badge 类型
- **预期结果:** Search candidates 和 Search jobs 显示 Auto badge，Create candidate 和 Create job 显示 Approval badge（橙色），Update candidate 无 badge

**TC-PRD-CL-017**: 详情页返回导航正确
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户在 connector 详情页
- **操作步骤:** 1. 点击面包屑中的 "Connectors" 2. 观察页面
- **预期结果:** 返回 S1 Connectors 列表页，列表内容完整
