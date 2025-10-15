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

describe("mount/unmount via unified on", () => {
  it("emits on-boundaries for mount and unmount", async () => {
    const count = ref(0);
    function mount(this: any, _ev: Event, _s: AbortSignal) {
      this.count.set((v: number) => v + 1);
    }
    function unmount(this: any, _ev: Event, _s: AbortSignal) {
      /* cleanup */
    }
    (mount as any).href = "/_client/r/root/mount.js";
    (unmount as any).href = "/_client/r/root/unmount.js";

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <div id="n" bind={{ count }} on={[mount]} />
                <div id="u" on={[unmount]} />
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
    // Both elements should have on-boundaries
    const cnt = (html.match(/data-hydrate="h_/g) || []).length;
    expect(cnt).toBeGreaterThanOrEqual(2);
  });
});
