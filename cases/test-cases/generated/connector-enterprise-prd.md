<!-- PRD-hash: connector-enterprise-s14s15 | PRD-module: S14 Admin企业列表 + S14-2 Add Enterprise弹窗 + S15 企业详情 + S15-2 Add Email Suffix弹窗 | feature-slug: connector-enterprise -->

# Admin 企业认证管理测试用例 (PRD)

> 来源：connector_0409-fancy.pen — S14/S14-2/S15/S15-2
> Tags: @prd @connector-enterprise

---

## Method 1: Equivalence Partitioning

### S14 企业列表页等价类

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|----------|-----|----------|-----|
| 企业列表内容 | 有企业数据（显示名称+后缀数+chevron） | V1 | — | — |
| 侧边栏导航 | Enterprise Auth 菜单高亮 | V2 | — | — |
| 面包屑 | Admin / Enterprises | V3 | — | — |

### S14-2 Add Enterprise 弹窗等价类

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|----------|-----|----------|-----|
| Enterprise Name | 非空且不重复的名称（如 "测试企业"） | V4 | 空字符串 | I1 |
| | | | 已存在的企业名称 | I2 |

### S15-2 Add Email Suffix 弹窗等价类

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|----------|-----|----------|-----|
| Email Suffix | @ 开头 + 有效域名（@example.com） | V5 | 空字符串 | I3 |
| | | | 不以 @ 开头（example.com） | I4 |
| | | | 无效域名格式（@.com, @com） | I5 |
| | | | 已存在的后缀 | I6 |
| Description | 有描述文本 | V6 | — | — |
| | 无描述（可选字段） | V7 | — | — |

**TC-PRD-ENT-001**: 企业列表页正确显示企业数据
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户已登录，通过侧边栏进入 Enterprise Auth 页面
- **操作步骤:** 1. 点击侧边栏 Enterprise Auth 菜单 2. 观察页面内容
- **预期结果:** 面包屑显示 "Admin / Enterprises"，Enterprise Auth 菜单高亮；列表每行显示企业名称、邮箱后缀数量和 chevron 箭头；右上角显示 "Add Enterprise" 按钮
- **测试数据:** V1, V2, V3

**TC-PRD-ENT-002**: 输入有效企业名称成功新增企业
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 按钮 2. 在 Enterprise Name 输入框输入 "Test-Ent-{timestamp}" 3. 点击 "Add" 按钮
- **预期结果:** 弹窗关闭，企业列表自动刷新，新增的企业 "Test-Ent-{timestamp}" 出现在列表中
- **测试数据:** V4

**TC-PRD-ENT-003**: 企业名称为空时 Add 按钮禁用
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 按钮 2. 保持 Enterprise Name 为空 3. 观察 Add 按钮状态
- **预期结果:** "Add" 按钮处于禁用状态，不可点击
- **测试数据:** I1

**TC-PRD-ENT-004**: 输入重复企业名称提示错误
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在 Enterprise Auth 页面，已存在企业 "Test-Dup-{timestamp}"
- **操作步骤:** 1. 通过 UI 先创建企业 "Test-Dup-{timestamp}" 2. 再次点击 "Add Enterprise" 3. 输入相同的名称 "Test-Dup-{timestamp}" 4. 点击 "Add"
- **预期结果:** 显示重复名称错误提示，弹窗保持打开，企业未被创建
- **测试数据:** I2

**TC-PRD-ENT-005**: 输入有效邮箱后缀成功添加
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页（S15）
- **操作步骤:** 1. 点击 "Add Suffix" 按钮 2. 在 Email Suffix 输入框输入 "@test-{timestamp}.com" 3. 在 Description 输入框输入 "测试域名" 4. 点击 "Add"
- **预期结果:** 弹窗关闭，邮箱后缀表格自动刷新，新增后缀 "@test-{timestamp}.com" 出现在表格中，描述显示 "测试域名"
- **测试数据:** V5, V6

**TC-PRD-ENT-006**: 邮箱后缀为空时 Add 按钮禁用
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页，已打开 Add Email Suffix 弹窗
- **操作步骤:** 1. 点击 "Add Suffix" 2. 保持 Email Suffix 为空 3. 观察 Add 按钮状态
- **预期结果:** "Add" 按钮处于禁用状态
- **测试数据:** I3

