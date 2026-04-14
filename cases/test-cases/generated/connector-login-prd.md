<!-- PRD-hash: connector-login-s11s12 | PRD-module: S11 Login + S12 Enterprise Email Detection | feature-slug: connector-login -->

# Login 与企业邮箱识别测试用例 (PRD)

> 来源：connector_0409-fancy.pen — S11/S12
> Tags: @prd @connector-login
> 注意：基础登录功能（邮箱输入/密码步骤）已由 sign-in-cdp 覆盖，本文件仅生成 PRD 新增的 OAuth、企业邮箱识别、Authing SSO 相关用例

---

## Method 1: Equivalence Partitioning

### 邮箱类型等价类

| 输入条件 | 有效等价类 | ID | 无效等价类 | ID |
|---------|----------|-----|----------|-----|
| 邮箱后缀类型 | 普通邮箱（gmail.com 等） | V1 | 空邮箱 | I1 |
| | 科锐邮箱（@careerintlinc.com） | V2 | 无效格式 | I2 |
| OAuth 提供商 | Google | V3 | — | — |
| | Microsoft | V4 | — | — |

**TC-PRD-LOGIN-001**: 普通邮箱输入后进入验证码/密码流程
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 在邮箱输入框输入 "user@gmail.com" 2. 点击 Continue
- **预期结果:** 进入验证码或密码输入流程（非企业识别页面）
- **测试数据:** user@gmail.com (V1)

**TC-PRD-LOGIN-002**: 科锐邮箱输入后跳转 S12 企业邮箱识别页
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 在邮箱输入框输入 "user@careerintlinc.com" 2. 点击 Continue
- **预期结果:** 自动跳转至 S12 企业邮箱识别页面，显示 "Enterprise account" 标题和 "CareerInt enterprise account detected" 提示
- **测试数据:** user@careerintlinc.com (V2)

**TC-PRD-LOGIN-003**: Continue with Google 按钮触发 OAuth
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 点击 "Continue with Google" 按钮
- **预期结果:** 跳转至 Google OAuth 认证页面（V3）

**TC-PRD-LOGIN-004**: Continue with Microsoft 按钮触发 OAuth
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 点击 "Continue with Microsoft" 按钮
- **预期结果:** 跳转至 Microsoft OAuth 认证页面（V4）

---

## Method 2: Boundary Value Analysis

N/A — 邮箱格式边界已由 sign-in-cdp 覆盖（TC-CDP-SIGNIN-002/003）。本模块新增功能无额外边界参数。

---

## Method 3: Cause-Effect Graph / Decision Table

### 邮箱类型 × 登录方式决策表

因素：C1=邮箱类型（普通/科锐），C2=登录方式（邮箱/Google/Microsoft）
效果：E1=密码/验证码流程，E2=企业识别(S12)→Authing，E3=Google OAuth，E4=Microsoft OAuth

| 规则 | C1 (邮箱类型) | C2 (登录方式) | E1 | E2 | E3 | E4 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|
| R1 | 普通 | 邮箱+Continue | Y | N | N | N |
| R2 | 科锐 | 邮箱+Continue | N | Y | N | N |
| R3 | — | Google | N | N | Y | N |
| R4 | — | Microsoft | N | N | N | Y |

**TC-PRD-LOGIN-005**: Google OAuth 成功后直接进入首页（无需验证邮箱）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户在 /sign-in 登录页，有 Google 账号
- **操作步骤:** 1. 点击 "Continue with Google" 2. 完成 Google OAuth 认证
- **预期结果:** OAuth 成功后页面刷新直接进入首页，无需验证邮箱和邀请码

**TC-PRD-LOGIN-006**: Microsoft OAuth 成功后直接进入首页
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户在 /sign-in 登录页，有 Microsoft 账号
- **操作步骤:** 1. 点击 "Continue with Microsoft" 2. 完成 Microsoft OAuth 认证
- **预期结果:** OAuth 成功后页面刷新直接进入首页，无需验证邮箱和邀请码

---

## Method 4: State Transition Testing

### S11 → S12 → Authing 状态流

状态：S0=S11登录页, S1=S12企业识别页, S2=Authing SSO, S3=首页

| 当前状态 | 事件 | 下一状态 |
|---------|------|---------|
| S11登录页 | 输入科锐邮箱+Continue | S12企业识别页 |
| S12企业识别页 | 点击 Continue with Authing | Authing SSO |
| S12企业识别页 | 点击 Edit | S11登录页（保留邮箱） |
| S12企业识别页 | 点击 Back to Login | S11登录页（清空邮箱） |
| Authing SSO | 认证成功 | 首页 |

