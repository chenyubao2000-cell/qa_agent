# E2E Flakiness & Fix Playbook

> 沉淀 `/qa-fix-tests` 真实失败 case 的修复范式，供 fix subagent 直接套用。
> 每条 pattern：Symptom → Root Cause → Fix。

## 1. i18n key namespace / 键位错位

**Symptom**: `i18nRegex("foo.bar")` / `getByRole({ name })` 0 elements; 错误显示回退 literal regex `/foo\.bar/i`。

**Root Cause**: i18n 键在源码里位于不同命名空间（`joinWaitlist.*` vs `auth.joinWaitlist.*`），或键已被改名（`backToSignIn` → `backToLogin`，`viewAllFiles.*` → `taskFiles.*`）。

**Fix**:
1. 源码 grep `useTranslations\("(\w+\.?\w+)"\)` 找组件真正的 namespace。
2. 对照 messages/en.json 确认 key 存在；不存在就跟着组件走。
3. 写 POM/spec 时 **绝不手写键名**，一律从源码复制。

## 2. i18nRegex 源与生产值漂移

**Symptom**: 本地 messages/en.json 改了 `aria-label` 值，测试仍然匹配失败。

**Root Cause**: `i18n-helpers.ts` 优先读 `MIRA_I18N_SOURCE`（Mira 源码路径），不是 QA 项目本地 messages。生产可能已部署新值（如硬编码 `aria-label="Upload files"`），源码仍是旧 i18n 值（`"Add photos or files"`）。

**Fix**: 用容忍多值的 regex，不依赖任一 messages 源：
```ts
/Upload files?|Add photos or files|上传文件|添加照片或文件/i
```
中英 + 单复数 + 生产/旧值全部列入 alternation。

## 3. Framer Motion 剥离 Tailwind class

**Symptom**: POM 用 `div.bg-background.shrink-0.overflow-hidden.border-l` 作 scope，实际 DOM 只剩 `div.shrink-0.overflow-hidden` + inline `style="width:..."`。

**Root Cause**: `motion.div` 把部分 utility class 转成 inline style/css vars 以做动画，outer wrapper 丢失装饰性 class。

**Fix**: Scope 改到 **内层稳定元素**（如 `TaskFilesViewer` 根 div `div.bg-background.text-foreground.flex.flex-col.h-full.w-full`），或改用 `[role="dialog"]` / `[data-state]` 语义属性。

## 4. 测试账户 locale 与 POM 语言不一致

**Symptom**: 账户 UI 是中文，POM 用 `i18n.t("taskFiles.title")` 拿到英文 "All files in this task"，`getByRole("heading", { name: "..." })` 找不到中文 heading "此任务中的所有文件"。

**Root Cause**: `i18n.t()` 只取 fixture 里指定的单一 locale，不跟随页面实际语言。

**Fix**: POM getter 永远用 `i18nRegex(key)`（多 locale alternation），不要直接 `i18n.t(key)`。仅 `i18n` fixture 真实传入时才当单语 fallback。

## 5. Sonner toast 用 data-type 而非文本

**Symptom**: Toast 错误断言 `getByText(i18n.t("download.failedMessage"))` 超时；实际 toast 文案来自 `toast.error(err.message)` 动态字符串。

**Root Cause**: 应用调用 `toast.error(err.message)` 传递运行时异常 message，没走 i18n。

**Fix**: 用 Sonner 稳定属性：
```ts
page.locator('[data-sonner-toast][data-type="error"]')
```
Sonner 会给 error toast 打 `data-type="error"` 属性，不依赖文案。

## 6. TanStack Query 缓存让 route intercept 失效

**Symptom**: `page.route('**/api/files/verify**', abort)` 设了，但测试点击下载仍不报错 toast。

**Root Cause**: 组件首次打开 panel 时已 fire 过 verify 请求并缓存 token（10min staleTime）；下载点击走 R2 CDN（`files.mira.day/**`），不再 request verify。拦错了端点。

**Fix**:
1. 先确认**真正触发错误的网络调用**：`grep useDownload`、`fetch(` 等在源码里找。
2. 拦最靠近触发点的请求：
```ts
await page.route('**files.mira.day/**', route =>
  route.fulfill({ status: 500, body: 'Internal Server Error' })
);
```
3. 断言后 `page.unroute(...)` 避免影响后续用例。

