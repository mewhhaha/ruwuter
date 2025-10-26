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
                <div id="n" on={events({ count }, event.mount(mountHref))} />
                <div id="u" on={[event.unmount(unmountHref)]} />
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
