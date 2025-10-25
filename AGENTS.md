# AGENTS

This file gives guidance to agents (and contributors) working in this repo. Scope: the entire
repository.

## Architecture Overview

- Entry points live under `src/` with TypeScript `.ts` modules using `moduleResolution: NodeNext`.
- The router and JSX runtime are isomorphic, but the “client runtime” is a small, browser‑only JS
  module injected in the HTML.
- File‑system routes live in your application (e.g. `app/`) and are processed by `src/fs-routes` to
  generate a static route table.

## Client Runtime

- Source: `src/client.runtime.js` (plain JS, executed as `<script type="module">`).
- Keep it minimal and standards‑based (ESNext + DOM APIs). Less is more.
- No IIFE is needed; modules execute at top level. The file initializes itself via
  `DOMContentLoaded` or immediately if the DOM is ready.
- Must support:
  - `on={...}` handlers loaded on demand via ESM `import()` using module hrefs (see “Client
    Handlers” below).
  - `bind={...}` context passed as `this` for handlers.
  - Function‑valued attributes (e.g., `class`, `hidden`, `disabled`, `inert`) computed client‑side
    and recomputed when bound refs change.
  - `mount`/`unmount` lifecycle events.
  - Proper `AbortSignal` passing to handlers:
    - Per element, per event: abort previous controller before running the next.
    - Abort all controllers on unmount, then run unmount handlers.
- No legacy inline function storage (no KV-backed registries). Only module-based handlers are
  supported.
- Type safety: the file uses `// @ts-check` and JSDoc. Keep and expand types as you edit the file.

### Suspense client behavior

- A small runtime (imported from `@mewhhaha/ruwuter/resolve`) is responsible for resolving streamed
  `<template data-rw-target="...">` elements.
- Streamed chunks only emit templates; the runtime uses a `MutationObserver` to replace fallback
  nodes when the associated template arrives.
- This keeps streamed updates CSP-friendly (one module script, no inline custom elements).

## Client Handlers

- Import client handlers as modules and ask for their URL via `?url` (optionally `&no-inline`). The
  import yields a branded string typed as a handler URL.
- Use the helpers from `@mewhhaha/ruwuter/events` (e.g. `events.click(handlerUrl)`) to build the
  tuples consumed by the JSX runtime.
- The FS-routes generator writes handler declaration files under
  `.router/types/**/+client-handlers.d.ts` to ensure default exports satisfy the
  `(this, event, signal)` contract. Keep them up to date when adding handlers.
- The router no longer serializes JS handlers; only HTML fragment assets are served for components.

## JSX Runtime Contracts

- Located in `src/runtime/jsx*.ts`.
- Supports `bind` and `on` props on intrinsic elements.
- Function-valued attributes are not supported; only HTML-compatible values plus `bind`/`on` are
  emitted.
- Do not re‑introduce inline client function paths; the runtime only emits `t: 'm'` (module)
  entries.

## FS‑Routes

- Generator modules in `src/fs-routes/`:
  - `generate-router.ts` and `generate-types.ts`.
  - CLI entry: `src/fs-routes/routes.ts` (shebang runner).
- How to run generation for an app folder:
  - CLI: `node src/fs-routes/routes.ts ./app`
  - Programmatic: `import { generate } from "@mewhhaha/ruwuter/fs-routes"; await generate('./app');`

## Types and Lint

- TypeScript config: `tsconfig.json` (NodeNext). Prefer `.ts` over `.mjs`.
- Raw imports: use `?raw` and keep `src/types.raw.d.ts` in sync so `tsc` recognizes them.
- The client runtime JS is type‑checked via `// @ts-check` and JSDoc.
- Linting uses `oxlint`. Ensure the tree is clean before finishing work.

### Commands (via Deno tasks)

- Type check: `deno task typecheck`
- Lint: `deno task lint`
- Format: `deno task format`
- Tests:
  - DOM tests (default): `deno task test`
  - Explicit DOM: `deno task test:dom`
  - Workers pool (requires Node features): `deno task test:workers`

## Coding Conventions

- Keep changes minimal and focused. Do not reformat unrelated files.
- Avoid adding new dependencies; prefer Web/ESNext APIs.
- Favor clarity over cleverness; keep the client runtime small and direct.
- Preserve public APIs in `src/client.ts`, `src/router.ts`, and runtime files unless the change is
  intentional and documented.

## What Not To Do

- Do not add back KV/map‑backed inline client functions.
- Do not emit or support `t: 'f'` inline client payloads; only `t: 'm'` is supported.
- Do not wrap the client runtime in an IIFE; it runs as a module.

## Quick Checklist (before you finish)

- [ ] tsc is clean
- [ ] oxlint is clean
- [ ] Any new `.client.*` handler has a generated declaration entry (run
      `node src/fs-routes/routes.ts ./app`)
- [ ] README examples stay in sync with behavior
- [ ] No legacy client paths or APIs reintroduced
