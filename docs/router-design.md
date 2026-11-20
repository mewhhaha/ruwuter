# A smaller Ruwuter

Ruwuter 0.7 is built around a Fetch handler, streaming JSX, and one way to attach a browser module
to an element. The [product example](../examples/product.tsx) is a page with a slow reviews section
and a working review form. It exercises routing, status codes, streaming, and interactivity with a
single example. The [benchmark report](benchmarks/README.md) compares browser latency, request cost,
and package and page sizes against 0.6.

## 1. Fix what the reader sees first

The 0.6 router streamed completed panels to the network. Its documented resolver was a module script
in the document head, so it normally runs after parsing finishes. With two independent panels, the
fast panel can sit in the DOM inside an invisible template until the slow panel finishes.
[HTML script processing](https://html.spec.whatwg.org/multipage/scripting.html#attr-script-async)

I served two real Ruwuter Suspense boundaries over localhost, held the slow one open, and checked
the visible DOM. I also split the fast template immediately after its opening tag. A server write
doesn't guarantee that the browser receives a complete element in one piece.

| Resolver experiment                          | Chromium 158                | Firefox 159                 | WebKit 27.2                 |
| -------------------------------------------- | --------------------------- | --------------------------- | --------------------------- |
| Documented module, complete template         | Fast panel waited for close | Fast panel waited for close | Fast panel waited for close |
| Head module with `async`, split template     | Fast panel lost             | Fast panel lost             | Fast panel waited for close |
| External script after shell, completion mark | Fast panel appeared early   | Fast panel appeared early   | Fast panel appeared early   |

In the prototype the browser could display both fallbacks before it encountered any script. The
server sent one external classic script just before the first replacement and a trailing comment
after each complete template. The script waited for that comment before moving the content. Its
download can delay the first replacement. The page heading and form are already available then. The
0.7 router serves this protocol itself.

The browser regression runs in CI. Hold the last panel open, split an earlier template, and verify
that its fallback survives until the complete panel appears. A test that reads the final response
body cannot catch either failure.

## 2. Let the handler decide when the page can start

In 0.6 one action handles four mutation methods, a plain loader result can become JSON, and a page
waits for every matched loader before rendering. The new router accepts explicit method/path
handlers returning a standard `Response`. A document, a fragment, and a form submission can then be
ordinary URLs. File routing can generate the same table that a small app writes by hand.

The method API supports this product page.

```tsx
const app = router()
  .get("/products/:id", async ({ params, signal }) => {
    const product = await findProduct(params.id, { signal });
    if (!product) return new Response(null, { status: 404 });

    return html(
      <Page>
        <h1>{product.name}</h1>
        <ReviewForm productId={product.id} />
        <Reviews productId={product.id} signal={signal} />
      </Page>,
    );
  })
  .post("/products/:id/reviews", saveReview);

export default { fetch: app.fetch };
```

Here the product lookup decides the status. The async `Reviews` component can finish after the
heading and form reach the reader. In a test with the current renderer, awaiting reviews in a child
loader held back the heading. Returning the pending promise as a field let the heading through with
**zero browser scripts**.

Keep automatic HEAD, OPTIONS, and Allow from the method table. Keep redirects and authorization
before the first byte. Pass the request signal into downstream work and test that disconnecting
during a pending panel releases its resources. Treat ordinary strings as text at every public
rendering entry point, with one explicit escape hatch for trusted markup. In 0.7 both JSX and
`html(string)` escape text.

## 3. Make a small amount of JavaScript easy to own

Use native links and forms for page changes. Use ordered streaming for content that everyone needs,
including readers with JavaScript disabled. Offer one deferred-panel component for independent
sections where a meaningful fallback is acceptable. Let the renderer own its bookkeeping so the
author can write the component without wiring a provider and resolver into every document.

For a button that needs local behavior, keep an explicit browser module with a DOM root, typed
props, and an abort signal for cleanup. A module can attach one listener or manage a whole widget.
Typed refs identify the descendants a widget owns. Removing same-file callback extraction also
removed its 613-line build transform at `ee65994`.

Keep whole-page navigation native in the first version. The removed 0.6 navigation runtime waits for
`response.text()` before replacing the page. A fast response can hide that cost, while a slow
reviews section exposes it on every navigation. A targeted refresh can fetch a normal HTML route and
update one element.

The [browser suite](../test-browser/streaming.test.tsx) exercises the product form with scripting
disabled, a template arriving in two pieces while a slower panel stays pending, and a targeted
refresh on a page that started without a resolver. CI runs it across Chromium, Firefox and WebKit.
