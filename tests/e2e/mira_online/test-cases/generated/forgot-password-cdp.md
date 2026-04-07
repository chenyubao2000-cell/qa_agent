# Forgot Password — E2E Test Cases (CDP)

> Source: CDP baseline `page-baseline-forgot-password.json`
> Page: https://www.mira.day/forgot-password
> Generated: 2026-03-23

---

## Method 1: Equivalence Partitioning

### EP-1: Email input field — valid/invalid partitions

| Partition | Representative Value | Expected Result |
|-----------|---------------------|-----------------|
| Valid email format | `test@example.com` | 进入确认步骤 (S2) |
| Invalid email — no @ | `notanemail` | 显示验证错误 |
| Invalid email — no domain | `user@` | 显示验证错误 |
| Empty string | (blank) | 显示验证错误 |

**TC from EP:**

**TC-CDP-FP-001** [P0] 输入有效邮箱后点击发送重置链接，进入确认步骤
- 前置条件：用户在 /forgot-password 页面
- 步骤：在邮箱输入框输入有效邮箱 → 点击"发送重置链接"按钮
- 预期：页面进入确认步骤，显示确认文案和"继续"按钮

**TC-CDP-FP-002** [P1] 输入无效邮箱后点击发送重置链接，显示验证错误
- 前置条件：用户在 /forgot-password 页面
- 步骤：在邮箱输入框输入无效邮箱（如 `notanemail`）→ 点击"发送重置链接"按钮
- 预期：显示"请输入有效的邮箱地址"错误提示

---

## Method 2: Boundary Value Analysis

### BVA-1: Email input boundary

| Boundary | Value | Expected Result |
|----------|-------|-----------------|
| Empty (min boundary) | "" | 验证错误 |
| 单字符 | "a" | 验证错误 |
| 最大长度邮箱 (254 chars) | `a{245}@test.com` | 取决于后端，但应正常提交或提示 |

**TC from BVA:**

**TC-CDP-FP-003** [P1] 提交空邮箱时显示验证错误
- 前置条件：用户在 /forgot-password 页面
- 步骤：不输入任何内容 → 点击"发送重置链接"
- 预期：显示验证错误提示

---

## Method 3: Cause-Effect Graph

### CE-1: Form submission decision table

| Condition | C1 | C2 | C3 |
|-----------|----|----|-----|
| Email filled | N | Y | Y |
| Email valid format | - | N | Y |
| **Effect** | | | |
| Show validation error | Y | Y | N |
| Go to confirmation step | N | N | Y |

**TC from CE:** (Covered by TC-CDP-FP-001, TC-CDP-FP-002, TC-CDP-FP-003)

---

## Method 4: State Transition Testing

### ST-1: Page state graph

```
S0 (Email input) --[submit invalid]--> S1 (Validation error)
S0 (Email input) --[submit valid]----> S2 (Confirmation step)
S2 (Confirmation) --[click back to login]--> /sign-in
S0 (Email input) --[click back to login]--> /sign-in
```

**TC from ST:**

**TC-CDP-FP-004** [P0] 确认步骤点击"返回登录"导航到 /sign-in
- 前置条件：用户在确认步骤 (S2)
- 步骤：点击"返回登录"按钮
- 预期：跳转到 /sign-in 页面

**TC-CDP-FP-005** [P1] 邮箱输入页点击"返回登录"链接导航到 /sign-in
- 前置条件：用户在 /forgot-password 页面 (S0)
- 步骤：点击"返回登录"链接
- 预期：跳转到 /sign-in 页面

---

## Method 5: Scenario Method

### Scenario 1: 完整密码重置请求流程

**TC-CDP-FP-006** [P0] 用户完成完整的密码重置请求流程（输入邮箱 → 确认 → 继续）
- 前置条件：用户在 /forgot-password 页面
- 步骤：
  1. 看到"忘记密码"标题和说明文案
  2. 在邮箱输入框输入有效邮箱
  3. 点击"发送重置链接"
  4. 确认页面显示邮箱和确认文案
  5. 点击"继续"按钮
- 预期：重置链接发送请求被提交

---

## Method 6: Error Guessing

**TC-CDP-FP-007** [P2] 多次提交同一邮箱不导致页面崩溃
- 前置条件：用户在 /forgot-password 页面
- 步骤：输入有效邮箱 → 返回 → 再次输入同一邮箱 → 提交
- 预期：页面正常响应，不报错

**TC-CDP-FP-008** [P1] 页面初始状态正确显示所有 UI 元素
- 前置条件：导航到 /forgot-password
- 步骤：检查页面初始渲染
- 预期：标题、描述、邮箱输入框、发送按钮、返回登录链接均可见

---

## Merged Test Case List

| ID | Title | Priority | Method | Type |
|----|-------|----------|--------|------|
| **TC-CDP-FP-001** | 输入有效邮箱后点击发送重置链接，进入确认步骤 | P0 | EP | positive |
| **TC-CDP-FP-002** | 输入无效邮箱后点击发送重置链接，显示验证错误 | P1 | EP | negative |
| **TC-CDP-FP-003** | 提交空邮箱时显示验证错误 | P1 | BVA | negative |
| **TC-CDP-FP-004** | 确认步骤点击"返回登录"导航到 /sign-in | P0 | ST | positive |
| **TC-CDP-FP-005** | 邮箱输入页点击"返回登录"链接导航到 /sign-in | P1 | ST | positive |
| **TC-CDP-FP-006** | 用户完成完整的密码重置请求流程 | P0 | Scenario | positive |
| **TC-CDP-FP-007** | 多次提交同一邮箱不导致页面崩溃 | P2 | EG | negative |
| **TC-CDP-FP-008** | 页面初始状态正确显示所有 UI 元素 | P1 | EG | positive |

**Priority distribution**: P0: 3/8 (37.5%) → slightly high but acceptable for a core auth flow, P1: 3/8 (37.5%), P2: 2/8 (25%)
