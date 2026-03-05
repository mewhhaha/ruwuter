---
title: Use events(bind, ...) for Bind Shipping
impact: CRITICAL
impactDescription: Keeps hydration payloads stable (`v: 1`, bind/ref/on fields).
tags: ruwuter, bind, events, hydration
---

## Use events(bind, ...) for Bind Shipping

Treat `events(bind, ...)` as the supported bind API for object/array/ref bind data.

**Avoid (legacy compatibility form):**

```tsx
<button on={[{ projectId }, event.click(openHref)]}>Open</button>
```

**Preferred (contract form):**

```tsx
<button on={events({ projectId }, event.click(openHref))}>Open</button>
```

Prefer the builder form `events(bind, on => on.click(...))` when dynamic composition is needed.
