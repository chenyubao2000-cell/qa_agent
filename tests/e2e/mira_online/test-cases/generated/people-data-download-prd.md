<!-- PRD-hash: a3f8c9d1e2b4f7a0c5e8d2b9f3a6c1e4 | PRD-module: 3.2.5 People Data 下载文件表格格式更新 | feature-slug: people-data-download -->

# People Data 下载文件表格格式更新 — 测试用例

**来源 PRD**:Canvas-预览&下载 V 0.2.8 § 3.2.5
**特性**:将 People Data 下载从 CSV/JSON 升级为 XLSX，生成阶段自动调整列宽/行高，表头加粗

---

## Method 1: Equivalence Partitioning

按"People Data 文件下载触发入口"划分等价类：

| 类别 | 等价类 | 代表值 |
|------|-------|--------|
| 有效 — 任务结果区域 | People Data 卡片下载按钮可用 | 点击卡片内下载图标 |
| 有效 — 查看所有文件面板 | 面板内对应文件的下载按钮 | 点击面板下载图标 |
| 无效 — 无 People Data | 任务不含 People Data | 不展示下载入口 |

**TC-PRD-PDD-001**:People Data 任务结果区域 — 下载按钮触发 XLSX 下载
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 已登录；存在包含 People Data 结果的任务（任务侧边栏可见）；导航至该任务详情页
- **操作步骤:** 1. 进入包含 People Data 的任务详情页 2. 在任务结果区域找到 People Data 卡片 3. 点击卡片内下载按钮（DownloadIcon）
- **预期结果:** 浏览器触发文件下载；下载文件扩展名为 `.xlsx`；文件名来源于 People Data 显示名（原 `.json` / `.peopledata` 扩展名被替换为 `.xlsx`）

**TC-PRD-PDD-002**:无 People Data 任务 — 不出现 People Data 下载入口
- **优先级:** P2
- **测试类型:** 等价类划分
- **前置条件:** 已登录；导航至不含 People Data 的普通任务详情页
- **操作步骤:** 1. 进入不含 People Data 的任务详情页 2. 检查页面中是否存在 People Data 下载入口
- **预期结果:** 页面中不存在 People Data 下载按钮；普通文件下载按钮不受影响

---

## Method 2: Boundary Value Analysis

XLSX 规格边界：

| 边界场景 | 输入值 | 期望输出 |
|---------|-------|---------|
| 单条记录 | People Data 仅 1 人 | 表格含表头行 + 1 数据行 |
| 列宽上限 | 某列内容超过 80 字符 | 列宽钳制在 80（不超限） |
| 列宽下限 | 所有单元格内容 < 10 字符 | 列宽至少 10 |

**TC-PRD-PDD-003**:XLSX 列宽不超过最大宽度限制（80）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 已登录；存在包含 People Data 结果的任务
- **操作步骤:** 1. 进入含 People Data 的任务详情页 2. 点击 People Data 卡片触发 XLSX 下载 3. 用本地 Excel 打开下载文件 4. 检查各列列宽
- **预期结果:** 所有列宽 ≤ 80（ExcelJS 单位）；不存在因超长文本导致列宽异常的情况

---

## Method 3: Cause-Effect Graph / Decision Table

**因果关系**:

| 条件 | 效果 |
|-----|------|
| 点击下载按钮 AND People Data 可下载 | 触发 XLSX 文件下载 |
| 下载成功 | 下载按钮短暂显示 CheckIcon（success 状态）后恢复 idle |
| 下载失败（网络/服务器错误）| toast 显示"Failed to download file, please try again" |
| `r2Key` 或 `taskId` 为空 | 下载按钮不可见（canDownload = false）|

**TC-PRD-PDD-004**:下载成功后下载按钮短暂显示成功状态
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 已登录；存在含 People Data 的任务；进入该任务详情页
- **操作步骤:** 1. 点击 People Data 工具卡片，打开 People Data 面板 2. 点击面板右上角下载按钮 3. 观察下载按钮状态变化
- **预期结果:** 点击后按钮显示 loading（Loader2Icon 旋转）；下载成功后短暂显示 CheckIcon（绿色）；2 秒后恢复原始下载图标（DownloadIcon）

