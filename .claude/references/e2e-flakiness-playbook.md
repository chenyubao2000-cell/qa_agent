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

## 19. 不该"改测试让它过"的场景（保留失败 = 真 bug）

| 信号 | 分类 |
|---|---|
| button expected enabled but is disabled（源码逻辑正确） | POSSIBLE BUG |
| toHaveText 文案确实被开发改过（legit copy update） | UPDATE handoff + assertionsChanged:true |
| 功能被 feature-flag 关掉 / 权限变更 | BUG or config issue |
| 明确是回归（verify-fix 原 bug 再现） | BUG — 原断言不动 |

## 使用方式

fix subagent 碰到 failure 时：
1. 先对照本 playbook 的 Symptom 栏看有没有直接命中的 pattern。
2. 命中即按 Fix 节套用，不必重新 CDP 探索。
3. 没命中再走 `fix-subagent-prompt.md` 的 Phase 0.5 源码分析 → CDP verify → 分类。
4. 修完后**把新模式反哺到本文件**，下次不必再走一轮。
