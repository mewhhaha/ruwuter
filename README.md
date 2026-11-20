# Ruwuter

A tiny Fetch router for streaming HTML. A route can send the page heading, links, and form while an
async JSX component is still fetching data. Native navigation and ordered streaming use zero browser
JavaScript.

## Start with a route

Install with `deno add jsr:@mewhhaha/ruwuter` or `pnpm add jsr:@mewhhaha/ruwuter`. Set
`compilerOptions.jsx` to `"react-jsx"` and `jsxImportSource` to `"@mewhhaha/ruwuter"`.

```tsx
import { html, router } from "@mewhhaha/ruwuter";

const app = router()
  .get("/hello/:name", ({ params }) => html(<h1>Hello {params.name}</h1>))
  .post("/messages", async ({ request }) => {
    const data = await request.formData();
    return html(<p>Received {String(data.get("message"))}</p>, { status: 201 });
  });

export default { fetch: app.fetch };
```

Use `Deno.serve(app.fetch)` on Deno or export the Fetch handler on Workers. The server needs Fetch,
Web Streams, URLPattern, and AsyncLocalStorage. On Workers enable `nodejs_als` or `nodejs_compat`.

Handlers return a standard Response. Use `html()` for documents and fragments, `Response.json()` for
data, and `Response.redirect()` for redirects. Make status and authorization decisions before
returning. Once a body has started, a rendering failure ends the stream. An HTML root gets a
doctype. Plain text, including strings produced asynchronously, is escaped. `unsafeHTML(string)`
inserts trusted markup. Applications choose which URLs to put in HTML attributes.

Register other methods with `.route(path, { PUT, PATCH, DELETE, HEAD, OPTIONS })`. The first
matching pattern owns the request. Repeated registrations of the same path string add methods. GET
supplies a bodyless HEAD by default. OPTIONS and 405 include Allow. A miss returns 404.
`router<Bindings>()` types the platform bindings at `ctx.env`. Pass `ctx.signal` into fetches and
other interruptible work. Cancelling a routed HTML body also signals its handler's work.

## Stream slow content

Put essential content in an ordinary async component. The browser displays earlier siblings while it
waits, including when JavaScript is disabled. The [product example](./examples/product.tsx) renders
the heading and a native review form before reviews arrive. Its POST handler saves once and responds
with a 303 redirect.

For independent sections that can appear in completion order, use a deferred panel.

```tsx
import { Deferred } from "@mewhhaha/ruwuter/components";

const page = html(
  <main>
    <h1>Activity</h1>
    <Deferred
      fallback={<a href="/activity">View activity</a>}
      errorFallback={<p>Activity is unavailable.</p>}
    >
      {async () => <ul>{await activityItems()}</ul>}
    </Deferred>
  </main>,
);
```

Inside a routed response, panels share a request-local queue. After the shell the renderer emits a
single external classic script before the first replacement. Each template has a trailing completion
marker so the browser can safely apply a panel delivered over multiple network reads. Serve the
reserved `/_ruwuter/resolve-v1.js` path through the same router and allow same-origin scripts in
your CSP. With scripting disabled, the reader keeps the fallback. Outside a routed response,
`html()`, `renderToString()`, and `renderToStream()` render deferred children in order.

## Add a little browser behavior

Use native links, form submissions, and dialog commands first. For a widget, put a controller on the
element that owns it. The module receives its root, JSON props, typed refs, and a signal. Removal
aborts the signal and runs cleanup. Moving the root within the document preserves the controller.

```ts
// app/counter.client.ts
import { defineController, on } from "@mewhhaha/ruwuter/browser";

export default defineController<{ props: { initial: number } }>(({ root, props, signal }) => {
  let count = props.initial;
  on(root).click(() => {
    root.textContent = String(++count);
  }, { signal });
});
```

```tsx
import clientRuntime from "@mewhhaha/ruwuter/client.js?url&no-inline";
import { controller } from "@mewhhaha/ruwuter/browser";
import { counter } from "./app/controllers.ts";

const mounted = controller(counter, { initial: 0 });
const button = <button type="button" {...mounted.root()}>0</button>;
const activation = <script type="module" src={clientRuntime}></script>;
```

Include the activation script once on pages with controllers. Vite emits the typed controller URL
and compiled runtime. Without Vite, serve the compiled browser modules yourself and pass their
same-origin URLs. Use static `ref={mounted.refs.name}` tokens for a multi-element widget. For a
targeted refresh, fetch an ordinary HTML route and pass the response to `swap` from
`@mewhhaha/ruwuter/browser`.

## Optional file routes

Export named HTTP handlers from `app/routes/`. For example, `products.$id.tsx` matches
`/products/:id`. Dots introduce nested paths, `_index` matches the parent, and pathless segments
group files. Compose layouts as ordinary components in the handler.

```tsx
// app/routes/products.$id.tsx
import { type HandlerContext, html } from "@mewhhaha/ruwuter";

export function GET({ params }: HandlerContext<undefined, { id: string }>) {
  return html(<h1>Product {params.id}</h1>);
}
```

Run `deno run -A jsr:@mewhhaha/ruwuter/fs-routes/cli ./app` and pass the generated table to
`router(routes)`. The generator also writes per-route `Context<Bindings>` types under
`.router/types`. The Vite plugin `ruwuter({ appFolder: "./app" })` generates the same table, watches
route changes, and builds typed controller modules. A hand-written router needs neither generation
nor Vite.

## Moving from 0.6

- Move loader status decisions into named method handlers. Compose nested layouts explicitly and put
  slow reads in their own components. Give each fragment an ordinary GET or POST URL.
- The previous `Router`, `fragment`, and loader types are available from `@mewhhaha/ruwuter/legacy`
  for applications migrating existing route tables. Update imports in those tables before
  regenerating for 0.7.
- Replace `client()`, `move()` and JSX event directives with a controller. Remove `clientMacro` from
  Vite options and remove the `navigate.js` script. Links and forms now use native navigation.
- Replace raw HTML strings and `dangerouslySetInnerHTML` with `unsafeHTML(trustedMarkup)`.
- On the method router, replace a manual Suspense provider and resolver script with `Deferred`.
  Update server and browser assets together for the completion-marker protocol.

## Development

Run `deno task ci` for unit, DOM, type, and size checks. Run `deno task browsers:install` followed
by `deno task test:browser` for Chromium, Firefox and WebKit. CI runs both suites. After editing the
resolver, run `deno task resolver:build` using the Deno version in CI to update its embedded
external asset.

MIT