**TC-PRD-ENT-007**: 邮箱后缀不以 @ 开头校验失败
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页，已打开 Add Email Suffix 弹窗
- **操作步骤:** 1. 在 Email Suffix 输入框输入 "example.com" 2. 点击 "Add"
- **预期结果:** 显示格式错误提示，后缀未被添加
- **测试数据:** I4

**TC-PRD-ENT-008**: 无效域名格式校验失败
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页，已打开 Add Email Suffix 弹窗
- **操作步骤:** 1. 在 Email Suffix 输入框输入 "@.com" 2. 点击 "Add"
- **预期结果:** 显示格式错误提示，后缀未被添加
- **测试数据:** I5

**TC-PRD-ENT-009**: 重复邮箱后缀校验失败
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页，已存在后缀 "@dup-{timestamp}.com"
- **操作步骤:** 1. 先通过 UI 添加后缀 "@dup-{timestamp}.com" 2. 再次点击 "Add Suffix" 3. 输入相同后缀 "@dup-{timestamp}.com" 4. 点击 "Add"
- **预期结果:** 显示重复后缀错误提示，后缀未被重复添加
- **测试数据:** I6

**TC-PRD-ENT-010**: 不填写 Description（可选字段）也能成功添加后缀
- **优先级:** P2
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 2. 输入 "@nodesc-{timestamp}.com" 3. Description 留空 4. 点击 "Add"
- **预期结果:** 弹窗关闭，后缀成功添加到表格，描述列为空或显示占位符
- **测试数据:** V5, V7

---

## Method 2: Boundary Value Analysis

### Enterprise Name 长度边界

| 边界参数 | 最小值 | 最小-1 | 最大值 | 最大+1 |
|---------|-------|--------|-------|--------|
| Enterprise Name 长度 | 1 字符 | 0（空） | 假设 100 字符上限 | 101 字符 |

### Email Suffix 格式边界

| 边界参数 | 有效边界 | 无效边界 |
|---------|---------|---------|
| 最短有效后缀 | @a.co（5 字符） | @a（无 TLD） |
| 最长域名 | @{63 chars}.com | @{64 chars}.com |

**TC-PRD-ENT-011**: Enterprise Name 最短有效值（1 个字符）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 2. 输入 "A" 3. 点击 "Add"
- **预期结果:** 成功创建名为 "A" 的企业

**TC-PRD-ENT-012**: Enterprise Name 超长值（101 字符）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 2. 输入 101 个字符的名称 3. 点击 "Add"
- **预期结果:** 输入被截断或显示长度超限错误提示

**TC-PRD-ENT-013**: Email Suffix 最短有效格式（@a.co）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 2. 输入 "@a.co" 3. 点击 "Add"
- **预期结果:** 后缀成功添加

**TC-PRD-ENT-014**: Email Suffix 缺少 TLD 部分（@a）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 2. 输入 "@a" 3. 点击 "Add"
- **预期结果:** 显示无效域名格式错误提示

---

## Method 3: Cause-Effect Graph / Decision Table

### Add Enterprise 弹窗决策表

| 因素 | 条件 |
|------|------|
| C1 | Enterprise Name 非空 |
| C2 | Enterprise Name 不重复 |

| 规则 | C1 | C2 | 结果 |
|------|----|----|------|
| R1 | N | — | Add 按钮禁用 |
| R2 | Y | N | 错误提示：名称重复 |
| R3 | Y | Y | 创建成功，列表刷新 |

### Add Email Suffix 弹窗决策表

| 因素 | 条件 |
|------|------|
| C1 | Email Suffix 非空 |
| C2 | Email Suffix 以 @ 开头 |
| C3 | 域名格式有效 |
| C4 | 后缀不重复 |

| 规则 | C1 | C2 | C3 | C4 | 结果 |
|------|----|----|----|----|------|
| R1 | N | — | — | — | Add 按钮禁用 |
| R2 | Y | N | — | — | 格式错误 |
| R3 | Y | Y | N | — | 无效域名 |
| R4 | Y | Y | Y | N | 重复后缀 |
| R5 | Y | Y | Y | Y | 添加成功，表格刷新 |

> N/A — 决策表中的场景已在 Method 1 等价类划分中覆盖（TC-PRD-ENT-002 ~ 009），不再重复生成独立用例。

---

## Method 4: State Transition Testing

### S14 → S14-2 → S15 → S15-2 页面导航状态

