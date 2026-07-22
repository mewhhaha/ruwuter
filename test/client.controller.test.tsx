import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import {
  controller,
  type ControllerHref,
  move,
  type MovedHandler,
} from "../src/components/client.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { type Env, type fragment, Router } from "../src/router.ts";
import type { JSX } from "../src/runtime/jsx.ts";

describe("controller activation attributes", () => {
  it("renders explicit controller roots without adjacent metadata scripts", async () => {
    const href = "/controllers/palette.js";
    const palette = controller(href, { initiallyOpen: false });

    const router = Router([[
      new URLPattern({ pathname: "/" }),
      [
        {
          id: "root",
          mod: {
            default: () => (
              <html>
                <body>
                  <section {...palette.root()}>
                    <button type="button" ref={palette.refs.open}>Open</button>
                  </section>
                </body>
              </html>
            ),
          },
        } satisfies fragment,
      ],
    ]]);

    const { ctx } = makeCtx();
    const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await res.text();

    expect(html).toContain(`data-rw-controller="${href}"`);
    expect(html).toContain("data-rw-props=");
    expect(html).toContain("&quot;initiallyOpen&quot;:false");
    expect(html).toContain('data-rw-ref="open"');
    expect(html).not.toContain("data-hydrate");
    expect(html).not.toContain("data-rw-ref-text");
  });

  it("preserves types from branded controller URL imports", () => {
    type PaletteController = {
      props: { value: number };
      refs: { open: HTMLButtonElement };
    };

    // @ts-expect-error plain strings must not satisfy typed controller URLs.
    const invalidHref: ControllerHref<PaletteController> = "/controllers/palette.js";
    expect(String(invalidHref)).toBe("/controllers/palette.js");

    const href = "/controllers/palette.js" as ControllerHref<PaletteController>;
    const mounted = controller(href, { value: 1 });

    void (() => {
      // @ts-expect-error typed controller props are required when the definition declares props.
      controller(href);
      // @ts-expect-error typed controller props come from the branded URL definition.
      controller(href, { value: "wrong" });
    });

    const props: JSX.IntrinsicElements["button"] = { ref: mounted.refs.open };
    expect(props.ref?.__ruwuterControllerRef).toBe("open");
  });

  it("types controller refs against the JSX element they are attached to", () => {
    type PaletteController = {
      refs: { dialog: HTMLDialogElement };
    };

    const href = "/controllers/palette.js" as ControllerHref<PaletteController>;
    const mounted = controller(href);
    // @ts-expect-error dialog refs cannot be attached to button elements.
    const props: JSX.IntrinsicElements["button"] = { ref: mounted.refs.dialog };

    expect(props.ref?.__ruwuterControllerRef).toBe("dialog");
  });

  it("rejects non-JSON controller props before rendering", () => {
    const rejects = (props: never) => {
      let error: unknown;
      try {
        controller("/controllers/palette.js", props);
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof TypeError).toBe(true);
      expect((error as Error).message).toContain("JSON values");
    };

    rejects(1n as never);
    rejects({ callback() {} } as never);
    rejects({ dropped: undefined } as never);
    rejects({ value: Number.NaN } as never);
    rejects(new Date() as never);
    rejects(new Map() as never);
  });

  it("renders moved event metadata without inline JavaScript", async () => {
    const movedClick = (move as unknown as (
      values: { count: number },
      moduleHref: string,
    ) => MovedHandler<PointerEvent, HTMLButtonElement>)(
      { count: 2 },
      "/assets/counter.js",
    );
    const router = Router([[
      new URLPattern({ pathname: "/" }),
      [{
        id: "root",
        mod: { default: () => <button type="button" on:click={movedClick}>Count</button> },
      }],
    ]]);
    const { ctx } = makeCtx();

    const response = await router.handle(new Request("https://example.com/"), {} as Env, ctx);
    const html = await response.text();

    expect(html).toContain("data-rw-events=");
    expect(html).toContain("/assets/counter.js");
    expect(html).toContain("&quot;count&quot;:2");
    expect(html).not.toContain("on:click");
    expect(html).not.toContain("onclick");
  });

  it("rejects non-JSON moved event values", () => {
    const transformedMove = move as unknown as (values: never, moduleHref: string) => MovedHandler;
    let error: unknown;
    try {
      transformedMove({ callback() {} } as never, "/assets/counter.js");
    } catch (caught) {
      error = caught;
    }

    expect(error instanceof TypeError).toBe(true);
    expect((error as Error).message).toContain("move() values must contain only JSON values");
  });

  it("requires the Vite transform for moved event callbacks", () => {
    let error: unknown;
    try {
      move({}, () => {});
    } catch (caught) {
      error = caught;
    }

    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toContain("clientMacro: true");
  });
});
