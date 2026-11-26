import { describe, expect, it } from "vitest";
import { jsx } from "../src/runtime/jsx-runtime.ts";
import { into } from "../src/runtime/node.ts";
import { makeCtx } from "../test-support/ctx.ts";
import { type Env, type fragment, type JSX, Router } from "../src/legacy.ts";
import { Suspense, SuspenseProvider } from "../src/components/suspense.ts";

const render = (node: { toPromise: () => Promise<string> }) => node.toPromise();

const spread = (json: string): Record<string, unknown> => JSON.parse(json);

const decoder = new TextDecoder();

/**
 * Streams a route through the real Router and returns the bytes that actually
 * reached the client, plus whether the stream failed. Attribute validation must
 * hold on this path too: it renders lazily, after headers and earlier markup
 * have already been flushed.
 */
const streamRoute = async (
  component: () => JSX.Element,
): Promise<{ body: string; failed: boolean }> => {
  const fragments: fragment[] = [{ id: "root", mod: { default: component } }];
  const router = Router([[new URLPattern({ pathname: "/" }), fragments]]);
  const { ctx } = makeCtx();
  const res = await router.handle(new Request("https://example.com/"), {} as Env, ctx);

  const reader = res.body!.getReader();
  let body = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return { body, failed: false };
      body += decoder.decode(value, { stream: true });
    }
  } catch {
    return { body, failed: true };
  }
};