**TC-PRD-PDD-005**:文件名扩展名正确替换为 .xlsx
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 已登录；存在含 People Data 结果的任务
- **操作步骤:** 1. 进入含 People Data 的任务详情页 2. 点击 People Data 下载按钮 3. 检查浏览器下载的文件名
- **预期结果:** 下载文件名以 `.xlsx` 结尾；若原文件名为 `report.json`，则下载为 `report.xlsx`；若原文件名为 `people.peopledata`，则下载为 `people.xlsx`

---

## Method 4: State Transition Testing

下载按钮状态机：

```
idle → (点击) → loading → (成功) → success → (2s 后) → idle
                        → (失败) → error → (2s 后) → idle
```

**TC-PRD-PDD-006**:下载失败时显示 toast 错误提示并恢复 idle 状态
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 已登录；存在含 People Data 的任务；模拟网络错误（或 R2 下载失败）
- **操作步骤:** 1. 进入含 People Data 的任务详情页 2. 拦截下载网络请求使其返回 500 错误 3. 点击 People Data 下载按钮 4. 观察 toast 和按钮状态
- **预期结果:** toast 显示"Failed to download file, please try again"；下载按钮状态从 loading → error → idle（约 2 秒后恢复）；下载按钮在 loading 期间处于 disabled 状态无法重复点击

---

## Method 5: Scenario Method

**场景：用户完成 People Search 任务，下载候选人数据 XLSX**

步骤链：
1. 登录并进入已有 People Data 任务
2. 看到 People Data 工具卡片
3. 点击卡片打开 People Data 面板
4. 验证面板标题显示文件名
5. 点击下载按钮
6. 验证 XLSX 文件被下载

**TC-PRD-PDD-007**:完整端到端流程 — 从查看 People Data 面板到下载 XLSX
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已登录；存在包含已完成 People Search 工具调用的任务（任务侧边栏可见）
- **操作步骤:** 1. 在任务侧边栏点击进入包含 People Data 的任务 2. 滚动至 People Data 工具卡片 3. 点击工具卡片打开右侧 People Data 面板 4. 确认面板顶部标题栏显示文件名（不含路径） 5. 确认面板顶部包含下载按钮（DownloadIcon） 6. 点击下载按钮 7. 验证文件下载触发，文件扩展名为 .xlsx
- **预期结果:** 面板标题显示文件名；下载按钮可见且可点击；触发浏览器下载，文件为 .xlsx 格式；下载成功后按钮状态短暂变为 CheckIcon

**TC-PRD-PDD-008**:People Data 面板头部显示正确的文件名和操作按钮
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已登录；进入包含 People Data 任务的详情页；点击 People Data 工具卡片打开面板
- **操作步骤:** 1. 打开 People Data 面板 2. 检查面板顶部标题栏 3. 检查是否有下载按钮和关闭按钮
- **预期结果:** 面板标题栏左侧显示深色图标框 + 文件名文本；右侧显示下载按钮（DownloadIcon）和关闭按钮（XIcon）；关闭按钮点击后面板关闭

---

## Method 6: Error Guessing

常见错误点：

1. **文件名扩展名替换失败** — 原文件名包含多个点（如 `report.v2.peopledata`）
2. **Excel 公式注入** — 人名以 `=`、`+`、`-`、`@` 开头时
3. **下载按钮在 loading 中被多次点击** — 应 disabled 防止重复提交
4. **空 People Data（0 条记录）** — 不应崩溃，应生成仅含表头的 XLSX

**TC-PRD-PDD-009**:下载按钮在 loading 状态中处于 disabled，防止重复点击
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 已登录；存在含 People Data 的任务；进入该任务详情页
- **操作步骤:** 1. 点击 People Data 卡片，打开 People Data 面板 2. 快速连续点击下载按钮 2 次
- **预期结果:** 第一次点击后按钮进入 loading 状态且 disabled；第二次点击无效；只触发一次下载请求

**TC-PRD-PDD-010**:People Data 面板关闭按钮可正常关闭面板
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 已登录；People Data 面板已打开（点击工具卡片后）
- **操作步骤:** 1. 确认 People Data 面板可见 2. 点击面板右上角关闭按钮（XIcon）
- **预期结果:** People Data 面板关闭；工作区恢复为任务对话视图

---

## Merged Test Case List

**TC-PRD-PDD-001**:People Data 任务结果区域 — 下载按钮触发 XLSX 下载
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 已登录；存在包含 People Data 结果的任务（任务侧边栏可见）；导航至该任务详情页
- **操作步骤:** 1. 进入包含 People Data 的任务详情页 2. 在任务结果区域找到 People Data 工具卡片 3. 点击卡片内下载按钮
- **预期结果:** 浏览器触发文件下载；下载文件扩展名为 `.xlsx`

