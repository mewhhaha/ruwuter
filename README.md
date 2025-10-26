# @mewhhaha/ruwuter (๑˃ᴗ˂)ﻭ

A lightweight, fast TypeScript router for Cloudflare Workers with file‑based routing, streaming
HTML, and a custom JSX runtime. Tiny router, big uwu energy 👉🏻👈🏻 — perfect for Workers fans who like
their DX cozy _and_ productive.

## Features

- ✨ Zero dependencies — completely standalone (sparkly vibes guaranteed)
- 📁 File-based routing — auto‑generated from your file structure, so no scary boilerplate
- ⚡️ Streaming HTML — first‑class streaming responses for snappy feels
- 🧩 Custom JSX runtime — no React required (supports dangerouslySetInnerHTML)
- ☁️ Workers‑first — optimized for Cloudflare deployments
- 🧪 Type‑safe — great DX with TypeScript, happy typings happy life
- 🚀 Fast — minimal overhead, maximum performance, zoom zoom~

## Quick Start

Ready to vibe with Workers? Follow the comfy checklist below~

```bash
# Install @mewhhaha/ruwuter
pnpm add @mewhhaha/ruwuter

# Install development dependencies
pnpm add -D vite @cloudflare/vite-plugin wrangler
```

> Cloudflare setup: enable the Workers Node compatibility flag (`nodejs_compat`, or at least
> `nodejs_als`) so `AsyncLocalStorage` is available.

### Context

Ruwuter provides a lightweight context API with React‑like ergonomics, backed by Cloudflare’s
`AsyncLocalStorage` under the hood.

```tsx
import { createContext } from "@mewhhaha/ruwuter/context";

export const ThemeContext = createContext("light");

export function ThemeProvider({ value, children }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return ThemeContext.use();
}
```

## Basic Usage

### 1. Create your router

```typescript
// src/index.ts
import { Router } from "@mewhhaha/ruwuter";
import { routes } from "./routes";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Router does not wrap Suspense. Wrap your HTML with <SuspenseProvider>
    // and include <Resolve /> in your document/layout.
    const router = Router(routes);
    return router.handle(request, env, ctx);
  },
};
```

### 2. Define routes using file-based routing

Note: @mewhhaha/ruwuter uses flat file‑based routing. All route files live directly in `app/routes`.

```bash
app/
├── _layout.tsx           # Root layout wrapper
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
import { Client, ref, SuspenseProvider } from "@mewhhaha/ruwuter/components";
import { event, events } from "@mewhhaha/ruwuter/events";
import clickHref from "./click.client.ts?url&no-inline";
import resolveUrl from "@mewhhaha/ruwuter/resolve.js?url&no-inline";

export default function HomePage() {
  const greeting = ref("hai~");
  return (
    <html>
      <head>
        <title>Welcome to @mewhhaha/ruwuter</title>
        {/* Include fixi for hypermedia-style interactions */}
        <script
          src="https://cdn.jsdelivr.net/gh/bigskysoftware/fixi@0.9.0/fixi.js"
          crossorigin="anonymous"
          integrity="sha256-0957yKwrGW4niRASx0/UxJxBY/xBhYK63vDCnTF7hH4="
        >
        </script>
        <Client />
        <script type="module" src={resolveUrl}></script>
      </head>
      <body>
        <SuspenseProvider>
          <div class="container">
            <h1>Hello, World!</h1>
            <p>Welcome to your new @mewhhaha/ruwuter app.</p>
            {/* Fixi example (server-driven) */}
            <button fx-action="/api/click" fx-method="post" fx-target="#result">
              Click me (fixi)
            </button>
            <div id="result"></div>
            {/* Client example using URL-based handler modules. */}
            <button on={events({ msg: greeting }, event.click(clickHref))}>
              Click me (client)
            </button>
          </div>
        </SuspenseProvider>
      </body>
    </html>
  );
}

// app/click.client.ts
export default function click(this: { msg: { get(): string } }, _ev: Event, _signal: AbortSignal) {
  alert(this.msg.get());
}
```

