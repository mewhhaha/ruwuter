---
title: Run Core Quality Gates
impact: REQUIRED
impactDescription: Catches type/runtime contract regressions before handoff.
tags: ruwuter, verification, deno, gates
---

## Run Core Quality Gates

Run standard checks before finishing runtime, events, routing, or plugin changes.

```bash
deno task typecheck
deno lint
deno task test
```

If any check is skipped, call it out explicitly as remaining debt.
