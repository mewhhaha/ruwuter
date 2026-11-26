import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { html, renderToStream, renderToString, router, unsafeHTML } from "../src/router.ts";
import { createContext, Deferred } from "../src/components/index.ts";

const request = (path: string, method = "GET") =>
  new Request("https://example.test" + path, { method });

Deno.test("method handlers receive params, bindings and status control before the shell", async () => {
  const app = router<{ title: string }>()
    .get("/books/:id", ({ params, env }) => html(<h1>{env.title} {params.id}</h1>))
    .post("/books/:id", () => new Response(null, { status: 201 }));
  const { fetch } = app;
  const env = { title: "Book" };
  assertEquals(await (await fetch(request("/books/42"), env)).text(), "<h1>Book 42</h1>");
  assertEquals((await fetch(request("/books/42", "POST"), env)).status, 201);
  const head = await fetch(request("/books/42", "HEAD"), env);
  assertEquals(head.body, null);
  assertEquals(head.headers.get("content-type"), "text/html; charset=utf-8");
  for (const [method, status] of [["OPTIONS", 204], ["PATCH", 405]] as const) {
    const res = await fetch(request("/books/42", method), env);
    assertEquals(res.status, status);
    assertEquals(res.headers.get("allow"), "GET, HEAD, OPTIONS, POST");
  }
  assertEquals((await fetch(request("/missing"), env)).status, 404);
  assertThrows(() => app.get("/books/:id", () => new Response()));
});

Deno.test("html, text helpers and fragments escape strings through async containers", async () => {
  const values = ["<b>", Promise.resolve("<b>"), () => ["<b>"]];
  for (const value of values) {
    assertEquals(await html(value).text(), "&lt;b&gt;");
    assertEquals(await renderToString(value), "&lt;b&gt;");
    assertEquals(await new Response(renderToStream(value)).text(), "&lt;b&gt;");
  }
  assertEquals(await html(unsafeHTML("<b>trusted</b>")).text(), "<b>trusted</b>");
  const app = router().get(
    "/part",
    () => html(<Deferred fallback={<i>wait</i>}>{<p>done</p>}</Deferred>),
  );
  const fragment = await (await app.fetch(request("/part"))).text();
  assert(fragment.includes("<p>done</p></template><!--rw-end-->"));
  assertEquals(fragment.match(/<script /g)?.length, 1);
});

Deno.test("reader cancellation and request abort propagate during pending renders", async () => {
  for (const fromRequest of [true, false]) {
    const started = Promise.withResolvers<void>();
    const stopped = Promise.withResolvers<void>();
    const app = router().get("/", ({ signal }) => {
      const Panel = async () => {
        started.resolve();
        await new Promise<void>((_, reject) =>
          signal.addEventListener("abort", () => {
            stopped.resolve();
            reject(signal.reason);
          }, { once: true })
        );
        return <p>done</p>;
      };
      return html(
        <main>
          <h1>Shell</h1>
          <Panel />
        </main>,
      );
    });
    const controller = new AbortController();
    const res = await app.fetch(new Request(request("/"), { signal: controller.signal }));
    const reader = res.body!.getReader();
    await reader.read();
    const pending = reader.read();
    await started.promise;
    if (fromRequest) {
      controller.abort();
      await assertRejects(() => pending);
    } else {
      await reader.cancel();
      assert((await pending).done);
    }
    await stopped.promise;
  }
});

Deno.test("complex URLPatterns match the full URL and expose their real groups", async () => {
  const host = new URLPattern({ hostname: "example.test", pathname: "/only", search: "version=2" });
  const app = router().get(host, () => new Response("yes"))
    .get("/products/:id([0-9]+)", ({ params }) => new Response(params.id))
    .route("/only", { OPTIONS: () => new Response("custom", { headers: { "X-Route": "yes" } }) });
  assertEquals(await (await app.fetch(request("/only?version=2"))).text(), "yes");
  assertEquals((await app.fetch(new Request("https://other.test/only?version=2"))).status, 405);
  assertEquals(await (await app.fetch(request("/products/42"))).text(), "42");
  const options = await app.fetch(request("/only", "OPTIONS"));
  assertEquals(options.headers.get("Allow"), "OPTIONS");
  assertEquals(options.headers.get("X-Route"), "yes");
  assertEquals(await options.text(), "custom");
});

