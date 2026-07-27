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
- Moved `on:event={move(values, callback)}` listeners emitted as module URLs plus JSON values.
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
- Experimental moved events use `move()` only with `clientMacro: true`. Their callbacks follow the
  same capture rules; values cross the boundary through the explicit JSON argument.

## JSX Runtime Contracts

- Located in `src/runtime/jsx*.ts`.
- Raw JSX event callbacks are unsupported. Use `on:event={move(...)}` for one listener or a
  controller for behavior spanning elements.
- Function-valued HTML attributes are not supported; only HTML-compatible values, controller
  root/ref metadata, and moved-event module metadata are emitted.
- Attribute names must match `/^[A-Za-z_:][A-Za-z0-9_.:-]*$/`. Any other key throws a `TypeError`
  naming it, so a spread key cannot break out of the attribute and inject markup. The invariant is
  that no key reaches the markup as an attribute name without passing the check, and the check runs
  before any value can suppress the attribute, so a key whose value is falsy and emits nothing is
  still rejected. The directive keys the runtime consumes itself — `ref`, `on:*`, and a
  `dangerouslySetInnerHTML` carrying `{ __html: string }` — return before the check; they emit a
  fixed `data-rw-*` name or inline HTML rather than a caller-controlled attribute name. A
  `dangerouslySetInnerHTML` of any other shape falls through and is checked like an ordinary
  attribute. Keep it that way when adding directives.
- Attribute _values_ are escaped for `&` and `"` only, which keeps them inside the quoted attribute.
  They are not validated: `<a href={untrusted}>` emits a `javascript:` URL verbatim. Value safety is
  an application concern, not a runtime guarantee — do not document it as one.
- Tag names must match `/^[A-Za-z][A-Za-z0-9-]*$/`. Any other string tag throws a `TypeError` naming
  it, so a caller-controlled tag (`const Tag = untrusted; <Tag />`) cannot break out and inject
  markup. The empty-string tag is exempt: it emits no markup and is the internal fragment path.
- Boolean children render nothing, like `null` and `undefined`, on both the synchronous and the
  streamed path. Do not reintroduce `true` as literal text.
- Do not emit JavaScript source or evaluated code in event metadata.

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
- Do not emit or support serialized inline JavaScript source.
- Do not wrap the client runtime in an IIFE; it runs as a module.

## Quick Checklist (before you finish)

- [ ] `deno task typecheck` is clean
- [ ] `deno lint` is clean
- [ ] `deno task size` is within budget
- [ ] README examples and `docs/SKILLS.md` stay in sync with behavior
- [ ] No legacy client paths or APIs reintroduced
