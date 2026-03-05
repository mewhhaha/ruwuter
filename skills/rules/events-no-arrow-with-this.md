---
title: Avoid Arrow Handlers When Using this
impact: HIGH
impactDescription: Prevents silent loss of `this` binding from `events(bind, ...)`.
tags: ruwuter, events, this, javascript
---

## Avoid Arrow Handlers When Using this

Arrow functions do not receive bound `this`. Use function forms when you expect bind context.

**Avoid (arrow ignores bound `this`):**

```ts
const submit = event.submit(async (ev, signal) => {
  "use client";
  await fetch(`/api/${this.orgId}/register`, { signal });
});
```

**Preferred (function receives bound `this`):**

```ts
const submit = event.submit(async function (
  this: { orgId: string },
  _ev,
  signal,
) {
  "use client";
  await fetch(`/api/${this.orgId}/register`, { signal });
});
```