Deno.test("a slow error fallback leaves ready sibling panels free to stream", async () => {
  const recover = Promise.withResolvers<void>();
  const app = router().get("/", () =>
    html(
      <>
        <Deferred
          fallback="pending"
          errorFallback={async () => {
            await recover.promise;
            return <b>Recovered</b>;
          }}
        >
          {() => Promise.reject(new Error("panel failed"))}
        </Deferred>
        <Deferred fallback="waiting">{<b>Ready</b>}</Deferred>
      </>,
    ));
  const reader = (await app.fetch(request("/"))).body!.pipeThrough(new TextDecoderStream())
    .getReader();
  let text = "";
  try {
    while (!text.includes("<b>Ready</b>")) {
      const step = await reader.read();
      assert(!step.done);
      text += step.value;
    }
    assert(!text.includes("<b>Recovered</b>"));
  } finally {
    recover.resolve();
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      text += step.value;
    }
  }
  assert(text.includes("<b>Recovered</b>"));
});

Deno.test("failed handlers abort work they already started", async () => {
  const observed: AbortSignal[] = [];
  const app = router().get("/", ({ signal }) => {
    observed.push(signal);
    throw new Error("could not respond");
  });
  await assertRejects(() => app.fetch(request("/")), Error, "could not respond");
  assert(observed[0].aborted);
});

Deno.test("optional groups spanning path segments expose possibly absent parameters", async () => {
  const app = router().get("/items{/:org/extra}?", ({ params }) => {
    // @ts-expect-error The entire group can be absent.
    const name: string = params.org;
    return new Response(name ?? "all");
  });
  assertEquals(await (await app.fetch(request("/items"))).text(), "all");
  assertEquals(await (await app.fetch(request("/items/shop/extra"))).text(), "shop");
});

Deno.test("an eager rejected input stays observed until rendering, including HEAD", async () => {
  const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const gate = Promise.withResolvers<string>();
  const app = router().get("/", () =>
    html(
      <main>
        {gate.promise}
        <Deferred fallback="loading" errorFallback={<p>Recovered</p>}>
          {Promise.reject(new Error("early rejection"))}
        </Deferred>
      </main>,
    )).get("/head", () => html(Promise.reject(new Error("head"))));
  const response = await app.fetch(request("/"));
  const arrayResponse = html([gate.promise, Promise.reject(new Error("array rejection"))]);
  assertEquals((await app.fetch(request("/head", "HEAD"))).body, null);
  await turn();
  gate.resolve("ready");
  assert((await response.text()).includes("<p>Recovered</p>"));
  await assertRejects(() => arrayResponse.text(), Error, "array rejection");
});

Deno.test("nested ordered renders isolate panels while keeping lexical application context", async () => {
  const theme = createContext("outer");
  const Name = () => <i>{theme.use()}</i>;
  const doc = () => (
    <html>
      <body>
        <Deferred fallback="inner pending">
          <Name />
        </Deferred>
      </body>
    </html>
  );
  const app = router().get("/", () =>
    html(
      <theme.Provider value="inside">
        <Deferred as="section" fallback="outer pending">
          {async () => {
            const first = await renderToString(doc());
            const second = await new Response(renderToStream(doc())).text();
            return <p>{first + second}</p>;
          }}
        </Deferred>
      </theme.Provider>,
    ));
  const output = await (await app.fetch(request("/"))).text();
  assertEquals(output.match(/<template data-rw-target=/g)?.length, 1);
  assertEquals(output.match(/&lt;i&gt;inside&lt;\/i&gt;/g)?.length, 2);
  assert(!output.includes("inner pending"));
  assert(output.includes("<section"));
});

Deno.test("HEAD observes stored promises without iterating array props or reading their getters", async () => {
  const accessor: string[] = [];
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    get() {
      throw new Error("read array slot");
    },
  });
  const iterable = ["value"];
  Object.defineProperty(iterable, Symbol.iterator, {
    value() {
      throw new Error("called custom iterator");
    },
  });
  function Widget(_props: { items: string[] }): never {
    throw new Error("rendered on HEAD");
  }
  for (const items of [accessor, iterable]) {
    const app = router().get("/", () => html(<Widget items={items} />));
    const response = await app.fetch(request("/", "HEAD"));
    assertEquals(response.status, 200);
    assertEquals(response.body, null);
  }
});

