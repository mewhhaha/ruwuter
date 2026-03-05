---
title: Regenerate FS-Routes Artifacts on Handler Changes
impact: REQUIRED
impactDescription: Keeps generated route and handler declaration files synchronized.
tags: ruwuter, fs-routes, types, generation
---

## Regenerate FS-Routes Artifacts on Handler Changes

When adding/changing route-side handlers or route exports in an FS-routes app, regenerate artifacts.

```bash
node src/fs-routes/routes.ts ./app
```

Verify generated `.router/types/**/+client-handlers.d.ts` reflects updated handler signatures.
