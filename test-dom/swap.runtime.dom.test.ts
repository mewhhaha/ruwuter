// deno-lint-ignore-file no-explicit-any
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import { swap, type SwapInput } from "../src/runtime/swap.ts";

class FakeElement {
  innerHTML = "";
  outerHTML = "";
  removed = false;
  insertions: Array<{ position: InsertPosition; html: string }> = [];

  remove() {
    this.removed = true;
  }

  insertAdjacentHTML(position: InsertPosition, html: string) {
    this.insertions.push({ position, html });
  }
}

const asElement = (element: FakeElement): Element => element as unknown as Element;

function setupDom() {
  const saved = {
    document: (globalThis as any).document,
    Element: (globalThis as any).Element,
    window: (globalThis as any).window,
  };
  const window: any = {};

  (globalThis as any).Element = FakeElement;
  (globalThis as any).document = {};
  (globalThis as any).window = window;

  return {
    window,
    cleanup() {
      if (typeof saved.document === "undefined") delete (globalThis as any).document;
      else (globalThis as any).document = saved.document;
      if (typeof saved.Element === "undefined") delete (globalThis as any).Element;
      else (globalThis as any).Element = saved.Element;
      if (typeof saved.window === "undefined") delete (globalThis as any).window;
      else (globalThis as any).window = saved.window;
    },
  };
}

describe("swap runtime DOM behaviour", () => {
  it("applies ok HTML responses without installing a global helper", async () => {
    const { window, cleanup } = setupDom();
    try {
      const target = new FakeElement();
      const response = new Response("<strong>ok</strong>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });

      const result = await swap(response, { target: asElement(target) });

      expect(target.innerHTML).toBe("<strong>ok</strong>");
      expect(result.response).toBe(response);
      expect("swap" in window).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("rejects non-ok and non-HTML responses before mutating the DOM", async () => {
    const { cleanup } = setupDom();
    try {
      const badStatusTarget = new FakeElement();
      let badStatusError: unknown;
      try {
        await swap(
          new Response("nope", {
            status: 500,
            headers: { "Content-Type": "text/html" },
          }),
          { target: asElement(badStatusTarget) },
        );
      } catch (error) {
        badStatusError = error;
      }

      expect(badStatusError instanceof Error).toBe(true);
      expect((badStatusError as Error).message).toContain("status 500");
      expect(badStatusTarget.innerHTML).toBe("");

      const jsonTarget = new FakeElement();
      let contentTypeError: unknown;
      try {
        await swap(
          new Response("{}", {
            headers: { "Content-Type": "application/json" },
          }),
          { target: asElement(jsonTarget) },
        );
      } catch (error) {
        contentTypeError = error;
      }

      expect(contentTypeError instanceof Error).toBe(true);
      expect((contentTypeError as Error).message).toContain("content type");
      expect(jsonTarget.innerHTML).toBe("");
    } finally {
      cleanup();
    }
  });

  it("requires raw strings to use the unsafeHTML option", async () => {
    const { cleanup } = setupDom();
    try {
      const target = new FakeElement();
      let ambiguousStringError: unknown;
      try {
        await swap("<em>raw</em>" as unknown as SwapInput, { target: asElement(target) });
      } catch (error) {
        ambiguousStringError = error;
      }

      expect(ambiguousStringError instanceof TypeError).toBe(true);
      expect((ambiguousStringError as Error).message).toContain("ambiguous");
      expect(target.innerHTML).toBe("");

      await swap(null, { target: asElement(target), unsafeHTML: "<em>raw</em>" });
      expect(target.innerHTML).toBe("<em>raw</em>");
    } finally {
      cleanup();
    }
  });

  it("uses caller-provided sanitizers and Trusted Types policies", async () => {
    const { cleanup } = setupDom();
    try {
      const target = new FakeElement();
      const policy = {
        createHTML(value: string) {
          return `trusted:${value}` as never;
        },
      };

      await swap(null, {
        target: asElement(target),
        unsafeHTML: "<script>x</script><p>ok</p>",
        sanitizer: (html) => html.replace("<script>x</script>", ""),
        trustedTypesPolicy: policy,
      });

      expect(target.innerHTML).toBe("trusted:<p>ok</p>");
    } finally {
      cleanup();
    }
  });
});