Deno.test("nested app.fetch isolates request context from outer AsyncLocalStorage values", async () => {
  const theme = createContext("default");
  const app = router();
  app
    .get("/inner", () => new Response(theme.use()))
    .get("/outer", () => theme.withValue("outer-only", () => app.fetch(request("/inner"))));
  assertEquals(await (await app.fetch(request("/outer"))).text(), "default");
});

Deno.test("resolver script defaults to root-relative path and supports resolverSrc and nonce", async () => {
  const page = () => <Deferred fallback="wait">{<p>done</p>}</Deferred>;
  const defaultApp = router().get("/proxy", () => html(page()));
  const proxyHtml = await (await defaultApp.fetch(new Request("http://127.0.0.1:8000/proxy")))
    .text();
  assert(proxyHtml.includes('<script src="/_ruwuter/resolve-v1.js" data-rw-resolver=""></script>'));
  assert(!proxyHtml.includes("127.0.0.1:8000"));

  const configuredApp = router([], {
    resolverSrc: (req) => new URL("/prefix/_ruwuter/resolve-v1.js", req.url).href,
  })
    .get("/router-opt", () => html(page()))
    .get("/html-opt", () => html(page(), { resolverSrc: "/custom/resolve.js", nonce: "abc123" }));

  const fromRouter = await (await configuredApp.fetch(request("/router-opt"))).text();
  assert(
    fromRouter.includes(
      '<script src="https://example.test/prefix/_ruwuter/resolve-v1.js" data-rw-resolver=""></script>',
    ),
  );
  const fromHtml = await (await configuredApp.fetch(request("/html-opt"))).text();
  assert(
    fromHtml.includes(
      '<script src="/custom/resolve.js" data-rw-resolver="" nonce="abc123"></script>',
    ),
  );

  // Reserved resolver endpoint still handles GET, HEAD, OPTIONS, 405
  const asset = await defaultApp.fetch(request("/_ruwuter/resolve-v1.js"));
  assertEquals(asset.status, 200);
  assert(asset.headers.get("content-type")?.includes("text/javascript"));
  const head = await defaultApp.fetch(request("/_ruwuter/resolve-v1.js", "HEAD"));
  assertEquals(head.status, 200);
  assertEquals(head.body, null);
  const options = await defaultApp.fetch(request("/_ruwuter/resolve-v1.js", "OPTIONS"));
  assertEquals(options.status, 204);
  assertEquals(options.headers.get("allow"), "GET, HEAD, OPTIONS");
  const bad = await defaultApp.fetch(request("/_ruwuter/resolve-v1.js", "POST"));
  assertEquals(bad.status, 405);
});

Deno.test("standalone Deferred honors errorFallback and nested routed Deferred resolves both levels", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const failing = () => (
      <Deferred
        fallback="wait"
        errorFallback={(err) => <p>Fallback: {(err as Error).message}</p>}
      >
        {() => Promise.reject(new Error("boom"))}
      </Deferred>
    );
    assertEquals(await renderToString(failing()), "<p>Fallback: boom</p>");
    assertEquals(await html(failing()).text(), "<p>Fallback: boom</p>");
    assertEquals(
      await new Response(renderToStream(failing())).text(),
      "<p>Fallback: boom</p>",
    );
  } finally {
    console.error = originalError;
  }

  const app = router().get("/", () =>
    html(
      <html>
        <body>
          <Deferred fallback={<p>outer-wait</p>}>
            {async () => {
              await Promise.resolve();
              return (
                <section>
                  <Deferred fallback={<p>inner-wait</p>}>
                    {async () => {
                      await Promise.resolve();
                      return <p>inner-done</p>;
                    }}
                  </Deferred>
                </section>
              );
            }}
          </Deferred>
        </body>
      </html>,
    ));
  const output = await (await app.fetch(request("/"))).text();
  assertEquals(output.match(/<template data-rw-target=/g)?.length, 2);
  assertEquals(output.match(/<script /g)?.length, 1);
  assert(output.includes("<p>inner-done</p>"));
});

