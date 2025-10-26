import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { Client, ref } from "../src/components/client.ts";
import { event, events } from "../src/events.ts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

describe("Ref sharing", () => {
  it("hydrates ref in bind payload", async () => {
    const count = ref(7);

    // Handler via unified on + bind
    const clickHref = "./handlers/click.client.js";

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="btn" on={events({ count }, event.click(clickHref))}>
                  {count}
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

    // Should inject hydration script payload (ref-based)
    expect(html).toMatch(/<script type="application\/json" data-hydrate="h/);
  });
});
