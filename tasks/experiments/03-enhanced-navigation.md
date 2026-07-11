# Enhanced navigation (opt-in)

**Status:** idea — needs a demo app to validate · **Size:** M · **Runtime cost:** zero unless
imported

## Problem

The pieces for smooth same-origin navigation already exist — `swap` handles fetch → sanitize → write
→ View Transition, and the controller runtime already mounts/disposes correctly under
`MutationObserver` when DOM is replaced — but every app has to hand-wire link/form interception
itself. Full page loads are the only out-of-the-box navigation.

## Proposal

A fourth optional browser module, `@mewhhaha/ruwuter/navigate.js`, sibling to `client.js` /
`resolve.js` / `swap.js`, that:

- Uses the **Navigation API** (`navigation.addEventListener("intercept", ...)`) where available — it
  exists in workers-era Chromium and handles history, scroll restoration, and form submits in one
  hook. No `popstate` bookkeeping.
- On intercept: `fetch` the destination, `swap` the response into a configurable root (default:
  `document.body`, override via `<meta name="rw-navigate-target">` or module options), wrapped in a
  View Transition.
- Falls back to doing nothing (normal navigation) when the Navigation API is missing — progressive
  enhancement all the way down, matching the project's "links and forms work without JS" stance.

Because the existing controller runtime disposes controllers whose roots leave the DOM and mounts
new ones, swapped-in pages get working controllers for free — this is the payoff of the explicit
lifecycle design, worth demonstrating.

## Related: POST fragments

Fragments are GET/HEAD/OPTIONS only (`src/router.ts:353`). Swap-driven forms (`<form>` → fragment
endpoint → swap the result) would want POST fragment endpoints. That's a small, separable router
change: let a fragment export declare methods, or add `fragments` handling for action methods
mirroring the page-level rules. Decide it inside this experiment — it only has a use case once
interception exists.

## Constraints

- Separate entrypoint, never loaded implicitly; `client.js` must not grow.
- Budget (see [updates/05](../updates/05-size-budget-ci.md)): target ≤ 1.5 kB gzip — it's mostly
  glue around `swap`.
- Streamed Suspense pages fetched via `fetch()` + `swap` lose out-of-order resolution (templates
  arrive but the resolver observes the _document_, and `swap` writes once). Either scope v1 to
  non-streamed navigations or document that streamed pages hard-navigate.
