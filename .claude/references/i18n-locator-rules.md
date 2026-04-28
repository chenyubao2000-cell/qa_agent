# i18n Locator Rules — POM/Spec 反硬编码守则

> **Authoritative source**: Locator-writing rules for multi-locale projects.
> Referenced by: `e2e-orchestrator.md` (POM/spec generation), `verification-gate-v1-v5.md` (lint), `qa-explore.md` / `qa-from-issue.md` / `qa-run-prd.md` / `qa-from-branch.md` / `qa-fix-tests.md` (Phase 0 inherits these rules).
> Companion: `phase-0-templates.md` (infra templates), `multi-locale` section in `phase-0-workspace-init.md` (init-time validation).

## 适用范围

当 `APP_LANGUAGES` 设置（项目支持多 locale）时，任何新写或修改的 **POM / Playwright spec / fixture 选择器** 必须遵守本守则。
单 locale 项目可放宽；但推荐默认开启（未来扩展零成本）。

---

## 4 条硬禁令（违反 → verification gate FAIL）

### D1. 禁止 locator 内硬编码可翻译文案

❌ **反例**：
```ts
page.getByRole("button", { name: "上传文件" })
page.getByRole("heading", { name: /Welcome|欢迎/ })   // 缺法语/其他 locale
page.locator('text=分享会话')
```

✅ **正例**：
```ts
page.getByRole("button", { name: this.i18n ? this.i18n.t("chatbot.addAttachments") : i18nRegex("chatbot.addAttachments") })
page.getByRole("heading", { name: i18nRegex("dashboard.welcome") })
page.getByText(i18nRegex("chatbot.shareSession"))
```

**原因**：`i18nRegex(key)` 会跨 `messages/*.json` 所有 locale 构建 OR regex，未来加新 locale **零改动**。手写 regex 漏一个就挂。

### D2. 禁止硬编码量词/单位/数字组合

❌ **反例**：`/case01.*1 人/` — "人" 是中文量词，在 fr 下可能是 "personne" / "candidat"。

✅ **正例**：`/case01.*\|\s*1\b/` — 利用 **locale-stable 锚点**（竖线分隔符 + 阿拉伯数字）。

**原因**：量词/复数规则跨 locale 极不一致（英语 "1 person" / "2 people"，法语 "1 candidat" / "2 candidats"，中文"1 人"/"6 人"）。用数字 + 标点 + 稳定英文单位绕开。

### D3. 禁止硬编码 storageState 路径

❌ **反例**：
```ts
test.describe("...", () => {
  test.use({ storageState: "playwright/.auth/user.json" });
  ...
});
```

✅ **正例**：
- 需要已登录态 → **省略 `test.use({ storageState })`**，让 `playwright.config.ts` 按 project locale 自动注入 `user.${locale}.json`
- 需要公共页（sign-in / forgot-password）→ `test.use({ storageState: { cookies: [], origins: [] } })`

**原因**：多 locale 项目的 storageState 按 `user.${locale}.json` 命名；硬编码 `user.json` 在 per-locale 配置下根本不存在，整个 describe 初始化就挂。

### D4. 禁止假设 Radix/shadcn 内置 sr-only label 跟随 locale

❌ **反例**：
```ts
// Radix Dialog.Close 内置一个 sr-only "Close"
getDialogCloseBtn = () => page.locator('[role="dialog"]').getByRole("button", {
  name: this.i18n.t("canvas.close"),    // zh="关闭"/fr="Fermer"/...
})
```
Radix 的 sr-only 字串是**英文硬编码**，不经 i18n 系统；业务侧的 `canvas.close` i18n key 对应的是**业务自定义的**关闭按钮，不一定是 Radix 组件的关闭。

✅ **正例**：
```ts
getDialogCloseBtn = () => page
  .locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has(svg.lucide-x)')
  .first();
```
直接锚定 **组件固定 aria-label** + **稳定图标**。