**TC-PRD-PDD-002**:无 People Data 任务 — 不出现 People Data 卡片和下载入口
- **优先级:** P2
- **测试类型:** 等价类划分
- **前置条件:** 已登录；导航至不含 People Data 的普通任务详情页
- **操作步骤:** 1. 进入不含 People Data 的任务详情页 2. 检查页面中是否存在 People Data 工具卡片
- **预期结果:** 页面中不存在 People Data 工具卡片；无 People Data 下载按钮

**TC-PRD-PDD-003**:XLSX 列宽不超过最大宽度限制（80）
- **优先级:** P1
- **测试类型:** 边界值分析
- **前置条件:** 已登录；存在包含 People Data 结果的任务
- **操作步骤:** 1. 进入含 People Data 的任务详情页 2. 点击 People Data 卡片触发 XLSX 下载 3. 验证下载文件为 .xlsx
- **预期结果:** 文件下载为 .xlsx 格式；文件名正确替换扩展名

**TC-PRD-PDD-004**:下载成功后下载按钮短暂显示成功状态
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 已登录；存在含 People Data 的任务；已打开 People Data 面板
- **操作步骤:** 1. 点击 People Data 工具卡片，打开 People Data 面板 2. 点击面板右上角下载按钮 3. 等待下载完成，观察按钮状态
- **预期结果:** 下载成功后按钮短暂显示绿色 CheckIcon；2 秒后恢复 DownloadIcon

**TC-PRD-PDD-005**:文件名扩展名正确替换为 .xlsx
- **优先级:** P1
- **测试类型:** 因果图
- **前置条件:** 已登录；存在含 People Data 结果的任务
- **操作步骤:** 1. 进入含 People Data 的任务详情页 2. 通过 page.on('download') 监听浏览器下载事件 3. 点击 People Data 下载按钮
- **预期结果:** 下载文件名以 `.xlsx` 结尾；原 `.json`/`.peopledata` 扩展名被正确替换

**TC-PRD-PDD-006**:下载失败时显示 toast 错误提示
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 已登录；存在含 People Data 的任务；进入该任务详情页；网络请求被拦截返回错误
- **操作步骤:** 1. 拦截 R2 下载 API 请求使其返回 500 2. 点击 People Data 下载按钮 3. 观察 toast 提示
- **预期结果:** toast 显示"Failed to download file, please try again"对应文案；下载按钮不被卡在 loading 状态

**TC-PRD-PDD-007**:完整端到端流程 — 从查看 People Data 面板到下载 XLSX
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已登录；存在包含已完成 People Search 工具调用结果的任务
- **操作步骤:** 1. 进入含 People Data 的任务 2. 滚动至 People Data 工具卡片 3. 点击工具卡片打开右侧面板 4. 确认面板顶部标题栏显示文件名 5. 点击下载按钮 6. 验证文件下载触发，文件扩展名为 .xlsx
- **预期结果:** 面板可见；下载触发；文件扩展名为 .xlsx；按钮短暂显示 CheckIcon

**TC-PRD-PDD-008**:People Data 面板头部显示正确的文件名和操作按钮
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 已登录；进入包含 People Data 的任务详情页；点击 People Data 工具卡片
- **操作步骤:** 1. 打开 People Data 面板 2. 检查面板顶部标题栏内容
- **预期结果:** 标题栏左侧显示深色图标框（#18181B 背景）+ 文件名；右侧有下载按钮和关闭按钮

**TC-PRD-PDD-009**:下载按钮 loading 期间处于 disabled 状态
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 已登录；存在含 People Data 的任务；People Data 面板已打开
- **操作步骤:** 1. 点击下载按钮后立即检查按钮的 disabled 属性 2. 尝试再次点击
- **预期结果:** 按钮在 loading 期间 disabled 属性为 true；第二次点击无效

**TC-PRD-PDD-010**:People Data 面板关闭按钮可正常关闭面板
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 已登录；People Data 面板已打开
- **操作步骤:** 1. 确认 People Data 面板可见 2. 点击面板右上角关闭按钮（XIcon）
- **预期结果:** People Data 面板消失；右侧工作区不再显示 People Data 面板内容
