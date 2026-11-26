import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { html, renderToStream, renderToString, router, unsafeHTML } from "../src/router.ts";
import { createContext, Deferred } from "../src/components/index.ts";

const request = (path: string, method = "GET") =>
  new Request("https://example.test" + path, { method });

it("method handlers receive params, bindings and status control before the shell", async () => {
  const app = router<{ title: string }>()
    .get("/books/:id", ({ params, env }) =>
      html(
        <h1>
          {env.title} {params.id}
        </h1>,
      ),
    )
    .post("/books/:id", () => new Response(null, { status: 201 }));
  const { fetch } = app;
  const env = { title: "Book" };
  expect(await (await fetch(request("/books/42"), env)).text()).toBe("<h1>Book 42</h1>");
  expect((await fetch(request("/books/42", "POST"), env)).status).toBe(201);
  const head = await fetch(request("/books/42", "HEAD"), env);
  expect(head.body).toBe(null);
  expect(head.headers.get("content-type")).toBe("text/html; charset=utf-8");
  for (const [method, status] of [
    ["OPTIONS", 204],
    ["PATCH", 405],
  ] as const) {
    const res = await fetch(request("/books/42", method), env);
    expect(res.status).toBe(status);
    expect(res.headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
  }
  expect((await fetch(request("/missing"), env)).status).toBe(404);
  expect(() => app.get("/books/:id", () => new Response())).toThrow();
});

it("html, text helpers and fragments escape strings through async containers", async () => {
  const values = ["<b>", Promise.resolve("<b>"), () => ["<b>"]];
  for (const value of values) {
    expect(await html(value).text()).toBe("&lt;b&gt;");
    expect(await renderToString(value)).toBe("&lt;b&gt;");
    expect(await new Response(renderToStream(value)).text()).toBe("&lt;b&gt;");
  }
  expect(await html(unsafeHTML("<b>trusted</b>")).text()).toBe("<b>trusted</b>");
  const app = router().get("/part", () =>
    html(<Deferred fallback={<i>wait</i>}>{<p>done</p>}</Deferred>),
  );
  const fragment = await (await app.fetch(request("/part"))).text();
  expect(fragment).toContain("<p>done</p></template><!--rw-end-->");
  expect(fragment.match(/<script /g)?.length).toBe(1);
});

it("reader cancellation and request abort propagate during pending renders", async () => {
  for (const fromRequest of [true, false]) {
    const started = Promise.withResolvers<void>();
    const stopped = Promise.withResolvers<void>();
    const app = router().get("/", ({ signal }) => {
      const Panel = async () => {
        started.resolve();
        await new Promise<void>((_, reject) =>
          signal.addEventListener(
            "abort",
            () => {
              stopped.resolve();
              reject(signal.reason);
            },
            { once: true },
          ),
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
      await expect(pending).rejects.toThrow();
    } else {
      await reader.cancel();
      expect((await pending).done).toBe(true);
    }
    await stopped.promise;
  }
});

it("complex URLPatterns match the full URL and expose their real groups", async () => {
  const host = new URLPattern({ hostname: "example.test", pathname: "/only", search: "version=2" });
  const app = router()
    .get(host, () => new Response("yes"))
    .get("/products/:id([0-9]+)", ({ params }) => new Response(params.id))
    .route("/only", { OPTIONS: () => new Response("custom", { headers: { "X-Route": "yes" } }) });
  expect(await (await app.fetch(request("/only?version=2"))).text()).toBe("yes");
  expect((await app.fetch(new Request("https://other.test/only?version=2"))).status).toBe(405);
  expect(await (await app.fetch(request("/products/42"))).text()).toBe("42");
  const options = await app.fetch(request("/only", "OPTIONS"));
  expect(options.headers.get("Allow")).toBe("OPTIONS");
  expect(options.headers.get("X-Route")).toBe("yes");
  expect(await options.text()).toBe("custom");
});

it("a slow error fallback leaves ready sibling panels free to stream", async () => {
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
    ),
  );
  const reader = (await app.fetch(request("/")))
    .body!.pipeThrough(new TextDecoderStream())
    .getReader();
  let text = "";
  try {
    while (!text.includes("<b>Ready</b>")) {
      const step = await reader.read();
      expect(step.done).toBe(false);
      text += step.value;
    }
    expect(text).not.toContain("<b>Recovered</b>");
  } finally {
    recover.resolve();
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      text += step.value;
    }
  }
  expect(text).toContain("<b>Recovered</b>");
});

it("failed handlers abort work they already started", async () => {
  const observed: AbortSignal[] = [];
  const app = router().get("/", ({ signal }) => {
    observed.push(signal);
    throw new Error("could not respond");
  });
  await expect(app.fetch(request("/"))).rejects.toThrow("could not respond");
  expect(observed[0].aborted).toBe(true);
});

it("optional groups spanning path segments expose possibly absent parameters", async () => {
  const app = router().get("/items{/:org/extra}?", ({ params }) => {
    // @ts-expect-error The entire group can be absent.
    const name: string = params.org;
    return new Response(name ?? "all");
  });
  expect(await (await app.fetch(request("/items"))).text()).toBe("all");
  expect(await (await app.fetch(request("/items/shop/extra"))).text()).toBe("shop");
});

it("an eager rejected input stays observed until rendering, including HEAD", async () => {
  const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const gate = Promise.withResolvers<string>();
  const app = router()
    .get("/", () =>
      html(
        <main>
          {gate.promise}
          <Deferred fallback="loading" errorFallback={<p>Recovered</p>}>
            {Promise.reject(new Error("early rejection"))}
          </Deferred>
        </main>,
      ),
    )
    .get("/head", () => html(Promise.reject(new Error("head"))));
  const response = await app.fetch(request("/"));
  const arrayResponse = html([gate.promise, Promise.reject(new Error("array rejection"))]);
  expect((await app.fetch(request("/head", "HEAD"))).body).toBe(null);
  await turn();
  gate.resolve("ready");
  expect(await response.text()).toContain("<p>Recovered</p>");
  await expect(arrayResponse.text()).rejects.toThrow("array rejection");
});

it("nested ordered renders isolate panels while keeping lexical application context", async () => {
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
    ),
  );
  const output = await (await app.fetch(request("/"))).text();
  expect(output.match(/<template data-rw-target=/g)?.length).toBe(1);
  expect(output.match(/&lt;i&gt;inside&lt;\/i&gt;/g)?.length).toBe(2);
  expect(output).not.toContain("inner pending");
  expect(output).toContain("<section");
});

