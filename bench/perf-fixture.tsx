// perf-compare.py copies this fixture into each revision checkout so imports use its own runtime.
import { html, router } from "../src/router.ts";
import { controller } from "../src/browser.ts";
import { Deferred } from "../src/components/index.ts";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const asyncClient = Deno.args.includes("--async-client");
const clientJs = await Deno.readFile(new URL("./client.js", import.meta.url));

const helloDoc = (name: string) => (
  <html>
    <body>
      <p>Hello, {name}.</p>
    </body>
  </html>
);

const greeting = "<!doctype html><html><body><p>Hello, Robin.</p></body></html>";

const helloApp = router().get("/hello/:name", ({ params }) => html(helloDoc(params.name)));

const staticApp = router();
for (let i = 0; i < 100; i++) {
  const label = `Route ${i}`;
  staticApp.get(`/page-${i}`, () => html(<p>{label}</p>));
}

const widget = controller("/widget.client.js");
const browserApp = router()
  .get(
    "/client.js",
    () => new Response(clientJs, { headers: { "content-type": "text/javascript; charset=utf-8" } }),
  )
  .get(
    "/widget.client.js",
    () =>
      new Response(
        `export default ({ root }) => {
          root.dataset.mounted = "1";
          if (!performance.getEntriesByName("controller-mounted").length) {
            performance.mark("controller-mounted");
          }
        };`,
        { headers: { "content-type": "text/javascript; charset=utf-8" } },
      ),
  )
  .get("/stream-controller", () =>
    html(
      <html>
        <head>
          <title>Stream Controller</title>
        </head>
        <body>
          <h1 id="shell">Product</h1>
          <section id="widget" {...widget.root()}>
            <button type="button">Add to cart</button>
          </section>
          {asyncClient
            ? <script type="module" async src="/client.js"></script>
            : <script type="module" src="/client.js"></script>}
          <p>{"Product description. ".repeat(256)}</p>
          <Deferred fallback={<p id="slow-wait">Loading reviews</p>}>
            {async () => {
              await sleep(600);
              return <p id="slow">Reviews ready</p>;
            }}
          </Deferred>
        </body>
      </html>,
    ))
  .get("/mutations", () =>
    html(
      <html>
        <head>
          <title>DOM Mutations</title>
        </head>
        <body>
          <h1>Interactive Page</h1>
          <section id="widget" {...widget.root()}>
            <span id="counter">0</span>
          </section>
          <Deferred fallback={<p id="panel-wait">Loading panel</p>}>
            {async () => {
              await sleep(10);
              return <p id="panel-ready">Panel ready</p>;
            }}
          </Deferred>
          <ul id="grid">
            {Array.from({ length: 400 }, (_, i) => (
              <li class="row">
                <span>Item {i}</span>
                <em>Details {i}</em>
              </li>
            ))}
          </ul>
          <div id="stage"></div>
          <script type="module" src="/client.js"></script>
        </body>
      </html>,
    ));

async function measureHelloBatch(): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const response = await helloApp.fetch(new Request("http://localhost/hello/Robin"));
    if (response.status !== 200 || await response.text() !== greeting) {
      throw new Error("Unexpected /hello response");
    }
  }
  return performance.now() - start;
}

async function measureStaticBatch(): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const response = await staticApp.fetch(new Request("http://localhost/page-99"));
    if (response.status !== 200 || await response.text() !== "<p>Route 99</p>") {
      throw new Error("Unexpected /page-99 response");
    }
  }
  return performance.now() - start;
}

Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen: ({ port }) => console.log(port) },
  async (req) => {
    const path = new URL(req.url).pathname;
    if (path === "/batch/hello") return Response.json(await measureHelloBatch());
    if (path === "/batch/static") return Response.json(await measureStaticBatch());
    return browserApp.fetch(req);
  },
);
