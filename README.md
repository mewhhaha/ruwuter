# Ruwuter

Ruwuter is a server-first router and HTML renderer for Cloudflare-style Web APIs. It matches
generated `URLPattern` routes, runs loaders/actions, renders nested server components to HTML, and
lets ordinary links and forms work without JavaScript.

Browser JavaScript is optional and explicit: add a controller root, load the small activation
runtime, and mount a browser module against that root.

## Install

```sh
pnpm add @mewhhaha/ruwuter
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
`Allow`.

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

Use `controller(moduleHref, props)` on the DOM root that owns the browser behavior.

```tsx
import clientRuntime from "@mewhhaha/ruwuter/client.js?url&no-inline";
import { controller } from "@mewhhaha/ruwuter/components";
import paletteController from "./palette.client.ts?url";

export default function Palette() {
  return (
    <html>
      <head>
        <script type="module" src={clientRuntime}></script>
      </head>
      <body>
        <section {...controller(paletteController, { initiallyOpen: false })}>
          <button data-ref="open" type="button">Open</button>
          <dialog data-ref="dialog">...</dialog>
        </section>
      </body>
    </html>
  );
}
```

```ts
// palette.client.ts
"use client";

import { type ControllerContext, on } from "@mewhhaha/ruwuter/components";

export default function mount(
  { root, props, signal }: ControllerContext<{ initiallyOpen: boolean }>,
) {
  const button = root.querySelector<HTMLButtonElement>('[data-ref="open"]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-ref="dialog"]');

  if (props.initiallyOpen) dialog?.showModal();

  on(button).click(() => dialog?.showModal(), { signal });

  return () => {
    dialog?.close();
  };
}
```

The runtime mounts each controller root once. On removal it waits for the mutation batch, ignores
DOM moves, aborts the controller signal, and then runs the returned cleanup callback.

## Fragments

HTML-over-the-wire fragments are explicit route-module exports, not discovered component names.

```tsx
import { fragment } from "@mewhhaha/ruwuter";

export const fragments = {
  sidebar: fragment(async ({ env }) => <aside>{env.SITE_NAME}</aside>),
};
```

Fetch fragments from the reserved namespace:

```text
/_ruwuter/fragments/<route-id>/sidebar
```

## File-System Routes

Generate static routes from an app folder:

```sh
deno run -A npm:@mewhhaha/ruwuter/fs-routes ./app
```

Or use the Vite plugin:

```tsx
import { defineConfig } from "vite";
import { ruwuter } from "@mewhhaha/ruwuter/vite";

export default defineConfig({
  plugins: [ruwuter({ appFolder: "./app" })],
});
```

The plugin regenerates routes during builds and dev-server updates. It does not rewrite application
output.

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
          <Suspense fallback={<p>Loading</p>}>
            {async () => <p>Ready</p>}
          </Suspense>
        </SuspenseProvider>
      </body>
    </html>
  );
}
```

## Checks

```sh
deno task ci
```

This runs formatting, linting, typecheck, unit tests, and DOM integration tests.

## License

MIT
