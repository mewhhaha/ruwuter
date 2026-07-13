---
name: ruwuter-usage
description: Build, review, and maintain Ruwuter applications using server-first routes, streaming JSX, route-scoped fragments, typed browser controllers, server context, optional Suspense, and safe HTML swaps. Use when adding route modules, loaders, actions, headers, fragments, controller modules, generated route types, runtime scripts, or build configuration.
---

# Ruwuter Usage

## Mental Model

Ruwuter is server-first:

1. A generated `URLPattern` table matches the request.
2. Nested loaders and headers run.
3. Nested server components render escaped HTML.
4. Links and forms work without JavaScript.
5. Explicit controller roots may add local browser behavior.
6. Explicit route fragments may return server HTML for targeted swaps.
7. Out-of-order Suspense is optional and has its own runtime.

Treat server-rendered HTML as canonical UI state. Controllers are small DOM activators, not hydrated
components or a second state framework.

When documentation and implementation disagree, inspect `src/` and the matching tests, then update
the README and this skill together.

## Source Map

| Contract                              | Source                                                                                                                                         | Tests/examples                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Router, methods, responses, fragments | [src/router.ts](./src/router.ts)                                                                                                               | [test/router.test.tsx](./test/router.test.tsx), [test/router.errors.test.tsx](./test/router.errors.test.tsx)                                     |
| Public browser API                    | [src/browser.ts](./src/browser.ts)                                                                                                             | [README.md](./README.md)                                                                                                                         |
| Typed controllers and refs            | [src/components/client.ts](./src/components/client.ts)                                                                                         | [test/client.controller.test.tsx](./test/client.controller.test.tsx)                                                                             |
| Controller lifecycle                  | [src/runtime/client.ts](./src/runtime/client.ts)                                                                                               | [test-dom/client.runtime.dom.test.tsx](./test-dom/client.runtime.dom.test.tsx)                                                                   |
| JSX rendering and typing              | [src/runtime/jsx-runtime.ts](./src/runtime/jsx-runtime.ts), [src/runtime/jsx.ts](./src/runtime/jsx.ts)                                         | [test/jsx.attributes.test.tsx](./test/jsx.attributes.test.tsx), [test/client.onprop.test.tsx](./test/client.onprop.test.tsx)                     |
| File-route grammar                    | [src/fs-routes/route-name.ts](./src/fs-routes/route-name.ts), [src/fs-routes/generate-router.ts](./src/fs-routes/generate-router.ts)           | [test/fs-routes.generate-router.test.ts](./test/fs-routes.generate-router.test.ts)                                                               |
| Generated route types                 | [src/fs-routes/generate-types.ts](./src/fs-routes/generate-types.ts), [src/types.ts](./src/types.ts)                                           | [test/fs-routes.generate-types.test.ts](./test/fs-routes.generate-types.test.ts)                                                                 |
| Generated controller hrefs            | [src/fs-routes/generate-controllers.ts](./src/fs-routes/generate-controllers.ts), [src/vite/controller-urls.ts](./src/vite/controller-urls.ts) | [test/fs-routes.generate-controllers.test.ts](./test/fs-routes.generate-controllers.test.ts), [test/vite.test.ts](./test/vite.test.ts)           |
| Server context                        | [src/components/context.ts](./src/components/context.ts)                                                                                       | [test/context.nesting.test.tsx](./test/context.nesting.test.tsx)                                                                                 |
| Suspense                              | [src/components/suspense.ts](./src/components/suspense.ts), [src/runtime/resolve.ts](./src/runtime/resolve.ts)                                 | [test/router.suspense.test.tsx](./test/router.suspense.test.tsx), [test-dom/resolve.runtime.dom.test.ts](./test-dom/resolve.runtime.dom.test.ts) |
| HTML swaps                            | [src/runtime/swap.ts](./src/runtime/swap.ts)                                                                                                   | [test-dom/swap.runtime.dom.test.ts](./test-dom/swap.runtime.dom.test.ts)                                                                         |
| Enhanced navigation                   | [src/runtime/navigate.ts](./src/runtime/navigate.ts)                                                                                           | [test-dom/navigate.runtime.dom.test.ts](./test-dom/navigate.runtime.dom.test.ts)                                                                 |
| Vite integration                      | [src/vite.ts](./src/vite.ts)                                                                                                                   | [test/vite.test.ts](./test/vite.test.ts)                                                                                                         |
| Exports and commands                  | [deno.json](./deno.json)                                                                                                                       | [.github/workflows/ci.yml](./.github/workflows/ci.yml)                                                                                           |

