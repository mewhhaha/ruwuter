// compare.py copies this fixture into each revision so JSX and imports use its own runtime.
import * as rw from "../src/router.ts";
import type { Router } from "../src/legacy.ts";
import { Suspense, SuspenseProvider } from "../src/components/suspense.ts";

const oldRouter = Reflect.get(rw, "Router") as typeof Router | undefined;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const hello = (name: string) => (
  <html>
    <body>
      <p>Hello, {name}.</p>
    </body>
  </html>
);

function panels() {
  const panel = (id: string, ms: number) => (
    <Suspense fallback={<p>Loading {id}</p>}>
      {async () => {
        await sleep(ms);
        return <p id={id}>{id}</p>;
      }}
    </Suspense>
  );
  let children = <>{panel("fast", 100)}{panel("slow", 600)}</>;
  if (oldRouter) children = <SuspenseProvider>{children}</SuspenseProvider>;
  return (
    <html>
      <head>{oldRouter && <script type="module" src="/resolve.js"></script>}</head>
      <body>
        <h1 id="shell">Reviews</h1>
        <p>{"Product description. ".repeat(256)}</p>
        {children}
      </body>
    </html>
  );
}

function buildApp(): (req: Request) => Promise<Response> {
  if (oldRouter) {
    const old = oldRouter([
      [new URLPattern({ pathname: "/panels" }), [{ id: "page", mod: { default: panels } }]],
      [new URLPattern({ pathname: "/hello/:name" }), [{
        id: "greeting",
        mod: {
          loader: ({ params }) => params.name,
          default: ({ loaderData }) => hello(loaderData),
        },
      }]],
    ]);
    return (req) => old.handle(req, {}, { waitUntil() {}, passThroughOnException() {} });
  }
  return rw.router().get("/panels", () => rw.html(panels()))
    .get("/hello/:name", ({ params }) => rw.html(hello(params.name))).fetch;
}
const app = buildApp();
const resolver = await Deno.readFile(new URL("./resolve.js", import.meta.url));
const greeting = "<!doctype html><html><body><p>Hello, Robin.</p></body></html>";

async function measureBatch() {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const response = await app(new Request("http://localhost/hello/Robin"));
    if (response.status !== 200 || await response.text() !== greeting) {
      throw new Error("The routers must return the same complete HTML document");
    }
  }
  return Response.json(performance.now() - start);
}

Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: ({ port }) => console.log(port) }, (req) => {
  const path = new URL(req.url).pathname;
  if (path === "/batch") return measureBatch();
  if (oldRouter && path === "/resolve.js") {
    return new Response(resolver, { headers: { "content-type": "text/javascript" } });
  }
  return app(req);
});
