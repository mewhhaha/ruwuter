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

  it("uses the static path lookup without executing its URLPattern", async () => {
    const pattern = new URLPattern({ pathname: "/static" });
    Object.defineProperty(pattern, "exec", {
      value: () => {
        throw new Error("static route should not execute its pattern");
      },
    });
    const router = Router([[
      pattern,
      [{ id: "static", mod: { loader: () => ({ ok: true }) } }],
    ]]);
    const { ctx } = makeCtx();
    const response = await router.handle(new Request("https://example.com/static"), {} as Env, ctx);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("preserves first-match order before the static fast path", async () => {
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

  it("preserves the first duplicate static route", async () => {
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

  it("keeps case-insensitive literal URLPatterns on the pattern matcher", async () => {
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

  it("lets onNotFound and onError render application responses with request context", async () => {
    let errorParams: Record<string, string> | undefined;
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
    ]], {
      onNotFound: ({ params }) => new Response(`missing:${Object.keys(params).length}`),
      onError: (_error, { params }) => {
        errorParams = params;
        return new Response("handled", { status: 520 });
      },
    });
    const { ctx } = makeCtx();

    const missing = await router.handle(new Request("https://example.com/missing"), {} as Env, ctx);
    expect(await missing.text()).toBe("missing:0");

    const failed = await router.handle(new Request("https://example.com/items/42"), {} as Env, ctx);
    expect(failed.status).toBe(520);
    expect(await failed.text()).toBe("handled");
    expect(errorParams).toEqual({ id: "42" });
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

  it("passes fragment params to onError", async () => {
    let params: Record<string, string> | undefined;
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
    ]], {
      onError: (_error, context) => {
        params = context.params;
        return new Response("handled", { status: 520 });
      },
    });
    const { ctx } = makeCtx();
    const response = await router.handle(
      new Request("https://example.com/items/42/_ruwuter/details"),
      {} as Env,
      ctx,
    );

    expect(response.status).toBe(520);
    expect(params).toEqual({ id: "42" });
  });

  it("routes fragment misses through onNotFound with available params", async () => {
    const seen: Record<string, string>[] = [];
    const router = Router([[
      new URLPattern({ pathname: "/items/:id" }),
      [{ id: "item", mod: { default: () => "item" } }],
    ]], {
      onNotFound: ({ params }) => {
        seen.push(params);
        return new Response("fragment missing", { status: 404 });
      },
    });
    const { ctx } = makeCtx();

    await router.handle(
      new Request("https://example.com/items/42/_ruwuter/unknown"),
      {} as Env,
      ctx,
    );
    await router.handle(
      new Request("https://example.com/elsewhere/_ruwuter/unknown"),
      {} as Env,
      ctx,
    );

    expect(seen).toEqual([{ id: "42" }, {}]);
  });

  it("cannot invoke onError after a streaming response is committed", async () => {
    let handled = false;
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
    ]], {
      onError: () => {
        handled = true;
        return new Response("too late", { status: 500 });
      },
    });
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
    expect(handled).toBe(false);
  });
});
