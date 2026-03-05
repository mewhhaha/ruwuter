---
title: Abort Before Unmount Handlers
impact: HIGH
impactDescription: Prevents stale handlers and cross-abort bugs during teardown.
tags: ruwuter, lifecycle, abortsignal, unmount
---

## Abort Before Unmount Handlers

On element teardown, abort active per-event controllers first, then execute unmount handlers.

**Avoid (handler runs before abort):**

```ts
runUnmountHandlers(el);
abortActiveControllers(el);
```

**Preferred (abort first):**

```ts
abortActiveControllers(el);
runUnmountHandlers(el);
```

Sibling unmount handlers must not cancel each other through shared controller state.