## Client Events

Client handler modules load on demand, so the first interaction usually crosses an async boundary
while the module is importing. Native DOM events reset `currentTarget`, `srcElement`, and dispatch
internals (like `eventPhase` and `composedPath()`) once the synchronous listener stack unwinds. That
made the first click see `event.currentTarget === null` even though subsequent clicks behaved.

To keep those values stable we wrap each event in a lightweight synthetic proxy before invoking your
handler. The proxy captures the unstable fields at the top of the listener and forwards every other
property access straight to the underlying event. Methods like `preventDefault()` still mutate the
real event, and `instanceof Event` stays true. We also pin properties such as `currentTarget`,
`relatedTarget`, `srcElement`, and `eventPhase` so they survive async gaps.

Handler signatures remain `(event: Event, signal: AbortSignal)`. You can rely on
`event.currentTarget`/`event.srcElement` even if the handler awaits between import and execution.

### 4. Generate the router and type helpers

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

## Examples

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

### Dynamic Forms with fixi

```tsx
// app/search.tsx
export default function SearchPage() {
  return (
    <div>
      <h1>Product Search</h1>
      <form fx-action="/api/search" fx-target="#results" fx-trigger="input">
        <input type="search" name="q" placeholder="Search products..." />
      </form>
      <div id="results">{/* Results will be loaded here */}</div>
    </div>
  );
}

// app/api/search.ts
export async function loader({ request }) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  const products = await searchProducts(query);

  // Using JSX in loader with toPromise()
  const html = await (
    <>
      {products.map((p) => (
        <div class="product">
          <h3>{p.name}</h3>
          <p>${p.price}</p>
          <button fx-action="/api/cart" fx-method="post" data-id={p.id}>
            Add to Cart
          </button>
        </div>
      ))}
    </>
  ).toPromise();

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
```

### Streaming with Suspense

```tsx
// app/dashboard.tsx
import { Resolve, Suspense, SuspenseProvider } from "@mewhhaha/ruwuter/components";

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
          <Resolve />
        </body>
      </html>
    </SuspenseProvider>
  );
}
```

## Composition

- Router does not wrap Suspense. To enable streaming Suspense:
  - Wrap your root HTML with `SuspenseProvider`.
  - `SuspenseProvider` now appends a single `<Resolve />` after its children, so wrapping your
    document/body is sufficient for streaming.
  - If you prefer to control placement yourself, use `<SuspenseProvider resolve={false}>` and render
    `<Resolve />` where you want it. Add `nonce` for strict CSP.
- Handlers used with `on={...}` should import their modules with `?url`/`?url&no-inline` and be
  wrapped with the helpers in `@mewhhaha/ruwuter/events` (e.g. `event.click(handlerHref)`).
- Stick to HTML-native attribute values; dynamic state flows through the `on` event list (optionally
  prefixed with your bound state) plus client handlers rather
  than function-valued props.

### Using Both fixi and Client

fixi and the Client runtime solve different problems and work great together:

- When to use fixi
  - Server-driven interactions: form posts, link clicks, partial updates.
  - Progressive enhancement with minimal JS (fx-action, fx-target, fx-method, fx-trigger).
  - Great for CRUD, pagination, search, and streaming HTML fragments.

- When to use Client
  - Local UI behavior that doesn’t need a network roundtrip (toggles, animations, small DOM tweaks).
  - Fine‑grained event handling and small shared state via `ref()`.
  - On‑demand code loading per interaction to keep initial JS minimal.

- Combine them
  - Use fixi for networking and server-rendered HTML; use Client for local UI polish.
