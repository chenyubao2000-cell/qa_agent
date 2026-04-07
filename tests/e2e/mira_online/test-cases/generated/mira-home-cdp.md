# Mira Homepage E2E Test Cases (CDP)

<!-- Source: Chrome CDP — https://www.mira.day/ — 2026-03-23 -->
<!-- baseline: test-cases/generated/page-baseline-mira-home.json -->

## User Stories (CDP-inferred)

### US-CDP-TABS: Feature Tab Switching
As a visitor, I want to switch between Core and Recruiting tabs so that I can view different feature categories.

### US-CDP-LANG: Language Selector
As a visitor, I want to switch the site language so that I can read content in my preferred language.

### US-CDP-NAV: Top Navigation
As a visitor, I want to use the top navigation links so that I can navigate to Sign In or Join Waitlist pages.

### US-CDP-HERO: Hero CTA
As a visitor, I want to click the hero call-to-action so that I can join the waitlist.

### US-CDP-BOTTOM: Bottom CTA
As a visitor, I want to click the bottom call-to-action so that I can request early access.

---

## Method 1: Equivalence Partitioning

| ID | 输入域 | 有效等价类 | 无效等价类 |
|----|--------|-----------|-----------|
| EP-1 | Tab 选择 | 核心 tab (默认激活) | N/A (只有两个 tab) |
| EP-2 | Tab 选择 | 招聘 tab | N/A |
| EP-3 | 语言选择 | 简体中文 (默认) | N/A (只有两个语言) |
| EP-4 | 语言选择 | English | N/A |
| EP-5 | 导航链接 | 登录链接 → /task | N/A |
| EP-6 | 导航链接 | 加入等待名单 → /join-waitlist | N/A |
| EP-7 | Hero CTA | 加入等待名单按钮 → /join-waitlist | N/A |
| EP-8 | Bottom CTA | 加入等待名单按钮 → /task | N/A |

**Test Cases:**

**TC-CDP-EP-001** [P1] 点击"核心"tab 显示核心功能卡片
- 前置条件：用户在首页，招聘 tab 激活
- 步骤：点击"核心"tab
- 预期：核心 tab 变为激活状态，显示 4 张核心功能卡片

**TC-CDP-EP-002** [P1] 点击"招聘"tab 显示招聘功能卡片
- 前置条件：用户在首页，核心 tab 激活
- 步骤：点击"招聘"tab
- 预期：招聘 tab 变为激活状态，显示 4 张招聘功能卡片

---

## Method 2: Boundary Value Analysis

| ID | 边界 | 测试点 |
|----|------|--------|
| BV-1 | Tab 切换往返 | 核心→招聘→核心 round-trip |
| BV-2 | 语言切换往返 | 中文→英文→中文 round-trip |

**Test Cases:**

**TC-CDP-BV-001** [P2] Tab 切换 round-trip：核心→招聘→核心
- 前置条件：用户在首页，核心 tab 激活
- 步骤：点击招聘 tab → 点击核心 tab
- 预期：核心 tab 再次激活，核心功能卡片正确显示

**TC-CDP-BV-002** [P2] 语言切换 round-trip：中文→英文→中文
- 前置条件：用户在首页（中文）
- 步骤：打开语言下拉 → 选择 English → 打开语言下拉 → 选择简体中文
- 预期：页面恢复中文，所有文本正确

---

## Method 3: Cause-Effect Graph

| 原因 | 结果 |
|------|------|
| 点击招聘 tab | 核心 tab 变为 inactive，招聘 tab 变为 active，招聘卡片可见 |
| 点击核心 tab | 招聘 tab 变为 inactive，核心 tab 变为 active，核心卡片可见 |
| 选择 English | 所有 UI 文本切换为英文 |
| 选择简体中文 | 所有 UI 文本切换为中文 |
| 点击导航"登录" | 跳转到 /task (或 /sign-in) |
| 点击 Hero CTA | 跳转到 /join-waitlist |
| 点击 Bottom CTA | 跳转到 /task |

**Test Cases:**

**TC-CDP-CE-001** [P1] 切换到招聘 tab 时核心 tab 变为非激活状态
- 前置条件：用户在首页，核心 tab 激活
- 步骤：点击"招聘"tab
- 预期：核心 tab 状态为 inactive，招聘 tab 状态为 active