it("HEAD observes stored promises without iterating array props or reading their getters", async () => {
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
    expect(response.status).toBe(200);
    expect(response.body).toBe(null);
  }
});

it("nested app.fetch isolates request context from outer AsyncLocalStorage values", async () => {
  const theme = createContext("default");
  const app = router();
  app
    .get("/inner", () => new Response(theme.use()))
    .get("/outer", () => theme.withValue("outer-only", () => app.fetch(request("/inner"))));
  expect(await (await app.fetch(request("/outer"))).text()).toBe("default");
});

it("resolver script defaults to root-relative path and supports resolverSrc and nonce", async () => {
  const page = () => <Deferred fallback="wait">{<p>done</p>}</Deferred>;
  const defaultApp = router().get("/proxy", () => html(page()));
  const proxyHtml = await (
    await defaultApp.fetch(new Request("http://127.0.0.1:8000/proxy"))
  ).text();
  expect(proxyHtml).toContain(
    '<script src="/_ruwuter/resolve-v1.js" data-rw-resolver=""></script>',
  );
  expect(proxyHtml).not.toContain("127.0.0.1:8000");

  const configuredApp = router([], {
    resolverSrc: (req) => new URL("/prefix/_ruwuter/resolve-v1.js", req.url).href,
  })
    .get("/router-opt", () => html(page()))
    .get("/html-opt", () => html(page(), { resolverSrc: "/custom/resolve.js", nonce: "abc123" }));

  const fromRouter = await (await configuredApp.fetch(request("/router-opt"))).text();
  expect(fromRouter).toContain(
    '<script src="https://example.test/prefix/_ruwuter/resolve-v1.js" data-rw-resolver=""></script>',
  );
  const fromHtml = await (await configuredApp.fetch(request("/html-opt"))).text();
  expect(fromHtml).toContain(
    '<script src="/custom/resolve.js" data-rw-resolver="" nonce="abc123"></script>',
  );

  // Reserved resolver endpoint still handles GET, HEAD, OPTIONS, 405
  const asset = await defaultApp.fetch(request("/_ruwuter/resolve-v1.js"));
  expect(asset.status).toBe(200);
  expect(asset.headers.get("content-type")).toContain("text/javascript");
  const head = await defaultApp.fetch(request("/_ruwuter/resolve-v1.js", "HEAD"));
  expect(head.status).toBe(200);
  expect(head.body).toBe(null);
  const options = await defaultApp.fetch(request("/_ruwuter/resolve-v1.js", "OPTIONS"));
  expect(options.status).toBe(204);
  expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  const bad = await defaultApp.fetch(request("/_ruwuter/resolve-v1.js", "POST"));
  expect(bad.status).toBe(405);
});

it("standalone Deferred honors errorFallback and nested routed Deferred resolves both levels", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const failing = () => (
      <Deferred fallback="wait" errorFallback={(err) => <p>Fallback: {(err as Error).message}</p>}>
        {() => Promise.reject(new Error("boom"))}
      </Deferred>
    );
    expect(await renderToString(failing())).toBe("<p>Fallback: boom</p>");
    expect(await html(failing()).text()).toBe("<p>Fallback: boom</p>");
    expect(await new Response(renderToStream(failing())).text()).toBe("<p>Fallback: boom</p>");
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
    ),
  );
  const output = await (await app.fetch(request("/"))).text();
  expect(output.match(/<template data-rw-target=/g)?.length).toBe(2);
  expect(output.match(/<script /g)?.length).toBe(1);
  expect(output).toContain("<p>inner-done</p>");
});

