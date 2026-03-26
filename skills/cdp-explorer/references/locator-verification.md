# Phase 4 — Locator Verification + i18n Language Handling

> This file contains the verify mode locator verification logic and i18n-aware exploration rules.
> Referenced from the main SKILL.md Phase 4 and i18n sections.

## Phase 4: Locator Verification (verify mode only)

> **Called by playwright-script-generator after generating/modifying a POM.**

Verify whether existing locators uniquely match on the real page:

```
mcp__chrome-devtools__evaluate_script
  function: (selector, isRole) => {
    let count;
    if (isRole) {
      // Role-based selectors cannot directly use querySelectorAll, use approximation
      count = document.querySelectorAll(selector).length;
    } else {
      count = document.querySelectorAll(selector).length;
    }
    return count === 1 ? 'UNIQUE' : count === 0 ? 'ZERO' : `MULTIPLE(${count})`;
  }
  args: ["<CSS selector>", false]
```

For Playwright role-based locators, verify with equivalent CSS + aria attributes:

```
mcp__chrome-devtools__evaluate_script
  function: (role, name) => {
    const pattern = name ? new RegExp(name, 'i') : null;
    const els = document.querySelectorAll(`[role="${role}"], ${role}`);
    const matched = Array.from(els).filter(el =>
      !pattern || pattern.test(el.textContent?.trim()) ||
      pattern.test(el.getAttribute('aria-label') || '')
    );
    return matched.length === 1 ? 'UNIQUE' : matched.length === 0 ? 'ZERO' : `MULTIPLE(${matched.length})`;
  }
  args: ["button", "Submit"]
```

Output: `UNIQUE` (usable) / `MULTIPLE(n)` (needs narrowing) / `ZERO` (no match).

## Language Difference Handling (i18n-Aware Exploration)

CDP connects to the browser which may display in any language. When `projectContext.appLanguages` is set:

1. **Detect current page language**: `evaluate(() => document.documentElement.lang || document.cookie.match(/NEXT_LOCALE=(\w+)/)?.[1] || 'unknown')`
2. **Record both text and i18n key**: For each interactive element, if `projectContext.i18nMessagesDir` is available:
   a. Read the default locale messages JSON from `projectContext.i18nMessagesDir`（本地 QA_WORKSPACE_DIR/messages/）
   b. Reverse-lookup the element's displayed text to find the i18n key
   c. Store both in the baseline:
   ```json
   { "text": "Download file", "i18nKey": "canvas.downloadFile", "localeDetected": "en" }
   ```
3. If i18n messages are NOT available: record only the displayed text + detected locale, annotate `i18nAware: false`
4. When generating locators, prioritize **language-agnostic attributes**: CSS class > `aria-label` > `data-testid` (if present)
5. If text matching is necessary → store the i18n key for downstream POM generation to resolve at runtime via `i18n.t('key')`