## Public Import Boundaries

Use the narrowest public entrypoint.

| Entrypoint                      | Use                                                                |
| ------------------------------- | ------------------------------------------------------------------ |
| `@mewhhaha/ruwuter`             | `Router`, `html`, `json`, `fragment`, render helpers, router types |
| `@mewhhaha/ruwuter/types`       | Route inference helpers                                            |
| `@mewhhaha/ruwuter/components`  | Server context and Suspense                                        |
| `@mewhhaha/ruwuter/browser`     | Controllers, typed events, and `swap`                              |
| `@mewhhaha/ruwuter/fs-routes`   | Programmatic generation                                            |
| `@mewhhaha/ruwuter/vite`        | Vite plugin                                                        |
| `@mewhhaha/ruwuter/client.js`   | Controller activation runtime URL                                  |
| `@mewhhaha/ruwuter/resolve.js`  | Suspense resolver runtime URL                                      |
| `@mewhhaha/ruwuter/swap.js`     | Standalone HTML swap module                                        |
| `@mewhhaha/ruwuter/navigate.js` | Opt-in Navigation API enhancement                                  |

Do not import server context or Suspense into `.client.ts` modules.

Repository invariant: `src/browser.ts` must re-export `controller`, because the public README and
examples mount controllers from `@mewhhaha/ruwuter/browser`.

## Setup

Configure JSX:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@mewhhaha/ruwuter"
  }
}
```

Create one router:

```ts
import { Router } from "@mewhhaha/ruwuter";
import { routes } from "./app/routes.ts";

const router = Router(routes);

export default {
  fetch(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ) {
    return router.handle(request, env, executionContext);
  },
};
```

The deployed server path requires Fetch API objects, Web Streams, `URLPattern`, and
`AsyncLocalStorage` from `node:async_hooks`. Node.js and Deno provide the module directly. On
Cloudflare Workers, enable the narrow `nodejs_als` compatibility flag, or use `nodejs_compat` when
the application needs broader Node compatibility.

Never replace `node:async_hooks` with a no-op or module-global mock. Ruwuter relies on native
async-context propagation to isolate server context and streamed Suspense state across concurrent
requests and asynchronous stream pulls. Runtimes without equivalent semantics are not supported. The
remaining `node:fs`, `node:path`, and `node:process` imports belong to file-route generation, the
CLI, and Vite build integration rather than the deployed router path.

Augment the package `Env` interface when route helpers should know application bindings:

```ts
declare module "@mewhhaha/ruwuter" {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
  }
}

export {};
```

References: [src/router.ts](./src/router.ts),
[src/components/context.ts](./src/components/context.ts).

## Application Structure

```text
app/
├── document.tsx
├── routes.ts              # generated; never edit
└── routes/
    ├── _index.tsx
    ├── about.tsx
    ├── blog.tsx
    ├── blog._index.tsx
    ├── blog.$slug.tsx
    └── api.users.ts
