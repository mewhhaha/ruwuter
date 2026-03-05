---
name: ruwuter-usage
description: Build and maintain Ruwuter apps where components run on the server and return HTML snapshots, with streamed Suspense, module-based client events, and UX-safe interaction patterns. Use when implementing routes/components, wiring `on={...}` handlers with `events(bind, ...)`, adding client/resolve runtimes, integrating the Trash-libs use-client plugin to compile `'use client'` handlers to module URLs, or defining styling/accessibility rules for pending states and view transitions.
---

# Ruwuter Usage

Ruwuter guidance is split into focused rule files under `rules/` so you can load only the
relevant part for the current task.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Core Runtime Contracts | CRITICAL | `contracts-` |
| 2 | Event Authoring Patterns | HIGH | `events-` |
| 3 | `'use client'` Plugin Workflow | HIGH | `use-client-` |
| 4 | Verification Workflow | REQUIRED | `verify-` |
| 5 | Styling and View Transitions | HIGH | `styles-` |
| 6 | Accessibility and Motion Safety | HIGH | `a11y-` |
| 7 | Native Commands and Modal APIs | HIGH | `native-` |

## Quick Reference

### 1. Core Runtime Contracts (CRITICAL)

- `contracts-server-rendered-html` - Treat server-rendered HTML snapshots as the source of UI truth.
- `contracts-module-handlers` - Keep client handlers module-based (`t: 'm'`) only.
- `contracts-events-bind` - Use `events(bind, ...)` as the bind-shipping API.
- `contracts-runtime-scripts` - Add `<Client />` and resolve runtime where required.
- `contracts-unmount-abort-order` - Abort per-element controllers before unmount handlers.

### 2. Event Authoring Patterns (HIGH)

- `events-sidecar-handler-pattern` - Prefer `?url&no-inline` sidecar handler URLs by default.
- `events-this-bound-data` - Pass handler context through `events(bind, ...)`.
- `events-no-arrow-with-this` - Use function forms when handlers rely on `this`.

### 3. `'use client'` Plugin Workflow (HIGH)

- `use-client-configure-rolldown` - Install `@mewhhaha/rolldown-plugin-use-client`.
- `use-client-directive-first` - Keep `"use client"` directive-first and block-bodied.
- `use-client-closure-limits` - Only capture globals/imports/top-level values.
- `use-client-no-post-transform-calls` - Treat transformed declarations as URL bindings.

### 4. Verification Workflow (REQUIRED)

- `verify-core-gates` - Run typecheck/lint/tests before finishing.
- `verify-fs-routes-regenerate` - Regenerate FS-routes artifacts when handlers/routes change.

### 5. Styling and View Transitions (HIGH)

- `styles-pending-state-selectors` - Style pending UI through explicit data/ARIA hooks.
- `styles-view-transitions` - Use View Transitions with stable names and scoped pseudo-elements.
- `styles-view-transitions-reduced-motion` - Provide reduced-motion-safe transition styles.

### 6. Accessibility and Motion Safety (HIGH)

- `a11y-pending-state-semantics` - Pair visual pending state with `aria-busy`, `disabled`, and status updates.
- `a11y-view-transition-focus` - Preserve focus and announce route/content updates during transitions.

### 7. Native Commands and Modal APIs (HIGH)

- `native-commandfor-dialog` - Use declarative `command` + `commandfor` for dialog open/close.
- `native-dialog-form-method` - Use `method="dialog"` (or `formmethod="dialog"`) for close flows.
- `native-popover-controls` - Use `popover` + `popovertarget`/`popovertargetaction` before custom JS.

## How to Use

1. Start with `rules/_sections.md` to choose the right section.
2. Open only the rule files needed for the active task.
3. Apply rule examples directly in code edits and review comments.

Example rule files:

```
rules/contracts-events-bind.md
rules/use-client-closure-limits.md
```
