import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { controller } from "../src/components/client.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { type Env, type fragment, Router } from "../src/router.ts";

describe("controller activation attributes", () => {
  it("renders explicit controller roots without adjacent metadata scripts", async () => {
    const href = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;

    const router = Router([[
      new URLPattern({ pathname: "/" }),
      [
        {
          id: "root",
          mod: {
            default: () => (
              <html>
                <body>
                  <section {...controller(href, { initiallyOpen: false })}>
                    <button type="button" data-ref="open">Open</button>
                  </section>
                </body>
              </html>
            ),
          },
        } satisfies fragment,
      ],
    ]]);

    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    expect(html).toContain(`data-rw-controller="${href}"`);
    expect(html).toContain("data-rw-props=");
    expect(html).toContain("&quot;initiallyOpen&quot;:false");
    expect(html).not.toContain("data-hydrate");
    expect(html).not.toContain("data-rw-ref-text");
  });

  it("accepts module URL objects", () => {
    const href = `data:text/javascript,${encodeURIComponent("export default function(){}")}`;
    const moduleUrl = new URL(href);

    const attrs = controller(moduleUrl, { value: 1 });

    expect(attrs["data-rw-controller"]).toBe(href);
    expect(attrs["data-rw-props"] ?? "").toContain('"value":1');
  });
});
