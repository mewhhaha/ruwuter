---
title: Respect Reduced Motion in View Transitions
impact: HIGH
impactDescription: Avoids disorienting animations for motion-sensitive users.
tags: ruwuter, styling, a11y, view-transitions
---

## Respect Reduced Motion in View Transitions

Use `prefers-reduced-motion` to clamp or disable transition animation timing.

**Preferred pattern:**

```css
::view-transition-group(*) {
  animation-duration: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*) {
    animation-duration: 1ms;
  }
}
```

Fallback route swaps should remain functional when transitions are disabled.
