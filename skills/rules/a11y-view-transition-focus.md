---
title: Preserve Focus and Announce Transitioned Views
impact: HIGH
impactDescription: Prevents focus loss and silent context changes during transitions.
tags: ruwuter, accessibility, focus, view-transitions
---

## Preserve Focus and Announce Transitioned Views

After swapping to new server-rendered HTML, place focus intentionally and announce meaningful updates.

**Preferred pattern:**

```html
<main id="main-content" tabindex="-1" aria-live="polite">
  <!-- server-rendered content -->
</main>
```

```ts
// swapFromServer(url) fetches and swaps server-rendered HTML into the current view.
await swapFromServer("/projects/42");
document.getElementById("main-content")?.focus();
```

Do not rely on animation alone to communicate state changes.
