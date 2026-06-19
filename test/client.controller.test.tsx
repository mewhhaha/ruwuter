import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { controller, type ControllerHref, defineController } from "../src/components/client.ts";
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

  it("accepts transformed typed controller bindings with clientHref", () => {
    const href = "/controllers/palette.js";
    const paletteController = Object.assign(
      defineController<{
        props: { value: number };
        refs: { open: HTMLButtonElement };
      }>(({ refs, props }) => {
        refs.open.value = String(props.value);
      }),
      { clientHref: href },
    );

    const mounted = controller(paletteController, { value: 1 });
    const attrs = mounted.root();

    expect(attrs["data-rw-controller"]).toBe(href);
    expect(attrs["data-rw-props"] ?? "").toContain('"value":1');
    expect(mounted.refs.open.__ruwuterControllerRef).toBe("open");
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
      // @ts-expect-error typed controller props come from the branded URL definition.
      controller(href, { value: "wrong" });
    });

    const props: JSX.IntrinsicElements["button"] = { ref: mounted.refs.open };
    expect(props.ref?.__ruwuterControllerRef).toBe("open");
  });

  it("types controller refs against the JSX element they are attached to", () => {
    const paletteController = Object.assign(
      defineController<{
        refs: { dialog: HTMLDialogElement };
      }>(() => {}),
      { clientHref: "/controllers/palette.js" },
    );
    const mounted = controller(paletteController);
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
      expect((error as Error).message).toContain("JSON-serializable");
    };

    rejects(1n as never);
    rejects({ callback() {} } as never);
    rejects({ dropped: undefined } as never);
    rejects({ value: Number.NaN } as never);
  });
});
