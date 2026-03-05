# Sections

## 1. Core Runtime Contracts

Purpose: protect runtime protocol guarantees across JSX emit, hydration payloads, and browser teardown.

Use this section when adding or reviewing event payload plumbing, client runtime setup, or unmount behavior.

### Rules in this section

- `contracts-server-rendered-html.md` - Treat server-generated HTML snapshots as canonical UI state.
- `contracts-module-handlers.md` - Emit module handlers only (`t: 'm'`), no inline function payloads.
- `contracts-events-bind.md` - Use `events(bind, ...)` as the bind-shipping contract.
- `contracts-runtime-scripts.md` - Keep `<Client />` and resolve runtime script setup explicit.
- `contracts-unmount-abort-order.md` - Abort active controllers before running `unmount` handlers.

## 2. Event Authoring Patterns

Purpose: keep handler wiring predictable, typed, and compatible with module URL loading.

Use this section when authoring `on={...}` handlers in routes/components.

### Rules in this section

- `events-sidecar-handler-pattern.md` - Default to sidecar `?url&no-inline` handlers.
- `events-this-bound-data.md` - Pass context through `events(bind, ...)` and typed `this`.
- `events-no-arrow-with-this.md` - Avoid arrow functions for handlers that rely on `this`.

## 3. 'use client' Plugin Workflow

Purpose: integrate Trash-libs `use-client` transform while preserving Ruwuter event contracts.

Use this section when using inline handlers marked with `"use client"`.

### Rules in this section

- `use-client-configure-rolldown.md` - Install/enable `@mewhhaha/rolldown-plugin-use-client`.
- `use-client-directive-first.md` - Keep `"use client"` as the first statement in a block body.
- `use-client-closure-limits.md` - Capture only globals/imports/top-level declarations.
- `use-client-no-post-transform-calls.md` - Do not call transformed declarations as runtime functions.

## 4. Verification Workflow

Purpose: catch contract regressions before merge.

Use this section before finishing any non-trivial runtime or route work.

### Rules in this section

- `verify-core-gates.md` - Run typecheck, lint, and test gates.
- `verify-fs-routes-regenerate.md` - Regenerate route/type artifacts after route handler changes.

## 5. Styling and View Transitions

Purpose: keep pending and transition UI consistent, debuggable, and easy to theme.

Use this section when adding loading states, optimistic transitions, or route/content view transitions.

### Rules in this section

- `styles-pending-state-selectors.md` - Drive pending styling from explicit `data-*` and ARIA selectors.
- `styles-view-transitions.md` - Configure `view-transition-name` and pseudo-element styling safely.
- `styles-view-transitions-reduced-motion.md` - Respect reduced-motion preferences in transition styling.

## 6. Accessibility and Motion Safety

Purpose: guarantee that pending and transition states remain perceivable and operable.

Use this section when changing pending interactions, status messaging, focus handling, or transition timing.

### Rules in this section

- `a11y-pending-state-semantics.md` - Map pending visuals to semantic busy/disabled and status messages.
- `a11y-view-transition-focus.md` - Preserve focus order and announce route/view updates.

## 7. Native Commands and Modal APIs

Purpose: prefer built-in browser primitives over custom JavaScript for open/close UX.

Use this section when implementing modals, disclosures, popovers, or confirm/cancel actions.

### Rules in this section

- `native-commandfor-dialog.md` - Use button `command`/`commandfor` values for dialog operations.
- `native-dialog-form-method.md` - Use dialog-form semantics for close/submit outcomes.
- `native-popover-controls.md` - Use popover attributes/targets before imperative toggling.
