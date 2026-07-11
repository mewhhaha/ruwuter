# Tasks

Work items from a review of the codebase (2026-07), now implemented and retained as design records.
They are split by intent:

- `updates/` — concrete improvements to existing code.
- `dx/` — developer-experience work that removes boilerplate from the default path.
- `experiments/` — opt-in features whose implementation preserves the original constraints and
  tradeoffs.

Guiding constraint for everything in here: **ruwuter stays small.** The server core
(`src/router.ts` + `src/runtime/`) and the browser runtimes (`client.ts`, `resolve.ts`, `swap.ts`)
should not grow to support any of these. Where a feature needs machinery, it goes into build-time
tooling (`src/vite.ts`, `src/fs-routes/`) or an opt-in entrypoint, never into the default path.

## Index

### updates/

| Task                                                        | Size | What                                                      |
| ----------------------------------------------------------- | ---- | --------------------------------------------------------- |
| [01-parallel-loaders](./updates/01-parallel-loaders.md)     | S    | Nested loaders run as a waterfall; run them concurrently  |
| [02-error-handling](./updates/02-error-handling.md)         | S    | Bare 500s, `console.error(error.message)` loses the stack |
| [03-suspense-hardening](./updates/03-suspense-hardening.md) | S    | A rejected boundary kills the whole stream; id collisions |
| [04-docs-drift](./updates/04-docs-drift.md)                 | XS   | AGENTS.md/README/examples disagree with the code          |
| [05-size-budget-ci](./updates/05-size-budget-ci.md)         | XS   | Make "really small" a number CI enforces                  |

### dx/

| Task                                                           | Size | What                                                    |
| -------------------------------------------------------------- | ---- | ------------------------------------------------------- |
| [01-typed-controller-hrefs](./dx/01-typed-controller-hrefs.md) | S    | Generate typed controller hrefs; kill the `?url` + cast |

### experiments/

| Task                                                                    | Size | What                                                       |
| ----------------------------------------------------------------------- | ---- | ---------------------------------------------------------- |
| [01-colocate-client-logic](./experiments/01-colocate-client-logic.md)   | M    | Same-file client logic via a constrained Vite macro        |
| [02-static-route-fast-path](./experiments/02-static-route-fast-path.md) | S    | O(1) match for static paths instead of linear pattern scan |
| [03-enhanced-navigation](./experiments/03-enhanced-navigation.md)       | M    | Opt-in link/form interception + `swap` + View Transitions  |
