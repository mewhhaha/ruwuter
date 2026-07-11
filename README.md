# Ruwuter

Ruwuter is a server-first router and HTML renderer for Cloudflare-style Web APIs. It matches
generated `URLPattern` routes, runs loaders/actions, renders nested server components to HTML, and
lets ordinary links and forms work without JavaScript.

Browser JavaScript is optional and explicit: add a controller root, load the small activation
runtime, and mount a browser module against that root.

## Install

```sh
pnpm add jsr:@mewhhaha/ruwuter
# or: deno add jsr:@mewhhaha/ruwuter
```

## Router

```tsx
import { Router } from "@mewhhaha/ruwuter";
import { routes } from "./app/routes.ts";

const router = Router(routes);

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    return router.handle(request, env, executionContext);
  },
};
```

Route loaders, actions, headers, and fragment handlers receive named context:

```ts
type RequestContext = {
  request: Request;
  params: Record<string, string>;
  env: Env;
  executionContext: ExecutionContext;
  signal: AbortSignal;
};
```

`GET` and `HEAD` use loaders/default components. Actions handle `POST`, `PUT`, `PATCH`, and
`DELETE`. Matched but unsupported methods return `405` with `Allow`; `OPTIONS` returns `204` with
`Allow`. Nested route loaders start concurrently; their results and headers are still applied in
parent-to-leaf order. Because every loader starts before settlement, child loader side effects may
run even when a parent redirects or fails; later rejections are observed and do not become unhandled
promises.

Applications can provide global error and not-found responses:

```tsx
import { html } from "@mewhhaha/ruwuter";

const router = Router(routes, {
  onNotFound: (ctx) =>
    html(<h1>Not found: {new URL(ctx.request.url).pathname}</h1>, {
      status: 404,
    }),
  onError: (error, ctx) => {
    ctx.executionContext.waitUntil(reportError(error));
    return html(<h1>Something went wrong</h1>, { status: 500 });
  },
});
```

Unhandled failures are logged as complete error values, preserving stacks and causes. Returning
`undefined` from either hook uses the default empty response. Once a streamed response has begun, a
later rendering failure cannot change its status or invoke `onError`; the already-committed body
ends early instead.

## Response Helpers

```tsx
import { html, json } from "@mewhhaha/ruwuter";

export const loader = () => {
  return json({ ok: true }, { status: 200 });
};

export const action = async () => {
  return html(<p>Created</p>, {
    status: 201,
    headers: { "Cache-Control": "private" },
  });
};
```

## Controllers

Define browser controllers with typed props and static ref tokens. Use
`controller(moduleHref, props)` on the DOM root that owns the browser behavior.

```tsx
import clientRuntime from "@mewhhaha/ruwuter/client.js?url&no-inline";
import { controller } from "@mewhhaha/ruwuter/browser";
import { palette } from "./app/controllers.ts";

export default function Palette() {
  const mounted = controller(palette, { initiallyOpen: false });

  return (
    <html>
      <head>
        <script type="module" src={clientRuntime}></script>
      </head>
      <body>
        <section {...mounted.root()}>
          <button ref={mounted.refs.open} type="button">Open</button>
          <dialog ref={mounted.refs.dialog}>...</dialog>
        </section>
      </body>
    </html>
  );
}
```

```ts
// app/palette.client.ts
"use client";

import { defineController, on } from "@mewhhaha/ruwuter/browser";

export type PaletteController = {
  props: {
    initiallyOpen: boolean;
  };
  refs: {
    open: HTMLButtonElement;
    dialog: HTMLDialogElement;
  };
};

export default defineController<PaletteController>(({ refs, props, signal }) => {
  if (props.initiallyOpen) refs.dialog.showModal();

  on(refs.open).click(() => refs.dialog.showModal(), { signal });

  return () => {
    refs.dialog.close();
  };
});
```

With the Vite plugin enabled, every `*.client.ts` or `*.client.tsx` under the app folder contributes
a typed export to generated `app/controllers.ts`. The URL is served as compiled JavaScript in dev
and emitted as a dedicated cache-busted chunk in production; an invalid default export fails type
checking. The generator refuses to overwrite an unmarked, user-owned `controllers.ts`.

For same-file client logic, enable the experimental build-time macro:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { ruwuter } from "@mewhhaha/ruwuter/vite";

export default defineConfig({
  plugins: [ruwuter({ appFolder: "./app", clientMacro: true })],
});

// a route module
import { client, on } from "@mewhhaha/ruwuter/browser";

