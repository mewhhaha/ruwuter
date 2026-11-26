---
name: ruwuter-usage
description: Build streaming HTML applications with method routes, deferred panels and optional typed browser controllers.
---

# Building with Ruwuter

Create one `router()` per app and export its `fetch` method. A handler receives the request, URL
parameters, platform bindings, optional execution context, and a cancellation signal. Return a Fetch
Response. Use `.get()`, `.post()` or `.route(path, { PUT, DELETE })`. The first matching pattern
owns HEAD, OPTIONS and Allow. Static route files export uppercase method names and generate a table
for the same `router(routes)` constructor. A document file and a Vite build are optional.

1. Finish authentication, authorization, redirects, and status selection before returning `html()`.
2. Return JSX with ordinary links and forms. Use a 303 redirect after a successful mutation. Put a
   slow read in an async component after the heading and primary controls. Propagate the signal.
3. Use `Deferred` for an independent panel. Pick a fallback that works with scripting disabled;
   wrapper props (`as` and attributes) apply only to the fallback element. The router serves the
   resolver at root-relative `/_ruwuter/resolve-v1.js` (override with `resolverSrc` or attach a CSP
   `nonce` via `router(routes, { resolverSrc })` / `html(node, { resolverSrc, nonce })`). Panels
   preserve lexical server context, resolve in completion order, and honor `errorFallback` both
   inside and outside routed responses. Keep `<!--rw-end-->` comments intact through proxies.
4. Make a partial update an ordinary HTML endpoint. `swap` accepts an HTML Response, supports
   `allowStatus` (for 4xx validation fragments), custom `write` callbacks (for DOM morphing), an
   application-supplied sanitizer or Trusted Types policy, strips inert resolver scripts, and wraps
   DOM writes in View Transitions when `viewTransition` is `true` or `{ types }` (resolving on
   `updateCallbackDone` and returning `result.transition`). Use `viewTransition()` from
   `@mewhhaha/ruwuter/browser` for standalone typed transitions, and `<ViewTransitions>`,
   `<ViewTransition>`, `vt()`, plus optional `@mewhhaha/ruwuter/vt.js` for MPA cross-document hero
   transitions (`pageswap`/`pagereveal`).
5. Mount a same-origin browser module with `controller(moduleHref, jsonProps).root()` and
   `defineController()`. Declare `ref={mounted.refs.name}` tokens for named descendants (refs
   resolve live within their nearest enclosing controller). Load `client.js` once with `async` on
   streaming pages so above-the-fold controllers activate immediately. For declarative partial
   updates, `fx-*` JSX attributes work with either `fixi.js` or a reusable `swap()`-backed
   controller. Observe the supplied signal or return cleanup. Typed `app/controllers.ts` and
   compiled runtime URL imports are available with the Vite plugin.
6. Pass strings as text. Use `unsafeHTML()` only for trusted markup (including raw `<style>` or
   `<script>` bodies). JSX validates tag and attribute names and quotes attribute values. Validate
   application-controlled URL destinations.

Use ordinary async JSX for ordered documents that need to work with zero JavaScript. For an
out-of-order page, verify that the first panel becomes visible while a later panel is pending, even
when the first template spans two network reads. Verify reader cancellation, isolated request
context, bodyless HEAD, and single native form submission.

The [usage examples and migration guide](../README.md),
[working product route](../examples/product.tsx),
[fixi-style progressive reviews example](../examples/fixi-reviews.tsx),
[MPA View Transitions showcase](../examples/view-transitions.tsx), and
[browser regression](../test-browser/streaming.test.tsx) exercise these contracts.