## 7. 隐藏的 file input 混淆 aria-label

**Symptom**: `getByRole('button', { name: /Upload files/ })` 匹配到一个不可见元素，或一个真按钮但与预期不同。

**Root Cause**: AI Elements / shadcn 生态里，`prompt-input.tsx` 常有 hardcoded `<input type="file" className="hidden" aria-label="Upload files">` 占位；真正可见的上传按钮在别处（`task-input.tsx`）用 i18n key。

**Fix**: 别盯某单一 label，regex 列全可能值；或直接靠 **可见性 + 位置 context**（`page.locator('[data-sidebar="trigger"]')` 等稳定 attr）。

## 8. Tailwind md:opacity-0 让 Playwright 视为不可见

**Symptom**: `click()` timeout 5s；元素 DOM 存在、`display: flex`，但 `opacity: 0`。

**Root Cause**: Tailwind `md:opacity-0 group-hover/menu-item:opacity-100` 的 "hover 显" 模式。Playwright `click()` 默认做 actionability check（含 opacity），opacity=0 被视作 non-visible。

**Fix**:
- 优先 `hover()` 父元素 → 再 `click()`。
- 若 hover 时序不稳：直接 `click({ force: true })` 绕过可见性。
- **不要**改 UI 让 Playwright "看见"，保留 hover-reveal 的 UX 设计。

## 9. waitForFunction 与 AI 异步生成内容竞速

**Symptom**: `page.waitForFunction(() => el.textContent)` 15s 超时；DOM 里是 Skeleton 占位，title 迟迟不填。

**Root Cause**: 新建任务后 AI 异步生成标题，侧栏 `SidebarMenuButton` 文本初始为空。`querySelector` 返回的 "first item" 可能是新任务 (空) 或旧任务 (有)，不确定。

**Fix**: 用 **activeness 属性** 而非 index 定位当前任务：
```ts
await page.waitForFunction(
  () => {
    const el = document.querySelector(
      '[data-sidebar="menu-button"][data-active="true"]'
    );
    return !!el && (el.textContent?.trim().length ?? 0) > 0;
  },
  undefined,
  { timeout: 45_000 }
);
```
`/task/:id` 页面下只有当前 task 的 button 带 `data-active="true"`，不会被新/旧任务混淆。

## 10. Dialog 关闭时序（role=dialog vs alertdialog）

**Symptom**: 点保存/删除后立即断言列表，偶挂。

**Root Cause**: `<Dialog>` 在 `mutateAsync().then(close)` 关闭（API 返回后才关）；`<AlertDialog>` 在 `<AlertDialogAction>` 点击时立即关。混用同一 wait 策略会踩坑。

**Fix**: 按类型等 `hidden` 状态：
```ts
// Dialog (Edit/Rename)
await this.page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 15_000 });

// AlertDialog (Delete confirm)
await this.page.locator('[role="alertdialog"]').waitFor({ state: 'hidden', timeout: 15_000 });
```
然后再断言列表变化，保证 API 已完成。

## 11. group-hover 才显示的 action button

**Symptom**: `getCopyButton().toBeVisible()` 超时；DOM 存在，opacity 0。

**Root Cause**: 消息气泡的 copy 按钮常用 `md:opacity-0 group-hover:opacity-100`，桌面默认不可见。

**Fix**: 断言前先 hover 父气泡：
```ts
await taskPage.hoverUserMessage();  // hover role=log 内的 .is-user 元素
await expect(taskPage.getCopyButton()).toBeVisible({ timeout: 5_000 });
```

## 12. 文件上传（R2 PUT）与 Submit 的时序

**Symptom**: `attachFile()` + `clickSubmit()` 之后 URL 不跳到 `/task/:id`，悄无声息。

**Root Cause**: 组件 `handleSubmit` 检查 `files.every(f => f.path)`。文件先上传 R2（presign + PUT）才有 path；Submit 若先触发会走 silent early-return。

