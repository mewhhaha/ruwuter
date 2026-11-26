# Ruwuter

A tiny Fetch router for streaming HTML. A route can send the page heading, links, and forms while an
async JSX component is still fetching data. Native navigation and ordered streaming use zero browser
JavaScript.

- [Design notes](https://github.com/mewhhaha/ruwuter/blob/main/docs/router-design.md)
- [0.6 → 0.7 benchmarks](https://github.com/mewhhaha/ruwuter/blob/main/docs/benchmarks/README.md)
- [Performance & interactivity benchmarks](https://github.com/mewhhaha/ruwuter/blob/main/docs/benchmarks/perf-fixes.md)
- [Full product example](https://github.com/mewhhaha/ruwuter/blob/main/examples/product.tsx)
- [Fixi-style progressive reviews example](https://github.com/mewhhaha/ruwuter/blob/main/examples/fixi-reviews.tsx)

## Install & Quick Start

```sh
deno add jsr:@mewhhaha/ruwuter
# or
pnpm add jsr:@mewhhaha/ruwuter
```

Configure JSX in `deno.json` or `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@mewhhaha/ruwuter"
  }
}
```

Create a router and export its Fetch handler:

```tsx
import { html, router } from "@mewhhaha/ruwuter";

const app = router()
  .get("/hello/:name", ({ params }) => html(<h1>Hello {params.name}</h1>))
  .post("/messages", async ({ request }) => {
    const data = await request.formData();
    return html(<p>Received {String(data.get("message") ?? "")}</p>, { status: 201 });
  });

export default { fetch: app.fetch };
```

Run `Deno.serve(app.fetch)` on Deno or export `{ fetch: app.fetch }` on Cloudflare Workers. The
server runtime needs Fetch, Web Streams, `URLPattern`, and `AsyncLocalStorage` (on Workers, enable
`nodejs_als` or `nodejs_compat`).

### Responses & escaping

- Handlers return a standard `Response`: use `html()` for documents and fragments, `Response.json()`
  for data, and `Response.redirect()` for redirects.
- Make auth, redirect, and status decisions before returning `html()`. Once streaming starts, a
  rendering error ends the stream.
- An `<html>` root automatically gets `<!doctype html>`.
- Plain text—including strings produced asynchronously—is HTML-escaped everywhere. Use
  `unsafeHTML(markup)` for explicitly trusted markup (including raw CSS/JS inside `<style>` or
  `<script>`). Applications validate any user-controlled URL attributes.

### Methods, bindings & cancellation

- Register additional methods with `.route(path, { PUT, PATCH, DELETE, HEAD, OPTIONS })`.
- The first matching pattern owns the request; repeated registrations of the same path string add
  methods to that route.
- `GET` provides a bodyless `HEAD` automatically. `OPTIONS` (204) and `405` include `Allow`;
  explicit `OPTIONS` handlers can set their own `Allow` header. Unmatched requests return `404`.
- Type platform bindings with `router<Bindings>()` (`ctx.env`) and pass `ctx.signal` into fetches or
  other interruptible work. Cancelling a routed HTML response aborts its handler's signal.

## Streaming HTML

### Ordered streaming (zero JS)

Put essential content in an ordinary async component. The browser renders earlier siblings while it
waits—even with JavaScript disabled:

```tsx
async function Reviews({ id, signal }: { id: string; signal: AbortSignal }) {
  const items = await loadReviews(id, signal);
  return <ul>{items.map((text) => <li>{text}</li>)}</ul>;
}

app.get("/products/:id", async ({ params, signal }) => {
  const product = await loadProduct(params.id, signal);
  if (!product) return new Response(null, { status: 404 });

  return html(
    <main>
      <h1>{product.name}</h1>
      <form method="post" action={`/products/${params.id}/reviews`}>
        <input name="review" required />
        <button type="submit">Save review</button>
      </form>
      <Reviews id={params.id} signal={signal} />
    </main>,
  );
});
```

See the complete
[product example](https://github.com/mewhhaha/ruwuter/blob/main/examples/product.tsx) for the
matching `POST` handler with a `303` redirect.

### Out-of-order panels (`Deferred`)

For independent sections that can settle in completion order, wrap them in `Deferred`:

```tsx
import { html, router } from "@mewhhaha/ruwuter";
import { Deferred } from "@mewhhaha/ruwuter/components";

const app = router().get("/activity", () =>
  html(
    <main>
      <h1>Activity</h1>
      <Deferred
        fallback={<a href="/activity/full">View activity</a>}
        errorFallback={<p>Activity is unavailable.</p>}
      >
        {async () => <ul>{await activityItems()}</ul>}
      </Deferred>
    </main>,
  ));
```

- **Protocol**: Inside a routed response, panels share a request-local queue. After the shell,
  Ruwuter emits a single external classic `<script>` before the first replacement and a trailing
  `<!--rw-end-->` marker after each `<template>` so split network chunks apply safely. Keep HTML
  comments intact through proxies or sanitizers.
- **Reverse proxies, `<base href>`, & CSP**: By default the script uses the root-relative
  `/_ruwuter/resolve-v1.js` path served by the same router, staying same-origin behind
  TLS-terminating proxies. Pass `resolverSrc` to `router(routes, { resolverSrc })` or
  `html(node, { resolverSrc, nonce })` when documents set a cross-origin `<base href>`, live under a
  subpath prefix, or enforce a nonce-based CSP.
- **Fallbacks & standalone rendering**: Wrapper props (`as` and HTML attributes) apply only to the
  temporary fallback element before replacement. With scripting disabled, readers keep the fallback.
  Outside a routed response, `html()`, `renderToString()`, and `renderToStream()` render deferred
  children in order while still honoring `errorFallback`.
- **Server context**: Use `createContext()` from `@mewhhaha/ruwuter/components` to pass request or
  layout values into async components and deferred panels.

## Optional Browser Behavior

Start with native links, forms, and `<dialog>` commands. Add JavaScript only where a widget needs
local state or a partial DOM update.

### Controllers

Attach a same-origin browser module to the element that owns a widget. The controller receives its
`root`, JSON `props`, typed `refs`, and an `AbortSignal`. Removing the root aborts the signal and
runs any returned cleanup; moving the root within the document preserves the instance.

```ts
// app/counter.client.ts
import { defineController, on } from "@mewhhaha/ruwuter/browser";

export default defineController<{ props: { initial: number }; refs: { count: HTMLSpanElement } }>(
  ({ root, props, refs, signal }) => {
    let count = props.initial;
    on(root).click(() => {
      refs.count.textContent = String(++count);
    }, { signal });
  },
);
```

```tsx
// server route
import clientRuntime from "@mewhhaha/ruwuter/client.js?url&no-inline";
import { html } from "@mewhhaha/ruwuter";
import { controller } from "@mewhhaha/ruwuter/browser";
import { counter } from "./app/controllers.ts";

app.get("/counter", () => {
  const mounted = controller(counter, { initial: 0 });
  return html(
    <html>
      <body>
        <button type="button" {...mounted.root()}>
          Count: <span ref={mounted.refs.count}>0</span>
        </button>
        <script type="module" async src={clientRuntime}></script>
      </body>
    </html>,
  );
});
```

- Load the activation script (`client.js`) once on pages with controllers. Adding `async` lets
  above-the-fold controllers activate immediately in Chromium and Firefox while slower streamed
  sections or `Deferred` panels finish (WebKit defers async module scripts until stream close).
- `ref={mounted.refs.name}` tokens resolve live within their nearest enclosing controller, so nested
  widgets do not collide and refs stay fresh after `outerHTML` swaps or settled `Deferred` panels.
- With the Vite plugin, `app/controllers.ts` exports typed controller URLs and compiles the runtime.
  Without Vite, serve compiled browser modules yourself and pass their same-origin URLs directly to
  `controller("/assets/counter.js", props)`.

### Targeted swaps (`swap`) & fixi-style HTML updates

For a partial page refresh, fetch an ordinary HTML route and apply it with `swap`:

```ts
import { swap } from "@mewhhaha/ruwuter/browser";

const response = await fetch("/products/1/reviews");
await swap(response, {
  target: "#reviews",
  allowStatus: (status) => status < 500, // optional: swap 4xx validation HTML fragments
});
```

`swap` validates HTML responses, applies completed `Deferred` panels even when the host page started
without a resolver, strips inert resolver `<script>` tags from swapped fragments, supports custom
`sanitizer`, `trustedTypesPolicy`, `allowStatus`, and custom `write` callbacks (such as a DOM
morpher like `idiomorph`), and opts into View Transitions only when `viewTransition: true` is
passed.

For declarative HTML-over-the-wire interactions without per-widget controller boilerplate, Ruwuter's
JSX types accept `fx-*` attributes out of the box—so you can either drop in `fixi.js` directly or
mount a tiny reusable fixi-style controller built on `swap()` (see
[examples/fx.client.ts](https://github.com/mewhhaha/ruwuter/blob/main/examples/fx.client.ts) and
[examples/fixi-reviews.tsx](https://github.com/mewhhaha/ruwuter/blob/main/examples/fixi-reviews.tsx)
for progressive `POST` + `422` errors, `DELETE` buttons, debounced live search, and `<Deferred>`
swaps).

## Optional File Routes & Vite

Export uppercase HTTP method handlers from `app/routes/`. Dots create nested paths
(`products.$id.tsx` → `/products/:id`), `_index` matches the parent path, pathless segments
(`_auth.login.tsx`) group files, and route directories (`products/route.tsx` or `route.ts`) colocate
helpers. Compose layouts as ordinary components inside handlers.

```tsx
// app/routes/products.$id.tsx
import { type HandlerContext, html } from "@mewhhaha/ruwuter";

export function GET({ params }: HandlerContext<unknown, { id: string }>) {
  return html(<h1>Product {params.id}</h1>);
}
```

Generate `app/routes.ts` and per-route `.router/types` `Context<Bindings>` definitions with the CLI:

```sh
deno run -A jsr:@mewhhaha/ruwuter/fs-routes/cli ./app
```

Then pass the generated table to `router(routes)`:

```ts
import { router } from "@mewhhaha/ruwuter";
import { routes } from "./app/routes.ts";

export default { fetch: router(routes).fetch };
```

For Vite apps, add the plugin to generate routes, watch changes, and emit typed `app/controllers.ts`
and browser runtime chunks:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { ruwuter } from "@mewhhaha/ruwuter/vite";

export default defineConfig({
  plugins: [ruwuter({ appFolder: "./app" })],
});
```

A hand-written router needs neither code generation nor Vite.

## Package Entry Points

| Entry point                       | Exports / Purpose                                                  |
| --------------------------------- | ------------------------------------------------------------------ |
| `@mewhhaha/ruwuter`               | `router`, `html`, `renderToString`, `renderToStream`, `unsafeHTML` |
| `@mewhhaha/ruwuter/components`    | `Deferred`, `createContext`, `use`                                 |
| `@mewhhaha/ruwuter/browser`       | `defineController`, `controller`, `on`, `swap`                     |
| `@mewhhaha/ruwuter/client.js`     | Self-starting browser controller runtime                           |
| `@mewhhaha/ruwuter/swap.js`       | Standalone browser `swap` module                                   |
| `@mewhhaha/ruwuter/fs-routes`     | Programmatic `generate()` for file routes                          |
| `@mewhhaha/ruwuter/fs-routes/cli` | CLI generator for `routes.ts` and `.router/types`                  |
| `@mewhhaha/ruwuter/vite`          | `ruwuter()` Vite plugin for routes and compiled browser modules    |
| `@mewhhaha/ruwuter/legacy`        | 0.6 `Router`, `fragment`, and loader/action compatibility layer    |

## Moving from 0.6

- Move loader status decisions into named method handlers. Compose nested layouts explicitly and put
  slow reads in their own components. Give each fragment an ordinary `GET` or `POST` URL.
- The previous `Router`, `fragment`, and loader types remain available from
  `@mewhhaha/ruwuter/legacy` (and legacy inference helpers from `@mewhhaha/ruwuter/types`) while
  migrating existing route tables. Update imports in those tables before regenerating for 0.7.
- Replace `client()`, `move()`, and JSX event directives with a controller. Remove `clientMacro`
  from Vite options and remove the `navigate.js` script. Links and forms now use native navigation.
- Replace raw HTML strings and `dangerouslySetInnerHTML` with `unsafeHTML(trustedMarkup)`.
- On the method router, replace a manual `SuspenseProvider` and resolver script with `Deferred`.
  Update server and browser assets together for the completion-marker protocol.

## Development

- Run `deno task ci` for formatting, lint, typecheck, unit tests, DOM tests, and browser size
  budgets.
- Run `deno task browsers:install` followed by `deno task test:browser` for Chromium, Firefox, and
  WebKit. CI runs both suites.
- After editing the panel resolver (`src/runtime/resolve.ts` or `src/runtime/panels.ts`), run
  `deno task resolver:build` with the Deno version pinned in
  [`.github/workflows/ci.yml`](https://github.com/mewhhaha/ruwuter/blob/main/.github/workflows/ci.yml)
  to update `src/runtime/resolve-source.ts`.

## License

MIT
