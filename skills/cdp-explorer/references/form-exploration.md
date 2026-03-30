# Step 4 — Form Exploration + Step 5 — State Stability Detection

> This file contains the form constraint extraction logic and state stability detection.
> Referenced from the main SKILL.md Phase 3 Steps 4-5 section.

## Step 4 — Form Exploration (Discover Input Constraints)

For each form area, extract input constraints for subsequent test case generation:

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    const forms = document.querySelectorAll('form, [role="form"]');
    return Array.from(forms).map(form => ({
      action: form.getAttribute('action'),
      method: form.getAttribute('method'),
      fields: Array.from(form.querySelectorAll('input,textarea,select')).map(f => ({
        name: f.getAttribute('name'),
        type: f.getAttribute('type') || f.tagName.toLowerCase(),
        required: f.required,
        minLength: f.getAttribute('minlength'),
        maxLength: f.getAttribute('maxlength'),
        min: f.getAttribute('min'),
        max: f.getAttribute('max'),
        pattern: f.getAttribute('pattern'),
        options: f.tagName === 'SELECT'
          ? Array.from(f.options).map(o => ({ value: o.value, text: o.text }))
          : undefined
      })),
      submitButton: (() => {
        const btn = form.querySelector('[type="submit"], button:not([type="button"])');
        return btn ? { text: btn.textContent?.trim(), disabled: btn.disabled } : null;
      })()
    }));
  }
```

## Step 5 — State Stability Detection

After each interaction, confirm the DOM has stabilized before scanning. Must wait for both DOM mutations AND rendering to complete.

> **Why 800ms + 5s**: SPA frameworks (React/Vue) often batch state updates with debounce (300-500ms). CSS transitions commonly take 300ms. The old 500ms/2s thresholds could trigger mid-animation or mid-render. 800ms quiet period + 5s max wait provides better coverage.

```
mcp__chrome-devtools__evaluate_script
  function: () => {
    return new Promise(resolve => {
      let timer;
      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          // After DOM settles, wait one more animation frame to ensure rendering is complete
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              observer.disconnect();
              resolve(true);
            });
          });
        }, 800);  // 800ms quiet period (up from 500ms)
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      // Max wait 5s (up from 2s) — covers slow API responses and long animations
      timer = setTimeout(() => { observer.disconnect(); resolve(true); }, 5000);
    });
  }
```