**Fix**: POM 新增 `waitForUploadComplete()`：等 form 内 `.animate-spin` 消失：
```ts
async waitForUploadComplete(timeout = 15_000) {
  await this.page
    .locator('form .animate-spin')
    .waitFor({ state: 'hidden', timeout });
}
```
`attachFile()` 后、`clickSubmit()` 前必须调用。

## 13. API rate-limit 被并发测试打爆

**Symptom**: 登录类测试偶尔被重定向到 `/sign-up` 或其它错页。

**Root Cause**: auth endpoints（如 `/api/auth/check-email`）限流（5/min/email），并发测试 + auth.setup 共用同一账户会触发 429，前端误判（`data.exists === undefined → false`）。

**Fix**:
1. **测试侧**：加严 URL / heading 断言失败快（early fail）而非继续走错路。
   ```ts
   await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });
   ```
2. **retries=2** 吸收偶发 429。
3. **产品侧**：让前端区分 429 vs 200 `{exists: false}`（记为生产 bug 反馈，不在测试里掩盖）。

## 14. test.setTimeout 太紧

**Symptom**: verify-fix 类短测试偶挂 timeout 15s，实际业务逻辑才几百毫秒。

**Root Cause**: preview 环境冷启动 + hydration 占 5–10s，`test.setTimeout(15_000)` 没给足余量。

**Fix**: verify-fix / 短测试统一 45s 起步；goto 后加 `chatInput.waitFor({ state: 'visible', timeout: 15_000 })` 让 hydration 完成再断言。

## 15. 生产 aria-label 走在源码前面

**Symptom**: 源码里 `aria-label={t("addAttachments")}` 值是 "Add photos or files"，但生产真 DOM 是 "Upload file"。

**Root Cause**: 产品发布节奏：生产环境可能已用新组件（`prompt-input.tsx` hardcoded），源码仓库还没同步。

**Fix**: POM regex 把"生产 + 源码 + 单复数 + 中英"四类值全 OR 起来。见 Pattern 2。

## 16. fixture 数据与 test 实际需求不对

**Symptom**: `expect(toolCardCount).toBeGreaterThan(0)` Received 0。

**Root Cause**: fixture 指向的 task 是 quicksort 算法问答，AI 直接文本回答无工具调用；test 期望有 tool card。

**Fix**: 查 `.test-data.json`，挑一个真正产生工具调用的任务（如 PPT 生成、文件处理）。**别改测试断言去容忍 0**，断言是对的，数据不对。

## 17. Retries 策略

Config 推荐：
```ts
retries: process.env.CI ? 1 : 2
```
- 本地 2 次：吸收 preview 网络、AI 异步、hydration 偶发抖动。
- CI 1 次：避免配额滥用；若某 case CI 专挂，按根因单独修（通常是竞速）。

## 18. 全局 timeout 档位建议

| 场景 | timeout |
|---|---|
| `expect.timeout` (全局) | 15_000 |
| `test.setTimeout` — 默认 | 60_000 |
| `test.setTimeout` — AI 任务提交类 | 90_000–120_000 |
| `test.setTimeout` — verify-fix 短测 | 45_000 |
| `waitForURL` — 登录后跳转 | 90_000（preview 冷） |
| dialog `hidden` 等待 | 15_000 |
| Panel 打开/关闭等待 | 30_000（Framer Motion 抖动） |
| file upload 完成 | 15_000 |

## 19b. SSR 已可见 ≠ React 已 hydrate（点击/填写静默无效）

**Symptom**: `heading.waitFor({ state: 'visible' })` 通过后立刻 `fill()`/`click()`，操作本身不报错，但受控输入的值被后续 re-render 清空，或按钮点击后什么也没发生（无 toast、无状态变化）。在 `/join-waitlist`、`/quick-activate` 等 auth 系列页面上均复现（同一 preview 部署，同一根因）。

**Root Cause**: Next.js SSR 把静态骨架（heading/表单结构）先送达，`visible` 断言只证明 DOM 存在，不证明 React 事件监听器已挂载。Playwright 的 `fill()`/`click()` 在 hydration 完成前执行时，要么落在还没绑定 onChange 的原生 input 上（值被 hydration 后的受控组件重置为初始值），要么点在还没绑定 onClick 的按钮上。并发 workers 下更容易触发（CPU 竞争延长 hydration 时间）。

