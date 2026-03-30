# Handoff Field Resolution Reference

## setup[]/teardown[] Entry Schema and Code Generation

| Field | Type | Description | Code generation |
|-------|------|-------------|-----------------|
| `type` | `"navigate"` \| `"ui"` \| `"api"` | Operation category | `navigate` → `await page.goto(url)`; `ui` → POM method call; `api` → `request.post(...)` |
| `url` | `string` | Target URL (when `type: "navigate"`) | `await page.goto(url)` |
| `action` | `string` | CRUD verb (when `type: "ui"`) | Maps to POM method via `pomMethod` |
| `pomMethod` | `string` | POM method name (when `type: "ui"`) | `await xxxPage.{pomMethod}(data)` — if POM lacks this method, add it |
| `resource` | `string` | Resource type being operated on | Used for POM method naming and unique data suffix |
| `data` | `object` | Key-value pairs for the operation | Passed as argument to POM method; `{timestamp}` → `Date.now()` |

**Lifecycle mapping:**
- `setup[]` entries → `test.beforeAll` (shared fixture) or `test.beforeEach` (per-test isolation)
- `teardown[]` entries → `test.afterAll` or `test.afterEach`
- Empty `setup[]` on an action that requires it → infer from `preconditions[]`; if both empty → flag error

---

## assertions[].selector Clarification

`assertions[].selector` is an **ARIA role** (e.g. `"heading"`, `"button"`), NOT a CSS selector. Build locator with `page.getByRole(selector, { name })`.

---

## `expected` Value Resolution

Mandatory for assertion types: `text`, `url`, `value`, `count`.

| `expected` | `i18nKey` | Resolution |
|------------|-----------|------------|
| non-null | any | Use literal: `toHaveText('Welcome')` |
| null | non-null | Resolve via i18n: `toHaveText(i18n.t('page.welcome'))` |
| null | null | **Error** for `text`/`url`/`value`/`count`; OK for `visible`/`hidden`/`enabled`/`disabled` |

---

## Timeout Two-Pass Strategy

1. **Pass 1 — handoff 驱动 (primary)**: Entry has `"timeout": <ms>` (non-null) → insert `test.setTimeout(<ms>)` as first statement. This is the **authoritative source** — test-case-generator detects AI/long-running keywords (`send message`, `wait for completion`, `创建任务`, etc.) and sets this field.
2. **Pass 2 — code pattern 兜底 (fallback)**: After all specs generated, scan for `waitForSelector.*timeout.*[3-9]\d{4}`, `waitForResponse`, `expect.poll`, `sendMessage`, `createTask`, `waitForTask`. Any matching `test()` missing `test.setTimeout()` → auto-insert `test.setTimeout(600_000)` and log.
