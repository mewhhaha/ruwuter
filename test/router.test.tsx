import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import {
  type Env,
  fragment as defineFragment,
  html,
  json,
  type JSX as RuwuterJSX,
  renderToStream,
  renderToString,
  Router,
} from "../src/router.ts";
import type { fragment } from "../src/router.ts";
import { into } from "../src/runtime/node.ts";
import type { InferHeadersFunction } from "../src/types.ts";

type LayoutProps = { children?: RuwuterJSX.HtmlNode };

describe("Router HTML responses", () => {
  it("renders Html values through async public helpers", async () => {
    const text = await renderToString(<main>Rendered</main>);
    expect(text).toBe("<main>Rendered</main>");

    const stream = renderToStream(into("<p>Streamed</p>"));
    const rendered = await new Response(stream).text();
    expect(rendered).toBe("<p>Streamed</p>");
  });

  it("accepts sync string route renderers through route typing", async () => {
    const fragments: fragment[] = [{
      id: "text",
      mod: {
        default: () => "Rendered text",
      },
    }];
    const router = Router([[new URLPattern({ pathname: "/text" }), fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/text"),
      {} as Env,
      ctx,
    );

    expect(await res.text()).toContain("Rendered text");
  });

  it("types headers loaderData as the awaited loader result", () => {
    const headers: InferHeadersFunction<
      Record<never, never>,
      { loader: () => Promise<{ value: string }> }
    > = ({ loaderData }) => ({ "x-value": loaderData.value });

    expect(typeof headers).toBe("function");
  });

  it("lets handlers return html() responses with status and headers", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/created" }),
      [{
        id: "created",
        mod: {
          loader: () =>
            html(<p>Created</p>, {
              status: 201,
              headers: { "Cache-Control": "private" },
            }),
        },
      }],
    ]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/created"),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(res.headers.get("Cache-Control")).toBe("private");
    expect(await res.text()).toContain("<p>Created</p>");
  });

  it("lets handlers return json() responses with status", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/accepted" }),
      [{
        id: "accepted",
        mod: {
          action: () => json({ ok: true }, { status: 202 }),
        },
      }],
    ]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/accepted", { method: "POST" }),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(202);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns HTML for GET with default component", async () => {
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: ({ children }: LayoutProps) => (
            <html>
              <body>{children}</body>
            </html>
          ),
        },
      },
      { id: "index", mod: { default: () => <h1>Hello</h1> } },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/"),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const text = await res.text();
    expect(text).toContain("<!doctype html>");
    expect(text).toContain("<h1>Hello</h1>");
    expect(text).toContain("<html>");
  });

  it("renders outer fragment even when fx-request header is present", async () => {
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: ({ children }: LayoutProps) => (
            <html>
              <body>
                <div id="shell">SHELL</div>
                {children}
              </body>
            </html>
          ),
        },
      },
      { id: "index", mod: { default: () => <h1>Inner</h1> } },
    ];
    const router = Router([[pattern, fragments]]);
    const req = new Request("https://example.com/", {
      headers: { "fx-request": "1" },
    });
    const { ctx } = makeCtx();
    const res = await router.handle(req, {} as Env, ctx);
    const text = await res.text();
    // Should include doctype and both outer and inner content
    expect(text).toContain("<!doctype html>");
    expect(text).toContain("<h1>Inner</h1>");
    expect(text).toContain("SHELL");
  });
});

describe("Router data responses", () => {
  it("returns JSON from loader on GET when no default component", async () => {
    const pattern = new URLPattern({ pathname: "/data" });
    const fragments: fragment[] = [
      { id: "data", mod: { loader: () => ({ ok: true }) } },
    ];
    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/data"),
      {} as Env,
      ctx,
    );
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns JSON from action on non-GET", async () => {
    const pattern = new URLPattern({ pathname: "/action" });
    const fragments: fragment[] = [
      { id: "act", mod: { action: () => ({ saved: 1 }) } },
    ];
    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/action", { method: "POST" }),
      {} as Env,
      ctx,
    );
    const body = await res.json();
    expect(body).toEqual({ saved: 1 });
  });
});

describe("Router method semantics", () => {
  it("maps HEAD to GET without a response body", async () => {
    let rendered = false;
    const router = Router([[
      new URLPattern({ pathname: "/head" }),
      [{
        id: "head",
        mod: {
          loader: () => ({ title: "Head" }),
          default: () => {
            rendered = true;
            return <h1>Head</h1>;
          },
          headers: ({ loaderData }) => ({ "x-title": (loaderData as { title: string }).title }),
        },
      }],
    ]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/head", { method: "HEAD" }),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(res.headers.get("x-title")).toBe("Head");
    expect(await res.text()).toBe("");
    expect(rendered).toBe(false);
  });

  it("returns 405 with Allow for unsupported matched methods", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/readonly" }),
      [{ id: "readonly", mod: { default: () => <h1>Read</h1> } }],
    ]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/readonly", { method: "POST" }),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(405);
    expect(res.headers.get("Allow") ?? "").toContain("GET");
    expect(res.headers.get("Allow") ?? "").toContain("HEAD");
    expect(res.headers.get("Allow") ?? "").toContain("OPTIONS");
  });

  it("answers OPTIONS with Allow for matched routes", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/options" }),
      [{ id: "options", mod: { action: () => ({ ok: true }) } }],
    ]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/options", { method: "OPTIONS" }),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Allow") ?? "").toContain("POST");
    expect(await res.text()).toBe("");
  });
});

describe("Router explicit fragments", () => {
  it("serves route-scoped fragments with matched params", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/products/:slug" }),
      [{
        id: "products.$slug",
        mod: {
          default: () => <main>Page</main>,
          fragments: {
            sidebar: defineFragment(({ env, params }) => (
              <aside>{params.slug}:{String("name" in env)}</aside>
            )),
          },
        },
      }],
    ]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/products/keyboard/_ruwuter/sidebar"),
      { name: "env" } as unknown as Env,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<aside>keyboard:true</aside>");
  });
});

describe("Headers merging", () => {
  it("merges headers from fragments with default HTML header", async () => {
    const pattern = new URLPattern({ pathname: "/hdr" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: ({ children }: LayoutProps) => <div>{children}</div>,
          headers: () => ({ "X-Root": "yes" }),
        },
      },
      {
        id: "leaf",
        mod: {
          default: () => into("<p>Leaf</p>"),
          headers: () => new Headers({ "X-Leaf": "ok" }),
        },
      },
    ];
    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/hdr"),
      {} as Env,
      ctx,
    );
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(res.headers.get("X-Root")).toBe("yes");
    expect(res.headers.get("X-Leaf")).toBe("ok");
  });
});

describe("Not found", () => {
  it("returns 404 for unknown routes", async () => {
    const router = Router([]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/missing"),
      {} as Env,
      ctx,
    );
    expect(res.status).toBe(404);
  });
});
