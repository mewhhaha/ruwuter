import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { Client } from "../src/components/client.ts";
import { event, events } from "../src/events.ts";

type HydrationEntry = {
  s?: string;
  ev?: string;
  opt?: { preventDefault?: boolean };
};

type HydrationPayload = {
  on?: HydrationEntry[];
  bind?: { dangerous?: string };
};

const parseHydrationPayload = (json: string): HydrationPayload => {
  return JSON.parse(json) as HydrationPayload;
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
                <button id="c" type="button" on={event.click(clickHref)}>
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
                <button id="combo" type="button" on={nestedHandlers}>
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
      .map(([, json]) => parseHydrationPayload(json))
      .find((data) =>
        Array.isArray(data.on) &&
        data.on.some((entry) => entry?.s === clickHref)
      );
    expect(payload != null).toBe(true);
    const payloadOn = payload?.on ?? [];
    expect(Array.isArray(payloadOn)).toBe(true);
    const sources = payloadOn.map((entry) => entry.s);
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
      .map(([, json]) => parseHydrationPayload(json))
      .find((data) =>
        Array.isArray(data.on) &&
        data.on.some((entry) => entry?.s === clickHref)
      );
    expect(payload != null).toBe(true);
    const entry = (payload?.on ?? []).find((value) => value?.s === clickHref);
    expect(entry?.opt?.preventDefault).toBe(true);
  });

  it("preserves URL handler references including search and hash", async () => {
    const clickHref = new URL("https://cdn.example.com/handlers/click.client.js?v=123#main");
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button id="url-click" type="button" on={event.click(clickHref)}>
                  x
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
    const payload = [...html.matchAll(
      /<script type="application\/json" data-hydrate="h_\d+">([\s\S]*?)<\/script>/g,
    )]
      .map(([, json]) => parseHydrationPayload(json))
      .find((data) => Array.isArray(data.on) && data.on.some((entry) => entry?.ev === "click"));
    expect(payload != null).toBe(true);
    const entry = (payload?.on ?? []).find((value) => value?.ev === "click");
    expect(entry?.s).toBe("https://cdn.example.com/handlers/click.client.js?v=123#main");
  });

  it("escapes hydration payload JSON for script contexts", async () => {
    const clickHref = "./handlers/click.client.js";
    const dangerous = '</ScRiPt><script id="pwn">x</script>';
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <html>
              <body>
                <button
                  id="escape"
                  type="button"
                  on={events({ dangerous }, event.click(clickHref))}
                >
                  x
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
    const scriptBodies = [...html.matchAll(
      /<script type="application\/json" data-hydrate="h_\d+">([\s\S]*?)<\/script>/g,
    )]
      .map(([, json]) => json);
    expect(scriptBodies.length).toBeGreaterThan(0);
    const targetBody = scriptBodies.find((json) => json.includes("dangerous"));
    if (!targetBody) throw new Error("Expected hydration payload with dangerous bind value");

    expect(targetBody).not.toContain(dangerous);
    expect(targetBody).toContain("\\u003C/ScRiPt\\u003E");
    const parsed = parseHydrationPayload(targetBody);
    expect(parsed.bind?.dangerous).toBe(dangerous);
  });
});