**原因**：第三方组件（Radix/shadcn/Headless UI）的内置 label 通常是**英文硬编码**（零 i18n 支持），与业务 i18n key 无关。

---

## 4 条 locale-stable 选择法（优先级从高到低）

| # | 方法 | 适用场景 | 例 |
|---|---|---|---|
| 1 | `data-*` 属性 | 项目可控 UI 的自定义锚点 | `[data-sidebar="trigger"]`、`[data-slot="dialog-content"]` |
| 2 | 稳定 svg icon | 图标按钮（paperclip / x / share2 / more-horizontal） | `button:has(svg.lucide-paperclip)` |
| 3 | 内置英文 aria-label | 第三方组件 sr-only label（locale-independent） | `[aria-label="Close"]`、`[aria-label="Upload files"]` |
| 4 | `i18nRegex(key)` / `i18n.t(key)` | 业务 UI 文案（必须能在 `messages/*.json` 找到 key） | `getByRole("button", { name: i18nRegex("chatbot.share") })` |

**回退顺序**：优先 1/2/3（locale-stable，零维护成本），万不得已才 4（业务 key）。**绝不**写 naked regex/literal 文案。

---

## POM/spec 自检清单（orchestrator 生成 + verification gate 强制）

生成或修改 POM/spec 后，执行以下 grep 自检：

```bash
# Lint 1 — 硬编码中文/日韩/非拉丁字符（数据 fixture 名白名单：case01_* 等）
grep -nE '"[^"]*[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af][^"]*"' <file> \
  | grep -v 'i18n\|messages/\|case0[0-9]_\|import\|//' \
  && FAIL

# Lint 2 — 硬编码 storageState 绝对路径
grep -nE "storageState:\s*['\"]playwright/\.auth/user\.json['\"]" <file> \
  && FAIL

# Lint 3 — naked getByRole with 翻译字面量（非 regex，非 i18n 变量）
grep -nE 'getByRole\(.*name:\s*["\x27][^"/]*["\x27]' <file> \
  | grep -v 'i18n\|i18nRegex\|Submit\|Close\|Upload files' \
  && WARN
```

> **白名单例外**：
> - **固定英文**：`"Submit"`、`"Close"`、`"Upload files"` 等第三方组件内置 label（locale-independent）
> - **数据 fixture 名**：`case01_技术人才`、`sample.pdf` 等非 UI 文案的数据锚点
> - **i18n key 字面量**：传给 `i18n.t()` / `i18nRegex()` 的参数（是 key 不是文案）

---

## 本次发现的 4 类反面案例（历史）

| 案例 | 问题 | 修复策略 |
|---|---|---|
| `talent-list.page.ts` `/case01_技术人才.*1 人/` | D2 量词"人"只中文 | 改为 `/case01_技术人才.*\|\s*1\b/`（数字 + 竖线） |
| `task.page.ts` `fileUploadBtn` regex `上传文件\|Upload files` | D1 缺法语 `Téléverser un fichier` | 改为 `button:has(svg.lucide-paperclip)`（图标） |
| `task.page.ts` `getDialogCloseBtn` 用 `canvas.close` i18n | D4 Radix sr-only 是英文硬编码 | 改为 `[role="dialog"] button[aria-label="Close"], …:has(svg.lucide-x)` |
| `view-all-files-prd.test.ts` `storageState: "playwright/.auth/user.json"` | D3 硬编码 per-locale 不存在的路径 | 删除该行（config 自动按 project locale 注入） |

---

## 与其他规范的关系

- **基建层**（per-locale config / storage / auth）→ `phase-0-templates.md`
- **init 校验**（每 locale 都要有对应 project/storage）→ `phase-0-workspace-init.md` § Auth Infrastructure Validation
- **orchestrator 自检**（生成后 lint）→ `verification-gate-v1-v5.md` V3/V4
- **本文件**（POM/spec 编写守则）→ 被上述三者引用；是"写的时候怎么写"的唯一源
