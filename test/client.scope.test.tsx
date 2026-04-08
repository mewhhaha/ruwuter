import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { client, ref } from "../src/components/client.ts";
import { type Env, type fragment, Router } from "../src/router.ts";

describe("client.scope", () => {
  it("auto-anchors scope runs onto the first intrinsic element", async () => {
    const mountHref = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => {
            const input = ref(null as HTMLInputElement | null);
            const scopeState = client.scope({ input });
            scopeState.mount(mountHref);
            return (
              <html>
                <body>
                  <section>
                    <input ref={input} />
                  </section>
                  <script type="module" src="@mewhhaha/ruwuter/client.js"></script>
                </body>
              </html>
            );
          },
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    expect(html).toContain("<section><input");
    expect(html).toContain('data-hydrate="h_');
    expect(html).toContain('"ev":"mount"');
    expect(html).toContain('"input"');
  });

  it("allows explicit scope anchoring with scope.props()", async () => {
    const mountHref = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => {
            const scopeState = client.scope({});
            scopeState.mount(mountHref);
            return (
              <html>
                <body>
                  <header>chrome</header>
                  <section {...scopeState.props()}>
                    content
                  </section>
                  <script type="module" src="@mewhhaha/ruwuter/client.js"></script>
                </body>
              </html>
            );
          },
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    expect(html).toContain("<header>chrome</header><section>content</section>");
    expect(html).toContain('data-hydrate="h_');
  });

  it("accepts transformed client bindings via mount() and serializes unmount entries", async () => {
    const mountHref = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;
    const unmountHref = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;
    const mountBinding = Object.assign(function mountScope() {}, { clientHref: mountHref });
    const unmountBinding = Object.assign(function unmountScope() {}, { clientHref: unmountHref });

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => {
            const scopeState = client.scope({});
            scopeState.mount(mountBinding);
            scopeState.unmount(unmountBinding);
            return (
              <html>
                <body>
                  <section>content</section>
                  <script type="module" src="@mewhhaha/ruwuter/client.js"></script>
                </body>
              </html>
            );
          },
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    expect(html).toContain('"ev":"mount"');
    expect(html).toContain('"ev":"unmount"');
    expect(html).toContain(mountHref);
    expect(html).toContain(unmountHref);
  });

  it("accepts initial bind values through client.scope(bind)", async () => {
    const mountHref = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => {
            const input = ref(null as HTMLInputElement | null);
            const scopeState = client.scope({ input });
            scopeState.mount(mountHref);
            return (
              <html>
                <body>
                  <section>
                    <input ref={input} />
                  </section>
                  <script type="module" src="@mewhhaha/ruwuter/client.js"></script>
                </body>
              </html>
            );
          },
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    expect(html).toContain('"input"');
    expect(html).toContain('"ev":"mount"');
    expect(html).toContain('data-hydrate="h_');
  });
});
