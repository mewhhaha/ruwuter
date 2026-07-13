import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { createContext } from "../src/components/context.ts";
import { type Env, type fragment, type JSX as RuwuterJSX, Router } from "../src/router.ts";
import { into } from "../src/runtime/jsx-runtime.ts";

type LayoutProps = { children?: RuwuterJSX.HtmlNode };

describe("context providers", () => {
  it("exposes values from nested providers to descendants", async () => {
    const LocationContext = createContext("nowhere");
    const LocaleContext = createContext("xx-XX");

    const Leaf = () => {
      const location = LocationContext.use();
      const locale = LocaleContext.use();
      return <div id="values">{`${location}:${locale}`}</div>;
    };

    const fragments: fragment[] = [
      {
        id: "root",
        mod: {
          default: () => (
            <LocationContext.Provider value="moon">
              <LocaleContext.Provider value="en-US">
                <html>
                  <body>
                    <Leaf />
                  </body>
                </html>
              </LocaleContext.Provider>
            </LocationContext.Provider>
          ),
        },
      },
    ];

    const router = Router([[new URLPattern({ pathname: "/" }), fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/"),
      {} as Env,
      ctx,
    );
    const html = await res.text();

    expect(html).toContain("moon:en-US");
    expect(html).not.toContain("nowhere:xx-XX");
  });

  it("lets layout fragment providers wrap the leaf component", async () => {
    const ThemeContext = createContext("plain");

    const fragments: fragment[] = [
      {
        id: "layout",
        mod: {
          default: ({ children }: LayoutProps) => (
            <ThemeContext.Provider value="spicy">
              <html>
                <body>{children}</body>
              </html>
            </ThemeContext.Provider>
          ),
        },
      },
      {
        id: "leaf",
        mod: {
          default: () => <div id="theme">{ThemeContext.use()}</div>,
        },
      },
    ];

    const router = Router([[new URLPattern({ pathname: "/layout" }), fragments]]);
    const { ctx } = makeCtx();
    const res = await router.handle(
      new Request("https://example.com/layout"),
      {} as Env,
      ctx,
    );
    const html = await res.text();

    expect(html).toContain('<div id="theme">spicy</div>');
    expect(html).not.toContain("plain");
  });

  it("keeps context isolated while response streams overlap", async () => {
    const RequestNameContext = createContext("missing");
    const bothChildrenStarted = Promise.withResolvers<void>();
    const continueRendering = Promise.withResolvers<void>();
    let startedChildren = 0;

    const fragments: fragment[] = [
      {
        id: "page",
        mod: {
          loader: ({ params }) => params.requestName,
          default: ({ loaderData: requestName }) => (
            <RequestNameContext.Provider value={String(requestName)}>
              {into(async () => {
                startedChildren++;
                if (startedChildren === 2) {
                  bothChildrenStarted.resolve();
                }
                await continueRendering.promise;
                return <span>{RequestNameContext.use()}</span>;
              })}
            </RequestNameContext.Provider>
          ),
        },
      },
    ];
    const router = Router([[new URLPattern({ pathname: "/:requestName" }), fragments]]);
    const firstContext = makeCtx().ctx;
    const secondContext = makeCtx().ctx;
    const [firstResponse, secondResponse] = await Promise.all([
      router.handle(new Request("https://example.com/first"), {} as Env, firstContext),
      router.handle(new Request("https://example.com/second"), {} as Env, secondContext),
    ]);

    const firstHtmlPromise = firstResponse.text();
    const secondHtmlPromise = secondResponse.text();
    try {
      await Promise.race([
        bothChildrenStarted.promise,
        firstHtmlPromise.then(() => {
          throw new Error("First response stream ended before both children started");
        }),
        secondHtmlPromise.then(() => {
          throw new Error("Second response stream ended before both children started");
        }),
      ]);
    } finally {
      continueRendering.resolve();
    }

    const [firstHtml, secondHtml] = await Promise.all([firstHtmlPromise, secondHtmlPromise]);
    expect(firstHtml).toContain("<span>first</span>");
    expect(firstHtml).not.toContain("<span>second</span>");
    expect(secondHtml).toContain("<span>second</span>");
    expect(secondHtml).not.toContain("<span>first</span>");
  });
});
