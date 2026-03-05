---
title: Keep Client Handlers Module-Based
impact: CRITICAL
impactDescription: Prevents runtime protocol drift and unsupported inline payloads.
tags: ruwuter, runtime, events, jsx
---

## Keep Client Handlers Module-Based

Emit module URL handlers only. Do not reintroduce inline function transport.

**Avoid (inline function payload / legacy shape):**

```ts
const on = [{ t: "f", code: "..." }];
```

**Preferred (module URL payload):**

```tsx
import { event } from "@mewhhaha/ruwuter/events";
import saveHref from "./save.client.ts?url&no-inline";

<button on={event.click(saveHref)}>Save</button>;
```

Keep runtime and JSX output aligned on `t: "m"` module entries.