**TC-PRD-LOGIN-007**: S12 企业识别页显示正确内容
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户输入科锐邮箱后跳转至 S12
- **操作步骤:** 1. 观察页面标题 2. 检查副标题 3. 检查邮箱显示 4. 检查提示卡片 5. 检查按钮
- **预期结果:** 标题 "Enterprise account"，副标题 "Sign in with your organization credentials"，邮箱只读显示，提示 "CareerInt enterprise account detected"，显示 "Continue with Authing" 按钮

**TC-PRD-LOGIN-008**: S12 点击 Edit 返回 S11 并保留邮箱
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 点击邮箱右侧 "Edit" 文字按钮
- **预期结果:** 返回 S11 登录页，邮箱输入框保留之前输入的科锐邮箱

**TC-PRD-LOGIN-009**: S12 点击 Back to Login 返回 S11 并清空邮箱
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 点击 "Back to Login" 链接
- **预期结果:** 返回 S11 登录页，邮箱输入框为空

**TC-PRD-LOGIN-010**: S12 点击 Continue with Authing 跳转 SSO
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 点击 "Continue with Authing" 按钮
- **预期结果:** 跳转至 Authing SSO 认证页面

---

## Method 5: Scenario Method

### 企业用户完整登录流程

基本流: S11 输入科锐邮箱 → S12 确认企业身份 → Continue with Authing → Authing SSO → 首页（自动激活 connector）
备选流1: S12 → Edit → S11 修改邮箱
备选流2: S12 → Back to Login → S11 重新开始

**TC-PRD-LOGIN-011**: 企业用户完整登录流程 — 科锐邮箱 → S12 → Authing → 首页
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户在 /sign-in 页面，持有科锐企业邮箱
- **操作步骤:** 1. 输入 "user@careerintlinc.com" 2. 点击 Continue 3. 确认进入 S12 4. 点击 "Continue with Authing" 5. 完成 Authing SSO 认证
- **预期结果:** 成功进入首页，科锐用户自动激活 connector

**TC-PRD-LOGIN-012**: 企业用户误操作后修改邮箱重新登录
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 点击 Edit 返回 S11 2. 清空邮箱 3. 输入普通邮箱 "user@gmail.com" 4. 点击 Continue
- **预期结果:** 进入普通邮箱的验证码/密码流程，不再跳转 S12

---

## Method 6: Error Guessing

**TC-PRD-LOGIN-013**: 登录页右上角语言切换功能
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 点击右上角语言切换按钮（EN）2. 切换语言
- **预期结果:** 页面文案正确切换语言，不影响登录功能

**TC-PRD-LOGIN-014**: mira.day 和 mina.run 均能进入 S12
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户访问不同域名的登录页
- **操作步骤:** 1. 在 mira.day 登录页输入科锐邮箱 2. 在 mina.run 登录页输入科锐邮箱
- **预期结果:** 两个域名均能正确识别企业邮箱并跳转 S12

**TC-PRD-LOGIN-015**: S12 邮箱为只读不可编辑
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 尝试点击邮箱显示区域 2. 尝试直接修改邮箱文字
- **预期结果:** 邮箱为只读状态，不可直接编辑，只能通过 Edit 按钮返回 S11 修改

---

## Merged Test Case List

**TC-PRD-LOGIN-001**: 普通邮箱输入后进入验证码/密码流程
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 在邮箱输入框输入 "user@gmail.com" 2. 点击 Continue
- **预期结果:** 进入验证码或密码输入流程（非企业识别页面）
- **测试数据:** user@gmail.com

**TC-PRD-LOGIN-002**: 科锐邮箱输入后跳转 S12 企业邮箱识别页
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 在邮箱输入框输入 "user@careerintlinc.com" 2. 点击 Continue
- **预期结果:** 自动跳转至 S12 企业邮箱识别页面，显示 "Enterprise account" 标题和 "CareerInt enterprise account detected" 提示
- **测试数据:** user@careerintlinc.com

**TC-PRD-LOGIN-003**: Continue with Google 按钮触发 OAuth
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 点击 "Continue with Google" 按钮
- **预期结果:** 跳转至 Google OAuth 认证页面

