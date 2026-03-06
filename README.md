# @mewhhaha/ruwuter (๑˃ᴗ˂)ﻭ

A smol, speedy TypeScript router for Cloudflare Workers with file‑based routing, streaming HTML, and
a custom JSX runtime. Tiny router, big uwu energy 👉🏻👈🏻 — perfect for Workers pals who like their DX
cozy, silly, _and_ productive. Think “enterprise ready, but it also sends you a meme at lunch.”

## Features (sparkly bits)

- ✨ Zero dependencies — completely standalone (sparkly vibes guaranteed; smol and proud)
- 📁 File‑based routing — auto‑generated from your file structure, so no scary boilerplate
  jumpscares
- ⚡️ Streaming HTML — first‑class streaming responses for snappy feels (vroom vroom)
- 🧩 Custom JSX runtime — no React required (supports dangerouslySetInnerHTML, but only because we
  trust you uwu)
- ☁️ Workers‑first — optimized for Cloudflare deployments with extra cozy cloud pillows
- 🧪 Type‑safe — great DX with TypeScript, happy typings happy life (they did their skincare)
- 🚀 Fast — minimal overhead, maximum performance, zoom zoom~ now with bonus sparkles

## Quick Start

Ready to vibe with Workers? Grab a cozy drink, wiggle your fingers, and follow the comfy checklist
below~

```bash
# Install @mewhhaha/ruwuter
pnpm add @mewhhaha/ruwuter

# Install development dependencies
pnpm add -D vite @cloudflare/vite-plugin wrangler
```

> Cloudflare setup: enable the Workers Node compatibility flag (`nodejs_compat`, or at least
> `nodejs_als`) so `AsyncLocalStorage` is available. It’s like tucking your runtime in with a warm
> blanket.

### Context

Context, but make it snuggly — share data without cold feet.

Ruwuter provides a lightweight context API with React‑like ergonomics, backed by Cloudflare’s
`AsyncLocalStorage` under the hood.

```tsx
import { createContext } from "@mewhhaha/ruwuter/components";

export const ThemeContext = createContext("light");

export function ThemeProvider({ value, children }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return ThemeContext.use();
}
```

## Basic Usage

Let’s build a smol router friend together.

### 1. Create your router

```typescript
// src/index.ts
import { Router } from "@mewhhaha/ruwuter";
import { routes } from "./routes";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Router does not wrap Suspense. Wrap your HTML with <SuspenseProvider>
    // and include the resolve runtime module in your document/layout.
    const router = Router(routes);
    return router.handle(request, env, ctx);
  },
};
```

### 2. Define routes using file-based routing

Note: @mewhhaha/ruwuter uses flat file‑based routing. All route files live directly in `app/routes`.

```bash
app/
├── document.tsx          # Document wrapper
└── routes/
    ├── _index.tsx        # / route
    ├── about.tsx         # /about route
    ├── blog._index.tsx   # /blog route
    ├── blog.$slug.tsx    # /blog/:slug route
    └── api.users.ts      # /api/users route
```

### 3. Create a route component

```tsx
// app/_index.tsx
import { Client, client, SuspenseProvider, type Ref } from "@mewhhaha/ruwuter/components";
import clickHref from "./click.client.ts?url&no-inline";
import resolveUrl from "@mewhhaha/ruwuter/resolve.js?url&no-inline";

export default function HomePage() {
  const scope = client.scope();
  const button = scope.ref("button", null as HTMLButtonElement | null);
  scope.mount(clickHref);
  return (
    <html>
      <head>
        <title>Welcome to @mewhhaha/ruwuter</title>
        <Client />
        <script type="module" src={resolveUrl}></script>
      </head>
      <body>
        <SuspenseProvider>
          <div class="container">
            <h1>Hello, World!</h1>
            <p>Welcome to your new @mewhhaha/ruwuter app.</p>
            <button type="button" ref={button}>
              Click me (client)
            </button>
          </div>
        </SuspenseProvider>
      </body>
    </html>
  );
}

// app/click.client.ts
import { on, type Ref } from "@mewhhaha/ruwuter/components";

export default function click(
  this: { button: Ref<HTMLButtonElement | null> },
  _ev: Event,
  signal: AbortSignal,
) {
  on(this.button).click(() => {
    alert("hai~");
  }, { signal });
}
```

## Client Interaction Runtime

Client events are like shy kittens: they scamper in when needed and might blink once before
pouncing. Client handler modules load on demand, so the first interaction usually crosses an async
boundary while the module is importing. Native DOM events reset `currentTarget`, `srcElement`, and
dispatch internals (like `eventPhase` and `composedPath()`) once the synchronous listener stack
unwinds. That can make the first click see `event.currentTarget === null` even though subsequent
clicks behave.