it("Deferred cancellation stops pending async iterators immediately", async () => {
  const { into } = await import("../src/runtime/node.ts");
  const started = Promise.withResolvers<void>();
  const cleanedUp = Promise.withResolvers<void>();
  const never = new Promise<never>(() => {});
  const streamPanel = () =>
    into(
      (async function* () {
        try {
          started.resolve();
          yield "<p>partial</p>";
          await never;
        } finally {
          cleanedUp.resolve();
        }
      })(),
    );
  const app = router().get("/", () =>
    html(
      <main>
        <h1>Shell</h1>
        <Deferred fallback="loading">{streamPanel}</Deferred>
      </main>,
    ),
  );
  const res = await app.fetch(request("/"));
  const reader = res.body!.getReader();
  await reader.read();
  await started.promise;
  await reader.cancel();
  await cleanedUp.promise;
});

it("generated fs-routes tables mount directly on router() with specificity order", async () => {
  const { writeGeneratedFiles, generatedTypesRoot } = await import("../src/fs-routes/write.ts");
  const appDir = await mkdtemp(join(tmpdir(), "ruwuter-fs-"));
  try {
    const routesDir = join(appDir, "routes");
    await mkdir(routesDir, { recursive: true });
    await writeFile(
      join(routesDir, "_app.$slug.ts"),
      `export const GET = ({ params }: { params: { slug: string } }) => new Response("slug:" + params.slug);`,
    );
    await writeFile(join(routesDir, "about.ts"), `export const GET = () => new Response("about");`);
    await writeFile(
      join(routesDir, "$.ts"),
      `export const GET = () => new Response("root-catchall");`,
    );
    await writeFile(
      join(routesDir, "products.$.ts"),
      `export const GET = () => new Response("products-catchall");`,
    );
    await writeGeneratedFiles(appDir);
    const { routes } = await import(pathToFileURL(join(appDir, "routes.ts")).href);
    const app = router(routes);

    expect(await (await app.fetch(request("/about"))).text()).toBe("about");
    expect(await (await app.fetch(request("/other"))).text()).toBe("slug:other");
    expect(await (await app.fetch(request("/products/a/b"))).text()).toBe("products-catchall");
    expect(await (await app.fetch(request("/x/y/z"))).text()).toBe("root-catchall");
  } finally {
    await rm(appDir, { recursive: true, force: true }).catch(() => {});
    await rm(generatedTypesRoot(appDir), { recursive: true, force: true }).catch(() => {});
  }
});

it("static and simple-segment fast paths preserve registration order, ignoreCase, and encoding", async () => {
  const staticFirst = router()
    .get("/about", () => html(<p>static-about</p>))
    .get("/hello/:name", ({ params }) => html(<p>hi {params.name}</p>))
    .get("/items/:id", ({ params }) => new Response(`item:${params.id}`))
    .get("/items/special", () => new Response("after-dynamic"));

  expect(await (await staticFirst.fetch(request("/about?ref=nav"))).text()).toBe(
    "<p>static-about</p>",
  );
  expect((await staticFirst.fetch(request("/about/"))).status).toBe(404);
  expect(await (await staticFirst.fetch(request("/hello/a%20b"))).text()).toBe("<p>hi a%20b</p>");
  expect((await staticFirst.fetch(request("/hello/"))).status).toBe(404);
  expect((await staticFirst.fetch(request("/hello/a/b"))).status).toBe(404);
  // Dynamic route registered before /items/special still wins.
  expect(await (await staticFirst.fetch(request("/items/special"))).text()).toBe("item:special");

  const ignoreCaseApp = router([
    [
      new URLPattern({ pathname: "/About" }, { ignoreCase: true }),
      { GET: () => new Response("case-insensitive") },
    ],
  ]);
  expect(await (await ignoreCaseApp.fetch(request("/about"))).text()).toBe("case-insensitive");

  const doc = await router()
    .get("/", () =>
      html(
        <html>
          <body>
            <p>Static fast path</p>
          </body>
        </html>,
        { status: 201, headers: { "X-Fast": "1" } },
      ),
    )
    .fetch(request("/"));
  expect(doc.status).toBe(201);
  expect(doc.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(doc.headers.get("x-fast")).toBe("1");
  expect(await doc.text()).toBe("<!doctype html><html><body><p>Static fast path</p></body></html>");

  const asset = await staticFirst.fetch(request("/_ruwuter/resolve-v1.js"));
  expect(asset.headers.get("cache-control")).toContain("immutable");
});
