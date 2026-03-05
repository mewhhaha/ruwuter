---
title: Pass Context via Typed this
impact: HIGH
impactDescription: Reduces closure capture and keeps handler data transport explicit.
tags: ruwuter, events, this, typing
---

## Pass Context via Typed this

Use `events(bind, ...)` to ship event context and declare `this` in handlers.

**Preferred pattern:**

```tsx
import { event, events } from "@mewhhaha/ruwuter/events";
import openHref from "./open.client.ts?url&no-inline";

<button on={events({ projectId, tab: "activity" }, event.click(openHref))}>Open</button>;
```

```ts
export default async function open(
  this: { projectId: string; tab: string },
  _ev: MouseEvent,
  signal: AbortSignal,
) {
  await fetch(`/api/projects/${this.projectId}/open?tab=${this.tab}`, { signal });
}
```
