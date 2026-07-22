# Ruwuter

Ruwuter is a server-first router and HTML renderer for Cloudflare-style Web APIs. It matches
generated `URLPattern` routes, runs loaders/actions, renders nested server components to HTML, and
lets ordinary links and forms work without JavaScript.

Browser JavaScript is optional and explicit: move one event callback into a browser module or mount
a controller for behavior that spans elements, then load the small activation runtime.

## Runtime Requirements

The deployed server path uses Fetch API objects, Web Streams, `URLPattern`, and `AsyncLocalStorage`
from `node:async_hooks`. The `node:` specifier is a shared server-runtime compatibility surface
rather than a Node-only deployment target: [Node.js](https://nodejs.org/api/async_context.html) and
[Deno](https://docs.deno.com/api/node/async_hooks/) provide it directly, and
[Vercel Edge](https://vercel.com/docs/functions/runtimes/edge#compatible-node.js-modules) provides
the WinterCG-compatible subset Ruwuter uses.

On Cloudflare Workers, enable only `AsyncLocalStorage` with
[`nodejs_als`](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-compatibility-flag),
or use `nodejs_compat` when the application needs broader Node compatibility:

```jsonc
{
  "compatibility_flags": ["nodejs_als"]
}
```

Do not replace `node:async_hooks` with a no-op or module-global mock. Ruwuter uses
`AsyncLocalStorage` to keep server context and streamed Suspense state isolated across concurrent
requests and asynchronous stream pulls. A runtime without equivalent async-context semantics is not
currently supported; a Promise-only userland polyfill cannot reliably provide them.

The other Node built-in imports (`node:fs`, `node:path`, and `node:process`) are confined to the
file-route generator, CLI, and Vite build integration. They are not part of the deployed router
path.

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

The router itself stays out of error and not-found presentation: unmatched requests return an empty
`404`, and errors that are not a `Response` rethrow to the caller. Wrap `handle` to provide your own
responses:

```tsx
import { html } from "@mewhhaha/ruwuter";

export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    try {
      const response = await router.handle(request, env, executionContext);
      if (response.status === 404 && !response.body) {
        return html(<h1>Not found: {new URL(request.url).pathname}</h1>, { status: 404 });
      }
      return response;
    } catch (error) {
      executionContext.waitUntil(reportError(error));
      return html(<h1>Something went wrong</h1>, { status: 500 });
    }
  },
};
```

Once a streamed response has begun, a later rendering failure cannot change its status or reach your
catch; the already-committed body ends early instead.

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

For one local event, the same plugin can move a callback directly from server JSX:

```tsx
import { move } from "@mewhhaha/ruwuter/browser";

export default function Counter({ count }: { count: number }) {
  return (
    <button
      type="button"
      on:click={move({ count }, async (event, values) => {
        const button = event.currentTarget;
        const { default: confetti } = await import("canvas-confetti");
        button.textContent = String(values.count + 1);
        confetti();
      })}
    >
      {count}
    </button>
  );
}
```

`move()` is also Vite-only and requires `clientMacro: true`. The event and element types come from
the `on:event` prop, while the values object must be JSON-safe. The callback may use browser
globals, static imports, and dynamic imports; Vite bundles installed dependencies normally. It
cannot capture server bindings, so rendered values cross the boundary explicitly through `move()`'s
first argument. The HTML contains only an event name, a same-origin browser module URL, and those
JSON values—never function source or evaluated code. Load `client.js` once on any page that uses
moved events.

The runtime mounts each controller or moved-event root once. On removal it waits for the mutation
batch, ignores DOM moves, aborts the root signal, and then runs any controller cleanup callback.

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