Scope mount and unmount handlers still receive `(this, event, signal)`. In the promoted
`client.scope()` path, `this` is the scope bind object and `event.currentTarget` is the scope anchor
element. Use refs on `this` for local state and DOM access.

Use `client.scope()` as the primary interaction API. `on={...}` has been removed.

### 4. Generate the router and type helpers

## Element refs

Refs are your lil sticky notes on the DOM fridge.

All intrinsic JSX elements now accept a `ref` prop that points at a `Ref<HTMLElement | null>`. Use
`ref(null)` (from `@mewhhaha/ruwuter/components`) to create the container and pass it to the
element:

```tsx
import { Client, ref } from "@mewhhaha/ruwuter/components";

const buttonRef = ref<HTMLButtonElement | null>(null);

export default function Page() {
  return (
    <html>
      <body>
        <button ref={buttonRef}>Focus me later</button>
        <Client />
      </body>
    </html>
  );
}
```

During hydration the client runtime writes the live DOM node into the ref, so calling
`buttonRef.get()` yields the hydrated element. When the element is removed, the runtime
automatically clears the ref back to `null`, keeping the value in sync with the DOM lifecycle.

On the server the ref becomes part of the per-element hydration payload that sits next to your
markup:

```html
<button>Focus me later</button>
<script type="application/json" data-hydrate="h_7">
  { "ref": { "__ref": true, "i": "r_0nlm88cjmni", "v": null } }
</script>
```

The payload uses the same ref marker format as other client-side bindings (`__ref`, `i`, `v`). At
hydrate-time the client runtime revives that marker, points it at the rendered element, and later
resets the value to `null` when the DOM node unmounts.

### Reactive ref bindings

Refs can be rendered as children too. Whenever a `Ref` is used as child content, the server emits an
auto-binding marker span, and the client keeps that text node in sync when you call `ref.set(...)`.

```tsx
import { Client, client } from "@mewhhaha/ruwuter/components";

export default function Page() {
  const scope = client.scope();
  const msg = scope.ref("msg", "ready");
  scope.mount("./noop.client.ts?url");

  return (
    <html>
      <body>
        <section>{msg}</section>
        <Client />
      </body>
    </html>
  );
}
```

Similarly, `data-*` and `aria-*` attributes can be bound through refs and will update live from the
same `ref.set(...)` signal.

```tsx
const label = ref("idle");
const state = ref("ready");

return (
  <div data-state={state} aria-label={label}>...</div>
);
```

The runtime uses reserved marker attributes for these bindings:

- `data-rw-ref-text` for text-node bindings.
- `data-rw-ref-attr` for bound `data-*`/`aria-*` attribute updates.

Treat these as internal and avoid using them as application attributes.

### Component-scoped client behavior

For component-local browser behavior, use `client.scope()` to register named refs plus mount and
unmount client modules for that rendered instance.

```tsx
import { Client, client } from "@mewhhaha/ruwuter/components";
import focusScopeHref from "./focus-scope.ts?url";
import cleanupScopeHref from "./cleanup-scope.ts?url";

export default function Page() {
  const scope = client.scope();
  const input = scope.ref("input", null as HTMLInputElement | null);
  const button = scope.ref("button", null as HTMLButtonElement | null);

  scope.mount(focusScopeHref);
  scope.unmount(cleanupScopeHref);

  return (
    <html>
      <body>
        <section>
          <input ref={input} />
          <button type="button" ref={button}>Focus</button>
        </section>
        <Client />
      </body>
    </html>
  );
}
```

Inside the client module, `this` is the scope bind object and `ev.currentTarget` is the scope
anchor element.

```ts
"use client";

import { on } from "@mewhhaha/ruwuter/components";

export default function (ev: Event, signal: AbortSignal) {
  on(this.button).click(() => {
    this.input.get()?.focus();
  }, { signal });
}
```

Notes:

- `scope.mount(...)` registers a `mount` handler for that component instance.
- `scope.unmount(...)` registers cleanup for when the anchor element leaves the DOM.
- By default, the first emitted intrinsic element becomes the scope anchor.
- Use `scope.props()` when you need to anchor a later element explicitly.
- `on(refOrElement)` is a thin typed `addEventListener` helper for client modules.
- Transformed `"use client"` bindings can be passed directly when your build attaches `clientHref`
  (or `href`) to the function value.
- Raw inline `scope.mount(function () { "use client"; ... })` still requires an external transform;
  this repo does not ship that compiler step.

