import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { type Env, Router } from "../src/router.ts";
import type { fragment } from "../src/router.ts";
import { into } from "../src/runtime/node.ts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => {
      pending.push(p);
    },
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

describe("Router HTML responses", () => {
  it("returns HTML for GET with default component", async () => {
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: ({ children }: any) => (
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

  it("omits outer fragment when fx-request header is present", async () => {
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: ({ children }: any) => (
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
    // Should include doctype and inner content, but not the shell markup
    expect(text).toContain("<!doctype html>");
    expect(text).toContain("<h1>Inner</h1>");
    expect(text).not.toContain("SHELL");
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

describe("Headers merging", () => {
  it("merges headers from fragments with default HTML header", async () => {
    const pattern = new URLPattern({ pathname: "/hdr" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: ({ children }: any) => <div>{children}</div>,
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
