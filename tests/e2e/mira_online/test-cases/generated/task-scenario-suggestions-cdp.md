# Test Cases — Task Page Scenario Suggestion Cards (`scenario-suggestions`)

- Feature slug: `task-scenario-suggestions`
- Source: CDP live page (baseline: `page-baseline-task.json`, areaScope: `scenario-suggestions`)
- Target URL: `https://www.mira.day/task`
- Languages: zh (primary, per `APP_LANGUAGES=zh`)
- Generated: 2026-04-20
- Companion spec (not duplicated here): `tests/e2e/testcases/generated/task-scenario-send-verify-fix.test.ts`
  covers: click-card → submit → navigate to `/task/{id}` (MIRA-1318).

## Context & Behaviour under Test

Confirmed via live CDP on 2026-04-20:
1. Clicking a scenario card fills the textarea with **only** `card.description` (title is **not** included).
2. Clicking a second card fully **replaces** the textarea value, including any user-typed content. No confirmation is shown.
3. All 4 scenario cards remain visible after a card is clicked. They disappear only after navigation to `/task/{taskId}`.
4. The Submit button transitions `disabled → enabled` as soon as the textarea is populated.

Cards visible on /task (desktop 2×2 grid):
| idx | title | description |
|---|---|---|
| 0 | 目标公司 Mapping 与触达 | 针对目标公司进行 Mapping，筛出最可能看机会的 5 人，并生成触达话术 |
| 1 | 上海 Fintech 产品总监 Longlist | 整理一份上海 fintech 产品总监的 longlist，挑出有 0-1 经验的人选 |
| 2 | 候选人背调与推荐报告 | 针对人选从公开渠道补全背景信息，撰写推荐报告，并起草发送给客户的推荐邮件 |
| 3 | JD 匹配人选与排序 | 根据 JD 在主流招聘网站筛选人选，挑出最匹配的 20 位并附匹配理由 |

Source component (for traceability): `apps/mira-work/components/scenario-cards.tsx` —
`onClick={() => onSelect(card.caseId, description)}` proves only `description` is injected.

Existing coverage already present in `task-scenario-send-verify-fix.test.ts`:
- TC-VF-TSS-001 P0 click card[0] + submit → `/task/{id}`
- TC-VF-TSS-002 P1 sent scenario message appears in chat log
- TC-VF-TSS-003 P1 empty input → submit disabled, no navigation
- TC-VF-TSS-004 P1 label + ≥1 card visible on /task

→ This file adds **gap coverage only** (content integrity, iteration, overwrite semantics, visibility after click).
None of the cases below submit the form (no data pollution; submit path is owned by the verify-fix spec).

---

## Method 1: Equivalence Partitioning

Input variable: **scenario card index `i`** (one equivalence class — "any valid card index in [0, 3]").
All 4 cards behave identically (same button, same onSelect handler). Instead of picking a single representative, TC-TSS-SG-001 iterates the whole class to catch per-card regressions cheaply.

| Class | Representative | Expected |
|---|---|---|
| Valid card index | `i ∈ {0,1,2,3}` | Click fills textarea with `card.description`, enables Submit |

→ Produces **TC-TSS-SG-001**.

---

## Method 2: Boundary Value Analysis

Card index has a well-defined boundary: `[0, 3]` (there are exactly 4 cards). We cover:
- Lower boundary `i=0` (exercised as part of TC-TSS-SG-001 loop and by verify-fix TC-VF-TSS-001).
- Upper boundary `i=3` (exercised as part of TC-TSS-SG-001 loop — last card must also work).
- Count boundary "exactly 4 cards" — TC-TSS-SG-005.

Textarea value length has a boundary transition on the overwrite: old-length → new-length with no intermediate concat. TC-TSS-SG-003 asserts `value.length === description.length` (no appended old content).

→ Produces **TC-TSS-SG-005**; strengthens assertions in TC-TSS-SG-001 / TC-TSS-SG-003.

---

## Method 3: Cause-Effect Graph

| Cause | Effect |
|---|---|
| C1: user clicks scenario card `i` | E1: textarea.value ← `cards[i].description` |
| C1 | E2: Submit transitions disabled → enabled |
| C1 | E3: scenario cards stay visible (not hidden) |
| C2: user had typed text first, then clicks card `i` | E1' (overwrite, no merge): textarea.value ← `cards[i].description` only |
| C3: user clicks card A, then card B | E1'' : textarea.value ← `cards[B].description` only |

Coverage:
- C1 → E1, E2 covered by TC-TSS-SG-001 / TC-TSS-SG-002.
- C1 → E3 covered by TC-TSS-SG-006.
- C2 → E1' covered by TC-TSS-SG-004.
- C3 → E1'' covered by TC-TSS-SG-003.

→ Produces **TC-TSS-SG-002, TC-TSS-SG-003, TC-TSS-SG-004, TC-TSS-SG-006**.

---

## Method 4: State Transition Testing

States (from baseline):
- `S0`: `/task` loaded, textarea empty, Submit disabled, 4 scenario cards visible.
- `S11`: `/task` loaded, textarea contains a card description, Submit enabled, 4 scenario cards still visible.