**Fix**: 在 POM 的 `goto()`/`gotoWith*()` 里，等完 heading 之后再加一次 hydration 就绪代理：
```ts
await this._heading.waitFor({ state: "visible", timeout: 20_000 });
await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
```
`networkidle` 不是精确的 hydration 信号，但对这批页面（无持续轮询请求）够用；如果页面有长连接/轮询，改用等待一个已知会在 hydration 后才出现的交互态（如按钮从 disabled 变 enabled）。**别把这类失败误判成应用 bug** —— 用真实 CDP 点击验证一遍：如果手动点击有效而 Playwright 点击无效，几乎总是这个时序问题，不是功能坏了。

## 19. 不该"改测试让它过"的场景（保留失败 = 真 bug）

| 信号 | 分类 |
|---|---|
| button expected enabled but is disabled（源码逻辑正确） | POSSIBLE BUG |
| toHaveText 文案确实被开发改过（legit copy update） | UPDATE handoff + assertionsChanged:true |
| 功能被 feature-flag 关掉 / 权限变更 | BUG or config issue |
| 明确是回归（verify-fix 原 bug 再现） | BUG — 原断言不动 |

## 20. role=button 容器聚合可访问名与内部按钮文案子串重叠

**Symptom**: `getByRole('button', { name: 'Disconnect X' })` strict mode violation — resolved to 2 elements：一个是外层 `<div role="button" tabindex="0">` 行容器，一个是内层真正的 `<button aria-label="Disconnect X">`。

**Root Cause**: 行容器 div 本身没有 `aria-label`，其可访问名按 ARIA "name from content" 规则聚合所有后代内容（服务名 + 描述 + 内层按钮的可访问名），例如 `"Market Leads 企业和职位 8 Tools Disconnect Market Leads"`。Playwright `getByRole(..., { name })` **不加 `exact`默认按大小写不敏感的子串匹配**，`"Disconnect Market Leads"` 恰好是行容器聚合名的子串，于是同时命中行容器与内层按钮。

**Fix**: 内层按钮的可访问名是精确值（因为按钮自身 `aria-label` 就是这个短字符串），行容器的聚合名总是更长/不同。加 `{ exact: true }` 即可让匹配只落在内层按钮：
```ts
page.getByRole("button", { name: `${disconnect} ${serverName}`, exact: true })
```
用 CDP a11y snapshot 现场核对两者的可访问名是否确实不同（行容器名更长），确认后再下手改，避免误伤真正需要子串匹配的场景（如行容器本身用 `/^ServerName/` 前缀正则定位）。

## 21. aria-label 模板注释 ≠ 渲染字面量 / 同名按钮跨区域碰撞

**Symptom**: `getByLabel(/item\(s\)\s*pending/i)` element(s) not found；`getByRole('button', { name: 'More' }).first()` 点开的菜单没有期望的 menuitem（内容完全不对，如 Share/Rename/Delete 而非 Dismiss）。

**Root Cause**:
1. CDP baseline/源码注释里记的 `"{n} item(s) pending"` 是**模板占位符写法**，不是真实渲染文本。live DOM 实际 `aria-label="1 item pending"`（单数，没有字面 `"(s)"`）。正则不能照抄模板里的 `(s)`，要写成 `items?` 才能同时兼容单复数。
2. 页面上存在**多个同名可访问名称**的按钮（本例：侧栏 "Recent" 任务列表每一项都有自己的 "More" 按钮，和主区 HITL 行的 "More" 按钮文案完全相同）。不加容器 scope 的 `getByRole('button', { name: 'More' }).first()` 按 DOM 顺序命中的是**侧栏**（nav 在 main 之前），点开后菜单项是 Share/Rename/Delete，和断言要找的 "Dismiss" 毫无关系 → `waitFor visible` 超时。

**Fix**:
1. aria-label/文案正则：永远按"字面渲染值"写，不按模板占位符抄。单复数用 `?`，不要抄 `(s)`：`/\d+\s*items?\s*pending/i`。
2. 同名按钮先 scope 到语义容器再取 role+name，不要在全页面 `.first()`：
   ```ts
   this._moreButton = this._hitlRows.first().getByRole("button", { name: "More", exact: true });
   ```