describe("JSX attribute names", () => {
  it("rejects attribute names that would break out of the attribute", async () => {
    const hostile = spread('{"x\\" onmouseover=\\"alert(1)": "y"}');

    let error: unknown;
    try {
      await render(jsx("div", hostile as never));
    } catch (caught) {
      error = caught;
    }

    expect(error instanceof TypeError).toBe(true);
    expect((error as Error | undefined)?.message).toContain("Invalid attribute name");
    expect((error as Error | undefined)?.message).toContain('x" onmouseover="alert(1)');
  });

  it("rejects hostile attribute names in the boolean-presence branch", () => {
    let error: unknown;
    try {
      jsx("div", spread('{"x><script>alert(1)</script": true}') as never);
    } catch (caught) {
      error = caught;
    }

    expect(error instanceof TypeError).toBe(true);
    expect((error as Error | undefined)?.message).toContain("Invalid attribute name");
  });

  it("rejects attribute names containing whitespace, quotes, equals, or angle brackets", () => {
    for (const key of ["a b", 'a"b', "a=b", "a<b", "a>b", "a'b", "", "1abc", "-abc"]) {
      let error: unknown;
      try {
        jsx("div", spread(JSON.stringify({ [key]: "v" })) as never);
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof TypeError).toBe(true);
    }
  });

  it("still allows legitimate HTML and SVG attribute names", async () => {
    const html = await render(
      jsx("svg", {
        "data-state": "open",
        "aria-hidden": "true",
        "accept-charset": "utf-8",
        "stroke-width": "2",
        viewBox: "0 0 10 10",
        xmlns: "http://www.w3.org/2000/svg",
        "xmlns:xlink": "http://www.w3.org/1999/xlink",
        "_private.key": "v",
        hidden: true,
      } as never),
    );

    expect(html).toContain('data-state="open"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('accept-charset="utf-8"');
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('viewBox="0 0 10 10"');
    expect(html).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(html).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(html).toContain('_private.key="v"');
    expect(html).toContain('hidden=""');
  });

  it("keeps rejecting inline event attributes regardless of casing", () => {
    for (const key of ["onclick", "onClick", "ONCLICK", "OnMouseOver"]) {
      let error: unknown;
      try {
        jsx("button", { [key]: "alert(1)", children: "x" } as never);
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof TypeError).toBe(true);
      expect((error as Error | undefined)?.message).toContain("Inline event attributes");
    }
  });

  it("does not treat a lone 'o' attribute as an inline event", async () => {
    const html = await render(jsx("div", { o: "1" } as never));
    expect(html).toBe('<div o="1"></div>');
  });
});

describe("JSX tag names", () => {
  it("rejects a tag name that would break out of the opening tag", async () => {
    const tag = 'div id="a"><script>alert(1)</script';

    let error: unknown;
    let html: string | undefined;
    try {
      html = await render(jsx(tag, { children: "hi" } as never));
    } catch (caught) {
      error = caught;
    }

    expect(html).toBe(undefined);
    expect(error instanceof TypeError).toBe(true);
    expect((error as Error | undefined)?.message).toContain("Invalid tag name");
    expect((error as Error | undefined)?.message).toContain(tag);
  });

  it("rejects tag names containing whitespace, quotes, slashes, equals, or angle brackets", () => {
    for (const tag of [
      "div ",
      " div",
      "div onclick=x",
      'div a="b"',
      "div/",
      "/div",
      "div<span",
      "div>",
      "di v",
      "div\nid=x",
      "div\tid=x",
      "d'iv",
      "1div",
      "-div",
      "div!",
    ]) {
      let error: unknown;
      try {
        jsx(tag, { children: "x" } as never);
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof TypeError).toBe(true);
      expect((error as Error | undefined)?.message).toContain("Invalid tag name");
    }
  });

  it("rejects a hostile tag before any markup is emitted, even for void elements", () => {
    // `img` is a void element, so only the opening tag is written — the check
    // must still run for that path.
    let error: unknown;
    try {
      jsx('img src="x" onerror="alert(1)"', {} as never);
    } catch (caught) {
      error = caught;
    }
    expect(error instanceof TypeError).toBe(true);
    expect((error as Error | undefined)?.message).toContain("Invalid tag name");
  });

  it("still allows legitimate HTML, SVG and custom-element tag names", async () => {
    expect(await render(jsx("div", { children: "hi" } as never))).toBe("<div>hi</div>");
    expect(await render(jsx("h1", { children: "hi" } as never))).toBe("<h1>hi</h1>");
    expect(await render(jsx("br", {} as never))).toBe("<br>");
    expect(await render(jsx("feTurbulence", { type: "fractalNoise" } as never))).toBe(
      '<feTurbulence type="fractalNoise"></feTurbulence>',
    );
    expect(await render(jsx("feDisplacementMap", { scale: 5 } as never))).toBe(
      '<feDisplacementMap scale="5"></feDisplacementMap>',
    );
    expect(await render(jsx("my-element", { children: "hi" } as never))).toBe(
      "<my-element>hi</my-element>",
    );
  });

  it("keeps the empty-tag path rendering children without a wrapper", async () => {
    expect(await render(jsx("", { children: ["a", "b"] } as never))).toBe("ab");
    expect(await render(jsx("", {} as never))).toBe("");
  });

  it("never writes a hostile tag into a streamed route body", async () => {
    const Evil = () => jsx('div id="a"><script>alert(1)</script', { children: "hi" } as never);

    const { body, failed } = await streamRoute(() =>
      jsx("html", {
        children: jsx("body", { children: [jsx("p", { children: "before" }), Evil] }),
      }),
    );

    expect(failed).toBe(true);
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("alert(1)");
  });
});

describe("JSX attribute names over a streamed response", () => {
  const hostile = spread('{"x\\" onmouseover=\\"alert(1)": "y"}');

  it("never writes a hostile spread key into a streamed route body", async () => {
    const Evil = () => jsx("div", { ...hostile, children: "hi" } as never);

    const { body, failed } = await streamRoute(() =>
      jsx("html", {
        children: jsx("body", { children: [jsx("p", { children: "before" }), Evil] }),
      }),
    );

    expect(failed).toBe(true);
    expect(body).not.toContain("onmouseover");
    expect(body).not.toContain("alert(1)");
  });

  it("contains the failure inside a Suspense boundary without emitting the attribute", async () => {
    const { body, failed } = await streamRoute(() =>
      jsx(SuspenseProvider, {
        children: jsx("html", {
          children: jsx("body", {
            children: jsx(Suspense, {
              fallback: jsx("div", { children: "loading" }),
              children: () =>
                Promise.resolve(jsx("div", { ...hostile, children: "late" } as never)),
            }),
          }),
        }),
      }),
    );

    // The boundary swallows the error, so the response completes normally and
    // the fallback stays put — but the hostile attribute must never appear.
    expect(failed).toBe(false);
    expect(body).toContain("loading");
    expect(body).not.toContain("onmouseover");
    expect(body).not.toContain("alert(1)");
    expect(body).not.toContain("late");
  });
});

describe("JSX boolean children", () => {
  it("renders nothing for true and false", async () => {
    const html = await render(jsx("p", { children: [true, "a", false, "b"] } as never));
    expect(html).toBe("<p>ab</p>");
  });

  it("renders nothing for a boolean produced during streaming", async () => {
    const html = await into(Promise.resolve(true)).toPromise();
    expect(html).toBe("");
  });

  it("renders nothing for booleans nested in async children", async () => {
    const html = await render(
      jsx("div", { children: [Promise.resolve(true), "x", Promise.resolve(false)] } as never),
    );
    expect(html).toBe("<div>x</div>");
  });
});