```
状态图：
[S14 企业列表] --点击企业行--> [S15 企业详情]
[S14 企业列表] --点击 Add Enterprise--> [S14-2 弹窗]
[S14-2 弹窗] --Cancel/遮罩/Esc--> [S14 企业列表]
[S14-2 弹窗] --Add 成功--> [S14 企业列表（刷新）]
[S15 企业详情] --面包屑 Enterprises--> [S14 企业列表]
[S15 企业详情] --点击 Add Suffix--> [S15-2 弹窗]
[S15-2 弹窗] --Cancel--> [S15 企业详情]
[S15-2 弹窗] --Add 成功--> [S15 企业详情（刷新）]
```

**TC-PRD-ENT-015**: 从企业列表点击企业行进入详情页
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在 Enterprise Auth 页面，列表中至少有 1 个企业
- **操作步骤:** 1. 点击某企业行 2. 观察页面跳转
- **预期结果:** 进入 S15 企业详情页，面包屑显示 "Admin / Enterprises / {企业名}"，标题显示企业名称，描述为 "Manage email domain suffixes for enterprise SSO authentication."

**TC-PRD-ENT-016**: 从企业详情面包屑返回企业列表
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在某企业详情页（S15）
- **操作步骤:** 1. 点击面包屑中的 "Enterprises" 链接
- **预期结果:** 返回 S14 企业列表页，面包屑恢复为 "Admin / Enterprises"

**TC-PRD-ENT-017**: Add Enterprise 弹窗通过 Cancel 关闭
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 打开弹窗 2. 点击 "Cancel" 按钮
- **预期结果:** 弹窗关闭，回到企业列表页，列表无变化

**TC-PRD-ENT-018**: Add Enterprise 弹窗通过点击遮罩关闭
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 打开弹窗 2. 点击弹窗外的遮罩区域
- **预期结果:** 弹窗关闭，列表无变化

**TC-PRD-ENT-019**: Add Enterprise 弹窗通过 Esc 键关闭
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 打开弹窗 2. 按下 Esc 键
- **预期结果:** 弹窗关闭，列表无变化

**TC-PRD-ENT-020**: Add Email Suffix 弹窗通过 Cancel 关闭
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 打开弹窗 2. 点击 "Cancel"
- **预期结果:** 弹窗关闭，后缀表格无变化

---

## Method 5: Scenario Method

### 基本流程

- BF1: Admin 登录 → 进入 Enterprise Auth → 查看企业列表 → 点击企业 → 查看详情 → 查看后缀表格
- BF2: Admin 登录 → 进入 Enterprise Auth → Add Enterprise → 输入名称 → 提交 → 列表刷新
- BF3: Admin 在企业详情 → Add Suffix → 输入后缀和描述 → 提交 → 表格刷新

### 备选流程

- AF1: 从 BF2 步骤 3 → Cancel → 返回列表
- AF2: 从 BF3 步骤 3 → 校验失败 → 修正 → 重新提交
- AF3: 企业详情 → 编辑已有后缀 → 保存
- AF4: 企业详情 → 删除已有后缀 → 确认

**TC-PRD-ENT-021**: 完整流程：新增企业并为其添加邮箱后缀
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** Admin 用户已登录
- **操作步骤:** 1. 进入 Enterprise Auth 页面 2. 点击 "Add Enterprise" 3. 输入 "Scenario-Ent-{timestamp}" 4. 点击 "Add" 5. 在列表中点击新建的企业 6. 点击 "Add Suffix" 7. 输入 "@scenario-{timestamp}.com" 和描述 8. 点击 "Add"
- **预期结果:** 企业创建成功并出现在列表中；进入详情后添加的后缀出现在表格中

**TC-PRD-ENT-022**: 编辑已有邮箱后缀
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** Admin 用户在某企业详情页，后缀表格中至少有 1 条后缀记录
- **操作步骤:** 1. 点击某后缀行的编辑（铅笔）图标 2. 修改描述内容为 "Updated-{timestamp}" 3. 保存
- **预期结果:** 描述更新成功，表格显示新的描述 "Updated-{timestamp}"

**TC-PRD-ENT-023**: 删除邮箱后缀（含二次确认）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** Admin 用户在某企业详情页，已通过 UI 添加后缀 "@del-{timestamp}.com"
- **操作步骤:** 1. 点击该后缀行的删除（垃圾桶）图标 2. 二次确认弹窗中点击确认
- **预期结果:** 后缀从表格中移除，表格自动刷新

