# AGENTS

This file gives guidance to agents (and contributors) working in this repo. Scope: the entire repository.

## Architecture Overview

- Entry points live under `src/` with TypeScript `.mts` modules using `moduleResolution: NodeNext`.
- The router and JSX runtime are isomorphic, but the “client runtime” is a small, browser‑only JS module injected in the HTML.
- File‑system routes live in your application (e.g. `app/`) and are processed by `src/fs-routes` to generate a static route table.

## Client Runtime

- Source: `src/client.runtime.js` (plain JS, executed as `<script type="module">`).
- Keep it minimal and standards‑based (ESNext + DOM APIs). Less is more.
- No IIFE is needed; modules execute at top level. The file initializes itself via `DOMContentLoaded` or immediately if the DOM is ready.
- Must support:
  - `on={...}` handlers loaded on demand via ESM `import()` (see “$ wrapper” below).
  - `bind={...}` context passed as `this` for handlers.
  - Function‑valued attributes (e.g., `class`, `hidden`, `disabled`, `inert`) computed client‑side and recomputed when bound refs change.
  - `mount`/`unmount` lifecycle events.
  - Proper `AbortSignal` passing to handlers:
    - Per element, per event: abort previous controller before running the next.
    - Abort all controllers on unmount, then run unmount handlers.
- No legacy inline function storage (no KV-backed registries). Only module‑based handlers are supported.
- Type safety: the file uses `// @ts-check` and JSDoc. Keep and expand types as you edit the file.

### Suspense client behavior

- A small runtime (imported from `@mewhhaha/ruwuter/resolve-runtime`) is responsible for resolving streamed `<template data-rw-target="...">` elements.
- Streamed chunks only emit templates; the runtime uses a `MutationObserver` to replace fallback nodes when the associated template arrives.
- This keeps streamed updates CSP-friendly (one module script, no inline custom elements).

## “on()” Wrapper Requirement

- Only functions/components wrapped with `on(fn)` are addressable by URL and loadable on the client.
- The FS‑routes generator (`src/fs-routes/generate-router.mts`) annotates exports marked with `on()` with:
  - `href` for handler JS modules: `/_client/r/<route>/<export>.js`
  - `hrefHtml` for component HTML fragments: `/_client/r/<route>/<Export>.html`
- Handlers passed to `on={...}` must be exported and wrapped via `on(fn)`.
- Components referenced by URL must be wrapped via `on(fn)`.

## JSX Runtime Contracts

- Located in `src/runtime/jsx*.mts`.
- Supports `bind` and `on` props on intrinsic elements.
- Function‑valued attributes are encoded as `data-client-attr-*` and computed by the client runtime.
- Do not re‑introduce inline client function paths; the runtime only emits `t: 'm'` (module) entries.

## FS‑Routes

- Generator modules in `src/fs-routes/`:
  - `generate-router.mts` and `generate-types.mts`.
  - CLI entry: `src/fs-routes/routes.mts` (shebang runner).
- How to run generation for an app folder:
  - CLI: `node src/fs-routes/routes.mts ./app`
  - Programmatic: `import { generate } from "@mewhhaha/ruwuter/fs-routes"; await generate('./app');`

## Types and Lint

- TypeScript config: `tsconfig.json` (NodeNext). Prefer `.mts` over `.mjs`.
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
- Preserve public APIs in `src/client.mts`, `src/router.mts`, and runtime files unless the change is intentional and documented.

## What Not To Do

- Do not add back KV/map‑backed inline client functions.
- Do not emit or support `t: 'f'` inline client payloads; only `t: 'm'` is supported.
- Do not wrap the client runtime in an IIFE; it runs as a module.

## Quick Checklist (before you finish)

- [ ] tsc is clean
- [ ] oxlint is clean
- [ ] Any new client handler/component intended for client use is wrapped in `$`
- [ ] README examples stay in sync with behavior
- [ ] No legacy client paths or APIs reintroduced
