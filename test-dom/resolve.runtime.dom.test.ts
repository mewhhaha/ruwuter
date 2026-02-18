// deno-lint-ignore-file no-explicit-any
import { describe, expect, it } from "../test-support/deno_vitest_shim.ts";
import "./setup.ts";
import { DOMParser } from "@b-fuze/deno-dom";
import { nextResolveRuntimeUrl } from "../test-support/client-runtime.inline.ts";

function setupDomEnvironment(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    "<!doctype html><html><head></head><body></body></html>",
    "text/html",
  )!;

  class TestMutationObserver {
    constructor(_cb: (mutations: MutationRecord[]) => void) {}
    observe() {}
    disconnect() {}
  }

  const window: any = {
    document: doc,
    Event,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    MutationObserver: TestMutationObserver,
    console,
  };
  window.location = new URL("https://example.com/");
  window.window = window;

  const saved = {
    window: (globalThis as any).window,
    document: (globalThis as any).document,
    Node: (globalThis as any).Node,
    Element: (globalThis as any).Element,
    HTMLTemplateElement: (globalThis as any).HTMLTemplateElement,
    MutationObserver: (globalThis as any).MutationObserver,
  };

  (globalThis as any).window = window;
  (globalThis as any).document = doc;
  (globalThis as any).Node = (doc.createElement("div") as any).constructor;
  (globalThis as any).Element = (doc.createElement("div") as any).constructor;
  (globalThis as any).HTMLTemplateElement = (doc.createElement("template") as any).constructor;
  (globalThis as any).MutationObserver = TestMutationObserver;

  doc.body.innerHTML = html.replace(/^<!doctype html>/i, "");

  return {
    doc,
    cleanup() {
      (globalThis as any).window = saved.window;
      if (typeof saved.document === "undefined") delete (globalThis as any).document;
      else (globalThis as any).document = saved.document;
      if (typeof saved.Node === "undefined") delete (globalThis as any).Node;
      else (globalThis as any).Node = saved.Node;
      if (typeof saved.Element === "undefined") delete (globalThis as any).Element;
      else (globalThis as any).Element = saved.Element;
      if (typeof saved.HTMLTemplateElement === "undefined") {
        delete (globalThis as any).HTMLTemplateElement;
      } else (globalThis as any).HTMLTemplateElement = saved.HTMLTemplateElement;
      if (typeof saved.MutationObserver === "undefined") {
        delete (globalThis as any).MutationObserver;
      } else (globalThis as any).MutationObserver = saved.MutationObserver;
    },
  };
}

describe("Resolve runtime DOM behaviour", () => {
  it("moves template content without cloning script nodes", async () => {
    const { doc, cleanup } = setupDomEnvironment(`
      <div id="suspense-a">loading</div>
      <template data-rw-target="suspense-a">
        <div id="ready">ready</div>
        <script type="application/json" data-hydrate="h_1">{"x":1}</script>
      </template>
    `);

    const templateEl = doc.createElement("template") as unknown as HTMLTemplateElement;
    const fragmentProto = Object.getPrototypeOf(templateEl.content) as {
      cloneNode: (deep?: boolean) => Node;
    };
    const originalCloneNode = fragmentProto.cloneNode;
    fragmentProto.cloneNode = () => {
      throw new Error("cloneNode should not be used in resolve runtime");
    };

    try {
      await import(nextResolveRuntimeUrl());
      expect(doc.getElementById("ready")?.textContent).toContain("ready");
      expect(doc.querySelector("template[data-rw-target]")).toBe(null);
      expect(doc.querySelector('script[data-hydrate="h_1"]')?.textContent).toContain('"x":1');
    } finally {
      fragmentProto.cloneNode = originalCloneNode;
      cleanup();
    }
  });
});