**TC-PRD-ENT-024**: 删除邮箱后缀取消（二次确认中拒绝）
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** Admin 用户在某企业详情页，后缀表格中至少有 1 条记录
- **操作步骤:** 1. 点击某后缀行的删除图标 2. 二次确认弹窗中点击取消
- **预期结果:** 弹窗关闭，后缀未被删除，表格无变化

---

## Method 6: Error Guessing

**TC-PRD-ENT-025**: Enterprise Name 输入特殊字符（XSS 防护）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 2. 输入 `<script>alert(1)</script>` 3. 点击 "Add"
- **预期结果:** 如果允许创建，名称在列表中以纯文本显示（HTML 转义），无 XSS 执行；或校验拒绝特殊字符

**TC-PRD-ENT-026**: Email Suffix 输入 SQL 注入字符串
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 2. 输入 "@test.com'; DROP TABLE--" 3. 点击 "Add"
- **预期结果:** 显示无效域名格式错误提示，后缀未被添加

**TC-PRD-ENT-027**: 快速双击 Add 按钮（防重复提交）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在 Add Enterprise 弹窗，已输入有效企业名
- **操作步骤:** 1. 快速双击 "Add" 按钮（100ms 内连续点击两次）
- **预期结果:** 仅创建 1 个企业，无重复条目；按钮在首次点击后禁用或显示 loading

**TC-PRD-ENT-028**: 底部 "Back to App" 链接导航
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击底部 "Back to App" 链接
- **预期结果:** 成功跳转到主应用页面，离开 Admin 模块

**TC-PRD-ENT-029**: 企业详情页的邮箱后缀表格为空状态
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户新创建一个企业，进入其详情页
- **操作步骤:** 1. 创建新企业 2. 点击进入该企业详情 3. 观察后缀表格
- **预期结果:** 显示空状态提示或空表格，页面布局正常，"Add Suffix" 按钮可用

**TC-PRD-ENT-030**: Admin 侧边栏导航项高亮正确性
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 观察侧边栏导航 2. 确认各项文本和高亮
- **预期结果:** 侧边栏显示 Dashboard / Waitlist / Invitation Codes / Scenario Cards / Admins / Enterprise Auth 六个菜单项；Enterprise Auth 处于高亮激活状态

---

## Merged Test Case List

> 去重规则：Method 3 决策表已被 Method 1 覆盖，不单独产出用例。其余方法用例无重叠，全部保留。

**TC-PRD-ENT-001**: 企业列表页正确显示企业数据
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户已登录，通过侧边栏进入 Enterprise Auth 页面
- **操作步骤:** 1. 点击侧边栏 Enterprise Auth 菜单 2. 观察页面内容
- **预期结果:** 面包屑显示 "Admin / Enterprises"，Enterprise Auth 菜单高亮；列表每行显示企业名称、邮箱后缀数量和 chevron 箭头；右上角显示 "Add Enterprise" 按钮

**TC-PRD-ENT-002**: 输入有效企业名称成功新增企业
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 按钮 2. 在 Enterprise Name 输入框输入 "Test-Ent-{timestamp}" 3. 点击 "Add" 按钮
- **预期结果:** 弹窗关闭，企业列表自动刷新，新增的企业 "Test-Ent-{timestamp}" 出现在列表中

**TC-PRD-ENT-003**: 企业名称为空时 Add 按钮禁用
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 按钮 2. 保持 Enterprise Name 为空 3. 观察 Add 按钮状态
- **预期结果:** "Add" 按钮处于禁用状态，不可点击

**TC-PRD-ENT-004**: 输入重复企业名称提示错误
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在 Enterprise Auth 页面，已存在企业 "Test-Dup-{timestamp}"
- **操作步骤:** 1. 通过 UI 先创建企业 "Test-Dup-{timestamp}" 2. 再次点击 "Add Enterprise" 3. 输入相同的名称 "Test-Dup-{timestamp}" 4. 点击 "Add"
- **预期结果:** 显示重复名称错误提示，弹窗保持打开，企业未被创建

**TC-PRD-ENT-005**: 输入有效邮箱后缀成功添加
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页（S15）
- **操作步骤:** 1. 点击 "Add Suffix" 按钮 2. 在 Email Suffix 输入框输入 "@test-{timestamp}.com" 3. 在 Description 输入框输入 "测试域名" 4. 点击 "Add"
- **预期结果:** 弹窗关闭，邮箱后缀表格自动刷新，新增后缀 "@test-{timestamp}.com" 出现在表格中，描述显示 "测试域名"

