import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { Client } from "../src/components/client.ts";
import { event, events } from "../src/events.ts";

describe("Client interactions (no bundler)", () => {
  it("renders on-boundary and serves function module", async () => {
    const clickHref = "./handlers/click.client.js";

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="b" type="button" on={events({ by: 2 }, event.click(clickHref))}>
                  0
                </button>
                <Client />
              </body>
            </html>
          ),
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
    // Has a hydration boundary script
    expect(html).toContain('data-hydrate="h_');
    // boundary-only check
  });
});
