import { describe, it, expect } from "../test-support/deno_vitest_shim.ts";
import { Router, type Env, type fragment } from "../src/router.mts";

const makeCtx = () => {
  const pending: Promise<any>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (p: Promise<any>) => pending.push(p),
    passThroughOnException: () => {},
  } as any;
  return { ctx, pending } as const;
};

describe("Thrown Response handling", () => {
  it("returns 404 when a loader returns a Response during HTML rendering", async () => {
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          loader: () => new Response("Not Found", { status: 404 }),
          default: ({ children }: any) => (
            <html>
              <body>{children}</body>
            </html>
          ),
        },
      },
      { id: "index", mod: { default: () => <h1>Should not render</h1> } },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/"),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain("Not Found");
  });

  it("returns 404 when a loader throws a Response during HTML rendering", async () => {
    const pattern = new URLPattern({ pathname: "/" });
    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          loader: () => {
            throw new Response("Not Found", { status: 404 });
          },
          default: ({ children }: any) => (
            <html>
              <body>{children}</body>
            </html>
          ),
        },
      },
      { id: "index", mod: { default: () => <h1>Should not render</h1> } },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/"),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain("Not Found");
  });

  it("returns a Response from data loader on GET (return)", async () => {
    const pattern = new URLPattern({ pathname: "/data-return" });
    const fragments: fragment[] = [
      {
        id: "data",
        mod: {
          loader: () => new Response("Custom", { status: 418 }),
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/data-return"),
      {} as Env,
      ctx,
    );
    expect(res.status).toBe(418);
    expect(await res.text()).toBe("Custom");
  });

  it("returns a Response from data loader on GET (throw)", async () => {
    const pattern = new URLPattern({ pathname: "/data-throw" });
    const fragments: fragment[] = [
      {
        id: "data",
        mod: {
          loader: () => {
            throw new Response("Custom Throw", { status: 418 });
          },
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/data-throw"),
      {} as Env,
      ctx,
    );
    expect(res.status).toBe(418);
    expect(await res.text()).toBe("Custom Throw");
  });

  it("returns 404 when a component throws a Response", async () => {
    const pattern = new URLPattern({ pathname: "/throw" });
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
      {
        id: "leaf",
        mod: {
          default: () => {
            throw new Response("Not Found", { status: 404 });
          },
        },
      },
    ];

    const router = Router([[pattern, fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/throw"),
      {} as Env,
      ctx,
    );

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain("Not Found");
  });
});

