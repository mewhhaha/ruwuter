---
title: Pair Pending Visuals with Semantic Status
impact: HIGH
impactDescription: Makes pending states perceivable to assistive tech and keyboard users.
tags: ruwuter, accessibility, pending, aria
---

## Pair Pending Visuals with Semantic Status

When an action is pending, return updated semantic state in the next server-rendered HTML.

Guidance:

- Set `disabled` on controls that must not be re-triggered.
- Set `aria-busy="true"` on the relevant region.
- Provide a status/live region update for important async progress.

**Preferred pending snapshot:**

```html
<section aria-busy="true">
  <button disabled>Publish</button>
  <p role="status" aria-live="polite">Publishing...</p>
</section>
```

**Preferred settled snapshot:**

```html
<section aria-busy="false">
  <button>Publish</button>
  <p role="status" aria-live="polite">Ready</p>
</section>
```