3. 用真实 CDP 点击 + `take_snapshot`/`error-context.md` 验证点开的菜单内容是否是期望的那个，而不是只看按钮点击是否成功（点击成功 ≠ 点对了元素）。

## 22. fullyParallel 下多个 test() 竞争同一账户的真实可变状态

**Symptom**: 同一 spec 文件内彼此独立的 test()（各自 `page.goto()`，无显式依赖）里，某个断言初始状态的用例（如 "开关默认是 on"）偶发失败，收到的却是另一个用例改完还没改回来的中间值。

**Root Cause**: `playwright.config.ts` 全局 `fullyParallel: true`，同文件内的 test() 默认也会被拆到不同 worker 并发跑。如果其中一个 test 会对**账户级别、服务端持久化**的资源做真实写入 + 回滚（如 `PUT /api/profile/visibility` 切换后再切回去），而另一个 test 只是读取"初始应为 X"的假设 —— 两者共用同一个已登录账户（同一条服务端记录），并发时读用例可能踩在写用例"已改、未回滚"的窗口期。这不是 UI 竞态，是**跨 worker 的共享后端状态竞态**。

**Fix**: 给包含"真实写入+回滚"用例的整个 spec 文件顶部加：
```ts
test.describe.configure({ mode: "serial" });
```
放在所有 `test.describe` 之前（文件级别），让该文件内测试严格串行，不再和自己的兄弟用例抢同一账户的状态。不要试图给单个断言加 retry 掩盖 —— 断言本身没错，是并发调度让它看见了别人的中间态。

**识别信号**：spec 里出现 `toggleXxx()` + "roll back" 注释 + 别的 test 在同文件里断言同一资源的初始值，就要主动检查是否需要 serial。

## 23. Agent/Chat 产品里调用「不在当前 agent 可用工具集里」的工具会导致整轮对话静默回滚

**Symptom**: 手动通过真实聊天 UI 驱动 Mira 的 AI agent 执行一个多步骤指令（每步显式要求调用某个工具）。live 流式渲染里能看到后续好几步的工具卡片（如 sb_xlsx_create、sb_pdf_create……）都正常渲染了，但过几分钟刷新页面重新拉取，对话记录**回退**到了远早于那些步骤的一条消息，后面那些"看起来已经跑完"的工具卡片全部消失，UI 提示又变回"Mira will continue after your response"，好像什么都没发生过。

**Root Cause**: 该轮 assistant turn 里某一步调用了一个**不在这个 agent/账户实际可用工具集里**的工具（本次实测：`report_final_candidates`、`list_cities`、`search_jobs` 明明在系统提示词/工具 schema 里列出了，但这个聊天上下文实际拿不到）。工具调用失败后模型选择"记录错误、继续下一步"而不是中止，但后端在这次失败之后的整个 turn 可能没有被正确持久化/提交——本地浏览器的 SSE/live 视图仍然乐观渲染了后续（未持久化）的工具调用结果，但那只是"这次连接内的临时展示"，一旦刷新重新从服务端拉取真实存档，未提交的内容全部丢失，回滚到最后一个成功持久化的检查点（这里是那次失败调用之前）。

**Fix**:
1. **不要相信 live 流式视图作为"已完成"的证据** —— 每次要确认某一步真的发生过，必须 `navigate_page(type: 'reload')` 之后重新读 DOM，而不是只看 evaluate_script 抓到的当前内存态。
2. 一旦发现某个工具报错"不在可用工具集"，立刻在下一条消息里明确告诉 agent"该工具确认不可用，永久跳过，不要重试"，防止它在后续 turn 里再次尝试触发同样的静默回滚。
3. 这类"工具目录 vs 实际可调用工具集不一致"本身是产品侧的真实 bug，应该单独记录上报——不是测试脚本的问题。

**识别信号**：live 视图里看到的进度在 reload 后"消失"、回到更早的消息，且消失的那段内容前一步正好有"该工具不在可用工具集"或类似的报错。

## 24. 生产环境（miraday）一次成功的多步 turn，reload 后重建出的历史记录本身不确定——不只是回滚，是每次不一样