**TC-PRD-ENT-006**: 邮箱后缀为空时 Add 按钮禁用
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页，已打开 Add Email Suffix 弹窗
- **操作步骤:** 1. 点击 "Add Suffix" 2. 保持 Email Suffix 为空 3. 观察 Add 按钮状态
- **预期结果:** "Add" 按钮处于禁用状态

**TC-PRD-ENT-007**: 邮箱后缀不以 @ 开头校验失败
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页，已打开 Add Email Suffix 弹窗
- **操作步骤:** 1. 在 Email Suffix 输入框输入 "example.com" 2. 点击 "Add"
- **预期结果:** 显示格式错误提示，后缀未被添加

**TC-PRD-ENT-008**: 无效域名格式校验失败
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页，已打开 Add Email Suffix 弹窗
- **操作步骤:** 1. 在 Email Suffix 输入框输入 "@.com" 2. 点击 "Add"
- **预期结果:** 显示格式错误提示，后缀未被添加

**TC-PRD-ENT-009**: 重复邮箱后缀校验失败
- **优先级:** P1
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页，已存在后缀 "@dup-{timestamp}.com"
- **操作步骤:** 1. 先通过 UI 添加后缀 "@dup-{timestamp}.com" 2. 再次点击 "Add Suffix" 3. 输入相同后缀 "@dup-{timestamp}.com" 4. 点击 "Add"
- **预期结果:** 显示重复后缀错误提示，后缀未被重复添加

**TC-PRD-ENT-010**: 不填写 Description（可选字段）也能成功添加后缀
- **优先级:** P2
- **测试类型:** 等价类划分
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 2. 输入 "@nodesc-{timestamp}.com" 3. Description 留空 4. 点击 "Add"
- **预期结果:** 弹窗关闭，后缀成功添加到表格，描述列为空或显示占位符

**TC-PRD-ENT-011**: Enterprise Name 最短有效值（1 个字符）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 2. 输入 "A" 3. 点击 "Add"
- **预期结果:** 成功创建名为 "A" 的企业

**TC-PRD-ENT-012**: Enterprise Name 超长值（101 字符）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 2. 输入 101 个字符的名称 3. 点击 "Add"
- **预期结果:** 输入被截断或显示长度超限错误提示

**TC-PRD-ENT-013**: Email Suffix 最短有效格式（@a.co）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 2. 输入 "@a.co" 3. 点击 "Add"
- **预期结果:** 后缀成功添加

**TC-PRD-ENT-014**: Email Suffix 缺少 TLD 部分（@a）
- **优先级:** P2
- **测试类型:** 边界值分析
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 2. 输入 "@a" 3. 点击 "Add"
- **预期结果:** 显示无效域名格式错误提示

**TC-PRD-ENT-015**: 从企业列表点击企业行进入详情页
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在 Enterprise Auth 页面，列表中至少有 1 个企业
- **操作步骤:** 1. 点击某企业行 2. 观察页面跳转
- **预期结果:** 进入 S15 企业详情页，面包屑显示 "Admin / Enterprises / {企业名}"，标题显示企业名称，描述为 "Manage email domain suffixes for enterprise SSO authentication."

**TC-PRD-ENT-016**: 从企业详情面包屑返回企业列表
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在某企业详情页（S15）
- **操作步骤:** 1. 点击面包屑中的 "Enterprises" 链接
- **预期结果:** 返回 S14 企业列表页，面包屑恢复为 "Admin / Enterprises"

**TC-PRD-ENT-017**: Add Enterprise 弹窗通过 Cancel 关闭
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 打开弹窗 2. 点击 "Cancel" 按钮
- **预期结果:** 弹窗关闭，回到企业列表页，列表无变化

**TC-PRD-ENT-018**: Add Enterprise 弹窗通过点击遮罩关闭
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 打开弹窗 2. 点击弹窗外的遮罩区域
- **预期结果:** 弹窗关闭，列表无变化

**TC-PRD-ENT-019**: Add Enterprise 弹窗通过 Esc 键关闭
- **优先级:** P2
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 打开弹窗 2. 按下 Esc 键
- **预期结果:** 弹窗关闭，列表无变化

