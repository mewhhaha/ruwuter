import { describe, it, expect } from "../test-support/deno_vitest_shim.ts";
import { Router, type Env, type fragment } from "../src/router.mts";
import { Client, ref } from "../src/components/client.mts";

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
    function click(this: any, _ev: Event, _signal: AbortSignal) {
      this.count.set((v: number) => v + 1);
    }
    (click as any).href = "/_client/r/root/click.js";

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="btn" bind={{ count }} on={click}>
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

    // Should inject hydration script payload
    expect(html).toMatch(/<script type="application\/json" data-hydrate="h/);
  });
});
