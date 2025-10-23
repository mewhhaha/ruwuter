import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { type Env, type fragment, Router } from "../src/router.mts";
import { Client, ref } from "../src/components/client.mts";
import { events } from "../src/events.mts";

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
    const mountHref = "./handlers/mount.client.js";
    const unmountHref = "./handlers/unmount.client.js";

    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <div id="n" bind={{ count }} on={[events.mount(mountHref)]} />
                <div id="u" on={[events.unmount(unmountHref)]} />
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
