# AGENTS

This file gives guidance to agents (and contributors) working in this repo. Scope: the entire
repository.

## Architecture Overview

- Entry points live under `src/` as TypeScript `.ts` modules driven by `deno.json` compiler options.
- The router and JSX runtime are isomorphic, but the “client runtime” is a small, browser‑only JS
  module injected in the HTML.
- File‑system routes live in your application (e.g. `app/`) and are processed by `src/fs-routes` to
  generate a static route table.
- Explicit fragment endpoints are route-scoped under `<matched-route>/_ruwuter/<name>` and are
  declared with route-module `fragments`.

## Client Runtime

- Source: `src/runtime/client.ts` (TypeScript, executed in the browser as a module script).
- Keep it minimal and standards‑based (ESNext + DOM APIs). Less is more.
- No IIFE is needed; modules execute at top level. The file initializes itself immediately when
  loaded in the browser.
- Must support:
- Explicit controller roots declared with `controller(moduleHref, props).root()`.
- Browser modules receive `{ root, props, refs, signal }` and may return a cleanup callback.
- On removal, wait for the mutation batch, check `root.isConnected`, abort the signal, then run
  cleanup.
- No legacy inline function storage, refs, adjacent metadata scripts, or auto-anchoring.
- Type safety: the runtime is authored in TypeScript. Keep types accurate as you edit the file.
- Runtime `?url` imports rely on the Ruwuter Vite plugin to emit compiled JavaScript; raw TypeScript
  assets are not browser modules.

### Suspense client behavior

- A small runtime (imported from `@mewhhaha/ruwuter/resolve`) is responsible for resolving streamed
  `<template data-rw-target="...">` elements.
- Streamed chunks only emit templates; the runtime uses a `MutationObserver` to replace fallback
  nodes when the associated template arrives.
- This keeps streamed updates CSP-friendly (one module script, no inline custom elements).

## Client Handlers

- With the Vite plugin, import typed controller URLs from generated `app/controllers.ts`. The plugin
  serves compiled modules in development and emits dedicated browser chunks in production; do not
  cast raw TypeScript `?url` assets.
- Use `defineController()` in browser modules and `controller(handlerUrl, props)` on the server
  element that owns the browser behavior. Use static `ref={mounted.refs.name}` tokens for elements
  the browser module needs. Attach DOM listeners with the `on(element)` helper from
  `@mewhhaha/ruwuter/browser`.
- The router no longer serializes JS handlers; only HTML fragment assets are served for components.
- Experimental same-file handlers use top-level `client()` only with `clientMacro: true`. They may
  capture imports, never server module bindings; values cross the boundary through JSON props.

## JSX Runtime Contracts

- Located in `src/runtime/jsx*.ts`.
- Does not support JSX `on` props. Use explicit controllers instead.
- Function-valued attributes are not supported; only HTML-compatible values plus controller root/ref
  metadata are emitted.
- Do not re‑introduce inline client function paths or serialized event-handler entries.

## FS‑Routes

- Generator modules in `src/fs-routes/`:
  - `generate-router.ts`, `generate-types.ts`, and Vite-only `generate-controllers.ts`.
  - CLI entry: `src/fs-routes/routes.ts` (shebang runner).
- How to run generation for an app folder:
  - Repository CLI: `deno run -A src/fs-routes/routes.ts ./app`
  - Programmatic: `import { generate } from "@mewhhaha/ruwuter/fs-routes"; await generate('./app');`

## Types and Lint

- TypeScript config lives in `deno.json` (Deno compiler options). Prefer `.ts` over `.mjs`.
- Linting uses `deno lint`. Formatting uses `deno fmt`.

### Commands (via Deno tasks)

- Type check: `deno task typecheck`
- Lint: `deno lint`
- Format: `deno fmt`
- Browser size budgets: `deno task size`
- Tests:
  - Unit/router tests: `deno task test`
  - DOM integration tests: `deno task test:dom`

## Coding Conventions

- Keep changes minimal and focused. Do not reformat unrelated files.
- Avoid adding new dependencies; prefer Web/ESNext APIs.
- Favor clarity over cleverness; keep the client runtime small and direct.
- Preserve public APIs in `src/browser.ts`, `src/components/client.ts`, `src/runtime/client.ts`,
  `src/router.ts`, and runtime files unless the change is intentional and documented.

## What Not To Do

- Do not add back KV/map‑backed inline client functions.
- Do not emit or support serialized inline client payloads.
- Do not wrap the client runtime in an IIFE; it runs as a module.

## Quick Checklist (before you finish)

- [ ] `deno task typecheck` is clean
- [ ] `deno lint` is clean
- [ ] `deno task size` is within budget
- [ ] README examples and `docs/SKILLS.md` stay in sync with behavior
- [ ] No legacy client paths or APIs reintroduced
