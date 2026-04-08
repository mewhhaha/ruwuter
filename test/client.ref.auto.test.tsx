import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { client, ref } from "../src/components/client.ts";

describe("Ref sharing", () => {
  it("hydrates scope-bound refs in the payload", async () => {
    const noopHref = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => {
            const count = ref(7);
            const scope = client.scope({ count });
            scope.mount(noopHref);
            return (
              <html>
                <body>
                  <section>
                    <button id="btn" type="button">{count}</button>
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
    const res = await router.handle(
      new Request("https://example.com/"),
      {} as Env,
      ctx,
    );
    const html = await res.text();

    expect(html).toMatch(/<script type="application\/json" data-hydrate="h_/);
    expect(html).toContain('"count"');
  });

  it("renders ref-backed text children with a data-rw-ref-text marker", async () => {
    const noopHref = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => {
            const label = ref("initial");
            const scope = client.scope({ label });
            scope.mount(noopHref);
            return (
              <html>
                <body>
                  <section>
                    <div id="label">{label}</div>
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
    const res = await router.handle(
      new Request("https://example.com/"),
      {} as Env,
      ctx,
    );
    const html = await res.text();

    expect(html).toContain("data-rw-ref-text");
    expect(html).toMatch(/<script type="application\/json" data-hydrate="h_/);
  });
});
