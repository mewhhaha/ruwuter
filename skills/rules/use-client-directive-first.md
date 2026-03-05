---
title: Keep "use client" Directive-First
impact: HIGH
impactDescription: Ensures transform detection and stable handler extraction.
tags: ruwuter, use-client, transform, handlers
---

## Keep "use client" Directive-First

Inline handlers must be block-bodied with `"use client"` as the first statement.

**Avoid (directive not first):**

```ts
const submit = event.submit(async function (ev, signal) {
  console.log("start");
  "use client";
  await post(ev, signal);
});
```

**Preferred (directive first):**

```ts
const submit = event.submit(async function (ev, signal) {
  "use client";
  await post(ev, signal);
});
```
