import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { createContext } from "../src/components/context.ts";
import { type Env, type fragment, type JSX as RuwuterJSX, Router } from "../src/router.ts";

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

    expect(html).toContain('<div id="theme" >spicy</div>');
    expect(html).not.toContain("plain");
  });
});
