import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { html, renderToStream, renderToString, router, unsafeHTML } from "../src/router.ts";
import { Deferred } from "../src/components/index.ts";

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
