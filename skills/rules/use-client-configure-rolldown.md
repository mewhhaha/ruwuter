---
title: Configure use-client Plugin in Rolldown
impact: HIGH
impactDescription: Enables ergonomic inline handlers that compile to module URL bindings.
tags: ruwuter, rolldown, plugin, use-client
---

## Configure use-client Plugin in Rolldown

Enable `@mewhhaha/rolldown-plugin-use-client` before authoring inline `"use client"` handlers.

```ts
import { defineConfig } from "rolldown";
import useClient from "@mewhhaha/rolldown-plugin-use-client";

export default defineConfig({
  plugins: [useClient()],
});
```

Without this plugin, prefer sidecar module handlers (`?url&no-inline`).
