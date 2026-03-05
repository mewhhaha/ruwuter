---
title: Style Pending UI from Explicit State Hooks
impact: HIGH
impactDescription: Keeps loading visuals consistent and easy to reason about.
tags: ruwuter, styling, pending, css
---

## Style Pending UI from Explicit State Hooks

Expose pending state in server-rendered HTML (`data-pending` and ARIA state), then style from selectors.

**Avoid (client-only visual toggles with no canonical HTML state):**

```ts
button.classList.toggle("loading", true);
```

**Preferred (server snapshot includes semantic + style hooks):**

```html
<button class="btn" data-pending="true" aria-busy="true" disabled>Saving...</button>
```

```css
.btn[data-pending="true"] {
  opacity: 0.72;
  cursor: progress;
}
```
