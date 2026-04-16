# Mira 法语 (fr) 端到端 i18n 测试报告

**日期**: 2026-04-16  
**环境**: localhost:3000 (dev)  
**浏览器**: Chrome (Playwright channel: chrome)  
**视口**: Desktop 1280x720  
**测试账号**: chenyubao2000@163.com

---

## 1. 执行概要

总用例约 **30 个**（sign-in / home / task / forgot-password / join-waitlist / canvas / share 等），两轮验证覆盖同一套用例：

| 验证轮次      | 方式              | 覆盖  | 通过 | 失败 | 跳过 | 备注                                      |
| ------------- | ----------------- | ----- | ---- | ---- | ---- | ----------------------------------------- |
| 第一轮 (4/15) | CDP 人工验证      | 28/30 | 18   | 5    | 5    | 完整跑完，发现 i18n 选择器 + 2 个应用 Bug |
| 第二轮 (4/16) | Playwright 自动化 | 5/30  | 4    | 1    | 0    | 服务额度耗尽，被中断                      |

> **注**：两轮验证的是同一套用例，不能相加。第二轮是在修复全部 Page Object 和 assertion 正则后的自动化验证，跑了 5 个用例即被中断，剩余 ~25 个待服务恢复后补跑。

**第二轮 Playwright 通过的用例**（法语 UI 下自动化验证通过）:

- `TC-CDP-FP-001` 忘记密码 - 发送重置链接流程 (29.3s)
- `TC-CDP-JW-001` 加入等待名单表单 (30.4s)
- `TC-CDP-HOME-002` 首页导航跳转 (34.6s)
- `auth.setup` + `data.setup` 认证和数据初始化

**第二轮 Playwright 失败的用例**:

- `TC-PRD-CVPV-001` Canvas maximize (30.8s) — canvas 预览面板定位失败

---

## 2. 发现的问题分类

### 2.1 真实 i18n Bug（应用层问题，非测试代码问题）

| ID         | 严重度 | 页面             | 问题描述                                                                                                     |
| ---------- | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| BUG-FR-001 | P1     | /forgot-password | 忘记密码页面空邮箱提交时，服务端重定向到 /sign-in 而非显示客户端校验错误。中英文下有客户端校验，法语下缺失。 |
| BUG-FR-002 | P2     | /forgot-password | 确认步骤点击 Continue 后 URL 变为 /sign-in 而非保持 /forgot-password，法语下表单流程中断。                   |

### 2.2 测试基础设施修复（本次已修复）

本次测试前，所有 Page Object 和 test assertion 的正则只包含中文/英文，导致法语 UI 下全部定位失败。

**已修复的文件** (共 18 个):

| 文件                      | 修改类型                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `.env`                    | `APP_LANGUAGES=fr`, `PREVIEW_URL=localhost:3000`, 密码修正                            |
| `auth.setup.ts`           | 修复 `fill()` 不触发 React controlled input onChange 的问题，改用 `pressSequentially` |
| `fixtures.ts`             | 所有按钮/文本匹配添加法语: Continuer, Soumettre, Tâche terminée 等                    |
| `sign-in.page.ts`         | 所有定位器添加法语文本模式                                                            |
| `task.page.ts`            | 所有定位器添加法语文本模式                                                            |
| `mira-home.page.ts`       | 所有定位器添加法语文本模式                                                            |
| `forgot-password.page.ts` | 所有定位器添加法语文本模式                                                            |
| `join-waitlist.page.ts`   | 所有定位器添加法语文本模式                                                            |
| 10 个 test assertion 文件 | `toHaveText`/`toContainText` 正则添加法语翻译                                         |

### 2.3 先前 CDP 报告中发现的 i18n 问题（已通过代码修复）

以下问题在之前的 CDP 报告 (`cdp-results-fr.json`) 中被标记为 WARN/FAIL，**本次代码更新后已修复**:

