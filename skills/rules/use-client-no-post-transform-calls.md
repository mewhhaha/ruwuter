---
title: Do Not Call Transformed Declarations as Functions
impact: MEDIUM-HIGH
impactDescription: Prevents runtime misuse after declarations are rewritten to URL bindings.
tags: ruwuter, use-client, transform, runtime
---

## Do Not Call Transformed Declarations as Functions

After transform, declaration handlers become URL bindings, not callable runtime functions.

**Avoid (treating transformed binding as callable):**

```ts
const submit = makeSubmitHandler();
submit(event, signal);
```

**Preferred (pass binding into Ruwuter event helper):**

```tsx
<form on={events({ orgId }, event.submit(submit, { preventDefault: true }))}>...</form>
```

Use plugin lint rules where possible:

- `no-invalid-inline-client-closure`
- `require-use-client-directive`