Deno.test("Deferred cancellation stops pending async iterators immediately", async () => {
  const { into } = await import("../src/runtime/node.ts");
  const started = Promise.withResolvers<void>();
  const cleanedUp = Promise.withResolvers<void>();
  const never = new Promise<never>(() => {});
  const streamPanel = () =>
    into((async function* () {
      try {
        started.resolve();
        yield "<p>partial</p>";
        await never;
      } finally {
        cleanedUp.resolve();
      }
    })());
  const app = router().get("/", () =>
    html(
      <main>
        <h1>Shell</h1>
        <Deferred fallback="loading">
          {streamPanel}
        </Deferred>
      </main>,
    ));
  const res = await app.fetch(request("/"));
  const reader = res.body!.getReader();
  await reader.read();
  await started.promise;
  await reader.cancel();
  await cleanedUp.promise;
});

Deno.test("generated fs-routes tables mount directly on router() with specificity order", async () => {
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { writeGeneratedFiles, generatedTypesRoot } = await import("../src/fs-routes/write.ts");
  const appDir = await Deno.makeTempDir();
  try {
    const routesDir = join(appDir, "routes");
    await Deno.mkdir(routesDir, { recursive: true });
    await Deno.writeTextFile(
      join(routesDir, "_app.$slug.ts"),
      `export const GET = ({ params }: { params: { slug: string } }) => new Response("slug:" + params.slug);`,
    );
    await Deno.writeTextFile(
      join(routesDir, "about.ts"),
      `export const GET = () => new Response("about");`,
    );
    await Deno.writeTextFile(
      join(routesDir, "$.ts"),
      `export const GET = () => new Response("root-catchall");`,
    );
    await Deno.writeTextFile(
      join(routesDir, "products.$.ts"),
      `export const GET = () => new Response("products-catchall");`,
    );
    await writeGeneratedFiles(appDir);
    const { routes } = await import(pathToFileURL(join(appDir, "routes.ts")).href);
    const app = router(routes);

    assertEquals(await (await app.fetch(request("/about"))).text(), "about");
    assertEquals(await (await app.fetch(request("/other"))).text(), "slug:other");
    assertEquals(await (await app.fetch(request("/products/a/b"))).text(), "products-catchall");
    assertEquals(await (await app.fetch(request("/x/y/z"))).text(), "root-catchall");
  } finally {
    await Deno.remove(appDir, { recursive: true }).catch(() => {});
    await Deno.remove(generatedTypesRoot(appDir), { recursive: true }).catch(() => {});
  }
});

Deno.test("static and simple-segment fast paths preserve registration order, ignoreCase, and encoding", async () => {
  const staticFirst = router()
    .get("/about", () => html(<p>static-about</p>))
    .get("/hello/:name", ({ params }) => html(<p>hi {params.name}</p>))
    .get("/items/:id", ({ params }) => new Response(`item:${params.id}`))
    .get("/items/special", () => new Response("after-dynamic"));

  assertEquals(
    await (await staticFirst.fetch(request("/about?ref=nav"))).text(),
    "<p>static-about</p>",
  );
  assertEquals(await (await staticFirst.fetch(request("/about/"))).status, 404);
  assertEquals(await (await staticFirst.fetch(request("/hello/a%20b"))).text(), "<p>hi a%20b</p>");
  assertEquals(await (await staticFirst.fetch(request("/hello/"))).status, 404);
  assertEquals(await (await staticFirst.fetch(request("/hello/a/b"))).status, 404);
  // Dynamic route registered before /items/special still wins.
  assertEquals(await (await staticFirst.fetch(request("/items/special"))).text(), "item:special");

  const ignoreCaseApp = router([
    [
      new URLPattern({ pathname: "/About" }, { ignoreCase: true }),
      { GET: () => new Response("case-insensitive") },
    ],
  ]);
  assertEquals(await (await ignoreCaseApp.fetch(request("/about"))).text(), "case-insensitive");

  const doc = await router()
    .get("/", () =>
      html(
        <html>
          <body>
            <p>Static fast path</p>
          </body>
        </html>,
        { status: 201, headers: { "X-Fast": "1" } },
      ))
    .fetch(request("/"));
  assertEquals(doc.status, 201);
  assertEquals(doc.headers.get("content-type"), "text/html; charset=utf-8");
  assertEquals(doc.headers.get("x-fast"), "1");
  assertEquals(
    await doc.text(),
    "<!doctype html><html><body><p>Static fast path</p></body></html>",
  );

  const asset = await staticFirst.fetch(request("/_ruwuter/resolve-v1.js"));
  assert(asset.headers.get("cache-control")?.includes("immutable"));
});