| From | Event | To | Covered by |
|---|---|---|---|
| S0 | click card[i] | S11 | TC-TSS-SG-001, -002 |
| S11 | click another card[j] (j≠i) | S11 (value replaced) | TC-TSS-SG-003 |
| S0 | user types text → click card[i] | S11 (value replaced, not appended) | TC-TSS-SG-004 |
| S11 | (no action, steady-state) cards remain visible | S11 | TC-TSS-SG-006 |
| S11 | click Submit | `/task/{taskId}` | owned by verify-fix TC-VF-TSS-001 (intentionally NOT re-tested here) |

→ Reinforces **TC-TSS-SG-003, -004, -006**.

---

## Method 5: Scenario Method

**Scenario A (happy path exploration)**: a new user lands on `/task`, scrolls through the 4 scenario suggestions, clicks each one to preview what it would send, but does not submit. Each click must fill the textarea and enable Submit.
→ TC-TSS-SG-001.

**Scenario B (switching minds)**: user clicks card[0], changes mind, clicks card[2]. Textarea must reflect the latest click only.
→ TC-TSS-SG-003.

**Scenario C (destructive overwrite)**: user types a custom prompt, then accidentally clicks a scenario card. The app silently replaces their text (current product decision — no dialog). We lock this behaviour so a future "append" or "confirmation modal" change fails the test loudly.
→ TC-TSS-SG-004.

**Scenario D (content integrity audit)**: label `试试以下场景` and all 4 cards must render with non-empty title+description so users can make an informed choice.
→ TC-TSS-SG-005.

---

## Method 6: Error Guessing

Potential regressions we want to fence:
- A card click starts injecting `title + description` (current source injects description only — easy regression).
  → TC-TSS-SG-002 asserts textarea value is a **proper substring shorter than** the full card textContent (i.e. NOT equal to the title+description concat).
- A card click appends to existing textarea value instead of replacing.
  → TC-TSS-SG-003, TC-TSS-SG-004 assert `value.length === newDescription.length` and value does NOT contain prior content.
- Cards are hidden after the first click (a variant seen in some A/B experiments).
  → TC-TSS-SG-006 asserts all 4 remain visible after a click, with no submit.
- A card renders with empty/null text (i18n key missing).
  → TC-TSS-SG-005 requires textContent of each card to be non-empty and card count === 4.
- Submit stays disabled after fill due to React controlled-component race.
  → TC-TSS-SG-001 re-checks `toBeEnabled()` after each click.

---

## Merged Test Case List

| ID | Priority | Title | Preconditions | Steps | Expected Result |
|---|---|---|---|---|---|
| TC-TSS-SG-001 | P0 | 遍历 4 张场景卡片：每次点击都能填充 textarea 并启用 Submit | 已登录；在 `/task`；场景区可见；getScenarioSuggestions().count()===4 | for i in 0..3: (1) 读取 textarea 初值 (2) 点击卡片 i (3) 读取 textarea 新值 (4) 检查 Submit 状态 | textarea 非空且不等于初值；Submit 启用；4 次迭代全部成立 |
| TC-TSS-SG-002 | P0 | 点击卡片后 textarea 仅包含 description，不包含 title | 已登录；在 `/task`；场景区可见 | for i in 0..3: (1) 读取卡片全部文本 cardFull = card.textContent（包含 title+description） (2) 点击卡片 i (3) 读取 textarea value | value 是 cardFull 的真子串（`cardFull.includes(value) && value.length < cardFull.length` 且 value 非空） |
| TC-TSS-SG-003 | P1 | 二次点击覆盖：textarea 被完全替换为第二张卡的 description | 已登录；在 `/task`；场景区可见 | (1) 点击卡片 0，记录 v0 = textarea.value (2) 点击卡片 2，记录 v2 = textarea.value (3) 读取卡片 2 全文 card2Full | v2 ≠ v0；card2Full 包含 v2 且 v2 长度 < card2Full 长度；v2 不包含 v0 |
| TC-TSS-SG-004 | P1 | 用户手动输入被场景卡片覆盖（锁定当前行为） | 已登录；在 `/task`；textarea 可用 | (1) fill textarea 为 `"USER_TYPED_XYZ_${timestamp}"` (2) 点击卡片 1 (3) 读取 textarea value (4) 读取卡片 1 全文 | value 不包含 `USER_TYPED_XYZ`；value 是卡片 1 全文的真子串且长度小于全文；Submit 依旧启用 |
| TC-TSS-SG-005 | P1 | 4 张卡片内容完整性 & label 可见 | 已登录；在 `/task` | (1) 断言 label "试试以下场景" 可见（i18n: dashboard.tryScenarios） (2) 断言 getScenarioSuggestions().count() === 4 (3) 依次断言每张卡片可见、可点击、textContent 非空 | label 可见且文案等于 i18n.t('dashboard.tryScenarios')；卡片数量===4；每张卡片可见、enabled、文本 trim 后长度>0 |
| TC-TSS-SG-006 | P2 | 点击卡片后，4 张卡片仍保持可见（不触发提交） | 已登录；在 `/task`；场景区可见 | (1) 断言 4 张卡片可见 (2) 点击卡片 0 (3) 断言 4 张卡片仍然可见 (4) 未点击 Submit，URL 仍为 `/task` | 点击前后 getScenarioSuggestions().count() === 4，且每张卡片 isVisible()===true；page.url() 保持 `/task` |