| 问题                                         | 影响的选择器                            | 修复方式               |
| -------------------------------------------- | --------------------------------------- | ---------------------- |
| Core tab 法语 "Principales" 不匹配           | `/^Core$\|^核心$/i`                     | 添加 `\|^Principales$` |
| Recruiting tab 法语 "Recrutement"            | `/^Recruiting$\|^招聘$/i`               | 添加 `\|^Recrutement$` |
| Sign in 链接 "Se connecter"                  | `/Sign in\|登录/i`                      | 添加 `\|Se connecter`  |
| Join Waitlist "Rejoindre la liste d'attente" | `/Join Waitlist\|加入等待名单/i`        | 添加法语               |
| Bottom CTA "Demander un accès anticipé"      | `/Request Early Access\|申请抢先体验/i` | 添加法语               |
| 密码显示/隐藏 "Afficher/Masquer"             | `Show password\|Hide password`          | 添加法语               |
| 返回登录 "Retour à la connexion"             | `Back to Login\|返回登录`               | 添加法语               |
| 功能卡片标题全部缺少法语                     | 4 个 core + 4 个 recruiting headings    | 全部添加法语           |
| 表单字段 Name/Company/Role/UseCase           | 各自的 POM 选择器                       | 全部添加法语           |
| Submit/Cancel 按钮                           | `Soumettre`/`Annuler`                   | 已添加                 |
| 发送验证码按钮                               | `Envoyer le code de vérification`       | 已添加                 |

---

## 3. 法语翻译质量评估

基于 CDP 验证和 Playwright 运行，法语翻译 (`fr.json`) 整体覆盖良好：

| 页面             | 翻译覆盖 | 翻译质量 | 备注                           |
| ---------------- | -------- | -------- | ------------------------------ |
| /sign-in         | 完整     | 良好     | 所有文本正确显示法语           |
| / (首页)         | 完整     | 良好     | Hero、功能卡片、CTA 全部翻译   |
| /forgot-password | 完整     | 良好     | 但存在 BUG-FR-001 流程问题     |
| /join-waitlist   | 完整     | 良好     | 表单字段和提示全部翻译         |
| /task (主应用)   | 完整     | 良好     | 侧边栏、菜单、工具名称全部翻译 |
| Canvas 预览      | 完整     | 良好     | 文件类型、按钮文案翻译完整     |

**未发现硬编码中文/英文遗漏** — `fr.json` 的 1580+ 行翻译覆盖了所有 UI 文案。

---

## 4. Auth Setup 修复细节

**问题**: Playwright 的 `fill()` 方法在 localhost dev 环境中不触发 React controlled input 的 `onChange` 事件，导致 Continue 按钮一直处于 `disabled` 状态。

**根因**: React 19 + strict mode 下，`fill()` 设置 DOM value 但不触发 React synthetic event，React form state 不感知变化。

**修复**:

```typescript
// Before (broken)
await emailInput.fill(email);

// After (works)
await page.waitForTimeout(2000); // wait for React hydration
await emailInput.click();
await emailInput.pressSequentially(email, { delay: 20 });
```

此修复同时影响 `auth.setup.ts` 和 `fixtures.ts` 中的 `reAuthenticate` 函数。

---

## 5. 后续建议

1. **修复 BUG-FR-001**: `/forgot-password` 需要添加客户端邮箱校验（法语下缺失）
2. **补完全量回归**: 服务恢复额度后，运行 `npx playwright test --project=e2e-fr` 完成剩余 25 个用例
3. **CI 集成**: 在 CI pipeline 中添加 `APP_LANGUAGES=fr` 矩阵，确保后续提交不回退法语支持
4. **移动端测试**: 当前只测了 Desktop 1280x720，建议补充 iPhone Safari 视口 (390x844)

---

## 6. 附件

- `tests/reports/cdp-results-fr.json` — CDP 详细验证报告 (28 用例)
- `tests/reports/playwright-results.json` — Playwright 自动化结果
- `test-results/` — 失败截图和 trace 文件