const palette = client<{
  props: { initiallyOpen: boolean };
  refs: { open: HTMLButtonElement; dialog: HTMLDialogElement };
}>(({ refs, props, signal }) => {
  on(refs.open).click(() => refs.dialog.showModal(), { signal });
  if (props.initiallyOpen) refs.dialog.showModal();
});
```

`client()` must initialize a top-level `const`. Its callback may use browser globals and imported
bindings, but cannot capture other module values; pass server values through controller props. The
macro emits a separate browser controller in both dev and production and adds nothing to the default
runtime. Without `clientMacro: true`, `client()` throws with an actionable error.

The runtime mounts each controller root once. On removal it waits for the mutation batch, ignores
DOM moves, aborts the controller signal, and then runs the returned cleanup callback.

## Fragments

HTML-over-the-wire fragments are explicit route-module exports, not discovered component names.

```tsx
import { fragment } from "@mewhhaha/ruwuter";

export const fragments = {
  sidebar: fragment(async ({ env }) => <aside>{env.SITE_NAME}</aside>),
  save: fragment(async ({ request }) => {
    const fields = await request.formData();
    return <p>Saved {String(fields.get("name"))}</p>;
  }, { methods: ["POST"] }),
};
```

Fetch fragments from the reserved namespace:

```text
/products/keyboard/_ruwuter/sidebar
```

Fragments handle `GET` and `HEAD` by default. Pass `methods` to opt into mutation requests;
`OPTIONS` and `Allow` are derived from each fragment's declared methods.

## File-System Routes

Generate static routes from an app folder:

```sh
deno run -A jsr:@mewhhaha/ruwuter/fs-routes/cli ./app
```

Or use the Vite plugin:

```tsx
import { defineConfig } from "vite";
import { ruwuter } from "@mewhhaha/ruwuter/vite";

export default defineConfig({
  plugins: [ruwuter({ appFolder: "./app" })],
});
```

The plugin regenerates routes, types, and typed controller hrefs during builds and relevant
dev-server updates. Controller sources and documented `client.js` / `resolve.js` / `swap.js` /
`navigate.js` `?url` imports become executable browser chunks; application-wide `import.meta.url`
rewriting is not used.

## Suspense Runtime

Out-of-order Suspense streaming is optional. Wrap the document with `SuspenseProvider` and load the
resolver runtime only when you opt into streamed template replacement.

```tsx
import resolveRuntime from "@mewhhaha/ruwuter/resolve.js?url&no-inline";
import { Suspense, SuspenseProvider } from "@mewhhaha/ruwuter/components";

export default function Page() {
  return (
    <html>
      <head>
        <script type="module" src={resolveRuntime}></script>
      </head>
      <body>
        <SuspenseProvider>
          <Suspense
            fallback={<p>Loading</p>}
            errorFallback={(error) => <p>Could not load: {String(error)}</p>}
          >
            {async () => <p>Ready</p>}
          </Suspense>
        </SuspenseProvider>
      </body>
    </html>
  );
}
```

A rejected boundary is logged and contained: its `errorFallback` replaces that boundary while other
boundaries keep streaming. Without `errorFallback`, its original fallback stays in place.
Provider-prefixed UUID targets keep independently rendered boundary sets from colliding.

## Enhanced Navigation

Enhanced same-origin links and forms are an optional browser entrypoint. It uses the Navigation API
when available and otherwise leaves ordinary document navigation untouched.

```tsx
import navigateRuntime from "@mewhhaha/ruwuter/navigate.js?url&no-inline";

export default function Document({ children }) {
  return (
    <html>
      <head>
        <meta name="rw-navigate-target" content="#app" />
      </head>
      <body>
        <main id="app">{children}</main>
        <script type="module" src={navigateRuntime}></script>
      </body>
    </html>
  );
}
```

The destination must render the same target selector. The runtime fetches same-origin GET and POST
navigations, preserves form encoding, parses the returned document, and replaces only the target's
children inside a View Transition. Browser reloads, hash changes, downloads, cross-origin URLs, and
unsupported browsers keep native behavior. Configure it from a module with
`enhanceNavigation({ target: "#app", viewTransition: false })` when a meta element is inconvenient.

Enhanced navigation waits for the complete response. Pages relying on progressive out-of-order
Suspense streaming should include `<meta name="rw-navigate" content="reload">`; the runtime then
finishes with a normal document load. Add `data-rw-reload` to an individual link or form to skip
interception before fetching.

## Checks

```sh
deno task ci
```

This runs formatting, linting, typecheck, unit tests, DOM integration tests, and gzip size gates.
The enforced browser budgets are 1,400 B for `client.js`, 500 B for `resolve.js`, 1,450 B for
`swap.js`, and 1,500 B for opt-in `navigate.js`.

## License

MIT
