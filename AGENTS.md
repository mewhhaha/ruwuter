# AGENTS

This file gives guidance to agents (and contributors) working in this repo. Scope: the entire
repository.

## Architecture

- The primary Fetch API lives in `src/router.ts`. Routes register HTTP methods and return standard
  Responses. File routes generate the same table. The previous loader router is isolated in
  `src/legacy.ts`.
- Streaming responses escape text at every public entry point. Use `unsafeHTML` for trusted markup.
  Keep the existing tag and attribute name validation, including keys with suppressed values.
  Attribute quoting does not validate URLs. Booleans and nullish children render nothing.
- Ordered async JSX works without JavaScript. Out-of-order `Deferred` panels use a request-local
  registry, a single external classic resolver after the shell, and a trailing completion marker.
  Never consume an open template. Run the browser suite for parser or protocol changes.
- `src/runtime/client.ts` is a self-starting browser module. Controllers receive a root, JSON props,
  refs and an abort signal. After a removal batch check connectivity, abort and run cleanup. Use
  native navigation and keep DOM listeners in controller modules.
- The Vite plugin compiles controller and runtime URLs. Raw TypeScript assets cannot run as browser
  modules. No application-wide source rewrites or serialized event callbacks.

## FS‑Routes

- Generator modules in `src/fs-routes/`:
  - `generate-router.ts`, `generate-types.ts`, and Vite-only `generate-controllers.ts`.
  - CLI entry: `src/fs-routes/routes.ts` (shebang runner).
- How to run generation for an app folder:
  - Repository CLI: `node src/fs-routes/routes.ts ./app`
  - Programmatic: `import { generate } from "@mewhhaha/ruwuter/fs-routes"; await generate('./app');`

## Types and Lint

- TypeScript config lives in `tsconfig.json`. Prefer `.ts` over `.mjs`.
- Linting uses `oxlint`. Formatting uses `oxfmt`.

### Commands (via pnpm scripts)

- Type check: `pnpm run typecheck`
- Lint: `pnpm run lint`
- Format: `pnpm run fmt`
- Browser size budgets: `pnpm run size`
- Tests:
  - Unit/router tests: `pnpm test`
  - DOM integration tests: `pnpm run test:dom`
  - Browser tests: `pnpm run test:browser`

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

- [ ] `pnpm run typecheck` is clean
- [ ] `pnpm run lint` is clean
- [ ] `pnpm run size` is within budget
- [ ] README examples and `docs/SKILLS.md` stay in sync with behavior
- [ ] No legacy client paths or APIs reintroduced