```

`document.tsx` is the outer document. Prefix modules become nested layouts: `blog.tsx` wraps
`blog._index.tsx` and `blog.$slug.tsx`.

A default route component receives its own `loaderData` and nested `children`. It does not receive
`RequestContext` directly.

## File-Route Grammar

| Module                  | Pattern                                  |
| ----------------------- | ---------------------------------------- |
| `_index.tsx`            | `/`                                      |
| `about.tsx`             | `/about`                                 |
| `blog._index.tsx`       | `/blog`                                  |
| `blog.$slug.tsx`        | `/blog/:slug`                            |
| `files.$.tsx`           | `/files/*`                               |
| `reports.$id[.pdf].tsx` | `/reports/:id.pdf`                       |
| `($lang).about.tsx`     | optional first segment, then `/about`    |
| `_app.dashboard.tsx`    | `/dashboard`, wrapped by pathless `_app` |
| `sitemap[.]xml.tsx`     | `/sitemap.xml`                           |
| `dolla-bills-[$].tsx`   | `/dolla-bills-$`                         |

Rules:

- `.` separates URL segments.
- `$name` is a parameter.
- Bare `$` is a catch-all.
- Parentheses make a segment optional.
- A segment beginning with `_` is pathless.
- `_index` contributes no URL segment.
- Brackets escape route syntax.
- Directories under `app/routes` are accepted and load `route.tsx`.
- Static routes sort before parameter routes.
- Equivalent patterns and generated symbol collisions are rejected.

References: [src/fs-routes/route-name.ts](./src/fs-routes/route-name.ts),
[src/fs-routes/generate-router.ts](./src/fs-routes/generate-router.ts).

## Route Modules

A route module may export:

```ts
export function loader(context) {}
export function action(context) {}
export function headers(context) {}
export const fragments = {};
export default function Component(props) {}
```

Loader, action, header, and fragment context:

```ts
type RequestContext<Env> = {
  request: Request;
  params: Record<string, string>;
  env: Env;
  executionContext: ExecutionContext;
  signal: AbortSignal;
};
```

Always pass `signal` to abortable downstream work.

### Canonical Route

```tsx
import { fragment, html, json } from "@mewhhaha/ruwuter";
import type { Route } from "<generated +types file>";

export async function loader({
  params,
  env,
  signal,
}: Route.LoaderArgs) {
  const product = await loadProduct(env.DB, params.slug, { signal });

  if (!product) {
    throw new Response("Not found", { status: 404 });
  }

  return { product };
}

export const headers: Route.HeadersFunction = ({ loaderData }) => ({
  "Cache-Control": loaderData.product.private ? "private" : "public, max-age=60",
});

export async function action({
  request,
  params,
  env,
  signal,
}: Route.ActionArgs) {
  switch (request.method) {
    case "POST":
      return json(
        await updateProduct(request, params.slug, env.DB, signal),
        { status: 202 },
      );
    case "DELETE":
      await deleteProduct(params.slug, env.DB, signal);
      return new Response(null, { status: 204 });
    default:
      return new Response(null, { status: 405 });
  }
}

export const fragments = {
  sidebar: fragment(async ({ params, env, signal }) => {
    const product = await loadProduct(env.DB, params.slug, { signal });
    return <aside>{product.summary}</aside>;
  }),
};

export default function Product({
  loaderData,
  children,
}: Route.ComponentProps) {
  return (
    <main>
      <h1>{loaderData.product.name}</h1>
      {children}
    </main>
  );
}
```

### Route Rules

- Nested loaders start concurrently, then settle parent-to-leaf before rendering.
- Child loaders have already started if a parent redirects or fails; keep loader side effects safe
  under that concurrency. Losing rejections are observed by the router.
- A loader result belongs to the same module’s component and header function.
- A loader with no default component returns plain values as JSON.
- One action handles `POST`, `PUT`, `PATCH`, and `DELETE`.
- Plain action results become JSON.
- Loaders and actions may return or throw `Response`.
- Route components may return JSX, strings, numbers, arrays, nullish values, or promises of those
  values.
- Route components must not return or throw `Response`; make status and redirect decisions in
  loaders/actions.
- Nested headers merge outer-to-inner. Later values replace earlier values except `Set-Cookie`,
  which appends.

Create application-wide error surfaces by wrapping `handle`; unmatched requests return an empty
`404` and non-`Response` errors rethrow to the caller:

```tsx
export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    try {
      const response = await router.handle(request, env, executionContext);
      if (response.status === 404 && !response.body) {
        return html(<h1>Not found</h1>, { status: 404 });
      }
      return response;
    } catch (error) {
      executionContext.waitUntil(reportError(error));
      return html(<h1>Server error</h1>, { status: 500 });
    }
  },
};
```

Errors raised after streaming has started cannot change the committed status or reach the wrapping
catch; they terminate the body stream.

References: [src/router.ts](./src/router.ts), [src/types.ts](./src/types.ts),
[test/router.test.tsx](./test/router.test.tsx).

## HTTP Semantics

- `GET`: run loaders, then render the matched component stack; without a component, return loader
  data as JSON.
- `HEAD`: run loaders and headers without rendering components; return no body.
- `POST`, `PUT`, `PATCH`, `DELETE`: invoke the leaf action.
- `OPTIONS`: return `204` and `Allow`.
- Unsupported methods on a matched route return `405` and `Allow`.
- Unmatched routes return `404`.

Use explicit response helpers:

```tsx
import { html, json } from "@mewhhaha/ruwuter";

return html(<p>Created</p>, {
  status: 201,
  headers: { "Cache-Control": "private" },
});

return json({ ok: true }, { status: 202 });
```

Use `renderToString()` and `renderToStream()` only when rendering outside normal route dispatch.

## Generated Types

Generation writes:

- `app/routes.ts`
- route helper files under `.router/types/...`
- `app/controllers.ts` from recursive `*.client.ts(x)` files when the Vite plugin runs

Each route helper exports:

```ts
export type RouteParams = ...;

export namespace Route {
  export type ComponentProps = ...;
  export type LoaderArgs = ...;
  export type ActionArgs = ...;
  export type HeadersFunction = ...;
}
```

Use the generated `Route` namespace for the current route. Do not duplicate parameter or loader-data
types manually.

Layout route types include descendant parameters as optional.

Never edit generated files. Regenerate after adding, removing, or renaming routes.

References: [src/fs-routes/generate-types.ts](./src/fs-routes/generate-types.ts),
[src/fs-routes/write.ts](./src/fs-routes/write.ts).

## Route-Scoped Fragments

Fragments return targeted server-rendered HTML.

For `/products/:slug`:

```text
/products/keyboard/_ruwuter/sidebar
```

Rules:

- The path before `/_ruwuter/` is matched normally.
- Dynamic params are preserved.
- The matched stack is searched leaf-to-outer-layout.
- Fragment handlers accept `GET` and `HEAD` by default; `OPTIONS` is automatic.
- Opt into mutation methods with `fragment(handler, { methods: ["POST"] })`. `Allow` is derived per
  endpoint.
- JSX results become HTML; returned `Response` values are preserved.
- Route loaders do not run automatically for fragment requests.
- A fragment name is one encoded path segment.

Reference: fragment dispatch in [src/router.ts](./src/router.ts) and tests in
[test/router.test.tsx](./test/router.test.tsx).

## Typed Browser Controllers

Use controllers for local browser behavior that native HTML cannot express. Prefer links, forms,
dialog commands, and popovers first.

Controllers are activation modules. There is no client VDOM, client JSX reconciliation, or reactive
server ref store.

### Define a Controller

```ts
// palette.client.ts
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

export default defineController<PaletteController>(
  ({ props, refs, signal }) => {
    if (props.initiallyOpen) {
      refs.dialog.showModal();
    }

    on(refs.open).click(
      () => refs.dialog.showModal(),
      { signal },
    );

    return () => {
      if (refs.dialog.open) refs.dialog.close();
    };
  },
);
```

### Mount It from Server JSX

```tsx
import clientRuntime from "@mewhhaha/ruwuter/client.js?url&no-inline";
import { controller } from "@mewhhaha/ruwuter/browser";
import { palette } from "./controllers.ts";

export default function Palette() {
  const mounted = controller(palette, {
    initiallyOpen: false,
  });

  return (
    <>
      <section {...mounted.root()}>
        <button ref={mounted.refs.open} type="button">
          Open
        </button>
        <dialog ref={mounted.refs.dialog}>
          Palette
        </dialog>
      </section>

      <script type="module" src={clientRuntime}></script>
    </>
  );
}
```

The Vite plugin generates the href type from each module's actual default `defineController()`
export, serves compiled controller modules during development, and emits cache-busted JavaScript
chunks for production. It refuses to replace a user-owned, unmarked `controllers.ts`. Deno-only
tooling does not generate Vite URL imports.

### Experimental Same-File Controllers

Enable `ruwuter({ clientMacro: true })`, then declare a top-level controller:

```ts
import { client, on } from "@mewhhaha/ruwuter/browser";

const palette = client<{
  props: { initiallyOpen: boolean };
  refs: { open: HTMLButtonElement; dialog: HTMLDialogElement };
}>(({ props, refs, signal }) => {
  if (props.initiallyOpen) refs.dialog.showModal();
  on(refs.open).click(() => refs.dialog.showModal(), { signal });
});
```

The macro is Vite-only and must initialize a top-level `const`. Callbacks may reference parameters,
browser globals, and imports. Capturing another module binding is a build error; pass server values
through JSON-safe props. Imported helpers are rebased into the emitted controller module. Without
the opt-in transform, `client()` throws immediately.

### Controller Rules

- Spread `mounted.root()` onto exactly one root element.
- Use only declared `ref={mounted.refs.name}` tokens.
- Ref tokens are checked against the JSX element type.
- Every ref accessed by the controller must be rendered under its root.
- Ref names must be unique within the root.
- Controller props must be JSON-safe and are visible in rendered HTML.
- Never include secrets in controller props.
- Do not pass functions, DOM objects, `bigint`, `undefined`, non-finite numbers, or cyclic values.
- Controller module URLs must be same-origin HTTP(S).
- Import generated hrefs from `app/controllers.ts`; do not cast raw source asset URLs.
- Load `client.js` once whenever controllers are present.
- Pass `signal` to listeners, fetches, and abortable APIs.
- Return cleanup for observers, timers, and third-party objects not governed by `signal`.
- Inserted controller roots activate automatically.
- DOM moves do not dispose controllers; disconnected roots are aborted and cleaned up.
- Do not use removed `client.scope`, `scope.mount`, `scope.unmount`, reactive `ref()`, hydration
  scripts, or serialized inline handlers.

References:

- [src/components/client.ts](./src/components/client.ts)
- [src/runtime/client.ts](./src/runtime/client.ts)
- [examples/open-palette.client.ts](./examples/open-palette.client.ts)
- [examples/client-scope-dialog.tsx](./examples/client-scope-dialog.tsx)
- [test/client.controller.test.tsx](./test/client.controller.test.tsx)
- [test-dom/client.runtime.dom.test.tsx](./test-dom/client.runtime.dom.test.tsx)

## Typed DOM Events

Inside controllers:

```ts
on(refs.button).click((event) => {
  event.currentTarget.disabled = true;
}, { signal });
```

`on()` is a typed `addEventListener` wrapper and returns a removal callback. Prefer `{ signal }`.

Do not add JSX props such as `onClick`, `onclick`, or `onSubmit`. The JSX runtime rejects every
attribute beginning with `on`.

## HTML Swaps

```ts
import { swap } from "@mewhhaha/ruwuter/browser";

await swap(
  new URL(`/products/${slug}/_ruwuter/sidebar`, location.href),
  {
    target: "#sidebar",
    write: "innerHTML",
    init: { signal },
    allowRedirects: false,
  },
);
```

Write modes:

```text
innerHTML | outerHTML
beforebegin | afterbegin | beforeend | afterend
remove
```

Safety rules:

- Prefer `Request`, `URL`, `Response`, or `Promise<Response>`.
- Fetched responses must be successful and HTML by default.
- Plain strings are rejected as ambiguous.
- Raw markup requires explicit `unsafeHTML`.
- For untrusted markup, provide a sanitizer and remove executable content plus activation attributes
  such as `data-rw-controller`.
- Under Trusted Types enforcement, pass caller-created `TrustedHTML` or a policy.
- Ruwuter does not create a permissive policy or install `window.swap`.
- `viewTransition` uses `document.startViewTransition` when available unless set to `false`.
- Swapped same-origin controller roots activate when `client.js` is loaded.

References: [src/runtime/swap.ts](./src/runtime/swap.ts),
[test-dom/swap.runtime.dom.test.ts](./test-dom/swap.runtime.dom.test.ts).

## Enhanced Navigation

Load `@mewhhaha/ruwuter/navigate.js` only when full-page enhancement is wanted. The module installs
itself and uses the Navigation API where supported; unsupported browsers retain native navigation.

```tsx
import navigateRuntime from "@mewhhaha/ruwuter/navigate.js?url&no-inline";

<>
  <meta name="rw-navigate-target" content="#app" />
  <main id="app">{children}</main>
  <script type="module" src={navigateRuntime}></script>
</>;
```

Rules:

- Only interceptable same-origin HTTP(S) navigations are enhanced.
- Browser reloads, hash changes, downloads, cross-origin destinations, and `data-rw-reload` sources
  remain native.
- GET and POST forms preserve native form encodings; HTML error responses can update the target.
- The fetched document must contain the configured selector (`body` by default).
- The runtime parses the response, imports the target's children, updates the title, and uses a View
  Transition when available.
- A superseded navigation's signal prevents its stale response from mutating the DOM.
- With `client.js` loaded, removed controller roots clean up and newly inserted roots activate.
- Followed redirects and enhancement failures become real document loads with interception removed.
- Use `<meta name="rw-navigate" content="reload">` on streamed Suspense destinations so their
  response finishes as a normal load and retains progressive streaming.
- Calling `enhanceNavigation(options)` replaces the auto-installed listener; `target` and
  `viewTransition` are configurable.

Reference: [src/runtime/navigate.ts](./src/runtime/navigate.ts) and
[test-dom/navigate.runtime.dom.test.ts](./test-dom/navigate.runtime.dom.test.ts).

## Server Context

```tsx
import { createContext } from "@mewhhaha/ruwuter/components";

export const ThemeContext = createContext("light");

export function ThemeProvider({
  value,
  children,
}: {
  value: string;
  children?: JSX.HtmlNode;
}) {
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeLabel() {
  return <span>{ThemeContext.use()}</span>;
}
```

Available APIs:

- `Context.Provider`
- `Context.use()`
- `Context.withValue(value, fn)`
- `use(Context)`

Context is server-only and request-local when rendered through `Router`.

References: [src/components/context.ts](./src/components/context.ts),
[test/context.nesting.test.tsx](./test/context.nesting.test.tsx).

## Streaming Suspense

Load the resolver once and wrap all participating boundaries:

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
            fallback={<p>Loading…</p>}
            errorFallback={(error) => <p>Failed: {String(error)}</p>}
          >
            {async () => <Activity items={await loadActivity()} />}
          </Suspense>
        </SuspenseProvider>
      </body>
    </html>
  );
}
```

Rules:

- `fallback` is required.
- Prefer an async function child for deferred work.
- `SuspenseProvider` appends resolver output; do not add another `<Resolve />`.
- Include `resolve.js` when fallback replacement is required.
- Boundaries stream in completion order.
- Rejected boundaries are logged and contained. `errorFallback` may be an element or error function;
  without it, the original fallback remains.
- Provider-specific UUID target ids prevent collisions between independently rendered registries.
- Nested unresolved templates are retried when targets appear.
- Resolved controller roots activate when `client.js` is also loaded.
- Without a provider, children render directly.
- Do not use Suspense for redirects or status selection; use loaders.

References: [src/components/suspense.ts](./src/components/suspense.ts),
[src/runtime/resolve.ts](./src/runtime/resolve.ts),
[test/router.suspense.test.tsx](./test/router.suspense.test.tsx).

## JSX Rules

- Ordinary text and child values are escaped.
- Use `class`, not `className`.
- Use HTML-style attribute names accepted by Ruwuter’s JSX types.
- `true` emits a boolean attribute; false and nullish values are omitted.
- `dangerouslySetInnerHTML` bypasses escaping.
- `ref` accepts only a controller ref token.
- JSX `on*` attributes and function-valued HTML attributes are unsupported.
- There is no key-based diffing or client state reconciliation.
- Components and children may be async.
- Void elements do not emit closing tags.

References: [src/runtime/jsx-runtime.ts](./src/runtime/jsx-runtime.ts),
[src/runtime/jsx.ts](./src/runtime/jsx.ts).

## Generation and Vite

Vite:

```ts
import { defineConfig } from "vite";
import { ruwuter } from "@mewhhaha/ruwuter/vite";

export default defineConfig({
  plugins: [ruwuter({ appFolder: "./app" })],
});
```

The plugin generates routes/types/controller hrefs at build start, watches route inputs plus
recursive `*.client.ts(x)` modules, and performs full reloads. It compiles controller chunks and the
documented browser-runtime `?url` imports without globally rewriting application chunks or
`import.meta.url`. Enable same-file controller extraction explicitly with `clientMacro: true`.

Programmatic:

```ts
import { generate } from "@mewhhaha/ruwuter/fs-routes";

const { router, types } = await generate("./app");
```

Repository CLI:

```sh
deno run -A src/fs-routes/routes.ts ./app
```

Never edit generated output. Treat collision errors as route-design errors.

References: [src/vite.ts](./src/vite.ts), [src/fs-routes/js.ts](./src/fs-routes/js.ts),
[src/fs-routes/write.ts](./src/fs-routes/write.ts).

## Decision Order

Use the least complex mechanism:

1. Native link, form, dialog command, or popover.
2. Loader/action and full server response.
3. Route fragment plus `swap`.
4. Opt-in enhanced navigation for whole-page same-origin transitions.
5. Typed controller for local DOM behavior.
6. Suspense for independent slow server rendering.
7. Server context for values shared through nested layouts.

| Need                                           | Use                                            |
| ---------------------------------------------- | ---------------------------------------------- |
| Navigation                                     | `<a href>`                                     |
| Enhanced same-origin page transitions          | Optional `navigate.js`                         |
| Data mutation                                  | `<form>` plus `action`                         |
| JSON endpoint                                  | loader/action without a component, or `json()` |
| Redirect/error status                          | loader/action `Response`                       |
| Replace one region                             | fragment plus `swap`                           |
| Focus/keyboard/animation/local DOM integration | controller                                     |
| Slow independent panel                         | `Suspense`                                     |
| Shared server value                            | `createContext`                                |

## Prohibited Patterns

Do not:

- Restore `client.scope`, reactive refs, or adjacent hydration payloads.
- Serialize or eval inline browser functions.
- Add JSX event props.
- Build a client VDOM or client component state system into the core runtime.
- Return/throw `Response` from components.
- Assume fragments execute route loaders.
- Put secrets or non-JSON values in controller props.
- Use cross-origin, `data:`, or `blob:` controller URLs.
- Duplicate or omit controller refs.
- Pass raw strings to `swap` without `unsafeHTML`.
- Create a permissive Trusted Types policy.
- Install `window.swap`.
- Load client/resolve runtimes when unused.
- Load `navigate.js` implicitly or on pages that require native streamed navigation.
- Hand-edit generated route/type files.
- Restore a global `import.meta.url` rewrite.
- Import server component modules into browser controllers.

## Change Workflow

1. Identify the route and generated `Route` type.
2. Implement loader/action/component behavior first.
3. Prefer native HTML.
4. Add a fragment only for targeted server HTML.
5. Add a typed controller only for remaining local DOM behavior.
6. Add `client.js` only when controllers are used.
7. Add `SuspenseProvider` and `resolve.js` only when streamed fallback replacement is used.
8. Add `navigate.js` only as an explicit progressive enhancement.
9. Regenerate routes/types after route-file changes.
10. Add server tests under `test/`.
11. Add runtime DOM tests under `test-dom/`.
12. Run all gates.

## Verification

```sh
deno task fmt:check
deno lint
deno task typecheck
deno task test
deno task test:dom
deno task size
```

Or:

```sh
deno task ci
```

Before finishing, verify:

- Generated routes/types are current.
- No generated files were manually edited.
- The feature works without JavaScript unless JavaScript is essential.
- Controller props and refs are type-checked.
- Cancellation and cleanup are covered.
- Fragment responses are HTML.
- Unsafe HTML is explicitly trusted or sanitized.
- Runtime scripts are loaded exactly once when needed.
- README examples and this skill match the implementation.
- Browser runtime gzip sizes remain within the checked-in budgets.
