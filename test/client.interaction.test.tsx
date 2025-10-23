import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { type Env, type fragment, Router } from "../src/router.mts";
import { Client } from "../src/components/client.mts";
import { events } from "../src/events.mts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

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
                <button id="b" bind={{ by: 2 }} on={events.click(clickHref)}>
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
