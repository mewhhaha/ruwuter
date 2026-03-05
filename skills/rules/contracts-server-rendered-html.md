---
title: Treat Server-Rendered HTML as UI State Source
impact: CRITICAL
impactDescription: Keeps Ruwuter behavior aligned with server-first rendering boundaries.
tags: ruwuter, server-rendered, html, state
---

## Treat Server-Rendered HTML as UI State Source

Ruwuter components execute on the server. Do not model component-local client state as the primary UI source.

**Avoid (assuming client-side component toggles drive truth):**

```tsx
function SaveButton() {
  const [pending, setPending] = useState(false);
  return <button class={pending ? "pending" : ""}>Save</button>;
}
```

**Preferred (server returns the next HTML snapshot with state markers):**

```html
<!-- pending snapshot -->
<button class="btn" data-pending="true" aria-busy="true" disabled>Saving...</button>
```

```html
<!-- settled snapshot -->
<button class="btn" data-pending="false" aria-busy="false">Save</button>
```

Use client runtime code only to trigger navigation/events and swap in server-produced HTML.
