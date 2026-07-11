# Suspense: don't let one boundary kill the page

**Status:** implemented · **Size:** S · **Files:** `src/components/suspense.ts`,
`src/runtime/resolve.ts`

## Problem 1 — a rejected boundary aborts the whole stream

`Resolve` (`src/components/suspense.ts:100-102`) rethrows any settled error:

```ts
const settled = registry.queue.shift()!;
if (!settled.ok) throw settled.error;
```

By the time this runs, the shell has already streamed: status 200 is sent, fallbacks are visible.
The throw aborts the body stream, so the user gets a truncated page where _every_ pending boundary
is stuck on its fallback forever — including boundaries whose content resolved fine but hadn't been
emitted yet. One failed `async () => ...` child takes down all of them.

## Proposal

Per-boundary error containment, matching what streaming Suspense means everywhere else:

- Add `errorFallback?: JSX.Element | ((error: unknown) => JSX.Element)` to `SuspenseProps`.
- On a failed settle, emit a template targeting the boundary as usual, containing the rendered
  `errorFallback` (or nothing — leaving the fallback in place — when unset), and `console.error` the
  original error server-side.
- Keep draining the queue; never throw from `Resolve`.

If `errorFallback` itself is renderable-async and fails, fall back to leaving the fallback in place
— no recursion.

## Problem 2 — boundary ids can collide

Ids are `suspense-${counter}` with a per-registry counter (`suspense.ts:63`). Two
`SuspenseProvider`s in one document (easy to do accidentally: one in a layout, one in a leaf) both
start at `suspense-0`, and the resolver runtime swaps whichever element it finds first. A user
element with `id="suspense-0"` collides the same way.

Cheap fix: give each registry a short unique prefix at construction (`crypto.randomUUID()` slice —
fine on Workers) so ids are `rw-<prefix>-<n>`. Also namespaces us away from user ids.

## Tests

- Failing child with and without `errorFallback`: stream completes, sibling boundaries resolve,
  status stays 200.
- Two nested providers: both sets of boundaries resolve to their own content.

## Implementation

Failed boundaries are logged and contained, optional element/function fallbacks render without
stopping queue drainage, and a failing error fallback leaves the original fallback. Providers use
full UUID-prefixed `rw-*` targets. Unit and stream tests cover sibling progress, both fallback
modes, nested providers, and user-owned legacy ids.
