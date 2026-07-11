import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { type Env, fragment, type fragment as RouteFragment, Router } from "../src/router.ts";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

describe("Router updates", () => {
  it("starts nested loaders together and settles headers from parent to leaf", async () => {
    const parent = deferred<{ value: string }>();
    const child = deferred<{ value: string }>();
    const started: string[] = [];
    const headers: string[] = [];
    const fragments: RouteFragment[] = [
      {
        id: "parent",
        mod: {
          loader: () => {
            started.push("parent");
            return parent.promise;
          },
          headers: ({ loaderData }) => {
            headers.push(`parent:${(loaderData as { value: string }).value}`);
            return { "x-route": "parent" };
          },
          default: ({ children }) => children,
        },
      },
      {
        id: "child",
        mod: {
          loader: () => {
            started.push("child");
            return child.promise;
          },
          headers: ({ loaderData }) => {
            headers.push(`child:${(loaderData as { value: string }).value}`);
            return { "x-route": "child" };
          },
          default: () => "done",
        },
      },
    ];
    const router = Router([[new URLPattern({ pathname: "/parallel" }), fragments]]);
    const { ctx } = makeCtx();
    const response = router.handle(new Request("https://example.com/parallel"), {} as Env, ctx);

    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(["parent", "child"]);

    child.resolve({ value: "child" });
    parent.resolve({ value: "parent" });
    const result = await response;
    expect(headers).toEqual(["parent:parent", "child:child"]);
    expect(result.headers.get("x-route")).toBe("child");
  });

  it("matches routes in declaration order", async () => {
    const router = Router([
      [
        new URLPattern({ pathname: "/:slug" }),
        [{ id: "dynamic", mod: { loader: ({ params }) => `dynamic:${params.slug}` } }],
      ],
      [
        new URLPattern({ pathname: "/about" }),
        [{ id: "static", mod: { loader: () => "static" } }],
      ],
    ]);
    const { ctx } = makeCtx();
    const response = await router.handle(new Request("https://example.com/about"), {} as Env, ctx);

    expect(await response.json()).toBe("dynamic:about");
  });

  it("preserves the first of duplicate routes", async () => {
    const router = Router([
      [
        new URLPattern({ pathname: "/duplicate" }),
        [{ id: "first", mod: { loader: () => "first" } }],
      ],
      [
        new URLPattern({ pathname: "/duplicate" }),
        [{ id: "second", mod: { loader: () => "second" } }],
      ],
    ]);
    const { ctx } = makeCtx();
    const response = await router.handle(
      new Request("https://example.com/duplicate"),
      {} as Env,
      ctx,
    );

    expect(await response.json()).toBe("first");
  });

  it("matches case-insensitive literal URLPatterns", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/About" }, { ignoreCase: true }),
      [{ id: "about", mod: { loader: () => ({ matched: true }) } }],
    ]]);
    const { ctx } = makeCtx();

    const response = await router.handle(
      new Request("https://example.com/about"),
      {} as Env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matched: true });
  });

  it("observes a losing loader rejection after an earlier loader returns a response", async () => {
    const parent = deferred<unknown>();
    const child = deferred<unknown>();
    const router = Router([[
      new URLPattern({ pathname: "/redirect" }),
      [
        {
          id: "parent",
          mod: { default: ({ children }) => children, loader: () => parent.promise },
        },
        { id: "child", mod: { default: () => "child", loader: () => child.promise } },
      ],
    ]]);
    const { ctx } = makeCtx();
    const handling = router.handle(new Request("https://example.com/redirect"), {} as Env, ctx);

    await Promise.resolve();
    parent.resolve(new Response(null, { status: 302 }));
    const response = await handling;
    child.reject(new Error("losing loader failure"));
    await Promise.resolve();

    expect(response.status).toBe(302);
  });

  it("rethrows loader errors so applications can respond to them", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/items/:id" }),
      [{
        id: "item",
        mod: {
          loader: () => {
            throw new Error("broken");
          },
        },
      }],
    ]]);
    const { ctx } = makeCtx();

    let caught: unknown;
    try {
      await router.handle(new Request("https://example.com/items/42"), {} as Env, ctx);
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof Error).toBe(true);
    expect((caught as Error).message).toBe("broken");
  });

  it("lets applications wrap handle for not-found and error responses", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/items/:id" }),
      [{
        id: "item",
        mod: {
          loader: () => {
            throw new Error("broken");
          },
        },
      }],
    ]]);
    const { ctx } = makeCtx();

    const fetch = async (request: Request): Promise<Response> => {
      try {
        const response = await router.handle(request, {} as Env, ctx);
        if (response.status === 404 && !response.body) {
          return new Response("custom not found", { status: 404 });
        }
        return response;
      } catch {
        return new Response("custom error", { status: 500 });
      }
    };

    const missing = await fetch(new Request("https://example.com/missing"));
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("custom not found");

    const failed = await fetch(new Request("https://example.com/items/42"));
    expect(failed.status).toBe(500);
    expect(await failed.text()).toBe("custom error");
  });

  it("allows fragment endpoints to opt into POST", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/form" }),
      [{
        id: "form",
        mod: {
          fragments: {
            submit: fragment(() => new Response("saved", { status: 201 }), {
              methods: ["POST"],
            }),
          },
        },
      }],
    ]]);
    const { ctx } = makeCtx();

    const post = await router.handle(
      new Request("https://example.com/form/_ruwuter/submit", { method: "POST" }),
      {} as Env,
      ctx,
    );
    expect(post.status).toBe(201);
    expect(await post.text()).toBe("saved");

    const get = await router.handle(
      new Request("https://example.com/form/_ruwuter/submit"),
      {} as Env,
      ctx,
    );
    expect(get.status).toBe(405);
    expect(get.headers.get("Allow")).toBe("OPTIONS, POST");
  });

  it("continues to later matching routes when a route lacks the requested fragment", async () => {
    const router = Router([
      [
        new URLPattern({ pathname: "/items/:id" }),
        [{ id: "dynamic", mod: { default: () => "dynamic page" } }],
      ],
      [
        new URLPattern({ pathname: "/items/special" }),
        [{
          id: "static",
          mod: { fragments: { details: fragment(() => "static fragment") } },
        }],
      ],
    ]);
    const { ctx } = makeCtx();
    const response = await router.handle(
      new Request("https://example.com/items/special/_ruwuter/details"),
      {} as Env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("static fragment");
  });

  it("rethrows fragment endpoint errors to the caller", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/items/:id" }),
      [{
        id: "item",
        mod: {
          fragments: {
            details: fragment(() => {
              throw new Error("fragment failed");
            }),
          },
        },
      }],
    ]]);
    const { ctx } = makeCtx();

    let caught: unknown;
    try {
      await router.handle(
        new Request("https://example.com/items/42/_ruwuter/details"),
        {} as Env,
        ctx,
      );
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof Error).toBe(true);
    expect((caught as Error).message).toBe("fragment failed");
  });

  it("returns a bodyless 404 for fragment misses", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/items/:id" }),
      [{ id: "item", mod: { default: () => "item" } }],
    ]]);
    const { ctx } = makeCtx();

    const matchedRoute = await router.handle(
      new Request("https://example.com/items/42/_ruwuter/unknown"),
      {} as Env,
      ctx,
    );
    expect(matchedRoute.status).toBe(404);
    expect(matchedRoute.body).toBe(null);

    const unmatchedRoute = await router.handle(
      new Request("https://example.com/elsewhere/_ruwuter/unknown"),
      {} as Env,
      ctx,
    );
    expect(unmatchedRoute.status).toBe(404);
    expect(unmatchedRoute.body).toBe(null);
  });

  it("cannot change a streaming response after it is committed", async () => {
    const router = Router([[
      new URLPattern({ pathname: "/late-error" }),
      [
        { id: "layout", mod: { default: ({ children }) => children } },
        {
          id: "page",
          mod: {
            default: () => {
              throw new Error("late component failure");
            },
          },
        },
      ],
    ]]);
    const { ctx } = makeCtx();
    const response = await router.handle(
      new Request("https://example.com/late-error"),
      {} as Env,
      ctx,
    );

    expect(response.status).toBe(200);
    let streamFailed = false;
    try {
      await response.text();
    } catch {
      streamFailed = true;
    }
    expect(streamFailed).toBe(true);
  });
});