**Symptom**: 在 miraday（生产）上手动驱动一个 27 步指令（每步都是真实可用、真实成功的工具：`infer_icp`、`people_search`、`evaluate_people`、`generate_people_data`、`sb_xlsx_create`/`sb_pdf_create`/`sb_pptx_create`/`sb_image_create`、`code_interpreter`、`sb_command_execute`、`sb_file_create`/`sb_file_edit`/`sb_file_rewrite`、`compose_email`+`confirm`、`team_create`+`task_create`/`task_list`）。Live 流式视图里全部步骤都正常跑完，最终看到 "Task completed"。**连续两次 reload 同一个 task URL，拿到两个互相矛盾的历史**：第一次 reload 只剩下第一条 assistant 消息（`write_todos` 那条）+ "Task completed" 徽标；第二次（约 90 秒后）reload 却重建出了到 step 23（`compose_email` 草稿，Cancel/Send 按钮仍然可点、尚未 confirm）为止的记录，且提示 "Mira will continue after your response"——意味着这次重建认为任务还卡在中途、`team_create`/`complete()` 根本没发生过。用 `evaluate_script` 直接数 `[role="log"]` 的 DOM 子节点数，两次 reload 分别是 2 个子节点（内容不同），确认不是懒加载/虚拟化渲染问题，是后端真的对"这个任务当前处于什么状态"给出了两个不同答案。

**Root Cause**（推测，未深入产品源码验证）：与 §23 的场景不同——§23 是"调用了一个不可用工具 → 该 turn 未提交 → 回滚到最后一次成功持久化点"，触发条件明确、结果稳定（reload 多次得到同一个回滚后状态）。这里所有工具全部可用且执行成功（**证据**：Files 面板里 `notes.md`、`candidates_table.xlsx`、`search_summary.pdf`、`search_recap.pptx`、`match_tier_chart.png`、people-data JSON 全部真实生成并可下载，与聊天记录是否显示无关），但 reload 后 UI 重建的"聊天记录"版本本身不稳定——很可能是长 turn 的消息内容分片持久化到不同副本/缓存节点，读路径在不同时间点从不同副本拼出不一样的快照，属于最终一致性窗口内的读取，而不是简单的"提交或未提交"二元状态。

**Fix / 应对方式**:
1. **不要用聊天记录本身作为"某个工具是否真的执行过"的证据**——即使是生产环境、即使显示"Task completed"，也不能保证下一次 reload 还是同一个故事。判定某个工具是否真的跑了，必须去看**独立于聊天记录持久化路径的证据**：Files 面板里的产出文件、真实收到的邮件、真实产生的外部副作用（本次因为 CTS/cimail/voice 工具集根本没挂载而没有触发，但这条原则同样适用于将来任何真实副作用工具的验证）。
2. 涉及"点 Send / 确认降级动作"类的验证時，如果一次 reload 后发现同一个 task 出现了"这个操作看起来还没被确认"的界面（如仍然可点的 Cancel/Send 按钮），**不要假设点击安全**——那可能是一个陈旧/不一致的重建视图，实际状态可能早已是别的样子；应先用 Files/其他独立信号交叉确认，不确定就换一个全新的 task 继续，不要在这个歧义状态的 task 里继续操作。
3. 这是一个比 §23 更严重的产品 bug（真实成功的执行，产品自己的"完成"信号都靠不住），应单独作为高优先级 finding 上报，不要和 §23 的"工具不可用回滚"归并成一类。

**识别信号**：同一个已经跑完的 task，连续两次 reload 得到的聊天记录长度/内容不一致（尤其是一次显示"已完成"，另一次显示"还在等你回复"）；DOM 子节点数每次 reload 后不同。

## 使用方式

fix subagent 碰到 failure 时：
1. 先对照本 playbook 的 Symptom 栏看有没有直接命中的 pattern。
2. 命中即按 Fix 节套用，不必重新 CDP 探索。
3. 没命中再走 `fix-subagent-prompt.md` 的 Phase 0.5 源码分析 → CDP verify → 分类。
4. 修完后**把新模式反哺到本文件**，下次不必再走一轮。