- If you attach both fixi and a client handler tuple via `on={...}`, default browser behavior
  continues unless you opt in with `event.click(handlerHref, { preventDefault: true })` (or call
  `ev.preventDefault()` inside your client handler). Prefer
    sibling/wrapper elements, or let the client handler perform the fetch and DOM update itself.
  - Keep client handlers small and self-contained; place them in sidecar `*.client.ts` files and
    import their URLs with `?url`.
  - For strict CSP, use `<Client nonce={cspNonce} />`.

### Shipping the Client Runtime

Include the runtime so client handlers hydrate in the browser. The convenience components exported
from `@mewhhaha/ruwuter/components` will emit the correct module scripts for you:

```tsx
import { Client, Resolve, SuspenseProvider } from "@mewhhaha/ruwuter/components";

export default function Document({ children }: { children: JSX.Element }) {
  return (
    <SuspenseProvider>
      <html>
        <body>
          {children}
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
import clientRuntimeUrl from "@mewhhaha/ruwuter/client?url&no-inline";
import resolveRuntimeUrl from "@mewhhaha/ruwuter/resolve?url&no-inline";

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

### Client Interactions and Refs (New)

Ruwuter ships a tiny client interaction runtime with a unified `on` prop that consumes tuples
produced by `@mewhhaha/ruwuter/events`. Keep handlers in sidecar `*.client.ts` files, import their
URLs with `?url`, and build tuples like `event.click(handlerHref)`. Use the `events(bind, ...)`
helper to prepend the object (or ref) you want as `this`. Those values can include shared `ref()`
objects.

```tsx
// app/click.client.ts
export default function click(
  this: { count: { set(updater: (v: number) => number): void } },
  _ev: Event,
) {
  this.count.set((v) => v + 1);
}

// app/_index.tsx
import { Client, ref } from "@mewhhaha/ruwuter/components";
import { event, events } from "@mewhhaha/ruwuter/events";
import clickHref from "./click.client.ts?url";

export default function HomePage() {
  const count = ref(0);
  return (
    <html>
      <body>
        <button on={events({ count }, event.click(clickHref))}>
          +1
        </button>
        <Client />
      </body>
    </html>
  );
}
```

- Lifecycle: `on={[event.mount(mountHref), event.unmount(unmountHref)]}`. `mount` fires after
  `DOMContentLoaded`; `unmount` fires when the element is removed.
- Add event options as the third tuple entry, e.g. `event.click(clickHref, { preventDefault: true })`
  to cancel default browser behavior before the handler module finishes loading.

### Hydration Boundaries (New)

Instead of data attributes per handler, Ruwuter emits one comment boundary per element and a single
JSON payload:

```html
<!--rw:h:h_0--><button>+1</button><!--/rw:h:h_0-->
<script type="application/json" data-rw-h="h_0">
  {
    "bind": { "count": { "__ref": true, "i": "r1", "v": 0 } },
    "on": [
      {
        "t": "m",
        "s": "./click.js",
        "x": "default",
        "ev": "click"
      }
    ]
  }
</script>
```

- Handlers: module `{t:"m",s:"<href>",x:"default",ev}`.
- Refs: `{ "__ref": true, i: "r1", v: 0 }` revive to `{ id, get(), set() }` and are shared across
  all boundaries.

---

\n## Vite plugin Tips

A plugin for auto-generating routes on build and updates, and also fixing the import.meta.url
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
   * Whether to fix import.meta.url references in the build output
   * @default true
   */
  fixImportMeta?: boolean;
}

/**
 * Combined Vite plugin for @mewhhaha/ruwuter that:
 * - Watches for route file changes and regenerates routes
 * - Fixes import.meta.url references in the build output
 */
export const ruwuter = (options: RuwuterPluginOptions = {}): PluginOption => {
  const { appFolder = "./app", fixImportMeta = true } = options;
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

    // Build: Fix import.meta.url references
    renderChunk(code) {
      if (!fixImportMeta) return code;

      // Replace import.meta.url with a static string
      // This prevents runtime errors when import.meta.url is undefined
      return code.replaceAll(/import\.meta\.url/g, '"file://"');
    },
  };
};
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT
