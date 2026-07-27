import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { createContext } from "../src/components/context.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import { into } from "../src/runtime/jsx-runtime.ts";
import { Suspense, SuspenseProvider } from "../src/components/suspense.ts";
import type * as suspenseModule from "../src/components/suspense.ts";

const render = async (element: () => unknown): Promise<string> => {
  const fragments: fragment[] = [{ id: "root", mod: { default: element as () => never } }];
  const router = Router([[new URLPattern({ pathname: "/" }), fragments]]);
  const { ctx } = makeCtx();
  const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
  return await new Response(res.body).text();
};

describe("context inside Suspense boundaries", () => {
  it("keeps the provider value visible to a suspended child", async () => {
    const Theme = createContext("DEFAULT");
    const Deep = () => <span>{Theme.use()}</span>;

    const html = await render(() => (
      <SuspenseProvider>
        <html>
          <body>
            <Theme.Provider value="dark">
              <Suspense fallback={<em>loading</em>}>{into(() => Deep())}</Suspense>
            </Theme.Provider>
          </body>
        </html>
      </SuspenseProvider>
    ));

    expect(html).toContain("<span>dark</span>");
    expect(html).not.toContain("<span>DEFAULT</span>");
  });

  it("keeps the provider value visible to an async suspended child", async () => {
    const Theme = createContext("DEFAULT");

    const html = await render(() => (
      <SuspenseProvider>
        <html>
          <body>
            <Theme.Provider value="dark">
              <Suspense fallback={<em>loading</em>}>
                {async () => {
                  await new Promise((resolve) => setTimeout(resolve, 5));
                  return <span>{Theme.use()}</span>;
                }}
              </Suspense>
            </Theme.Provider>
          </body>
        </html>
      </SuspenseProvider>
    ));

    expect(html).toContain("<span>dark</span>");
    expect(html).not.toContain("<span>DEFAULT</span>");
  });

  it("does not leak a sibling branch's value into an overlapping boundary", async () => {
    const Color = createContext("DEFAULT");
    const blueStarted = Promise.withResolvers<void>();
    const redSettled = Promise.withResolvers<void>();

    const html = await render(() => (
      <SuspenseProvider>
        <html>
          <body>
            <Color.Provider value="RED">
              <Suspense fallback={<em>red-loading</em>}>
                {async () => {
                  // Wait until the BLUE branch is mid-render, so the RED
                  // boundary settles while BLUE is still streaming.
                  await blueStarted.promise;
                  const value = Color.use();
                  redSettled.resolve();
                  return <span id="red">{value}</span>;
                }}
              </Suspense>
            </Color.Provider>
            <Color.Provider value="BLUE">
              <Suspense fallback={<em>blue-loading</em>}>
                {async () => {
                  blueStarted.resolve();
                  await redSettled.promise;
                  return <span id="blue">{Color.use()}</span>;
                }}
              </Suspense>
            </Color.Provider>
          </body>
        </html>
      </SuspenseProvider>
    ));

    expect(html).toContain('<span id="red">RED</span>');
    expect(html).toContain('<span id="blue">BLUE</span>');
  });

  it("resolves the innermost provider for nested providers", async () => {
    const Theme = createContext("DEFAULT");
    const Show = ({ id }: { id: string }) => <span id={id}>{Theme.use()}</span>;

    const html = await render(() => (
      <html>
        <body>
          <Theme.Provider value="outer">
            <Show id="a" />
            <Theme.Provider value="inner">
              <Show id="b" />
            </Theme.Provider>
            <Show id="c" />
          </Theme.Provider>
          <Show id="d" />
        </body>
      </html>
    ));

    expect(html).toContain('<span id="a">outer</span>');
    expect(html).toContain('<span id="b">inner</span>');
    expect(html).toContain('<span id="c">outer</span>');
    expect(html).toContain('<span id="d">DEFAULT</span>');
  });

  it("isolates sibling providers across an await boundary", async () => {
    const Name = createContext("DEFAULT");
    const Show = ({ id }: { id: string }) =>
      into(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return <span id={id}>{Name.use()}</span>;
      });

    const html = await render(() => (
      <html>
        <body>
          <Name.Provider value="one">
            <Show id="first" />
          </Name.Provider>
          <Name.Provider value="two">
            <Show id="second" />
          </Name.Provider>
          <Show id="third" />
        </body>
      </html>
    ));

    expect(html).toContain('<span id="first">one</span>');
    expect(html).toContain('<span id="second">two</span>');
    expect(html).toContain('<span id="third">DEFAULT</span>');
  });

  it("keeps the provider value visible to the boundary's errorFallback", async () => {
    const Theme = createContext("DEFAULT");

    const html = await render(() => (
      <SuspenseProvider>
        <html>
          <body>
            <Theme.Provider value="dark">
              <Suspense
                fallback={<em>loading</em>}
                errorFallback={() => <span id="ef">{Theme.use()}</span>}
              >
                {async () => {
                  await Promise.resolve();
                  throw new Error("boom");
                }}
              </Suspense>
            </Theme.Provider>
          </body>
        </html>
      </SuspenseProvider>
    ));

    expect(html).toContain('<span id="ef">dark</span>');
    expect(html).not.toContain('<span id="ef">DEFAULT</span>');
  });

  it("scopes an async withValue callback to its own branch", async () => {
    const Theme = createContext("DEFAULT");
    // The scoped callback is parked mid-await while a sibling branch reads the
    // context. A shared, mutated store would hand the sibling "scoped".
    const scopedParked = Promise.withResolvers<void>();
    const siblingRead = Promise.withResolvers<void>();

    const html = await render(() => {
      const scoped = Theme.withValue("scoped", async () => {
        scopedParked.resolve();
        await siblingRead.promise;
        return <span id="scoped">{Theme.use()}</span>;
      });

      const sibling = (async () => {
        await scopedParked.promise;
        const value = Theme.use();
        siblingRead.resolve();
        return <span id="sibling">{value}</span>;
      })();

      return (
        <html>
          <body>
            {into(scoped)}
            {into(sibling)}
          </body>
        </html>
      );
    });

    expect(html).toContain('<span id="scoped">scoped</span>');
    expect(html).toContain('<span id="sibling">DEFAULT</span>');
  });
});

const boundaryTargets = (html: string): string[] =>
  [...html.matchAll(/data-rw-target="([^"]+)"/g)].map((match) => match[1]);

describe("SuspenseProvider boundary ids", () => {
  it("emits provider-unique boundary ids", async () => {
    const html = await render(() => (
      <SuspenseProvider>
        <html>
          <body>
            <Suspense fallback={<em>outer</em>}>
              {async () => {
                await Promise.resolve();
                return (
                  <SuspenseProvider>
                    <Suspense fallback={<em>inner</em>}>
                      {async () => {
                        await Promise.resolve();
                        return <span>INNER</span>;
                      }}
                    </Suspense>
                  </SuspenseProvider>
                );
              }}
            </Suspense>
          </body>
        </html>
      </SuspenseProvider>
    ));

    const targets = boundaryTargets(html);
    expect(targets.length).toBe(2);
    for (const target of targets) {
      // `rw-<registry uuid>-<per-boundary counter>`: a fixed shape that does
      // not depend on how many boundaries earlier tests rendered.
      expect(target).toMatch(
        /^rw-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+$/,
      );
    }
    expect(targets[0] === targets[1]).toBe(false);
  });

  it("does not reuse ids across independently rendered responses", async () => {
    // A fragment endpoint answered by a cold isolate starts from fresh module
    // state, and its HTML is swapped into a live document rendered by another
    // cold isolate. Both registries are therefore the first of their isolate,
    // so nothing but the registry's own randomness keeps their ids apart.
    // Fresh module instances stand in for the two isolates.
    const [pageIsolate, fragmentIsolate] = await Promise.all([
      import("../src/components/suspense.ts?isolate=page") as Promise<typeof suspenseModule>,
      import("../src/components/suspense.ts?isolate=fragment") as Promise<typeof suspenseModule>,
    ]);

    const renderPage = (mod: typeof suspenseModule): Promise<string> => {
      const { Suspense: Boundary, SuspenseProvider: Provider } = mod;
      return render(() => (
        <Provider>
          <html>
            <body>
              <Boundary fallback={<em>a</em>}>
                {async () => {
                  await Promise.resolve();
                  return <span>A</span>;
                }}
              </Boundary>
              <Boundary fallback={<em>b</em>}>
                {async () => {
                  await Promise.resolve();
                  return <span>B</span>;
                }}
              </Boundary>
            </body>
          </html>
        </Provider>
      ));
    };

    const page = boundaryTargets(await renderPage(pageIsolate));
    const fragment = boundaryTargets(await renderPage(fragmentIsolate));

    expect(page.length).toBe(2);
    expect(fragment.length).toBe(2);
    expect(page.filter((id) => fragment.includes(id))).toEqual([]);
  });
});
