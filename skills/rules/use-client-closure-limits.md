---
title: Respect Inline Handler Closure Limits
impact: HIGH
impactDescription: Avoids transform-time failures and missing-runtime references.
tags: ruwuter, use-client, closure, bundling
---

## Respect Inline Handler Closure Limits

Inline `"use client"` handlers should only reference globals, imports, and top-level declarations.

**Avoid (captures component-local value):**

```tsx
export function Register({ orgId }: { orgId: string }) {
  const submit = event.submit(async function (ev, signal) {
    "use client";
    await fetch(`/api/${orgId}/register`, { signal });
  });
  return <form on={submit}>...</form>;
}
```

**Preferred (bind through `events(bind, ...)`):**

```tsx
const submit = event.submit(async function (this: { orgId: string }, _ev, signal) {
  "use client";
  await fetch(`/api/${this.orgId}/register`, { signal });
});

export function Register({ orgId }: { orgId: string }) {
  return <form on={events({ orgId }, submit)}>...</form>;
}
```