### Native modal and popover patterns

`client.scope()` works well with native primitives where the browser handles most interaction
mechanics and the scope only adds small polish.

```tsx
import { Client, client } from "@mewhhaha/ruwuter/components";
import openPalette from "./open-palette.ts?url";

export default function CommandPalette() {
  const scope = client.scope();
  const dialog = scope.ref("dialog", null as HTMLDialogElement | null);
  const button = scope.ref("button", null as HTMLButtonElement | null);

  scope.mount(openPalette);

  return (
    <html>
      <body>
        <section>
          <button type="button" ref={button} commandfor="palette" command="show-modal">
            Open palette
          </button>
          <dialog id="palette" ref={dialog}>
            <form method="dialog">
              <input autofocus placeholder="Type a command" />
              <button value="cancel">Close</button>
            </form>
          </dialog>
        </section>
        <Client />
      </body>
    </html>
  );
}
```

```ts
"use client";

import { on } from "@mewhhaha/ruwuter/components";

export default function (_ev: Event, signal: AbortSignal) {
  on(this.button).click(() => {
    this.dialog.get()?.showModal();
  }, { signal });
}
```

Use the same pattern for popovers with `popover`, `popovertarget`, and `toggle`/`beforetoggle`
handlers when you need analytics, focus nudges, or small visual state sync without moving ownership
out of the server-rendered HTML.

The same pair lives under [`examples/client-scope-dialog.tsx`](./examples/client-scope-dialog.tsx)
and [`examples/open-palette.client.ts`](./examples/open-palette.client.ts), which can serve as the
reference shape for `client.scope()` plus native dialog/palette flows.

The generator returns the route table and declaration artifacts so you can decide where to write
them.

#### CLI

```bash
node src/fs-routes/routes.ts ./app
```

This writes `./app/routes.ts` plus the declaration helpers under `.router/types/<app>/`.

#### Programmatic

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generate } from "@mewhhaha/ruwuter/fs-routes";

