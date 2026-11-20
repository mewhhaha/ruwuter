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
