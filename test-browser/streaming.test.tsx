import { assert, assertEquals } from "@std/assert";
import { chromium, firefox, webkit } from "playwright-core";
import { fixiReviewsApp, type Review } from "../examples/fixi-reviews.tsx";
import { productApp } from "../examples/product.tsx";
import { html, unsafeHTML } from "../src/router.ts";
import { controller } from "../src/browser.ts";
import { Deferred } from "../src/components/index.ts";

for (const engine of [chromium, firefox, webkit]) {
  Deno.test(`${engine.name()}: native form and split out-of-order HTML`, async () => {
    const reviews = Promise.withResolvers<void>();
    const fast = Promise.withResolvers<void>();
    const slow = Promise.withResolvers<void>();
    const tail = Promise.withResolvers<void>();
    const saved: string[] = [];
    const app = productApp({
      name: () => Promise.resolve("Keyboard"),
      reviews: async () => {
        await reviews.promise;
        return saved;
      },
      addReview: (_id, text) => {
        saved.push(text);
        return Promise.resolve();
      },
    }).get("/panels", () =>
      html(
        <html>
          <head>
            <title>Panels</title>
          </head>
          <body>
            <h1>Panels</h1>
            <p>{"Shell ".repeat(1024)}</p>
            <Deferred fallback={<p id="fast-wait">Loading first panel</p>}>
              {async () => {
                await fast.promise;
                return <p id="fast">First panel</p>;
              }}
            </Deferred>
            <Deferred fallback={<p id="slow-wait">Loading second panel</p>}>
              {async () => {
                await slow.promise;
                return <p id="slow">Second panel</p>;
              }}
            </Deferred>
          </body>
        </html>,
      ))
      .get("/base-panels", ({ request }) =>
        html(
          <html>
            <head>
              <base href="https://example.invalid/" />
              <title>Base Panels</title>
            </head>
            <body>
              <Deferred fallback={<p id="base-wait">Loading</p>}>
                <p id="base-ready">Ready with base and nonce</p>
              </Deferred>
            </body>
          </html>,
          {
            resolverSrc: new URL("/_ruwuter/resolve-v1.js", request.url).href,
            nonce: "test-nonce",
            headers: {
              "Content-Security-Policy": "script-src 'nonce-test-nonce'",
            },
          },
        ));
    const bundle = await new Deno.Command(Deno.execPath(), {
      args: ["bundle", "--platform=browser", "--quiet", "src/runtime/swap.ts"],
      stdout: "piped",
    }).output();
    assert(bundle.success);
    const clientBundle = await new Deno.Command(Deno.execPath(), {
      args: ["bundle", "--platform=browser", "--quiet", "src/runtime/client.ts"],
      stdout: "piped",
    }).output();
    assert(clientBundle.success);
    const fxBundle = await new Deno.Command(Deno.execPath(), {
      args: ["bundle", "--platform=browser", "--quiet", "examples/fx.client.ts"],
      stdout: "piped",
    }).output();
    assert(fxBundle.success);

    let nextReviewId = 2;
    const fixiReviews: Review[] = [{ id: "1", text: "Solid switches" }];
    const fixiApp = fixiReviewsApp(
      {
        productName: (id) => Promise.resolve(id === "1" ? "Keyboard" : undefined),
        listReviews: (_id, query) =>
          Promise.resolve(
            query
              ? fixiReviews.filter((r) => r.text.toLowerCase().includes(query.toLowerCase()))
              : [...fixiReviews],
          ),
        addReview: (_id, text) => {
          const review = { id: String(nextReviewId++), text };
          fixiReviews.push(review);
          return Promise.resolve(review);
        },
        deleteReview: (_id, reviewId) => {
          const idx = fixiReviews.findIndex((r) => r.id === reviewId);
          if (idx === -1) return Promise.resolve(false);
          fixiReviews.splice(idx, 1);
          return Promise.resolve(true);
        },
        summary: () => Promise.resolve(`${fixiReviews.length} verified reviews`),
      },
      { clientRuntime: "/client.js", fxController: "/fx.client.js" },
    );

    const streamGate = Promise.withResolvers<void>();
    app.get(
      "/swap.js",
      () => new Response(bundle.stdout, { headers: { "content-type": "text/javascript" } }),
    )
      .get(
        "/client.js",
        () => new Response(clientBundle.stdout, { headers: { "content-type": "text/javascript" } }),
      )
      .get(
        "/fx.client.js",
        () => new Response(fxBundle.stdout, { headers: { "content-type": "text/javascript" } }),
      )
      .get(
        "/stream-counter.client.js",
        () =>
          new Response(
            `export default ({ root, refs, signal }) => {
              let count = 0;
              root.dataset.readyState = document.readyState;
              refs.btn.addEventListener("click", () => {
                refs.btn.textContent = "Clicks: " + (++count);
              }, { signal });
            };`,
            { headers: { "content-type": "text/javascript" } },
          ),
      )
      .get("/stream-controller", () => {
        const counter = controller("/stream-counter.client.js");
        return html(
          <html>
            <body>
              <section id="early-widget" {...counter.root()}>
                <button id="early-btn" type="button" ref={counter.refs.btn}>Clicks: 0</button>
              </section>
              <script type="module" async src="/client.js"></script>
              <p>{"Padding ".repeat(1024)}</p>
              <Deferred fallback={<p id="stream-wait">Waiting</p>}>
                {async () => {
                  await streamGate.promise;
                  return <p id="stream-done">Done</p>;
                }}
              </Deferred>
            </body>
          </html>,
        );
      })
      .get(
        "/outer.client.js",
        () =>
          new Response(
            `export default ({ root, refs, props }) => {
              root.dataset.mounted = props.role + ":" + refs.trigger.id;
            };`,
            { headers: { "content-type": "text/javascript" } },
          ),
      )
      .get(
        "/inner.client.js",
        () =>
          new Response(
            `export default ({ root, refs, props }) => {
              root.dataset.mounted = props.role + ":" + refs.trigger.id;
            };`,
            { headers: { "content-type": "text/javascript" } },
          ),
      )
      .get("/controllers", () => {
        const outer = controller("/outer.client.js", { role: "outer" });
        const inner = controller("/inner.client.js", { role: "inner" });
        return html(
          <html>
            <body>
              <section id="outer" {...outer.root()}>
                <button id="outer-btn" type="button" ref={outer.refs.trigger}>Outer</button>
                <div id="inner" {...inner.root()}>
                  <button id="inner-btn" type="button" ref={inner.refs.trigger}>Inner</button>
                </div>
              </section>
              <script type="module" src="/client.js"></script>
            </body>
          </html>,
        );
      })
      .get("/host", () =>
        html(
          <main>
            <section id="slot"></section>
            <p id="outside">Keep</p>
            {unsafeHTML(
              '<template data-rw-target="outside"><p>Wrong target</p></template><!--rw-end-->',
            )}
          </main>,
        ))
      .get("/part", () =>
        html(
          <Deferred fallback="loading fragment">
            <p>Finished fragment</p>
          </Deferred>,
        ));

    const server = Deno.serve(
      { hostname: "127.0.0.1", port: 0, onListen() {} },
      async (request) => {
        const response = await app.fetch(request);
        if (!response.body) return response;
        const path = new URL(request.url).pathname;
        // Pad test documents for engines with a minimum progressive parsing buffer.
        const split = new TransformStream<string, string>({
          async transform(chunk, out) {
            if (path.startsWith("/products/") && chunk.includes("<h1>")) {
              chunk = chunk.replace("<h1>", "<!--" + " ".repeat(8192) + "--><h1>");
            }
            const opening = chunk.indexOf('><p id="fast">');
            if (path === "/panels" && opening >= 0) {
              out.enqueue(chunk.slice(0, opening + 1));
              await tail.promise;
              chunk = chunk.slice(opening + 1);
            }
            out.enqueue(chunk);
          },
        });
        return new Response(
          response.body.pipeThrough(new TextDecoderStream()).pipeThrough(split)
            .pipeThrough(new TextEncoderStream()),
          response,
        );
      },
    );
    const url = "http://127.0.0.1:" + server.addr.port;
    try {
      const browser = await engine.launch({
        executablePath: Deno.env.get("RUWUTER_" + engine.name().toUpperCase() + "_EXECUTABLE"),
      });
      try {
        const native = await browser.newPage({ javaScriptEnabled: false });
        await native.goto(url + "/products/1", { waitUntil: "commit" });
        await native.getByRole("heading", { name: "Keyboard" }).waitFor();
        await native.getByLabel("Review").fill("Great keys");
        assertEquals(await native.locator("script").count(), 0);
        reviews.resolve();
        await native.getByRole("button", { name: "Save review" }).click();
        await native.getByText("Great keys", { exact: true }).waitFor();
        assertEquals(saved, ["Great keys"]);

        const page = await browser.newPage();
        await page.goto(url + "/panels", { waitUntil: "commit" });
        await page.locator("#slow-wait").waitFor();
        assertEquals(await page.locator("script").count(), 0);
        fast.resolve();
        await page.waitForFunction(() => !!document.querySelector("template[data-rw-target]"));
        assert(await page.locator("#fast-wait").isVisible());
        tail.resolve();
        await page.locator("#fast").waitFor();
        assert(await page.locator("#slow-wait").isVisible());
        assertEquals(await page.evaluate(() => document.readyState), "loading");
        slow.resolve();
        await page.locator("#slow").waitFor();
        assertEquals(await page.locator("script[src]").count(), 1);

        await page.goto(url + "/base-panels");
        await page.locator("#base-ready").waitFor();
        assertEquals(
          await page.evaluate(
            () =>
              (document.querySelector("script[data-rw-resolver]") as HTMLScriptElement | null)
                ?.nonce,
          ),
          "test-nonce",
        );

        for (const mode of ["innerHTML", "outerHTML", "beforebegin", "afterend"] as const) {
          await page.goto(url + "/host");
          assertEquals(await page.locator("script").count(), 0);
          await page.evaluate(async ({ moduleUrl, mode }) => {
            const { swap } = await import(moduleUrl);
            await swap(fetch("/part"), { target: "#slot", write: mode });
          }, { moduleUrl: url + "/swap.js", mode });
          await page.getByText("Finished fragment", { exact: true }).waitFor();
          assertEquals(await page.locator("#outside").textContent(), "Keep");
          assertEquals(await page.locator("template[data-rw-target]").count(), 1);
          assertEquals(await page.locator("script").count(), 0);
        }

        await page.goto(url + "/controllers");
        await page.waitForFunction(() =>
          document.getElementById("outer")?.dataset.mounted === "outer:outer-btn" &&
          document.getElementById("inner")?.dataset.mounted === "inner:inner-btn"
        );

        // Async client runtime activates controllers while slower deferred panels are still streaming.
        await page.goto(url + "/stream-controller", { waitUntil: "commit" });
        await page.waitForFunction(() =>
          document.getElementById("early-widget")?.dataset.readyState === "loading"
        );
        await page.locator("#early-btn").click();
        assertEquals(await page.locator("#early-btn").textContent(), "Clicks: 1");
        assertEquals(await page.evaluate(() => document.readyState), "loading");
        streamGate.resolve();
        await page.locator("#stream-done").waitFor();

        // Fixi-style progressive enhancement: 422 validation, 201 append, live filter, DELETE, Deferred swap.
        const fixiServer = Deno.serve(
          { hostname: "127.0.0.1", port: 0, onListen() {} },
          (req) => {
            const p = new URL(req.url).pathname;
            if (p === "/client.js" || p === "/fx.client.js") return app.fetch(req);
            return fixiApp.fetch(req);
          },
        );
        try {
          const fixiUrl = "http://127.0.0.1:" + fixiServer.addr.port;
          // No-JS progressive fallback: native POST + 303 redirect and native GET filter.
          await native.goto(fixiUrl + "/products/1");
          await native.locator('#review-form input[name="review"]').fill("No-JS review");
          await native.locator('#review-form button[type="submit"]').click();
          await native.getByText("No-JS review", { exact: true }).waitFor();

          await page.goto(fixiUrl + "/products/1");
          await page.locator("#reviews li").first().waitFor();
          await page.evaluate(() => {
            (globalThis as unknown as { __sameDoc: boolean }).__sameDoc = true;
          });

          // 422 validation error swaps into #review-error without full page reload.
          await page.locator('#review-form button[type="submit"]').click();
          await page.locator("#review-error p").waitFor();
          assert(
            (await page.locator("#review-error").textContent())?.includes("Please write a review"),
          );

          // 201 review submit appends <li>, resets input, clears #review-error.
          await page.locator('#review-form input[name="review"]').fill("Quiet stabilizers");
          await page.locator('#review-form button[type="submit"]').click();
          await page.getByText("Quiet stabilizers", { exact: true }).waitFor();
          assertEquals(await page.locator('#review-form input[name="review"]').inputValue(), "");
          assertEquals(await page.locator("#review-error").textContent(), "");

          // Debounced live search filters #reviews in place.
          await page.locator('#search-form input[name="q"]').fill("quiet");
          await page.waitForFunction(() => document.querySelectorAll("#reviews li").length === 1);
          await page.locator('#search-form input[name="q"]').fill("");
          await page.waitForFunction(() => document.querySelectorAll("#reviews li").length === 3);

          // RESTful DELETE removes its closest <li>.
          await page.locator("#reviews li", { hasText: "Quiet stabilizers" })
            .getByRole("button", { name: "Delete" }).click();
          await page.waitForFunction(() => document.querySelectorAll("#reviews li").length === 2);

          // Deferred panel inside a fixi swap resolves cleanly without leaking resolver scripts.
          await page.getByRole("button", { name: "Load review summary" }).click();
          await page.locator("#summary-ready").waitFor();
          assertEquals(await page.locator("#summary-ready").textContent(), "2 verified reviews");
          assertEquals(await page.locator("script[data-rw-resolver]").count(), 0);
          assertEquals(
            await page.evaluate(() => (globalThis as unknown as { __sameDoc: boolean }).__sameDoc),
            true,
          );
        } finally {
          await fixiServer.shutdown();
        }
      } finally {
        await browser.close();
      }
    } finally {
      reviews.resolve();
      fast.resolve();
      slow.resolve();
      tail.resolve();
      streamGate.resolve();
      await server.shutdown();
    }
  });
}
