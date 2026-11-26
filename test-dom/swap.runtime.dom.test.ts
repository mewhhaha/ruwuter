// deno-lint-ignore-file no-explicit-any
import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import { swap, type SwapInput, type SwapMode } from "../src/runtime/swap.ts";
import { viewTransition } from "../src/runtime/view-transition.ts";

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

  it("rejects write modes that merely embed an insert position", async () => {
    const { cleanup } = setupDom();
    try {
      const target = new FakeElement();
      let modeError: unknown;
      try {
        await swap(null, {
          target: asElement(target),
          unsafeHTML: "<p>ok</p>",
          write: "xbeforebeginy" as SwapMode,
        });
      } catch (error) {
        modeError = error;
      }

      expect(modeError instanceof Error).toBe(true);
      expect((modeError as Error).message).toContain('unsupported swap mode "xbeforebeginy"');
      expect(target.insertions.length).toBe(0);

      await swap(null, {
        target: asElement(target),
        unsafeHTML: "<p>ok</p>",
        write: "beforeend",
      });
      expect(target.insertions).toEqual([{ position: "beforeend", html: "<p>ok</p>" }]);
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

      const result = await swap(null, {
        target: asElement(target),
        unsafeHTML: "<script>x</script><p>ok</p>",
        sanitizer: (html) => html.replace("<script>x</script>", ""),
        trustedTypesPolicy: policy,
      });

      expect(target.innerHTML).toBe("trusted:<p>ok</p>");
      expect(result.text).toBe("trusted:<p>ok</p>");
    } finally {
      cleanup();
    }
  });

  it("only uses startViewTransition when viewTransition: true is explicitly requested", async () => {
    const { cleanup } = setupDom();
    let transitions = 0;
    (globalThis as any).document.startViewTransition = (update: () => void) => {
      transitions += 1;
      update();
      return {
        updateCallbackDone: Promise.resolve(),
        finished: Promise.resolve(),
      };
    };
    try {
      const target = new FakeElement();
      await swap(null, { target: asElement(target), unsafeHTML: "<p>a</p>" });
      expect(transitions).toBe(0);

      await swap(null, { target: asElement(target), unsafeHTML: "<p>b</p>", viewTransition: true });
      expect(transitions).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("strips inert resolver scripts introduced by swapped deferred fragments while preserving existing ones", async () => {
    const saved = {
      document: (globalThis as any).document,
      Element: (globalThis as any).Element,
      CSS: (globalThis as any).CSS,
    };
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><body>
        <script id="host-resolver" src="/_ruwuter/resolve-v1.js" data-rw-resolver=""></script>
        <section id="slot"></section>
      </body></html>`,
      "text/html",
    )! as unknown as Document;
    (globalThis as any).document = doc;
    (globalThis as any).Element = (doc.createElement("div") as any).constructor;
    (globalThis as any).CSS = { escape: (v: string) => v };
    try {
      const fragmentHtml =
        `<div id="rw-frag-0">loading</div>` +
        `<script src="/_ruwuter/resolve-v1.js" data-rw-resolver=""></script>` +
        `<template data-rw-target="rw-frag-0"><p>Ready</p></template><!--rw-end-->`;
      await swap(new Response(fragmentHtml, { headers: { "Content-Type": "text/html" } }), {
        target: "#slot",
        write: "outerHTML",
      });
      expect(doc.body.textContent).toContain("Ready");
      expect(doc.querySelectorAll("script[data-rw-resolver]").length).toBe(1);
      expect(doc.getElementById("host-resolver") != null).toBe(true);
    } finally {
      if (typeof saved.document === "undefined") delete (globalThis as any).document;
      else (globalThis as any).document = saved.document;
      if (typeof saved.Element === "undefined") delete (globalThis as any).Element;
      else (globalThis as any).Element = saved.Element;
      if (typeof saved.CSS === "undefined") delete (globalThis as any).CSS;
      else (globalThis as any).CSS = saved.CSS;
    }
  });

  it("allows 4xx HTML fragments when allowStatus accepts them and supports custom swap functions", async () => {
    const { cleanup } = setupDom();
    try {
      const target = new FakeElement();
      const validationResponse = new Response('<p role="alert">Required</p>', {
        status: 422,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      await swap(validationResponse, {
        target: asElement(target),
        allowStatus: (status) => status < 500,
      });
      expect(target.innerHTML).toBe('<p role="alert">Required</p>');

      let serverError: unknown;
      try {
        await swap(
          new Response("<p>fail</p>", {
            status: 500,
            headers: { "Content-Type": "text/html" },
          }),
          {
            target: asElement(target),
            allowStatus: (status) => status < 500,
          },
        );
      } catch (error) {
        serverError = error;
      }
      expect(serverError instanceof Error).toBe(true);

      const morphed: Array<{ target: Element; html: string }> = [];
      await swap(
        new Response("<p>morphed</p>", {
          headers: { "Content-Type": "text/html" },
        }),
        {
          target: asElement(target),
          write: async (el, markup) => {
            await Promise.resolve();
            morphed.push({ target: el, html: String(markup) });
            el.innerHTML = String(markup);
          },
        },
      );
      expect(morphed.length).toBe(1);
      expect(morphed[0].html).toBe("<p>morphed</p>");
      expect(target.innerHTML).toBe("<p>morphed</p>");
    } finally {
      cleanup();
    }
  });

  it("supports typed View Transitions, resolves on updateCallbackDone, and falls back cleanly", async () => {
    const { cleanup } = setupDom();
    const calls: unknown[] = [];
    let finishResolve!: () => void;
    const finished = new Promise<void>((resolve) => {
      finishResolve = resolve;
    });
    (globalThis as any).document.startViewTransition = (arg: unknown) => {
      calls.push(arg);
      const update = typeof arg === "function" ? arg : (arg as { update: () => void }).update;
      update();
      return {
        updateCallbackDone: Promise.resolve(),
        ready: Promise.resolve(),
        finished,
        skipTransition() {},
      };
    };
    try {
      const target = new FakeElement();
      const result = await swap(null, {
        target: asElement(target),
        unsafeHTML: "<p>typed</p>",
        viewTransition: { types: ["review-add"] },
      });

      // Resolved immediately after updateCallbackDone even though `finished` is still pending.
      expect(target.innerHTML).toBe("<p>typed</p>");
      expect(result.transition != null).toBe(true);
      expect((calls[0] as { types: string[] }).types).toEqual(["review-add"]);
      finishResolve();
      await result.transition?.finished;

      // Falls back to callback-only startViewTransition if dictionary syntax throws TypeError.
      const fallbackCalls: string[] = [];
      (globalThis as any).document.startViewTransition = (arg: unknown) => {
        if (typeof arg !== "function") {
          fallbackCalls.push("dict-rejected");
          throw new TypeError("Function required");
        }
        fallbackCalls.push("callback");
        arg();
        return {
          updateCallbackDone: Promise.resolve(),
          ready: Promise.resolve(),
          finished: Promise.resolve(),
          skipTransition() {},
        };
      };
      let ran = 0;
      const vt = await viewTransition(
        () => {
          ran += 1;
        },
        { types: ["slide"] },
      );
      expect(vt != null).toBe(true);
      expect(ran).toBe(1);
      expect(fallbackCalls).toEqual(["dict-rejected", "callback"]);

      // Skips startViewTransition when document is hidden.
      (globalThis as any).document.visibilityState = "hidden";
      const hiddenVt = await viewTransition(
        () => {
          ran += 1;
        },
        { types: ["slide"] },
      );
      expect(hiddenVt).toBe(null);
      expect(ran).toBe(2);
    } finally {
      cleanup();
    }
  });
});
