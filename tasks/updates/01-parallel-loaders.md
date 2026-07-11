# Run nested loaders concurrently

**Status:** implemented · **Size:** S · **Files:** `src/router.ts`

## Problem

`routeData` (`src/router.ts:225`) awaits each fragment's loader in sequence:

```ts
for (let i = 0; i < fragments.length; i++) {
  const data = mod.loader ? await mod.loader(ctx) : undefined;
  ...
}
```

A route nested three deep with three 50ms loaders pays 150ms before the first byte, even though the
loaders are independent by design (each receives only `ctx`, never a parent's data). Nested-route
frameworks (React Router, Remix) run these in parallel for exactly this reason, and on Workers the
loader time is usually subrequest latency — the most parallelizable thing there is.

## Proposal

Kick off all loaders, then settle in order:

```ts
const results = fragments.map(({ mod }) => mod.loader?.(ctx));
for (let i = 0; i < fragments.length; i++) {
  const data = await results[i];
  if (data instanceof Response) throw data;
  loaderData[i] = data;
  if (fragments[i].mod.headers) { ...merge as today... }
}
```

Header merge order stays parent→leaf (unchanged), and the first thrown `Response` still wins
deterministically because settlement is sequential.

## Behavior change to decide on

Today, a parent loader throwing a `Response` (redirect, 401) means child loaders never run. With the
above, children _start_ — their side effects happen even when the parent redirects. If that matters,
either document it (React Router accepts it) or add unhandled-rejection guards
(`results[i]?.catch(() => {})` after the winning throw) so a losing loader's rejection doesn't
surface as an unhandled rejection in workerd. The guard is needed either way.

Add a test: two nested loaders with deferred resolution, assert both are in flight before either
resolves, and assert header order is unchanged.

## Implementation

`routeData` starts every loader promise before settling them parent-to-leaf and attaches rejection
observers immediately. Router tests cover concurrent starts, deterministic header order, and a
losing rejection after an earlier response wins. README and usage docs describe the side-effect
tradeoff.
