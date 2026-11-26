import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, firefox, webkit } from "playwright-core";
import { rolldown } from "rolldown";
import { expect, it } from "vitest";
import { fixiReviewsApp, type Review } from "../examples/fixi-reviews.tsx";
import { productApp } from "../examples/product.tsx";
import { viewTransitionsApp } from "../examples/view-transitions.tsx";
import { controller } from "../src/browser.ts";
import { Deferred } from "../src/components/index.ts";
import { html, unsafeHTML } from "../src/router.ts";

async function bundleBrowser(input: string): Promise<string> {
  const bundle = await rolldown({ input, platform: "browser" });
  const { output } = await bundle.generate({ format: "es" });
  await bundle.close();
  return output[0].code;
}

async function startServer(
  handler: (request: Request) => Response | Promise<Response>,
): Promise<{ url: string; shutdown(): Promise<void> }> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}${req.url ?? "/"}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    let body: Uint8Array | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks);
    }
    const response = await handler(
      new Request(url, {
        method: req.method,
        headers,
        body: body ? new Uint8Array(body) : undefined,
        signal: controller.signal,
      }),
    );
    const outHeaders: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => {
      const existing = outHeaders[key];
      if (existing === undefined) outHeaders[key] = value;
      else if (Array.isArray(existing)) existing.push(value);
      else outHeaders[key] = [existing, value];
    });
    res.writeHead(response.status, response.statusText, outHeaders);
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
      if (!res.writableEnded) res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}`,
    shutdown: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

for (const engine of [chromium, firefox, webkit]) {
  it(`${engine.name()}: native form and split out-of-order HTML`, async () => {
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
    })
      .get("/panels", () =>
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
        ),
      )
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
        ),
      );

    const [swapCode, clientCode, fxCode, vtCode] = await Promise.all([
      bundleBrowser("src/runtime/swap.ts"),
      bundleBrowser("src/runtime/client.ts"),
      bundleBrowser("examples/fx.client.ts"),
      bundleBrowser("src/runtime/vt.ts"),
    ]);

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
    app
      .get(
        "/swap.js",
        () => new Response(swapCode, { headers: { "content-type": "text/javascript" } }),
      )
      .get(
        "/client.js",
        () => new Response(clientCode, { headers: { "content-type": "text/javascript" } }),
      )
      .get(
        "/fx.client.js",
        () => new Response(fxCode, { headers: { "content-type": "text/javascript" } }),
      )
      .get("/vt.js", () => new Response(vtCode, { headers: { "content-type": "text/javascript" } }))
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
                <button id="early-btn" type="button" ref={counter.refs.btn}>
                  Clicks: 0
                </button>
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
                <button id="outer-btn" type="button" ref={outer.refs.trigger}>
                  Outer
                </button>
                <div id="inner" {...inner.root()}>
                  <button id="inner-btn" type="button" ref={inner.refs.trigger}>
                    Inner
                  </button>
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
        ),
      )
      .get("/part", () =>
        html(
          <Deferred fallback="loading fragment">
            <p>Finished fragment</p>
          </Deferred>,
        ),
      );

    const server = await startServer(async (request) => {
      const response = await app.fetch(request);
      if (!response.body) return response;
      const path = new URL(request.url).pathname;
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
        response.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(split)
          .pipeThrough(new TextEncoderStream()),
        response,
      );
    });
    const { url } = server;
    try {
      const browser = await engine.launch({
        executablePath: process.env["RUWUTER_" + engine.name().toUpperCase() + "_EXECUTABLE"],
      });
      try {
        const native = await browser.newPage({ javaScriptEnabled: false });
        await native.goto(url + "/products/1", { waitUntil: "commit" });
        await native.getByRole("heading", { name: "Keyboard" }).waitFor();
        await native.getByLabel("Review").fill("Great keys");
        expect(await native.locator("script").count()).toBe(0);
        reviews.resolve();
        await native.getByRole("button", { name: "Save review" }).click();
        await native.getByText("Great keys", { exact: true }).waitFor();
        expect(saved).toEqual(["Great keys"]);

        const page = await browser.newPage();
        await page.goto(url + "/panels", { waitUntil: "commit" });
        await page.locator("#slow-wait").waitFor();
        expect(await page.locator("script").count()).toBe(0);
        fast.resolve();
        await page.waitForFunction(() => !!document.querySelector("template[data-rw-target]"));
        expect(await page.locator("#fast-wait").isVisible()).toBe(true);
        tail.resolve();
        await page.locator("#fast").waitFor();
        expect(await page.locator("#slow-wait").isVisible()).toBe(true);
        expect(await page.evaluate(() => document.readyState)).toBe("loading");
        slow.resolve();
        await page.locator("#slow").waitFor();
        expect(await page.locator("script[src]").count()).toBe(1);

        await page.goto(url + "/base-panels");
        await page.locator("#base-ready").waitFor();
        expect(
          await page.evaluate(
            () =>
              (document.querySelector("script[data-rw-resolver]") as HTMLScriptElement | null)
                ?.nonce,
          ),
        ).toBe("test-nonce");

        for (const mode of ["innerHTML", "outerHTML", "beforebegin", "afterend"] as const) {
          await page.goto(url + "/host");
          expect(await page.locator("script").count()).toBe(0);
          await page.evaluate(
            `import(${JSON.stringify(url + "/swap.js")}).then(({ swap }) => swap(fetch("/part"), { target: "#slot", write: ${JSON.stringify(mode)} }))`,
          );
          await page.getByText("Finished fragment", { exact: true }).waitFor();
          expect(await page.locator("#outside").textContent()).toBe("Keep");
          expect(await page.locator("template[data-rw-target]").count()).toBe(1);
          expect(await page.locator("script").count()).toBe(0);
        }

        await page.goto(url + "/controllers");
        await page.waitForFunction(
          () =>
            document.getElementById("outer")?.dataset.mounted === "outer:outer-btn" &&
            document.getElementById("inner")?.dataset.mounted === "inner:inner-btn",
        );

        // Async client runtime activates controllers while slower deferred panels are still streaming
        // in Chromium and Firefox (WebKit defers async module scripts until stream close).
        await page.goto(url + "/stream-controller", { waitUntil: "commit" });
        await page.locator("#stream-wait").waitFor();
        if (engine.name() !== "webkit") {
          await page.waitForFunction(
            () => document.getElementById("early-widget")?.dataset.readyState === "loading",
          );
          await page.locator("#early-btn").click();
          expect(await page.locator("#early-btn").textContent()).toBe("Clicks: 1");
          expect(await page.evaluate(() => document.readyState)).toBe("loading");
        }
        streamGate.resolve();
        await page.locator("#stream-done").waitFor();
        if (engine.name() === "webkit") {
          await page.waitForFunction(
            () => !!document.getElementById("early-widget")?.dataset.readyState,
          );
          await page.locator("#early-btn").click();
          expect(await page.locator("#early-btn").textContent()).toBe("Clicks: 1");
        }

        const fixiServer = await startServer((req) => {
          const p = new URL(req.url).pathname;
          if (p === "/client.js" || p === "/fx.client.js") return app.fetch(req);
          return fixiApp.fetch(req);
        });
        try {
          const fixiUrl = fixiServer.url;
          await native.goto(fixiUrl + "/products/1");
          await native.locator('#review-form input[name="review"]').fill("No-JS review");
          await native.locator('#review-form button[type="submit"]').click();
          await native.getByText("No-JS review", { exact: true }).waitFor();

          await page.goto(fixiUrl + "/products/1");
          await page.locator("main[data-fx-ready]").waitFor();
          await page.evaluate(() => {
            (globalThis as unknown as { __sameDoc: boolean }).__sameDoc = true;
          });

          await page.locator('#review-form button[type="submit"]').click();
          await page.locator("#review-error p").waitFor();
          expect(await page.locator("#review-error").textContent()).toContain(
            "Please write a review",
          );

          await page.locator('#review-form input[name="review"]').fill("Quiet stabilizers");
          await page.locator('#review-form button[type="submit"]').click();
          await page.getByText("Quiet stabilizers", { exact: true }).waitFor();
          expect(await page.locator('#review-form input[name="review"]').inputValue()).toBe("");
          expect(await page.locator("#review-error").textContent()).toBe("");

          await page.locator('#search-form input[name="q"]').fill("quiet");
          await page.waitForFunction(() => document.querySelectorAll("#reviews li").length === 1);
          await page.locator('#search-form input[name="q"]').fill("");
          await page.waitForFunction(() => document.querySelectorAll("#reviews li").length === 3);

          await page
            .locator("#reviews li", { hasText: "Quiet stabilizers" })
            .getByRole("button", { name: "Delete" })
            .click();
          await page.waitForFunction(() => document.querySelectorAll("#reviews li").length === 2);

          await page.getByRole("button", { name: "Load review summary" }).click();
          await page.locator("#summary-ready").waitFor();
          expect(await page.locator("#summary-ready").textContent()).toBe("2 verified reviews");
          expect(await page.locator("script[data-rw-resolver]").count()).toBe(0);
          expect(
            await page.evaluate(() => (globalThis as unknown as { __sameDoc: boolean }).__sameDoc),
          ).toBe(true);
        } finally {
          await fixiServer.shutdown();
        }

        const vtApp = viewTransitionsApp({
          assets: {
            clientRuntime: "/client.js",
            vtRuntime: "/vt.js",
            fxController: "/fx.client.js",
          },
          simulateLatency: false,
        });
        const vtServer = await startServer((req) => {
          const p = new URL(req.url).pathname;
          if (p === "/client.js" || p === "/vt.js" || p === "/fx.client.js") return app.fetch(req);
          return vtApp.fetch(req);
        });
        try {
          const vtUrl = vtServer.url;
          await page.goto(vtUrl + "/");
          await page.locator(".shell[data-fx-ready]").waitFor();
          expect(
            await page.locator('[data-rw-vt="art-split-65"]').getAttribute("data-rw-vt-for"),
          ).toBe("/items/split-65");

          await page.getByLabel("Filter gear").fill("split");
          await page.waitForFunction(
            () => document.querySelectorAll("#catalog .card").length === 1,
          );

          await page.locator('#catalog a[href="/items/split-65"]').click();
          await page.locator("#item-hero").waitFor();
          await page.locator("#stock-ready").waitFor();
          await page.locator("#reviews li").first().waitFor();
          expect(
            await page.locator('[data-rw-vt="art-split-65"]').getAttribute("data-rw-vt-for"),
          ).toBe("*");

          await page.locator('#review-form input[name="review"]').fill("Crisp tactiles");
          await page.locator('#review-form button[type="submit"]').click();
          await page.getByText("Crisp tactiles", { exact: false }).waitFor();
          await page
            .locator("#reviews li", { hasText: "Crisp tactiles" })
            .getByRole("button", { name: "Remove" })
            .click();
          await page.waitForFunction(() => document.querySelectorAll("#reviews li").length === 1);

          await page.locator("a.back-link").click();
          await page.locator("#catalog .card").first().waitFor();
        } finally {
          await vtServer.shutdown();
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
