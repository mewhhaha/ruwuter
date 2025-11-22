import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { Client } from "../src/components/client.ts";
import { event } from "../src/events.ts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

describe("Unified on-prop", () => {
  it("supports tuple-based handlers and emits a hydration boundary", async () => {
    const clickHref = "./handlers/click.client.js";
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="c" on={event.click(clickHref)}>
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
    expect(html).toContain('data-hydrate="h_');
    // boundary-only check
  });

  it("flattens nested handler arrays", async () => {
    const clickHref = "./handlers/click.client.js";
    const focusHref = "./handlers/focus.client.js";
    const nestedHandlers = [
      event.click(clickHref),
      [event.focus(focusHref)],
    ] as const;
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="combo" on={nestedHandlers}>
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
    const scripts = [...html.matchAll(
      /<script type="application\/json" data-hydrate="h_\d+">([\s\S]*?)<\/script>/g,
    )];
    expect(scripts.length).toBeGreaterThan(0);
    const payload = scripts
      .map(([, json]) => JSON.parse(json))
      .find((data) =>
        Array.isArray(data.on) &&
        data.on.some((entry: any) => entry?.s === clickHref)
      );
    expect(payload != null).toBe(true);
    expect(Array.isArray(payload!.on)).toBe(true);
    const sources = (payload!.on as any[]).map((entry: any) => entry.s);
    expect(sources).toContain(clickHref);
    expect(sources).toContain(focusHref);
    expect(sources.length).toBe(2);
  });

  it("serializes preventDefault option for client handlers", async () => {
    const clickHref = "./handlers/click.client.js";
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <a
                  id="with-prevent"
                  href="/somewhere"
                  on={event.click(clickHref, { preventDefault: true })}
                >
                  tap
                </a>
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
    const payload = [...html.matchAll(
      /<script type="application\/json" data-hydrate="h_\d+">([\s\S]*?)<\/script>/g,
    )]
      .map(([, json]) => JSON.parse(json))
      .find((data) =>
        Array.isArray(data.on) &&
        data.on.some((entry: any) => entry?.s === clickHref)
      );
    expect(payload != null).toBe(true);
    const entry = (payload!.on as any[]).find((value: any) => value?.s === clickHref);
    expect(entry?.opt?.preventDefault).toBe(true);
  });
});