**TC-PRD-ENT-020**: Add Email Suffix 弹窗通过 Cancel 关闭
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 打开弹窗 2. 点击 "Cancel"
- **预期结果:** 弹窗关闭，后缀表格无变化

**TC-PRD-ENT-021**: 完整流程：新增企业并为其添加邮箱后缀
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** Admin 用户已登录
- **操作步骤:** 1. 进入 Enterprise Auth 页面 2. 点击 "Add Enterprise" 3. 输入 "Scenario-Ent-{timestamp}" 4. 点击 "Add" 5. 在列表中点击新建的企业 6. 点击 "Add Suffix" 7. 输入 "@scenario-{timestamp}.com" 和描述 8. 点击 "Add"
- **预期结果:** 企业创建成功并出现在列表中；进入详情后添加的后缀出现在表格中

**TC-PRD-ENT-022**: 编辑已有邮箱后缀
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** Admin 用户在某企业详情页，后缀表格中至少有 1 条后缀记录
- **操作步骤:** 1. 点击某后缀行的编辑（铅笔）图标 2. 修改描述内容为 "Updated-{timestamp}" 3. 保存
- **预期结果:** 描述更新成功，表格显示新的描述 "Updated-{timestamp}"

**TC-PRD-ENT-023**: 删除邮箱后缀（含二次确认）
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** Admin 用户在某企业详情页，已通过 UI 添加后缀 "@del-{timestamp}.com"
- **操作步骤:** 1. 点击该后缀行的删除（垃圾桶）图标 2. 二次确认弹窗中点击确认
- **预期结果:** 后缀从表格中移除，表格自动刷新

**TC-PRD-ENT-024**: 删除邮箱后缀取消（二次确认中拒绝）
- **优先级:** P2
- **测试类型:** 场景法
- **前置条件:** Admin 用户在某企业详情页，后缀表格中至少有 1 条记录
- **操作步骤:** 1. 点击某后缀行的删除图标 2. 二次确认弹窗中点击取消
- **预期结果:** 弹窗关闭，后缀未被删除，表格无变化

**TC-PRD-ENT-025**: Enterprise Name 输入特殊字符（XSS 防护）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击 "Add Enterprise" 2. 输入 `<script>alert(1)</script>` 3. 点击 "Add"
- **预期结果:** 如果允许创建，名称在列表中以纯文本显示（HTML 转义），无 XSS 执行；或校验拒绝特殊字符

**TC-PRD-ENT-026**: Email Suffix 输入 SQL 注入字符串
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在某企业详情页
- **操作步骤:** 1. 点击 "Add Suffix" 2. 输入 "@test.com'; DROP TABLE--" 3. 点击 "Add"
- **预期结果:** 显示无效域名格式错误提示，后缀未被添加

**TC-PRD-ENT-027**: 快速双击 Add 按钮（防重复提交）
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在 Add Enterprise 弹窗，已输入有效企业名
- **操作步骤:** 1. 快速双击 "Add" 按钮（100ms 内连续点击两次）
- **预期结果:** 仅创建 1 个企业，无重复条目；按钮在首次点击后禁用或显示 loading

**TC-PRD-ENT-028**: 底部 "Back to App" 链接导航
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 点击底部 "Back to App" 链接
- **预期结果:** 成功跳转到主应用页面，离开 Admin 模块

**TC-PRD-ENT-029**: 企业详情页的邮箱后缀表格为空状态
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户新创建一个企业，进入其详情页
- **操作步骤:** 1. 创建新企业 2. 点击进入该企业详情 3. 观察后缀表格
- **预期结果:** 显示空状态提示或空表格，页面布局正常，"Add Suffix" 按钮可用

**TC-PRD-ENT-030**: Admin 侧边栏导航项高亮正确性
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** Admin 用户在 Enterprise Auth 页面
- **操作步骤:** 1. 观察侧边栏导航 2. 确认各项文本和高亮
- **预期结果:** 侧边栏显示 Dashboard / Waitlist / Invitation Codes / Scenario Cards / Admins / Enterprise Auth 六个菜单项；Enterprise Auth 处于高亮激活状态

---

### Priority Distribution Validation

| Priority | Count | Percentage |
|----------|-------|------------|
| P0 | 5 | 16.7% |
| P1 | 14 | 46.7% |
| P2 | 11 | 36.7% |

P0 (16.7%) — within 15-20% range. P1 (46.7%) — within 40-50% range. P2 (36.7%) — within 30-40% range. Distribution is valid.