**TC-PRD-LOGIN-004**: Continue with Microsoft 按钮触发 OAuth
- **优先级:** P0
- **测试类型:** 等价类划分
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 点击 "Continue with Microsoft" 按钮
- **预期结果:** 跳转至 Microsoft OAuth 认证页面

**TC-PRD-LOGIN-005**: Google OAuth 成功后直接进入首页（无需验证邮箱）
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户在 /sign-in 登录页，有 Google 账号
- **操作步骤:** 1. 点击 "Continue with Google" 2. 完成 Google OAuth 认证
- **预期结果:** OAuth 成功后页面刷新直接进入首页，无需验证邮箱和邀请码

**TC-PRD-LOGIN-006**: Microsoft OAuth 成功后直接进入首页
- **优先级:** P0
- **测试类型:** 因果图
- **前置条件:** 用户在 /sign-in 登录页，有 Microsoft 账号
- **操作步骤:** 1. 点击 "Continue with Microsoft" 2. 完成 Microsoft OAuth 认证
- **预期结果:** OAuth 成功后页面刷新直接进入首页，无需验证邮箱和邀请码

**TC-PRD-LOGIN-007**: S12 企业识别页显示正确内容
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户输入科锐邮箱后跳转至 S12
- **操作步骤:** 1. 观察页面标题 2. 检查副标题 3. 检查邮箱显示 4. 检查提示卡片 5. 检查按钮
- **预期结果:** 标题 "Enterprise account"，副标题 "Sign in with your organization credentials"，邮箱只读显示，提示 "CareerInt enterprise account detected"，显示 "Continue with Authing" 按钮

**TC-PRD-LOGIN-008**: S12 点击 Edit 返回 S11 并保留邮箱
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 点击邮箱右侧 "Edit" 文字按钮
- **预期结果:** 返回 S11 登录页，邮箱输入框保留之前输入的科锐邮箱

**TC-PRD-LOGIN-009**: S12 点击 Back to Login 返回 S11 并清空邮箱
- **优先级:** P1
- **测试类型:** 状态迁移
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 点击 "Back to Login" 链接
- **预期结果:** 返回 S11 登录页，邮箱输入框为空

**TC-PRD-LOGIN-010**: S12 点击 Continue with Authing 跳转 SSO
- **优先级:** P0
- **测试类型:** 状态迁移
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 点击 "Continue with Authing" 按钮
- **预期结果:** 跳转至 Authing SSO 认证页面

**TC-PRD-LOGIN-011**: 企业用户完整登录流程 — 科锐邮箱 → S12 → Authing → 首页
- **优先级:** P0
- **测试类型:** 场景法
- **前置条件:** 用户在 /sign-in 页面，持有科锐企业邮箱
- **操作步骤:** 1. 输入 "user@careerintlinc.com" 2. 点击 Continue 3. 确认进入 S12 4. 点击 "Continue with Authing" 5. 完成 Authing SSO 认证
- **预期结果:** 成功进入首页，科锐用户自动激活 connector

**TC-PRD-LOGIN-012**: 企业用户误操作后修改邮箱重新登录
- **优先级:** P1
- **测试类型:** 场景法
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 点击 Edit 返回 S11 2. 清空邮箱 3. 输入普通邮箱 "user@gmail.com" 4. 点击 Continue
- **预期结果:** 进入普通邮箱的验证码/密码流程，不再跳转 S12

**TC-PRD-LOGIN-013**: 登录页右上角语言切换功能
- **优先级:** P2
- **测试类型:** 错误猜测
- **前置条件:** 用户在 /sign-in 登录页
- **操作步骤:** 1. 点击右上角语言切换按钮（EN）2. 切换语言
- **预期结果:** 页面文案正确切换语言，不影响登录功能

**TC-PRD-LOGIN-014**: mira.day 和 mina.run 均能进入 S12
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户访问不同域名的登录页
- **操作步骤:** 1. 在 mira.day 登录页输入科锐邮箱 2. 在 mina.run 登录页输入科锐邮箱
- **预期结果:** 两个域名均能正确识别企业邮箱并跳转 S12

**TC-PRD-LOGIN-015**: S12 邮箱为只读不可编辑
- **优先级:** P1
- **测试类型:** 错误猜测
- **前置条件:** 用户在 S12 企业识别页
- **操作步骤:** 1. 尝试点击邮箱显示区域 2. 尝试直接修改邮箱文字
- **预期结果:** 邮箱为只读状态，不可直接编辑，只能通过 Edit 按钮返回 S11 修改