---

## Method 4: State Transition Testing

| 当前状态 | 事件 | 目标状态 |
|----------|------|----------|
| S0 (核心 tab 激活, 中文) | 点击招聘 tab | S1 (招聘 tab 激活) |
| S1 (招聘 tab 激活) | 点击核心 tab | S0 (核心 tab 激活) |
| S0 | 点击语言下拉 | S2 (下拉展开) |
| S2 (下拉展开) | 选择 English | S3 (英文页面) |
| S3 (英文页面) | 选择简体中文 | S0 (中文页面) |

**Test Cases:**

**TC-CDP-ST-001** [P1] 语言切换：中文→英文，验证所有区域文本
- 前置条件：用户在首页（中文）
- 步骤：打开语言下拉 → 选择 English
- 预期：导航、Hero、Tab、功能卡片、底部 CTA 所有文本切换为英文

---

## Method 5: Scenario Method

**TC-CDP-SC-001** [P0] 首页核心功能展示完整场景
- 前置条件：无
- 步骤：1. 访问首页 2. 验证 Hero 区域标题和 CTA 3. 验证核心 tab 激活 4. 验证 4 张核心功能卡片 5. 验证底部 CTA
- 预期：所有元素可见且内容正确

**TC-CDP-SC-002** [P0] 首页导航链接正确跳转
- 前置条件：无
- 步骤：1. 访问首页 2. 点击导航"登录" 3. 验证跳转 URL
- 预期：跳转到 /task 或 /sign-in

**TC-CDP-SC-003** [P0] Hero CTA 跳转到 Join Waitlist 页面
- 前置条件：无
- 步骤：1. 访问首页 2. 点击 Hero 区域"加入等待名单"
- 预期：跳转到 /join-waitlist

**TC-CDP-SC-004** [P1] 底部 CTA 跳转
- 前置条件：无
- 步骤：1. 访问首页 2. 滚动到底部 3. 点击底部"加入等待名单"
- 预期：跳转到 /task

---

## Method 6: Error Guessing

**TC-CDP-EG-001** [P2] 重复快速点击 tab 不应导致显示异常
- 前置条件：用户在首页
- 步骤：快速连续点击核心和招聘 tab
- 预期：最终停留在最后点击的 tab，内容正确显示

**TC-CDP-EG-002** [P2] 语言切换后 tab 状态保持
- 前置条件：用户在首页，招聘 tab 激活
- 步骤：切换到英文
- 预期：招聘 tab 仍然激活，显示英文招聘功能卡片

---

## Merged Test Case List

| TC ID | 标题 | 优先级 | 来源方法 | 场景类型 |
|-------|------|--------|---------|---------|
| **TC-CDP-HOME-001** | 首页核心功能展示完整：Hero + 核心 tab + 功能卡片 + 底部 CTA | P0 | Scenario | positive |
| **TC-CDP-HOME-002** | 导航"登录"链接跳转到 /task | P0 | Scenario | positive |
| **TC-CDP-HOME-003** | Hero CTA"加入等待名单"跳转到 /join-waitlist | P0 | Scenario | positive |
| **TC-CDP-HOME-004** | 点击"招聘"tab 切换显示招聘功能卡片 | P1 | EP + CE | positive |
| **TC-CDP-HOME-005** | 点击"核心"tab 切换显示核心功能卡片 | P1 | EP + CE | positive |
| **TC-CDP-HOME-006** | 语言切换：中文→英文，验证文本 i18n 正确 | P1 | ST | positive |
| **TC-CDP-HOME-007** | 底部 CTA"加入等待名单"跳转到 /task | P1 | Scenario | positive |
| **TC-CDP-HOME-008** | 导航"加入等待名单"链接跳转到 /join-waitlist | P1 | EP | positive |
| **TC-CDP-HOME-009** | Tab 切换 round-trip：核心→招聘→核心 | P2 | BV | boundary |
| **TC-CDP-HOME-010** | 语言切换 round-trip：中文→英文→中文 | P2 | BV | boundary |
| **TC-CDP-HOME-011** | 语言切换后 tab 状态保持 | P2 | EG | positive |

**Priority Distribution:** P0: 3 (27%) | P1: 5 (45%) | P2: 3 (27%) — within recommended ratio.
