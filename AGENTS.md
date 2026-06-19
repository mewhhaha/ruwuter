# AGENTS

This file gives guidance to agents (and contributors) working in this repo. Scope: the entire
repository.

## Architecture Overview

- Entry points live under `src/` as TypeScript `.ts` modules driven by `deno.json` compiler options.
- The router and JSX runtime are isomorphic, but the “client runtime” is a small, browser‑only JS
  module injected in the HTML.
- File‑system routes live in your application (e.g. `app/`) and are processed by `src/fs-routes` to
  generate a static route table.
- Explicit fragment endpoints live under `/_ruwuter/fragments/<route-id>/<name>` and are declared
  with route-module `fragments`.

## Client Runtime

- Source: `src/runtime/client.ts` (TypeScript, executed in the browser as a module script).
- Keep it minimal and standards‑based (ESNext + DOM APIs). Less is more.
- No IIFE is needed; modules execute at top level. The file initializes itself immediately when
  loaded in the browser.
- Must support:
- Explicit controller roots declared with `controller(moduleHref, props)`.
- Browser modules receive `{ root, props, signal }` and may return a cleanup callback.
- On removal, wait for the mutation batch, check `root.isConnected`, abort the signal, then run
  cleanup.
- No legacy inline function storage, refs, adjacent metadata scripts, or auto-anchoring.
- Type safety: the runtime is authored in TypeScript. Keep types accurate as you edit the file.

### Suspense client behavior

- A small runtime (imported from `@mewhhaha/ruwuter/resolve`) is responsible for resolving streamed
  `<template data-rw-target="...">` elements.
- Streamed chunks only emit templates; the runtime uses a `MutationObserver` to replace fallback
  nodes when the associated template arrives.
- This keeps streamed updates CSP-friendly (one module script, no inline custom elements).

## Client Handlers

- Import client handlers as modules and ask for their URL via `?url` (optionally `&no-inline`). The
  import yields a branded string typed as a handler URL.
- Use `controller(handlerUrl, props)` on the element that owns the browser behavior. Query children
  from `context.root` inside the client module. Attach DOM listeners with the `on(element)` helper
  from `@mewhhaha/ruwuter/components`.
- The FS-routes generator writes handler declaration files under
  `.router/types/**/+client-handlers.d.ts` to ensure default exports satisfy the
  `(this, event, signal)` contract. Keep them up to date when adding handlers.
- The router no longer serializes JS handlers; only HTML fragment assets are served for components.

## JSX Runtime Contracts

- Located in `src/runtime/jsx*.ts`.
- Does not support JSX `on` props. Use explicit controllers instead.
- Function-valued attributes are not supported; only HTML-compatible values plus runtime payload
  metadata are emitted.
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

- TypeScript config lives in `deno.json` (Deno compiler options). Prefer `.ts` over `.mjs`.
- Linting uses `deno lint`. Formatting uses `deno fmt`.

### Commands (via Deno tasks)

- Type check: `deno task typecheck`
- Lint: `deno lint`
- Format: `deno fmt`
- Tests:
  - Unit/router tests: `deno task test`
  - DOM integration tests: `deno task test:dom`
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

- [ ] `deno task typecheck` is clean
- [ ] `deno lint` is clean
- [ ] Any new `.client.*` handler has a generated declaration entry (run
      `node src/fs-routes/routes.ts ./app`)
- [ ] README examples stay in sync with behavior
- [ ] No legacy client paths or APIs reintroduced
