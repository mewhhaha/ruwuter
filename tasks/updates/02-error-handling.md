# Better error surfaces

**Status:** implemented · **Size:** S · **Files:** `src/router.ts`

## Problem

The router's catch-all (`src/router.ts:490-499`) does two lossy things:

1. `console.error(error.message)` — drops the stack and the cause chain. On Workers, the stack in
   the tail log is often the only debugging signal you get.
2. Returns `new Response(null, { status: 500 })` — every failure is an unexplained blank page, with
   no way for the app to render its own error page.

There's also no custom 404: an unmatched path returns a bare empty 404 unless the app defines a
catch-all `$` route.

## Proposal (in order of cheapness)

1. **Log the whole error.** `console.error(error)` — one-line change, keeps stacks and `cause`.
2. **`onError` router option.**

   ```ts
   Router(routes, {
     onError?: (error: unknown, ctx: RequestContext) => Response | Promise<Response> | undefined;
   })
   ```

   Called from the catch-all; `undefined` falls through to today's 500. This is the smallest hook
   that lets an app render a branded error page, report to Sentry via `executionContext.waitUntil`,
   etc. A matching `onNotFound` (or letting `onError` receive a sentinel) covers custom 404s without
   inventing a reserved route name.
3. **Optional, bigger: per-route `catch` export** rendered inside parent layouts, mirroring
   `loader`/`action`. Only worth it if real apps outgrow `onError`; it complicates the streaming
   path (an error after streaming starts can't change the status code — that constraint is already
   acknowledged at `src/router.ts:314-320` and would need the same "too late" carve-out).

Stop at 1+2 unless there's demand. They add ~15 lines to the router and keep the error model
explainable in one paragraph.

Note for streamed responses: errors thrown _after_ the first chunk can't become a 500 — the stream
just aborts. Worth one sentence in the README so users know why they saw a truncated page instead of
an error page.

## Implementation

The router logs complete error values and accepts typed `onError` and `onNotFound` hooks. Hook
contexts retain dynamic params, including fragment failures and fragment misses. Tests also prove
that late stream errors cannot change the committed response; README and `docs/SKILLS.md` document
that limitation.
