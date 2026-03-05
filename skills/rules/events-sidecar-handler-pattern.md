---
title: Default to Sidecar Handler URLs
impact: HIGH
impactDescription: Keeps event wiring explicit without requiring transform plugins.
tags: ruwuter, handlers, sidecar, fs-routes
---

## Default to Sidecar Handler URLs

When no build transform is required, import sidecar handlers with `?url&no-inline`.

**Preferred pattern:**

```tsx
import { event, events } from "@mewhhaha/ruwuter/events";
import saveHref from "./save.client.ts?url&no-inline";

<form on={events({ projectId }, event.submit(saveHref, { preventDefault: true }))}>
  ...
</form>;
```

This keeps handler loading module-based and works across route generators.