async function writeFsRoutes(appFolder: string) {
  const { router, types } = await generate(appFolder);

  // router → the generated route table (e.g. "./app/routes.ts")
  // types  → parameter + client handler declarations in ".router/types/**"
  const files = [...router, ...types];

  await Promise.all(
    files.map(async ({ path: outputPath, contents }) => {
      const absolutePath = path.resolve(outputPath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );
}
```

Call this whenever your file-system routes change (during builds, watch mode, etc.).

## HTML assets

Send your components on lil field trips as predictable HTML exports.

Components exported from a route module are exposed at predictable URLs. Each named export must
begin with an uppercase letter, so `export function Hello()` becomes `/products/Hello.html` and
`export const ProductCard` resolves to `/products/ProductCard.html`. HTML asset endpoints may return
`Response` from loaders or exports (useful for cookies/headers).

Use the `html` helper to opt-in explicit HTML exports. It marks the component as routable and passes
the request context (`request`, `params`, and the `[env, ctx]` tuple) straight into your render
function. HTML exports can be async—await inside and return JSX when you’re done, and they’re
responsible for loading their own data.

```tsx
// app/routes/products.tsx
import { type ctx, html } from "@mewhhaha/ruwuter";
import type { Route } from "./+types.products.ts";

import { getProduct, getProductInsights } from "../lib/data.ts";

export async function loader({ params }: Route.LoaderArgs) {
  return { product: await getProduct(params.slug) };
}

export const Sidebar = html(async ({ params, request }: ctx) => {
  const insights = await getProductInsights(params.slug);
  const url = new URL(request.url);

  return (
    <aside>
      <h2>{insights.name}</h2>
      <p>{insights.summary}</p>
      <p>Served from {url.hostname}</p>
    </aside>
  );
});

export default function Products({ loaderData, children }: Route.ComponentProps) {
  return (
    <html>
      <body>
        <Sidebar />
        <section>{children}</section>
        <article>
          <h1>{loaderData.product.name}</h1>
          <p>{loaderData.product.description}</p>
        </article>
      </body>
    </html>
  );
}
```

When you need an HTML export in response to an interaction, build that URL on the server and pass it
down so the client can fetch and inject the markup:

```tsx
// app/routes/products.tsx
import { client } from "@mewhhaha/ruwuter/components";
import addHelloHref from "./handlers/add-hello.client.ts?url&no-inline";

export async function loader({ request }) {
  const url = new URL(request.url);
  return { helloUrl: `${url.pathname}/Hello.html` };
}

export default function Products({ loaderData: { helloUrl } }) {
  const scope = client.scope();
  const button = scope.ref("button", null as HTMLButtonElement | null);
  const helloUrlRef = scope.ref("helloUrl", helloUrl);
  scope.mount(addHelloHref);

  return (
    <>
      <button type="button" ref={button}>Add Hello</button>
      <ul id="items"></ul>
    </>
  );
}

// app/routes/handlers/add-hello.client.ts
"use client";

import { on, type Ref } from "@mewhhaha/ruwuter/components";

export default function addHello(
  this: { button: Ref<HTMLButtonElement | null>; helloUrl: Ref<string> },
  _ev: Event,
  signal: AbortSignal,
) {
  on(this.button).click(async () => {
    await window.swap?.(fetch(this.helloUrl.get(), { method: "POST" }), {
      target: "#items",
      write: "beforeend",
    });
  }, { signal });
}
```

Load the helper once via a script tag (mirrors how the client runtime is loaded):

```tsx
import swapModule from "@mewhhaha/ruwuter/swap.js?url&no-inline";

export default function Document({ children }: { children: unknown }) {
  return (
    <html>
      <head>
        <script type="module" src={swapModule}></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

And augment your global types so `window.swap` is recognised:

```ts
// globals.d.ts
declare global {
  interface Window {
    swap?: typeof import("@mewhhaha/ruwuter/swap").swap;
  }
}
export {};
```

## Examples

Copy‑pasta with extra cheese (and uwu).

### Basic Route with Loader

```tsx
// app/users.tsx
export async function loader({ request, params, context }) {
  const users = await context.env.DB.prepare("SELECT * FROM users").all();
  return { users: users.results };
}

export default function UsersPage({ users }) {
  return (
    <div>
      <h1>Users</h1>
      <ul>
        {users.map((user) => <li key={user.id}>{user.name}</li>)}
      </ul>
    </div>
  );
}
```

### Dynamic Routes

```tsx
// app/blog/$slug.tsx
export async function loader({ params }) {
  const post = await getPostBySlug(params.slug);
  if (!post) {
    throw new Response("Not Found", { status: 404 });
  }
  return { post };
}

export default function BlogPost({ post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
```

### Form Actions

```tsx
// app/contact.tsx
export async function action({ request, context }) {
  const formData = await request.formData();
  const email = formData.get("email");
  const message = formData.get("message");

  await context.env.DB.prepare(
    "INSERT INTO messages (email, message) VALUES (?, ?)",
  )
    .bind(email, message)
    .run();

  return Response.redirect("/thank-you");
}

export default function ContactForm() {
  return (
    <form action="/contact" method="POST">
      <input type="email" name="email" required />
      <textarea name="message" required />
      <button type="submit">Send Message</button>
    </form>
  );
}
```

### Streaming with Suspense

```tsx
// app/dashboard.tsx
import { Suspense, SuspenseProvider } from "@mewhhaha/ruwuter/components";

async function SlowData() {
  const data = await fetch("https://api.slow-endpoint.com/data");
  return <div>{await data.text()}</div>;
}

export default function Dashboard() {
  return (
    <SuspenseProvider>
      <html>
        <body>
          <h1>Dashboard</h1>
          <Suspense fallback={<div>Loading...</div>}>
            <SlowData />
          </Suspense>
          <script type="module" src="@mewhhaha/ruwuter/resolve.js"></script>
        </body>
      </html>
    </SuspenseProvider>
  );
}
```

## Composition

Mix your routing friendship bracelets however you like.

- Router does not wrap Suspense. To enable streaming Suspense:
  - Wrap your root HTML with `SuspenseProvider`.
  - `SuspenseProvider` appends a single `<Resolve />` after its children; do not add another one.
  - Include the resolve runtime module yourself (e.g. a `<script type="module">` that imports
    `@mewhhaha/ruwuter/resolve.js`).
- Use `client.scope()` as the only supported client interaction API for component-local behavior.
- Stick to HTML-native attribute values; dynamic state flows through refs plus mounted client
  handlers rather than function-valued props.

### Client runtime vibes

- Reach for the Client runtime when you want local sparkle: toggles, animations, little DOM tweaks.
- Keep server work on the server: let loaders/actions handle data, and ship tiny sidecar
  `*.client.ts` handlers for UI polish.
- Keep client handlers small and self-contained; import their URLs with `?url`/`?url&no-inline`.
- For strict CSP, use `<Client nonce={cspNonce} />`.

### Shipping the Client Runtime

Include the runtime so client handlers hydrate in the browser. The convenience components exported
from `@mewhhaha/ruwuter/components` will emit the correct module scripts for you:

```tsx
import { Client, SuspenseProvider } from "@mewhhaha/ruwuter/components";

export default function Document({ children }: { children: JSX.Element }) {
  return (
    <SuspenseProvider>
      <html>
        <body>
          {children}
          <script type="module" src="@mewhhaha/ruwuter/resolve.js"></script>
          <Client />
        </body>
      </html>
    </SuspenseProvider>
  );
}
```

When bundling manually (e.g. with Vite), you can import the runtime URLs via the package exports and
inject the scripts yourself. The `?url&no-inline` suffix tells Vite to emit dedicated `.js` files
instead of inlining the runtime.

```tsx
import clientRuntimeUrl from "@mewhhaha/ruwuter/client.js?url&no-inline";
import resolveRuntimeUrl from "@mewhhaha/ruwuter/resolve.js?url&no-inline";

export function HtmlShell({ children }: { children: JSX.Element }) {
  return (
    <html>
      <body>
        {children}
        <script type="module" src={resolveRuntimeUrl}></script>
        <script type="module" src={clientRuntimeUrl}></script>
      </body>
    </html>
  );
}
```

### Removed `on={...}` API

`on={...}` has been removed. Migrate element-bound handlers to `client.scope()`:

- Move shared values into `scope.ref("name", initial)`.
- Register setup in `scope.mount(handlerHref)` and cleanup in `scope.unmount(handlerHref)`.
- Attach DOM listeners inside the client module with `on(this.someRef).click(...)`.
- Keep the server-rendered element tree as the source of truth; use refs for local client state.

### Hydration Payload

Each hydratable element is followed by a single JSON payload describing refs/bindings for that
element:

```html
<button>+1</button>
<script type="application/json" data-hydrate="h_0">
  {
    "v": 1,
    "bind": { "count": { "__ref": true, "i": "r1", "v": 0 } },
    "ref": { "__ref": true, "i": "btn", "v": null },
    "on": [
      { "t": "m", "s": "./click.js", "x": "default", "ev": "click" }
    ]
  }
</script>
```

- Handlers: module entries `{ t: "m", s: "<href>", x: "default", ev }`.
- Refs: `{ "__ref": true, i, v }` revive to `{ id, get(), set() }` and stay shared across payloads.

---

\n## Vite plugin Tips

A plugin for auto-generating routes on build and updates, and also patching the import.meta.url
references in the build output.

```tsx
import type { PluginOption } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generate } from "@mewhhaha/ruwuter/fs-routes";

export interface RuwuterPluginOptions {
  /**
   * The folder containing the route files (e.g., "./app")
   */
  appFolder?: string;
  /**
   * Whether to rewrite import.meta.url references in the build output
   * @default true
   */
  rewriteImportMeta?: boolean;
}

/**
 * Combined Vite plugin for @mewhhaha/ruwuter that:
 * - Watches for route file changes and regenerates routes
 * - Rewrites import.meta.url references in the build output
 */
export const ruwuter = (options: RuwuterPluginOptions = {}): PluginOption => {
  const { appFolder = "./app", rewriteImportMeta = true } = options;
  const writeGeneratedFiles = async () => {
    const { router, types } = await generate(appFolder);
    const files = [...router, ...types]; // router => "./app/routes.ts", types => ".router/types/**"

    await Promise.all(
      files.map(async ({ path: outputPath, contents }) => {
        const absolutePath = path.resolve(outputPath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents);
      }),
    );
  };

  return {
    name: "vite-plugin-ruwuter",

    // Development: Watch for route changes
    async buildStart() {
      await writeGeneratedFiles();
    },

    configureServer(server) {
      // Generate routes on server start
      void writeGeneratedFiles();

      // Watch for file changes and regenerate routes
      server.watcher.on("all", (event, file) => {
        // Skip change events (only care about add/unlink)
        if (event === "change") return;

        // Check if the file is in the app folder
        const resolvedAppPath = path.resolve(appFolder);
        const resolvedFilePath = path.resolve(file);

        if (resolvedFilePath.startsWith(resolvedAppPath)) {
          void writeGeneratedFiles();
        }
      });
    },

    // Build: Rewrite import.meta.url references
    renderChunk(code) {
      if (!rewriteImportMeta) return code;

      // Replace import.meta.url with a static string
      // This prevents runtime errors when import.meta.url is undefined
      return code.replaceAll(/import\.meta\.url/g, '"file://"');
    },
  };
};
```

## Contributing

Contributions are welcome! Bring snacks, say hi, and please read our contributing guidelines before
submitting PRs. We love wholesome PR descriptions.

## License

MIT (share the coziness responsibly)
