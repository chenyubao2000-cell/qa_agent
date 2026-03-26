# Phase 2: Initial State Scan — Detailed DOM Scan

> This file contains the full DOM scan JavaScript, Layer 2/3 details, and i18n reverse-lookup logic.
> Referenced from the main SKILL.md Phase 2 section.

## Layer 1 — DOM Structure Scan (Language-agnostic, preferred)

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const root = document.querySelector('main') || document.body;

    function scanRegion(container, regionName) {
      // Interactive elements
      // Broad-coverage selector: covers all interactive element types
      const selectorMatched = new Set(container.querySelectorAll(
        'button, [role="button"], a[href], input, textarea, select, ' +
        '[role="tab"], [role="menuitem"], [role="option"], [role="switch"], ' +
        '[role="checkbox"], [role="radio"], [role="slider"], [role="spinbutton"], ' +
        '[role="treeitem"], [role="gridcell"], [role="link"], [role="searchbox"], ' +
        '[role="combobox"], [role="listbox"], ' +
        '[contenteditable="true"], [draggable="true"], ' +
        '[onclick], [onchange], [onkeydown], [onkeyup], [ondblclick], [oncontextmenu], ' +
        '[data-testid], [data-action], [data-toggle], [data-target], [data-bs-toggle], ' +
        '[tabindex]:not([tabindex="-1"]), ' +
        'summary, details, label[for]'
      ));

      // Framework event listener detection (React/Vue/Svelte bind events via addEventListener,
      // not via HTML attributes — these elements have no [onclick] but are still interactive)
      // Detect by cursor:pointer style, which frameworks/CSS commonly set on clickable elements
      const cursorPointerEls = Array.from(container.querySelectorAll('div, span, li, section, article, td, tr'))
        .filter(el => {
          if (selectorMatched.has(el)) return false;  // Already captured by selector
          const style = window.getComputedStyle(el);
          return style.cursor === 'pointer' && el.offsetParent !== null && el.offsetWidth > 0;
        });

      const interactives = Array.from(new Set([...selectorMatched, ...cursorPointerEls])).map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        testId: el.dataset?.testid,
        ariaLabel: el.getAttribute('aria-label'),
        ariaDescribedby: el.getAttribute('aria-describedby'),
        ariaControls: el.getAttribute('aria-controls'),
        placeholder: el.getAttribute('placeholder'),
        text: el.textContent?.trim().substring(0, 200),
        title: el.getAttribute('title'),
        href: el.getAttribute('href'),
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
        required: el.required || el.getAttribute('aria-required') === 'true',
        readOnly: el.readOnly || el.getAttribute('aria-readonly') === 'true',
        maxLength: el.getAttribute('maxlength'),
        checked: el.checked ?? (el.getAttribute('aria-checked') === 'true'),
        selected: el.selected ?? (el.getAttribute('aria-selected') === 'true'),
        expanded: el.getAttribute('aria-expanded'),
        hasPopup: el.getAttribute('aria-haspopup'),
        draggable: el.getAttribute('draggable'),
        tabIndex: el.getAttribute('tabindex'),
        class: el.className?.toString().substring(0, 200),
        visible: el.offsetParent !== null || el.offsetWidth > 0,
        rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
        i18nKey: null,       // populated by Step 3.5 i18n reverse-lookup, e.g. "canvas.downloadFile"
        i18nAware: false,    // set to true after i18n key reverse-lookup is attempted
        locatorHint: null,   // populated after scan — best Playwright locator per Locator Priority rules (see baseline-schema.md)
        region: regionName
      }));

      // Section headings
      const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,[role="heading"]')).map(h => ({
        level: h.tagName.match(/\d/)?.[0] || h.getAttribute('aria-level') || '?',
        text: h.textContent?.trim().substring(0, 80),
        region: regionName
      }));

      return { interactives, headings };
    }

    // Region-based scanning (broad coverage: standard semantic regions + common UI framework layouts)
    const nav = document.querySelector('nav, [role="navigation"]');
    const sidebar = document.querySelector('aside, [role="complementary"], [class*="sidebar"], [class*="side-panel"]');
    const main = document.querySelector('main, [role="main"]') || root;
    const footer = document.querySelector('footer, [role="contentinfo"]');
    const header = document.querySelector('header, [role="banner"]');
    const toolbar = document.querySelector('[role="toolbar"]');

    const regions = {};
    if (header) regions.header = scanRegion(header, 'header');
    if (nav) regions.nav = scanRegion(nav, 'nav');
    if (toolbar) regions.toolbar = scanRegion(toolbar, 'toolbar');
    if (sidebar) regions.sidebar = scanRegion(sidebar, 'sidebar');
    regions.main = scanRegion(main, 'main');
    if (footer) regions.footer = scanRegion(footer, 'footer');

    // Popups/Modals (global scope)
    const dialogs = Array.from(document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'
    )).map(el => ({
      title: el.getAttribute('aria-label') || el.querySelector('h2,h3')?.textContent?.trim(),
      visible: el.offsetParent !== null,
      testId: el.dataset?.testid,
      class: el.className?.toString().substring(0, 80)
    }));

    // Status elements
    const alerts = Array.from(document.querySelectorAll('[role="alert"],[role="status"]')).map(el => ({
      role: el.getAttribute('role'),
      text: el.textContent?.trim().substring(0, 80)
    }));

    return {
      url: location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      regions,
      dialogs,
      alerts,
      summary: {
        totalInteractives: Object.values(regions).reduce((n, r) => n + r.interactives.length, 0),
        totalHeadings: Object.values(regions).reduce((n, r) => n + r.headings.length, 0),
        dialogCount: dialogs.length,
        alertCount: alerts.length
      }
    };
  }
```

## Step 3.5 — i18n key reverse-lookup (when `projectContext.i18nMessagesDir` is available)

After collecting all interactive elements and their displayed text:
1. Load `$i18nMessagesDir/{detectedLocale}.json`（i18nMessagesDir 由命令层传入，指向 QA_WORKSPACE_DIR/messages/）
2. Build flat value→key map: flatten nested JSON to dot-path keys
   ```javascript
   // { "canvas": { "downloadFile": "Download file" } }
   // → { "Download file": "canvas.downloadFile" }
   ```
3. For each element with non-empty `text`:
   a. Look up text in flat map → set element.i18nKey if found
   b. Try trimmed/lowercased match → set if found
   c. No match → element.i18nKey = null
4. Record in baseline: `"i18nReverseLookup": { "attempted": N, "matched": M }`

This enriches the baseline so that downstream test-case-generator and playwright-script-generator can reference i18n keys instead of hardcoded text.

## Layer 2 — Accessibility Tree (Hierarchy + Semantic State)

```
mcp__chrome-devtools__take_snapshot
```

Supplement from the snapshot:
- Element parent-child hierarchy (used to construct narrowed locators)
- Interaction states such as `expanded` / `checked` / `selected`
- Precise mapping of `role` and `name` (cross-validated with the DOM layer)

## Layer 3 — Screenshot (Visual Aid, Optional)

```
mcp__chrome-devtools__take_screenshot
```

Used for:
- Confirming visible area layout
- Assisting in understanding spatial relationships between elements
- **Not used as a basis for locator positioning**
